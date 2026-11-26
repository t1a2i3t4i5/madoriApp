import type { Door, Plan, Room } from './types'
import { doorSwingRect, openingPassage, type Rect } from './derive'
import { washerRoom } from './backdoor'

/**
 * 洗面の洗濯機の置き場所（R-DRAW-28。洗濯動線 PR-L2）。純関数・フレームワーク非依存。**生成・スコア・fixture には効かせない**（描画だけ）。
 * ランドリーのない案（1F）で、洗濯機の部屋 = 洗面（`washerRoom`）に洗濯機（ランドリーと同じ 1.5×1.5 の記号）を置く。
 * 洗面台（Fixtures の洗面の器具）・ドアの弧・開口の前の通路と重ならない隅を、決まった順（北東 → 南西 → 南東 → 北西）で探し、
 * 置けなければ null（家具と同じ方針: 置けなければ描かない）
 */
export const WASHER_SIZE = 1.5
const MARGIN = 0.3

/** Fixtures の洗面の器具（洗面台）が占める矩形。Fixtures.tsx の描画と同じ寸法 */
export function washBasinRect(r: Room): Rect {
  const bw = Math.min(2.6, r.w - 0.8)
  return { x: r.x + 0.4, y: r.y + 0.4, w: bw, h: 1.2 }
}

const hit = (a: Rect, b: Rect) => {
  const eps = 1e-9
  return a.x < b.x + b.w - eps && b.x < a.x + a.w - eps && a.y < b.y + b.h - eps && b.y < a.y + a.h - eps
}

/** 洗面 r に洗濯機を描く位置（左上）。ランドリー・洗面とも該当しない部屋・置けない部屋は null */
export function washerSpot(r: Room, doors: readonly Door[]): Rect | null {
  const s = WASHER_SIZE
  const basin = washBasinRect(r)
  const blocked: Rect[] = [basin]
  for (const d of doors) {
    if (d.a !== r && d.b !== r) continue
    blocked.push(openingPassage(d) ?? doorSwingRect(d))
  }
  const x0 = r.x + MARGIN, x1 = r.x + r.w - MARGIN - s
  const y0 = r.y + MARGIN, y1 = r.y + r.h - MARGIN - s
  // 四隅（北東 → 南西 → 南東 → 北西）を先に、次に壁沿いを 0.1 刻み（北 → 南 → 東 → 西）で探す。扉が多い細長い洗面でも壁際の空きを拾う
  const cands: Rect[] = [[x1, y0], [x0, y1], [x1, y1], [x0, y0]].map(([x, y]) => ({ x: x as number, y: y as number, w: s, h: s }))
  const nx = Math.floor((x1 - x0) * 10 + 1e-9), ny = Math.floor((y1 - y0) * 10 + 1e-9)
  for (let i = 0; i <= nx; i++) { const x = x1 - i / 10; cands.push({ x, y: y0, w: s, h: s }, { x, y: y1, w: s, h: s }) }
  for (let j = 0; j <= ny; j++) { const y = y0 + j / 10; cands.push({ x: x1, y, w: s, h: s }, { x: x0, y, w: s, h: s }) }
  return cands.find((c) => c.x >= r.x && c.y >= r.y && c.x + c.w <= r.x + r.w && c.y + c.h <= r.y + r.h && !blocked.some((b) => hit(c, b))) ?? null
}

/** 1F の洗濯機の部屋が洗面（ランドリーがない案）なら、その洗面。洗濯機の記号を洗面に描くかどうかの判定 */
export function washerInWash(plan: Pick<Plan, 'floors'>): Room | null {
  const r = washerRoom(plan)
  return r && r.type === 'wash' ? r : null
}

/** ランドリー室の室内干しパイプを描く最小の面積（セル²）と短辺［暫定］。R-DRAW-28 */
export const DRY_PIPE_MIN_AREA = 16
export const DRY_PIPE_MIN_SHORT = 3

export function hasDryPipe(r: Room): boolean {
  return r.type === 'laundry' && r.w * r.h >= DRY_PIPE_MIN_AREA && Math.min(r.w, r.h) >= DRY_PIPE_MIN_SHORT
}
