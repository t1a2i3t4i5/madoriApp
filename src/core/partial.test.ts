import { describe, expect, it } from 'vitest'
import { candidatePool, generatePlans, poolBuildStats } from './generate'
import { enumeratePlans, parsePlanKey, planFromKey, planKey } from './enumerate'
import { footprintPairs, PAIR_LIMIT } from './slicing'
import { diagnoseEmpty, feasibility } from './program'
import { planTags } from './describe'
import { explainPlan } from './explain'
import { validatePlan } from './validate'
import { PARTIAL_CONDITIONS, SEEDS, defined, footprintViolations, independentViolations } from './testing'
import type { Plan, PlanConfig } from './types'
import { floorRect, isPartial } from './types'

const POPULAR = PARTIAL_CONDITIONS.slice(0, 3)
const base = { parking: 1, garden: 1 }
const cfgOf = (area: number, rooms: number, feats: PlanConfig['feats'], story?: PlanConfig['story'], floors: 1 | 2 = 2): PlanConfig =>
  ({ ...base, area, floors, rooms, feats, ...(story ? { story } : {}) })

describe('footprintPairs（部分二階の外形の組）', () => {
  it('形ごとに上位6件・計12件、決定的で、一辺共有・下限・2F割合を満たす', () => {
    for (const area of [26, 30, 35, 40]) {
      const a = footprintPairs(area * 16)
      expect(a).toEqual(footprintPairs(area * 16))
      expect(a.filter((p) => p.shape === 'ew')).toHaveLength(PAIR_LIMIT)
      expect(a.filter((p) => p.shape === 'south')).toHaveLength(PAIR_LIMIT)
      for (const p of a) {
        const ratio = (p.W2 * p.H2) / (p.W * p.H + p.W2 * p.H2)
        expect(ratio).toBeGreaterThanOrEqual(0.35)
        expect(ratio).toBeLessThanOrEqual(0.45)
        if (p.shape === 'ew') {
          expect(p.H2).toBe(p.H)
          expect(p.W - p.W2).toBeGreaterThanOrEqual(3)
          expect(p.W2).toBeGreaterThanOrEqual(9)
        } else {
          expect(p.W2).toBe(p.W)
          expect(p.H - p.H2).toBeGreaterThanOrEqual(3)
          expect(p.H2).toBeGreaterThanOrEqual(13)
        }
      }
      // 各形の先頭は総面積が目標に最も近い
      expect(a[0]?.diff).toBeLessThanOrEqual(a[PAIR_LIMIT - 1]?.diff ?? Infinity)
    }
  })
})

