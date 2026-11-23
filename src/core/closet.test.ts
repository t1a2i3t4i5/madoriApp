import { describe, expect, it } from 'vitest'
import { carveFloor } from './carve'
import { privateStorageCount, storageOf, storageRatio } from './closets'
import { computeDoors } from './derive'
import { planFromKey, planKey } from './enumerate'
import { candidatePool, generatePlans } from './generate'
import { feasibility } from './program'
import { ROOM } from './rooms'
import { SCORE_WEIGHTS, scorePlan } from './score'
import {
  CONDITIONS, PARTIAL_CONDITIONS, SEEDS, defined, independentViolations, ownerViolations,
  privateStorageIndependent, storageRatioIndependent,
} from './testing'
import { layoutBand } from './slicing'
import { cell } from './rooms'
import type { Plan, PlanConfig, Room, RoomType } from './types'

const ALL = [...CONDITIONS, ...PARTIAL_CONDITIONS]
const POPULAR = [...CONDITIONS.slice(0, 3), ...PARTIAL_CONDITIONS.slice(0, 3)]
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0

function room(type: RoomType, x: number, y: number, w: number, h: number, extra: Partial<Room> = {}): Room {
  return { type, name: type, x, y, w, h, area: w * h, target: ROOM[type].target, minArea: ROOM[type].minArea, ...extra }
}

describe('GEN_VERSION 5: 付属収納の不変条件（全候補）', () => {
  it('全プールの案で、独立検証（持ち主の関係を含む）の違反が0', () => {
    let n = 0
    const bad: string[] = []
    for (const { name, cfg } of ALL) {
      for (const p of candidatePool(cfg)) {
        n++
        const v = independentViolations(p)
        if (v.length && bad.length < 10) bad.push(`${name} ${planKey(p)}: ${v[0]}`)
      }
    }
    expect(n).toBeGreaterThan(1000)
    expect(bad).toEqual([])
  }, 120_000)

  it('of を持つ部屋のドアは1枚だけで、相手は持ち主、種類は折れ戸。クローゼットを持つ個室は短辺・最小面積・外壁接触を満たす', () => {
    let owned = 0
    const bad: string[] = []
    for (const { name, cfg } of ALL) {
      for (const p of candidatePool(cfg)) {
        for (const fl of p.floors) {
          const doors = computeDoors(fl.rooms)
          for (const r of fl.rooms) {
            if (!r.of) continue
            owned++
            const mine = doors.filter((d) => d.a === r || d.b === r)
            const partner = mine[0] && (mine[0].a === r ? mine[0].b : mine[0].a)
            const ok = mine.length === 1 && mine[0]?.kind === 'fold' && !!partner && partner.x === r.x + r.of.dx && partner.y === r.y + r.of.dy
            if (!ok && bad.length < 10) bad.push(`${name} ${planKey(p)} ${r.name}: ドア ${mine.length} 枚`)
            if (r.type === 'closet' && partner) {
              if ((Math.min(partner.w, partner.h) < (partner.type === 'master' ? 6 : 5) || partner.area < partner.minArea - 1) && bad.length < 10) bad.push(`${name} ${planKey(p)} 持ち主 ${partner.name} が小さい`)
            }
          }
        }
      }
    }
    expect(owned).toBeGreaterThan(1000)
    expect(bad).toEqual([])
  }, 120_000)

  it('強モード（planKey が -k）の案は、全個室にクローゼットか WIC がある。-k の案は存在し、planFromKey で同じ案に戻る', () => {
    let hard = 0
    for (const { cfg } of POPULAR) {
      const pool = candidatePool(cfg)
      for (const p of pool) {
        const key = planKey(p)
        if (!key.endsWith('-k')) continue
        hard++
        const s = privateStorageIndependent(p)
        expect(s.with, key).toBe(s.total)
        if (hard <= 5) expect(JSON.stringify(planFromKey(cfg, key)), key).toBe(JSON.stringify(p))
      }
    }
    expect(hard).toBeGreaterThan(5)
  })

  it('弱モード（-k なし）の案には variant.closet がなく、強モードの案は variant.closet = hard', () => {
    for (const { cfg } of POPULAR) {
      for (const p of candidatePool(cfg)) expect(p.variant?.closet === 'hard', planKey(p)).toBe(planKey(p).endsWith('-k'))
    }
  })

  it('closets.ts（本体）と testing.ts（独立実装）の収納率・個室付属が一致する', () => {
    for (const { cfg } of POPULAR) {
      for (const p of generatePlans(cfg, 1)) {
        expect(storageRatio(p)).toBeCloseTo(storageRatioIndependent(p), 12)
        expect(privateStorageCount(p)).toEqual(privateStorageIndependent(p))
      }
    }
  })
})

