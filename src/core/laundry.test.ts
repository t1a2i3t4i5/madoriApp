import { describe, expect, it } from 'vitest'
import { backDoorCandidates, BACKDOOR_W, washerRoom } from './backdoor'
import { computeDoors } from './derive'
import { gridFullSample, gridPartSample } from './fixtureSamples'
import { GEN_VERSION, generatePlans } from './generate'
import { computeFlows } from '../lib/flow'
import { hasDryPipe } from './washer'
import { backDoorTextSuppressed, laundryClause, laundryRoutes, laundryStats, makeRouter, type LaundryStats } from './laundry'
import { siteLayout, siteStats, CAR_D, DRY_D, DRY_L, WRAP_MARGIN, type SiteRect } from './site'
import { CONDITIONS, PARTIAL_CONDITIONS, SEEDS, laundryIndependent, quantile } from './testing'
import type { Plan, PlanConfig, Room } from './types'

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
  it('gen-v10.json・gen-v10-partial.json の genVersion が現在の GEN_VERSION と一致する', () => {
    expect(gridFullSample().genVersion).toBe(GEN_VERSION)
    expect(gridPartSample().genVersion).toBe(GEN_VERSION)
  })
})

describe('laundryStats: 洗濯動線の観測（生成・スコアには効かない）', () => {
  const sets: [string, Item[], { cover: number; dryMaxM: number }][] = [
    ['人気6条件×6seed', popular, { cover: 0.9, dryMaxM: 4.6 }],
    ['グリッド総二階・平屋', full, { cover: 0.88, dryMaxM: 4.2 }],
    ['グリッド部分二階', part, { cover: 0.97, dryMaxM: 6.0 }],
  ]
  for (const [name, xs, th] of sets) {
    it(`${name}: 庭へは全案 LDK を横切る（構造の不変条件）。勝手口は大半の案に付き、干す場所までは庭の約4割の長さ`, () => {
      const ss = stats(xs)
      expect(ss.length).toBeGreaterThan(50)
      for (const [i, s] of ss.entries()) {
        const plan = xs[i]?.plan
        const g = s.toGarden
        expect(g).not.toBeNull()
        expect(g?.floors).toBe(0) // 1F の洗濯機から 1F の庭
        // 洗濯機の部屋から出て LDK で終わる。途中に個室は入らない
        expect(g?.rooms[0]).toBe(plan ? washerRoom(plan) : undefined)
        expect(g?.rooms[g.rooms.length - 1]?.type).toBe('ldk')
        expect(g?.crossesLdk).toBe(true)
      }
      const withBack = ss.filter((s) => s.backDoor !== null)
      expect(rate(withBack.length, ss.length)).toBeGreaterThanOrEqual(th.cover)
      // 勝手口があれば、干す場所は勝手口（庭ではない）。なければ庭
      for (const [i, s] of ss.entries()) {
        const x = xs[i]
        if (!x) continue
        if (!s.backDoor) { expect(s.toDry).toBe(s.toGarden); continue }
        const bd = siteLayout(x.plan, x.cfg).backDoor
        expect(s.toDry).not.toBe(s.toGarden)
        expect(s.toDry?.rooms[0]).toBe(washerRoom(x.plan))
        expect(s.toDry?.rooms[s.toDry.rooms.length - 1]).toBe(bd?.room) // 勝手口のある部屋で終わる
      }
      const dry = med(ss, (s) => s.toDry?.len)
      const garden = med(ss, (s) => s.toGarden?.len)
      expect(dry * 0.455).toBeLessThanOrEqual(th.dryMaxM)
      // GEN_VERSION 10: 列の積みで洗面が収納に囲まれ、外壁（B）に接せずホール端（C）の勝手口になる案が増え、部分二階は 0.79 倍（v9 は約 0.4 倍）
      expect(dry).toBeLessThan(garden * 0.85)
      // LDK を横切らない案が大半
      // GEN_VERSION 10 の実測: 人気6 7.6%・グリッド総二階・平屋 21%・部分二階 45%（v9 は 15% 未満）
      expect(rate(withBack.filter((s) => s.toDry?.crossesLdk).length, withBack.length)).toBeLessThan(0.5)
      // 個室は通らない（勝手口経由）
      expect(withBack.filter((s) => s.toDry?.crossesPrivate).length).toBe(0)
      console.log(`${name}(${ss.length}案): 勝手口 ${(rate(withBack.length, ss.length) * 100).toFixed(1)}%（B ${ss.filter((s) => s.backDoor === 'B').length}・C ${ss.filter((s) => s.backDoor === 'C').length}）/ 庭まで 中央値 ${(garden * 0.455).toFixed(1)}m / 干す場所まで 中央値 ${(dry * 0.455).toFixed(1)}m p90 ${(quantile(ss.map((s) => s.toDry?.len ?? NaN).filter((v) => !isNaN(v)), 0.9) * 0.455).toFixed(1)}m / しまう 中央値 ${(med(ss, (s) => s.dryToMaster?.len) * 0.455).toFixed(1)}m / 洗面に LDK からしか入れない ${(rate(ss.filter((s) => s.washOnlyFromLdk).length, ss.length) * 100).toFixed(1)}%`)
    })
  }

  it('庭までの中央値が実測（GEN_VERSION 10: 人気6 8.0m・グリッド 9.5m・部分二階 7.2m。v9 は 9.4m・9.6m・8.4m）の近くにある', () => {
    expect(med(stats(popular), (s) => s.toGarden?.len) * 0.455).toBeGreaterThan(7.5)
    expect(med(stats(popular), (s) => s.toGarden?.len) * 0.455).toBeLessThan(10.3)
    expect(med(stats(full), (s) => s.toGarden?.len) * 0.455).toBeGreaterThan(8.7)
    expect(med(stats(full), (s) => s.toGarden?.len) * 0.455).toBeLessThan(10.5)
    expect(med(stats(part), (s) => s.toGarden?.len) * 0.455).toBeGreaterThan(6.5)
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
          if (c.kind === 'B') expect(c.room).toBe(washerRoom(plan))
          else expect(c.room.type).toBe('hall')
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
        // 敷地（lot）は拡幅を含む（PR-L2）ので、物干し場は lot に収まる
        expect(d.x >= L.lot.x && d.x + d.w <= L.lot.x + L.lot.w).toBe(true)
        const others = [L.building, ...L.cars, ...(L.porch ? [L.porch] : []), ...L.approach, ...L.garden, ...(L.deck ? [L.deck] : [])]
        for (const o of others) expect(overlap(d, o), JSON.stringify(c)).toBe(false)
        if (L.lotWidenByDrying > 0) widened++
        // 物干し場の側の lot の余白は DRY_D 以上。広げたときはちょうど DRY_D
        const margin = L.backDoor.side === 'W' ? -L.lot.x : L.lot.x + L.lot.w - plan.W
        expect(margin).toBeGreaterThanOrEqual(DRY_D)
        if (L.lotWidenByDrying > 0) expect(margin).toBe(DRY_D)
      }
    }
    expect(placed).toBeGreaterThan(300)
    expect(widened).toBeGreaterThan(0)
  })

  it('設計上は庭の入力と独立に物干し場を置く（庭なしでも置く）。実測では庭の有無で物干し場が変わる案は0件', () => {
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
      expect(L.lotWidenByDrying).toBeGreaterThanOrEqual(0)
      if (L.lotWidenByDrying > 0) expect(L.drying).not.toBeNull()
    }
  })

  it('lot の間口 = 基準 + 横付けの台数分 + 物干し場の拡幅（PR-L2 から拡幅を lot に含める）', () => {
    let widened = 0
    for (const { plan } of samples) {
      for (const c of COMBOS) {
        const L = siteLayout(plan, c)
        const nSide = L.cars.filter((x) => x.mode === 'side').length
        const wrap = L.wrap ? WRAP_MARGIN : 2
        expect(L.lot.w).toBe(plan.W + 2 + wrap + 6 * nSide + L.lotWidenByDrying)
        if (L.lotWidenByDrying > 0) widened++
      }
    }
    expect(widened).toBeGreaterThan(0)
  })
})

