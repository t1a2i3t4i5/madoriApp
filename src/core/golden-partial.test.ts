/// <reference types="node" />
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { GEN_VERSION, candidatePool, generatePlans } from './generate'
import { diagnoseEmpty, feasibility } from './program'
import { planName, planTags } from './describe'
import { explainPlan } from './explain'
import { planKey } from './enumerate'
import { PARTIAL_CONDITIONS, SEEDS, canon, chokkaRate, hallRatioIndependent, quantile, stairViolations } from './testing'
import type { PlanConfig, ScoredPlan } from './types'

/**
 * 部分二階のスナップショット（__fixtures__/gen-v<GEN_VERSION>-partial.json）。総二階の gen-v<GEN_VERSION>.json とは別ファイルで、
 * 同じ仕組み: 更新は
 *   UPDATE_GOLDEN=1 npx vitest run src/core/golden-partial.test.ts
 * fixture の genVersion が現在の GEN_VERSION と同じで中身だけ違う場合は書き込みを拒否する（UPDATE_GOLDEN=force のときだけ許可）。
 * 部分二階の生成を意図して変えたときは GEN_VERSION を上げること。
 */
const FIXTURE = new URL(`./__fixtures__/gen-v${GEN_VERSION}-partial.json`, import.meta.url)
const FIXTURE_V4 = new URL('./__fixtures__/gen-v4-partial.json', import.meta.url)
const FIXTURE_V6 = new URL('./__fixtures__/gen-v6-partial.json', import.meta.url)
const FIXTURE_V7 = new URL('./__fixtures__/gen-v7-partial.json', import.meta.url)
const FIXTURE_V7_F1 = new URL('./__fixtures__/gen-v7-f1sig.json', import.meta.url)
const FIXTURE_V5 = new URL('./__fixtures__/gen-v5-partial.json', import.meta.url)
const FIXTURE_V5_STAIRS = new URL('./__fixtures__/gen-v5-partial-grid-stairs.json', import.meta.url)

const copy = (cfg: PlanConfig): PlanConfig => ({ ...cfg, feats: [...cfg.feats] })

/** 0案になる境界（診断の経路）も固定する */
const ALL: { name: string; cfg: PlanConfig }[] = [
  ...PARTIAL_CONDITIONS,
  { name: '部分二階境界: 26坪/個室3/吹抜（0案）', cfg: { parking: 1, garden: 1, area: 26, floors: 2, rooms: 3, feats: ['void'], story: 'partial' } },
]

const rooms = (p: ScoredPlan) => p.floors.map((f) => ({ fp: f.fp ?? null, rooms: f.rooms.map((r) => `${r.type}:${r.x},${r.y},${r.w},${r.h}`) }))

interface Fixture {
  genVersion: number
  cases: { name: string; seed: number; plans: { key: string; score: number; name: string; tags: string[]; explain: string; floors: ReturnType<typeof rooms> }[] }[]
  pools: { name: string; count: number; top: string[]; sha256: string; /** プールの sig（sig|sigM）の集合のハッシュ（スコアを含まない） */ sigSha256: string }[]
  grid: Record<string, string[]>
  /** 0案の境界条件の診断（理由と代替案のラベル）。生成結果には影響しない */
  diagnoses: { name: string; reason: string; alts: string[] }[]
}

/** build() が部分二階の feasibility グリッドで選んだ提示案（seed 1）。退行防止の指標の標本 */
const gridPlans: ScoredPlan[] = []

