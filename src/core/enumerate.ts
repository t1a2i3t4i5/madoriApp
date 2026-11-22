import type { ArchId, PlanConfig, PlanKey, Plan, ScoredPlan, Variant } from './types'
import { buildPlan } from './archetypes'
import { footprintList } from './slicing'
import { validatePlan } from './validate'
import { FOOTPRINT_LIMIT, candidatePool, scored } from './generate'
import { planDistance } from './diversity'

/** 変種の key 部分: stairEnd + rev4桁(0/1) + shift(m=-1 / 0 / 1 / 2) */
function variantSuffix(v: Variant): string {
  return v.stairEnd + v.rev.map((r) => (r ? '1' : '0')).join('') + (v.bedShift === -1 ? 'm' : String(v.bedShift))
}

/** 案の key。variant なし（GEN_VERSION 1 の案）は従来の "a-WxH"、v2 は "a-WxH-" + 変種 */
export function planKey(plan: Pick<Plan, 'arch' | 'W' | 'H' | 'variant'>): PlanKey {
  const base = `${plan.arch}-${plan.W}x${plan.H}` as const
  return plan.variant ? `${base}-${variantSuffix(plan.variant)}` : base
}

const KEY_RE = /^([0-2])-(\d{1,2})x(\d{1,2})(?:-([EW])([01]{4})([m012]))?$/

/** 文字列が planKey の形式か（形式のみ。実在する案かは planFromKey で確かめる） */
export function parsePlanKey(s: unknown): { arch: ArchId; W: number; H: number; variant?: Variant } | null {
  if (typeof s !== 'string') return null
  const m = KEY_RE.exec(s)
  if (!m) return null
  const arch = Number(m[1]) as ArchId
  const W = Number(m[2])
  const H = Number(m[3])
  if (W < 1 || H < 1) return null
  const [, , , , se, bits, sh] = m
  if (se === undefined || bits === undefined || sh === undefined) return { arch, W, H }
  const rev: Variant['rev'] = [bits[0] === '1', bits[1] === '1', bits[2] === '1', bits[3] === '1']
  const bedShift = (sh === 'm' ? -1 : Number(sh)) as Variant['bedShift']
  return { arch, W, H, variant: { stairEnd: se as Variant['stairEnd'], rev, bedShift } }
}

export function isPlanKey(s: unknown): s is PlanKey {
  return parsePlanKey(s) !== null
}

/** 全候補（候補プールのコピー）。左右反転の重複を除き、スコア降順。generatePlans の3案は必ず含まれる */
export function enumeratePlans(cfg: PlanConfig): ScoredPlan[] {
  return candidatePool(cfg).slice()
}

/** ギャラリーの表示上限 */
export const GALLERY_LIMIT = 24

/**
 * ギャラリー用: 多様性を優先した貪欲選択（最良案から始め、選択済みとの最小距離が最大の案を足していく）。
 * 結果はスコア降順（同点はプール順）で返す。
 */
export function galleryPlans(cfg: PlanConfig, limit = GALLERY_LIMIT): ScoredPlan[] {
  const pool = candidatePool(cfg)
  if (pool.length <= limit) return pool.slice()
  const minDist = pool.map(() => Infinity)
  const chosen: number[] = []
  const taken = new Set<number>()
  let next = 0
  while (chosen.length < limit) {
    chosen.push(next)
    taken.add(next)
    const added = pool[next]
    if (!added) break
    let bestI = -1
    let bestD = -1
    for (const [i, p] of pool.entries()) {
      if (taken.has(i)) continue
      minDist[i] = Math.min(minDist[i] ?? Infinity, planDistance(added, p))
      const d = minDist[i] ?? 0
      if (d > bestD) {
        bestD = d
        bestI = i
      }
    }
    if (bestI < 0) break
    next = bestI
  }
  return chosen.sort((a, b) => a - b).flatMap((i) => (pool[i] ? [pool[i]] : []))
}

/**
 * planKey から案を再構築する（URL共有・お気に入り用）。
 * 形式不正・変種なしの key（GEN_VERSION 1 の key）・外形が上位10件以外・生成不能・検証不通過は null
 */
export function planFromKey(cfg: PlanConfig, key: unknown): ScoredPlan | null {
  const k = parsePlanKey(key)
  if (!k || !k.variant) return null
  if (cfg.floors === 1 && k.arch === 2) return null
  if (!footprintList((cfg.area * 16) / cfg.floors, FOOTPRINT_LIMIT).some((f) => f.W === k.W && f.H === k.H)) return null
  const plan = buildPlan(cfg, k.arch, { W: k.W, H: k.H }, k.variant)
  if (!plan || !validatePlan(plan)) return null
  return scored(plan)
}
