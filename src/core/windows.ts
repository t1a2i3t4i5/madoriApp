import { computeDoors, entryDoor } from './derive'
import { HABITABLE, findEntry } from './rooms'
import { floorRect } from './types'
import type { FloorRect, Plan, Room, RoomType } from './types'

/**
 * 窓の導出と指標（R-WIN-01〜04、R-WIN-07［暫定］）。純関数・決定的。
 * 窓の配置は描画と観測のためだけにあり、生成・fixture には入っていない。GEN_VERSION 7 からスコア「二面採光」が windowStats を参照する。
 */

export type Side = 'N' | 'S' | 'E' | 'W'

export interface WindowSeg {
  /** 窓が付く外壁側 */
  side: Side
  room: Room
  /** 外壁上の区間（南北は x、東西は y。a < b） */
  a: number
  b: number
  /** main = 居室の窓／small = 非居室の小窓（R-WIN-04）／high = 吹抜の高窓（二面採光の数には入れない） */
  kind: 'main' | 'small' | 'high'
}

/** 小窓を付ける非居室（R-WIN-04）。収納・クローゼット・WIC・パントリーには付けない */
const SMALL_TYPES: ReadonlySet<RoomType> = new Set<RoomType>([
  'bath', 'wash', 'wc', 'laundry', 'kitchen', 'stair', 'hall', 'entry', 'doma',
])

const SIDES: readonly Side[] = ['N', 'S', 'E', 'W']

/** 部屋が板 fp の side の外壁に接する区間（接しなければ null） */
function contact(r: Room, side: Side, fp: FloorRect): [number, number] | null {
  switch (side) {
    case 'N': return r.y === fp.y ? [r.x, r.x + r.w] : null
    case 'S': return r.y + r.h === fp.y + fp.H ? [r.x, r.x + r.w] : null
    case 'W': return r.x === fp.x ? [r.y, r.y + r.h] : null
    case 'E': return r.x + r.w === fp.x + fp.W ? [r.y, r.y + r.h] : null
  }
}

/**
 * 区間 [lo, hi] の中央に長さ len の窓を置く。avoid の区間（玄関の外開きドア）と重なるときは、
 * 残った区間のうち長い方の中央に置き、len に満たなければ収める。1 未満なら付けない
 */
function place(lo: number, hi: number, len: number, avoid: [number, number] | null): [number, number] | null {
  let segLo = lo
  let segHi = hi
  if (avoid && avoid[0] < hi && lo < avoid[1]) {
    const left = avoid[0] - lo
    const right = hi - avoid[1]
    if (left >= right) segHi = avoid[0]
    else segLo = avoid[1]
  }
  const l = Math.min(len, segHi - segLo - 0.4)
  if (l < 1) return null
  const mid = (segLo + segHi) / 2
  return [mid - l / 2, mid + l / 2]
}

/**
 * 外壁に窓を自動配置する（その階の板 fp で外壁を判定。R-SPACE-33）。
 * - 居室: 外壁に接する全ての面（接触長2セル以上）。長さ min(6, max(2.4, 接触長 − 2.4))、接触区間の中央。角部屋は両面
 * - 非居室（SMALL_TYPES）: 面ごとに1つ、長さ min(2, 接触長 − 1)（1 未満は付けない）
 * - 吹抜: 居室と同じ規則の高窓（kind 'high'）
 * - 玄関の外開きドア（南）とは重ねない
 */
export function computeWindows(rooms: Room[], fp: FloorRect): WindowSeg[] {
  const out: WindowSeg[] = []
  const entry = findEntry(rooms)
  const door = entry && entry.y + entry.h === fp.y + fp.H ? entryDoor(entry, fp.y + fp.H).rect : null
  for (const r of rooms) {
    const main = !!HABITABLE[r.type]
    const high = r.type === 'void'
    const small = SMALL_TYPES.has(r.type)
    if (!main && !high && !small) continue
    for (const side of SIDES) {
      const c = contact(r, side, fp)
      if (!c) continue
      const n = c[1] - c[0]
      if ((main || high) && n < 2) continue
      const len = main || high ? Math.min(6, Math.max(2.4, n - 2.4)) : Math.min(2, n - 1)
      const avoid = r === entry && side === 'S' && door ? ([door.x, door.x + door.w] as [number, number]) : null
      const seg = place(c[0], c[1], len, avoid)
      if (seg) out.push({ side, room: r, a: seg[0], b: seg[1], kind: main ? 'main' : high ? 'high' : 'small' })
    }
  }
  return out
}

/** 通風のレベル: A = 居室内に2方位の窓／B = 窓は1面以下だが、共用部をたどって別方位の窓に届く／C = どちらもない */
export type VentLevel = 'A' | 'B' | 'C'

