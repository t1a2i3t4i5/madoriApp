import type { Band, Cell, Footprint, Room } from './types'
import { clamp, shuffle, type Rng } from './rng'

export interface WaterfillItem {
  min: number
  max: number
  w: number
}

/** clamp付きwater-filling: x_i = clamp(w_i * t, min_i, max_i), 合計=total になる t を二分探索し、最大剰余法で整数化 */
export function waterfill(total: number, items: WaterfillItem[]): number[] | null {
  const sumMin = items.reduce((s, i) => s + i.min, 0)
  const sumMax = items.reduce((s, i) => s + i.max, 0)
  if (sumMin > total || sumMax < total) return null
  let lo = 0
  let hi = 1
  const sumAt = (t: number) => items.reduce((s, i) => s + clamp(i.w * t, i.min, i.max), 0)
  while (sumAt(hi) < total && hi < 1e7) hi *= 2
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2
    if (sumAt(mid) < total) lo = mid
    else hi = mid
  }
  const t = (lo + hi) / 2
  // 各要素を整数部(val)と小数部(frac)に分け、最大剰余法で端数を配る（添字アクセスを避けるためスロット化）
  const slots = items.map((i) => {
    const raw = clamp(i.w * t, i.min, i.max)
    return { min: i.min, max: i.max, val: Math.floor(raw), frac: raw - Math.floor(raw) }
  })
  let rem = total - slots.reduce((s, o) => s + o.val, 0)
  const order = slots.slice().sort((a, b) => b.frac - a.frac)
  let guard = 0
  while (rem > 0 && guard < 10000) {
    guard++
    let progressed = false
    for (const o of order) {
      if (rem <= 0) break
      if (o.val < o.max) {
        o.val++
        rem--
        progressed = true
      }
    }
    if (!progressed) return null
  }
  while (rem < 0) {
    let progressed = false
    for (const o of order) {
      if (rem >= 0) break
      if (o.val > o.min) {
        o.val--
        rem++
        progressed = true
      }
    }
    if (!progressed) return null
  }
  return slots.map((o) => o.val)
}

/** 幅が余る場合に余りを吸わせるセルの優先順（収納系→居室の順） */
const ABSORB_PRIORITY = [
  'store', 'pantry', 'wic', 'laundry', 'wash', 'ldk', 'master', 'bed',
  'study', 'washitsu', 'doma', 'entry', 'kitchen', 'wc', 'bath',
]

function mergePair(
  cells: Cell[],
  t1: Cell['type'],
  t2: Cell['type'],
  label: string,
  keepType: Cell['type'],
): Cell[] | null {
  const i1 = cells.findIndex((c) => c.type === t1)
  const i2 = cells.findIndex((c) => c.type === t2)
  const a = cells[i1]
  const b = cells[i2]
  if (!a || !b) return null
  const merged: Cell = {
    type: keepType,
    name: label,
    label,
    target: a.target + b.target,
    minArea: a.minArea + b.minArea,
    maxArea: a.maxArea + b.maxArea,
  }
  const out = cells.slice()
  out.splice(Math.max(i1, i2), 1)
  out.splice(Math.min(i1, i2), 1, merged)
  return out
}

