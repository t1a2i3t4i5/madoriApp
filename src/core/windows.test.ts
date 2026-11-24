import { describe, expect, it } from 'vitest'
import { entryDoor } from './derive'
import { generatePlans } from './generate'
import { ROOM, findEntry } from './rooms'
import { CONDITIONS, PARTIAL_CONDITIONS, SEEDS, windowSidesIndependent } from './testing'
import type { Plan, Room, RoomType } from './types'
import { floorRect } from './types'
import { computeWindows, windowStats } from './windows'

const room = (type: RoomType, x: number, y: number, w: number, h: number): Room => ({
  type, name: type, x, y, w, h, area: w * h, target: ROOM[type].target, minArea: ROOM[type].minArea,
})
const FP = { x: 0, y: 0, W: 20, H: 14 }

describe('computeWindows: 4方位・非居室・収納・玄関ドア', () => {
  it('居室は外壁に接する全ての面に付く（角部屋は両面）', () => {
    const ldk = room('ldk', 0, 6, 12, 8) // 西・南
    const w = computeWindows([ldk], FP).filter((x) => x.room === ldk)
    expect(w.map((x) => x.side).sort()).toEqual(['S', 'W'])
    expect(w.every((x) => x.kind === 'main')).toBe(true)
    const s = w.find((x) => x.side === 'S')
    expect(s && [s.a, s.b]).toEqual([3, 9]) // 長さ min(6, 12−2.4)=6 → 中央 6±3
  })
  it('東西だけに接する居室にも窓が付く', () => {
    const r = room('bed', 0, 4, 6, 5)
    const w = computeWindows([r], FP)
    expect(w.map((x) => x.side)).toEqual(['W'])
  })
  it('非居室は小窓（長さ ≤2）、収納・WIC・クローゼット・パントリーには付けない', () => {
    const rooms = [room('bath', 0, 0, 4, 5), room('wic', 4, 0, 4, 4), room('closet', 8, 0, 2, 5), room('pantry', 10, 0, 3, 3), room('wc', 13, 0, 3, 4)]
    const w = computeWindows(rooms, FP)
    expect(w.filter((x) => x.room.type === 'bath').map((x) => x.kind)).toEqual(['small', 'small'])
    expect(w.filter((x) => x.room.type === 'wc').length).toBe(1)
    for (const t of ['wic', 'closet', 'pantry'] as const) expect(w.some((x) => x.room.type === t)).toBe(false)
    expect(w.filter((x) => x.kind === 'small').every((x) => x.b - x.a <= 2)).toBe(true)
  })
  it('その階の板（fp）で外壁を判定する', () => {
    const fp = { x: 4, y: 0, W: 12, H: 10 }
    const r = room('bed', 4, 0, 6, 5)
    expect(computeWindows([r], fp).map((x) => x.side).sort()).toEqual(['N', 'W'])
  })
  it('玄関の南の小窓は外開きドアと重ならない', () => {
    const e = room('entry', 2, 10, 5, 4)
    const door = entryDoor(e, 14).rect
    for (const x of computeWindows([e], FP).filter((x) => x.side === 'S')) {
      expect(x.b <= door.x || x.a >= door.x + door.w).toBe(true)
    }
  })
  it('吹抜は高窓（high）で、二面採光の数に入れない', () => {
    const v = room('void', 0, 0, 4, 6)
    expect(computeWindows([v], FP).every((x) => x.kind === 'high')).toBe(true)
  })
})

const ALL = [...CONDITIONS, ...PARTIAL_CONDITIONS]
const POPULAR = [...CONDITIONS.slice(0, 3), ...PARTIAL_CONDITIONS.slice(0, 3)]
const present = (conds: typeof ALL, seeds: readonly number[]): Plan[] => conds.flatMap(({ cfg }) => seeds.flatMap((s) => generatePlans(cfg, s)))

describe('windowStats: 提示案の不変条件と実測', () => {
  const plans = present(POPULAR, SEEDS)
  it('窓のない居室がなく、通風 C の居室がない', () => {
    const noWin: string[] = []
    for (const p of plans) {
      const st = windowStats(p)
      expect(st.level.C).toBe(0)
      st.rooms.forEach((r) => { if (r.sides.length === 0) noWin.push(r.room.name) })
      expect(st.floorCross.every(Boolean)).toBe(true)
    }
    expect(noWin).toEqual([])
  })
  it('居室の窓の方位が独立実装と一致する（総二階・平屋・部分二階）', () => {
    for (const p of present(ALL, [1])) {
      const st = windowStats(p)
      const ind = windowSidesIndependent(p)
      expect(st.rooms.map((r) => [...r.sides].sort().join(''))).toEqual(ind.map((r) => [...r.sides].sort().join('')))
    }
  })
  it('二面採光率の退行防止の下限（人気6条件 ≥0.62）', () => {
    let two = 0, n = 0
    for (const p of plans) { const st = windowStats(p); two += st.rooms.filter((r) => r.sides.length >= 2).length; n += st.rooms.length }
    expect(two / n).toBeGreaterThanOrEqual(0.62)
  })
  it('二面採光率の退行防止の下限（グリッド総二階・平屋 ≥0.42）', () => {
    let two = 0, n = 0
    for (const p of present(CONDITIONS, [1])) { const st = windowStats(p); two += st.rooms.filter((r) => r.sides.length >= 2).length; n += st.rooms.length }
    expect(two / n).toBeGreaterThanOrEqual(0.42)
  })
  it('玄関の窓はドアと重ならない（全提示案）', () => {
    for (const p of plans) {
      p.floors.forEach((fl, i) => {
        const fp = floorRect(p, i)
        const e = findEntry(fl.rooms)
        if (!e || e.y + e.h !== fp.y + fp.H) return
        const d = entryDoor(e, fp.y + fp.H).rect
        for (const w of computeWindows(fl.rooms, fp)) {
          if (w.room === e && w.side === 'S') expect(w.b <= d.x || w.a >= d.x + d.w).toBe(true)
        }
      })
    }
  })
})