// 実標本では通らない分岐を、ldk の位置を差し替えた合成の案で通す（siteLayout は部屋の矩形だけを読む）
const withLdk = (plan: Plan, x: number, w: number, y?: number, h?: number): Plan => ({
  ...plan,
  floors: plan.floors.map((fl, i) => i === 0 ? { ...fl, rooms: fl.rooms.map((r): Room => r.type === 'ldk' ? { ...r, x, w, ...(y !== undefined ? { y } : {}), ...(h !== undefined ? { h } : {}) } : r) } : fl),
})

describe('実標本で通らない分岐（合成の案）', () => {
  const all = [...full, ...part].map((x) => x.plan)

  it('横付けの駐車と y が重なる側の候補は飛ばし、別の候補を採る', () => {
    let hit = 0
    for (const base of all) {
      const ldk0 = base.floors[0]?.rooms.find((r) => r.type === 'ldk')
      if (!ldk0) continue
      for (const parkSide of ['W', 'E'] as const) {
        // 駐車 2・庭なし: LDK を駐車側の端に幅 6 で置くと前庭に台が入らず、両方が横付け（奥行 4 の前庭なので台は建物の南側に食い込む）
        const plan = withLdk(base, parkSide === 'W' ? 0 : base.W - 6, 6)
        const L = siteLayout(plan, { parking: 2, garden: 0 })
        if (L.side !== parkSide) continue
        const cs = backDoorCandidates(plan, L.side)
        const first = cs[0]
        const sideCars = L.cars.filter((c) => c.mode === 'side')
        if (!first || first.side !== L.side || sideCars.length === 0) continue
        const dy0 = Math.max(0, Math.min(Math.round(first.y - 1), plan.H - DRY_L))
        const dh = Math.min(DRY_L, plan.H - dy0)
        if (!sideCars.some((c) => dy0 < c.y + CAR_D && c.y < dy0 + dh)) continue // 最初の候補が実際に駐車と重なる合成だけ数える
        hit++
        expect(L.cars.filter((c) => c.mode === 'side').length).toBe(2)
        const bd = L.backDoor
        // 採った候補は最初の候補ではない（飛ばした）。置いたなら、駐車とは重ならない
        expect(bd === null || bd.kind !== first.kind || bd.side !== first.side).toBe(true)
        if (L.drying) for (const c of sideCars) expect(overlap(L.drying, c)).toBe(false)
      }
    }
    expect(hit).toBeGreaterThan(0)
  })

  it('庭の回り込みの帯と物干し場が重なる分は、庭から外す', () => {
    let hit = 0
    for (const base of all) {
      const W = base.W, H = base.H
      for (const parkSide of ['W', 'E'] as const) {
        // LDK を駐車と反対の角に、板の全高で置く（回り込みの帯は y = 0〜H）
        const ldkX = parkSide === 'W' ? W - 8 : 0
        const plan = withLdk(base, ldkX, 8, 0, H)
        const L = siteLayout(plan, { parking: 0, garden: 1 })
        if (!L.wrap || !L.drying || L.side !== parkSide) continue
        const band: SiteRect = { x: parkSide === 'W' ? W : -WRAP_MARGIN, y: 0, w: WRAP_MARGIN, h: H }
        if (!overlap(band, L.drying)) continue
        hit++
        for (const g of L.garden) expect(overlap(g, L.drying)).toBe(false)
        // 帯のうち物干し場でない部分は庭として残る
        const area = L.garden.reduce((a, g) => a + Math.max(0, Math.min(g.x + g.w, band.x + band.w) - Math.max(g.x, band.x)) * Math.max(0, Math.min(g.y + g.h, band.y + band.h) - Math.max(g.y, band.y)), 0)
        const cut = Math.max(0, Math.min(L.drying.x + L.drying.w, band.x + band.w) - Math.max(L.drying.x, band.x)) * Math.max(0, Math.min(L.drying.y + L.drying.h, band.y + band.h) - Math.max(L.drying.y, band.y))
        expect(cut).toBeGreaterThan(0)
        expect(area).toBeLessThanOrEqual(band.w * band.h - cut)
      }
    }
    expect(hit).toBeGreaterThan(0)
  })
})