function build(): Fixture {
  gridPlans.length = 0
  const cases: Fixture['cases'] = []
  for (const { name, cfg } of ALL) {
    for (const seed of SEEDS) {
      const plans = generatePlans(copy(cfg), seed).map((p) => ({
        key: planKey(p), score: p.score.total, name: planName(cfg, p), tags: planTags(cfg, p), explain: explainPlan(cfg, p), floors: rooms(p),
      }))
      cases.push({ name, seed, plans })
    }
  }
  const pools = ALL.map(({ name, cfg }) => {
    const pool = candidatePool(copy(cfg))
    return { name, count: pool.length, top: pool.slice(0, 10).map(planKey), sha256: createHash('sha256').update(canon(pool)).digest('hex'), sigSha256: createHash('sha256').update(JSON.stringify(pool.map((p) => `${p.sig}|${p.sigM}`).sort())).digest('hex') }
  })
  // feasibility グリッド（部分二階。可能な条件 × seed 1 の3案の key）
  const grid: Fixture['grid'] = {}
  for (const area of [24, 28, 32, 36, 40]) {
    for (const nr of [2, 3, 4, 5]) {
      for (const feats of [[], ['doma'], ['void'], ['laundry', 'pantry', 'wic']] as PlanConfig['feats'][]) {
        const cfg: PlanConfig = { area, floors: 2, rooms: nr, parking: 1, garden: 1, feats, story: 'partial' }
        if (!feasibility(cfg).ok) continue
        const plans = generatePlans(cfg, 1)
        gridPlans.push(...plans)
        grid[JSON.stringify(cfg)] = plans.map(planKey)
      }
    }
  }
  const diagnoses = ALL.filter(({ cfg }) => candidatePool(copy(cfg)).length === 0).map(({ name, cfg }) => {
    const d = diagnoseEmpty(copy(cfg))
    return { name, reason: d.reason, alts: d.alts.map((a) => a.label) }
  })
  return { genVersion: GEN_VERSION, cases, pools, grid, diagnoses }
}

const update = process.env.UPDATE_GOLDEN

