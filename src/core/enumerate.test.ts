import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { MAX_ENUMERATED, enumeratePlans, isPlanKey, parsePlanKey, planFromKey, planKey } from './enumerate'
import { footprintCandidates, footprintList } from './slicing'
import { mulberry32 } from './rng'
import type { PlanConfig } from './types'
import { BOUNDARY, CONDITIONS, SEEDS, defined, independentViolations } from './testing'

const ALL: { name: string; cfg: PlanConfig; expected?: number }[] = [...CONDITIONS, ...BOUNDARY]

describe('enumeratePlans', () => {
  for (const { name, cfg, expected } of ALL) {
    it(`${name}: generatePlans の案が全て含まれる（反転同一視）`, () => {
      const all = enumeratePlans(cfg)
      // 境界条件は件数を明示して固定する（0案・2案のまま空転せず、挙動が変わったら気づける）
      if (expected !== undefined) expect(all.length, '列挙件数').toBe(expected)
      for (const seed of SEEDS) {
        const gen = generatePlans(cfg, seed)
        if (expected !== undefined) expect(gen.length, `seed=${seed} の生成件数`).toBe(expected)
        for (const p of gen) {
          expect(all.some((a) => a.sig === p.sig || a.sigM === p.sig), `seed=${seed} ${planKey(p)}`).toBe(true)
          // key は反転同一の別アーキタイプ（吹抜ありの arch1/arch2 など）に置き換わることがあるので、再構築はできることだけ確認
          expect(planFromKey(cfg, planKey(p)), `seed=${seed} ${planKey(p)}`).not.toBeNull()
        }
      }
    })

    it(`${name}: 全件 独立検証を通過・sig 重複なし・件数上限・スコア降順・再現性`, () => {
      const all = enumeratePlans(cfg)
      expect(all.length).toBeLessThanOrEqual(MAX_ENUMERATED)
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

  it('入力 cfg を破壊しない', () => {
    const { cfg } = defined(CONDITIONS[0])
    const before = JSON.stringify(cfg)
    enumeratePlans(cfg)
    expect(JSON.stringify(cfg)).toBe(before)
  })

  it('空振り防止: 人気条件では3案より多く列挙できる', () => {
    for (const { cfg } of CONDITIONS.slice(0, 3)) expect(enumeratePlans(cfg).length).toBeGreaterThan(3)
  })
})

describe('footprintList', () => {
  it('footprintCandidates はその並べ替え（同じ集合）', () => {
    for (const area of [240, 300, 480, 560]) {
      const base = footprintList(area).map((f) => `${f.W}x${f.H}`).sort()
      const shuffled = footprintCandidates(area, mulberry32(7)).map((f) => `${f.W}x${f.H}`).sort()
      expect(shuffled).toEqual(base)
      expect(base.length).toBeLessThanOrEqual(6)
    }
  })
})

describe('planKey', () => {
  it('形式の検査', () => {
    expect(parsePlanKey('2-18x14')).toEqual({ arch: 2, W: 18, H: 14 })
    for (const bad of ['3-1x1', '1-0x5', '1-5x0', '', 'a', null, 12, '1-123x4', ' 1-5x5']) expect(isPlanKey(bad), String(bad)).toBe(false)
  })
  it('planFromKey は列挙した案を同一に再構築する', () => {
    for (const { cfg } of CONDITIONS) {
      for (const p of enumeratePlans(cfg)) expect(JSON.stringify(planFromKey(cfg, planKey(p)))).toBe(JSON.stringify(p))
    }
  })
  it('planFromKey: 不正・作れない key・平屋のarch2は null', () => {
    const one = defined(CONDITIONS.find((c) => c.cfg.floors === 1)).cfg
    expect(planFromKey(one, '2-16x16')).toBeNull()
    expect(planFromKey(one, 'zzz')).toBeNull()
    expect(planFromKey(one, '0-29x29')).toBeNull() // 外形が上位6件に入らない
  })
})
