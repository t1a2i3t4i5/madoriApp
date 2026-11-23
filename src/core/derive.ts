import type { Door, DoorSwing, Edge, Pt, Room, RoomType } from './types'
import { HABITABLE, VIA } from './rooms'

/** 2部屋の共有辺。ドアは辺の中央でなく端寄り（34%地点）に置き、部屋中央のラベルと開き弧を分離する */
export function sharedEdge(a: Room, b: Room): Edge | null {
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const lo = Math.max(a.y, b.y)
    const hi = Math.min(a.y + a.h, b.y + b.h)
    if (hi - lo >= 2) {
      return { dir: 'v', at: a.x + a.w === b.x ? a.x + a.w : b.x + b.w, mid: lo + (hi - lo) * 0.34, len: hi - lo, lo, hi }
    }
  }
  if (a.y + a.h === b.y || b.y + b.h === a.y) {
    const lo = Math.max(a.x, b.x)
    const hi = Math.min(a.x + a.w, b.x + b.w)
    if (hi - lo >= 2) {
      return { dir: 'h', at: a.y + a.h === b.y ? a.y + a.h : b.y + b.h, mid: lo + (hi - lo) * 0.34, len: hi - lo, lo, hi }
    }
  }
  return null
}

type RoomPair = readonly [RoomType, RoomType]

/** ドアを付けないペア。照合は pairKey で正規化した Set で行うので順不同でも効くが、定義は正規形（アルファベット順）で書く（テストで検査） */
export const NO_DOOR_PAIRS: readonly RoomPair[] = [
  ['bath', 'entry'], ['entry', 'wc'], ['bath', 'ldk'], ['ldk', 'wc'], ['bath', 'wc'],
  ['bath', 'master'], ['master', 'wc'], ['bath', 'bed'], ['bed', 'wc'], ['stair', 'void'], ['stair', 'wc'],
]
/** VIA の判定とは別に、明示的にドアを許すペア（VIA を含むペアも含む）。NO_DOOR に該当するペアは除く */
export const PAIR_OK_PAIRS: readonly RoomPair[] = [
  ['kitchen', 'pantry'], ['master', 'wic'], ['laundry', 'wash'], ['bath', 'wash'], ['doma', 'entry'], ['bed', 'hall'],
]

/** 部屋タイプ2つを順不同で同じキーにする（アルファベット順） */
export function pairKey(a: RoomType, b: RoomType): string {
  return [a, b].sort().join('-')
}

const NO_DOOR = new Set(NO_DOOR_PAIRS.map(([a, b]) => pairKey(a, b)))
const PAIR_OK = new Set(PAIR_OK_PAIRS.map(([a, b]) => pairKey(a, b)))

/** 隣接する2部屋にドアを付けてよいか。通り抜け可否は部屋種別ごとの via 集合で判定 */
export function doorOK(a: Room, b: Room): boolean {
  if (a.type === 'void' || b.type === 'void') return false
  const key = pairKey(a.type, b.type)
  if (NO_DOOR.has(key)) return false
  // 浴室のドアは洗面とだけ付ける（ホール・階段などの VIA 室とも付けない）
  if (a.type === 'bath' || b.type === 'bath') return key === pairKey('bath', 'wash')
  if (VIA[a.type] || VIA[b.type]) return true
  return PAIR_OK.has(key)
}

/** ドアの葉の最大長（セル） */
export const DOOR_LEAF = 1.8
/** 玄関の外開きドアの半径の上限（セル） */
export const ENTRY_DOOR_R = 2.0

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * ドアの開き先。片方だけが通り抜け不可（VIA でない）ならその部屋、
 * 条件が同じなら面積の小さい方。それも同じなら y・x の小さい方（決定的）
 */
function opensInto(a: Room, b: Room): 'a' | 'b' {
  const av = !!VIA[a.type], bv = !!VIA[b.type]
  if (av !== bv) return av ? 'b' : 'a'
  if (a.area !== b.area) return a.area < b.area ? 'a' : 'b'
  if (a.y !== b.y) return a.y < b.y ? 'a' : 'b'
  return a.x <= b.x ? 'a' : 'b'
}

