/// <reference types="node" />
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { GEN_VERSION, candidatePool, generatePlans } from './generate'
import { feasibility } from './program'
import { planName, planTags } from './describe'
import { planKey } from './enumerate'
import { BOUNDARY, CONDITIONS, PARTIAL_CONDITIONS, SEEDS, chokkaRate, fullWidthHall2F, hallRatioIndependent, quantile, stairViolations } from './testing'
import type { PlanConfig, ScoredPlan } from './types'

/**
 * 現在の GEN_VERSION に対応するスナップショット（__fixtures__/gen-v<GEN_VERSION>.json）との比較。
 * 生成アルゴリズムを意図して変えたときだけ更新する（GEN_VERSION を上げて新しい fixture を作る）:
 *   UPDATE_GOLDEN=1 npx vitest run src/core/golden-fixture.test.ts
 * fixture の genVersion が現在の GEN_VERSION と同じで中身だけ違う場合は、書き込みを拒否する
 * （GEN_VERSION を上げずに出力を黙って書き換えないため。どうしても必要なら UPDATE_GOLDEN=force）。
 * 旧バージョンの fixture は消さず、移行検証（v3 → v4 … v8 → v9）に使う。移行検証は golden-fixture.archive.test.ts に分離してあり、
 * 通常の npm test には入れない（版を上げるときに npm run test:archive で回す。手順は CLAUDE.md の「テスト方針」）。
 * v1 の正解は legacy/index.html（golden.test.ts）。
 */
const FIXTURE = new URL(`./__fixtures__/gen-v${GEN_VERSION}.json`, import.meta.url)

const copy = (cfg: PlanConfig): PlanConfig => ({ ...cfg, feats: [...cfg.feats] })
const ALL = [...CONDITIONS, ...BOUNDARY]

/** キー順の違いで落ちないよう、キーをソートして正規化したJSONにする */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    }
    return val
  })
}

/** 候補プールの sig 集合のハッシュ（順序・スコアに依らない） */
const sigHash = (pool: readonly ScoredPlan[]) => createHash('sha256').update(JSON.stringify(pool.map((p) => `${p.sig}|${p.sigM}`).sort())).digest('hex')

const rooms = (p: ScoredPlan) => p.floors.map((f) => f.rooms.map((r) => `${r.type}:${r.x},${r.y},${r.w},${r.h}`))

interface Fixture {
  genVersion: number
  cases: { name: string; seed: number; plans: { key: string; score: number; name: string; tags: string[]; floors: string[][] /* 階ごとの "type:x,y,w,h" */ }[] }[]
  pools: { name: string; count: number; top: string[]; sha256: string; /** プールの sig（sig|sigM）の集合のハッシュ。スコアを含まないので、スコアだけを変える版（v7）でも前の版と一致する */ sigSha256: string }[]
  grid: Record<string, string[]>
}

/** build() が feasibility グリッドで選んだ提示案（総二階・平屋。seed 1）。退行防止の指標（hall-stair-spec §10.3）の標本 */
const gridPlans: ScoredPlan[] = []

function build(): Fixture {
  gridPlans.length = 0
  const cases: Fixture['cases'] = []
  for (const { name, cfg } of ALL) {
    for (const seed of SEEDS) {
      const plans = generatePlans(copy(cfg), seed).map((p) => ({
        key: planKey(p), score: p.score.total, name: planName(cfg, p), tags: planTags(cfg, p), floors: rooms(p),
      }))
      cases.push({ name, seed, plans })
    }
  }
  const pools = ALL.map(({ name, cfg }) => {
    const pool = candidatePool(copy(cfg))
    return {
      name,
      count: pool.length,
      top: pool.slice(0, 10).map(planKey),
      sha256: createHash('sha256').update(canon(pool)).digest('hex'),
      sigSha256: sigHash(pool),
    }
  })
  // feasibility グリッド（2×6×4×4=192条件）の可能な条件 × seed 1 で選ばれた3案の key
  const grid: Fixture['grid'] = {}
  for (const floors of [1, 2] as const) {
    for (const area of [20, 23, 26, 30, 36, 40]) {
      for (const rooms of [2, 3, 4, 5]) {
        for (const feats of [[], ['doma'], ['void', 'study'], ['washitsu', 'laundry', 'pantry', 'wic']] as PlanConfig['feats'][]) {
          const cfg: PlanConfig = { area, floors, rooms, parking: 1, garden: 1, feats }
          if (!feasibility(cfg).ok) continue
          const plans = generatePlans(cfg, 1)
          gridPlans.push(...plans)
          grid[JSON.stringify(cfg)] = plans.map(planKey)
        }
      }
    }
  }
  return { genVersion: GEN_VERSION, cases, pools, grid }
}

const update = process.env.UPDATE_GOLDEN

