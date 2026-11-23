import type { Plan, Room, RoomType } from '../core/types'
import { computeDoors } from '../core/derive'
import { VIA } from '../core/rooms'

/**
 * 通り抜けできない部屋（キッチン・浴室など）を中継点にするコスト。
 * VIA だけの経路がどれだけ長くても負けないよう、床面の経路長（高々数百セル）より十分大きくする。
 */
export const NON_VIA_PENALTY = 1e6

/** 動線の系統。guest: 玄関→LDK（来客）、life: LDK→洗面・浴室まわり（生活） */
export type FlowKind = 'guest' | 'life'

export interface FlowPoint { x: number; y: number }

export interface FlowStop extends FlowPoint {
  /** start: 起点 / end: 終点 / via: 経由した部屋 / stair: 階段で別の階とつながる */
  role: 'start' | 'end' | 'via' | 'stair'
  /** 階段マーカーの注記（例: 「2Fへ」「1Fから」） */
  label?: string
}

export interface FlowLine {
  kind: FlowKind
  label: string
  /** 部屋の中心とドア位置を結ぶ折れ線 */
  points: FlowPoint[]
  stops: FlowStop[]
}

interface Target { floor: number; room: Room }

const center = (r: Room): FlowPoint => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/** 最も低い階にある、その種別の部屋 */
function findRoom(plan: Plan, type: RoomType): Target | null {
  for (const [floor, fl] of plan.floors.entries()) {
    const room = fl.rooms.find((r) => r.type === type)
    if (room) return { floor, room }
  }
  return null
}

/**
 * 1つの階の中で from → to のドア経由の最短経路（距離はドア位置込み）。つながらなければ null。
 * 中継は VIA 室だけの経路を優先し、届かないときに限り VIA 以外を大きなコストで通す
 */
function routeInFloor(rooms: Room[], from: Room, to: Room): { rooms: Room[]; points: FlowPoint[] } | null {
  if (from === to) return { rooms: [from], points: [center(from)] }
  const doors = computeDoors(rooms)
  const dist = new Map<Room, number>([[from, 0]])
  const prev = new Map<Room, { room: Room; via: FlowPoint }>()
  const todo = new Set<Room>(rooms)
  while (todo.size) {
    let cur: Room | null = null
    for (const r of todo) {
      const d = dist.get(r)
      if (d !== undefined && (cur === null || d < (dist.get(cur) ?? Infinity))) cur = r
    }
    if (!cur) break
    todo.delete(cur)
    if (cur === to) break
    const here = cur
    for (const d of doors) {
      const other = d.a === here ? d.b : d.b === here ? d.a : null
      if (!other || !todo.has(other)) continue
      const dp: FlowPoint = d.swing.center
      const c1 = center(here), c2 = center(other)
      // 終点以外で VIA でない部屋に入る（＝そこを通り抜ける）のは最後の手段
      const through = other !== to && !VIA[other.type] ? NON_VIA_PENALTY : 0
      const nd = (dist.get(here) ?? 0) + through + Math.hypot(dp.x - c1.x, dp.y - c1.y) + Math.hypot(c2.x - dp.x, c2.y - dp.y)
      if (nd < (dist.get(other) ?? Infinity)) {
        dist.set(other, nd)
        prev.set(other, { room: here, via: dp })
      }
    }
  }
  if (!prev.has(to)) return null
  const seq: Room[] = [to]
  const pts: FlowPoint[] = [center(to)]
  for (let r = to; r !== from;) {
    const p = prev.get(r)
    if (!p) return null
    pts.push(p.via, center(p.room))
    seq.push(p.room)
    r = p.room
  }
  return { rooms: seq.reverse(), points: pts.reverse() }
}

/** 系統ごとの経由部屋の並び。生活動線は LDK → 洗面 → 浴室（あるものだけ）。起点か終点側が無ければ null */
function waypoints(plan: Plan, kind: FlowKind): Target[] | null {
  const ldk = findRoom(plan, 'ldk')
  if (!ldk) return null
  if (kind === 'guest') {
    // 結合セル（玄関+土間 = doma）は玄関を兼ねる
    const entry = findRoom(plan, 'entry') ?? findRoom(plan, 'doma')
    return entry ? [entry, ldk] : null
  }
  const rest = [findRoom(plan, 'wash'), findRoom(plan, 'bath')].filter((t): t is Target => t !== null)
  return rest.length ? [ldk, ...rest] : null
}

/**
 * 表示中の階に描く動線を計算する純関数。
 * - 経路は実際のドアでつながる部屋の最短経路（ホール・廊下・階段が必要なら自然に通る）
 * - 起点・終点が別の階にあるときは、その階の階段までを描き、階段マーカー（「2Fへ」など）を付ける
 * - 表示階に関係する区間がない系統、階段がなくてつなげない系統は返さない
 */
export function computeFlows(plan: Plan, floorIdx: number): FlowLine[] {
  const fl = plan.floors[floorIdx]
  if (!fl) return []
  const lines: FlowLine[] = []
  const meta: Record<FlowKind, string> = { guest: '来客動線（玄関→LDK）', life: '生活動線（LDK→洗面・浴室）' }
  for (const kind of ['guest', 'life'] as const) {
    const wps = waypoints(plan, kind)
    if (!wps) continue
    const points: FlowPoint[] = []
    const stops: FlowStop[] = []
    let ok = true
    for (let i = 0; i + 1 < wps.length && ok; i++) {
      const a = wps[i], b = wps[i + 1]
      if (!a || !b || (a.floor !== floorIdx && b.floor !== floorIdx)) continue
      let from = a.room, to = b.room
      let arrive: string | null = null, depart: string | null = null
      if (a.floor !== floorIdx || b.floor !== floorIdx) {
        const stair = fl.rooms.find((r) => r.type === 'stair')
        if (!stair) { ok = false; break }
        if (a.floor !== floorIdx) { from = stair; arrive = `${plan.floors[a.floor]?.label ?? ''}から` }
        else { to = stair; depart = `${plan.floors[b.floor]?.label ?? ''}へ` }
      }
      const r = routeInFloor(fl.rooms, from, to)
      if (!r) { ok = false; break }
      for (const p of r.points) {
        const last = points[points.length - 1]
        if (!last || last.x !== p.x || last.y !== p.y) points.push(p)
      }
      // 前の区間の終点は、次の区間があるので経由扱いにする
      const prevStop = stops[stops.length - 1]
      if (prevStop && prevStop.role === 'end') prevStop.role = 'via'
      else if (!prevStop) stops.push({ ...center(from), role: arrive ? 'stair' : 'start', ...(arrive ? { label: arrive } : {}) })
      for (const room of r.rooms.slice(1, -1)) stops.push({ ...center(room), role: 'via' })
      stops.push({ ...center(to), role: depart ? 'stair' : 'end', ...(depart ? { label: depart } : {}) })
    }
    if (ok && points.length >= 2) lines.push({ kind, label: meta[kind], points, stops })
  }
  return lines
}
