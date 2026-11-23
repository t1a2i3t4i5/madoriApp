/// <reference types="node" />
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { GEN_VERSION, candidatePool, generatePlans } from './generate'
import { feasibility } from './program'
import { planName, planTags } from './describe'
import { planKey } from './enumerate'
import { BOUNDARY, CONDITIONS, PARTIAL_CONDITIONS, SEEDS } from './testing'
import { shortSideViolations } from './validate'
import type { PlanConfig, Room, ScoredPlan } from './types'

/**
 * 現在の GEN_VERSION に対応するスナップショット（__fixtures__/gen-v<GEN_VERSION>.json）との比較。
 * 生成アルゴリズムを意図して変えたときだけ更新する（GEN_VERSION を上げて新しい fixture を作る）:
 *   UPDATE_GOLDEN=1 npx vitest run src/core/golden-fixture.test.ts
 * fixture の genVersion が現在の GEN_VERSION と同じで中身だけ違う場合は、書き込みを拒否する
 * （GEN_VERSION を上げずに出力を黙って書き換えないため。どうしても必要なら UPDATE_GOLDEN=force）。
 * 旧バージョンの fixture（gen-v3.json、gen-v4.json）は消さず、移行検証（v3 → v4、v4 → v5）に使う。
 * v1 の正解は legacy/index.html（golden.test.ts）。
 */
