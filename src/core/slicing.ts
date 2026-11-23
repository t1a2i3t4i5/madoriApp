import type { Band, Cell, Footprint, FootprintPair, Room } from './types'
import { clamp } from './rng'
import { minShort } from './rooms'

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

/**
 * 幅が余る場合に余りを吸わせるセルの優先順（R-PROG-11/12: LDK → 個室 → 収納系 → 玄関 → キッチン → 水回り。
 * 水回りを後ろへ回して、洗面・浴室・トイレに余りを吸わせにくくする）
 */
const ABSORB_PRIORITY = [
  'ldk', 'master', 'bed', 'study', 'washitsu', 'store', 'pantry', 'wic',
  'doma', 'entry', 'kitchen', 'laundry', 'wash', 'wc', 'bath',
]

/** クローゼットの幅（セル）。個室セルの幅からこの分を切り出す */
export const CLOSET_W = 2
/** クローゼットの長さの上限（セル）。帯の高さがこれを超えるとき、ホール側の残りは廊下収納にする */
export const CLOSET_MAX_LEN = 8

/** クローゼットのモード。soft（弱）= 入るときだけ切り出す。hard（強）= 個室の幅の下限を上げて必ず切り出す */
export type ClosetMode = 'soft' | 'hard'

/**
 * 個室の矩形から、幅 CLOSET_W × 高さ h の縦の帯をクローゼットとして切り出す。
 * 位置: 帯の西端（x=0）の個室は東側、それ以外は西側（隣り合う個室のクローゼットが背中合わせになる）。
 * 外壁に接する辺は個室側に残す。クローゼットは持ち主（個室）の相対位置 of を持つ。
 * 入力は書き換えず [西, 東] の順に2室を返す
 */
function carveCloset(r: Room): Room[] {
  const west = r.x !== 0
  const own: Room = { ...r, w: r.w - CLOSET_W, area: (r.w - CLOSET_W) * r.h, x: west ? r.x + CLOSET_W : r.x }
  const cx = west ? r.x : r.x + r.w - CLOSET_W
  const cl: Room = {
    type: 'closet', name: 'CL', x: cx, y: r.y, w: CLOSET_W, h: r.h, area: CLOSET_W * r.h,
    target: 8, minArea: 8, of: { dx: own.x - cx, dy: 0 },
  }
  return west ? [cl, own] : [own, cl]
}

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

function tryBand(cells: Cell[], W: number, y: number, h: number, ignoreMinShort = false, closet?: ClosetMode): Room[] | null {
  // 帯の高さが、帯内の幅可変セルの最小の短辺に満たなければ成立しない
  if (!ignoreMinShort && cells.some((c) => !c.fixedW && h < minShort(c.type))) return null
  const fixedTotal = cells.reduce((s, c) => s + (c.fixedW || 0), 0)
  const flex = cells.filter((c) => !c.fixedW)
  const widths: Record<number, number> = {}
  if (flex.length) {
    const items: WaterfillItem[] = flex.map((c) => {
      const base = Math.max(2, Math.ceil(c.minArea / h), ignoreMinShort ? 0 : minShort(c.type))
      // クローゼットを切り出す個室は、目標の幅と上限に CLOSET_W を足す（強モードは下限にも足す）
      const add = closet && c.closet ? CLOSET_W : 0
      const min = base + (closet === 'hard' && c.closet ? CLOSET_W : 0)
      return {
        min,
        // 短辺の下限が面積由来の上限を上回るときは、上限を下限に合わせる。上限は最大面積を超えないよう切り捨てる
        max: Math.max(3, Math.floor(c.maxArea / h), base) + add,
        w: Math.max(1, c.target / h) + add,
      }
    })
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
    const room: Room = {
      type: c.type, name: c.label || c.name, x, y, w, h,
      area: w * h, target: c.target, minArea: c.minArea,
    }
    // 弱モードは、残りの個室が短辺の下限・最小面積を満たすときだけ切り出す
    const fits = closet === 'hard' || w - CLOSET_W >= Math.max(minShort(c.type), Math.ceil(c.minArea / h))
    if (closet && c.closet && !ignoreMinShort && fits) rooms.push(...carveCloset(room))
    else rooms.push(room)
    x += w
  })
  if (x !== W) return null
  return rooms
}

/**
 * 長さが CLOSET_MAX_LEN を超えるクローゼットは、外壁側の L セルだけをクローゼットに残し、ホール側の残り（2セル以上）を
 * ホールを持ち主とする収納（廊下収納）にする（合計の面積は変わらない）。L = h − max(2, h − CLOSET_MAX_LEN)。
 * ホール（type hall）がなければ何もしない。入力は書き換えない
 */
