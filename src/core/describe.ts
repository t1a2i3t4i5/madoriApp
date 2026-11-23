import type { FeatureKey, Plan, PlanConfig } from './types'
import { ARCH_INFO } from './archetypes'

const NAME_PREFIX: [FeatureKey, string][] = [
  ['doma', '土間広めの'], ['void', '吹抜リビングの'], ['washitsu', '和室のある'],
  ['study', '書斎のある'], ['laundry', 'ランドリー完備の'], ['kitchenFace', '対面キッチンの'],
  ['wic', 'WIC付き主寝室の'], ['pantry', 'パントリーのある'],
]

export function planName(cfg: PlanConfig, plan: Plan): string {
  let pre = ''
  for (const [k, text] of NAME_PREFIX) {
    if (cfg.feats.includes(k)) { pre = text; break }
  }
  if (!pre) pre = cfg.floors === 1 ? 'ワンフロアで暮らす' : '上下で分ける'
  return pre + ARCH_INFO[plan.arch].suffix
}

export function planTags(cfg: PlanConfig, plan: Plan): string[] {
  const tags: string[] = []
  // LDK は1F にある前提なので、南判定は1Fの板（plan.H）のままでよい（部分二階でも 1F は plan.W × plan.H）
  const ldk = plan.floors[0]?.rooms.find((r) => r.type === 'ldk')
  if (plan.floors[1]?.fp) tags.push('部分二階')
  if (ldk && ldk.y + ldk.h === plan.H) tags.push('南LDK')
  if (cfg.feats.includes('kitchenFace')) tags.push('対面キッチン')
  if (cfg.feats.includes('doma')) tags.push('土間あり')
  if (cfg.feats.includes('void')) tags.push('吹抜あり')
  const hallArea = plan.floors.reduce(
    (s, fl) => s + fl.rooms.filter((r) => r.type === 'hall').reduce((a, r) => a + r.area, 0), 0)
  if (hallArea / plan.totalArea < 0.07) tags.push('廊下短め')
  const [descHead] = ARCH_INFO[plan.arch].desc.split('、')
  if (descHead) tags.push(descHead)
  return tags.slice(0, 4)
}
