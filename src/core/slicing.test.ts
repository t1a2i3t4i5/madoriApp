import { describe, expect, it } from 'vitest'
import { mulberry32 } from './rng'
import { layoutBand, layoutFloor, waterfill, type WaterfillItem } from './slicing'
import { cell } from './rooms'
import type { Band } from './types'

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

describe('layoutBand', () => {
  it('土間がなくても、溢れたらキッチン+パントリーを結合して再試行する（打ち切らない）', () => {
    // 幅 W に ldk + kitchen + pantry + entry の min 面積は収まらないが、kitchen+pantry の結合なら収まる
    const band: Band = { cells: [cell('entry'), cell('ldk'), cell('kitchen'), cell('pantry')] }
    let merged: string[] | null = null
    for (let W = 14; W <= 30 && !merged; W++) {
      for (let h = 7; h <= 12; h++) {
        const rs = layoutBand(band, W, 0, h)
        if (rs && rs.length === 3) {
          merged = rs.map((r) => r.name)
          break
        }
      }
    }
    expect(merged).not.toBeNull()
    expect(merged).toContain('キッチン・パントリー')
  })
  it('結合しても収まらなければ null', () => {
    expect(layoutBand({ cells: [cell('ldk'), cell('entry')] }, 6, 0, 8)).toBeNull()
  })
})

describe('layoutFloor', () => {
  const bands = (): Band[] => [
    { cells: [cell('wash'), cell('bath'), cell('wc'), cell('stair', { fixedW: 4 })], minH: 4, maxH: 8 },
    { cells: [cell('hall')], fixedH: 2 },
    { cells: [cell('entry'), cell('ldk')], minH: 7, maxH: 12 },
  ]
  it('帯の高さを返し、合計が H になる', () => {
    const r = layoutFloor(16, 16, bands())
    expect(r).not.toBeNull()
    if (!r) return
    expect(r.heights.reduce((s, h) => s + h, 0)).toBe(16)
    expect(r.heights[1]).toBe(2)
  })
  it('capH を超えない。cap が min 未満なら null', () => {
    const free = layoutFloor(16, 16, bands())
    expect(free).not.toBeNull()
    const south = free?.heights[2] ?? 0
    expect(south).toBeGreaterThan(7)
    const capped = layoutFloor(16, 16, bands(), { capH: { 2: south - 1 } })
    expect(capped).not.toBeNull()
    if (!capped) return
    expect(capped.heights[2]).toBeLessThanOrEqual(south - 1)
    expect(capped.heights.reduce((s, h) => s + h, 0)).toBe(16)
    expect(layoutFloor(16, 16, bands(), { capH: { 2: 6 } })).toBeNull()
  })
  it('上限の拡張（maxH 合計が H に満たない）でも cap を守る', () => {
    // 16x24: maxH 合計 8+12 < 22 なので、通常は幅の大きい南帯を 15 まで広げる
    const free = layoutFloor(16, 24, bands())
    expect(free).not.toBeNull()
    expect(free?.heights[2]).toBe(15)
    const capped = layoutFloor(16, 24, bands(), { capH: { 2: 14 } })
    expect(capped).not.toBeNull()
    if (!capped) return
    expect(capped.heights[2]).toBe(14)
    expect(capped.heights.reduce((s, h) => s + h, 0)).toBe(24)
    // cap が小さすぎて合計が H に届かなければ null
    expect(layoutFloor(16, 24, bands(), { capH: { 2: 12 } })).toBeNull()
  })
  it('吹抜の y 保証: 1F南帯より2F南帯が高くなる合成構成で、cap が実際に効く', () => {
    // 1F の南帯は maxH 8、2F の南帯は cap なしだと 9 になる（吹抜がLDKの y 範囲からはみ出す構成）
    const f1: Band[] = [
      { cells: [cell('wash'), cell('bath'), cell('wc'), cell('stair', { fixedW: 4 })], minH: 4, maxH: 8 },
      { cells: [cell('hall')], fixedH: 2 },
      { cells: [cell('entry'), cell('ldk')], minH: 7, maxH: 8 },
    ]
    const f2 = (): Band[] => [
      { cells: [cell('wc'), cell('bed'), cell('stair', { fixedW: 4 })], minH: 5, maxH: 9 },
      { cells: [cell('hall')], fixedH: 2 },
      { cells: [cell('master'), cell('bed'), cell('bed')], minH: 6, maxH: 12 },
    ]
    const floor1 = layoutFloor(16, 16, f1)
    expect(floor1).not.toBeNull()
    const south1 = floor1?.heights[2]
    expect(south1).toBe(8)
    const uncapped = layoutFloor(16, 16, f2())
    expect(uncapped).not.toBeNull()
    expect(uncapped?.heights[2]).toBeGreaterThan(south1 ?? 0) // cap がなければ違反になる
    const capped = layoutFloor(16, 16, f2(), { capH: { 2: south1 ?? 0 } })
    expect(capped).not.toBeNull()
    if (!capped) return
    expect(capped.heights[2]).toBeLessThanOrEqual(south1 ?? 0)
    expect(capped.heights).toEqual([6, 2, 8])
  })
  it('入力の bands を書き換えない', () => {
    const b = bands()
    const before = JSON.stringify(b)
    layoutFloor(16, 16, b, { capH: { 2: 9 } })
    expect(JSON.stringify(b)).toBe(before)
  })
})

