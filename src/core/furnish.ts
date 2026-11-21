import type { Door, Room } from './types'
import { doorSwingRect, type Rect } from './derive'
import { tatami } from './rooms'

export type FurnitureKind = 'bed2' | 'bed1' | 'sofa' | 'dining' | 'tv' | 'desk'

export interface FurnitureItem extends Rect {
  kind: FurnitureKind
  /** 置かれた部屋の添字（furnish に渡した rooms の添字） */
  room: number
}

export interface FurnishOpts {
  /** 対面キッチンのカウンターがLDKにあるか */
  kitchenFace: boolean
}

/** 家具寸法（セル単位。1セル=455mm）。w は短辺側ではなく「基準の向き」の横幅 */
export const SIZE: Record<FurnitureKind, { w: number; h: number }> = {
  bed2: { w: 3.1, h: 4.3 },
  bed1: { w: 2.1, h: 4.3 },
  sofa: { w: 4.4, h: 1.9 },
  dining: { w: 3.3, h: 1.8 },
  tv: { w: 3.9, h: 0.9 },
  desk: { w: 2.6, h: 1.3 },
}

/** 壁から家具を離す距離（壁線の太さぶん） */
const INSET = 0.3
/** カウンターの手前に空ける通路 */
const COUNTER_CLEARANCE = 0.7

/** 部屋ごとに置く家具（この順に試す） */
export const PROGRAM: Partial<Record<Room['type'], FurnitureKind[]>> = {
  ldk: ['tv', 'sofa', 'dining'],
  master: ['bed2'],
  bed: ['bed1', 'desk'],
  study: ['desk'],
}

/** 対面キッチンのカウンター矩形。FloorSvg の描画と furnish の回避領域で共有する */
export function kitchenCounter(ldk: Room): Rect {
  const cw = Math.min(8, ldk.w - 3)
  return { x: ldk.x + ldk.w - cw - 0.8, y: ldk.y + 1.2, w: cw, h: 1.5 }
}

/** 細長い部屋（玄関・トイレ等）はラベルを縦積みにする。FloorSvg の描画と furnish の見積もりで共有する */
export function isVerticalLabel(r: Room): boolean {
  return r.w <= 2.6 && r.h >= r.name.length * 1.15 + 0.6
}

/**
 * 部屋名ラベルが占める領域。FloorSvg の RoomLabel と同じ中心・同じ文字サイズ（大きい部屋は 1.55、それ以外は 1.25）で見積もる。
 * 縦積みラベル（幅の狭い部屋）は、1文字ずつ 1.08 間隔で積む描画に合わせて縦長の矩形にする。
 * 畳数行は含めない（含めると標準的な主寝室にベッドが置けなくなるため）。畳数行は areaLabelRect で別に見積もり、furnish が2段階で避ける。
 */
export function labelRect(r: Room, kitchenFace: boolean): Rect {
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2 + (r.type === 'ldk' && kitchenFace ? 1.5 : 0)
  if (isVerticalLabel(r)) {
    const fs = Math.min(1.0, r.w - 0.5)
    const y0 = cy - ((r.name.length - 1) * 1.08) / 2 + 0.35 // 先頭文字のベースライン
    const w = Math.min(r.w, fs + 0.4)
    return { x: cx - w / 2, y: y0 - fs, w, h: (r.name.length - 1) * 1.08 + fs + 0.3 }
  }
  const big = r.w >= 5 && r.h >= 4.5
  const fs = Math.min(big ? 1.55 : 1.25, (r.w - 0.25) / Math.max(1, r.name.length))
  const w = Math.min(r.w, r.name.length * fs + 0.4)
  const h = fs + 0.5
  return { x: cx - w / 2, y: cy - (big ? 0.35 : -0.5) - fs - 0.1, w, h }
}

/**
 * 畳数行（「7畳」等の補助行）が占める領域。FloorSvg の RoomLabel と同じ条件（縦積みでなく、幅5以上かつ高さ4.5以上の部屋）でのみ描かれる。
 * 描画は fontSize 1.2、ベースライン cy+1.55、中央揃え。幅は 数字0.65・小数点0.35・「畳」1.2 で見積もる（余裕込み）。
 */
export function areaLabelRect(r: Room, kitchenFace: boolean): Rect | null {
  if (isVerticalLabel(r) || !(r.w >= 5 && r.h >= 4.5)) return null
  const cx = r.x + r.w / 2
  const cy = r.y + r.h / 2 + (r.type === 'ldk' && kitchenFace ? 1.5 : 0)
  const text = tatami(r.w, r.h)
  const w = Math.min(r.w, Array.from(text).reduce((a, ch) => a + (ch === '.' ? 0.35 : 0.65), 0) + 1.2 + 0.4)
  const fs = 1.2
  return { x: cx - w / 2, y: cy + 1.55 - fs, w, h: fs + 0.3 }
}

