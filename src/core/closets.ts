import type { Plan, Room } from './types'
import { ROOM, minShort } from './rooms'
import { sharedEdge } from './derive'

/** クローゼットの対象になる個室（主寝室・洋室。書斎・和室は対象外: R-VERIFY-13） */
export const isPrivateRoom = (r: Room): boolean => r.type === 'master' || r.type === 'bed'

/** 2×4 セル以上か（R-VERIFY-13 の収納の大きさ） */
const bigEnough = (r: Room): boolean => Math.min(r.w, r.h) >= 2 && Math.max(r.w, r.h) >= 4

/** s の持ち主（Room.of が指す位置の部屋）が p か */
export function isOwnedBy(s: Room, p: Room): boolean {
  return !!s.of && s.x + s.of.dx === p.x && s.y + s.of.dy === p.y
}

/**
 * 個室 p にドアでつながる、2×4 以上の収納（その階の rooms から探す）。
 * 持ち主が p のクローゼット・収納（折れ戸でつながる）、または主寝室の WIC（master–wic のドア）。なければ undefined
 */
export function storageOf(rooms: readonly Room[], p: Room): Room | undefined {
  return rooms.find((s) => {
    if (s === p || !bigEnough(s) || sharedEdge(s, p) === null) return false
    if (s.type === 'closet' || s.type === 'store') return isOwnedBy(s, p)
    return s.type === 'wic' && p.type === 'master'
  })
}

/** 全階の個室のうち storageOf のある個室の数と、個室の数 */
export function privateStorageCount(plan: Plan): { with: number; total: number } {
  let w = 0
  let total = 0
  for (const fl of plan.floors) {
    for (const p of fl.rooms) {
      if (!isPrivateRoom(p)) continue
      total++
      if (storageOf(fl.rooms, p)) w++
    }
  }
  return { with: w, total }
}

/**
 * 収納率（R-IDX-02）: cat が store の部屋（クローゼット・WIC・パントリー・収納）のうち、最小の短辺を満たすものの面積 ÷ 延床。
 * 短辺の閾値がない種別（収納）は全数を数える
 */
export function storageRatio(plan: Plan): number {
  let sum = 0
  for (const fl of plan.floors) {
    for (const r of fl.rooms) {
      if (ROOM[r.type].cat === 'store' && Math.min(r.w, r.h) >= minShort(r.type)) sum += r.area
    }
  }
  return plan.totalArea > 0 ? sum / plan.totalArea : 0
}
