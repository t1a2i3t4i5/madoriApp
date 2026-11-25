import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { findEntry } from './rooms'
import { explainSite, siteCaption, siteLayout, siteStats, type SiteLayout, type SiteRect } from './site'
import { feasibility } from './program'
import { CONDITIONS, PARTIAL_CONDITIONS, SEEDS, quantile } from './testing'
import type { Plan, PlanConfig } from './types'

const POPULAR = [...CONDITIONS.slice(0, 3), ...PARTIAL_CONDITIONS.slice(0, 3)]
const ALL = [...CONDITIONS, ...PARTIAL_CONDITIONS]
const present = (conds: typeof ALL, seeds: readonly number[]): { cfg: PlanConfig; plan: Plan }[] =>
  conds.flatMap(({ cfg }) => seeds.flatMap((s) => generatePlans(cfg, s).map((plan) => ({ cfg, plan }))))

const COMBOS = [0, 1, 2].flatMap((parking) => [0, 1, 2].map((garden) => ({ parking, garden })))

const inside = (outer: SiteRect, r: SiteRect) => r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h
const overlap = (a: SiteRect, b: SiteRect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
/** 辺で接する（面積のある重なりはない） */
const touch = (a: SiteRect, b: SiteRect) =>
  !overlap(a, b) && a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h &&
  ((a.x === b.x + b.w || b.x === a.x + a.w) ? Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y) : Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x))

function parts(L: SiteLayout): { name: string; r: SiteRect }[] {
  return [
    { name: 'building', r: L.building },
    ...L.cars.map((r, i) => ({ name: `car${i}`, r })),
    ...(L.porch ? [{ name: 'porch', r: L.porch }] : []),
    ...L.approach.map((r, i) => ({ name: `approach${i}`, r })),
    ...L.garden.map((r, i) => ({ name: `garden${i}`, r })),
    ...(L.deck ? [{ name: 'deck', r: L.deck }] : []),
  ]
}

