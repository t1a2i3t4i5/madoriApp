// 列の積み（GEN_VERSION 10。R-SPACE-43・R-SPACE-46）。フレームワーク非依存の純 TypeScript
import type { Room, RoomType } from './types'
import { ROOM, minShort, ENTRY_HALL, bandHall } from './rooms'
import { sharedEdge } from './derive'
import { validateRooms } from './validate'
import { isPrivateRoom, storageOf } from './closets'

type Plate = { x: number; y: number; W: number; H: number }

/** 付属収納の持ち主がいずれも辺を共有しているか */
function ownersShare(rooms: readonly Room[]): boolean {
  for (const r of rooms) {
    if (!r.of) continue
    const o = rooms.find((q) => q !== r && q.x === r.x + (r.of?.dx ?? 0) && q.y === r.y + (r.of?.dy ?? 0))
    if (!o || !sharedEdge(o, r)) return false
  }
  return true
}

const NO_STACK: ReadonlySet<RoomType> = new Set<RoomType>(['ldk', 'hall', 'stair', 'void', 'closet', 'store'])
const maxOf = (r: Room) =>
  r.name === 'キッチン・パントリー' ? ROOM.kitchen.maxArea + ROOM.pantry.maxArea : r.name === '玄関・土間' ? ROOM.entry.maxArea + ROOM.doma.maxArea : ROOM[r.type].maxArea
const minOf = (r: Room) => Math.max(r.minArea || 0, 0)

/** of を持ち主の同一性から付け直したコピー */
function withOwners(rooms: Room[], owner: Map<Room, Room>): Room[] {
  for (const r of rooms) if (owner.has(r)) { const o = owner.get(r) as Room; r.of = { dx: o.x - r.x, dy: o.y - r.y } }
  return rooms
}

/**
 * 列の積み: 最大面積を超えた部屋（LDK・ホール・階段・吹抜・収納系を除く）を、主室＋付属に割る。
 * 帯の高さ方向（H 分割）を先に、だめなら幅方向（V 分割）。付属の持ち主は、隣の収納のない個室（クローゼット）→ 主室（洗面・ランドリー・キッチン・主寝室）→ ホール → 隣の VIA 室 の順に試す。
 * 玄関は南（外壁・玄関ドア）を主室にし、ホール側の残りを「玄関ホール」（type hall）にする。
 * 採るのは validateRooms・持ち主との辺の共有を満たすときだけ
 */
