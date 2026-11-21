import { describe, expect, it } from 'vitest'
import { generatePlans } from '../core/generate'
import { CONDITIONS } from '../core/testing'
import { nextDistinctSeed, plansKey } from './seedNav'

describe('plansKey', () => {
  it('順序に依存しない', () => {
    expect(plansKey(['b', 'a', 'c'])).toBe(plansKey(['c', 'b', 'a']))
    expect(plansKey(['a', 'b'])).not.toBe(plansKey(['a', 'c']))
  })
})

describe('nextDistinctSeed（偽の sigsOf）', () => {
  it('seed+1 が違う組ならそれを返す', () => {
    expect(nextDistinctSeed(10, (s) => [`s${s}`])).toBe(11)
  })
  it('同じ組が続くあいだ飛ばして、最初に違う組になる seed を返す', () => {
    const sigsOf = (s: number) => (s < 14 ? ['a', 'b', 'c'] : ['a', 'b', 'd'])
    expect(nextDistinctSeed(10, sigsOf)).toBe(14)
  })
  it('順序違いだけの組は同じ組とみなして飛ばす', () => {
    const sigsOf = (s: number) => (s < 13 ? (s % 2 ? ['c', 'b', 'a'] : ['a', 'b', 'c']) : ['x'])
    expect(nextDistinctSeed(10, sigsOf)).toBe(13)
  })
  it('maxTries 以内に見つからなければ seed+1', () => {
    let calls = 0
    const r = nextDistinctSeed(5, () => { calls++; return ['a'] }, 30)
    expect(r).toBe(6)
    expect(calls).toBe(31) // 現在 + 30回
  })
  it('maxTries ちょうどの位置で見つかれば返す', () => {
    const sigsOf = (s: number) => (s === 40 ? ['z'] : ['a'])
    expect(nextDistinctSeed(10, sigsOf, 30)).toBe(40)
    expect(nextDistinctSeed(10, sigsOf, 29)).toBe(11)
  })
})

describe('nextDistinctSeed（実生成）', () => {
  const cond = CONDITIONS.find((c) => c.name === '36坪/2階/吹抜+WIC+書斎')
  it('36坪/2階/吹抜+WIC+書斎: 返った seed の3案の組は現在と違う', () => {
    expect(cond).toBeDefined()
    if (!cond) return
    const sigsOf = (s: number) => generatePlans(cond.cfg, s).map((p) => p.sig)
    let seed = 20261121
    let moved = 0
    for (let i = 0; i < 15; i++) {
      const next = nextDistinctSeed(seed, sigsOf)
      const changed = plansKey(sigsOf(next)) !== plansKey(sigsOf(seed))
      if (changed) moved++
      expect(changed, `seed=${seed}→${next}`).toBe(true)
      expect(next).toBeGreaterThan(seed)
      seed = next
    }
    expect(moved).toBe(15)
  })
})
