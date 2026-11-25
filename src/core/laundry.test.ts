import { describe, expect, it } from 'vitest'
import { backDoorCandidates, BACKDOOR_W } from './backdoor'
import { computeDoors } from './derive'
import { gridFullSample, gridPartSample } from './fixtureSamples'
import { GEN_VERSION, generatePlans } from './generate'
import { laundryRoutes, laundryStats, type LaundryStats } from './laundry'
import { siteLayout, siteStats, DRY_D, DRY_L, type SiteRect } from './site'
import { CONDITIONS, PARTIAL_CONDITIONS, SEEDS, laundryIndependent, quantile } from './testing'
import type { Plan, PlanConfig } from './types'

const POPULAR = [...CONDITIONS.slice(0, 3), ...PARTIAL_CONDITIONS.slice(0, 3)]
const CFG = { parking: 1, garden: 1 }
type Item = { cfg: Pick<PlanConfig, 'parking' | 'garden'>; plan: Plan }

const popular: Item[] = POPULAR.flatMap(({ cfg }) => SEEDS.flatMap((s) => generatePlans(cfg, s).map((plan) => ({ cfg: { parking: cfg.parking, garden: cfg.garden }, plan }))))
const full: Item[] = gridFullSample().plans.map((plan) => ({ cfg: CFG, plan }))
const part: Item[] = gridPartSample().plans.map((plan) => ({ cfg: CFG, plan }))