describe('siteLayout: 配置の不変条件（全標本×駐車0〜2×庭0〜2）', () => {
  const samples = present(ALL, SEEDS.slice(0, 3))
  it('標本が十分ある', () => {
    expect(samples.length).toBeGreaterThan(100)
  })

  it('敷地が建物・駐車・庭・デッキ・ポーチ・通路・生け垣を内包し、互いに重ならない', () => {
    for (const { plan } of samples) {
      for (const c of COMBOS) {
        const L = siteLayout(plan, c)
        const ps = parts(L)
        for (const p of ps) expect(inside(L.lot, p.r), `${p.name} ${JSON.stringify(c)}`).toBe(true)
        for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
          const a = ps[i], b = ps[j]
          if (a && b) expect(overlap(a.r, b.r), `${a.name} × ${b.name} ${JSON.stringify(c)}`).toBe(false)
        }
        for (const h of L.hedge) {
          expect(h.x1 >= L.lot.x && h.x2 <= L.lot.x + L.lot.w && h.y1 === L.lot.y + L.lot.h).toBe(true)
        }
      }
    }
  })

  it('駐車は玄関の側にあり、台数どおり。ポーチは玄関の南外壁に接し、駐車・通路とつながる', () => {
    for (const { plan } of samples) {
      const entry = findEntry(plan.floors[0]?.rooms ?? [])
      expect(entry).toBeDefined()
      for (const c of COMBOS) {
        const L = siteLayout(plan, c)
        expect(L.cars.length).toBe(c.parking)
        expect(L.side).toBe(entry && entry.x + entry.w / 2 < plan.W / 2 ? 'W' : 'E')
        for (const car of L.cars) {
          if (car.mode === 'side') expect(L.side === 'W' ? car.x + car.w <= 0 : car.x >= plan.W).toBe(true)
          else expect(L.side === 'W' ? car.x >= 0 && car.x + car.w <= plan.W : car.x >= 0 && car.x + car.w <= plan.W).toBe(true)
        }
        const front = L.cars.filter((x) => x.mode === 'front')
        if (front.length > 0) expect(L.side === 'W' ? Math.min(...front.map((x) => x.x)) : Math.max(...front.map((x) => x.x + x.w))).toBe(L.side === 'W' ? 0 : plan.W)
        expect(L.porch).not.toBeNull()
        if (!L.porch || !entry) continue
        expect(L.porch.y).toBe(plan.H)
        expect(L.porch.x >= entry.x && L.porch.x + L.porch.w <= entry.x + entry.w).toBe(true)
        // ポーチ・通路・駐車が1つにつながる（通路は前庭の駐車の上端か、ポーチ直下の列に接する）
        const nodes = [L.porch, ...L.approach, ...L.cars]
        const seen = new Set([0])
        const queue = [0]
        while (queue.length) {
          const i = queue.pop() as number
          for (let j = 0; j < nodes.length; j++) {
            const a = nodes[i], b = nodes[j]
            if (!seen.has(j) && a && b && touch(a, b)) { seen.add(j); queue.push(j) }
          }
        }
        if (c.parking > 0) expect(seen.size, JSON.stringify(c)).toBe(nodes.length)
        else expect(L.approach.length).toBe(1) // 駐車なし: 道路からポーチへの通路
      }
    }
  })

  it('LDK の南面の空き間口は下限（庭なし4・庭あり6。LDK がそれより狭ければその幅）を保ち、庭ありなら LDK の前に庭・デッキがある', () => {
    for (const { plan } of samples) {
      const ldk = plan.floors[0]?.rooms.find((r) => r.type === 'ldk')
      expect(ldk).toBeDefined()
      if (!ldk) continue
      for (const c of COMBOS) {
        const L = siteLayout(plan, c)
        expect(L.ldkFreeFront, JSON.stringify(c)).toBeGreaterThanOrEqual(Math.min(c.garden > 0 ? 6 : 4, ldk.w))
        const front = { x: ldk.x, y: plan.H, w: ldk.w, h: L.frontDepth }
        if (c.garden > 0) {
          expect(L.garden.some((g) => overlap(g, front))).toBe(true)
          expect(L.deck).not.toBeNull()
          if (L.deck) expect(L.deck.x >= ldk.x && L.deck.x + L.deck.w <= ldk.x + ldk.w).toBe(true)
          expect(L.hedge).toEqual([])
        } else {
          expect(L.garden).toEqual([])
          expect(L.deck).toBeNull()
          expect(L.hedge.length).toBe(1)
        }
      }
    }
  })

  it('前庭の駐車が LDK を塞ぐときだけ建物の横へ出し、敷地の間口を台数分広げる', () => {
    for (const { plan } of samples) {
      for (const c of COMBOS) {
        const L = siteLayout(plan, c)
        const nSide = L.cars.filter((x) => x.mode === 'side').length
        const base = siteLayout(plan, { parking: 0, garden: c.garden })
        // 敷地の間口 = 基準 + 6×横付けの台数（庭の回り込みの余白は同じ庭の設定で共通）
        expect(L.lot.w).toBe(base.lot.w + 6 * nSide)
      }
    }
  })

  it('庭は LDK が side と反対の角のときだけ横へ回り込む', () => {
    let wrapped = 0
    for (const { plan } of samples) {
      const ldk = plan.floors[0]?.rooms.find((r) => r.type === 'ldk')
      if (!ldk) continue
      const L = siteLayout(plan, { parking: 1, garden: 1 })
      const corner = L.side === 'W' ? ldk.x + ldk.w === plan.W : ldk.x === 0
      expect(L.wrap).toBe(corner)
      if (L.wrap) wrapped++
      expect(siteLayout(plan, { parking: 1, garden: 0 }).wrap).toBe(false)
    }
    expect(wrapped).toBeGreaterThan(0)
  })

  it('R-IN-07: 駐車・庭を変えると配置・敷地の目安・解説文が必ず変わる', () => {
    for (const { plan } of samples) {
      const keys = new Set(COMBOS.map((c) => JSON.stringify(siteLayout(plan, c))))
      expect(keys.size).toBe(9)
      const texts = new Set(COMBOS.map((c) => explainSite(c, plan)))
      expect(texts.size).toBe(9)
      for (const g of [0, 1, 2]) {
        expect(explainSite({ parking: 0, garden: g }, plan)).not.toBe(explainSite({ parking: 1, garden: g }, plan))
        expect(explainSite({ parking: 1, garden: g }, plan)).not.toBe(explainSite({ parking: 2, garden: g }, plan))
      }
      expect(siteCaption(siteLayout(plan, { parking: 0, garden: 0 }))).not.toBe(siteCaption(siteLayout(plan, { parking: 2, garden: 2 })))
    }
  })

  it('純関数: 入力の案を書き換えず、同じ入力で同じ結果', () => {
    const s = samples[0]
    if (!s) throw new Error('標本なし')
    const before = JSON.stringify(s.plan)
    const a = siteLayout(s.plan, { parking: 2, garden: 2 })
    expect(JSON.stringify(s.plan)).toBe(before)
    expect(siteLayout(s.plan, { parking: 2, garden: 2 })).toEqual(a)
  })
})

