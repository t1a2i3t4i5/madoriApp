import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { validatePlan } from './validate'
import { fallbackAlts, feasibility } from './program'
import { CONDITIONS, SEEDS, ZERO_PLAN } from './testing'
import type { PlanConfig } from './types'

const POPULAR = CONDITIONS.slice(0, 3).map(({ name, cfg }): [string, PlanConfig] => [name, cfg])

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
            const [a, b] = p.floors.map((f) => f.rooms.find((r) => r.type === 'stair'))
            expect(a, '1Fに階段がある').toBeDefined()
            expect(b, '2Fに階段がある').toBeDefined()
            expect([a?.x, a?.y, a?.w]).toEqual([b?.x, b?.y, b?.w])
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

  it('吹抜はLDK直上（x方向）に収まる', () => {
    const cfg: PlanConfig = { area: 32, floors: 2, rooms: 3, parking: 1, garden: 1, feats: ['void'] }
    let checked = 0
    for (const seed of SEEDS) {
      const plans = generatePlans(cfg, seed)
      // 空振り防止: 案が0だとループが回らず検証が素通りしてしまう
      expect(plans.length, `seed=${seed}`).toBeGreaterThan(0)
      for (const p of plans) {
        const ldk = p.floors[0]?.rooms.find((r) => r.type === 'ldk')
        const vd = p.floors[1]?.rooms.find((r) => r.type === 'void')
        expect(ldk, 'LDKがある').toBeDefined()
        expect(vd, '吹抜がある').toBeDefined()
        if (!ldk || !vd) continue
        expect(vd.x).toBeGreaterThanOrEqual(ldk.x)
        expect(vd.x + vd.w).toBeLessThanOrEqual(ldk.x + ldk.w)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(SEEDS.length)
  })
})

describe('生成0案のフォールバック', () => {
  it('実現可能なのに検証を通る案が0になる条件では fallbackAlts が調整案を返す', () => {
    expect(feasibility(ZERO_PLAN).ok).toBe(true)
    for (const seed of SEEDS) expect(generatePlans(ZERO_PLAN, seed), `seed=${seed}`).toHaveLength(0)
    const alts = fallbackAlts(ZERO_PLAN)
    expect(alts.length).toBeGreaterThan(0)
    expect(alts.map((a) => a.label)).toContain('こだわりを全部外す')
  })

  it('調整案のいずれかを適用すると案が出る', () => {
    const recovered = fallbackAlts(ZERO_PLAN).filter((a) => {
      const cfg = { ...ZERO_PLAN, ...a.patch }
      return feasibility(cfg).ok && generatePlans(cfg, 1).length > 0
    })
    expect(recovered.length).toBeGreaterThan(0)
  })

  it('fallbackAlts は境界で不適切な提案をしない', () => {
    const labels = (cfg: PlanConfig) => fallbackAlts(cfg).map((a) => a.label)
    expect(labels({ ...ZERO_PLAN, area: 40 }).some((l) => l.startsWith('延床を'))).toBe(false)
    expect(labels({ ...ZERO_PLAN, rooms: 2 }).some((l) => l.startsWith('個室を'))).toBe(false)
    expect(labels({ ...ZERO_PLAN, feats: [] })).not.toContain('こだわりを全部外す')
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
