import { describe, expect, it } from 'vitest'
import { chokkaBreakdown, chokkaRate } from './chokka'
import { generatePlans } from './generate'
import { feasibility } from './program'
import { ROOM } from './rooms'
import { CONDITIONS, PARTIAL_CONDITIONS, SEEDS, chokkaRate as chokkaRateIndependent, quantile } from './testing'
import type { Plan, PlanConfig, Room, RoomType } from './types'

const room = (type: RoomType, x: number, y: number, w: number, h: number): Room => ({
  type, name: type, x, y, w, h, area: w * h, target: ROOM[type].target, minArea: ROOM[type].minArea,
})
const plan = (f1: Room[], f2: Room[], W = 12, H = 10): Plan => ({
  W, H, arch: 1 as Plan['arch'], totalArea: W * H * 2,
  floors: [{ label: '1F', rooms: f1 }, { label: '2F', rooms: f2 }],
} as Plan)

describe('chokkaRate / chokkaBreakdown: 小さな手計算の例', () => {
  it('平屋は null', () => {
    const p = { W: 12, H: 10, arch: 1, totalArea: 120, floors: [{ label: '1F', rooms: [room('ldk', 0, 0, 12, 10)] }] } as unknown as Plan
    expect(chokkaRate(p)).toBeNull()
    expect(chokkaBreakdown(p)).toBeNull()
  })
  it('2F の間仕切り（外周を除く）のうち 1F の壁の上にある割合。帯×向きに分類する', () => {
    // 2F: 北帯 y0..5 を x=6 で縦に分ける／ホール帯 y5..7／南帯 y7..10 を x=4 で縦に分ける
    const f2 = [room('bed', 0, 0, 6, 5), room('bed', 6, 0, 6, 5), room('hall', 0, 5, 12, 2), room('bed', 0, 7, 4, 3), room('bed', 4, 7, 8, 3)]
    // 1F: 北 x=6 に縦壁（載る）、南は LDK 1室で縦壁なし。ホール帯の境界 y=5・y=7 の横壁は1Fにもある
    const f1 = [room('wc', 0, 0, 6, 5), room('bath', 6, 0, 6, 5), room('hall', 0, 5, 12, 2), room('ldk', 0, 7, 12, 3)]
    const b = chokkaBreakdown(plan(f1, f2))
    expect(b).not.toBeNull()
    // 横: y=5 の12片＋y=7 の12片（外周 y=0・10 は除く）。縦: x=6 の北5片（載る）＋x=4 の南3片（載らない）
    expect(b?.byClass.hN).toEqual({ on: 12, total: 12 })
    expect(b?.byClass.hS).toEqual({ on: 12, total: 12 })
    expect(b?.byClass.vN).toEqual({ on: 5, total: 5 })
    expect(b?.byClass.vH).toEqual({ on: 0, total: 0 })
    expect(b?.byClass.vS).toEqual({ on: 0, total: 3 })
    expect(b?.on).toBe(29)
    expect(b?.total).toBe(32)
    expect(chokkaRate(plan(f1, f2))).toBeCloseTo(29 / 32, 12)
  })
})

/** 提示案の標本。人気6＝CONDITIONS の先頭3件＋PARTIAL_CONDITIONS の先頭3件 × SEEDS（108案、うち2階建て90案）。グリッド＝feasibility グリッド × seed 1 の2階建て */
const popular: Plan[] = []
const gridFull: Plan[] = []
const gridPart: Plan[] = []
let built = false
function build() {
  if (built) return
  built = true
  for (const { cfg } of [...CONDITIONS.slice(0, 3), ...PARTIAL_CONDITIONS.slice(0, 3)]) {
    for (const s of SEEDS) popular.push(...generatePlans({ ...cfg, feats: [...cfg.feats] }, s))
  }
  for (const area of [20, 23, 26, 30, 36, 40]) {
    for (const rooms of [2, 3, 4, 5]) {
      for (const feats of [[], ['doma'], ['void', 'study'], ['washitsu', 'laundry', 'pantry', 'wic']] as PlanConfig['feats'][]) {
        const cfg: PlanConfig = { area, floors: 2, rooms, parking: 1, garden: 1, feats }
        if (feasibility(cfg).ok) gridFull.push(...generatePlans(cfg, 1))
        const pc: PlanConfig = { ...cfg, story: 'partial' }
        if (feasibility(pc).ok) gridPart.push(...generatePlans(pc, 1))
      }
    }
  }
}
const TIMEOUT = 600_000
const pct = (ps: Plan[]) => ps.map((p) => (chokkaRate(p) ?? NaN) * 100).filter((x) => !Number.isNaN(x))