describe('最小の短辺（GEN_VERSION 4）', () => {
  const band = (...cells: Band['cells']): Band => ({ cells })
  const widthOf = (rs: { type: string; w: number }[], t: string) => rs.find((r) => r.type === t)?.w ?? 0

  it('高さ9の帯で玄関・WIC が幅3以上（ignoreMinShort では v3 と同じ幅2）', () => {
    const b = band(cell('master'), cell('wic'), cell('entry'), cell('wash'), cell('bath'), cell('wc'))
    const ok = layoutBand(b, 20, 0, 9)
    expect(ok).not.toBeNull()
    expect(widthOf(ok ?? [], 'entry')).toBeGreaterThanOrEqual(3)
    expect(widthOf(ok ?? [], 'wic')).toBeGreaterThanOrEqual(3)
    const old = layoutBand(b, 15, 0, 9, true) // 面積由来の下限だけなら幅15に全部収まる（玄関・WIC は幅2）
    expect(widthOf(old ?? [], 'entry')).toBe(2)
    expect(widthOf(old ?? [], 'wic')).toBe(2)
  })
  it('帯の高さが短辺未満（高さ4に洋室）なら null。ignoreMinShort なら組める', () => {
    const b = band(cell('bed'), cell('wash'))
    expect(layoutBand(b, 14, 0, 4)).toBeNull()
    expect(layoutBand(b, 14, 0, 4, true)).not.toBeNull()
  })
  it('max < min になる組（maxArea が小さく短辺が大きい）でも null にならない', () => {
    const small = cell('bed', { maxArea: 20 }) // 高さ9なら面積由来の上限は3だが、短辺5が下限
    const rs = layoutBand(band(small, cell('wash')), 14, 0, 9)
    expect(rs).not.toBeNull()
    expect(widthOf(rs ?? [], 'bed')).toBeGreaterThanOrEqual(5)
  })
  it('layoutFloor: 帯の高さの下限が帯内の短辺の最大以上（洋室を含む帯は高さ5以上）', () => {
    const bands: Band[] = [{ cells: [cell('bed'), cell('wash'), cell('wc')], minH: 3 }, { cells: [cell('ldk')], minH: 7 }]
    const r = layoutFloor(20, 14, bands)
    expect(r === null || (r.heights[0] ?? 0) >= 5).toBe(true)
  })
})

describe('layoutBand の切断線の寄せ（GEN_VERSION 8）', () => {
  const band = (): Band => ({ cells: [cell('bed'), cell('bed'), cell('master')] })
  const edges = (rs: { x: number; w: number }[]) => rs.map((r) => r.x + r.w).slice(0, -1)

  it('寄せなしと合計幅は同じで、境界を ±1 セルの範囲で揃えたい x に寄せる。入力は書き換えない', () => {
    const b = band()
    const snapshot = JSON.stringify(b)
    const base = layoutBand(b, 24, 0, 8)
    expect(base).not.toBeNull()
    if (!base) return
    const e0 = edges(base)
    const want = (e0[0] ?? 0) + 1
    const al = layoutBand(b, 24, 0, 8, false, undefined, { xs: [want], d: 1 })
    expect(al).not.toBeNull()
    if (!al) return
    expect(sum(al.map((r) => r.w))).toBe(24)
    expect(edges(al)).toContain(want)
    al.forEach((r, i) => expect(Math.abs(r.w - (base[i]?.w ?? 0))).toBeLessThanOrEqual(2))
    expect(JSON.stringify(b)).toBe(snapshot)
  })
  it('一致を増やせないとき（揃えたい x が範囲外）は寄せない。決定的', () => {
    const base = layoutBand(band(), 24, 0, 8)
    const far = layoutBand(band(), 24, 0, 8, false, undefined, { xs: [1], d: 1 })
    expect(far).toEqual(base)
    const a = layoutBand(band(), 24, 0, 8, false, 'soft', { xs: [9, 15], d: 1 })
    expect(layoutBand(band(), 24, 0, 8, false, 'soft', { xs: [9, 15], d: 1 })).toEqual(a)
  })
  it('弱モードで切り出せていたクローゼットを、寄せた結果切り出せなくなる幅は採らない', () => {
    const cells = (): Band => ({ cells: [cell('bed', { closet: true }), cell('master', { closet: true }), cell('bed', { closet: true })] })
    const base = layoutBand(cells(), 24, 0, 8, false, 'soft')
    expect(base).not.toBeNull()
    const closets0 = base?.filter((r) => r.type === 'closet').length ?? 0
    for (const x of [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) {
      const al = layoutBand(cells(), 24, 0, 8, false, 'soft', { xs: [x, x + 6], d: 1 })
      expect(al?.filter((r) => r.type === 'closet').length ?? 0, `x=${x}`).toBeGreaterThanOrEqual(closets0)
    }
  })
})