const rate = (n: number, d: number) => (d === 0 ? 0 : n / d)
const overlap = (a: SiteRect, b: SiteRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const stats = (xs: Item[]) => xs.map(({ cfg, plan }) => laundryStats(plan, cfg))
const med = (xs: LaundryStats[], f: (s: LaundryStats) => number | undefined) => quantile(xs.map(f).filter((v): v is number => v !== undefined), 0.5)

describe('標本 fixture の版', () => {
  it('gen-v9.json・gen-v9-partial.json の genVersion が現在の GEN_VERSION と一致する', () => {
    expect(gridFullSample().genVersion).toBe(GEN_VERSION)
    expect(gridPartSample().genVersion).toBe(GEN_VERSION)
  })
})

describe('laundryStats: 洗濯動線の観測（生成・スコアには効かない）', () => {
  const sets: [string, Item[], { cover: number; dryMaxM: number }][] = [
    ['人気6条件×6seed', popular, { cover: 0.9, dryMaxM: 4.6 }],
    ['グリッド総二階・平屋', full, { cover: 0.88, dryMaxM: 4.0 }],
    ['グリッド部分二階', part, { cover: 0.97, dryMaxM: 4.0 }],
  ]
  for (const [name, xs, th] of sets) {
    it(`${name}: 庭へは全案 LDK を横切る（構造の不変条件）。勝手口は大半の案に付き、干す場所までは庭の約4割の長さ`, () => {
      const ss = stats(xs)
      expect(ss.length).toBeGreaterThan(50)
      for (const s of ss) {
        expect(s.toGarden?.crossesLdk).toBe(true)
        expect(s.toGarden?.floors).toBe(0) // 1F の洗濯機から 1F の庭
      }
      const withBack = ss.filter((s) => s.backDoor !== null)
      expect(rate(withBack.length, ss.length)).toBeGreaterThanOrEqual(th.cover)
      // 勝手口があれば、干す場所は勝手口（庭ではない）。なければ庭
      for (const s of ss) expect(s.toDry).toBe(s.backDoor ? s.toDry : s.toGarden)
      const dry = med(ss, (s) => s.toDry?.len)
      const garden = med(ss, (s) => s.toGarden?.len)
      expect(dry * 0.455).toBeLessThanOrEqual(th.dryMaxM)
      expect(dry).toBeLessThan(garden * 0.6)
      // LDK を横切らない案が大半
      expect(rate(withBack.filter((s) => s.toDry?.crossesLdk).length, withBack.length)).toBeLessThan(0.15)
      // 個室は通らない（勝手口経由）
      expect(withBack.filter((s) => s.toDry?.crossesPrivate).length).toBe(0)
      console.log(`${name}(${ss.length}案): 勝手口 ${(rate(withBack.length, ss.length) * 100).toFixed(1)}%（B ${ss.filter((s) => s.backDoor === 'B').length}・C ${ss.filter((s) => s.backDoor === 'C').length}）/ 庭まで 中央値 ${(garden * 0.455).toFixed(1)}m / 干す場所まで 中央値 ${(dry * 0.455).toFixed(1)}m p90 ${(quantile(ss.map((s) => s.toDry?.len ?? NaN).filter((v) => !isNaN(v)), 0.9) * 0.455).toFixed(1)}m / しまう 中央値 ${(med(ss, (s) => s.dryToMaster?.len) * 0.455).toFixed(1)}m / 洗面に LDK からしか入れない ${(rate(ss.filter((s) => s.washOnlyFromLdk).length, ss.length) * 100).toFixed(1)}%`)
    })
  }

  it('庭までの中央値が実測（人気6 9.4m・グリッド 9.6m・部分二階 8.4m）の近くにある', () => {
    expect(med(stats(popular), (s) => s.toGarden?.len) * 0.455).toBeGreaterThan(8.5)
    expect(med(stats(popular), (s) => s.toGarden?.len) * 0.455).toBeLessThan(10.3)
    expect(med(stats(full), (s) => s.toGarden?.len) * 0.455).toBeGreaterThan(8.7)
    expect(med(stats(full), (s) => s.toGarden?.len) * 0.455).toBeLessThan(10.5)
    expect(med(stats(part), (s) => s.toGarden?.len) * 0.455).toBeGreaterThan(7.5)
    expect(med(stats(part), (s) => s.toGarden?.len) * 0.455).toBeLessThan(9.3)
  })

  it('しまう（干す場所 → 主寝室）は、主寝室が 2F にあれば階をまたぐ', () => {
    for (const { cfg, plan } of [...popular, ...full, ...part]) {
      const s = laundryStats(plan, cfg)
      const ind = laundryIndependent(plan, computeDoors)
      if (ind.masterFloor === null || !s.dryToMaster) continue
      expect(s.dryToMaster.floors > 0, `${plan.W}x${plan.H}`).toBe(ind.masterFloor > 0)
    }
  })

  it('独立実装（セル格子・幅優先探索）と、洗濯機の部屋・勝手口の候補・洗面の入口・LDK を通る必要が一致する', () => {
    let crossNeeded = 0
    for (const { cfg, plan } of [...popular, ...full, ...part]) {
      const s = laundryStats(plan, cfg)
      const ind = laundryIndependent(plan, computeDoors)
      const r = laundryRoutes(plan, cfg)
      expect(s.washer).toBe(ind.washer)
      expect(s.washOnlyFromLdk).toBe(ind.washOnlyFromLdk)
      expect(r.B !== null).toBe(ind.candB)
      expect(r.C !== null).toBe(ind.candC)
      expect(r.F !== null).toBe(ind.washer === 'laundry')
      expect(s.indoorDry).toBe(ind.washer === 'laundry')
      if (ind.mustCrossLdk && r.C) { crossNeeded++; expect(r.C.crossesLdk).toBe(true) }
      if (s.backDoor === 'B') expect(ind.candB).toBe(true)
      if (s.backDoor === 'C') expect(ind.candC).toBe(true)
    }
    expect(crossNeeded).toBeGreaterThan(0)
  })

  it('洗濯機の部屋は、ランドリーがあればランドリー、なければ洗面。室内干しはランドリーのときだけ', () => {
    for (const { cfg, plan } of [...popular, ...full, ...part]) {
      const rooms = plan.floors[0]?.rooms ?? []
      const s = laundryStats(plan, cfg)
      expect(s.washer).toBe(rooms.some((r) => r.type === 'laundry') ? 'laundry' : 'wash')
    }
    expect(full.some((x) => laundryStats(x.plan, x.cfg).indoorDry)).toBe(true)
  })

  it('純関数: 入力の案を書き換えず、同じ入力で同じ結果。生成の入力（駐車・庭）以外の cfg は見ない', () => {
    const x = full[0]
    if (!x) throw new Error('標本なし')
    const before = JSON.stringify(x.plan)
    const a = laundryStats(x.plan, x.cfg)
    expect(JSON.stringify(x.plan)).toBe(before)
    expect(laundryStats(x.plan, x.cfg)).toEqual(a)
  })
})

describe('勝手口と物干し場の導出（R-FLOW-07・R-IN-09）', () => {
  const COMBOS = [0, 1, 2].flatMap((parking) => [0, 1, 2].map((garden) => ({ parking, garden })))
  const samples = [...popular.slice(0, 40), ...full.slice(0, 60), ...part.slice(0, 40)]

  it('勝手口は洗濯機の部屋か 1F ホールの東西の外壁（接触 2 以上）にあり、駐車と反対の側が先に候補になる', () => {
    let both = 0
    for (const { plan } of samples) {
      for (const parkSide of ['W', 'E'] as const) {
        const cs = backDoorCandidates(plan, parkSide)
        for (const c of cs) {
          expect(c.w).toBe(BACKDOOR_W)
          expect(c.side === 'W' ? c.room.x === 0 && c.x === 0 : c.room.x + c.room.w === plan.W && c.x === plan.W).toBe(true)
          expect(c.y - BACKDOOR_W / 2 >= c.room.y && c.y + BACKDOOR_W / 2 <= c.room.y + c.room.h).toBe(true)
          expect(c.room.type === (c.kind === 'B' ? c.room.type : 'hall')).toBe(true)
        }
        // B が C より先。同じ種別の中では駐車と反対の側が先
        const kinds = cs.map((c) => c.kind).join('')
        expect(kinds).toBe([...kinds].sort().join(''))
        for (const k of ['B', 'C'] as const) {
          const ks = cs.filter((c) => c.kind === k)
          if (ks.length === 2) { both++; expect(ks[0]?.side).not.toBe(parkSide) }
        }
      }
    }
    expect(both).toBeGreaterThan(0)
  })

  it('物干し場は勝手口の外の建物の横（奥行4・長さ最大6）。建物・駐車・庭・デッキ・ポーチ・通路と重ならず、敷地に収まる', () => {
    let placed = 0, widened = 0
    for (const { plan } of samples) {
      for (const c of COMBOS) {
        const L = siteLayout(plan, c)
        expect(L.drying === null).toBe(L.backDoor === null)
        if (!L.drying || !L.backDoor) continue
        placed++
        const d = L.drying
        expect(d.w).toBe(DRY_D)
        expect(d.h).toBeLessThanOrEqual(DRY_L)
        expect(d.h).toBeGreaterThanOrEqual(2)
        expect(d.x).toBe(L.backDoor.side === 'W' ? -DRY_D : plan.W)
        expect(d.y >= 0 && d.y + d.h <= plan.H).toBe(true) // 建物の南端を超えない
        // 勝手口の位置が物干し場の長さの範囲にある
        expect(L.backDoor.y >= d.y && L.backDoor.y <= d.y + d.h).toBe(true)
        expect(d.x >= L.lot.x && d.x + d.w <= L.lot.x + L.lot.w).toBe(true)
        const others = [L.building, ...L.cars, ...(L.porch ? [L.porch] : []), ...L.approach, ...L.garden, ...(L.deck ? [L.deck] : [])]
        for (const o of others) expect(overlap(d, o), JSON.stringify(c)).toBe(false)
        if (L.lotWidenByDrying > 0) widened++
        // その側の余白は DRY_D 以上。広げたときはちょうど DRY_D（広げ幅 = DRY_D − 元の余白 > 0）
        const margin = L.backDoor.side === 'W' ? -L.lot.x : L.lot.x + L.lot.w - plan.W
        expect(margin).toBeGreaterThanOrEqual(DRY_D)
        if (L.lotWidenByDrying > 0) expect(margin).toBe(DRY_D)
      }
    }
    expect(placed).toBeGreaterThan(300)
    expect(widened).toBeGreaterThan(0)
  })

  it('庭の入力とは独立に物干し場を置く（庭なしでも置く）。駐車・庭を変えても勝手口の候補は同じ', () => {
    for (const { plan } of samples.slice(0, 40)) {
      const g0 = siteLayout(plan, { parking: 1, garden: 0 })
      const g1 = siteLayout(plan, { parking: 1, garden: 1 })
      expect(g0.drying === null).toBe(g1.drying === null)
      if (g0.drying) expect(g0.drying).toEqual(g1.drying)
    }
  })

  it('横付けの駐車と y が重なる側には置かない（反対の側へ回る）', () => {
    for (const { plan } of samples) {
      const L = siteLayout(plan, { parking: 2, garden: 1 })
      const sides = L.cars.filter((c) => c.mode === 'side')
      if (!L.drying || sides.length === 0) continue
      for (const c of sides) expect(overlap(L.drying, c)).toBe(false)
    }
  })

  it('siteStats に dryingSide・lotWidenByDrying を観測として足す。生成・コア部屋は変わらない', () => {
    for (const { plan, cfg } of full.slice(0, 40)) {
      const s = siteStats(plan, cfg)
      const L = siteLayout(plan, cfg)
      expect(s.dryingSide).toBe(L.drying && L.backDoor ? L.backDoor.side : null)
      expect(s.lotWidenByDrying).toBe(L.lotWidenByDrying)
      expect(L.lot.w - L.lotWidenByDrying).toBeGreaterThan(0)
    }
  })
})
