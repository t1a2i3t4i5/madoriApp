import type { Plan, Room } from './types'
import { floorRect } from './types'

/**
 * 壁の直下率（R-IDX-09。R-EXT-09。観測のみで、生成・スコアには使わない）。
 * 2階の間仕切り（その階の板の外周以外の、部屋の辺。吹抜の辺は数えない）を単位長の壁片に分け、
 * 1階の壁（部屋の辺。外周を含む）の真上にある壁片の割合。
 * `testing.ts` の `chokkaRate` は同じ定義の独立実装で、`chokka.test.ts` で一致を確かめる。
 */

/** 載らない壁片の分類（2階の壁片の位置）。N=北帯、H=ホール帯、S=南帯。h=横の壁、v=縦の壁（R-IDX-10） */
export type ChokkaClass = 'hN' | 'hS' | 'vN' | 'vH' | 'vS'

export interface ChokkaCount {
  /** 1階の壁の真上にある壁片 */
  on: number
  /** 壁片の総数 */
  total: number
}

export interface ChokkaBreakdown extends ChokkaCount {
  /** 帯×向きごとの内訳 */
  byClass: Record<ChokkaClass, ChokkaCount>
}

/** 壁片のキー。横 `h<x>,<y>`（(x,y)→(x+1,y)）、縦 `v<x>,<y>`（(x,y)→(x,y+1)） */
function wallSegments(rooms: readonly Room[], skip?: (r: Room) => boolean): Set<string> {
  const s = new Set<string>()
  for (const r of rooms) {
    if (skip?.(r)) continue
    for (let x = r.x; x < r.x + r.w; x++) {
      s.add(`h${x},${r.y}`)
      s.add(`h${x},${r.y + r.h}`)
    }
    for (let y = r.y; y < r.y + r.h; y++) {
      s.add(`v${r.x},${y}`)
      s.add(`v${r.x + r.w},${y}`)
    }
  }
  return s
}

/** 直下率の内訳。平屋は null。2階の間仕切りが無いときは total 0 */
export function chokkaBreakdown(plan: Plan): ChokkaBreakdown | null {
  const f1 = plan.floors[0]
  const f2 = plan.floors[1]
  if (!f1 || !f2) return null
  const lower = wallSegments(f1.rooms)
  const upper = wallSegments(f2.rooms, (r) => r.type === 'void')
  const fp = floorRect(plan, 1)
  const vd = f2.rooms.find((r) => r.type === 'void')
  // 2階のホール帯の y 範囲（ホールが無ければ北帯だけとみなして分類する）
  const halls = f2.rooms.filter((r) => r.type === 'hall')
  const northEnd = halls.length ? Math.min(...halls.map((r) => r.y)) : fp.y + fp.H
  const southStart = halls.length ? Math.max(...halls.map((r) => r.y + r.h)) : fp.y + fp.H
  const zero = (): ChokkaCount => ({ on: 0, total: 0 })
  const byClass: Record<ChokkaClass, ChokkaCount> = { hN: zero(), hS: zero(), vN: zero(), vH: zero(), vS: zero() }
  let on = 0
  let total = 0
  for (const k of upper) {
    const horizontal = k.startsWith('h')
    const [a = '', b = ''] = k.slice(1).split(',')
    const x = Number(a)
    const y = Number(b)
    if (horizontal ? y === fp.y || y === fp.y + fp.H : x === fp.x || x === fp.x + fp.W) continue
    if (vd) {
      const onVoid = horizontal
        ? x >= vd.x && x < vd.x + vd.w && (y === vd.y || y === vd.y + vd.h)
        : y >= vd.y && y < vd.y + vd.h && (x === vd.x || x === vd.x + vd.w)
      if (onVoid) continue
    }
    const cls: ChokkaClass = horizontal
      ? (y <= northEnd ? 'hN' : 'hS')
      : (y < northEnd ? 'vN' : y < southStart ? 'vH' : 'vS')
    const hit = lower.has(k)
    total++
    byClass[cls].total++
    if (hit) {
      on++
      byClass[cls].on++
    }
  }
  return { on, total, byClass }
}

/** 直下率（0〜1）。平屋、または2階の間仕切りが無いときは null */
export function chokkaRate(plan: Plan): number | null {
  const b = chokkaBreakdown(plan)
  return b && b.total ? b.on / b.total : null
}
