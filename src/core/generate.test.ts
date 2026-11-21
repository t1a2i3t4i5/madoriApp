import { describe, expect, it } from 'vitest'
import { candidatePool, generatePlans, selectPlans } from './generate'
import { planKey } from './enumerate'
import { validatePlan } from './validate'
import { diagnoseEmpty, feasibility } from './program'
import { BOUNDARY, CONDITIONS, SEEDS, ZERO_PLAN, defined } from './testing'
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

  it('30坪/2階/個室3: seed 1..30 の3案の組がすべて異なる', () => {
    const { cfg } = defined(CONDITIONS[0])
    const sets = new Set<string>()
    for (let seed = 1; seed <= 30; seed++) {
      const keys = generatePlans(cfg, seed).map(planKey).sort()
      expect(keys, `seed=${seed}`).toHaveLength(3)
      sets.add(keys.join('+'))
    }
    expect(sets.size).toBe(30)
  })

  it('候補プールは seed に依存せず、選抜は pool を書き換えない', () => {
    const { cfg } = defined(CONDITIONS[0])
    const pool = candidatePool(cfg)
    const before = JSON.stringify(pool)
    for (const seed of [1, 2, 2 ** 40 + 5]) selectPlans(pool, seed)
    expect(JSON.stringify(candidatePool(cfg))).toBe(before)
    expect(candidatePool({ ...cfg, parking: 0, feats: [...cfg.feats].reverse() })).toBe(pool) // メモ化（parking は生成に関係せず、feats の順序も無関係）
  })

  it('selectPlans: 3案はプールの案で重複せず、最良から8点以内の窓から主に選ばれる', () => {
    const { cfg } = defined(CONDITIONS[0])
    const pool = candidatePool(cfg)
    const best = defined(pool[0]).score.total
    for (let seed = 1; seed <= 30; seed++) {
      const sel = selectPlans(pool, seed)
      expect(new Set(sel.map(planKey)).size).toBe(sel.length)
      for (const p of sel) expect(p.score.total).toBeGreaterThanOrEqual(best - 8)
    }
    expect(selectPlans([], 1)).toEqual([])
    expect(selectPlans(pool.slice(0, 2), 1)).toHaveLength(2)
  })

  it('洋室のラベルは位置順（北→南、西→東）で洋室1..n', () => {
    let beds = 0
    for (const { cfg } of CONDITIONS) {
      for (const p of candidatePool(cfg).slice(0, 60)) {
        for (const fl of p.floors) {
          const list = fl.rooms.filter((r) => r.type === 'bed').sort((a, b) => a.y - b.y || a.x - b.x)
          list.forEach((r, i) => expect(r.name).toBe('洋室' + (i + 1)))
          beds += list.length
        }
      }
    }
    expect(beds).toBeGreaterThan(0)
  })

  it('吹抜はLDK直上（x方向・y方向とも）に収まる', () => {
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
        expect(vd.y).toBeGreaterThanOrEqual(ldk.y)
        expect(vd.y + vd.h).toBeLessThanOrEqual(ldk.y + ldk.h)
        checked++
      }
    }
    expect(checked).toBeGreaterThanOrEqual(SEEDS.length)
  })
})

describe('0案の診断 diagnoseEmpty', () => {
  const zeros = [
    { name: 'ZERO_PLAN', cfg: ZERO_PLAN },
    ...BOUNDARY.filter((b) => b.expected === 0).map((b) => ({ name: b.name, cfg: b.cfg })),
  ]

  it('0案の条件は実現可能と判定されるのに、全 seed で0案', () => {
    expect(zeros.length).toBeGreaterThanOrEqual(3)
    for (const { name, cfg } of zeros) {
      expect(feasibility(cfg).ok, name).toBe(true)
      for (const seed of SEEDS) expect(generatePlans(cfg, seed), `${name} seed=${seed}`).toHaveLength(0)
    }
  })

  it('理由が出て、代替案は最大3件で、どれを適用しても実際に3案出る', () => {
    for (const { name, cfg } of zeros) {
      const d = diagnoseEmpty(cfg)
      expect(d.reason.length, name).toBeGreaterThan(10)
      expect(d.alts.length, name).toBeLessThanOrEqual(3)
      expect(d.alts.length, `${name}: 代替案が1件以上ある`).toBeGreaterThan(0)
      for (const a of d.alts) {
        const patched = { ...cfg, ...a.patch }
        expect(feasibility(patched).ok, `${name} → ${a.label}`).toBe(true)
        expect(generatePlans(patched, 1), `${name} → ${a.label}`).toHaveLength(3)
      }
    }
  })

  it('入力 cfg を破壊しない', () => {
    const before = JSON.stringify(ZERO_PLAN)
    diagnoseEmpty(ZERO_PLAN)
    expect(JSON.stringify(ZERO_PLAN)).toBe(before)
  })

  it('境界で不適切な提案をしない（40坪を超える延床・個室2からの減室を出さない）', () => {
    const labels = (cfg: PlanConfig) => diagnoseEmpty(cfg).alts.map((a) => a.label)
    expect(labels({ ...ZERO_PLAN, area: 40 }).some((l) => l.startsWith('延床を'))).toBe(false)
    expect(labels({ ...ZERO_PLAN, rooms: 2 }).some((l) => l.startsWith('個室を'))).toBe(false)
  })

  it('理由は1F/2Fのどちらが崩れたかを区別する（実測の条件で文面が変わる）', () => {
    const reasons = new Set(zeros.map(({ cfg }) => diagnoseEmpty(cfg).reason))
    expect(reasons.size).toBeGreaterThan(1)
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