/**
 * ドア1枚の形状。葉は共有区間内（長さ最大 DOOR_LEAF）で 34% 地点を中心に置き、区間内へクランプする。
 * 半径は葉の長さと、開き先の壁に垂直な深さの小さい方 → 弧の矩形は開き先の部屋に収まる。
 * 描画（FloorSvg）・家具配置（furnish）・動線（flow）が共有する唯一の定義
 */
export function doorSwing(a: Room, b: Room, e: Edge): DoorSwing {
  const opens = opensInto(a, b)
  const room = opens === 'a' ? a : b
  // 開き先が辺の小さい座標側か大きい座標側か（at が部屋の末端か先端か）で開く向きが決まる
  const isV = e.dir === 'v'
  const depth = isV ? room.w : room.h
  const near = isV ? room.x : room.y // 開き先の部屋の、辺に垂直な方向の始点
  const dirSign = e.at === near ? 1 : -1
  const r = Math.max(0, Math.min(DOOR_LEAF, e.len, depth))
  const s = Math.min(Math.max(e.mid - r / 2, e.lo), e.hi - r)
  const pt = (along: number, perp: number): Pt => (isV ? { x: perp, y: along } : { x: along, y: perp })
  const hinge = pt(s, e.at)
  const closed = pt(s + r, e.at)
  const open = pt(s, e.at + dirSign * r)
  const center = pt(s + r / 2, e.at)
  const px = Math.min(e.at, e.at + dirSign * r)
  const rect: Rect = isV ? { x: px, y: s, w: r, h: r } : { x: s, y: px, w: r, h: r }
  return { opens, r, hinge, closed, open, center, rect }
}

/** 弧の外接矩形。FloorSvg の描画と一致する */
export function doorSwingRect(d: Door): Rect {
  return d.swing.rect
}

/** 開き弧の SVG パス（hinge → from → 弧 → to → 閉じる）。sweep は外積の向きから決める */
export function swingPath(hinge: Pt, from: Pt, to: Pt, r: number): string {
  const cross = (from.x - hinge.x) * (to.y - hinge.y) - (from.y - hinge.y) * (to.x - hinge.x)
  return `M ${hinge.x} ${hinge.y} L ${from.x} ${from.y} A ${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${to.x} ${to.y} Z`
}

export function doorPath(d: Door): string {
  const s = d.swing
  return swingPath(s.hinge, s.closed, s.open, s.r)
}

/** 玄関（南外壁に接するもの）の外開きドア。半径は玄関の幅以下で、弧は玄関の間口の範囲内に収まる */
export function entryDoor(entry: Room, H: number): { path: string; rect: Rect; r: number } {
  const r = Math.min(ENTRY_DOOR_R, entry.w)
  const hx = entry.x + (entry.w - r) / 2
  const hinge = { x: hx, y: H }
  return {
    path: swingPath(hinge, { x: hx, y: H + r }, { x: hx + r, y: H }, r),
    rect: { x: hx, y: H, w: r, h: r },
    r,
  }
}

export function computeDoors(rooms: Room[]): Door[] {
  const doors: Door[] = []
  for (const [i, a] of rooms.entries()) {
    for (const b of rooms.slice(i + 1)) {
      const e = sharedEdge(a, b)
      if (e && doorOK(a, b)) doors.push({ a, b, edge: e, swing: doorSwing(a, b, e) })
    }
  }
  return doors
}

export interface WindowSeg {
  /** 窓が付く外壁側 */
  side: 'N' | 'S'
  cx: number
  len: number
}

/** 居室の北・南外壁に窓を自動配置する */
export function computeWindows(rooms: Room[], H: number): WindowSeg[] {
  const out: WindowSeg[] = []
  for (const r of rooms) {
    if (!HABITABLE[r.type]) continue
    const len = Math.min(6, Math.max(2.4, r.w - 2.4))
    const cx = r.x + r.w / 2
    if (r.y + r.h === H) out.push({ side: 'S', cx, len })
    if (r.y === 0) out.push({ side: 'N', cx, len })
  }
  return out
}
