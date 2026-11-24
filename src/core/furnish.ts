import type { Door, Room } from './types'
import { doorSwingRect, openingPassage, type Rect } from './derive'
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

/** 部屋名の文字サイズ（幅に収まらないときだけ縮める）と畳数行の文字サイズ。FloorSvg の RoomLabel と共有する */
export const LABEL_FS = 1.2
export const AREA_FS = 1.0

/**
 * 部屋名ラベルの置き場所（labelSpot の結果）。cx・cy は FloorSvg の RoomLabel の中心（既定は部屋の中央。対面キッチンの LDK は 1.5 下）、
 * s は既定の文字サイズに対する倍率（縮小は 0.75 倍まで）、layout は横書き（row）か縦積み（stack）、area は畳数行を描くか
 */
export interface LabelSpot {
  cx: number
  cy: number
  s: number
  layout: 'row' | 'stack'
  area: boolean
}

/**
 * 従来の描画（家具を表示しないとき）が選ぶ形。縦積みの部屋は縦積み、幅が足りない（fit < 0.75）部屋は縦積みに収まれば縦積み、収まらなければ省略（null）、
 * それ以外は横書き（小さすぎる部屋は省略）。FloorSvg の従来のフォールバックと同じ
 */
function legacyLayout(r: Room): LabelSpot['layout'] | null {
  if (isVerticalLabel(r)) return 'stack'
  if ((r.w - 0.5) / Math.max(1, r.name.length) < 0.75) return stackFits(r) ? 'stack' : null
  if (r.w >= 5 && r.h >= 4.5) return 'row'
  return r.w >= 2 && r.h >= 2.4 ? 'row' : null
}

/** 縦積み（既定の大きさ）が幅・高さに収まるか（幅に収まらない非縦積みの部屋用。従来の条件） */
function stackFits(r: Room): boolean {
  const { fs, step } = stackMetrics(r, 1)
  return r.w >= 1.6 && fs >= 0.75 && r.h >= Math.max(1, r.name.length) * step + 0.6
}

/** ラベルの既定の形（中央・既定の大きさ・畳数行あり）。FloorSvg の従来の描画と同じ */
function defaultSpot(r: Room, kitchenFace: boolean, layout: LabelSpot['layout']): LabelSpot {
  return {
    cx: r.x + r.w / 2,
    cy: r.y + r.h / 2 + (r.type === 'ldk' && kitchenFace ? 1.5 : 0),
    s: 1,
    layout,
    area: layout === 'row' && r.w >= 5 && r.h >= 4.5,
  }
}

/** 縦積みの文字サイズと行送り（isVerticalLabel の部屋は 1.0 / 1.08、幅に収まらず縦積みに切り替える部屋は 0.95 / fs+0.15。FloorSvg と同じ） */
export function stackMetrics(r: Room, s: number): { fs: number; step: number } {
  if (isVerticalLabel(r)) return { fs: Math.min(1.0, r.w - 0.5) * s, step: 1.08 * s }
  const fs = Math.min(0.95, r.w - 0.5) * s
  return { fs, step: fs + 0.15 }
}

/** 横書きの室名の文字サイズ（幅に収まらないときは縮める） */
export function rowFs(r: Room, s: number): number {
  return Math.min(LABEL_FS, (r.w - 0.5) / Math.max(1, r.name.length)) * s
}

/** ラベルが実際に描かれる領域（実寸）。室名と畳数行を別々の矩形で返す */
export function labelRects(r: Room, spot: LabelSpot): Rect[] {
  const n = Math.max(1, r.name.length)
  if (spot.layout === 'stack') {
    const { fs, step } = stackMetrics(r, spot.s)
    const y0 = spot.cy - ((n - 1) * step) / 2 + fs * 0.35
    return [{ x: spot.cx - fs / 2 - 0.1, y: y0 - fs * 0.85, w: fs + 0.2, h: (n - 1) * step + fs }]
  }
  const fs = rowFs(r, spot.s)
  const big = r.w >= 5 && r.h >= 4.5
  const base = big ? spot.cy - 0.25 : spot.cy + fs * 0.35
  const out: Rect[] = [{ x: spot.cx - (n * fs) / 2, y: base - fs * 0.85, w: n * fs, h: fs }]
  if (big && spot.area) {
    const afs = AREA_FS * spot.s
    const b2 = spot.cy - 0.25 + 1.5 * spot.s
    const w = Array.from(tatami(r.w, r.h)).reduce((a, ch) => a + (ch === '.' ? 0.3 : 0.55), 0) * afs + afs
    out.push({ x: spot.cx - w / 2, y: b2 - afs * 0.85, w, h: afs })
  }
  return out
}

/**
 * 部屋名ラベルの置き場所を決める（純関数。家具を置いた後に呼ぶ）。
 * 中央 → 中央からの上下左右のずらし（近い順）→ 縮小（下限 0.75 倍。畳数行ありのまま全倍率）→ 畳数行を省く（なしで全倍率）→ 縦積み（文字は 0.75 未満にしない）の順に試し、
 * obstacles（家具・ドアの弧・カウンター）と重ならず部屋に収まる最初の位置を返す。置けなければ null（ラベルを省く）。
 * 既定の位置で重ならないとき（障害物がないときを含む）は既定をそのまま返す。
 */
