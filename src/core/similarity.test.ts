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
    expect(conceptKey(a)).toBe('ldk|stC|wsEN')
    expect(conceptKey(mirrorPlan(a))).toBe(conceptKey(a))
    const p = flat([room('entry', 0, 4, 4, 4), room('doma', 4, 4, 2, 4), room('kitchen', 6, 4, 2, 4), room('ldk', 8, 4, 4, 4), room('stair', 8, 0, 4, 4), room('wash', 0, 0, 4, 4)])
    // 南面: entry(+doma 畳む) > ldk(kitchen と ldk は続くので1つ)。階段は東端で LDK（東）と同じ側、洗面は反対側・北
    expect(conceptKey(p)).toBe(conceptKeyIndependent(p))
    expect(conceptKey(p)).toBe('entry>ldk|st=|ws!N')
  })
  const north = (stairX: number, washX: number) => [room('stair', stairX, 0, 4, 4), room('wash', washX, 0, 4, 4)]
  it('階段の東西だけが違う案は、LDK が中央でも別のキーになる（階段の位置を捨てない）', () => {
    const south = [room('ldk', 0, 4, 12, 4)]
    const east = flat([...south, ...north(8, 4), room('hall', 0, 0, 4, 4)])
    const west = flat([...south, ...north(0, 4), room('hall', 8, 0, 4, 4)])
    // 洗面は中央。LDK も中央なので洗面で向きを決められず、階段の側を東にそろえる → どちらも 'E'（反転で同じ案）
    expect(conceptKey(east)).toBe('ldk|stE|wsCN')
    expect(conceptKey(west)).toBe(conceptKey(east))
    // LDK が中央なら洗面の側を東にそろえる。洗面が東・階段が西
    const sep = flat([...south, ...north(0, 8), room('hall', 4, 0, 4, 4)])
    expect(conceptKey(sep)).toBe('ldk|stW|wsEN')
    expect(conceptKey(sep)).toBe(conceptKeyIndependent(sep))
    expect(conceptKey(sep)).not.toBe(conceptKey(east))
  })
  it('LDK が西に寄る案では、階段が LDK と同じ側／反対側で別のキー（反転では変わらない）', () => {
    const base = [room('ldk', 0, 4, 4, 4), room('entry', 4, 4, 8, 4)]
    const near = flat([...base, room('stair', 0, 0, 4, 4), room('hall', 4, 0, 8, 4)])
    const far = flat([...base, room('stair', 8, 0, 4, 4), room('hall', 0, 0, 8, 4)])
    expect(conceptKey(near)).toBe('entry>ldk|st=|ws-')
    expect(conceptKey(far)).toBe('entry>ldk|st!|ws-')
    expect(conceptKey(mirrorPlan(far))).toBe(conceptKey(far))
  })
  it('2階の主寝室と洋室の並びだけが違う2案は同じキー（U1）。書斎との並びは区別する', () => {
    const f1 = [room('entry', 0, 4, 4, 4), room('ldk', 4, 4, 8, 4), room('stair', 0, 0, 4, 4)]
    const two = (south2: RoomType[]): Plan => ({
      W: 12, H: 8, arch: 0, totalArea: 192,
      floors: [
        { label: '1F', rooms: f1 },
        { label: '2F', rooms: south2.map((t, i) => room(t, i * 4, 4, 4, 4)) },
      ],
    }) as Plan
    const mb = two(['master', 'bed', 'study'])
    const bm = two(['bed', 'master', 'study'])
    expect(conceptKey(mb)).toBe(conceptKey(bm))
    expect(conceptKey(mb)).toBe(conceptKeyIndependent(mb))
    expect(conceptKey(mb)).toBe('entry>ldk/bed>study|stE|ws-')
    expect(conceptKey(two(['study', 'bed', 'master']))).not.toBe(conceptKey(mb))
    // 1F の主寝室（平屋）は畳まない
    expect(conceptKey(flat([room('master', 0, 4, 6, 4), room('bed', 6, 4, 6, 4)]))).toBe('bed>master|st-|ws-')
  })
  it('部分二階は 2F の板に正規化して比べる（手計算）', () => {
    const ldk = room('ldk', 0, 0, 12, 8)
    // a: 2F の板は東半分 (x 6〜12)。北から見て bed 3 + store 3。b: 全幅の板で bed 4 + store 8
    const a: Plan = {
      W: 12, H: 8, arch: 0, totalArea: 144,
      floors: [
        { label: '1F', rooms: [ldk] },
        { label: '2F', fp: { x: 6, y: 0, W: 6, H: 8 }, rooms: [room('bed', 6, 0, 3, 8), room('store', 9, 0, 3, 8)] },
      ],
    } as Plan
    const b: Plan = {
      W: 12, H: 8, arch: 0, totalArea: 192,
      floors: [
        { label: '1F', rooms: [ldk] },
        { label: '2F', rooms: [room('bed', 0, 0, 4, 8), room('store', 4, 0, 8, 8)] },
      ],
    } as Plan
    // 1F は一致 1。2F は板に正規化すると bed [0,1/2) と [0,1/3) → 1/3、store [1/2,1) と [1/3,1) → 1/2 で 5/6（反転は 1/6 で小さい）
    const expected = (1 + 5 / 6) / 2
    expect(overlap(a, b)).toBeCloseTo(expected, 12)
    expect(overlap(b, a)).toBeCloseTo(expected, 12)
    expect(overlapIndependent(a, b)).toBeCloseTo(expected, 12)
  })
  it('標本点が辺に乗っても、独立実装と一致する（整数で比べる）', () => {
    // 幅 9・n=24: 辺 x=3 は標本の境（9/3 = 3 → 24/3 = 8）と標本点の間。幅 7・n=14 は辺が標本点に乗る例
    const mk = (W: number, cut: number): Plan => flat([room('bed', 0, 0, cut, 7), room('store', cut, 0, W - cut, 7)], W, 7)
    for (const [W, cut, n] of [[7, 3, 14], [9, 3, 24], [7, 1, 7], [5, 2, 10]] as const) {
      const a = mk(W, cut)
      const b = flat([room('bed', 0, 0, W - cut, 7), room('store', W - cut, 0, cut, 7)], W, 7)
      expect(overlap(a, b, n)).toBe(overlapIndependent(a, b, n))
      expect(overlap(a, b, n)).toBe(overlap(b, a, n))
    }
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

describe('現状の似通い度の観測（GEN_VERSION 9。選抜後の値。上限・下限は付けず観測値を固定）', () => {
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
      popular: { trios: 36, similarRate: 0, conceptAll: 0.167, conceptOne: 0.194, archDiffSimilar: '0/108' },
      gridFull: { trios: 69, similarRate: 0.217, conceptAll: 0.507, conceptOne: 0.261, archDiffSimilar: '2/207' },
      gridPart: { trios: 33, similarRate: 0.182, conceptAll: 0.818, conceptOne: 0, archDiffSimilar: '4/99' },
    })
  }, TIMEOUT)
  it('標本の細かさ 16・32 で測っても、似通った組の割合は v8 の値（24 で 0.5 / 0.652 / 0.545）の約半分以下（選抜は 24 の重なりで行うので、24 の値とは一致しない。v9 の実測 popular 0.25 / gridFull 0.348 / gridPart 0.303 が最大）', () => {
    build()
    const v8 = { popular: 0.5, gridFull: 0.652, gridPart: 0.545 }
    for (const [name, s] of [['popular', popular], ['gridFull', gridFull], ['gridPart', gridPart]] as const) {
      for (const g of [16, 32]) expect(stat(s, g).similarRate, `${name} ${g}`).toBeLessThanOrEqual(v8[name] * 0.6)
    }
  }, TIMEOUT)
})