const FIXTURE = new URL(`./__fixtures__/gen-v${GEN_VERSION}.json`, import.meta.url)
const FIXTURE_V3 = new URL('./__fixtures__/gen-v3.json', import.meta.url)
const FIXTURE_V4 = new URL('./__fixtures__/gen-v4.json', import.meta.url)
const FIXTURE_V4_PARTIAL = new URL('./__fixtures__/gen-v4-partial.json', import.meta.url)
/** v4 の提示案が v5 のプールに残る割合と、骨格が一致する割合の下限（GEN_VERSION 5 の実測の少し下） */
const MIN_KEPT = 0.99
const MIN_SKELETON = 0.75

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

  // 移行検証: GEN_VERSION 4 は最小の短辺のハード制約を足した（feasibility は不変）
  describe('v3 からの移行（最小の短辺）', () => {
    let v3: Fixture
    beforeAll(() => {
      v3 = JSON.parse(readFileSync(FIXTURE_V3, 'utf8')) as Fixture
    })
    const planViolations = (floors: string[][]) =>
      floors.some((fl) =>
        shortSideViolations(
          fl.map((s) => {
            const [type, rest = ''] = s.split(':')
            const [x = 0, y = 0, w = 0, h = 0] = rest.split(',').map(Number)
            return { type, name: type, x, y, w, h, area: w * h, target: 0, minArea: 0 } as Room
          }),
        ).length > 0,
      )

    it('v3 の提示案の 90% 超に短辺違反がある（改修が効いていることの記録）', () => {
      expect(v3.genVersion).toBe(3)
      const plans = v3.cases.flatMap((c) => c.plans)
      const bad = plans.filter((p) => planViolations(p.floors)).length
      expect(plans.length).toBeGreaterThan(0)
      expect(bad / plans.length).toBeGreaterThan(0.9)
    })
    it('v4 の全 cases・全プールの案で shortSideViolations が空', () => {
      for (const c of fixture.cases) for (const p of c.plans) expect(planViolations(p.floors), `${c.name} ${p.key}`).toBe(false)
      for (const { name, cfg } of ALL) {
        for (const p of candidatePool(copy(cfg))) {
          for (const f of p.floors) expect(shortSideViolations(f.rooms), `${name} ${planKey(p)}`).toEqual([])
        }
      }
    })
    it('grid: 条件の集合（feasibility が ok のキー）は v3 と同一（feasibility 不変）', () => {
      expect(Object.keys(now.grid).sort()).toEqual(Object.keys(v3.grid).sort())
    })
  })

  // 移行検証: GEN_VERSION 5 はクローゼット（弱・強のモード）と収納化を足した。成立条件・プールは v4 以上、境界は不変
  describe('v4 からの移行（クローゼット）', () => {
    let v4: Fixture
    beforeAll(() => {
      v4 = JSON.parse(readFileSync(FIXTURE_V4, 'utf8')) as Fixture
    })
    it('grid: v4 で3案が出た条件は v5 でも3案が出る（3案条件の集合が縮まない）。条件の集合（feasibility）も同一', () => {
      expect(v4.genVersion).toBe(4)
      expect(Object.keys(now.grid).sort()).toEqual(Object.keys(v4.grid).sort())
      const three = (g: Fixture['grid']) => Object.keys(g).filter((k) => g[k]?.length === 3)
      const lost = three(v4.grid).filter((k) => now.grid[k]?.length !== 3)
      expect(lost).toEqual([])
      expect(three(now.grid).length).toBeGreaterThanOrEqual(three(v4.grid).length)
    })
    it('候補プールの件数は、全 CONDITIONS・BOUNDARY で v4 以上（弱モードが v4 の成立を保つ）', () => {
      expect(v4.pools.map((p) => p.name)).toEqual(now.pools.map((p) => p.name))
      for (const [i, p] of now.pools.entries()) expect(p.count, p.name).toBeGreaterThanOrEqual(v4.pools[i]?.count ?? Infinity)
    })
    it('BOUNDARY の提示案の件数は v4 と同じ（0案・3案の境界が動かない）', () => {
      for (const { name, expected } of BOUNDARY) {
        const cs = now.cases.filter((c) => c.name === name)
        expect(cs).toHaveLength(SEEDS.length)
        for (const c of cs) expect(c.plans.length, `${name} seed=${c.seed}`).toBe(expected)
        expect(v4.cases.filter((c) => c.name === name).every((c) => c.plans.length === expected)).toBe(true)
      }
    })
    it('v4 の提示案の骨格（階段・LDK・玄関/土間の矩形とホールの y・高さ）が、同じ key の v5 の案でも一致する割合', () => {
      // 骨格は階ごとに stair・ldk・entry・doma の矩形と、hall の y・高さ（ホールの x・幅は行き止まりの収納化で変わるので比べない）
      const skeleton = (rs: string[]) =>
        rs
          .filter((r) => /^(stair|ldk|entry|doma|hall):/.test(r))
          .map((r) => r.replace(/^hall:\d+,(\d+),\d+,(\d+)$/, 'hall:$1,$2'))
          .sort()
          .join('|')
      const partial = JSON.parse(readFileSync(FIXTURE_V4_PARTIAL, 'utf8')) as { cases: { name: string; plans: { key: string; floors: { rooms: string[] }[] }[] }[] }
      let total = 0
      let inPool = 0
      let same = 0
      const check = (cfg: PlanConfig, plans: { key: string; floors: string[][] }[]) => {
        const pool = new Map<string, ScoredPlan>(candidatePool(copy(cfg)).map((p) => [planKey(p), p]))
        for (const p of plans) {
          total++
          const q = pool.get(p.key)
          if (!q) continue
          inPool++
          if (JSON.stringify(p.floors.map(skeleton)) === JSON.stringify(rooms(q).map(skeleton))) same++
        }
      }
      for (const { name, cfg } of ALL) check(cfg, v4.cases.filter((x) => x.name === name).flatMap((c) => c.plans))
      for (const { name, cfg } of PARTIAL_CONDITIONS) {
        check(cfg, partial.cases.filter((x) => x.name === name).flatMap((c) => c.plans.map((p) => ({ key: p.key, floors: p.floors.map((f) => f.rooms) }))))
      }
      expect(total).toBeGreaterThan(200)
      // 実測（GEN_VERSION 5）: プールに残る 306/306（100%）、骨格が一致 241/306（78.8%）。一致しない案は、個室セルのクローゼット分を帯の高さの目標に足す
      // （layoutFloor）ことで帯の高さが動き、LDK の幅などが1〜2セル変わったもの。外すと 286/306（93.5%）になるが、洋室の家具配置率が 19.3% → 8.2% に落ちるので残した
      expect(inPool / total, `プールに残る ${inPool}/${total}`).toBeGreaterThanOrEqual(MIN_KEPT)
      expect(same / total, `骨格が一致 ${same}/${total}`).toBeGreaterThanOrEqual(MIN_SKELETON)
    })
  })
})