describe(`gen-v${GEN_VERSION}-partial スナップショット`, () => {
  if (update) {
    it('fixture を書き出す', () => {
      const next = build()
      if (existsSync(FIXTURE) && update !== 'force') {
        const old = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
        if (old.genVersion === GEN_VERSION && canon(old) !== canon(next)) {
          throw new Error(`fixture の genVersion が現在の GEN_VERSION(${GEN_VERSION}) と同じまま中身が変わります。GEN_VERSION を上げるか、意図的なら UPDATE_GOLDEN=force で実行してください`)
        }
      }
      writeFileSync(FIXTURE, JSON.stringify(next, null, 1) + '\n')
    }, 300_000)
    return
  }

  let fixture: Fixture
  let now: Fixture
  beforeAll(() => {
    fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
    now = build()
  }, 300_000)

  it('fixture.genVersion が現在の GEN_VERSION と一致する', () => {
    expect(fixture.genVersion).toBe(GEN_VERSION)
  })
  it('generatePlans の出力（条件 × 6 seed。キー・名前・タグ・解説・配置）が一致する', () => {
    expect(fixture.cases).toHaveLength(ALL.length * SEEDS.length)
    for (const [i, c] of fixture.cases.entries()) expect(now.cases[i], `${c.name} seed=${c.seed}`).toEqual(c)
  })
  it('候補プール（件数・上位10件・全体のハッシュ）が一致する', () => {
    expect(now.pools).toEqual(fixture.pools)
    expect(fixture.pools.filter((p) => p.count > 0).length).toBeGreaterThan(0)
    expect(fixture.pools.some((p) => p.count === 0)).toBe(true)
  })
  it('feasibility グリッドの seed 1 の3案が一致する', () => {
    expect(Object.keys(fixture.grid).length).toBeGreaterThan(20)
    expect(now.grid).toEqual(fixture.grid)
  })
  it('0案の境界条件の診断（reason と alts）が一致する', () => {
    expect(fixture.diagnoses.length).toBeGreaterThan(0)
    expect(now.diagnoses).toEqual(fixture.diagnoses)
  })

  // 退行防止の指標（hall-stair-spec §10.3）。しきい値は GEN_VERSION 6 の実測（括弧内）に余裕を持たせた値
  it('部分二階グリッド: 廊下率の中央値 ≤ 9.0%（実測 7.6）、8%以下の案 ≥ 35%（実測 60.6%）。階段は上下一致の 4×5 / 4×6。3案が出る条件は 33 以上。直下率の中央値 ≥ 55%（GEN_VERSION 8 の実測 60.0%。v7 は 54.3%）', () => {
    const hall = gridPlans.map((p) => hallRatioIndependent(p) * 100)
    expect(hall.length).toBeGreaterThan(80)
    expect(quantile(hall, 0.5)).toBeLessThanOrEqual(9.0)
    expect(hall.filter((h) => h <= 8).length / hall.length).toBeGreaterThanOrEqual(0.35)
    for (const p of gridPlans) expect(stairViolations(p), planKey(p)).toEqual([])
    expect(Object.keys(now.grid).filter((k) => now.grid[k]?.length === 3).length).toBeGreaterThanOrEqual(33)
    expect(quantile(gridPlans.map((p) => chokkaRate(p) * 100), 0.5)).toBeGreaterThanOrEqual(55)
  })

  // 移行検証（v4 → v5。fixture どうしの記録）: 成立条件・プールは v4 以上、0案の境界は不変（旧 fixture は消さずに残す）
  describe('v4 → v5 の移行（クローゼット。fixture どうしの記録）', () => {
    let v4: Fixture
    let v5: Fixture
    beforeAll(() => {
      v4 = JSON.parse(readFileSync(FIXTURE_V4, 'utf8')) as Fixture
      v5 = JSON.parse(readFileSync(FIXTURE_V5, 'utf8')) as Fixture
    })
    it('grid: v4 で3案が出た条件は v5 でも3案が出る。条件の集合も同一', () => {
      expect(v4.genVersion).toBe(4)
      expect(v5.genVersion).toBe(5)
      expect(Object.keys(v5.grid).sort()).toEqual(Object.keys(v4.grid).sort())
      const three = (g: Fixture['grid']) => Object.keys(g).filter((k) => g[k]?.length === 3)
      expect(three(v4.grid).filter((k) => v5.grid[k]?.length !== 3)).toEqual([])
      expect(three(v5.grid).length).toBeGreaterThanOrEqual(three(v4.grid).length)
    })
    it('候補プールの件数は全条件で v4 以上', () => {
      expect(v4.pools.map((p) => p.name)).toEqual(v5.pools.map((p) => p.name))
      for (const [i, p] of v5.pools.entries()) expect(p.count, p.name).toBeGreaterThanOrEqual(v4.pools[i]?.count ?? Infinity)
    })
    it('提示案の件数は v4 と同じ（0案の境界が動かない）', () => {
      expect(v5.cases.map((c) => [c.name, c.seed, c.plans.length])).toEqual(v4.cases.map((c) => [c.name, c.seed, c.plans.length]))
    })
  })

  // 移行検証（v5 → v6）: 階段を上下で同じ 4×5/4×6 にし、ホール帯の端を吸収する。部分二階は、2F が北寄せ・階段側寄せで北帯の高さをそろえやすいので、見込みでは成立条件は減らないはずだったが、実測は 48 → 44（下の toHaveLength(4) と 44）
  // 移行検証: GEN_VERSION 7 はスコアの置き換えだけ（棄却しない）。プールの件数・3案が出る条件は v6 と同一
  describe('v6 → v7 の移行（二面採光）', () => {
    let v6: Fixture
    let now: Fixture
    beforeAll(() => {
      v6 = JSON.parse(readFileSync(FIXTURE_V6, 'utf8')) as Fixture
      now = JSON.parse(readFileSync(FIXTURE_V7, 'utf8')) as Fixture // v7 の記録どうしの比較（現行は v8）
    })
    it('候補プールの sig の集合は、全条件で v6 と一致する（スコア以外の生成が不変であることの固定）', () => {
      expect(v6.pools.every((p) => p.sigSha256.length === 64)).toBe(true)
      expect(now.pools.map((p) => [p.name, p.sigSha256])).toEqual(v6.pools.map((p) => [p.name, p.sigSha256]))
    })
    it('候補プールの件数・grid の条件と提示案の件数・named 条件の提示案の件数は v6 と同一', () => {
      expect(now.pools.map((p) => [p.name, p.count])).toEqual(v6.pools.map((p) => [p.name, p.count]))
      expect(Object.keys(now.grid).sort()).toEqual(Object.keys(v6.grid).sort())
      for (const [k, v] of Object.entries(v6.grid)) expect(now.grid[k]?.length, k).toBe(v.length)
      expect(now.cases.map((c) => [c.name, c.seed, c.plans.length])).toEqual(v6.cases.map((c) => [c.name, c.seed, c.plans.length]))
    })
  })

  // 移行検証: GEN_VERSION 8 は 2F の帯内の切断線を 1F の壁に寄せる（R-SPACE-35）。1F は不変（総二階側の golden-fixture.test.ts が v7 のコードで記録したハッシュで固定。ここは部分二階）
  describe('v7 → v8 の移行（2F の切断線の寄せ）', () => {
    let v7: Fixture
    let f1sig: Record<string, string>
    beforeAll(() => {
      v7 = JSON.parse(readFileSync(FIXTURE_V7, 'utf8')) as Fixture
      f1sig = JSON.parse(readFileSync(FIXTURE_V7_F1, 'utf8')) as typeof f1sig
    })
    it('1F の部屋は、候補プールのすべての案で v7 と同一（key の集合も同一）', () => {
      for (const { name, cfg } of PARTIAL_CONDITIONS) {
        const lines = candidatePool(copy(cfg)).map((p) => `${planKey(p)}|${(p.floors[0]?.rooms ?? []).map((r) => `${r.type}:${r.x},${r.y},${r.w},${r.h}`).join(';')}`).sort()
        expect(createHash('sha256').update(JSON.stringify(lines)).digest('hex'), name).toBe(f1sig[name])
      }
    }, 120_000)
    it('候補プールの件数は条件ごとに v7 と完全一致', () => {
      expect(v7.pools.map((p) => p.name)).toEqual(now.pools.map((p) => p.name))
      for (const [i, p] of now.pools.entries()) {
        const before = v7.pools[i]?.count ?? 0
        expect(p.count, p.name).toBe(before)
      }
    })
    it('grid: 条件の集合と、3案が出る条件の集合・件数は v7 と同一。named 条件の提示案の件数も同一', () => {
      expect(Object.keys(now.grid).sort()).toEqual(Object.keys(v7.grid).sort())
      for (const [k, v] of Object.entries(v7.grid)) expect(now.grid[k]?.length, k).toBe(v.length)
      expect(now.cases.map((c) => [c.name, c.seed, c.plans.length])).toEqual(v7.cases.map((c) => [c.name, c.seed, c.plans.length]))
    })
  })

  describe('v5 → v6 の移行（階段・廊下）', () => {
    let v5: Fixture
    beforeAll(() => {
      v5 = JSON.parse(readFileSync(FIXTURE_V5, 'utf8')) as Fixture
    })
    it('grid: 条件の集合（feasibility）は v5 と同一。v5 で3案が出て v6 で出なくなった条件は、v5 の提示案の階段がすべて成立しない矩形（4×4・上下の食い違い）で、v6 で新しく3案が出る条件はない', () => {
      expect(Object.keys(now.grid).sort()).toEqual(Object.keys(v5.grid).sort())
      const three = (g: Fixture['grid']) => Object.keys(g).filter((k) => g[k]?.length === 3)
      const stairs = JSON.parse(readFileSync(FIXTURE_V5_STAIRS, 'utf8')) as Record<string, { key: string; s1: string; s2: string }[]>
      expect(Object.keys(stairs).sort()).toEqual(three(v5.grid).sort())
      const lost = three(v5.grid).filter((k) => now.grid[k]?.length !== 3)
      for (const k of lost) {
        for (const p of stairs[k] ?? []) expect(p.s1 !== p.s2 || !/^\d+,0,4,[56]$/.test(p.s1), `${k} ${p.key} 1F ${p.s1} / 2F ${p.s2}`).toBe(true)
      }
      // 記録: 部分二階のグリッド（5×4×4 条件の可能なもの）で 3案が出る条件は 48 → 44（24坪/個室2/こだわりなし・吹抜、28坪/個室2・3/ランドリー+パントリー+WIC の4件が、1F の階段 4×4 だけだったため）
      expect(lost).toHaveLength(4)
      expect(three(now.grid).filter((k) => v5.grid[k]?.length !== 3)).toEqual([])
      expect(three(now.grid)).toHaveLength(44)
    })
    it('人気3条件（部分二階）の候補プールは v5 以上。0案の境界の提示案の件数は不変', () => {
      for (const { name } of PARTIAL_CONDITIONS.slice(0, 3)) {
        expect(now.pools.find((p) => p.name === name)?.count ?? 0, name).toBeGreaterThanOrEqual(v5.pools.find((p) => p.name === name)?.count ?? Infinity)
      }
      for (const c of v5.cases.filter((x) => x.plans.length === 0)) {
        expect(now.cases.find((x) => x.name === c.name && x.seed === c.seed)?.plans.length, c.name).toBe(0)
      }
    })
  })
})
