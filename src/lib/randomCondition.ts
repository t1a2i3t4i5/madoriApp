import { generatePlans } from '../core/generate'
import { feasibility } from '../core/program'
import type { Rng } from '../core/rng'
import type { PlanConfig } from '../core/types'
import { ALL_FEATURE_KEYS } from './features'

const pick = (rng: Rng, n: number) => Math.floor(rng() * n)

/**
 * おまかせ条件: 実現可能で、かつ指定 seed で実際に3案が出る条件になるまでランダムに選ぶ。maxTries 回で見つからなければ null。
 * feasibility().ok だけでは0案・3案未満になる条件が約15%混ざるため、生成まで確かめる。
 * seed は呼び出し側がその条件で使う seed（既定 1）。
 */
export function randomConfig(rng: Rng, maxTries = 200, seed = 1): PlanConfig | null {
  for (let i = 0; i < maxTries; i++) {
    const cfg: PlanConfig = {
      area: 22 + pick(rng, 17), // 22..38
      floors: rng() < 0.7 ? 2 : 1,
      rooms: 2 + pick(rng, 4),
      parking: pick(rng, 3),
      garden: pick(rng, 3),
      feats: ALL_FEATURE_KEYS.filter(() => rng() < 0.3),
    }
    if (feasibility(cfg).ok && generatePlans(cfg, seed).length === 3) return cfg
  }
  return null
}
