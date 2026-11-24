import { describe, expect, it } from 'vitest'
import { generatePlans } from '../core/generate'
import { CONDITIONS, defined } from '../core/testing'
import { nextDistinctSeed, plansKey } from './seedNav'

describe('plansKey', () => {
  it('順序に依存しない', () => {
    expect(plansKey(['b', 'a', 'c'])).toBe(plansKey(['c', 'b', 'a']))
    expect(plansKey(['a', 'b'])).not.toBe(plansKey(['a', 'c']))
  })
})

describe('nextDistinctSeed（偽の sigsOf）', () => {
  it('seed+1 が違う組ならそれを返す', () => {
    expect(nextDistinctSeed(10, (s) => [`s${s}`])).toEqual({ seed: 11, found: true })
  })
  it('同じ組が続くあいだ飛ばして、最初に違う組になる seed を返す', () => {
    const sigsOf = (s: number) => (s < 14 ? ['a', 'b', 'c'] : ['a', 'b', 'd'])
    expect(nextDistinctSeed(10, sigsOf)).toEqual({ seed: 14, found: true })
  })
  it('順序違いだけの組は同じ組とみなして飛ばす', () => {
    const sigsOf = (s: number) => (s < 13 ? (s % 2 ? ['c', 'b', 'a'] : ['a', 'b', 'c']) : ['x'])
    expect(nextDistinctSeed(10, sigsOf)).toEqual({ seed: 13, found: true })
  })
  it('maxTries 以内に見つからなければ seed+1 で found:false', () => {
    let calls = 0
    const r = nextDistinctSeed(5, () => { calls++; return ['a'] }, 30)
    expect(r).toEqual({ seed: 6, found: false })
    expect(calls).toBe(31) // 現在 + 30回
  })
  it('maxTries ちょうどの位置で見つかれば返す', () => {
    const sigsOf = (s: number) => (s === 40 ? ['z'] : ['a'])
    expect(nextDistinctSeed(10, sigsOf, 30)).toEqual({ seed: 40, found: true })
    expect(nextDistinctSeed(10, sigsOf, 29)).toEqual({ seed: 11, found: false })
  })
  it('currentSigs を渡すと現在の seed の生成を省く（呼び出しは seed+1 以降のみ）', () => {
    const asked: number[] = []
    const sigsOf = (s: number) => { asked.push(s); return s < 12 ? ['a'] : ['b'] }
    expect(nextDistinctSeed(10, sigsOf, 30, ['a'])).toEqual({ seed: 12, found: true })
    expect(asked).toEqual([11, 12])
    expect(nextDistinctSeed(10, () => ['a'], 3, ['a']).found).toBe(false)
  })
})

describe('nextDistinctSeed（実生成）', () => {
  const cond = defined(CONDITIONS.find((c) => c.name === '40坪/2階/吹抜+WIC+書斎'))
  it('40坪/2階/吹抜+WIC+書斎: 見つかった seed の3案の組は現在と違い、前進し続ける', () => {
    const sigsOf = (s: number) => generatePlans(cond.cfg, s).map((p) => p.sig)
    let seed = 20261121
    for (let i = 0; i < 15; i++) {
      const current = sigsOf(seed)
      const r = nextDistinctSeed(seed, sigsOf, 30, current)
      expect(r.found, `seed=${seed}`).toBe(true)
      expect(plansKey(sigsOf(r.seed)), `seed=${seed}→${r.seed}`).not.toBe(plansKey(current))
      expect(r.seed).toBeGreaterThan(seed)
      seed = r.seed
    }
  })
  it('currentSigs あり・なしで結果が同じ', () => {
    const sigsOf = (s: number) => generatePlans(cond.cfg, s).map((p) => p.sig)
    expect(nextDistinctSeed(20261121, sigsOf, 30, sigsOf(20261121))).toEqual(nextDistinctSeed(20261121, sigsOf))
  })
})
