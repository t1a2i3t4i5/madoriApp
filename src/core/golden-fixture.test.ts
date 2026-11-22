/// <reference types="node" />
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { GEN_VERSION, candidatePool, generatePlans } from './generate'
import { feasibility } from './program'
import { planName, planTags } from './describe'
import { planKey } from './enumerate'
import { BOUNDARY, CONDITIONS, SEEDS } from './testing'
import type { PlanConfig, ScoredPlan } from './types'

/**
 * 現在の GEN_VERSION に対応するスナップショット（__fixtures__/gen-v<GEN_VERSION>.json）との比較。
 * 生成アルゴリズムを意図して変えたときだけ更新する（GEN_VERSION を上げて新しい fixture を作る）:
 *   UPDATE_GOLDEN=1 npx vitest run src/core/golden-fixture.test.ts
 * fixture の genVersion が現在の GEN_VERSION と同じで中身だけ違う場合は、書き込みを拒否する
 * （GEN_VERSION を上げずに出力を黙って書き換えないため。どうしても必要なら UPDATE_GOLDEN=force）。
 * 旧バージョンの fixture（gen-v2.json）は消さず、移行検証（ランドリーを含まない条件は v3 と v2 が一致）に使う。
 * v1 の正解は legacy/index.html（golden.test.ts）。
 */
const FIXTURE = new URL(`./__fixtures__/gen-v${GEN_VERSION}.json`, import.meta.url)
const FIXTURE_V2 = new URL('./__fixtures__/gen-v2.json', import.meta.url)

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
  it('generatePlans の出力（13条件 × 6 seed。2^32 以上の seed を含む）が一致する', () => {
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

  // 移行検証: GEN_VERSION 3 の変更のうち、部屋の配置（ランドリーの並び替え・水回り制約）が変わるのは
  // こだわりにランドリーを含む条件だけ。ドアの見直しは全条件で変わるが、ドアのスコアが上限に
  // 張り付くため fixture 上は一致する。よって含まない条件は v2 の出力と完全に一致する
  describe('v2 からの移行（ランドリーを含まない条件は変わらない）', () => {
    let v2: Fixture
    beforeAll(() => {
      v2 = JSON.parse(readFileSync(FIXTURE_V2, 'utf8')) as Fixture
    })
    const noLaundry = new Set(ALL.filter(({ cfg }) => !cfg.feats.includes('laundry')).map((c) => c.name))

    it('fixture の対象条件にランドリーあり・なしの両方がある', () => {
      expect(v2.genVersion).toBe(2)
      expect(noLaundry.size).toBeGreaterThan(0)
      expect(noLaundry.size).toBeLessThan(ALL.length)
    })
    it('cases: ランドリーなしの条件は gen-v2 と一致する', () => {
      const old = v2.cases.filter((c) => noLaundry.has(c.name))
      expect(old.length).toBe(noLaundry.size * SEEDS.length)
      for (const c of old) {
        expect(now.cases.find((n) => n.name === c.name && n.seed === c.seed), `${c.name} seed=${c.seed}`).toEqual(c)
      }
    })
    it('pools: ランドリーなしの条件は件数・上位10件・ハッシュとも gen-v2 と一致する', () => {
      const old = v2.pools.filter((p) => noLaundry.has(p.name))
      expect(old.length).toBe(noLaundry.size)
      for (const p of old) expect(now.pools.find((n) => n.name === p.name), p.name).toEqual(p)
    })
    it('grid: ランドリーを含まない条件は gen-v2 と一致する', () => {
      const keys = Object.keys(v2.grid).filter((k) => !(JSON.parse(k) as PlanConfig).feats.includes('laundry'))
      expect(keys.length).toBeGreaterThan(30)
      for (const k of keys) expect(now.grid[k], k).toEqual(v2.grid[k])
      // 可否の判定は変わらないので、条件の集合そのものも同じ
      expect(Object.keys(now.grid).sort()).toEqual(Object.keys(v2.grid).sort())
    })
    it('ランドリーを含む条件では、プールが実際に変わっている（並び替えが効いている）', () => {
      const changed = v2.pools.filter((p) => !noLaundry.has(p.name) && now.pools.find((n) => n.name === p.name)?.sha256 !== p.sha256)
      expect(changed.length).toBeGreaterThan(0)
    })
  })
})