export interface RoomWindowStat {
  floor: number
  room: Room
  /** 居室の main の窓がある方位 */
  sides: Side[]
  level: VentLevel
}

export interface WindowStats {
  /** 居室ごとの窓の面と通風レベル */
  rooms: RoomWindowStat[]
  /** 居室のうち、2方位以上に main の窓がある割合（居室がなければ 1。R-WIN-02） */
  twoFaceRate: number
  /** 通風レベルごとの居室数・割合（R-WIN-03） */
  level: Record<VentLevel, number>
  levelRate: Record<VentLevel, number>
  /** 非居室（小窓の対象種別）ごとの、窓のある部屋数と総数（R-WIN-04。観測のみ） */
  nonHabitable: Partial<Record<RoomType, { with: number; total: number }>>
  /** 階ごと: ドアでつながる部屋群の中に、対向する方位（南北または東西）の窓があるか */
  floorCross: boolean[]
}

/** B の探索が通る共用部 */
const SHARED: ReadonlySet<RoomType> = new Set<RoomType>(['hall', 'entry', 'doma', 'stair', 'ldk'])

export function windowStats(plan: Plan): WindowStats {
  const rooms: RoomWindowStat[] = []
  const nonHabitable: WindowStats['nonHabitable'] = {}
  const floorCross: boolean[] = []
  for (let fi = 0; fi < plan.floors.length; fi++) {
    const fl = plan.floors[fi]
    if (!fl) continue
    const wins = computeWindows(fl.rooms, floorRect(plan, fi))
    const sidesOf = (r: Room, kinds: WindowSeg['kind'][]): Set<Side> =>
      new Set(wins.filter((w) => w.room === r && kinds.includes(w.kind)).map((w) => w.side))
    const doors = computeDoors(fl.rooms)
    const adj = new Map<Room, Room[]>()
    for (const d of doors) {
      adj.set(d.a, [...(adj.get(d.a) ?? []), d.b])
      adj.set(d.b, [...(adj.get(d.b) ?? []), d.a])
    }
    for (const r of fl.rooms) {
      if (SMALL_TYPES.has(r.type)) {
        const e = (nonHabitable[r.type] ??= { with: 0, total: 0 })
        e.total++
        if (wins.some((w) => w.room === r && w.kind === 'small')) e.with++
      }
      if (!HABITABLE[r.type]) continue
      const own = sidesOf(r, ['main'])
      let level: VentLevel = own.size >= 2 ? 'A' : 'C'
      if (level === 'C') {
        // 共用部（ドア・開口でつながるもの）をたどり、居室自身にない方位の窓に届くか
        const seen = new Set<Room>([r])
        const queue: Room[] = [r]
        const reach = new Set<Side>(own)
        while (queue.length > 0) {
          const cur = queue.shift()
          if (!cur) break
          for (const nb of adj.get(cur) ?? []) {
            if (seen.has(nb) || !SHARED.has(nb.type)) continue
            seen.add(nb)
            queue.push(nb)
            for (const s of sidesOf(nb, ['main', 'small'])) reach.add(s)
          }
        }
        if (reach.size > own.size) level = 'B'
      }
      rooms.push({ floor: fi, room: r, sides: [...own], level })
    }
    // 階単位: ドアでつながる連結成分のどれかが対向する方位の窓を持つ
    const compSeen = new Set<Room>()
    let cross = false
    for (const start of fl.rooms) {
      if (compSeen.has(start)) continue
      const comp: Room[] = []
      const q: Room[] = [start]
      compSeen.add(start)
      while (q.length > 0) {
        const cur = q.shift()
        if (!cur) break
        comp.push(cur)
        for (const nb of adj.get(cur) ?? []) {
          if (!compSeen.has(nb)) { compSeen.add(nb); q.push(nb) }
        }
      }
      const ss = new Set(wins.filter((w) => comp.includes(w.room) && w.kind !== 'high').map((w) => w.side))
      if ((ss.has('N') && ss.has('S')) || (ss.has('E') && ss.has('W'))) cross = true
    }
    floorCross.push(cross)
  }
  const level: Record<VentLevel, number> = { A: 0, B: 0, C: 0 }
  for (const s of rooms) level[s.level]++
  const n = rooms.length
  const rate = (k: number) => (n === 0 ? 0 : k / n)
  return {
    rooms,
    twoFaceRate: n === 0 ? 1 : rooms.filter((s) => s.sides.length >= 2).length / n,
    level,
    levelRate: { A: rate(level.A), B: rate(level.B), C: rate(level.C) },
    nonHabitable,
    floorCross,
  }
}
