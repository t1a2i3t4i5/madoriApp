import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { validatePlan } from './validate'
import { feasibility } from './program'
import type { PlanConfig } from './types'

const base = { parking: 2, garden: 1, feats: ['kitchenFace', 'wic'] } as const
const POPULAR: [string, PlanConfig][] = [
  ['30坪/2階/個室3', { ...base, feats: [...base.feats], area: 30, floors: 2, rooms: 3 }],
  ['30坪/平屋/個室3', { ...base, feats: [...base.feats], area: 30, floors: 1, rooms: 3 }],
  ['35坪/2階/個室4', { ...base, feats: [...base.feats], area: 35, floors: 2, rooms: 4 }],
]
const SEEDS = [1, 2, 3, 20261121, 99999]

describe('人気条件での生成', () => {
  for (const [name, cfg] of POPULAR) {
    it(`${name}: 複数seedで3案生成できる`, () => {
      expect(feasibility(cfg).ok).toBe(true)
      for (const seed of SEEDS) {
        expect(generatePlans(cfg, seed), `seed=${seed}`).toHaveLength(3)
      }
    })

    it(`${name}: 生成プランがハード制約を満たす`, () => {
      for (const seed of SEEDS) {
        for (const p of generatePlans(cfg, seed)) {
          expect(validatePlan(p)).toBe(true)
          for (const fl of p.floors) {
            const sum = fl.rooms.reduce((s, r) => s + r.w * r.h, 0)
            expect(sum).toBe(p.W * p.H)
          }
          if (cfg.floors === 2) {
            const [a, b] = p.floors.map((f) => f.rooms.find((r) => r.type === 'stair')!)
            expect([a.x, a.y, a.w]).toEqual([b.x, b.y, b.w])
          }
        }
      }
    })

    it(`${name}: 同じseed+入力で同じ結果（再現性）`, () => {
      for (const seed of SEEDS) {
        expect(JSON.stringify(generatePlans(cfg, seed))).toBe(JSON.stringify(generatePlans(cfg, seed)))
      }
    })
  }

  it('吹抜はLDK直上に収まる', () => {
    const cfg: PlanConfig = { area: 32, floors: 2, rooms: 3, parking: 1, garden: 1, feats: ['void'] }
    for (const p of generatePlans(cfg, 5)) {
      const ldk = p.floors[0].rooms.find((r) => r.type === 'ldk')!
      const vd = p.floors[1].rooms.find((r) => r.type === 'void')!
      expect(vd.x).toBeGreaterThanOrEqual(ldk.x)
      expect(vd.x + vd.w).toBeLessThanOrEqual(ldk.x + ldk.w)
    }
  })
})

describe('実現可能性', () => {
  it('20坪+個室5 は理由と代替案つきで不可になる', () => {
    const r = feasibility({ area: 20, floors: 2, rooms: 5, parking: 0, garden: 0, feats: [] })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.reason).toContain('坪')
      expect(r.alts.length).toBeGreaterThan(0)
    }
  })
  it('平屋+吹抜は不可', () => {
    expect(feasibility({ area: 30, floors: 1, rooms: 3, parking: 0, garden: 0, feats: ['void'] }).ok).toBe(false)
  })
})
