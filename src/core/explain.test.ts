import { beforeAll, describe, expect, it } from 'vitest'
import { enumeratePlans, planKey } from './enumerate'
import { generatePlans } from './generate'
import { EXPLAIN_TH, explainPlan } from './explain'
import { storageRatio } from './closets'
import { CONDITIONS, PARTIAL_CONDITIONS, SEEDS, defined, sharesEdge } from './testing'
import { windowStats } from './windows'
import type { PlanConfig, ScoredPlan } from './types'

const cond = (name: string) => defined(CONDITIONS.find((c) => c.name === name), name)
const sentenceCount = (t: string) => t.split('。').filter(Boolean).length

describe('explainPlan: 二面採光の節（GEN_VERSION 7。1文目の節。双方向）', () => {
  // 提示案（人気6条件を含む全条件 × 6 seed）。平屋は LDK、2階建ては主寝室が二面のときだけ書く（EXPLAIN_TH）
  const shown: { cfg: PlanConfig; p: ScoredPlan }[] = []
  beforeAll(() => {
    for (const { cfg } of [...CONDITIONS, ...PARTIAL_CONDITIONS]) {
      for (const s of SEEDS) for (const p of generatePlans({ ...cfg, feats: [...cfg.feats] }, s)) shown.push({ cfg, p })
    }
  }, 120_000)
  const twoFace = (p: ScoredPlan, ty: string) => {
    const l = windowStats(p).rooms.filter((r) => r.room.type === ty)
    return l.length > 0 && l.every((r) => r.sides.length >= EXPLAIN_TH.windowFaces)
  }
  const subject = (p: ScoredPlan) => (p.floors.length <= EXPLAIN_TH.windowLdkMaxFloors ? twoFace(p, 'ldk') : twoFace(p, 'master'))

  it('条件を満たす案では必ず1文目に出て、満たさない案では出ない。旧文も出ない', () => {
    expect(shown.length).toBeGreaterThan(250)
    for (const { cfg, p } of shown) {
      const t = explainPlan(cfg, p)
      expect(t).not.toContain('採光は確保')
      const first = t.split('。')[p.floors[1]?.fp ? 1 : 0] ?? ''
      expect(first.includes('二面に窓があ'), planKey(p)).toBe(subject(p))
      expect(t.split('二面に窓があ').length - 1, planKey(p)).toBe(subject(p) ? 1 : 0)
      if (subject(p) && p.floors.length > 1) expect(first).toContain('主寝室は二面に窓があ')
    }
  })
  it('出現率の下限（実測: 2階建て 78.7%・平屋 26.4%。レビュー前は 0%）。文の数は2〜3文のまま', () => {
    const rate = (f: (p: ScoredPlan) => boolean) => {
      const xs = shown.filter(({ p }) => f(p))
      return xs.filter(({ cfg, p }) => explainPlan(cfg, p).includes('二面に窓があ')).length / xs.length
    }
    expect(rate((p) => p.floors.length === 2)).toBeGreaterThanOrEqual(0.7)
    expect(rate((p) => p.floors.length === 1)).toBeGreaterThanOrEqual(0.2)
    expect(rate((p) => p.floors.length === 1)).toBeLessThan(0.5) // 平屋の LDK の二面は珍しい（常套句にならない）
    for (const { cfg, p } of shown) {
      const n = sentenceCount(explainPlan(cfg, p)) - (p.floors[1]?.fp ? 1 : 0)
      expect(n).toBeGreaterThanOrEqual(2)
      expect(n).toBeLessThanOrEqual(3)
    }
  })
})

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

  it('収納率（R-IDX-02 の数え方）が10%以上の案だけ「収納が延床の約x%あります」と書く', () => {
    const { cfg } = cond('33坪/2階/土間+パントリー')
    const plans = enumeratePlans(cfg)
    const hi = plans.find((p) => storageRatio(p) >= EXPLAIN_TH.storeHigh)
    expect(hi).toBeDefined()
    expect(explainPlan(cfg, defined(hi))).toContain('クローゼットなどの収納が延床の約')
    const lo = plans.find((p) => storageRatio(p) < EXPLAIN_TH.storeHigh)
    expect(lo).toBeDefined()
    expect(explainPlan(cfg, defined(lo))).not.toContain('クローゼットなどの収納が延床')
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
  it('全候補: 「個室は階段に面していない」と書くなら、階ごとに全ての個室（書斎・和室を含む）が階段と辺を共有しない', () => {
    const BED = new Set(['master', 'bed', 'study', 'washitsu']) // rooms.ts の cat='bed' とは別に独立して列挙
    let claimed = 0, studyOrWashitsuFacing = 0, total = 0
    for (const { cfg } of CONDITIONS) {
      for (const p of enumeratePlans(cfg)) {
        total++
        const text = explainPlan(cfg, p)
        const facing = p.floors.some((f) => {
          const stair = f.rooms.find((r) => r.type === 'stair')
          return !!stair && f.rooms.some((r) => BED.has(r.type) && sharesEdge(r, stair))
        })
        if (p.floors.some((f) => { const st = f.rooms.find((r) => r.type === 'stair'); return !!st && f.rooms.some((r) => (r.type === 'study' || r.type === 'washitsu') && sharesEdge(r, st)) })) studyOrWashitsuFacing++
        if (text.includes('個室は階段に面していない')) {
          claimed++
          expect(facing, `${cfg.area}坪: ${text}`).toBe(false)
          expect(p.floors.some((f) => f.rooms.some((r) => BED.has(r.type)))).toBe(true)
        }
      }
    }
    expect(total).toBeGreaterThan(100)
    expect(claimed).toBeGreaterThan(0)
    // 旧実装が見落としていた「書斎・和室が階段に面する案」が検証対象に含まれている
    expect(studyOrWashitsuFacing).toBeGreaterThan(0)
  })

  it('全候補: 弱点（廊下が長い・縦横比・面積適合）が配置・スコアにある案は、必ずそれに触れる。文は3文まで', () => {
    let weakPlans = 0
    for (const { cfg } of CONDITIONS) {
      for (const p of enumeratePlans(cfg)) {
        const text = explainPlan(cfg, p)
        const rooms = p.floors.flatMap((f) => f.rooms)
        const hall = rooms.filter((r) => r.type === 'hall').reduce((s, r) => s + r.w * r.h, 0) / p.totalArea
        const expected = [
          [hall >= EXPLAIN_TH.hallLong, '廊下がやや長い'],
          [p.score.parts.縦横比 < EXPLAIN_TH.weak, '細長い部屋'],
          [p.score.parts.面積適合 < EXPLAIN_TH.weak, '目標の広さから外れた'],
        ] as const
        if (expected.some(([w]) => w)) weakPlans++
        for (const [w, phrase] of expected) if (w) expect(text, `${cfg.area}坪: ${text}`).toContain(phrase)
        expect(sentenceCount(text)).toBeLessThanOrEqual(3)
      }
    }
    expect(weakPlans).toBeGreaterThan(50)
  })

  it('キッチン独立案: LDK の帖数はキッチンを含む。割合はしきい値と食い違わない（小数1桁・切り捨て）', () => {
    let kitchenPlans = 0
    for (const { cfg } of CONDITIONS) {
      for (const p of enumeratePlans(cfg)) {
        const text = explainPlan(cfg, p)
        for (const f of p.floors) {
          const ldk = f.rooms.find((r) => r.type === 'ldk')
          const k = f.rooms.find((r) => r.type === 'kitchen')
          if (!ldk || !k) continue
          kitchenPlans++
          expect(text).toContain(`約${Math.round((ldk.w * ldk.h + k.w * k.h) / 8)}帖`)
        }
        // 「廊下は延床の約X%と短め」の X は 7.0 未満、「収納が延床の約X%」の X は 10.0 以上
        const hallM = /廊下は延床の約([\d.]+)%と短め/.exec(text)
        if (hallM) expect(Math.round(Number(hallM[1]) * 10)).toBeLessThan(Math.round(EXPLAIN_TH.hallShort * 1000))
        const storeM = /収納が延床の約([\d.]+)%/.exec(text)
        if (storeM) expect(Math.round(Number(storeM[1]) * 10)).toBeGreaterThanOrEqual(Math.round(EXPLAIN_TH.storeHigh * 1000))
        expect(text).not.toMatch(/帖）、/)
      }
    }
    expect(kitchenPlans).toBeGreaterThan(0)
  })
})
