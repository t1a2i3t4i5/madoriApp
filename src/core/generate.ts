import type { ArchId, PlanConfig, ScoredPlan } from './types'
import { mulberry32 } from './rng'
import { buildPlan } from './archetypes'
import { footprintCandidates } from './slicing'
import { validatePlan } from './validate'
import { scorePlan } from './score'
import { planSignature, pickDiverse } from './diversity'

/** パイプライン: 候補を大量生成 → 派生 → ハード制約で検証・棄却 → スコア → 多様性選抜で最大3案 */
export function generatePlans(cfg: PlanConfig, seed: number): ScoredPlan[] {
  const targetPerFloor = (cfg.area * 16) / cfg.floors
  const candidates: ScoredPlan[] = []
  const archs: ArchId[] = cfg.floors === 1 ? [0, 1] : [0, 1, 2]
  for (const arch of archs) {
    for (let k = 0; k < 10; k++) {
      const rng = mulberry32(seed * 7919 + arch * 104729 + k * 1299709)
      for (const fp of footprintCandidates(targetPerFloor, rng)) {
        const plan = buildPlan(cfg, arch, fp)
        if (plan && validatePlan(plan)) {
          candidates.push({
            ...plan,
            score: scorePlan(plan),
            sig: planSignature(plan, false),
            sigM: planSignature(plan, true),
          })
          break
        }
      }
    }
  }
  return pickDiverse(candidates, 3)
}

/** 生成ロジックのバージョン。アルゴリズムを変えたら上げる（URLハッシュに保存） */
export const GEN_VERSION = 1
