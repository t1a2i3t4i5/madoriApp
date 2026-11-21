import type { Door, Room } from './types'
import { doorSwingRect, type Rect } from './derive'

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
const SIZE: Record<FurnitureKind, { w: number; h: number }> = {
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
const PROGRAM: Partial<Record<Room['type'], FurnitureKind[]>> = {
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
 * 畳数の小さな補助行は含めない（7×8 の主寝室など標準的な部屋にベッドが置けなくなるため。補助行は家具の上に重なって描かれる）。
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

export function overlaps(a: Rect, b: Rect): boolean {
  const eps = 1e-9
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps
}

/** 壁沿い・角寄りの候補位置。2つの向き × （四隅 → 各壁の中央 → 各壁の1/4・3/4）の順で固定 */
function candidates(r: Room, size: { w: number; h: number }): Rect[] {
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
  return out
}

/**
 * 1フロア分の家具を決定的に配置する（純関数・乱数なし）。
 * ドア開きの外接矩形・対面キッチンのカウンター・ラベル領域・既配置の家具と重ならない最初の位置に置き、置けなければ置かない。
 */
export function furnish(rooms: readonly Room[], doors: readonly Door[], opts: FurnishOpts): FurnitureItem[] {
  const swings = doors.map((d) => doorSwingRect(d.edge))
  const items: FurnitureItem[] = []
  rooms.forEach((r, room) => {
    const kinds = PROGRAM[r.type]
    if (!kinds) return
    const blocked: Rect[] = [...swings, labelRect(r, opts.kitchenFace)]
    if (r.type === 'ldk' && opts.kitchenFace) {
      const c = kitchenCounter(r)
      blocked.push({ ...c, h: c.h + COUNTER_CLEARANCE })
    }
    for (const kind of kinds) {
      const spot = candidates(r, SIZE[kind]).find(
        (c) => !blocked.some((b) => overlaps(c, b)) && !items.some((it) => it.room === room && overlaps(c, it)),
      )
      if (spot) items.push({ kind, room, ...spot })
    }
  })
  return items
}
