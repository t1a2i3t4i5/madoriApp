import type { Room, RoomType } from './types'
import { ROOM, bandHall } from './rooms'
import { sharedEdge } from './derive'
import { HALL_RULES, mouthRuleOk } from './circulation'
import { validateRooms } from './validate'
import { carveFloor } from './carve'
import { isPrivateRoom, storageOf } from './closets'

/**
 * ホール帯の端の吸収（GEN_VERSION 6。仕様 §6.1、A3）。割り付けの後・carve の前に、階ごとに行う。
 * ホール帯の西端 → 東端の順に、各端で、ホール帯に接する北帯・南帯の部屋の境界の x を候補にし、切り取りが長い順に試す。
 * 候補 c について、端から c までの区間を北帯または南帯の部屋が「ちょうど覆う」側を選び（両側とも覆えるときは LDK か玄関を含む側を先に）、
 * その部屋の高さを +2 して（南帯の部屋は y を −2）ホール帯の区間を吸収する。
 * 吸収した後の階が、ハード制約（validateRooms: 到達可能性・最小の短辺・水回りの隣接・外壁接触・ホールの長さ・階段の口・動線のガード）と、
 * 付属収納の持ち主との辺の共有、階段の口の全幅の条件（HALL_RULES.mouth）、玄関・土間の最大面積（entryMaxOnly）、個室収納が減らないこと（keepStorage。吸収が、ホール帯の端の収納化（carve）より先に端を取って個室のクローゼットを奪わない）を満たすときだけ採る。満たさなければ次の候補（短い切り取り）。
 * 水回り（洗面・浴室・トイレ・ランドリー）・階段・吹抜は吸収しない。純関数: rooms は書き換えず新しい配列を返す
 */
const ABSORBABLE: ReadonlySet<RoomType> = new Set<RoomType>([
  'ldk', 'master', 'bed', 'study', 'washitsu', 'entry', 'doma', 'kitchen', 'wic', 'pantry', 'store', 'closet',
])
/** 吸収の高さ（セル）。ホール帯の高さと同じ */
const ABSORB = 2
/** クローゼットの長さの上限（slicing.ts の CLOSET_MAX_LEN と同じ。吸収で超えない） */
const CLOSET_LEN_MAX = 8

type Plate = { x: number; y: number; W: number; H: number }

/** 付属収納の持ち主（Room.of が指す位置の部屋）が、いずれも辺を共有しているか */
function ownersShare(rooms: readonly Room[]): boolean {
  for (const r of rooms) {
    if (!r.of) continue
    const o = rooms.find((q) => q !== r && q.x === r.x + (r.of?.dx ?? 0) && q.y === r.y + (r.of?.dy ?? 0))
    if (!o || !sharedEdge(o, r)) return false
  }
  return true
}

/** 吸収で LDK・玄関へ面積を戻すため、LDK か玄関を含む側を先に試す */
const priority = (rs: Room[]) => (rs.some((r) => r.type === 'ldk' || r.type === 'entry') ? 0 : 1)

/** 収納化（carve）の後に、収納のある個室（主寝室・洋室）の数 */
function storedCount(rooms: readonly Room[]): number {
  const carved = carveFloor(rooms)
  return carved.filter((r) => isPrivateRoom(r) && storageOf(carved, r)).length
}

export function trimHall(rooms0: readonly Room[], plate: Plate): Room[] {
  let rooms = rooms0.slice()
  if (!HALL_RULES.absorb) return rooms
  // 吸収の前（= 収納化だけ行った場合）の、収納のある個室の数。必要になったときだけ計算する
  let base: number | undefined
  for (const end of ['W', 'E'] as const) {
    const hall = bandHall(rooms)
    if (!hall) return rooms
    const north = rooms.filter((r) => r.y + r.h === hall.y)
    const south = rooms.filter((r) => r.y === hall.y + hall.h)
    const bounds = new Set<number>()
    for (const r of [...north, ...south]) {
      bounds.add(r.x)
      bounds.add(r.x + r.w)
    }
    const cuts = [...bounds].filter((c) => c > hall.x && c < hall.x + hall.w).sort((a, b) => (end === 'W' ? b - a : a - b))
    let done = false
    for (const c of cuts) {
      if (done) break
      const lo = end === 'W' ? hall.x : c
      const hi = end === 'W' ? c : hall.x + hall.w
      // 残るホールの長さの下限は、検証の前に弾く（長い切り取りから試すので、短すぎる残りはここで捨てる）
      if (hall.w - (hi - lo) < HALL_RULES.minHallLen) continue
      const sides: { side: 'N' | 'S'; rs: Room[] }[] = []
      for (const side of ['S', 'N'] as const) {
        const rs = (side === 'N' ? north : south).filter((r) => r.x >= lo && r.x + r.w <= hi)
        if (rs.reduce((s, r) => s + r.w, 0) !== hi - lo) continue
        if (!rs.every((r) => ABSORBABLE.has(r.type) && !(r.type === 'closet' && r.h + ABSORB > CLOSET_LEN_MAX))) continue
        if (HALL_RULES.entryMaxOnly && rs.some((r) => (r.type === 'entry' || r.type === 'doma') && r.w * (r.h + ABSORB) > ROOM[r.type].maxArea)) continue
        sides.push({ side, rs })
      }
      sides.sort((a, b) => priority(a.rs) - priority(b.rs))
      for (const { side, rs } of sides) {
        const next = absorb(rooms, hall, end, lo, hi, side, rs)
        if (!(ownersShare(next) && mouthRuleOk(next) && validateRooms(next, plate))) continue
        if (HALL_RULES.keepStorage) {
          base ??= storedCount(rooms0)
          if (storedCount(next) < base) continue
        }
        rooms = next
        done = true
        break
      }
    }
  }
  return rooms
}

/** hall の end 側の区間 [lo,hi) を、side 側の部屋 rs が吸収した後の部屋の配列（持ち主の対応は部屋の同一性で引き継ぐ） */
function absorb(rooms: readonly Room[], hall: Room, end: 'W' | 'E', lo: number, hi: number, side: 'N' | 'S', rs: Room[]): Room[] {
  const copy = rooms.map((r) => ({ ...r }))
  const idx = new Map(rooms.map((r, i) => [r, i]))
  const owner = new Map<Room, Room>()
  rooms.forEach((r, i) => {
    if (!r.of) return
    const oi = rooms.findIndex((q) => q !== r && q.x === r.x + (r.of?.dx ?? 0) && q.y === r.y + (r.of?.dy ?? 0))
    const s = copy[i]
    const o = copy[oi]
    if (oi >= 0 && s && o) owner.set(s, o)
  })
  const nh = copy[idx.get(hall) ?? -1]
  if (!nh) return copy
  if (end === 'W') nh.x = hi
  nh.w = hall.w - (hi - lo)
  nh.area = nh.w * nh.h
  for (const r of rs) {
    const nr = copy[idx.get(r) ?? -1]
    if (!nr) continue
    if (side === 'S') nr.y -= ABSORB
    nr.h += ABSORB
    nr.area = nr.w * nr.h
  }
  for (const r of copy) delete r.of
  for (const [s, o] of owner) s.of = { dx: o.x - s.x, dy: o.y - s.y }
  return copy
}
