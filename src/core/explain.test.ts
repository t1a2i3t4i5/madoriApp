import { describe, expect, it } from 'vitest'
import { enumeratePlans } from './enumerate'
import { explainPlan } from './explain'
import { CONDITIONS, defined } from './testing'
import type { ScoredPlan } from './types'

const cond = (name: string) => defined(CONDITIONS.find((c) => c.name === name), name)
const sentenceCount = (t: string) => t.split('。').filter(Boolean).length

describe('explainPlan', () => {
  it('全条件の全候補で2〜3文・日本語・決定的', () => {
    for (const { cfg } of CONDITIONS) {
      for (const p of enumeratePlans(cfg).slice(0, 12)) {
        const t = explainPlan(cfg, p)
        const n = sentenceCount(t)
        expect(n).toBeGreaterThanOrEqual(2)
        expect(n).toBeLessThanOrEqual(3)
        expect(t.endsWith('。')).toBe(true)
        expect(explainPlan(cfg, p)).toBe(t)
      }
    }
  })

  it('平屋: 南LDK・ワンフロア・水回り集約に触れ、2階建て用の語を含まない', () => {
    const { cfg } = cond('30坪/平屋/個室3')
    const p = defined(enumeratePlans(cfg)[0])
    const t = explainPlan(cfg, p)
    expect(t).toContain('LDKは南側')
    expect(t).toContain('ワンフロア')
    expect(p.score.parts.水回り集約).toBeGreaterThanOrEqual(0.8)
    expect(t).toContain('水回り')
    expect(t).not.toContain('階段')
    expect(t).not.toContain('吹抜')
  })

  it('吹抜あり: 吹抜と階段位置に触れる', () => {
    const { cfg } = cond('32坪/2階/吹抜')
    const t = explainPlan(cfg, defined(enumeratePlans(cfg)[0]))
    expect(t).toContain('吹抜')
    expect(t).toMatch(/階段は[東西]端/)
    expect(t).toContain('1FのLDK')
  })

  it('吹抜なし条件の案には吹抜と書かない', () => {
    const { cfg } = cond('30坪/2階/個室3')
    for (const p of enumeratePlans(cfg).slice(0, 10)) expect(explainPlan(cfg, p)).not.toContain('吹抜')
  })

  it('収納率: パントリー・WIC等が多い案だけ「収納」に触れる', () => {
    const { cfg } = cond('33坪/2階/土間+パントリー')
    const plans = enumeratePlans(cfg)
    const store = (p: ScoredPlan) => p.floors.flatMap((f) => f.rooms).filter((r) => ['pantry', 'wic', 'store'].includes(r.type)).reduce((s, r) => s + r.area, 0) / p.totalArea
    const hi = plans.find((p) => store(p) >= 0.07)
    expect(hi).toBeDefined()
    expect(explainPlan(cfg, defined(hi))).toContain('収納')
    const lo = plans.find((p) => store(p) < 0.07)
    if (lo) expect(explainPlan(cfg, lo)).not.toContain('収納は多め')
  })

  it('廊下: 短い案は「廊下」を短いと書き、長い案は弱点として挙げる', () => {
    const { cfg } = cond('30坪/2階/個室3')
    const ratio = (p: ScoredPlan) => p.floors.flatMap((f) => f.rooms).filter((r) => r.type === 'hall').reduce((s, r) => s + r.area, 0) / p.totalArea
    const long = enumeratePlans(cfg).find((p) => ratio(p) >= 0.11)
    expect(long).toBeDefined()
    expect(explainPlan(cfg, defined(long))).toContain('廊下がやや長い')
  })

  it('階段が個室に面していない案と面している案で文言が分かれる', () => {
    const { cfg } = cond('30坪/2階/個室3')
    const texts = new Set(enumeratePlans(cfg).map((p) => /階段は[東西]端(にあり|に寄せ)/.exec(explainPlan(cfg, p))?.[1]))
    expect(texts.has('にあり')).toBe(true)
    expect(texts.has('に寄せ')).toBe(true)
  })
})
