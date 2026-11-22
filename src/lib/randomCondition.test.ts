import { describe, expect, it } from 'vitest'
import { mulberry32 } from '../core/rng'
import { generatePlans } from '../core/generate'
import { feasibility } from '../core/program'
import { randomConfig } from './randomCondition'

describe('おまかせ条件', () => {
  it('常に実現可能で、3案が出て、範囲内・再現可能', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const cfg = randomConfig(mulberry32(seed))
      expect(cfg, `seed=${seed}`).not.toBeNull()
      if (!cfg) continue
      expect(feasibility(cfg).ok).toBe(true)
      expect(generatePlans(cfg, 1), `seed=${seed}`).toHaveLength(3)
      expect(cfg.area).toBeGreaterThanOrEqual(20)
      expect(cfg.area).toBeLessThanOrEqual(40)
      expect(cfg.rooms).toBeGreaterThanOrEqual(2)
      expect(cfg.rooms).toBeLessThanOrEqual(5)
      expect(randomConfig(mulberry32(seed))).toEqual(cfg)
    }
  }, 120_000)
  it('呼び出し側が指定した seed でも3案が出る', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const cfg = randomConfig(mulberry32(seed), 200, 777)
      expect(cfg, `seed=${seed}`).not.toBeNull()
      if (cfg) expect(generatePlans(cfg, 777)).toHaveLength(3)
    }
  }, 60_000)
  it('試行回数が尽きたら null（常に同じ作れない条件を引く rng で、実際に試行を使い切る）', () => {
    // rng が常に 0: 22坪/2階/個室2/こだわり全部 → 実現不可能。毎回棄却される
    const stuck = { area: 22, floors: 2 as const, rooms: 2, parking: 0, garden: 0, feats: ['kitchenFace', 'doma', 'study', 'wic', 'pantry', 'void', 'washitsu', 'laundry'] as const }
    expect(feasibility({ ...stuck, feats: [...stuck.feats] }).ok, '前提: この条件は作れない').toBe(false)
    let calls = 0
    const rng = () => { calls++; return 0 }
    expect(randomConfig(rng, 5)).toBeNull()
    expect(calls, '5回の試行がすべて使われた').toBeGreaterThan(5)
    // 試行回数を増やしても同様に尽きる（上限が効いている）
    const calls5 = calls
    calls = 0
    expect(randomConfig(rng, 10)).toBeNull()
    expect(calls).toBeGreaterThan(calls5)
  })
  it('条件が散らばる（毎回同じではない）', () => {
    const set = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(randomConfig(mulberry32(i + 1)))))
    expect(set.size).toBeGreaterThan(20)
  }, 60_000)
})
