import type { Room } from './types'
import { ROOM, bandHall, minShort } from './rooms'
import { doorOK, sharedEdge } from './derive'
import { isPrivateRoom, storageOf } from './closets'
import { shortSideViolations, wetViolations } from './validate'
import { mouthRuleOk } from './circulation'

/**
 * 割り付け後の収納化（GEN_VERSION 5）。追加の面積を使わず、階ごとに次の順で収納を作る:
 * 1. 付け替え: 持ち主のない収納（奥行2・2×4 以上・16 以下）を、辺を共有する収納のない個室のクローゼットにする
 * 2. ホール帯の行き止まり: ホール帯の両端を長さ 6→5→4 の順に試し、上下で接する収納のない個室のクローゼットにする
 * 3. 水回りの超過: 最大面積を超えた洗面・浴室・トイレ・ランドリーの、ホールと反対側（外壁側）の2列を収納にする
 * どの段も、切り出した後に全室への到達可能性が保たれるときだけ行う（3 は短辺・最小面積・水回りの隣接も）。
 * 純関数: rooms は書き換えず新しい配列を返す。既存の付属収納（Room.of）はそのまま引き継ぐ
 */
export function carveFloor(rooms0: readonly Room[]): Room[] {
  const memo = activeMemo
  if (!memo) return carveFloorRaw(rooms0)
  const key = JSON.stringify(rooms0)
  let hit = memo.get(key)
  if (!hit) {
    hit = carveFloorRaw(rooms0)
    memo.set(key, hit)
  }
  return hit
}

/** withCarveMemo の呼び出し中だけ有効なメモ（グローバルなキャッシュにはしない。呼び出しが終われば捨てる） */
let activeMemo: Map<string, Room[]> | null = null

/**
 * fn の実行中だけ carveFloor の結果を入力の内容でメモする（プール構築の高速化。結果は不変）。
 * 同期関数専用: 非同期関数を渡すと、fn が Promise を返した時点でメモが捨てられるので、await 以降は効かない。
 * carveFloor は HALL_RULES を読むので、呼び出しをまたいで持ち越さない。入れ子では外側のメモを使う。
 * 返った部屋の配列はメモと共有するので、呼び出し側は書き換えないこと
 */
export function withCarveMemo<T>(fn: () => T): T {
  if (activeMemo) return fn()
  activeMemo = new Map()
  try {
    return fn()
  } finally {
    activeMemo = null
  }
}

function carveFloorRaw(rooms0: readonly Room[]): Room[] {
  let st = start(rooms0)
  st = reassignStores(st)
  st = carveHallEnds(st)
  st = carveWetOvers(st)
  return finish(st)
}

/** 作業状態: 部屋（作業用のコピー）と、付属収納 → 持ち主の対応（of は座標が動いても壊れないよう、部屋の同一性で持つ） */
interface State {
  rooms: Room[]
  owner: Map<Room, Room>
}

function start(rooms0: readonly Room[]): State {
  const rooms = rooms0.map((r) => ({ ...r }))
  const owner = new Map<Room, Room>()
  for (const r of rooms) {
    const of = r.of
    if (!of) continue
    const o = rooms.find((q) => q !== r && q.x === r.x + of.dx && q.y === r.y + of.dy)
    if (o) owner.set(r, o)
  }
  return sync({ rooms, owner })
}

/** owner の対応から of を書き直す（座標が動いた後に呼ぶ）。st を返す */
function sync(st: State): State {
  for (const r of st.rooms) delete r.of
  for (const [s, o] of st.owner) s.of = { dx: o.x - s.x, dy: o.y - s.y }
  return st
}

/** 吸収で太った収納（持ち主がなく、奥行が2を超える store）の表示名（仕様 6.2・11.5。種別は store のまま） */
export const NANDO = '納戸'

function finish(st: State): Room[] {
  sync(st)
  for (const r of st.rooms) {
    if (r.type === 'store' && !r.of && Math.min(r.w, r.h) > 2) r.name = NANDO
  }
  return st.rooms
}