describe('部分二階の生成', () => {
  for (const { name, cfg } of PARTIAL_CONDITIONS) {
    it(`${name}: 実効 story は partial で、生成案が不変条件を満たす`, () => {
      expect(isPartial(cfg)).toBe(true)
      expect(feasibility(cfg).ok).toBe(true)
      let n = 0
      for (const seed of SEEDS) {
        for (const p of generatePlans(cfg, seed)) {
          n++
          expect(validatePlan(p)).toBe(true)
          expect(independentViolations(p), `seed=${seed} ${planKey(p)}`).toEqual([])
          expect(footprintViolations(p)).toEqual([])
          // 2F ⊂ 1F、2Fだけに fp、板の内側は完全充填
          const [f1, f2] = p.floors
          expect(f1?.fp).toBeUndefined()
          const rc = defined(f2?.fp)
          expect(rc.x >= 0 && rc.y >= 0 && rc.x + rc.W <= p.W && rc.y + rc.H <= p.H).toBe(true)
          expect(floorRect(p, 1)).toEqual(rc)
          expect(defined(f2).rooms.reduce((s, r) => s + r.w * r.h, 0)).toBe(rc.W * rc.H)
          expect(defined(f1).rooms.reduce((s, r) => s + r.w * r.h, 0)).toBe(p.W * p.H)
          expect(p.totalArea).toBe(p.W * p.H + rc.W * rc.H)
          // 階段の両階一致
          const [s1, s2] = p.floors.map((f) => defined(f.rooms.find((r) => r.type === 'stair')))
          expect([s1?.x, s1?.y, s1?.w]).toEqual([s2?.x, s2?.y, s2?.w])
          // 吹抜 ⊂ LDK（x・y）
          const vd = f2?.rooms.find((r) => r.type === 'void')
          if (cfg.feats.includes('void')) {
            const ldk = defined(f1?.rooms.find((r) => r.type === 'ldk'))
            const v = defined(vd)
            expect(v.x >= ldk.x && v.x + v.w <= ldk.x + ldk.w && v.y >= ldk.y && v.y + v.h <= ldk.y + ldk.h).toBe(true)
          }
        }
      }
      expect(n).toBeGreaterThan(0)
    })
  }

  for (const { name, cfg } of POPULAR) {
    it(`${name}: 複数 seed とも3案、再現性あり`, () => {
      for (const seed of SEEDS) {
        const a = generatePlans(cfg, seed)
        expect(a, `seed=${seed}`).toHaveLength(3)
        expect(JSON.stringify(a)).toBe(JSON.stringify(generatePlans({ ...cfg, feats: [...cfg.feats] }, seed)))
      }
    })
  }

  it('プール構築の組み立て回数に上限がある（1Fの割り付けと検証はメモ化される）', () => {
    for (const { cfg } of [...POPULAR, defined(PARTIAL_CONDITIONS[3])]) {
      const st = poolBuildStats(cfg)
      expect(st.poolSize).toBeGreaterThan(0)
      // 外形の組12 × アーキタイプ3 × 変種（distinct 後。2階建ての全変種は 2×16×4=128）が上限
      expect(st.assembled).toBeLessThanOrEqual(12 * 3 * 128)
      expect(st.assembled).toBeLessThanOrEqual(3600)
      // 1Fの割り付け: (arch, 1Fの板, stairEnd, rev[0], rev[1]) の個数が上限 = 12 × 3 × 2 × 4
      expect(st.f1Layouts).toBeLessThanOrEqual(12 * 3 * 2 * 4)
      expect(st.f1Validations).toBeLessThanOrEqual(st.f1Layouts)
      // メモが効いている（組み立てに対して 1F の割り付けは桁違いに少ない）
      expect(st.f1Layouts * 5).toBeLessThan(st.assembled)
    }
  })

  it('総二階の cfg（story 省略・full）とはキャッシュが混ざらず、平屋では story は無視される', () => {
    const cfg = cfgOf(32, 3, ['kitchenFace'])
    const full = candidatePool(cfg)
    const part = candidatePool({ ...cfg, story: 'partial' })
    expect(part).not.toBe(full)
    expect(full.every((p) => !p.floors[1]?.fp)).toBe(true)
    expect(part.every((p) => !!p.floors[1]?.fp)).toBe(true)
    expect(JSON.stringify(candidatePool({ ...cfg, story: 'full' }))).toBe(JSON.stringify(full))
    // もう一度（キャッシュ経由）でも混ざらない
    expect(candidatePool(cfg)).toBe(full)
    const flat = cfgOf(30, 3, ['kitchenFace'], undefined, 1)
    expect(isPartial({ ...flat, story: 'partial' })).toBe(false)
    expect(JSON.stringify(generatePlans({ ...flat, story: 'partial' }, 1))).toBe(JSON.stringify(generatePlans(flat, 1)))
  })
})

describe('部分二階の planKey', () => {
  const cfg = defined(PARTIAL_CONDITIONS[0]).cfg

  it('末尾に -p<W2>x<H2> が付き、planFromKey で同じ案に戻る', () => {
    for (const p of enumeratePlans(cfg).slice(0, 12)) {
      const key = planKey(p)
      const fp = defined(p.floors[1]?.fp)
      expect(key.endsWith(`-p${fp.W}x${fp.H}`)).toBe(true)
      expect(parsePlanKey(key)?.fp2).toEqual({ W2: fp.W, H2: fp.H })
      const back = defined(planFromKey(cfg, key))
      expect(JSON.stringify(back.floors)).toBe(JSON.stringify(p.floors))
      expect(planKey(back)).toBe(key)
    }
  })

  it('総二階の key は従来どおり（-p なし）で有効のまま。cfg と key の総二階/部分二階が食い違うと null', () => {
    const fullCfg = { ...cfg, story: 'full' as const }
    const fullPlan = defined(candidatePool(fullCfg)[0])
    const fk = planKey(fullPlan)
    expect(fk).not.toMatch(/-p\d/)
    expect(planFromKey(fullCfg, fk)).not.toBeNull()
    expect(planFromKey(cfg, fk)).toBeNull()
    const pk = planKey(defined(candidatePool(cfg)[0]))
    expect(planFromKey(fullCfg, pk)).toBeNull()
  })

  it('組が footprintPairs にない key・形式不正は null', () => {
    const p = defined(candidatePool(cfg)[0])
    const fp = defined(p.floors[1]?.fp)
    const [head] = planKey(p).split('-p')
    expect(planFromKey(cfg, `${head}-p${fp.W}x${fp.H + 1}`)).toBeNull()
    expect(planFromKey(cfg, `${head}-p0x5`)).toBeNull()
    expect(planFromKey(cfg, `${head}-p12`)).toBeNull()
    expect(parsePlanKey('1-18x14-p12x14')).toBeNull() // 変種なしの -p は不正
  })
})

