import type { Plan } from '../core/types'

export interface PlanMetrics {
  /** LDK の畳数（1畳=8セル²）。LDK がなければ null */
  ldkTatami: number | null
  /** 個室（主寝室＋洋室）の平均畳数 */
  roomAvgTatami: number | null
  /** 廊下（ホール）面積 ÷ 延床 */
  hallRatio: number
}

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
  }
}
