/// <reference types="node" />
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { GEN_VERSION, candidatePool, generatePlans } from './generate'
import { feasibility } from './program'
import { planName, planTags } from './describe'
import { explainPlan } from './explain'
import { planKey } from './enumerate'
import { PARTIAL_CONDITIONS, SEEDS, canon } from './testing'
import type { PlanConfig, ScoredPlan } from './types'

/**
 * 部分二階のスナップショット（__fixtures__/gen-v<GEN_VERSION>-partial.json）。総二階の gen-v<GEN_VERSION>.json とは別ファイルで、
 * 同じ仕組み: 更新は
 *   UPDATE_GOLDEN=1 npx vitest run src/core/golden-partial.test.ts
 * fixture の genVersion が現在の GEN_VERSION と同じで中身だけ違う場合は書き込みを拒否する（UPDATE_GOLDEN=force のときだけ許可）。
 * 部分二階の生成を意図して変えたときは GEN_VERSION を上げること。
 */
const FIXTURE = new URL(`./__fixtures__/gen-v${GEN_VERSION}-partial.json`, import.meta.url)

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
  pools: { name: string; count: number; top: string[]; sha256: string }[]
  grid: Record<string, string[]>
}

function build(): Fixture {
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
    return { name, count: pool.length, top: pool.slice(0, 10).map(planKey), sha256: createHash('sha256').update(canon(pool)).digest('hex') }
  })
  // feasibility グリッド（部分二階。可能な条件 × seed 1 の3案の key）
  const grid: Fixture['grid'] = {}
  for (const area of [24, 28, 32, 36, 40]) {
    for (const nr of [2, 3, 4, 5]) {
      for (const feats of [[], ['doma'], ['void'], ['laundry', 'pantry', 'wic']] as PlanConfig['feats'][]) {
        const cfg: PlanConfig = { area, floors: 2, rooms: nr, parking: 1, garden: 1, feats, story: 'partial' }
        if (!feasibility(cfg).ok) continue
        grid[JSON.stringify(cfg)] = generatePlans(cfg, 1).map(planKey)
      }
    }
  }
  return { genVersion: GEN_VERSION, cases, pools, grid }
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
})
