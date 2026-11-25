import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { feasibility } from './program'
import { OVERLAP_GRID, SIMILAR_OVERLAP, conceptKey, overlap, trioSimilarity } from './similarity'
import { CONDITIONS, PARTIAL_CONDITIONS, SEEDS, conceptKeyIndependent, overlapIndependent } from './testing'
import type { Plan, PlanConfig, Room, RoomType } from './types'
import { ROOM } from './rooms'

const room = (type: RoomType, x: number, y: number, w: number, h: number): Room => ({
  type, name: type, x, y, w, h, area: w * h, target: ROOM[type].target, minArea: ROOM[type].minArea,
})
const flat = (rooms: Room[], W = 12, H = 8): Plan =>
  ({ W, H, arch: 0, totalArea: W * H, floors: [{ label: '1F', rooms }] }) as Plan
const mirrorPlan = (p: Plan): Plan => ({
  ...p,
  floors: p.floors.map((fl) => ({
    ...fl,
    ...(fl.fp ? { fp: { ...fl.fp, x: p.W - fl.fp.x - fl.fp.W } } : {}),
    rooms: fl.rooms.map((r) => ({ ...r, x: p.W - r.x - r.w })),
  })),
})

describe('overlap / conceptKey: 手計算の例', () => {
  const a = flat([room('ldk', 0, 4, 12, 4), room('entry', 0, 0, 4, 4), room('stair', 4, 0, 4, 4), room('wash', 8, 0, 4, 4)])
  it('自分自身との重なりは 1、反転した案とも 1（反転を同一とみなす）', () => {
    expect(overlap(a, a)).toBe(1)
    expect(overlap(a, mirrorPlan(a))).toBe(1)
  })
  it('種別が半分ずつ違えば 0.5。粗い種別（kitchen→ldk、doma→entry）は同じとみなす', () => {
    const b = flat([room('kitchen', 0, 4, 12, 4), room('doma', 0, 0, 4, 4), room('hall', 4, 0, 8, 4)])
    // 南の LDK 半分 (0.5) + 玄関 1/3×北半分 (1/6) = 2/3
    expect(overlap(a, b)).toBeCloseTo(0.5 + 0.5 / 3, 12)
  })
  it('外形が違っても板に正規化して比べる', () => {
    const big = flat([room('ldk', 0, 8, 24, 8), room('entry', 0, 0, 8, 8), room('stair', 8, 0, 8, 8), room('wash', 16, 0, 8, 8)], 24, 16)
    expect(overlap(a, big)).toBe(1)
  })
  it('概念キー: 南面の並び（畳み込み・反転正規化）+ 階段・洗面の位置', () => {
    // 南面は LDK 1室。1F の LDK は全幅で中央 → 階段（中央の列）は C
    expect(conceptKey(a)).toBe('ldk|stC|wsXN')
    expect(conceptKey(mirrorPlan(a))).toBe(conceptKey(a))
    const p = flat([room('entry', 0, 4, 4, 4), room('doma', 4, 4, 2, 4), room('kitchen', 6, 4, 2, 4), room('ldk', 8, 4, 4, 4), room('stair', 8, 0, 4, 4), room('wash', 0, 0, 4, 4)])
    // 南面: entry(+doma 畳む) > ldk(kitchen と ldk は続くので1つ)。階段は東端で LDK（東）と同じ側、洗面は反対側・北
    expect(conceptKey(p)).toBe(conceptKeyIndependent(p))
    expect(conceptKey(p)).toBe('entry>ldk|st=|ws!N')
  })
})

/** 標本: 人気6 × SEEDS、グリッド seed 1（総二階・平屋／部分二階） */
const popular: Plan[][] = []
const gridFull: Plan[][] = []
const gridPart: Plan[][] = []
let built = false
function build() {
  if (built) return
  built = true
  for (const { cfg } of [...CONDITIONS.slice(0, 3), ...PARTIAL_CONDITIONS.slice(0, 3)]) {
    for (const s of SEEDS) popular.push(generatePlans({ ...cfg, feats: [...cfg.feats] }, s))
  }
  for (const area of [20, 23, 26, 30, 36, 40]) {
    for (const floors of [1, 2] as const) {
      for (const rooms of [2, 3, 4, 5]) {
        for (const feats of [[], ['doma'], ['void', 'study'], ['washitsu', 'laundry', 'pantry', 'wic']] as PlanConfig['feats'][]) {
          const cfg: PlanConfig = { area, floors, rooms, parking: 1, garden: 1, feats }
          if (feasibility(cfg).ok) gridFull.push(generatePlans(cfg, 1))
          if (floors === 2) {
            const pc: PlanConfig = { ...cfg, story: 'partial' }
            if (feasibility(pc).ok) gridPart.push(generatePlans(pc, 1))
          }
        }
      }
    }
  }
}
const TIMEOUT = 600_000
const r3 = (x: number) => Math.round(x * 1000) / 1000
const trios = (s: Plan[][]) => s.filter((t) => t.length >= 2)