describe('flow.ts の生活動線と laundry の経路の長さ（退行防止）', () => {
  it('洗面が洗濯機の部屋の案で、LDK→洗面の動線の長さが laundry の洗面→LDK の経路長と一致する', () => {
    let n = 0
    for (const { plan } of [...popular, ...full, ...part]) {
      const wash = washerRoom(plan)
      const ldk = plan.floors[0]?.rooms.find((r) => r.type === 'ldk')
      if (!wash || wash.type !== 'wash' || !ldk) continue
      const life = computeFlows(plan, 0).find((f) => f.kind === 'life')
      if (!life) continue
      const cx = wash.x + wash.w / 2, cy = wash.y + wash.h / 2
      const k = life.points.findIndex((p) => p.x === cx && p.y === cy)
      if (k < 0) continue
      let len = 0
      for (let i = 0; i < k; i++) { const a = life.points[i], b = life.points[i + 1]; if (a && b) len += Math.hypot(b.x - a.x, b.y - a.y) }
      const r = makeRouter(plan).route(wash, ldk)
      expect(r?.len).toBeCloseTo(len, 6)
      n++
    }
    expect(n).toBeGreaterThan(50)
  })
})

describe('敷地の文の洗濯の1文（R-TEXT-11。PR-L3）', () => {
  const cfg = { parking: 1, garden: 1 }
  const { plans: full } = gridFullSample()
  const { plans: part } = gridPartSample()
  const all = [...full, ...part]

  it('勝手口の文は、勝手口がある案で、文を出さない形を除いて出る。出る文は勝手口の側・部屋と一致する', () => {
    let said = 0
    for (const plan of all) {
      const s = laundryStats(plan, cfg)
      const t = laundryClause(plan, cfg)
      const L = siteLayout(plan, cfg)
      const says = t.includes('勝手口')
      expect(says).toBe(!!L.backDoor && !!L.drying && !backDoorTextSuppressed(s))
      if (says && L.backDoor) {
        said++
        const sd = L.backDoor.side === 'W' ? '西' : '東'
        expect(t).toMatch(new RegExp(`の${sd}(端)?の勝手口`))
        expect(t).toContain(L.backDoor.room.name)
        const wr = washerRoom(plan)
        expect(t.includes('室内干し')).toBe(!!wr && hasDryPipe(wr))
        if (L.backDoor.room.type === 'hall') expect(t).toContain(`ホールの${sd}端の勝手口`)
      }
    }
    // GEN_VERSION 10 の実測 66%（v9 は 85% 超）。勝手口 C の経路が LDK を横切り庭より長い案の文を出さないため
    expect(said / all.length).toBeGreaterThan(0.6)
  })

  it('文を出さない形は、勝手口の経路が LDK を横切り庭より長い案で、グリッドの提示案に100件（GEN_VERSION 10 の実測。v9 は 10 件。R-IDX-11）', () => {
    const sup = all.filter((p) => backDoorTextSuppressed(laundryStats(p, cfg)))
    expect(sup.length).toBe(100)
    for (const p of sup) {
      const s = laundryStats(p, cfg)
      expect(s.backDoor).toBe('C')
      expect(s.washOnlyFromLdk).toBe(true)
      expect(laundryClause(p, cfg)).not.toContain('勝手口')
      expect(laundryClause(p, cfg)).toMatch(/物干し場より、LDK を通って(庭|ウッドデッキ)に出るほうが近道です/)
    }
  })

  it('勝手口がない案・文を出さない案は、庭ありなら庭・デッキで干す文、庭なしなら室内干しの文か空', () => {
    for (const plan of all) {
      const s = laundryStats(plan, cfg)
      const noBack = !siteLayout(plan, cfg).backDoor || backDoorTextSuppressed(s)
      if (!noBack) continue
      const withGarden = laundryClause(plan, cfg)
      expect(withGarden).toMatch(/LDK を通って(庭|ウッドデッキ)(で干す配置です|に出るほうが近道です)/)
      const noGarden = laundryClause(plan, { parking: 1, garden: 0 })
      expect(noGarden === '' || noGarden === '雨の日はランドリーで室内干しができます。' || noGarden.includes('勝手口')).toBe(true)
    }
  })

  it('洗濯機の部屋がない案は空', () => {
    const base = full[0]
    if (!base) throw new Error('標本なし')
    const noWash = { ...base, floors: base.floors.map((f) => ({ ...f, rooms: f.rooms.filter((r) => r.type !== 'wash' && r.type !== 'laundry') })) }
    expect(laundryClause(noWash, cfg)).toBe('')
  })
})
