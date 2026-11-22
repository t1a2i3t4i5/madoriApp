import { describe, expect, it } from 'vitest'
import { applyVariant, bandsFor, buildPlan } from './archetypes'
import { CANONICAL, type Variant } from './types'
import type { PlanConfig } from './types'
import { defined } from './testing'

const cfg: PlanConfig = { area: 32, floors: 2, rooms: 4, parking: 1, garden: 1, feats: ['wic', 'doma', 'pantry', 'laundry'] }
const types = (bands: { cells: { type: string }[] }[], i: number) => defined(bands[i]).cells.map((c) => c.type)
const v = (o: Partial<Variant>): Variant => ({ ...CANONICAL, rev: [...CANONICAL.rev], ...o })

describe('applyVariant', () => {
  it('正規形は入力と同じ並びのコピーで、入力を書き換えない', () => {
    const bands = defined(bandsFor(cfg, 1, 2, 16))
    const before = JSON.stringify(bands)
    const out = defined(applyVariant(bands, 2, CANONICAL, false))
    expect(JSON.stringify(out)).toBe(before)
    expect(out[0]).not.toBe(bands[0])
    expect(defined(out[0]).cells[0]).not.toBe(defined(bands[0]).cells[0])
  })

  it('入力の bands / cells を書き換えない（全変種）', () => {
    for (const f of [1, 2]) {
      const bands = defined(bandsFor(cfg, 1, f, 16))
      const before = JSON.stringify(bands)
      for (const stairEnd of ['E', 'W'] as const) {
        for (const bedShift of [-1, 0, 1, 2] as const) {
          applyVariant(bands, f, v({ stairEnd, bedShift, rev: [true, true, true, true] }), false)
          expect(JSON.stringify(bands)).toBe(before)
        }
      }
    }
  })

  it('stair は stairEnd 側の端に固定される', () => {
    const bands = defined(bandsFor(cfg, 1, 1, 16))
    expect(types(defined(applyVariant(bands, 1, v({ stairEnd: 'W' }), false)), 0)[0]).toBe('stair')
    const e = types(defined(applyVariant(bands, 1, v({ rev: [true, false, false, false] }), false)), 0)
    expect(e[e.length - 1]).toBe('stair')
  })

  it('rev でユニット（洗面+浴室+ランドリー）が崩れずに逆順になる', () => {
    const bands = defined(bandsFor(cfg, 1, 1, 16))
    const t = types(defined(applyVariant(bands, 1, v({ rev: [true, false, false, false] }), false)), 0)
    expect(t).toEqual(['wc', 'wash', 'bath', 'laundry', 'stair'])
  })

  it('吹抜ありの1F ldk ユニットは rev でも西端のまま（kitchen/pantry が続く）', () => {
    const c = { ...cfg, feats: ['void', 'pantry'] as PlanConfig['feats'] }
    const bands = defined(bandsFor(c, 1, 1, 16))
    const t = types(defined(applyVariant(bands, 1, v({ rev: [false, true, false, false] }), true)), 2)
    expect(t.slice(0, 3)).toEqual(['ldk', 'kitchen', 'pantry'])
  })

  it('bedShift: 南の末尾の bed を北の stair の手前へ / 足りなければ null / -1 は北の先頭を南の末尾へ', () => {
    const bands = defined(bandsFor(cfg, 0, 2, 16)) // 南に bed 2、北に bed 1
    const c = (bs: ReturnType<typeof bandsFor>, i: number) => types(defined(bs), i)
    const p1 = applyVariant(bands, 2, v({ bedShift: 1 }), false)
    expect(c(p1, 0).slice(-2)).toEqual(['bed', 'stair'])
    expect(c(p1, 2).filter((x) => x === 'bed')).toHaveLength(1)
    const w = applyVariant(bands, 2, v({ stairEnd: 'W', bedShift: 1 }), false)
    expect(c(w, 0)[0]).toBe('stair')
    expect(c(w, 0).slice(-1)).toEqual(['bed'])
    expect(applyVariant(bands, 2, v({ bedShift: 2 }), false)).not.toBeNull()
    const few = defined(bandsFor({ ...cfg, rooms: 2 }, 0, 2, 16)) // 南の bed が1個以下
    expect(applyVariant(few, 2, v({ bedShift: 2 }), false)).toBeNull()
    const m = applyVariant(bands, 2, v({ bedShift: -1 }), false)
    expect(c(m, 2).filter((x) => x === 'bed')).toHaveLength(3)
    expect(c(m, 2).slice(-1)).toEqual(['bed'])
    // 北に bed がない帯では null
    const noBed = bands.map((b, i) => (i === 0 ? { ...b, cells: b.cells.filter((x) => x.type !== 'bed') } : b))
    expect(applyVariant(noBed, 2, v({ bedShift: -1 }), false)).toBeNull()
  })
})

describe('buildPlan と variant', () => {
  const W = 16
  const H = 15
  it('variant 省略は正規形で plan.variant を持たない。明示すると持つ', () => {
    const a = defined(buildPlan(cfg, 0, { W, H }))
    expect(a.variant).toBeUndefined()
    const b = defined(buildPlan(cfg, 0, { W, H }, CANONICAL))
    expect(b.variant).toEqual(CANONICAL)
    expect(b.floors).toEqual(a.floors)
  })
  it('平屋では1Fに関係しない変種は null', () => {
    const one: PlanConfig = { ...cfg, floors: 1 }
    expect(buildPlan(one, 0, { W: 20, H: 12 }, v({ stairEnd: 'W' }))).toBeNull()
    expect(buildPlan(one, 0, { W: 20, H: 12 }, v({ bedShift: 1 }))).toBeNull()
    expect(buildPlan(one, 0, { W: 20, H: 12 }, v({ rev: [false, false, true, false] }))).toBeNull()
  })
})
