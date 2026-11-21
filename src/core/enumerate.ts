import type { ArchId, PlanConfig, PlanKey, Plan, ScoredPlan } from './types'
import { buildPlan } from './archetypes'
import { footprintList } from './slicing'
import { validatePlan } from './validate'
import { scorePlan } from './score'
import { planSignature } from './diversity'

export function planKey(plan: Pick<Plan, 'arch' | 'W' | 'H'>): PlanKey {
  return `${plan.arch}-${plan.W}x${plan.H}`
}

const KEY_RE = /^([0-2])-(\d{1,2})x(\d{1,2})$/

/** 文字列が planKey の形式か（形式のみ。実在する案かは planFromKey で確かめる） */
export function parsePlanKey(s: unknown): { arch: ArchId; W: number; H: number } | null {
  if (typeof s !== 'string') return null
  const m = KEY_RE.exec(s)
  if (!m) return null
  const arch = Number(m[1]) as ArchId
  const W = Number(m[2])
  const H = Number(m[3])
  if (W < 1 || H < 1) return null
  return { arch, W, H }
}

export function isPlanKey(s: unknown): s is PlanKey {
  return parsePlanKey(s) !== null
}

function scored(plan: Plan): ScoredPlan {
  return { ...plan, score: scorePlan(plan), sig: planSignature(plan, false), sigM: planSignature(plan, true) }
}

/** 全候補の上限（アーキタイプ3 × 外形6） */
export const MAX_ENUMERATED = 18

/**
 * 全アーキタイプ × 上位6外形を、シャッフルなしで buildPlan → validatePlan → scorePlan して返す。
 * 左右反転だけの重複（sig / sigM 一致）を除き、スコア降順。generatePlans の3案は必ず含まれる。
 */
export function enumeratePlans(cfg: PlanConfig): ScoredPlan[] {
  const targetPerFloor = (cfg.area * 16) / cfg.floors
  const archs: ArchId[] = cfg.floors === 1 ? [0, 1] : [0, 1, 2]
  const uniq: ScoredPlan[] = []
  for (const arch of archs) {
    for (const fp of footprintList(targetPerFloor)) {
      const plan = buildPlan(cfg, arch, fp)
      if (!plan || !validatePlan(plan)) continue
      const sp = scored(plan)
      if (uniq.some((u) => u.sig === sp.sig || u.sigM === sp.sig)) continue
      uniq.push(sp)
    }
  }
  // Array#sort は安定。同点は列挙順（アーキタイプ→外形の近さ）を保つ
  return uniq.sort((a, b) => b.score.total - a.score.total)
}

/** planKey から案を再構築する（URL共有・お気に入り用）。形式不正・列挙対象外（上位6外形以外）・生成不能・検証不通過は null */
export function planFromKey(cfg: PlanConfig, key: unknown): ScoredPlan | null {
  const k = parsePlanKey(key)
  if (!k) return null
  if (cfg.floors === 1 && k.arch === 2) return null
  if (!footprintList((cfg.area * 16) / cfg.floors).some((f) => f.W === k.W && f.H === k.H)) return null
  const plan = buildPlan(cfg, k.arch, { W: k.W, H: k.H })
  if (!plan || !validatePlan(plan)) return null
  return scored(plan)
}