describe('独立実装との一致', () => {
  it('overlap と overlapIndependent が全ペアで一致する（24 / 16 / 32）', () => {
    build()
    let n = 0
    for (const t of [...popular, ...gridFull, ...gridPart]) {
      for (let i = 0; i < t.length; i++) {
        for (let j = i + 1; j < t.length; j++) {
          const a = t[i]
          const b = t[j]
          if (!a || !b) continue
          for (const g of [OVERLAP_GRID, 16, 32]) expect(overlap(a, b, g)).toBeCloseTo(overlapIndependent(a, b, g), 12)
          expect(overlap(a, b)).toBeCloseTo(overlap(b, a), 12)
          n++
        }
      }
    }
    expect(n).toBeGreaterThan(400)
  }, TIMEOUT)
  it('conceptKey と conceptKeyIndependent が全案で一致し、反転で変わらない', () => {
    build()
    for (const t of [...popular, ...gridFull, ...gridPart]) {
      for (const p of t) {
        expect(conceptKey(p)).toBe(conceptKeyIndependent(p))
        expect(conceptKey(mirrorPlan(p))).toBe(conceptKey(p))
        expect(overlap(p, mirrorPlan(p))).toBe(1)
      }
    }
  }, TIMEOUT)
})

describe('現状の似通い度の観測（GEN_VERSION 8。上限・下限は付けず観測値を固定）', () => {
  const stat = (s: Plan[][], n = OVERLAP_GRID) => {
    const ts = trios(s).map((t) => trioSimilarity(t, n))
    const sum = (f: (x: (typeof ts)[number]) => number) => ts.reduce((a, x) => a + f(x), 0)
    return {
      trios: ts.length,
      similarRate: r3(ts.filter((x) => x.maxOverlap >= SIMILAR_OVERLAP).length / ts.length),
      conceptAll: r3(ts.filter((x) => x.conceptKinds === 3).length / ts.length),
      conceptOne: r3(ts.filter((x) => x.conceptKinds === 1).length / ts.length),
      archDiffSimilar: `${sum((x) => x.archDiffSimilarPairs)}/${sum((x) => x.pairs)}`,
    }
  }
  it('観測値', () => {
    build()
    const got = { popular: stat(popular), gridFull: stat(gridFull), gridPart: stat(gridPart) }
    console.log('similarity observation', JSON.stringify(got))
    // 標本の大きさ（人気6 × 6 seed、グリッド seed 1）と観測値を固定する
    // GEN_VERSION 8 の実測（design.md R-SEL-12）。似通った組 = 重なり最大 ≥ 0.8、conceptAll/One = 概念キー K3 が3案とも違う／1種類だけ、
    // archDiffSimilar = arch が違うのに重なり ≥ 0.8 のペア数/全ペア数
    expect(got).toEqual({
      popular: { trios: 36, similarRate: 0.5, conceptAll: 0.389, conceptOne: 0.278, archDiffSimilar: '16/108' },
      gridFull: { trios: 69, similarRate: 0.652, conceptAll: 0.42, conceptOne: 0.348, archDiffSimilar: '17/207' },
      gridPart: { trios: 33, similarRate: 0.545, conceptAll: 0.939, conceptOne: 0, archDiffSimilar: '15/99' },
    })
  }, TIMEOUT)
  it('標本の細かさ 16・32 でも、似通った組の割合の結論（人気6 は多数派、グリッド総二階・平屋は半数前後）は変わらない', () => {
    build()
    const out: Record<string, number[]> = {}
    for (const [name, s] of [['popular', popular], ['gridFull', gridFull], ['gridPart', gridPart]] as const) {
      out[name] = [16, 24, 32].map((g) => stat(s, g).similarRate)
    }
    console.log('similarity grid sensitivity (16/24/32)', JSON.stringify(out))
    for (const v of Object.values(out)) {
      const [lo, mid, hi] = v as [number, number, number]
      expect(Math.abs(lo - mid)).toBeLessThanOrEqual(0.1)
      expect(Math.abs(hi - mid)).toBeLessThanOrEqual(0.1)
    }
  }, TIMEOUT)
})