describe(`gen-v${GEN_VERSION} スナップショット`, () => {
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

  // 生成は重いので describe の収集時ではなく beforeAll で行う（フィルタ実行や収集だけのときに走らせない）
  let fixture: Fixture
  let now: Fixture
  beforeAll(() => {
    fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
    now = build()
  }, 300_000)

  it('fixture.genVersion が現在の GEN_VERSION と一致する', () => {
    expect(fixture.genVersion).toBe(GEN_VERSION)
  })
  it('generatePlans の出力（全条件 × 6 seed。2^32 以上の seed を含む）が一致する', () => {
    expect(fixture.cases).toHaveLength(ALL.length * SEEDS.length)
    for (const [i, c] of fixture.cases.entries()) expect(now.cases[i], `${c.name} seed=${c.seed}`).toEqual(c)
  })
  it('候補プール（件数・上位10件・全体のハッシュ）が一致する', () => {
    expect(now.pools).toEqual(fixture.pools)
    expect(fixture.pools.filter((p) => p.count > 0).length).toBeGreaterThan(0)
  })
  it('feasibility グリッドの seed 1 の3案が一致する', () => {
    expect(Object.keys(fixture.grid).length).toBeGreaterThan(50)
    expect(now.grid).toEqual(fixture.grid)
  })

  // 退行防止の指標（hall-stair-spec §10.3）。しきい値は GEN_VERSION 6 の実測（括弧内）に余裕を持たせた値
  describe('退行防止の指標（v6 の廊下率・LDK・階段、v8 の直下率）', () => {
    const pct = (xs: readonly number[]) => xs.map((x) => x * 100)
    it('グリッド（総二階・平屋 seed 1 の提示案）: 廊下率の中央値 ≤ 8.5%（GEN_VERSION 9 の実測 8.3。v8 は 8.1、寄せの前は 7.9。選抜の変更による標本の入れ替わり）、8%以下の案 ≥ 40%（実測 44.0%。v8 は 47.8%。v6 は 54.1%）', () => {
      const hall = pct(gridPlans.map(hallRatioIndependent))
      expect(hall.length).toBeGreaterThan(150)
      expect(quantile(hall, 0.5)).toBeLessThanOrEqual(8.5)
      expect(hall.filter((h) => h <= 8).length / hall.length).toBeGreaterThanOrEqual(0.40)
    })
    it('グリッド2階建て: 直下率の中央値 ≥ 52%（GEN_VERSION 9 の実測 56.0%。v8 は 54.4%、v7 は 47.5%）、40%未満の案 ≤ 10%（実測 4.3%。v8 は 8.6%、v7 は 18.3%）、1Fの LDK 面積の中央値 ≥ 90 セル²（v5 の値。実測 104）', () => {
      const two = gridPlans.filter((p) => p.floors.length === 2)
      expect(two.length).toBeGreaterThan(80)
      const rates = pct(two.map(chokkaRate))
      expect(quantile(rates, 0.5)).toBeGreaterThanOrEqual(52)
      expect(rates.filter((r) => r < 40).length / rates.length).toBeLessThanOrEqual(0.10)
      expect(quantile(two.map((p) => p.floors[0]?.rooms.find((r) => r.type === 'ldk')?.area ?? 0), 0.5)).toBeGreaterThanOrEqual(90)
    })
    it('グリッドの提示案: 階段の矩形が上下で一致し、4×5 / 4×6 の折り返しのみ（4×4 はゼロ）。3案が出る条件は 69 以上', () => {
      const two = gridPlans.filter((p) => p.floors.length === 2)
      for (const p of two) expect(stairViolations(p), planKey(p)).toEqual([])
      const sizes = new Set(two.map((p) => { const s = p.floors[0]?.rooms.find((r) => r.type === 'stair'); return `${s?.w}x${s?.h}` }))
      expect([...sizes].sort()).toEqual(['4x5', '4x6'])
      expect(Object.keys(now.grid).filter((k) => now.grid[k]?.length === 3).length).toBeGreaterThanOrEqual(69)
    })
    it('人気6条件 × 6 seed: 廊下率の中央値 ≤ 12.0%（GEN_VERSION 10 の実測 11.9。玄関ホールを廊下率に数える R-SPACE-46。v9 は 10.7）、2F の全幅ホールの案 ≤ 45%（実測 16.7%）、直下率の中央値 ≥ 55%（GEN_VERSION 10 の実測 60.2%。v8 は 55.6%、v7 は 55.9%。個室収納を減らさない条件を足す前は 58.8%）', () => {
      const plans = [...CONDITIONS.slice(0, 3), ...PARTIAL_CONDITIONS.slice(0, 3)].flatMap(({ cfg }) => SEEDS.flatMap((s) => generatePlans(copy(cfg), s)))
      expect(plans).toHaveLength(6 * SEEDS.length * 3)
      expect(quantile(pct(plans.map(hallRatioIndependent)), 0.5)).toBeLessThanOrEqual(12.0)
      const two = plans.filter((p) => p.floors.length === 2)
      expect(two.filter(fullWidthHall2F).length / two.length).toBeLessThanOrEqual(0.45)
      expect(quantile(pct(two.map(chokkaRate)), 0.5)).toBeGreaterThanOrEqual(55)
    })
  })
})
