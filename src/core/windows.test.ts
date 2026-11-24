import { describe, expect, it } from 'vitest'
import { computeDoors, entryDoor } from './derive'
import { generatePlans } from './generate'
import { feasibility } from './program'
import { ROOM, findEntry } from './rooms'
import { CONDITIONS, PARTIAL_CONDITIONS, SEEDS, ventLevelsIndependent, windowSidesIndependent } from './testing'
import type { Plan, PlanConfig, Room, RoomType } from './types'
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
  it('吹抜の高窓は、隣の居室の二面採光・通風の数に入らない', () => {
    // LDK は南（と西）だけ。北の外壁には吹抜がある。吹抜の高窓が数えられると LDK の方位が増えてしまう
    const ldk = room('ldk', 0, 6, 8, 8) // 西・南
    const v = room('void', 0, 0, 8, 6) // 西・北（高窓のみ）
    const plan: Plan = {
      W: 20, H: 14, arch: 1 as Plan['arch'], totalArea: 280,
      floors: [{ label: '2F', rooms: [v, ldk] }],
    }
    expect(computeWindows(plan.floors[0]?.rooms ?? [], FP).filter((x) => x.room === v).every((x) => x.kind === 'high')).toBe(true)
    const st = windowStats(plan)
    expect(st.rooms.map((r) => r.room)).toEqual([ldk]) // 吹抜は居室ではない
    expect([...(st.rooms[0]?.sides ?? [])].sort()).toEqual(['S', 'W']) // 北は入らない
    expect(st.twoFaceRate).toBe(1)
    // 窓が南の1面だけの居室は、吹抜の高窓があっても A にならない
    const ldk2 = room('ldk', 8, 6, 8, 8) // 南だけ
    const st2 = windowStats({ ...plan, floors: [{ label: '2F', rooms: [room('void', 8, 0, 8, 6), ldk2] }] })
    expect(st2.rooms[0]?.sides).toEqual(['S'])
    expect(st2.rooms[0]?.level).not.toBe('A')
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
  it('二面採光率の退行防止の下限（人気6条件 ≥0.70。GEN_VERSION 7 の実測 75.8%。v6 は 66.7%）', () => {
    let two = 0, n = 0
    for (const p of plans) { const st = windowStats(p); two += st.rooms.filter((r) => r.sides.length >= 2).length; n += st.rooms.length }
    expect(two / n).toBeGreaterThanOrEqual(0.70)
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

/** 提示案の標本（feasibility グリッド・seed 1）。仕様の標本と同じ: 総二階・平屋 207案（居室 916室）／部分二階 132案（543室）。生成に ~90 秒かかるので1度だけ作る */
let gridCache: { full: Plan[]; part: Plan[] } | null = null
function grid(): { full: Plan[]; part: Plan[] } {
  if (gridCache) return gridCache
  const full: Plan[] = []
  const part: Plan[] = []
  for (const floors of [1, 2] as const) {
    for (const area of [20, 23, 26, 30, 36, 40]) {
      for (const rooms of [2, 3, 4, 5]) {
        for (const feats of [[], ['doma'], ['void', 'study'], ['washitsu', 'laundry', 'pantry', 'wic']] as PlanConfig['feats'][]) {
          const cfg: PlanConfig = { area, floors, rooms, parking: 1, garden: 1, feats }
          if (feasibility(cfg).ok) full.push(...generatePlans(cfg, 1))
        }
      }
    }
  }
  for (const area of [24, 28, 32, 36, 40]) {
    for (const nr of [2, 3, 4, 5]) {
      for (const feats of [[], ['doma'], ['void'], ['laundry', 'pantry', 'wic']] as PlanConfig['feats'][]) {
        const cfg: PlanConfig = { area, floors: 2, rooms: nr, parking: 1, garden: 1, feats, story: 'partial' }
        if (feasibility(cfg).ok) part.push(...generatePlans(cfg, 1))
      }
    }
  }
  gridCache = { full, part }
  return gridCache
}
const rate = (plans: Plan[]) => {
  let two = 0, n = 0, c = 0
  for (const p of plans) {
    const st = windowStats(p)
    two += st.rooms.filter((r) => r.sides.length >= 2).length
    c += st.level.C
    n += st.rooms.length
  }
  return { two: two / n, c: c / n, cCount: c, n }
}
const GRID_TIMEOUT = 600_000

describe('windowStats: feasibility グリッド（seed 1）の実測と退行防止', () => {
  it('総二階・平屋（207案・居室918室）: 二面採光率 ≥0.51（GEN_VERSION 7 の実測 53.1%。v6 は 45.3%）、通風 C ≤1.5%（実測 7室 = 0.8%。v6 は 10室）', () => {
    const r = rate(grid().full)
    expect(r.n).toBe(918)
    expect(r.two).toBeGreaterThanOrEqual(0.51)
    expect(r.c).toBeLessThanOrEqual(0.015)
  }, GRID_TIMEOUT)
  it('部分二階（132案・居室543室）: 通風 C は 0（不変条件）、二面採光率 ≥0.80（GEN_VERSION 7 の実測 82.9%。v6 は 70.5%）', () => {
    const r = rate(grid().part)
    expect(r.cCount).toBe(0)
    expect(r.two).toBeGreaterThanOrEqual(0.80)
  }, GRID_TIMEOUT)
  it('グリッドの C は平屋だけ（2階建ての総二階には出ない）', () => {
    for (const p of grid().full) if (p.floors.length > 1) expect(windowStats(p).level.C).toBe(0)
  }, GRID_TIMEOUT)
})

describe('通風レベル（A/B/C）の独立実装との一致', () => {
  const doorsOf = (rooms: Room[]) => computeDoors(rooms)
  const entryDoorX = (e: Room, bottom: number) => entryDoor(e, bottom).rect
  it('条件セット（総二階・平屋・部分二階）の提示案で、居室ごとの A/B/C が windowStats と一致する', () => {
    for (const p of present(ALL, [1, 2])) {
      const st = windowStats(p)
      const ind = ventLevelsIndependent(p, doorsOf, entryDoorX)
      expect(st.rooms.map((r) => r.level)).toEqual(ind.map((r) => r.level))
    }
  }, GRID_TIMEOUT)
  it('グリッドの総二階・平屋でも一致する（C の10室を含む）', () => {
    for (const p of grid().full) {
      expect(windowStats(p).rooms.map((r) => r.level)).toEqual(ventLevelsIndependent(p, doorsOf, entryDoorX).map((r) => r.level))
    }
  }, GRID_TIMEOUT)
})
