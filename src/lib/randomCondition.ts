import { feasibility } from '../core/program'
import type { Rng } from '../core/rng'
import type { PlanConfig } from '../core/types'
import { ALL_FEATURE_KEYS } from './features'

const pick = (rng: Rng, n: number) => Math.floor(rng() * n)

/** おまかせ条件: feasibility().ok になるまでランダムに条件を選ぶ。maxTries 回で見つからなければ null */
export function randomConfig(rng: Rng, maxTries = 200): PlanConfig | null {
  for (let i = 0; i < maxTries; i++) {
    const cfg: PlanConfig = {
      area: 22 + pick(rng, 17), // 22..38
      floors: rng() < 0.7 ? 2 : 1,
      rooms: 2 + pick(rng, 4),
      parking: pick(rng, 3),
      garden: pick(rng, 3),
      feats: ALL_FEATURE_KEYS.filter(() => rng() < 0.3),
    }
    if (feasibility(cfg).ok) return cfg
  }
  return null
}