function clone(st: State): State {
  const map = new Map(st.rooms.map((r) => [r, { ...r }]))
  const owner = new Map<Room, Room>()
  for (const [s, o] of st.owner) {
    const ns = map.get(s)
    const no = map.get(o)
    if (ns && no) owner.set(ns, no)
  }
  return { rooms: st.rooms.map((r) => map.get(r) ?? r), owner }
}

/** 全室（吹抜を除く）が、玄関（なければ土間・階段）からドアでたどれるか */
function reachable(rooms: Room[]): boolean {
  // ドアの形状（開き弧）は到達可能性に関係しないので、computeDoors は使わず、辺の共有と doorOK だけで隣接を作る
  const adj = new Map(rooms.map((r) => [r, [] as Room[]]))
  for (const [i, a] of rooms.entries()) {
    for (const b of rooms.slice(i + 1)) {
      if (sharedEdge(a, b) && doorOK(a, b)) {
        adj.get(a)?.push(b)
        adj.get(b)?.push(a)
      }
    }
  }
  const first = rooms.find((r) => r.type === 'entry') ?? rooms.find((r) => r.type === 'doma') ?? rooms.find((r) => r.type === 'stair')
  if (!first) return false
  const seen = new Set([first])
  const stack = [first]
  for (let cur = stack.pop(); cur; cur = stack.pop()) {
    for (const n of adj.get(cur) ?? []) {
      if (!seen.has(n)) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return rooms.every((r) => r.type === 'void' || seen.has(r))
}

/** 個室 p に収納（クローゼット・収納・WIC）が付いているか（現在の状態で） */
const hasStorage = (st: State, p: Room): boolean => storageOf(sync(st).rooms, p) !== undefined

/** 1. 付け替え */
function reassignStores(st0: State): State {
  let st = st0
  for (const s of st0.rooms.filter((r) => r.type === 'store' && !r.of)) {
    if (Math.min(s.w, s.h) !== 2 || Math.max(s.w, s.h) < 4 || s.area > ROOM.closet.maxArea) continue
    const cur = st.rooms.find((r) => r.x === s.x && r.y === s.y && r.type === 'store' && !st.owner.has(r))
    if (!cur) continue
    const owner = st.rooms.find((o) => isPrivateRoom(o) && !hasStorage(st, o) && sharedEdge(o, cur) !== null)
    if (!owner) continue
    const next = clone(st)
    const ns = next.rooms.find((r) => r.x === cur.x && r.y === cur.y)
    const no = next.rooms.find((r) => r.x === owner.x && r.y === owner.y)
    if (!ns || !no) continue
    ns.type = 'closet'
    ns.name = 'CL'
    ns.target = ROOM.closet.target
    ns.minArea = ROOM.closet.minArea
    next.owner.set(ns, no)
    if (reachable(sync(next).rooms)) st = next
  }
  return sync(st)
}

/**
 * 階段の口の辺の条件（HALL_RULES.mouth。GEN_VERSION 6）を、切る前は満たしていたのに切った後は満たさなくなったか（階段の前を塞ぐ切り出しの検出）。
 * GEN_VERSION 5 までは「階段とホールが辺を共有する」だった
 */
function stairLost(before: Room[], after: Room[]): boolean {
  return mouthRuleOk(before) && !mouthRuleOk(after)
}

/** 2. ホール帯の行き止まり（階段の口の辺の条件を保つときだけ。階段のある側の端は、階段の前を塞ぐなら切らない） */
function carveHallEnds(st0: State): State {
  let st = st0
  for (const end of ['W', 'E'] as const) {
    const hall = bandHall(st.rooms)
    if (!hall) break
    let done = false
    for (let len = Math.min(6, hall.w - 4); len >= 4 && !done; len--) {
      const cx = end === 'W' ? hall.x : hall.x + hall.w - len
      const ovl = (o: Room) => Math.min(o.x + o.w, cx + len) - Math.max(o.x, cx)
      const owners = st.rooms
        .filter((o) => isPrivateRoom(o) && !hasStorage(st, o) && (o.y + o.h === hall.y || hall.y + hall.h === o.y) && ovl(o) >= 2)
        .sort((a, b) => ovl(b) - ovl(a) || a.x - b.x || a.y - b.y)
      for (const o of owners) {
        const next = clone(st)
        const nh = bandHall(next.rooms)
        const no = next.rooms.find((r) => r.x === o.x && r.y === o.y && r.type === o.type)
        if (!nh || !no) continue
        const cl: Room = {
          type: 'closet', name: 'CL', x: cx, y: hall.y, w: len, h: hall.h, area: len * hall.h,
          target: ROOM.closet.target, minArea: ROOM.closet.minArea,
        }
        if (end === 'W') nh.x += len
        nh.w -= len
        nh.area = nh.w * nh.h
        next.rooms.push(cl)
        next.owner.set(cl, no)
        // 階段の前を塞がない: 切る前に階段の口の辺の条件を満たしていたなら、切った後も満たすこと
        if (stairLost(st.rooms, next.rooms)) continue
        if (reachable(sync(next).rooms)) {
          st = next
          done = true
          break
        }
      }
    }
  }
  return sync(st)
}

const WET = new Set(['wash', 'bath', 'wc', 'laundry'])
/** 水回りの外壁側を切るときの収納の奥行（セル） */
const CUT = 2

/** 3. 水回りの超過 */
function carveWetOvers(st0: State): State {
  let st = st0
  // 持ち主を探しやすいよう、浴室・トイレ（持ち主が隣の洗面・ランドリー・個室）→ 洗面・ランドリー（自分が持ち主）の順
  const order = (r: Room) => (r.type === 'wash' || r.type === 'laundry' ? 1 : 0)
  const targets = st0.rooms.filter((r) => WET.has(r.type) && r.area > ROOM[r.type].maxArea).sort((a, b) => order(a) - order(b))
  for (const t of targets) {
    const r = st.rooms.find((q) => q.x === t.x && q.y === t.y && q.type === t.type)
    if (!r || r.h < 4) continue
    const hallAbove = st.rooms.some((h) => h.type === 'hall' && h.y + h.h === r.y)
    const hallBelow = st.rooms.some((h) => h.type === 'hall' && r.y + r.h === h.y)
    if (hallAbove === hallBelow) continue
    const next = clone(st)
    const nr = next.rooms.find((q) => q.x === r.x && q.y === r.y && q.type === r.type)
    if (!nr) continue
    const sy = hallBelow ? nr.y : nr.y + nr.h - CUT
    const strip: Room = { type: 'store', name: '収納', x: nr.x, y: sy, w: nr.w, h: CUT, area: nr.w * CUT, target: 8, minArea: 4 }
    if (hallBelow) nr.y += CUT
    nr.h -= CUT
    nr.area = nr.w * nr.h
    if (nr.h < Math.max(minShort(nr.type), 2) || nr.area < ROOM[nr.type].minArea) continue
    next.rooms.push(strip)
    // 持ち主: 洗面・ランドリーは自分、浴室・トイレは辺を共有する洗面・ランドリー・個室
    const ownerRoom =
      nr.type === 'wash' || nr.type === 'laundry'
        ? nr
        : next.rooms.find((o) => o !== nr && o !== strip && (o.type === 'wash' || o.type === 'laundry' || isPrivateRoom(o)) && sharedEdge(o, strip) !== null)
    if (!ownerRoom) continue
    next.owner.set(strip, ownerRoom)
    sync(next)
    if (sharedEdge(strip, ownerRoom) === null) continue
    if (wetViolations(next.rooms).length > 0 || shortSideViolations(next.rooms).length > 0) continue
    if (reachable(next.rooms)) st = next
  }
  return sync(st)
}