describe('部分二階の feasibility / 診断', () => {
  it('2F の最低面積が 延床×0.45 に収まらなければ不可。代替の先頭は総二階（総二階なら可）', () => {
    const cfg = cfgOf(28, 4, [], 'partial')
    const f = feasibility(cfg)
    expect(f.ok).toBe(false)
    if (!f.ok) {
      expect(f.reason).toContain('部分二階')
      expect(f.alts[0]).toEqual({ label: '総二階にする', patch: { story: 'full' } })
    }
    expect(feasibility({ ...cfg, story: 'full' }).ok).toBe(true)
  })

  it('総二階（story 省略・full）・平屋の feasibility は部分二階の下限に影響されない', () => {
    for (const c of [cfgOf(28, 4, []), cfgOf(20, 5, []), cfgOf(30, 3, [], undefined, 1), cfgOf(26, 3, ['void'], undefined, 1)]) {
      expect(feasibility({ ...c, story: 'full' })).toEqual(feasibility(c))
      if (c.floors === 1) expect(feasibility({ ...c, story: 'partial' })).toEqual(feasibility(c))
    }
  })

  it('部分二階で0案のとき、代替の先頭に総二階（3案が出ると確かめ済み）と部分二階向けの理由', () => {
    const cfg = cfgOf(26, 3, ['void'], 'partial')
    expect(feasibility(cfg).ok).toBe(true)
    expect(candidatePool(cfg)).toHaveLength(0)
    const d = diagnoseEmpty(cfg)
    expect(d.reason).toContain('部分二階')
    expect(d.alts[0]).toEqual({ label: '総二階にする', patch: { story: 'full' } })
    expect(generatePlans({ ...cfg, ...d.alts[0]?.patch }, 1)).toHaveLength(3)
    for (const a of d.alts) expect(generatePlans({ ...cfg, feats: [...cfg.feats], ...a.patch }, 1)).toHaveLength(3)
  })

  it('総二階の診断の文言・代替には部分二階が出ない', () => {
    const d = diagnoseEmpty(cfgOf(26, 3, ['void']))
    expect(d.reason).not.toContain('部分二階')
    expect(d.alts.every((a) => a.patch.story === undefined)).toBe(true)
  })
})

describe('部分二階の describe / explain', () => {
  const cfg = defined(PARTIAL_CONDITIONS[0]).cfg
  const sideOf = (p: Plan) => {
    const fp = defined(p.floors[1]?.fp)
    return fp.y + fp.H < p.H ? '南' : fp.x > 0 ? '西' : '東'
  }

  it('タグの先頭は「部分二階」。総二階のタグには出ない', () => {
    for (const p of generatePlans(cfg, 1)) expect(planTags(cfg, p)[0]).toBe('部分二階')
    for (const p of generatePlans({ ...cfg, story: 'full' }, 1)) expect(planTags(cfg, p)).not.toContain('部分二階')
  })

  it('解説に2階の割合と下屋の方角が入る。総二階の解説には入らない', () => {
    for (const seed of SEEDS) {
      for (const p of generatePlans(cfg, seed)) {
        const text = explainPlan(cfg, p)
        const fp = defined(p.floors[1]?.fp)
        const tenths = Math.round(((fp.W * fp.H) / (p.W * p.H)) * 10)
        expect(text.startsWith(`2階は1階の約${tenths}割の部分二階で、${sideOf(p)}側に下屋がかかります。`)).toBe(true)
      }
    }
    for (const p of generatePlans({ ...cfg, story: 'full' }, 1)) expect(explainPlan(cfg, p)).not.toContain('部分二階')
  })
})
