import type { Door, Edge, Room, RoomType } from './types'
import { HABITABLE, VIA } from './rooms'

/** 2部屋の共有辺。ドアは辺の中央でなく端寄り（34%地点）に置き、部屋中央のラベルと開き弧を分離する */
export function sharedEdge(a: Room, b: Room): Edge | null {
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const lo = Math.max(a.y, b.y)
    const hi = Math.min(a.y + a.h, b.y + b.h)
    if (hi - lo >= 2) {
      return { dir: 'v', at: a.x + a.w === b.x ? a.x + a.w : b.x + b.w, mid: lo + (hi - lo) * 0.34, len: hi - lo }
    }
  }
  if (a.y + a.h === b.y || b.y + b.h === a.y) {
    const lo = Math.max(a.x, b.x)
    const hi = Math.min(a.x + a.w, b.x + b.w)
    if (hi - lo >= 2) {
      return { dir: 'h', at: a.y + a.h === b.y ? a.y + a.h : b.y + b.h, mid: lo + (hi - lo) * 0.34, len: hi - lo }
    }
  }
  return null
}

const NO_DOOR = new Set([
  'entry-bath', 'entry-wc', 'ldk-bath', 'ldk-wc', 'bath-wc', 'master-bath', 'master-wc',
  'bed-bath', 'bed-wc', 'void-stair',
])
const PAIR_OK = new Set(['kitchen-pantry', 'master-wic', 'laundry-wash', 'bath-wash', 'doma-entry', 'bed-hall'])

function pairKey(a: RoomType, b: RoomType): string {
  return [a, b].sort().join('-')
}

/** 隣接する2部屋にドアを付けてよいか。通り抜け可否は部屋種別ごとの via 集合で判定 */
export function doorOK(a: Room, b: Room): boolean {
  if (a.type === 'void' || b.type === 'void') return false
  const key = pairKey(a.type, b.type)
  if (NO_DOOR.has(key)) return false
  if (VIA[a.type] || VIA[b.type]) return true
  return PAIR_OK.has(key)
}

/** ドアの開き弧の半径（セル）。描画（FloorSvg）と家具配置（furnish）で共有する */
export const DOOR_R = 1.9

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** ドアの開き弧が占める外接矩形。FloorSvg の弧の描画（at,mid を起点に R 四方）と一致させる */
export function doorSwingRect(e: Edge): Rect {
  return e.dir === 'v'
    ? { x: e.at, y: e.mid - DOOR_R, w: DOOR_R, h: DOOR_R }
    : { x: e.mid - DOOR_R, y: e.at - DOOR_R, w: DOOR_R, h: DOOR_R }
}

export function computeDoors(rooms: Room[]): Door[] {
  const doors: Door[] = []
  for (const [i, a] of rooms.entries()) {
    for (const b of rooms.slice(i + 1)) {
      const e = sharedEdge(a, b)
      if (e && doorOK(a, b)) doors.push({ a, b, edge: e })
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