export function labelSpot(r: Room, kitchenFace: boolean, obstacles: readonly Rect[]): LabelSpot | null {
  const base = legacyLayout(r)
  if (!base) return null // 従来の描画も省く部屋（幅・高さが足りない）
  const def = defaultSpot(r, kitchenFace, base)
  const hit = (sp: LabelSpot) => labelRects(r, sp).some((q) => obstacles.some((o) => overlaps(q, o)))
  if (!hit(def)) return def
  const inside = (sp: LabelSpot) => labelRects(r, sp).every((q) => q.x >= r.x + 0.1 && q.y >= r.y + 0.1 && q.x + q.w <= r.x + r.w - 0.1 && q.y + q.h <= r.y + r.h - 0.1)
  const offsets: [number, number][] = []
  for (let dy = -6; dy <= 6; dy += 0.5) for (let dx = -6; dx <= 6; dx += 0.5) offsets.push([dx, dy])
  offsets.sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - (Math.abs(b[0]) + Math.abs(b[1])) || a[1] - b[1] || a[0] - b[0])
  const tryLayout = (layout: LabelSpot['layout']): LabelSpot | null => {
    // 畳数行ありのまま全倍率を試し、だめなら畳数行なしで全倍率を試す（縮小が先、畳数行を省くのは後）
    for (const area of def.area && layout === 'row' ? [true, false] : [false]) {
      for (const s of [1, 0.9, 0.8, 0.75]) {
        if (layout === 'stack' && stackMetrics(r, s).fs < 0.75) continue // 縦積みの文字は 0.75 未満にしない
        for (const [dx, dy] of offsets) {
          const sp: LabelSpot = { cx: def.cx + dx, cy: def.cy + dy, s, layout, area }
          if (inside(sp) && !hit(sp)) return sp
        }
      }
    }
    return null
  }
  // 既定が縦積みの部屋は縦積みだけ試す（横書きでは極小の文字になる）。横書きの部屋は、置けなければ縦積みにも逃がす
  if (base === 'stack') return tryLayout('stack')
  return tryLayout('row') ?? (stackFits(r) ? tryLayout('stack') : null)
}

/**
 * 1フロア分の部屋ごとのラベルの置き場所。家具のある部屋（PROGRAM の種別）だけが対象で、家具・ドアの弧・開口の通路・
 * 対面キッチンのカウンターを避ける。家具のない部屋は undefined（従来どおり中央に描く）、置けない部屋は null（ラベルを省く）
 */
export function labelSpots(rooms: readonly Room[], doors: readonly Door[], items: readonly FurnitureItem[], kitchenFace: boolean): (LabelSpot | null | undefined)[] {
  const swings = doors.map((d) => openingPassage(d) ?? doorSwingRect(d))
  return rooms.map((r, i) => {
    const mine = items.filter((it) => it.room === i)
    if (mine.length === 0) return undefined
    return labelSpot(r, kitchenFace, [...blockedRects(r, swings, kitchenFace), ...mine])
  })
}

export function overlaps(a: Rect, b: Rect): boolean {
  const eps = 1e-9
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps
}

/** 壁沿い・角寄りの候補位置。2つの向き × （四隅 → 各壁の中央 → 各壁の1/4・3/4）の順で固定 */
export function candidates(r: Room, size: { w: number; h: number }): Rect[] {
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

/** 家具が避ける固定領域（ドア開き・対面キッチンのカウンター）。部屋名ラベルは避けない（ラベルのほうが家具の後に空きへ置かれる。labelSpot）。furnish とテストで共有する */
export function blockedRects(r: Room, swings: readonly Rect[], kitchenFace: boolean): Rect[] {
  const blocked: Rect[] = [...swings]
  if (r.type === 'ldk' && kitchenFace) {
    const c = kitchenCounter(r)
    blocked.push({ ...c, h: c.h + COUNTER_CLEARANCE })
  }
  return blocked
}

/**
 * 1フロア分の家具を決定的に配置する（純関数・乱数なし）。
 * ドア開きの外接矩形・対面キッチンのカウンター・既配置の家具と重ならない最初の位置に置き、置けなければ置かない。
 * 部屋名ラベルは避けない（ラベルは家具の後に空いた場所へ置く。labelSpot）。
 */
export function furnish(rooms: readonly Room[], doors: readonly Door[], opts: FurnishOpts): FurnitureItem[] {
  // 開き戸・折れ戸は弧・葉の矩形、扉のない開口（階段の口）は前の 2×2 の通路を避ける
  const swings = doors.map((d) => openingPassage(d) ?? doorSwingRect(d))
  const items: FurnitureItem[] = []
  rooms.forEach((r, room) => {
    const kinds = PROGRAM[r.type]
    if (!kinds) return
    const blocked = blockedRects(r, swings, opts.kitchenFace)
    for (const kind of kinds) {
      const free = (c: Rect) => !blocked.some((b) => overlaps(c, b)) && !items.some((it) => it.room === room && overlaps(c, it))
      const spot = candidates(r, SIZE[kind]).find(free)
      if (spot) items.push({ kind, room, ...spot })
    }
  })
  return items
}