export function stackOvers(rooms0: readonly Room[], plate: Plate): Room[] {
  let rooms = rooms0.map((r) => ({ ...r }))
  const hall0 = bandHall(rooms)
  if (!hall0) return rooms
  for (let pass = 0; pass < 3; pass++) {
  const targets = rooms.filter((r) => !NO_STACK.has(r.type) && !r.of && r.w * r.h > maxOf(r) && r.name !== ENTRY_HALL)
  if (!targets.length) break
  for (const t0 of targets) {
    const cur = rooms.find((q) => q.x === t0.x && q.y === t0.y && q.type === t0.type)
    if (!cur) continue
    const hall = bandHall(rooms) as Room
    const north = cur.y + cur.h <= hall.y // ホールが南
    const south = cur.y >= hall.y + hall.h // ホールが北
    const mx = maxOf(cur)
    const need = Math.max(minShort(cur.type), 2)
    const cands: { main: Room; fill: Room }[] = []
    // H 分割（帯の高さ方向）。付属は厚さ 2・面積 16 以下（R-ROOM-09）。主室が最大面積に収まらなければ、厚さ 2 だけ削る（次の周回でもう一度削れる）
    const hm = Math.max(need, Math.ceil(minOf(cur) / cur.w), cur.h - 2)
    if ((north || south) && cur.h - hm === 2 && cur.w * 2 <= ROOM.store.maxArea) {
      const fh = 2
      for (const fillHallSide of [true, false]) {
        if (cur.type === 'entry' || cur.type === 'doma') {
          if (!south || !fillHallSide) continue
        }
        // 洗濯機の部屋は、付属をホールと反対側に付けて、ホールからの入口を塞がない（carveWetOvers と同じ向き）
        if ((cur.type === 'wash' || cur.type === 'laundry') && fillHallSide) continue
        const fillTop = north ? !fillHallSide : fillHallSide
        const fill: Room = { ...cur, y: fillTop ? cur.y : cur.y + hm, h: fh, area: cur.w * fh }
        const main: Room = { ...cur, y: fillTop ? cur.y + fh : cur.y, h: hm, area: cur.w * hm }
        cands.push({ main, fill })
      }
    }
    // 玄関は、玄関ホールで最大面積まで一度に削る（玄関ホールは収納でないので厚さの制限なし）
    if ((cur.type === 'entry' || cur.type === 'doma') && south) {
      const he = Math.max(need, Math.ceil(minOf(cur) / cur.w), Math.floor(mx / cur.w))
      if (cur.h - he >= 2) {
        const fh = cur.h - he
        cands.unshift({ fill: { ...cur, h: fh, area: cur.w * fh }, main: { ...cur, y: cur.y + fh, h: he, area: cur.w * he } })
      }
    }
    // V 分割（幅方向）。付属は厚さ 2・面積 16 以下
    if (cur.type !== 'entry' && cur.type !== 'doma') {
      const wm = Math.max(need, Math.ceil(minOf(cur) / cur.h), cur.w - 2)
      if (cur.w - wm === 2 && cur.h * 2 <= ROOM.store.maxArea) {
        const fw = 2
        // 洗濯機の部屋（洗面・ランドリー）は、東西の外壁に接していたら、付属を外壁と反対側に付けて接し方を失わない（勝手口 B・R-FLOW-07）
        const wallW = cur.x === plate.x
        const wallE = cur.x + cur.w === plate.x + plate.W
        const keepWall = cur.type === 'wash' || cur.type === 'laundry'
        for (const left of [true, false]) {
          if (keepWall && ((left && wallW) || (!left && wallE))) continue
          const fill: Room = { ...cur, x: left ? cur.x : cur.x + wm, w: fw, area: fw * cur.h }
          const main: Room = { ...cur, x: left ? cur.x + fw : cur.x, w: wm, area: wm * cur.h }
          cands.push({ main, fill })
        }
      }
    }
    let done = false
    const base = rooms.filter((r) => r !== cur)
    /** base のコピーと main を作り、既存の付属の持ち主（同一性）を引き継ぐ。cur の付属は main に付け替える */
    const fresh = (main: Room) => {
      const copy = base.map((r) => ({ ...r }))
      const nmain = { ...main }
      const owner = new Map<Room, Room>()
      const all0 = [...base, cur]
      base.forEach((r, i) => {
        if (!r.of) return
        const o = all0.find((q) => q !== r && q.x === r.x + (r.of?.dx ?? 0) && q.y === r.y + (r.of?.dy ?? 0))
        const c = copy[i] as Room
        if (o === cur) owner.set(c, nmain)
        else if (o) { const oi = base.indexOf(o); if (oi >= 0) owner.set(c, copy[oi] as Room) }
      })
      return { copy, nmain, owner }
    }
    for (const { main, fill } of cands) {
      if (done) break
      // 付属は収納の最小面積（6）以上（玄関ホールは対象外）
      if (cur.type !== 'entry' && cur.type !== 'doma' && fill.w * fill.h < ROOM.store.minArea) continue
      if (cur.type === 'entry' || cur.type === 'doma') {
        const { copy, nmain, owner } = fresh(main)
        const stub: Room = { type: 'hall', name: ENTRY_HALL, x: fill.x, y: fill.y, w: fill.w, h: fill.h, area: fill.area, target: 0, minArea: 0 }
        const next = withOwners([...copy, nmain, stub], owner)
        if (ownersShare(next) && validateRooms(next, plate)) { rooms = next; done = true }
        continue
      }
      // 付属の持ち主の候補（base の添字、-1 = 主室）
      const probe = fresh(main)
      const pool = [...probe.copy, probe.nmain]
      const idxOf = (o: Room) => (o === probe.nmain ? -1 : probe.copy.indexOf(o))
      const nb = pool.filter((o) => sharedEdge(o, fill) !== null)
      const ownerCands: number[] = [
        ...nb.filter((o) => isPrivateRoom(o) && storageOf(pool, o) === undefined),
        ...(['wash', 'laundry', 'kitchen', 'master', 'entry', 'doma'].includes(probe.nmain.type) ? [probe.nmain] : []),
        ...nb.filter((o) => o.type === 'hall'),
        ...nb.filter((o) => ['wash', 'laundry', 'ldk', 'entry', 'doma'].includes(o.type) && o !== probe.nmain),
      ].map(idxOf)
      for (const oi of ownerCands) {
        const { copy, nmain, owner } = fresh(main)
        const o = oi < 0 ? nmain : (copy[oi] as Room)
        const asCloset = isPrivateRoom(o) && Math.min(fill.w, fill.h) >= 2 && Math.max(fill.w, fill.h) >= 4 && fill.area <= ROOM.closet.maxArea
        const f: Room = {
          type: asCloset ? 'closet' : 'store', name: asCloset ? 'CL' : '収納', x: fill.x, y: fill.y, w: fill.w, h: fill.h, area: fill.area,
          target: 8, minArea: asCloset ? 8 : 4,
        }
        owner.set(f, o)
        const next = withOwners([...copy, nmain, f], owner)
        if (ownersShare(next) && validateRooms(next, plate)) { rooms = next; done = true; break }
      }
    }
  }
  }
  return rooms
}

