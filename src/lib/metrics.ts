import type { Plan, Room } from '../core/types'
import { isPrivateRoom, privateStorageCount, storageOf, storageRatio } from '../core/closets'

export interface PlanMetrics {
  /** LDK の畳数（1畳=8セル²）。LDK がなければ null */
  ldkTatami: number | null
  /** 個室（主寝室＋洋室）の平均畳数 */
  roomAvgTatami: number | null
  /** 廊下（ホール）面積 ÷ 延床 */
  hallRatio: number
  /** 収納率（R-IDX-02。cat store のうち最小の短辺を満たすものの面積 ÷ 延床） */
  storageRatio: number
}

/** 個室 p に付属する収納の印（＋CL／＋WIC／＋収納）。core の storageOf と同じ定義で、なければ空文字 */
export function storageMark(rooms: readonly Room[], p: Room): string {
  if (!isPrivateRoom(p)) return ''
  const s = storageOf(rooms, p)
  if (!s) return ''
  return s.type === 'closet' ? '＋CL' : s.type === 'wic' ? '＋WIC' : '＋収納'
}

/** 付属収納のある個室数と個室数（core の privateStorageCount と同じ定義） */
export const storageCount = privateStorageCount

const TATAMI = 8

/** お気に入り比較表用の指標 */
export function planMetrics(plan: Plan): PlanMetrics {
  const all = plan.floors.flatMap((f) => f.rooms)
  const ldk = all.find((r) => r.type === 'ldk')
  const beds = all.filter((r) => r.type === 'master' || r.type === 'bed')
  const hall = all.filter((r) => r.type === 'hall').reduce((s, r) => s + r.area, 0)
  return {
    ldkTatami: ldk ? ldk.area / TATAMI : null,
    roomAvgTatami: beds.length ? beds.reduce((s, r) => s + r.area, 0) / beds.length / TATAMI : null,
    hallRatio: plan.totalArea ? hall / plan.totalArea : 0,
    storageRatio: storageRatio(plan),
  }
}
