import { describe, expect, it } from 'vitest'
import { candidatePool, dedupeBySig, generatePlans, generatePlansUncached, selectPlans } from './generate'
import { planSignature } from './diversity'
import { planKey } from './enumerate'
import { shortSideViolations, validatePlan } from './validate'
import { diagnoseEmpty, fewReason, feasibility } from './program'
import { BOUNDARY, CONDITIONS, SEEDS, ZERO_PLAN, defined, independentViolations } from './testing'
import type { Plan, PlanConfig, Room, ScoredPlan } from './types'

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

  // GEN_VERSION 4（R-EVAL-24、R-VERIFY-06）: 最小の短辺を入れても人気3条件が3案を保つ
  for (const [name, cfg] of POPULAR) {
    it(`${name}: seed 1〜20 すべてで3案。プールは30件以上。提示案の短辺・独立検証の違反は空`, () => {
      expect(candidatePool(cfg).length).toBeGreaterThanOrEqual(30) // 実測 288／36／432。30坪平屋が最も薄い
      for (let seed = 1; seed <= 20; seed++) {
        const plans = generatePlans(cfg, seed)
        expect(plans, `seed=${seed}`).toHaveLength(3)
        for (const p of plans) {
          for (const f of p.floors) expect(shortSideViolations(f.rooms), `seed=${seed} ${planKey(p)}`).toEqual([])
          expect(independentViolations(p), `seed=${seed} ${planKey(p)}`).toEqual([])
        }
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
  it('短辺が原因の0案（30坪/平屋/個室5）: 理由に短辺の文言があり、代替に「個室を4室にする」がある', () => {
    const cfg = defined(BOUNDARY.find((b) => b.name.includes('個室5'))).cfg
    expect(feasibility(cfg).ok).toBe(true)
    expect(candidatePool(cfg)).toHaveLength(0)
    const d = diagnoseEmpty(cfg)
    expect(d.reason).toContain('短辺')
    expect(d.reason).not.toContain('最低面積を満たせません')
    const alt = defined(d.alts.find((a) => a.label === '個室を4室にする'))
    expect(generatePlans({ ...cfg, feats: [...cfg.feats], ...alt.patch }, 1)).toHaveLength(3)
  })

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

/** 合成データ用: 部屋1つだけの1階プラン（score は指定値、sig は実際のシグネチャ） */
function synth(x: number, total: number, opts: { arch?: 0 | 1 | 2; y?: number } = {}): ScoredPlan {
  const room: Room = { type: 'ldk', name: 'LDK', x, y: opts.y ?? 0, w: 4, h: 4, area: 16, target: 16, minArea: 16 }
  const plan: Plan = { W: 10, H: 10, floors: [{ label: '1F', rooms: [room] }], arch: opts.arch ?? 0, totalArea: 100 }
  return {
    ...plan,
    score: {
      total,
      parts: { 採光: 0, 面積適合: 0, 縦横比: 0, 廊下の少なさ: 0, '動線・ドア': 0, 水回り集約: 0, '910モジュール': 0 },
    },
    sig: planSignature(plan, false),
    sigM: planSignature(plan, true),
  }
}

describe('selectPlans の補充順（合成 pool）', () => {
  // 全案が同じ位置 → 多様性しきい値を満たす2案目が作れず、補充に回る。窓（最良から8点）の外は pool 順の補充でだけ入る
  const inWindow = [synth(0, 50, { y: 0 }), synth(0, 49, { y: 0 }), synth(0, 48, { y: 0 })]
  const outside = [synth(0, 30), synth(0, 20)]
  const pool = [...inWindow, ...outside]

  it('窓の中を抽選順で先に使い、窓の外は pool 順で最後に補充する', () => {
    for (const seed of SEEDS) {
      const r = selectPlans(pool, seed, 5)
      expect(r).toHaveLength(5)
      expect(new Set(r).size).toBe(5)
      expect(new Set(r.slice(0, 3))).toEqual(new Set(inWindow))
      expect(r.slice(3)).toEqual(outside) // pool 順（スコア降順）
    }
  })
  it('抽選順は pool 順とは限らない（seed で窓内の並びが変わる）', () => {
    const orders = new Set(SEEDS.map((seed) => selectPlans(pool, seed, 3).map((p) => inWindow.indexOf(p)).join('')))
    expect(orders.size).toBeGreaterThan(1)
  })
  it('pool が count 未満なら全部返し、pool を書き換えない', () => {
    const copy = pool.slice()
    expect(selectPlans(pool.slice(0, 2), 1)).toHaveLength(2)
    selectPlans(pool, 1)
    expect(pool).toEqual(copy)
    expect(selectPlans([], 1)).toEqual([])
  })
  it('多様な案は多様性しきい値つきで先に選ばれる（遠い案が窓内にあれば、同位置の案より優先）', () => {
    const far = synth(6, 49, { arch: 1 })
    const p = [synth(0, 50), synth(0, 49.5), far]
    for (const seed of SEEDS) expect(selectPlans(p, seed, 2)).toContain(far)
  })
  it('2^32 以上の seed は上位ビットを畳み込む（seed32 = 下位 ^ 上位）', () => {
    const big = Array.from({ length: 12 }, (_, i) => synth(0, 50 - i * 0.1))
    const ids = (seed: number) => selectPlans(big, seed, 3).map((p) => big.indexOf(p)).join(',')
    const hi = 2 ** 40 + 5
    expect(ids(hi)).toBe(ids((5 ^ (2 ** 8)) >>> 0)) // 2**40 の上位32bit側は 2**8
    expect(ids(hi)).not.toBe(ids(5)) // 上位ビットが無視されていれば seed 5 と同じになってしまう
  })
})

describe('dedupeBySig（合成データ）', () => {
  // 実データでは「左右反転だけが違う重複」が0件で、この除去は発動しない。ここで合成データで固定する
  it('同一 sig は先着を残す', () => {
    const a = synth(0, 50)
    const dup = { ...synth(0, 40) }
    expect(dedupeBySig([a, dup])).toEqual([a])
  })
  it('左右反転（sigM が既出 sig と一致）の案を除く', () => {
    const a = synth(0, 50) // x=0..4 → 反転は x=6..10
    const mirror = synth(6, 49)
    expect(mirror.sig).toBe(a.sigM)
    expect(dedupeBySig([a, mirror])).toEqual([a])
    // 順序が逆でも先着が残る（反転側の sigM は元の sig と一致する）
    expect(dedupeBySig([mirror, a])).toEqual([mirror])
  })
  it('左右対称の案・無関係な案は残る', () => {
    const sym = synth(3, 50) // x=3..7 は W=10 の中央 → 反転しても同じ
    const other = synth(1, 49)
    expect(sym.sig).toBe(sym.sigM)
    expect(dedupeBySig([sym, other])).toEqual([sym, other])
  })
  it('入力を書き換えない', () => {
    const list = [synth(0, 50), synth(6, 49)]
    dedupeBySig(list)
    expect(list).toHaveLength(2)
  })
})

describe('診断とキャッシュ', () => {
  it('generatePlansUncached は generatePlans と同じ結果を返す', () => {
    for (const [, cfg] of POPULAR) {
      expect(generatePlansUncached(cfg, 7).map(planKey)).toEqual(generatePlans(cfg, 7).map(planKey))
    }
  })
  it('1〜2案の理由文は0案前提の文言（「収まりませんでした」など）を含まない', () => {
    // 現行の実データには 1〜2案になる条件が無い（0案か3案）ので、理由文は関数で直接検証する
    for (const n of [1, 2]) {
      const r = fewReason(n)
      expect(r).toContain(`全${n}案`)
      expect(r).not.toContain('収まりませんでした')
      expect(r).not.toContain('通過できませんでした')
    }
  })
  it('診断はプールのキャッシュを介さない試行で、現在の条件のプールを追い出さない', () => {
    const cfg = defined(CONDITIONS[0]).cfg
    const pool = candidatePool(cfg)
    diagnoseEmpty(ZERO_PLAN)
    expect(candidatePool(cfg)).toBe(pool) // 同一参照のまま（再構築されていない）
  })
})
