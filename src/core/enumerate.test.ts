import { describe, expect, it } from 'vitest'
import { candidatePool, generatePlans } from './generate'
import {
  GALLERY_LIMIT, enumeratePlans, galleryPlans, isPlanKey, parsePlanKey, planFromKey, planKey,
} from './enumerate'
import { footprintList } from './slicing'
import { CANONICAL, type PlanConfig } from './types'
import { BOUNDARY, CONDITIONS, SEEDS, defined, independentViolations } from './testing'

const ALL: { name: string; cfg: PlanConfig; expected?: number }[] = [...CONDITIONS, ...BOUNDARY]

describe('enumeratePlans（候補プール）', () => {
  for (const { name, cfg, expected } of ALL) {
    it(`${name}: generatePlans の案が全て含まれる`, () => {
      const all = enumeratePlans(cfg)
      if (expected === 0) expect(all.length, '0案の条件では候補も0').toBe(0)
      for (const seed of SEEDS) {
        const gen = generatePlans(cfg, seed)
        if (expected !== undefined) expect(gen.length, `seed=${seed} の生成件数`).toBe(expected)
        for (const p of gen) {
          expect(all.some((a) => planKey(a) === planKey(p)), `seed=${seed} ${planKey(p)}`).toBe(true)
          expect(JSON.stringify(planFromKey(cfg, planKey(p))), `seed=${seed} ${planKey(p)}`).toBe(JSON.stringify(p))
        }
      }
    })

    it(`${name}: 全件 独立検証を通過・sig 重複なし・key 重複なし・スコア降順・再現性`, () => {
      const all = enumeratePlans(cfg)
      for (const p of all) expect(independentViolations(p), planKey(p)).toEqual([])
      const sigs = new Set<string>()
      for (const p of all) {
        expect(sigs.has(p.sig) || sigs.has(p.sigM), planKey(p)).toBe(false)
        sigs.add(p.sig)
      }
      expect(new Set(all.map(planKey)).size).toBe(all.length)
      for (let i = 1; i < all.length; i++) expect(defined(all[i - 1]).score.total).toBeGreaterThanOrEqual(defined(all[i]).score.total)
      expect(JSON.stringify(enumeratePlans(cfg))).toBe(JSON.stringify(all))
    })
  }

  it('入力 cfg を破壊せず、返り値を書き換えても候補プールに影響しない（コピー）', () => {
    const { cfg } = defined(CONDITIONS[0])
    const before = JSON.stringify(cfg)
    const a = enumeratePlans(cfg)
    expect(JSON.stringify(cfg)).toBe(before)
    const n = a.length
    a.length = 0
    expect(enumeratePlans(cfg)).toHaveLength(n)
    expect(candidatePool(cfg)).toHaveLength(n)
  })

  it('空振り防止: 人気条件では候補が3案よりずっと多い', () => {
    for (const { cfg } of CONDITIONS.slice(0, 3)) expect(enumeratePlans(cfg).length).toBeGreaterThan(30)
  })
})

describe('galleryPlans', () => {
  it('上限を守り、プールの部分集合で、スコア降順・最良案を含む・再現できる', () => {
    for (const { cfg } of CONDITIONS.slice(0, 3)) {
      const pool = enumeratePlans(cfg)
      expect(pool.length).toBeGreaterThan(GALLERY_LIMIT)
      const g = galleryPlans(cfg)
      expect(g).toHaveLength(GALLERY_LIMIT)
      expect(new Set(g.map(planKey)).size).toBe(g.length)
      const keys = new Set(pool.map(planKey))
      for (const p of g) expect(keys.has(planKey(p))).toBe(true)
      expect(planKey(defined(g[0]))).toBe(planKey(defined(pool[0])))
      for (let i = 1; i < g.length; i++) expect(defined(g[i - 1]).score.total).toBeGreaterThanOrEqual(defined(g[i]).score.total)
      expect(JSON.stringify(galleryPlans(cfg))).toBe(JSON.stringify(g))
    }
  })
  it('プールが上限以下ならプール全体を返す', () => {
    const { cfg } = defined(CONDITIONS.find((c) => c.name.includes('平屋/個室2')))
    expect(galleryPlans(cfg)).toHaveLength(Math.min(GALLERY_LIMIT, enumeratePlans(cfg).length))
  })
  it('多様性を優先する: アーキタイプが偏らない', () => {
    const { cfg } = defined(CONDITIONS[0])
    const g = galleryPlans(cfg)
    const archs = new Set(g.map((p) => p.arch))
    expect(archs.size).toBeGreaterThan(1)
  })
})

