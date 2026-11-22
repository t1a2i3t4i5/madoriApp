import type { Plan, Room } from './types'
import { HABITABLE } from './rooms'
import { computeDoors, sharedEdge } from './derive'

/** 外壁に接しているか（採光） */
export function touchesOuterWall(r: { x: number; y: number; w: number; h: number }, W: number, H: number): boolean {
  return r.x === 0 || r.y === 0 || r.x + r.w === W || r.y + r.h === H
}

/**
 * 水回りの隣接（制約C）の違反を返す（なければ空）。階ごとに、辺共有は sharedEdge と同じ基準（2セル以上）:
 * - 浴室があれば洗面と辺を共有する
 * - ランドリーがあれば洗面と辺を共有する
 * - トイレは、同じ階に浴室・洗面・ランドリーのどれかがあれば、そのいずれかと辺を共有する（なければ満たす）
 * キッチン・パントリーは対象外（南帯と北帯がホール帯で仕切られ、構造的に隣接できないため）
 */
export function wetViolations(rooms: readonly Room[]): string[] {
  const out: string[] = []
  const wash = rooms.find((r) => r.type === 'wash')
  const touches = (a: Room, b: Room | undefined) => b !== undefined && sharedEdge(a, b) !== null
  for (const r of rooms) {
    if (r.type === 'bath' && !touches(r, wash)) out.push('浴室が洗面と辺を共有していない')
    if (r.type === 'laundry' && !touches(r, wash)) out.push('ランドリーが洗面と辺を共有していない')
  }
  const wets = rooms.filter((r) => r.type === 'bath' || r.type === 'wash' || r.type === 'laundry')
  if (wets.length > 0) {
    for (const wc of rooms) {
      if (wc.type === 'wc' && !wets.some((w) => sharedEdge(wc, w) !== null)) out.push('トイレが浴室・洗面・ランドリーのどれとも辺を共有していない')
    }
  }
  return out
}

/** ハード制約の検証: 全室への到達可能性 + 居室の外壁接触 + 最低面積 + 水回りの隣接。違反は棄却 */
export function validatePlan(plan: Plan): boolean {
  for (const fl of plan.floors) {
    const rooms = fl.rooms
    if (wetViolations(rooms).length > 0) return false
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