describe('収納率の退行防止（人気6条件 × 6 seed、feasibility グリッド seed 1）', () => {
  // 実測（GEN_VERSION 5）: 収納率の中央値 10.5%、10%未満 42.6%、個室付属 84.5%、全個室付属 62.0%。仕様の表の下限を使う
  const plans = POPULAR.flatMap(({ cfg }) => SEEDS.flatMap((s) => generatePlans(cfg, s)))
  const ratios = plans.map(storageRatioIndependent)

  it('人気: 収納率の中央値 ≥ 10%、10%未満の案 ≤ 50%', () => {
    expect(plans).toHaveLength(POPULAR.length * SEEDS.length * 3)
    expect(median(ratios)).toBeGreaterThanOrEqual(0.1)
    expect(ratios.filter((r) => r < 0.1).length / ratios.length).toBeLessThanOrEqual(0.5)
  })

  it('人気: 個室の収納付属率 ≥ 80%、全個室に収納がある案 ≥ 55%', () => {
    let w = 0
    let t = 0
    let all = 0
    for (const p of plans) {
      const s = privateStorageIndependent(p)
      w += s.with
      t += s.total
      if (s.with === s.total) all++
    }
    expect(w / t).toBeGreaterThanOrEqual(0.8)
    expect(all / plans.length).toBeGreaterThanOrEqual(0.55)
  })

  it('グリッド（fixture と同じ条件）: 収納率の中央値 ≥ 8%。洗面の最大面積超過は実測（91室／240案）以下', () => {
    const grid: number[] = []
    let washOver = 0
    for (const floors of [1, 2] as const) {
      for (const area of [20, 23, 26, 30, 36, 40]) {
        for (const rooms of [2, 3, 4, 5]) {
          for (const feats of [[], ['doma'], ['void', 'study'], ['washitsu', 'laundry', 'pantry', 'wic']] as PlanConfig['feats'][]) {
            const cfg: PlanConfig = { area, floors, rooms, parking: 1, garden: 1, feats }
            if (!feasibility(cfg).ok) continue
            for (const p of generatePlans(cfg, 1)) {
              grid.push(storageRatioIndependent(p))
              for (const f of p.floors) for (const r of f.rooms) if (r.type === 'wash' && r.area > ROOM.wash.maxArea) washOver++
            }
          }
        }
      }
    }
    expect(grid.length).toBeGreaterThan(200)
    expect(median(grid)).toBeGreaterThanOrEqual(0.08)
    expect(washOver).toBeLessThanOrEqual(91)
  }, 180_000) // 192条件のプールを構築するので、並列実行の負荷でも収まるよう長めにする
})

describe('スコア: 個室収納', () => {
  it('重みの合計は1。個室収納は0.10、既存7項目は従来の ×0.9', () => {
    const w = SCORE_WEIGHTS
    expect(Object.values(w).reduce((s, v) => s + v, 0)).toBeCloseTo(1, 12)
    expect(w.個室収納).toBe(0.1)
    expect(w.採光).toBeCloseTo(0.2 * 0.9, 12)
    expect(w.縦横比).toBeCloseTo(0.15 * 0.9, 12)
    expect(w['910モジュール']).toBeCloseTo(0.05 * 0.9, 12)
  })

  it('個室収納の項目は、付属率と一致する（個室がなければ 1）', () => {
    for (const { cfg } of POPULAR) {
      for (const p of generatePlans(cfg, 2)) {
        const s = privateStorageCount(p)
        expect(p.score.parts.個室収納).toBeCloseTo(s.total ? s.with / s.total : 1, 12)
        expect(scorePlan(p).total).toBe(p.score.total)
      }
    }
  })
})

describe('割り付け: クローゼットの切り出し（layoutBand）', () => {
  const band = { cells: [cell('bed', { closet: true }), cell('bed', { closet: true })] }
  it('モード省略は切り出さない（v4 と同じ）。弱・強は個室の東西端側に幅2のクローゼットを切り出す', () => {
    const none = defined(layoutBand(band, 20, 0, 8))
    expect(none.every((r) => r.type === 'bed')).toBe(true)
    for (const mode of ['soft', 'hard'] as const) {
      const rs = defined(layoutBand(band, 20, 0, 8, false, mode))
      const cls = rs.filter((r) => r.type === 'closet')
      expect(cls.length, mode).toBeGreaterThan(0)
      for (const c of cls) {
        expect(c.w).toBe(2)
        expect(c.h).toBe(8)
        const owner = defined(rs.find((r) => r.x === c.x + defined(c.of).dx && r.y === c.y + defined(c.of).dy))
        expect(owner.type).toBe('bed')
      }
      // 面積は保存される
      expect(rs.reduce((s, r) => s + r.area, 0)).toBe(20 * 8)
    }
    // 強モードは全個室に必ず付く
    const hard = defined(layoutBand(band, 20, 0, 8, false, 'hard'))
    expect(hard.filter((r) => r.type === 'closet')).toHaveLength(2)
  })

  it('診断（ignoreMinShort）ではクローゼットを切り出さない', () => {
    const rs = defined(layoutBand(band, 20, 0, 8, true, 'hard'))
    expect(rs.some((r) => r.type === 'closet')).toBe(false)
  })
})