export function overlaps(a: Rect, b: Rect): boolean {
  const eps = 1e-9
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps
}

/** 壁沿い・角寄りの候補位置。2つの向き × （四隅 → 各壁の中央 → 各壁の1/4・3/4）の順で固定 */
export function candidates(r: Room, size: { w: number; h: number }, area?: Rect | null): Rect[] {
  const out: Rect[] = []
  for (const [w, h] of [[size.w, size.h], [size.h, size.w]] as const) {
    const x0 = r.x + INSET
    const x1 = r.x + r.w - INSET - w
    const y0 = r.y + INSET
    const y1 = r.y + r.h - INSET - h
    if (x1 < x0 - 1e-9 || y1 < y0 - 1e-9) continue
    const xm = (x0 + x1) / 2
    const ym = (y0 + y1) / 2
    const xq1 = x0 + (x1 - x0) / 4
    const xq3 = x0 + ((x1 - x0) * 3) / 4
    const yq1 = y0 + (y1 - y0) / 4
    const yq3 = y0 + ((y1 - y0) * 3) / 4
    const spots = [
      [x0, y0], [x1, y0], [x0, y1], [x1, y1],
      [xm, y0], [xm, y1], [x0, ym], [x1, ym],
      [xq1, y0], [xq3, y0], [xq1, y1], [xq3, y1], [x0, yq1], [x0, yq3], [x1, yq1], [x1, yq3],
    ] as const
    for (const [x, y] of spots) {
      out.push({ x, y, w, h })
    }
  }
  // 畳数行を基準にした候補（末尾追加）。家具の辺を畳数行の上端・下端・左端・右端に合わせ、壁に沿わせる
  if (area) {
    for (const [w, h] of [[size.w, size.h], [size.h, size.w]] as const) {
      const x0 = r.x + INSET
      const x1 = r.x + r.w - INSET - w
      const y0 = r.y + INSET
      const y1 = r.y + r.h - INSET - h
      if (x1 < x0 - 1e-9 || y1 < y0 - 1e-9) continue
      const inX = (x: number) => x >= x0 - 1e-9 && x <= x1 + 1e-9
      const inY = (y: number) => y >= y0 - 1e-9 && y <= y1 + 1e-9
      const above = area.y - h
      const below = area.y + area.h
      const left = area.x - w
      const right = area.x + area.w
      if (inY(above)) for (const x of [x0, x1]) out.push({ x, y: above, w, h })
      if (inY(below)) for (const x of [x0, x1]) out.push({ x, y: below, w, h })
      if (inX(left)) for (const y of [y0, y1]) out.push({ x: left, y, w, h })
      if (inX(right)) for (const y of [y0, y1]) out.push({ x: right, y, w, h })
    }
  }
  return out
}

/** 家具が避ける固定領域（ドア開き・部屋名ラベル・対面キッチンのカウンター）。furnish とテストで共有する */
export function blockedRects(r: Room, swings: readonly Rect[], kitchenFace: boolean): Rect[] {
  const blocked: Rect[] = [...swings, labelRect(r, kitchenFace)]
  if (r.type === 'ldk' && kitchenFace) {
    const c = kitchenCounter(r)
    blocked.push({ ...c, h: c.h + COUNTER_CLEARANCE })
  }
  return blocked
}

/**
 * 1フロア分の家具を決定的に配置する（純関数・乱数なし）。
 * ドア開きの外接矩形・対面キッチンのカウンター・ラベル領域・既配置の家具と重ならない最初の位置に置き、置けなければ置かない。
 * 2段階: 第1優先は部屋名＋畳数行の両方を避ける位置。なければ部屋名だけを避ける従来の位置にフォールバックする（配置率を落とさない）。
 */
export function furnish(rooms: readonly Room[], doors: readonly Door[], opts: FurnishOpts): FurnitureItem[] {
  const swings = doors.map((d) => doorSwingRect(d.edge))
  const items: FurnitureItem[] = []
  rooms.forEach((r, room) => {
    const kinds = PROGRAM[r.type]
    if (!kinds) return
    const blocked = blockedRects(r, swings, opts.kitchenFace)
    const area = areaLabelRect(r, opts.kitchenFace)
    for (const kind of kinds) {
      const cands = candidates(r, SIZE[kind])
      const candsArea = candidates(r, SIZE[kind], area)
      const free = (c: Rect) => !blocked.some((b) => overlaps(c, b)) && !items.some((it) => it.room === room && overlaps(c, it))
      const spot = (area ? candsArea.find((c) => free(c) && !overlaps(c, area)) : undefined) ?? cands.find(free)
      if (spot) items.push({ kind, room, ...spot })
    }
  })
  return items
}
