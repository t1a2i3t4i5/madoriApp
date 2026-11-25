/// <reference types="node" />
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { GEN_VERSION, candidatePool, generatePlans } from './generate'
import { feasibility } from './program'
import { planName, planTags } from './describe'
import { planKey } from './enumerate'
import { BOUNDARY, CONDITIONS, PARTIAL_CONDITIONS, SEEDS, chokkaRate, fullWidthHall2F, hallRatioIndependent, quantile, stairViolations } from './testing'
import { shortSideViolations } from './validate'
import type { PlanConfig, Room, ScoredPlan } from './types'

/**
 * 現在の GEN_VERSION に対応するスナップショット（__fixtures__/gen-v<GEN_VERSION>.json）との比較。
 * 生成アルゴリズムを意図して変えたときだけ更新する（GEN_VERSION を上げて新しい fixture を作る）:
 *   UPDATE_GOLDEN=1 npx vitest run src/core/golden-fixture.test.ts
 * fixture の genVersion が現在の GEN_VERSION と同じで中身だけ違う場合は、書き込みを拒否する
 * （GEN_VERSION を上げずに出力を黙って書き換えないため。どうしても必要なら UPDATE_GOLDEN=force）。
 * 旧バージョンの fixture（gen-v3.json、gen-v4.json、gen-v5.json）は消さず、移行検証（v3 → v4、v4 → v5、v5 → v6）に使う。
 * v5 → v6 の検証には、v5 のコードで記録した 2階建てのグリッドの提示案の階段・LDK・玄関（gen-v5-grid-stairs.json）も使う。
 * v1 の正解は legacy/index.html（golden.test.ts）。
 */