function capClosets(rooms: Room[]): Room[] {
  const hall = rooms.find((r) => r.type === 'hall')
  if (!hall) return rooms
  const out: Room[] = []
  for (const r of rooms) {
    if (r.type !== 'closet' || r.h <= CLOSET_MAX_LEN) {
      out.push(r)
      continue
    }
    const rest = Math.max(2, r.h - CLOSET_MAX_LEN)
    const len = r.h - rest
    // ホールが帯の南（この帯が北帯）なら外壁側は北、ホールが帯の北なら外壁側は南
    const hallBelow = hall.y >= r.y + r.h
    const cy = hallBelow ? r.y : r.y + rest
    const sy = hallBelow ? r.y + len : r.y
    const cl: Room = { ...r, y: cy, h: len, area: r.w * len }
    const store: Room = {
      type: 'store', name: '収納', x: r.x, y: sy, w: r.w, h: rest, area: r.w * rest,
      target: 8, minArea: 4, of: { dx: hall.x - r.x, dy: hall.y - sy },
    }
    // of（持ち主 = 個室の左上）は dy を cl の y に合わせ直す
    if (r.of) cl.of = { dx: r.of.dx, dy: r.of.dy + (r.y - cy) }
    out.push(...(hallBelow ? [cl, store] : [store, cl]))
  }
  return out
}

/** 帯（バンド）1本を横に割り付ける。fixedWセルは固定幅、それ以外はwater-filling */
export function layoutBand(band: Band, W: number, y: number, h: number, ignoreMinShort = false, closet?: ClosetMode): Room[] | null {
  const first = tryBand(band.cells, W, y, h, ignoreMinShort, closet)
  if (first) return first
  // 小物セルが多すぎてmin合計が溢れる場合はクラスタを結合して再試行する。結合できるペアがなければ次の結合へ進む
  let cells = band.cells
  const merges: [Cell['type'], Cell['type'], string, Cell['type']][] = [
    ['entry', 'doma', '玄関・土間', 'doma'],
    ['kitchen', 'pantry', 'キッチン・パントリー', 'kitchen'],
  ]
  for (const [t1, t2, label, keep] of merges) {
    const merged = mergePair(cells, t1, t2, label, keep)
    if (!merged) continue
    cells = merged
    const res = tryBand(cells, W, y, h, ignoreMinShort, closet)
    if (res) return res
  }
  return null
}

export interface LayoutFloorOpts {
  /** 帯番号 → 高さの上限（余りを吸わせる拡張もこれを超えない） */
  capH?: Record<number, number>
  /** 診断専用: 最小の短辺の判定を外す（生成では使わない） */
  ignoreMinShort?: boolean
  /** クローゼットのモード。省略 = 切り出さない（v4 の割り付け）。ignoreMinShort のときは無効 */
  closet?: ClosetMode
}

/** 1フロア分: 帯の高さをwater-fillingで決めてから各帯を割り付ける。帯の高さ（帯番号順）も返す */
export function layoutFloor(
  W: number,
  H: number,
  bands: Band[],
  opts?: LayoutFloorOpts,
): { rooms: Room[]; heights: number[] } | null {
  const capH = opts?.capH
  const ignoreMinShort = opts?.ignoreMinShort ?? false
  const closet = ignoreMinShort ? undefined : opts?.closet
  const fixedH = bands.reduce((s, b) => s + (b.fixedH || 0), 0)
  const heights: Record<number, number> = {}
  const flexIdx = bands.flatMap((b, i) => (b.fixedH ? [] : [i]))
  if (flexIdx.length) {
    const items: WaterfillItem[] = []
    for (const i of flexIdx) {
      const b = bands[i]
      if (!b) return null
      // 帯の高さの目標: クローゼットを切り出す個室セルは、切り出す分（幅 CLOSET_W × 高さ 8 セル²）を目標に足す。
      // 仕様書にない追加だが、外すと洋室が帯の高さ方向に小さくなり、ベッド+机を置ける洋室が 19.3% → 8.2% に減る（弱モードでも v4 の骨格に近づく代わりに）。
      // 3案が出る条件数・候補プール件数は同じ。理由は closet-spec.md と CLAUDE.md にも記録した
      const t = b.cells.reduce((s, c) => s + (c.fixedW ? c.fixedW * 7 : c.target + (closet && c.closet ? CLOSET_W * 8 : 0)), 0)
      const cap = capH?.[i]
      const shortNeed = ignoreMinShort ? 0 : Math.max(0, ...b.cells.filter((c) => !c.fixedW).map((c) => minShort(c.type)))
      const min = Math.max(b.minH || 5, shortNeed)
      let max = b.maxH || 14
      if (cap !== undefined) {
        if (cap < min) return null
        max = Math.min(max, cap)
      }
      items.push({ min, max, w: Math.max(4, t / W) })
    }
    const needH = H - fixedH
    if (items.reduce((s, i) => s + i.max, 0) < needH) {
      let widest: WaterfillItem | undefined
      let widestIdx = -1
      for (const [k, it] of items.entries()) {
        if (!widest || it.w > widest.w) {
          widest = it
          widestIdx = k
        }
      }
      if (widest) {
        const cap = capH?.[flexIdx[widestIdx] ?? -1]
        widest.max = cap !== undefined ? Math.min(needH, cap) : needH
      }
    }
    const alloc = waterfill(needH, items)
    if (!alloc) return null
    for (const [k, i] of flexIdx.entries()) {
      const h = alloc[k]
      if (h === undefined) return null
      heights[i] = h
    }
  }
  let y = 0
  const rooms: Room[] = []
  const hs: number[] = []
  for (const [i, b] of bands.entries()) {
    const h = b.fixedH || heights[i]
    if (h === undefined) return null
    const rs = layoutBand(b, W, y, h, ignoreMinShort, closet)
    if (!rs) return null
    rs.forEach((r) => rooms.push(r))
    hs.push(h)
    y += h
  }
  if (y !== H) return null
  return { rooms: capClosets(rooms), heights: hs }
}