describe('explainSite: 当てはまる事実だけを書く', () => {
  const samples = present(POPULAR, [1])
  it('駐車も庭もなければ、LDK の目隠しの文だけ', () => {
    for (const { plan } of samples) expect(explainSite({ parking: 0, garden: 0 }, plan)).toBe('LDK の南は道路に近いため、生け垣などの目隠しを想定しています。')
  })
  it('庭なしのときだけ生け垣、庭ありのときだけ庭・デッキ', () => {
    for (const { plan } of samples) {
      for (const parking of [0, 1, 2]) {
        expect(explainSite({ parking, garden: 0 }, plan)).toContain('生け垣')
        for (const garden of [1, 2]) {
          const t = explainSite({ parking, garden }, plan)
          expect(t).not.toContain('生け垣')
          expect(t).toContain(garden === 2 ? 'LDK は南の広めの庭に面し' : 'LDK は南の小さめの庭に面し')
        }
      }
    }
  })
  it('駐車の文は台数と側を含み、横付けのときだけ「建物の…横」', () => {
    for (const { plan } of samples) {
      for (const c of COMBOS.filter((x) => x.parking > 0)) {
        const L = siteLayout(plan, c)
        const t = explainSite(c, plan)
        expect(t).toContain(`駐車${c.parking}台`)
        expect(t.includes('横')).toBe(L.cars.some((x) => x.mode === 'side'))
      }
    }
  })
})

/** 提示案の標本（窓・直下率の仕様と同じ feasibility グリッド・seed 1。総二階・平屋 207案／部分二階 132案）。生成に ~90 秒かかるので1度だけ作る */
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

const pct = (n: number, d: number) => (d === 0 ? 0 : n / d)

describe('siteStats: 観測の実測（スコア・生成には入れない）', () => {
  const popular = present(POPULAR, SEEDS).map((x) => x.plan)
  const LONG = 600_000

  it('グリッド・人気6条件の分布を出力し、不変条件を検査する', () => {
    const g = grid()
    const rows: string[] = []
    for (const [name, xs] of [['総二階・平屋グリッド', g.full], ['部分二階グリッド', g.part], ['人気6条件×6seed', popular]] as const) {
      for (const c of [{ parking: 1, garden: 1 }, { parking: 2, garden: 0 }, { parking: 2, garden: 1 }, { parking: 2, garden: 2 }, { parking: 0, garden: 1 }]) {
        const ss = xs.map((p) => siteStats(p, c))
        const area = ss.map((s) => s.lotArea)
        const side = ss.filter((s) => s.carMode.side > 0).length
        const free = ss.map((s) => s.ldkFreeFront)
        rows.push(`${name}(${ss.length}案) 駐車${c.parking}/庭${c.garden}: 敷地 中央値${quantile(area, 0.5).toFixed(1)}坪 p10 ${quantile(area, 0.1).toFixed(1)} p90 ${quantile(area, 0.9).toFixed(1)} / 横付けあり ${(pct(side, ss.length) * 100).toFixed(1)}% / LDK空き間口 中央値${quantile(free, 0.5)} 最小${Math.min(...free)} / 隔て率 ${(ss.reduce((a, s) => a + s.ldkScreened, 0) / ss.length).toFixed(3)}`)
        for (const s of ss) {
          expect(s.ldkScreened).toBeGreaterThan(0.999)
          expect(s.carMode.front + s.carMode.side).toBe(c.parking)
          expect(s.ldkFreeFront).toBeGreaterThanOrEqual(c.garden > 0 && c.parking > 0 ? 5 : 4)
        }
      }
    }
    console.log(rows.join('\n'))
    // 実測（GEN_VERSION 8）で固定する退行防止。人気6条件: 1台は横付けなし・2台+庭ありは約8割が横付け、敷地の中央値は 1台+庭小さめ 46.5坪
    const med = (xs: Plan[], c: { parking: number; garden: number }) => quantile(xs.map((p) => siteStats(p, c).lotArea), 0.5)
    const sideRate = (xs: Plan[], c: { parking: number; garden: number }) => pct(xs.filter((p) => siteStats(p, c).carMode.side > 0).length, xs.length)
    expect(sideRate(popular, { parking: 1, garden: 1 })).toBe(0)
    expect(sideRate(popular, { parking: 2, garden: 1 })).toBeGreaterThan(0.75)
    expect(med(popular, { parking: 1, garden: 1 })).toBeGreaterThan(44)
    expect(med(popular, { parking: 1, garden: 1 })).toBeLessThan(49)
    expect(sideRate(g.full, { parking: 2, garden: 1 })).toBeGreaterThan(0.3)
  }, LONG)
})