function tryBand(cells: Cell[], W: number, y: number, h: number): Room[] | null {
  const fixedTotal = cells.reduce((s, c) => s + (c.fixedW || 0), 0)
  const flex = cells.filter((c) => !c.fixedW)
  const widths: Record<number, number> = {}
  if (flex.length) {
    const items: WaterfillItem[] = flex.map((c) => ({
      min: Math.max(2, Math.ceil(c.minArea / h)),
      max: Math.max(3, Math.ceil(c.maxArea / h)),
      w: Math.max(1, c.target / h),
    }))
    // 幅が余る場合は吸収セルのmaxを広げて余りを吸わせる
    const avail = W - fixedTotal
    const sumMax = items.reduce((s, i) => s + i.max, 0)
    if (sumMax < avail) {
      let best = -1
      let bestRank = 99
      flex.forEach((c, i) => {
        const r = ABSORB_PRIORITY.indexOf(c.type)
        if (r >= 0 && r < bestRank) {
          bestRank = r
          best = i
        }
      })
      if (best < 0) best = 0
      const absorber = items[best]
      if (absorber) absorber.max = avail
    }
    const alloc = waterfill(avail, items)
    if (!alloc) return null
    for (const [i, c] of flex.entries()) {
      const w = alloc[i]
      if (w === undefined) return null
      widths[cells.indexOf(c)] = w
    }
  }
  let x = 0
  const rooms: Room[] = []
  cells.forEach((c, i) => {
    const w = c.fixedW || widths[i]
    if (w == null || w <= 0) return
    rooms.push({
      type: c.type, name: c.label || c.name, x, y, w, h,
      area: w * h, target: c.target, minArea: c.minArea,
    })
    x += w
  })
  if (x !== W) return null
  return rooms
}

/** 帯（バンド）1本を横に割り付ける。fixedWセルは固定幅、それ以外はwater-filling */
export function layoutBand(band: Band, W: number, y: number, h: number): Room[] | null {
  let cells: Cell[] | null = band.cells
  // 小物セルが多すぎてmin合計が溢れる場合はクラスタを結合して再試行する
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = tryBand(cells, W, y, h)
    if (res) return res
    if (attempt === 0) cells = mergePair(cells, 'entry', 'doma', '玄関・土間', 'doma')
    else if (attempt === 1) cells = mergePair(cells, 'kitchen', 'pantry', 'キッチン', 'kitchen')
    if (!cells) return null
  }
  return null
}

/** 1フロア分: 帯の高さをwater-fillingで決めてから各帯を割り付ける */
export function layoutFloor(W: number, H: number, bands: Band[]): Room[] | null {
  const fixedH = bands.reduce((s, b) => s + (b.fixedH || 0), 0)
  const flexBands = bands.filter((b) => !b.fixedH)
  const heights: Record<number, number> = {}
  if (flexBands.length) {
    const items: WaterfillItem[] = flexBands.map((b) => {
      const t = b.cells.reduce((s, c) => s + (c.fixedW ? c.fixedW * 7 : c.target), 0)
      return { min: b.minH || 5, max: b.maxH || 14, w: Math.max(4, t / W) }
    })
    const needH = H - fixedH
    if (items.reduce((s, i) => s + i.max, 0) < needH) {
      let widest: WaterfillItem | undefined
      for (const it of items) {
        if (!widest || it.w > widest.w) widest = it
      }
      if (widest) widest.max = needH
    }
    const alloc = waterfill(needH, items)
    if (!alloc) return null
    for (const [i, b] of flexBands.entries()) {
      const h = alloc[i]
      if (h === undefined) return null
      heights[bands.indexOf(b)] = h
    }
  }
  let y = 0
  const rooms: Room[] = []
  for (const [i, b] of bands.entries()) {
    const h = b.fixedH || heights[i]
    if (h === undefined) return null
    const rs = layoutBand(b, W, y, h)
    if (!rs) return null
    rs.forEach((r) => rooms.push(r))
    y += h
  }
  if (y !== H) return null
  return rooms
}

/** 外形候補: 目標面積に近く縦横比が極端でない (W,H) を列挙 */
export function footprintCandidates(targetArea: number, rng: Rng): Footprint[] {
  const list: Footprint[] = []
  for (let W = 12; W <= 30; W++) {
    const H = Math.round(targetArea / W)
    if (H < 12 || H > 30) continue
    const ratio = W / H
    if (ratio < 0.62 || ratio > 1.62) continue
    list.push({ W, H, diff: Math.abs(W * H - targetArea) })
  }
  list.sort((a, b) => a.diff - b.diff)
  return shuffle(list.slice(0, 6), rng)
}
