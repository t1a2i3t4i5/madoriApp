/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'
import { GEN_VERSION, candidatePool } from './generate'
import { planKey } from './enumerate'
import { BOUNDARY, CONDITIONS, SEEDS, canon } from './testing'
import { shortSideViolations } from './validate'
import { ROOM } from './rooms'
import type { PlanConfig, Room } from './types'

/**
 * 過去の版の移行検証（総二階・平屋）。通常の npm test には入れず、版を上げるときに npm run test:archive で回す（手順は CLAUDE.md の「テスト方針」）。
 * golden-fixture.test.ts から分離したもの。現行の記録（gen-v<GEN_VERSION>.json）はライブ生成ではなく fixture のJSONを読む
 * （現行の生成と fixture の一致は golden-fixture.test.ts が保証する）。旧 fixture は消さずに残す。
 * 分離の際に、「v8 → v9: fixture の grid の各案の key が候補プールにある」検査は削除した（grid の key の一致は golden-fixture の
 * 「feasibility グリッドの seed 1 の3案が一致する」に含まれ、プールのキャッシュ上限を超えてグリッドを作り直す約70秒の重複だったため）
 */
const FIXTURE = new URL(`./__fixtures__/gen-v${GEN_VERSION}.json`, import.meta.url)
const FIXTURE_V3 = new URL('./__fixtures__/gen-v3.json', import.meta.url)
const FIXTURE_V4 = new URL('./__fixtures__/gen-v4.json', import.meta.url)
const FIXTURE_V6 = new URL('./__fixtures__/gen-v6.json', import.meta.url)
const FIXTURE_V9 = new URL('./__fixtures__/gen-v9.json', import.meta.url)
const FIXTURE_V8 = new URL('./__fixtures__/gen-v8.json', import.meta.url)
const FIXTURE_V7 = new URL('./__fixtures__/gen-v7.json', import.meta.url)
/** v7 のコードで記録した、候補プールの条件ごとの「key|1F の部屋」の sha256（v7 → v8 で 1F が不変であることの固定） */
const FIXTURE_V5 = new URL('./__fixtures__/gen-v5.json', import.meta.url)
const FIXTURE_V5_STAIRS = new URL('./__fixtures__/gen-v5-grid-stairs.json', import.meta.url)

const copy = (cfg: PlanConfig): PlanConfig => ({ ...cfg, feats: [...cfg.feats] })
const ALL = [...CONDITIONS, ...BOUNDARY]

interface Fixture {
  genVersion: number
  cases: { name: string; seed: number; plans: { key: string; score: number; name: string; tags: string[]; floors: string[][] }[] }[]
  pools: { name: string; count: number; top: string[]; sha256: string; sigSha256: string }[]
  grid: Record<string, string[]>
}

describe('過去の版からの移行検証（総二階・平屋）', () => {
  let fixture: Fixture
  let now: Fixture // 現行の記録（fixture のJSON）
  beforeAll(() => {
    fixture = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
    now = fixture
  })
  it('現行の fixture の genVersion が GEN_VERSION と一致する', () => {
    expect(fixture.genVersion).toBe(GEN_VERSION)
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
    beforeAll(() => {
      v7 = JSON.parse(readFileSync(FIXTURE_V7, 'utf8')) as Fixture
      now = JSON.parse(readFileSync(FIXTURE_V8, 'utf8')) as Fixture
    })
    // 「1F の部屋は v7 と同一」（v7 のコードで記録したハッシュとライブ生成の比較）は、GEN_VERSION 10 で 1F にも列の積みが入り成り立たなくなったので外した
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

  // 移行検証: GEN_VERSION 10 は列の積み（R-SPACE-43）・玄関ホール（R-SPACE-46）・トイレ等の幅の上限の下駄の撤去を入れる。プールの形が変わる
  describe('v9 → v10 の移行（列の積み）', () => {
    let v9: Fixture
    let v10: Fixture
    beforeAll(() => {
      v9 = JSON.parse(readFileSync(FIXTURE_V9, 'utf8')) as Fixture
      v10 = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture
    })
    it('grid: 条件の集合と、3案が出る条件の集合・件数は v9 と同一（69 件）。named 条件の提示件数も同一', () => {
      expect(v9.genVersion).toBe(9)
      expect(Object.keys(v10.grid).sort()).toEqual(Object.keys(v9.grid).sort())
      for (const [k, v] of Object.entries(v9.grid)) expect(v10.grid[k]?.length, k).toBe(v.length)
      expect(Object.values(v10.grid).filter((v) => v.length === 3)).toHaveLength(69)
      expect(v10.cases.map((c) => [c.name, c.seed, c.plans.length])).toEqual(v9.cases.map((c) => [c.name, c.seed, c.plans.length]))
    })
    it('候補プールの件数は v9 を下回らない（実測は同数。sha256 は変わる）', () => {
      expect(v10.pools.map((p) => p.name)).toEqual(v9.pools.map((p) => p.name))
      for (const [i, p] of v10.pools.entries()) expect(p.count, p.name).toBeGreaterThanOrEqual(v9.pools[i]?.count ?? 0)
      expect(v10.pools.map((p) => p.sha256)).not.toEqual(v9.pools.map((p) => p.sha256))
    })
    it('最大面積を超えた部屋の室数（提示案・named 条件）が v9 の 60% 以下に減っている（R-ROOM-01）', () => {
      const count = (f: Fixture) => {
        let over = 0
        for (const c of f.cases) for (const p of c.plans) for (const fl of p.floors) for (const sr of fl) {
          const [type = '', rest = ''] = sr.split(':')
          const [, , w = 0, h = 0] = rest.split(',').map(Number)
          const def = (ROOM as Record<string, { maxArea: number } | undefined>)[type]
          if (def && type !== 'hall' && type !== 'void' && type !== 'closet' && w * h > def.maxArea) over++
        }
        return over
      }
      const before = count(v9)
      expect(before).toBeGreaterThan(0)
      expect(count(v10)).toBeLessThanOrEqual(before * 0.6)
    })
  })

  // 移行検証: GEN_VERSION 9 は選抜の規則だけを変える（概念キー＋重なり。候補プールは不変）
  describe('v8 → v9 の移行（選抜の差し替え）', () => {
    let v8: Fixture
    let v9: Fixture
    beforeAll(() => {
      v8 = JSON.parse(readFileSync(FIXTURE_V8, 'utf8')) as Fixture
      v9 = JSON.parse(readFileSync(FIXTURE_V9, 'utf8')) as Fixture
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
    // 「fixture の各案の key が候補プールにある」（ライブ生成との比較）は、現行の生成が v10 になったので外した（v9 の記録どうしの比較だけを残す）
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

})
