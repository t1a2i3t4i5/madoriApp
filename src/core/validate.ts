import type { Plan } from './types'
import { HABITABLE } from './rooms'
import { computeDoors } from './derive'

/** 外壁に接しているか（採光） */
export function touchesOuterWall(r: { x: number; y: number; w: number; h: number }, W: number, H: number): boolean {
  return r.x === 0 || r.y === 0 || r.x + r.w === W || r.y + r.h === H
}

/** ハード制約の検証: 全室への到達可能性 + 居室の外壁接触 + 最低面積。違反は棄却 */
export function validatePlan(plan: Plan): boolean {
  for (const fl of plan.floors) {
    const rooms = fl.rooms
    const doors = computeDoors(rooms)
    const adj = new Map(rooms.map((r) => [r, [] as typeof rooms]))
    for (const d of doors) {
      adj.get(d.a)!.push(d.b)
      adj.get(d.b)!.push(d.a)
    }
    const start = rooms.find((r) => r.type === 'entry') ?? rooms.find((r) => r.type === 'stair')
    if (!start) return false
    const seen = new Set([start])
    const stack = [start]
    while (stack.length) {
      const cur = stack.pop()!
      for (const n of adj.get(cur) ?? []) {
        if (!seen.has(n)) {
          seen.add(n)
          stack.push(n)
        }
      }
    }
    for (const r of rooms) {
      if (r.type !== 'void' && !seen.has(r)) return false
    }
    for (const r of rooms) {
      if (HABITABLE[r.type] && !touchesOuterWall(r, plan.W, plan.H)) return false
      if (r.type !== 'hall' && r.type !== 'void' && r.area < (r.minArea || 0) - 1) return false
    }
  }
  return true
}