const FIXTURE = new URL(`./__fixtures__/gen-v${GEN_VERSION}.json`, import.meta.url)
const FIXTURE_V3 = new URL('./__fixtures__/gen-v3.json', import.meta.url)
const FIXTURE_V4 = new URL('./__fixtures__/gen-v4.json', import.meta.url)
const FIXTURE_V6 = new URL('./__fixtures__/gen-v6.json', import.meta.url)
const FIXTURE_V8 = new URL('./__fixtures__/gen-v8.json', import.meta.url)
const FIXTURE_V7 = new URL('./__fixtures__/gen-v7.json', import.meta.url)
/** v7 のコードで記録した、候補プールの条件ごとの「key|1F の部屋」の sha256（v7 → v8 で 1F が不変であることの固定） */
const FIXTURE_V7_F1 = new URL('./__fixtures__/gen-v7-f1sig.json', import.meta.url)
const FIXTURE_V5 = new URL('./__fixtures__/gen-v5.json', import.meta.url)
const FIXTURE_V5_STAIRS = new URL('./__fixtures__/gen-v5-grid-stairs.json', import.meta.url)

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

  // 移行検証: GEN_VERSION 5 はクローゼット（弱・強のモード）と収納化を足した。成立条件・プールは v4 以上、境界は不変（v4・v5 の fixture どうしの比較。記録として残す）
  describe('v4 → v5 の移行（クローゼット。fixture どうしの記録）', () => {
    let v4: Fixture
    let v5: Fixture
    beforeAll(() => {
      v4 = JSON.parse(readFileSync(FIXTURE_V4, 'utf8')) as Fixture
      v5 = JSON.parse(readFileSync(FIXTURE_V5, 'utf8')) as Fixture
    })
    it('grid: v4 で3案が出た条件は v5 でも3案が出る（3案条件の集合が縮まない）。条件の集合（feasibility）も同一', () => {
      expect(v4.genVersion).toBe(4)
      expect(v5.genVersion).toBe(5)
      expect(Object.keys(v5.grid).sort()).toEqual(Object.keys(v4.grid).sort())
      const three = (g: Fixture['grid']) => Object.keys(g).filter((k) => g[k]?.length === 3)
      expect(three(v4.grid).filter((k) => v5.grid[k]?.length !== 3)).toEqual([])
      expect(three(v5.grid).length).toBeGreaterThanOrEqual(three(v4.grid).length)
    })
    it('候補プールの件数は、全条件で v4 以上（弱モードが v4 の成立を保つ）', () => {
      expect(v4.pools.map((p) => p.name)).toEqual(v5.pools.map((p) => p.name))
      for (const [i, p] of v5.pools.entries()) expect(p.count, p.name).toBeGreaterThanOrEqual(v4.pools[i]?.count ?? Infinity)
    })
    it('提示案の件数は v4 と同じ（0案・3案の境界が動かない）', () => {
      expect(v5.cases.map((c) => [c.name, c.seed, c.plans.length])).toEqual(v4.cases.map((c) => [c.name, c.seed, c.plans.length]))
    })
  })

  // 移行検証: GEN_VERSION 8 は 2F の帯内の切断線を 1F の壁に寄せる（R-SPACE-35）。1F・平屋は不変で、2F の幅だけが変わる
  describe('v7 → v8 の移行（2F の切断線の寄せ）', () => {
    let v7: Fixture
    let now: Fixture // v8 の記録どうしの比較（現行は v9）
    let f1sig: Record<string, string>
    beforeAll(() => {
      v7 = JSON.parse(readFileSync(FIXTURE_V7, 'utf8')) as Fixture
      now = JSON.parse(readFileSync(FIXTURE_V8, 'utf8')) as Fixture
      f1sig = JSON.parse(readFileSync(FIXTURE_V7_F1, 'utf8')) as typeof f1sig
    })
    it('1F の部屋は、候補プールのすべての案で v7 と同一（key の集合も同一。v7 のコードで記録した条件ごとのハッシュと一致）', () => {
      for (const { name, cfg } of [...CONDITIONS, ...BOUNDARY]) {
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
    it('grid: 条件の集合と、3案が出る条件の集合は v7 と同一。named 条件の提示案の件数も同一', () => {
      expect(Object.keys(now.grid).sort()).toEqual(Object.keys(v7.grid).sort())
      for (const [k, v] of Object.entries(v7.grid)) expect(now.grid[k]?.length, k).toBe(v.length)
      expect(now.cases.map((c) => [c.name, c.seed, c.plans.length])).toEqual(v7.cases.map((c) => [c.name, c.seed, c.plans.length]))
    })
    it('平屋の提示案の配置は v7 と同一（寄せは 2F だけ）', () => {
      const flat = (f: Fixture) => f.cases.filter((c) => c.name.includes('平屋')).map((c) => [c.name, c.seed, c.plans.map((p) => p.floors)])
      expect(flat(now)).toEqual(flat(v7))
    })
  })

  // 移行検証: GEN_VERSION 9 は選抜の規則だけを変える（概念キー＋重なり。候補プールは不変）
  describe('v8 → v9 の移行（選抜の差し替え）', () => {
    let v8: Fixture
    let v9: Fixture
    beforeAll(() => {
      v8 = JSON.parse(readFileSync(FIXTURE_V8, 'utf8')) as Fixture
      v9 = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
    })
    it('候補プールは完全に不変（件数・上位10件・sha256・sigSha256）', () => {
      expect(v8.genVersion).toBe(8)
      expect(v9.pools).toEqual(v8.pools)
    })
    it('grid: 条件の集合と3案が出る条件の集合・件数は v8 と同一。named 条件の提示件数も同一', () => {
      expect(Object.keys(v9.grid).sort()).toEqual(Object.keys(v8.grid).sort())
      for (const [k, v] of Object.entries(v8.grid)) expect(v9.grid[k]?.length, k).toBe(v.length)
      expect(v9.cases.map((c) => [c.name, c.seed, c.plans.length])).toEqual(v8.cases.map((c) => [c.name, c.seed, c.plans.length]))
    })
    it('fixture の各案の key は候補プール（v8 と同一）にある案（選抜の入れ替えにすぎない）', () => {
      for (const { name, cfg } of ALL) {
        const keys = new Set<string>(candidatePool(copy(cfg)).map(planKey))
        for (const c of v9.cases.filter((x) => x.name === name)) for (const p of c.plans) expect(keys.has(p.key), `${name} ${p.key}`).toBe(true)
      }
    }, 120_000)
  })

  // 移行検証（fixture どうしの記録。現行の生成は v8）: GEN_VERSION 7 はスコア「採光」を「二面採光」に置き換えた（棄却はしないので、プールの件数・3案が出る条件は不変。順位だけが変わる）
  describe('v6 → v7 の移行（二面採光）', () => {
    let v6: Fixture
    let now: Fixture
    beforeAll(() => {
      v6 = JSON.parse(readFileSync(FIXTURE_V6, 'utf8')) as Fixture
      now = JSON.parse(readFileSync(FIXTURE_V7, 'utf8')) as Fixture // v7 の記録どうしの比較（現行は v8）
    })
    it('候補プールの条件ごとの件数は v6 と同一', () => {
      expect(now.pools.map((p) => [p.name, p.count])).toEqual(v6.pools.map((p) => [p.name, p.count]))
    })
    it('候補プールの sig の集合は、全条件で v6 と一致する（スコア以外の生成が不変であることの固定。件数だけでは同数の別の案を見逃す）', () => {
      expect(v6.pools.every((p) => p.sigSha256.length === 64)).toBe(true)
      expect(now.pools.map((p) => [p.name, p.sigSha256])).toEqual(v6.pools.map((p) => [p.name, p.sigSha256]))
    })
    it('grid: 条件の集合と、提示案の件数（3案が出る条件）は v6 と同一', () => {
      expect(Object.keys(now.grid).sort()).toEqual(Object.keys(v6.grid).sort())
      for (const [k, v] of Object.entries(v6.grid)) expect(now.grid[k]?.length, k).toBe(v.length)
    })
    it('named 条件 × seed の提示案の件数は v6 と同一。3案の組は変わる（空振り防止）', () => {
      expect(now.cases.map((c) => [c.name, c.seed, c.plans.length])).toEqual(v6.cases.map((c) => [c.name, c.seed, c.plans.length]))
      const changed = now.cases.filter((c, i) => canon(c.plans.map((p) => p.key).sort()) !== canon((v6.cases[i]?.plans ?? []).map((p) => p.key).sort()))
      expect(changed.length).toBeGreaterThan(0)
    })
  })

  // 移行検証: GEN_VERSION 6 は階段を上下で同じ 4×5/4×6 の折り返しにし（北帯の高さの共通化）、ホール帯の端を吸収する。
  // 階段が成立しない（4×4・上下の食い違い）案しか出していなかった条件だけが、3案から外れる
  describe('v5 → v6 の移行（階段・廊下）', () => {
    let v5: Fixture
    let stairs: Record<string, { key: string; s1: string; s2: string; ldk: string; entry: string }[]>
    beforeAll(() => {
      v5 = JSON.parse(readFileSync(FIXTURE_V5, 'utf8')) as Fixture
      stairs = JSON.parse(readFileSync(FIXTURE_V5_STAIRS, 'utf8')) as typeof stairs
    })
    /** v5 の階段が、折り返し（4×5・4×6）として成立しない: 1F の短辺 4・長辺 4 以下、または上下で矩形が違う */
    const unusable = (s1: string, s2: string) => s1 !== s2 || !/^\d+,0,4,[56]$/.test(s1)
    const stairOf = (floor: string[] | undefined) => (floor ?? []).find((r) => r.startsWith('stair:'))?.slice(6) ?? ''

    it('grid: 条件の集合（feasibility が ok のキー）は v5 と同一（feasibility 不変）', () => {
      expect(Object.keys(now.grid).sort()).toEqual(Object.keys(v5.grid).sort())
    })
    it('grid: v5 で3案が出て v6 で3案が出なくなった条件は、v5 の提示案の階段がすべて成立しない矩形（4×4・上下の食い違い）', () => {
      expect(Object.keys(stairs).length).toBeGreaterThan(30)
      const lost = Object.keys(stairs).filter((k) => now.grid[k]?.length !== 3)
      expect(lost.length, '空振り防止: 3案から外れる条件がある').toBeGreaterThan(0)
      for (const k of lost) {
        expect(v5.grid[k]?.length, k).toBe(3)
        for (const p of stairs[k] ?? []) expect(unusable(p.s1, p.s2), `${k} ${p.key} 1F ${p.s1} / 2F ${p.s2}`).toBe(true)
      }
      // 記録: 2階建ての条件で3案が出なくなったのは 11 件（平屋は不変）
      expect(lost).toHaveLength(11)
    })
    it('grid: v6 で新しく3案が出る条件は、土間の起点の修正（平屋の玄関+土間の結合セル）によるものだけ', () => {
      const three = (g: Fixture['grid']) => Object.keys(g).filter((k) => g[k]?.length === 3)
      const gained = three(now.grid).filter((k) => v5.grid[k]?.length !== 3)
      for (const k of gained) expect((JSON.parse(k) as PlanConfig).floors, k).toBe(1)
      // 記録（GEN_VERSION 6）: 総二階・平屋のグリッドで3案の条件は 69 件（v5: 80）
      expect(three(now.grid)).toHaveLength(three(v5.grid).length - 11 + gained.length)
    })
    it('named 条件（CONDITIONS・BOUNDARY）: v5 で3案・v6 で0案の条件は、v5 の提示案の階段がすべて成立しない矩形', () => {
      // v5 の名前 → v6 の名前（0案になった条件は CONDITIONS から BOUNDARY へ移した。吹抜+WIC+書斎・全部のせは 40坪の同種の条件に入れ替え）
      const renamed: Record<string, string> = {
        '36坪/2階/吹抜+WIC+書斎': '境界: 36坪/2階/吹抜+WIC+書斎（0案: 階段）',
        '38坪/2階/全部のせ': '境界: 38坪/2階/全部のせ（0案: 階段）',
        '境界: 36坪/2階/吹抜+個室4+WIC（3案）': '境界: 36坪/2階/吹抜+個室4+WIC（0案: 階段）',
      }
      let lost = 0
      for (const c of v5.cases) {
        if (c.seed !== SEEDS[0]) continue
        const name6 = renamed[c.name] ?? c.name
        const v6 = now.cases.find((x) => x.name === name6 && x.seed === c.seed)
        expect(v6, `${c.name} → ${name6}`).toBeDefined()
        if (!v6 || v6.plans.length === c.plans.length) continue
        lost++
        expect(c.plans.length, c.name).toBe(3)
        expect(v6.plans.length, c.name).toBe(0)
        for (const p of c.plans) expect(unusable(stairOf(p.floors[0]), stairOf(p.floors[1])), `${c.name} ${p.key}`).toBe(true)
      }
      // 36坪/吹抜+WIC+書斎、38坪/全部のせ、境界の 36坪/吹抜+個室4+WIC
      expect(lost).toBe(3)
      expect(Object.keys(renamed).every((k) => v5.cases.some((c) => c.name === k))).toBe(true)
    })
    it('人気3条件の候補プール: 総二階は v5 以上。平屋は strictBed（G3）で 36 → 31 に減るが、3案は出る。BOUNDARY の件数は期待どおり', () => {
      for (const name of ['30坪/2階/個室3', '35坪/2階/個室4']) {
        const before = v5.pools.find((p) => p.name === name)?.count ?? Infinity
        expect(now.pools.find((p) => p.name === name)?.count ?? 0, name).toBeGreaterThanOrEqual(before)
      }
      // 平屋は主寝室・洋室を LDK 経由で入れる案が落ちる（strictBed=true。レビュー実測 36 → 31）。提示案は不変
      expect(now.pools.find((p) => p.name === '30坪/平屋/個室3')?.count).toBe(31)
      expect(now.cases.filter((c) => c.name === '30坪/平屋/個室3').every((c) => c.plans.length === 3)).toBe(true)
      for (const { name, expected } of BOUNDARY) {
        const cs = now.cases.filter((c) => c.name === name)
        expect(cs).toHaveLength(SEEDS.length)
        for (const c of cs) expect(c.plans.length, `${name} seed=${c.seed}`).toBe(expected)
      }
    })
    it('v5 の提示案の LDK・玄関の x と幅が、v6 のプールのどれかの案で再現される割合（記録用。標本は3案が出る条件の4件おき）', () => {
      let total = 0
      let kept = 0
      for (const [k, plans] of Object.entries(stairs).filter((_, i) => i % 4 === 0)) {
        const cfg = JSON.parse(k) as PlanConfig
        if (now.grid[k]?.length !== 3) continue
        const have = new Set(candidatePool(copy(cfg)).map((p) => {
          const r0 = p.floors[0]?.rooms ?? []
          const pick = (t: string) => { const r = r0.find((q) => q.type === t); return r ? `${r.x},${r.w}` : '' }
          return `${pick('ldk')}|${pick('entry') || pick('doma')}`
        }))
        for (const p of plans) {
          total++
          if (have.has(`${p.ldk}|${p.entry}`)) kept++
        }
      }
      expect(total).toBeGreaterThan(15)
      expect(kept / total, `LDK・玄関が再現 ${kept}/${total}`).toBeGreaterThanOrEqual(0.5)
    }, 180_000)
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
    it('グリッド2階建て: 直下率の中央値 ≥ 52%（GEN_VERSION 8 の実測 54.4%。v7 は 47.5%）、40%未満の案 ≤ 10%（実測 8.6%。v7 は 18.3%）、1Fの LDK 面積の中央値 ≥ 90 セル²（v5 の値。実測 104）', () => {
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
    it('人気6条件 × 6 seed: 廊下率の中央値 ≤ 11.0%（実測 10.3）、2F の全幅ホールの案 ≤ 45%（実測 16.7%）、直下率の中央値 ≥ 55%（GEN_VERSION 8 の実測 55.6%。v7 は 55.9%。個室収納を減らさない条件を足す前は 58.8%）', () => {
      const plans = [...CONDITIONS.slice(0, 3), ...PARTIAL_CONDITIONS.slice(0, 3)].flatMap(({ cfg }) => SEEDS.flatMap((s) => generatePlans(copy(cfg), s)))
      expect(plans).toHaveLength(6 * SEEDS.length * 3)
      expect(quantile(pct(plans.map(hallRatioIndependent)), 0.5)).toBeLessThanOrEqual(11.0)
      const two = plans.filter((p) => p.floors.length === 2)
      expect(two.filter(fullWidthHall2F).length / two.length).toBeLessThanOrEqual(0.45)
      expect(quantile(pct(two.map(chokkaRate)), 0.5)).toBeGreaterThanOrEqual(55)
    })
  })
})