describe('footprintList', () => {
  it('limit は既定10で、縦横比 0.62〜1.62 の制限は変わらない', () => {
    for (const area of [240, 300, 480, 560]) {
      const list = footprintList(area)
      expect(list.length).toBeLessThanOrEqual(10)
      expect(list.length).toBeGreaterThan(6)
      for (const f of list) expect(f.W / f.H).toBeGreaterThanOrEqual(0.62)
      for (const f of list) expect(f.W / f.H).toBeLessThanOrEqual(1.62)
      expect(footprintList(area, 6)).toEqual(list.slice(0, 6))
    }
  })
})

describe('planKey', () => {
  it('形式の検査（v1 形式とバリアント付き）', () => {
    expect(parsePlanKey('2-18x14')).toEqual({ arch: 2, W: 18, H: 14 })
    expect(parsePlanKey('1-16x14-E01000')).toEqual({
      arch: 1, W: 16, H: 14, variant: { stairEnd: 'E', rev: [false, true, false, false], bedShift: 0 },
    })
    expect(parsePlanKey('0-16x14-W1011m')?.variant).toEqual({ stairEnd: 'W', rev: [true, false, true, true], bedShift: -1 })
    for (const bad of ['3-1x1', '1-0x5', '1-5x0', '', 'a', null, 12, '1-123x4', ' 1-5x5', '1-16x14-X01000', '1-16x14-E0100', '1-16x14-E01003', '1-16x14-E01000x']) {
      expect(isPlanKey(bad), String(bad)).toBe(false)
    }
  })
  it('planKey は variant なしなら従来形式、ありなら接尾辞つき（往復できる）', () => {
    expect(planKey({ arch: 1, W: 16, H: 14 })).toBe('1-16x14')
    expect(planKey({ arch: 1, W: 16, H: 14, variant: CANONICAL })).toBe('1-16x14-E00000')
    for (const p of enumeratePlans(defined(CONDITIONS[0]).cfg).slice(0, 40)) {
      const k = parsePlanKey(planKey(p))
      expect(k?.variant).toEqual(p.variant)
    }
  })
  it('planFromKey は列挙した案を同一に再構築する', () => {
    for (const { cfg } of CONDITIONS) {
      for (const p of enumeratePlans(cfg)) expect(JSON.stringify(planFromKey(cfg, planKey(p)))).toBe(JSON.stringify(p))
    }
  })
  it('planFromKey: 不正・作れない key・平屋のarch2・v1 の key（接尾辞なし）は null', () => {
    const one = defined(CONDITIONS.find((c) => c.cfg.floors === 1)).cfg
    expect(planFromKey(one, '2-16x16-E00000')).toBeNull()
    expect(planFromKey(one, 'zzz')).toBeNull()
    expect(planFromKey(one, '0-29x29-E00000')).toBeNull() // 外形が上位10件に入らない
    const two = defined(CONDITIONS[0]).cfg
    const p = defined(enumeratePlans(two)[0])
    expect(planFromKey(two, `${p.arch}-${p.W}x${p.H}`)).toBeNull() // v1 の key
    expect(planFromKey(one, '0-20x12-W00000')).toBeNull() // 平屋に stairEnd=W は作れない
  })
})