describe('carveFloor（割り付け後の収納化）', () => {
  /** 北帯（個室2・階段）/ ホール帯 / 南帯（玄関・LDK）の20×18 */
  const floor = (extra: Room[] = []): Room[] => [
    room('bed', 0, 0, 8, 8), room('bed', 8, 0, 8, 8), room('stair', 16, 0, 4, 8),
    room('hall', 0, 8, 20, 2),
    room('entry', 0, 10, 4, 8), room('ldk', 4, 10, 16, 8),
    ...extra,
  ]

  it('ホール帯の行き止まりをクローゼットにする（持ち主は上の個室）。入力は書き換えない', () => {
    const input = floor()
    const snapshot = JSON.stringify(input)
    const out = carveFloor(input)
    expect(JSON.stringify(input)).toBe(snapshot)
    const cl = defined(out.find((r) => r.type === 'closet'))
    expect(cl.y).toBe(8)
    expect(cl.h).toBe(2)
    expect(cl.w).toBeGreaterThanOrEqual(4)
    expect(cl.w).toBeLessThanOrEqual(6)
    const owner = defined(out.find((r) => r.x === cl.x + defined(cl.of).dx && r.y === cl.y + defined(cl.of).dy))
    expect(owner.type).toBe('bed')
    // 面積は保存され、ホールはその分だけ減る
    expect(out.reduce((s, r) => s + r.area, 0)).toBe(input.reduce((s, r) => s + r.area, 0))
    expect(ownerViolations({ W: 20, H: 18, arch: 0, totalArea: 360, floors: [{ label: '1F', rooms: out }] } as Plan)).toEqual([])
  })

  it('持ち主のない収納（奥行2・2×4 以上）を、収納のない個室のクローゼットに付け替える', () => {
    const rooms = [
      room('bed', 0, 0, 8, 8), room('store', 8, 0, 2, 8), room('bed', 10, 0, 6, 8), room('stair', 16, 0, 4, 8),
      room('hall', 0, 8, 20, 2), room('entry', 0, 10, 4, 8), room('ldk', 4, 10, 16, 8),
    ]
    const out = carveFloor(rooms)
    const cl = defined(out.find((r) => r.x === 8 && r.y === 0))
    expect(cl.type).toBe('closet')
    expect(cl.name).toBe('CL')
    // 付け替えた個室は、収納を持つ
    const bed = defined(out.find((r) => r.x === 0 && r.y === 0))
    expect(storageOf(out, bed)).toBe(cl)
  })

  it('奥行が2を超える収納は付け替えない（吸収で太った収納をクローゼットと呼ばない）', () => {
    const rooms = [
      room('bed', 0, 0, 6, 8), room('store', 6, 0, 4, 8), room('bed', 10, 0, 6, 8), room('stair', 16, 0, 4, 8),
      room('hall', 0, 8, 20, 2), room('entry', 0, 10, 4, 8), room('ldk', 4, 10, 16, 8),
    ]
    const out = carveFloor(rooms)
    expect(out.find((r) => r.x === 6 && r.y === 0)?.type).toBe('store')
  })

  it('個室がなければ何もしない（個室のない階は入力と同じ）', () => {
    const rooms = [room('wash', 0, 0, 4, 6), room('stair', 16, 0, 4, 8), room('hall', 0, 8, 20, 2), room('entry', 0, 10, 4, 8), room('ldk', 4, 10, 16, 8)]
    expect(carveFloor(rooms)).toEqual(rooms)
  })
})

describe('解説文との整合（収納）', () => {
  it('全個室に収納がある案は「すべての個室にクローゼットがあり」を含み、ない案は弱点に触れる', async () => {
    const { explainPlan } = await import('./explain')
    let all = 0
    let some = 0
    for (const { cfg } of POPULAR) {
      for (const p of candidatePool(cfg).slice(0, 80)) {
        const s = privateStorageCount(p)
        const text = explainPlan(cfg, p)
        if (s.with === s.total) {
          all++
          expect(text).toContain('すべての個室にクローゼットがあり')
          expect(text).not.toContain('クローゼットのない個室')
        } else {
          some++
          expect(text).toContain('クローゼットのない個室があること')
          expect(text).not.toContain('すべての個室にクローゼット')
        }
      }
    }
    expect(all).toBeGreaterThan(0)
    expect(some).toBeGreaterThan(0)
  })
})
