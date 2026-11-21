import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { waterfill, type WaterfillItem } from './slicing'

const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0)

describe('waterfill', () => {
  it('合計が total に一致し、整数で、min/max を守る', () => {
    const items: WaterfillItem[] = [
      { min: 3, max: 10, w: 2 },
      { min: 2, max: 6, w: 1 },
      { min: 4, max: 20, w: 5 },
    ]
    const r = waterfill(24, items)
    expect(r).not.toBeNull()
    if (!r) return
    expect(sum(r)).toBe(24)
    r.forEach((v, i) => {
      expect(Number.isInteger(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(items[i]?.min ?? NaN)
      expect(v).toBeLessThanOrEqual(items[i]?.max ?? NaN)
    })
  })

  it('重みに比例して配分される（clampに当たらない場合）', () => {
    const r = waterfill(30, [
      { min: 1, max: 100, w: 1 },
      { min: 1, max: 100, w: 2 },
    ])
    expect(r).toEqual([10, 20])
  })

  it('max に当たった分は他へ回る（water-filling）', () => {
    const r = waterfill(20, [
      { min: 1, max: 4, w: 10 },
      { min: 1, max: 100, w: 1 },
    ])
    expect(r).toEqual([4, 16])
  })

  it('min に当たった要素は min を下回らない', () => {
    const r = waterfill(20, [
      { min: 8, max: 100, w: 1 },
      { min: 1, max: 100, w: 20 },
    ])
    expect(r?.[0]).toBe(8)
    expect(r?.[1]).toBe(12)
  })

  it('total が min の合計未満なら null（実現不能）', () => {
    expect(waterfill(5, [{ min: 3, max: 9, w: 1 }, { min: 3, max: 9, w: 1 }])).toBeNull()
  })

  it('total が max の合計超なら null（実現不能）', () => {
    expect(waterfill(30, [{ min: 1, max: 9, w: 1 }, { min: 1, max: 9, w: 1 }])).toBeNull()
  })

  it('境界: total = min合計 / max合計 ちょうどなら解が出る', () => {
    const items: WaterfillItem[] = [{ min: 2, max: 5, w: 1 }, { min: 3, max: 7, w: 3 }]
    expect(waterfill(5, items)).toEqual([2, 3])
    expect(waterfill(12, items)).toEqual([5, 7])
  })

  it('空配列: total 0 なら空、それ以外は null', () => {
    expect(waterfill(0, [])).toEqual([])
    expect(waterfill(3, [])).toBeNull()
  })

  it('ランダムな実行可能入力で常に不変条件を満たす', () => {
    const rng = mulberry32(12345)
    let solved = 0
    for (let n = 0; n < 300; n++) {
      const k = 1 + Math.floor(rng() * 6)
      const items: WaterfillItem[] = Array.from({ length: k }, () => {
        const min = 1 + Math.floor(rng() * 6)
        return { min, max: min + Math.floor(rng() * 12), w: 0.2 + rng() * 10 }
      })
      const lo = sum(items.map((i) => i.min))
      const hi = sum(items.map((i) => i.max))
      const total = lo + Math.floor(rng() * (hi - lo + 1))
      const r = waterfill(total, items)
      expect(r, `case ${n}`).not.toBeNull()
      if (!r) continue
      solved++
      expect(sum(r)).toBe(total)
      r.forEach((v, i) => {
        expect(Number.isInteger(v)).toBe(true)
        expect(v).toBeGreaterThanOrEqual(items[i]?.min ?? NaN)
        expect(v).toBeLessThanOrEqual(items[i]?.max ?? NaN)
      })
    }
    expect(solved).toBe(300)
  })

  it('決定的（同じ入力で同じ出力）', () => {
    const items: WaterfillItem[] = [{ min: 2, max: 9, w: 1.3 }, { min: 2, max: 9, w: 2.7 }, { min: 2, max: 9, w: 0.9 }]
    expect(waterfill(17, items)).toEqual(waterfill(17, items))
  })
})
