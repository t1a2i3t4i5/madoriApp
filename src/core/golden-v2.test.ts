/// <reference types="node" />
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GEN_VERSION, candidatePool, generatePlans } from './generate'
import { feasibility } from './program'
import { planName, planTags } from './describe'
import { planKey } from './enumerate'
import { BOUNDARY, CONDITIONS, SEEDS } from './testing'
import type { PlanConfig, ScoredPlan } from './types'

/**
 * GEN_VERSION 2 のスナップショット（__fixtures__/gen-v2.json）との比較。
 * 生成アルゴリズムを意図して変えたときだけ更新する:
 *   UPDATE_GOLDEN=1 npx vitest run src/core/golden-v2.test.ts
 * fixture の genVersion が現在の GEN_VERSION と同じで中身だけ違う場合は、書き込みを拒否する
 * （GEN_VERSION を上げずに v2 の出力を黙って書き換えないため。どうしても必要なら UPDATE_GOLDEN=force）。
 * v1 の正解は legacy/index.html（golden.test.ts）。
 */
const FIXTURE = new URL('./__fixtures__/gen-v2.json', import.meta.url)

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

const rooms = (p: ScoredPlan) => p.floors.map((f) => f.rooms.map((r) => `${r.type}:${r.x},${r.y},${r.w},${r.h}`))

interface Fixture {
  genVersion: number
  cases: { name: string; seed: number; plans: { key: string; score: number; name: string; tags: string[]; floors: string[][] /* 階ごとの "type:x,y,w,h" */ }[] }[]
  pools: { name: string; count: number; top: string[]; sha256: string }[]
  grid: Record<string, string[]>
}

function build(): Fixture {
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
          grid[JSON.stringify(cfg)] = generatePlans(cfg, 1).map(planKey)
        }
      }
    }
  }
  return { genVersion: GEN_VERSION, cases, pools, grid }
}

const update = process.env.UPDATE_GOLDEN

describe('gen-v2 スナップショット', () => {
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

  const fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
  const now = build()

  it('fixture.genVersion が現在の GEN_VERSION と一致する', () => {
    expect(fixture.genVersion).toBe(GEN_VERSION)
  })
  it('generatePlans の出力（13条件 × 5 seed）が一致する', () => {
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
})
