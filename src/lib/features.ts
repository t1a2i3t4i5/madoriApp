import type { FeatureKey } from '../core/types'

export const FEATURES: { key: FeatureKey; label: string }[] = [
  { key: 'kitchenFace', label: '対面キッチン' },
  { key: 'doma', label: '土間' },
  { key: 'study', label: '書斎' },
  { key: 'wic', label: 'ウォークインクローゼット' },
  { key: 'pantry', label: 'パントリー' },
  { key: 'void', label: '吹き抜け' },
  { key: 'washitsu', label: '和室' },
  { key: 'laundry', label: 'ランドリー室' },
]

export const ALL_FEATURE_KEYS: FeatureKey[] = FEATURES.map((f) => f.key)