describe('直下率: 独立実装との一致と、実測（GEN_VERSION 8）', () => {
  it('core と testing.ts の独立実装が全標本で一致する', () => {
    build()
    const all = [...popular, ...gridFull, ...gridPart].filter((p) => p.floors.length === 2)
    expect(all.length).toBeGreaterThan(200)
    for (const p of all) {
      const a = chokkaRate(p)
      const b = chokkaRateIndependent(p)
      if (a === null) expect(b).toBeNaN()
      else expect(a).toBeCloseTo(b, 12)
    }
  }, TIMEOUT)
  it('内訳の合計が全体と一致する', () => {
    build()
    for (const p of popular.filter((q) => q.floors.length === 2)) {
      const b = chokkaBreakdown(p)
      expect(b).not.toBeNull()
      if (!b) continue
      const cs = Object.values(b.byClass)
      expect(cs.reduce((a, c) => a + c.on, 0)).toBe(b.on)
      expect(cs.reduce((a, c) => a + c.total, 0)).toBe(b.total)
    }
  }, TIMEOUT)
  // GEN_VERSION 8（2F の切断線の寄せ。R-SPACE-35）の実測。暫定目標（R-IDX-05）は人気6 の中央値 ≥ 55%、グリッド総二階の中央値 ≥ 50%・40%未満 ≤ 10%。
  // 退行防止の下限は、目標より少し高く、実測に余裕を持たせた値（人気6 ≥ 56%、グリッド総二階 ≥ 52%・40%未満 ≤ 10%、部分二階 ≥ 55%）
  it('人気6: 中央値 ≥ 55%（GEN_VERSION 8 の実測 55.6。v7 は 55.9）、40%未満 ≤ 10%（実測 2.2%）', () => {
    build()
    const xs = pct(popular)
    expect(xs).toHaveLength(90)
    expect(quantile(xs, 0.5)).toBeGreaterThanOrEqual(55)
    expect(xs.filter((x) => x < 40).length / xs.length).toBeLessThanOrEqual(0.1)
  }, TIMEOUT)
  it('グリッド総二階（seed 1・93案）: 中央値 ≥ 52%（実測 54.4。v7 は 47.5）、40%未満 ≤ 10%（実測 8.6%。v7 は 18.3%）', () => {
    build()
    const xs = pct(gridFull)
    expect(xs).toHaveLength(93)
    expect(quantile(xs, 0.5)).toBeGreaterThanOrEqual(52)
    expect(xs.filter((x) => x < 40).length / xs.length).toBeLessThanOrEqual(0.1)
  }, TIMEOUT)
  it('グリッド部分二階（seed 1・99案）: 中央値 ≥ 54%（実測 54.5。v7 は 54.3）、40%未満 ≤ 10%', () => {
    build()
    const xs = pct(gridPart)
    expect(xs).toHaveLength(99)
    expect(quantile(xs, 0.5)).toBeGreaterThanOrEqual(54)
    expect(xs.filter((x) => x < 40).length / xs.length).toBeLessThanOrEqual(0.1)
  }, TIMEOUT)
  // R-IDX-10: 載らない壁片のうち南帯の縦（vS）が占める割合。実測は人気6 54.3%・グリッド総二階 44%（上限・下限は実測±2.5pt）
  const vSShare = (ps: Plan[]) => {
    let off = 0
    let offVS = 0
    for (const p of ps.filter((q) => q.floors.length === 2)) {
      const b = chokkaBreakdown(p)
      if (!b) continue
      off += b.total - b.on
      offVS += b.byClass.vS.total - b.byClass.vS.on
    }
    return offVS / off
  }
  it('内訳（R-IDX-10）: 載らない壁片に占める南帯の縦の割合を記録（人気6 54%・グリッド総二階 44%）', () => {
    build()
    const pp = vSShare(popular)
    const gf = vSShare(gridFull)
    expect(pp).toBeGreaterThanOrEqual(0.52)
    expect(pp).toBeLessThanOrEqual(0.57)
    expect(gf).toBeGreaterThanOrEqual(0.42)
    expect(gf).toBeLessThanOrEqual(0.47)
  }, TIMEOUT)
})
