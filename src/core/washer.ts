import type { Door, Plan, Room } from './types'
import { doorSwingRect, openingPassage, type Rect } from './derive'
import { washerRoom, type BackDoor } from './backdoor'
import { labelRects, labelSpot } from './furnish'

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

/** 戸口の前に確保する洗面側の通路の奥行（セル。openingPassage の 2 と同じ考え方で、仕様の 1.5〜2 の下限）［暫定］ */
export const DOORWAY_DEPTH = 1.5

/** 部屋 r に接するドア d の、r の側の戸口の前の通路（開く向き・種別を問わない）。共有区間の中点を中心に幅 2（区間内。開き戸の葉の最大 1.8 を覆う） */
export function doorwayPassage(d: Door, r: Room): Rect {
  const D = DOORWAY_DEPTH
  const { edge, swing } = d
  if (edge.dir === 'h') {
    const a = Math.max(edge.lo, swing.center.x - 1), b = Math.min(edge.hi, swing.center.x + 1)
    return { x: a, y: r.y === edge.at ? edge.at : edge.at - D, w: b - a, h: D }
  }
  const a = Math.max(edge.lo, swing.center.y - 1), b = Math.min(edge.hi, swing.center.y + 1)
  return { x: r.x === edge.at ? edge.at : edge.at - D, y: a, w: D, h: b - a }
}

/** 勝手口 bd の室内側の通路（戸は外開きなので弧は室内に入らないが、出入りの通路を空ける） */
export function backDoorPassage(bd: BackDoor): Rect {
  const D = DOORWAY_DEPTH, hw = bd.w / 2 + 0.2
  return { x: bd.side === 'W' ? bd.x : bd.x - D, y: bd.y - hw, w: D, h: hw * 2 }
}

/** 洗面・ランドリー r で、洗濯機・物干しパイプが避ける矩形（洗面に接するすべてのドアの弧と戸口の通路・開口の通路・勝手口の通路） */
function doorBlocks(r: Room, doors: readonly Door[], backDoor?: BackDoor | null, passages = true): Rect[] {
  const out: Rect[] = []
  for (const d of doors) {
    if (d.a !== r && d.b !== r) continue
    out.push(openingPassage(d) ?? doorSwingRect(d))
    if (passages) out.push(doorwayPassage(d, r))
  }
  if (backDoor && backDoor.room === r) out.push(backDoorPassage(backDoor))
  return out
}

/**
 * 洗面 r に洗濯機を描く位置（左上）。ランドリー・洗面とも該当しない部屋・置けない部屋は null。
 * 洗面台・ドアの弧・戸口の前の通路・勝手口の前を避ける。部屋名ラベルの既定位置も避け、避けると置けないときだけラベルを諦める
 */
export function washerSpot(r: Room, doors: readonly Door[], backDoor?: BackDoor | null): Rect | null {
  const s = WASHER_SIZE
  const basin = washBasinRect(r)
  const blocked: Rect[] = [basin, ...doorBlocks(r, doors, backDoor)]
  const lab = labelSpot(r, false, [])
  const labelBlocks = lab ? labelRects(r, lab) : []
  const x0 = r.x + MARGIN, x1 = r.x + r.w - MARGIN - s
  const y0 = r.y + MARGIN, y1 = r.y + r.h - MARGIN - s
  // 四隅（北東 → 南西 → 南東 → 北西）を先に、次に壁沿いを 0.1 刻み（北 → 南 → 東 → 西）で探す。扉が多い細長い洗面でも壁際の空きを拾う
  const cands: Rect[] = [[x1, y0], [x0, y1], [x1, y1], [x0, y0]].map(([x, y]) => ({ x: x as number, y: y as number, w: s, h: s }))
  const nx = Math.floor((x1 - x0) * 10 + 1e-9), ny = Math.floor((y1 - y0) * 10 + 1e-9)
  for (let i = 0; i <= nx; i++) { const x = x1 - i / 10; cands.push({ x, y: y0, w: s, h: s }, { x, y: y1, w: s, h: s }) }
  for (let j = 0; j <= ny; j++) { const y = y0 + j / 10; cands.push({ x: x1, y, w: s, h: s }, { x: x0, y, w: s, h: s }) }
  const inside = (c: Rect) => c.x >= r.x && c.y >= r.y && c.x + c.w <= r.x + r.w && c.y + c.h <= r.y + r.h
  return (
    cands.find((c) => inside(c) && ![...blocked, ...labelBlocks].some((b) => hit(c, b))) ??
    cands.find((c) => inside(c) && !blocked.some((b) => hit(c, b))) ??
    null
  )
}

/**
 * ランドリーの室内干しパイプの線（R-DRAW-28）。長辺に沿った線を、洗濯機（北西の隅）と反対の壁寄り → 同じ側の壁寄りの2本を候補に、
 * ドアの弧・開口の通路・勝手口の通路と重ならない最長の区間（2 セル以上。吊るす線なので戸口の通路は避けない。小さいランドリーは戸口が各壁にあり、通路まで避けると全室で置けない）を返す。なければ null（描かない）
 */
export function dryPipeLine(r: Room, doors: readonly Door[], backDoor?: BackDoor | null): { x1: number; y1: number; x2: number; y2: number } | null {
  if (!hasDryPipe(r)) return null
  const { x, y, w, h } = r
  const lines = h >= w
    ? [x + w - 0.9, x + 0.9].map((lx) => ({ x1: lx, y1: y + 2.3, x2: lx, y2: y + h - 0.5 }))
    : [y + h - 0.9, y + 0.9].map((ly) => ({ x1: x + 2.3, y1: ly, x2: x + w - 0.5, y2: ly }))
  const blocked = doorBlocks(r, doors, backDoor, false)
  // 各候補の線から、障害物と重なる区間を引いた最長の空き区間を取り、最も長い候補を採る（同長は先の候補）。2 セル未満は描かない
  const MIN_LEN = 2
  let best: { x1: number; y1: number; x2: number; y2: number } | null = null
  let bestLen = 0
  for (const l of lines) {
    const vert = l.x1 === l.x2
    const [lo, hi] = vert ? [l.y1, l.y2] : [l.x1, l.x2]
    const cuts = blocked
      .map((b) => (vert ? (b.x < l.x1 + 0.1 && l.x1 - 0.1 < b.x + b.w ? [b.y, b.y + b.h] : null) : (b.y < l.y1 + 0.1 && l.y1 - 0.1 < b.y + b.h ? [b.x, b.x + b.w] : null)))
      .filter((c): c is number[] => c !== null && (c[0] as number) < hi && (c[1] as number) > lo)
      .sort((p, q) => (p[0] as number) - (q[0] as number))
    let cur = lo
    const segs: [number, number][] = []
    for (const c of cuts) { if ((c[0] as number) > cur) segs.push([cur, c[0] as number]); cur = Math.max(cur, c[1] as number) }
    if (cur < hi) segs.push([cur, hi])
    for (const [s0, s1] of segs) {
      if (s1 - s0 >= MIN_LEN && s1 - s0 > bestLen + 1e-9) {
        bestLen = s1 - s0
        best = vert ? { x1: l.x1, y1: s0, x2: l.x2, y2: s1 } : { x1: s0, y1: l.y1, x2: s1, y2: l.y2 }
      }
    }
  }
  return best
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