/** 外形候補（シャッフル前）: 目標面積に近く縦横比が極端でない (W,H) の上位 limit 件（既定10）。enumerate と共有する */
export function footprintList(targetArea: number, limit = 10): Footprint[] {
  const list: Footprint[] = []
  for (let W = 12; W <= 30; W++) {
    const H = Math.round(targetArea / W)
    if (H < 12 || H > 30) continue
    const ratio = W / H
    if (ratio < 0.62 || ratio > 1.62) continue
    list.push({ W, H, diff: Math.abs(W * H - targetArea) })
  }
  list.sort((a, b) => a.diff - b.diff)
  return list.slice(0, limit)
}

/** 部分二階: 2F割合 W2*H2 / 合計 の許容範囲と中心 */
export const PARTIAL_RATIO = { min: 0.35, max: 0.45, center: 0.4 } as const
/** 部分二階: 形ごとの外形の組の件数 */
export const PAIR_LIMIT = 6
/** 部分二階: 下屋の出の最小（セル） */
export const MIN_OVERHANG = 3

/**
 * 部分二階の外形の組（決定的）。1F の板は footprintList と同じ範囲（W,H は 12〜30、縦横比 0.62〜1.62）。
 * 2F は1Fと一辺を共有する2形のみ: 東西下屋（H2=H、W2=W−k、W2≥9）／南下屋（W2=W、H2=H−k、H2≥13）、k≥3。
 * 2F割合が [0.35, 0.45] のものを、|総面積−目標| → |割合−0.4| → W → H → W2 → H2 の順に並べ、形ごとに上位 limit 件。
 * 順序は東西下屋 → 南下屋。targetTotal は延床（セル）。
 */
export function footprintPairs(targetTotal: number, limit = PAIR_LIMIT): FootprintPair[] {
  const lists: Record<FootprintPair['shape'], FootprintPair[]> = { ew: [], south: [] }
  const push = (shape: FootprintPair['shape'], W: number, H: number, W2: number, H2: number) => {
    const total = W * H + W2 * H2
    const ratio = (W2 * H2) / total
    if (ratio < PARTIAL_RATIO.min || ratio > PARTIAL_RATIO.max) return
    lists[shape].push({ shape, W, H, W2, H2, diff: Math.abs(total - targetTotal) })
  }
  for (let W = 12; W <= 30; W++) {
    for (let H = 12; H <= 30; H++) {
      const r = W / H
      if (r < 0.62 || r > 1.62) continue
      for (let W2 = 9; W2 <= W - MIN_OVERHANG; W2++) push('ew', W, H, W2, H)
      for (let H2 = 13; H2 <= H - MIN_OVERHANG; H2++) push('south', W, H, W, H2)
    }
  }
  const ratioOf = (p: FootprintPair) => (p.W2 * p.H2) / (p.W * p.H + p.W2 * p.H2)
  const out: FootprintPair[] = []
  for (const shape of ['ew', 'south'] as const) {
    lists[shape].sort(
      (a, b) =>
        a.diff - b.diff ||
        Math.abs(ratioOf(a) - PARTIAL_RATIO.center) - Math.abs(ratioOf(b) - PARTIAL_RATIO.center) ||
        a.W - b.W || a.H - b.H || a.W2 - b.W2 || a.H2 - b.H2,
    )
    out.push(...lists[shape].slice(0, limit))
  }
  return out
}
