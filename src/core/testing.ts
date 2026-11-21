import type { FeatureKey, PlanConfig } from './types'

/** テスト用の入力条件セット（generate / golden / invariants で共有） */
const base = { parking: 2, garden: 1 }

export const CONDITIONS: { name: string; cfg: PlanConfig }[] = [
  { name: '30坪/2階/個室3', cfg: { ...base, area: 30, floors: 2, rooms: 3, feats: ['kitchenFace', 'wic'] } },
  { name: '30坪/平屋/個室3', cfg: { ...base, area: 30, floors: 1, rooms: 3, feats: ['kitchenFace', 'wic'] } },
  { name: '35坪/2階/個室4', cfg: { ...base, area: 35, floors: 2, rooms: 4, feats: ['kitchenFace', 'wic'] } },
  { name: '平屋/個室2/最小こだわりなし', cfg: { ...base, area: 24, floors: 1, rooms: 2, feats: [] } },
  { name: '32坪/2階/吹抜', cfg: { ...base, area: 32, floors: 2, rooms: 3, feats: ['void'] } },
  { name: '36坪/2階/吹抜+WIC+書斎', cfg: { ...base, area: 36, floors: 2, rooms: 3, feats: ['void', 'wic', 'study', 'kitchenFace'] } },
  { name: '33坪/2階/土間+パントリー', cfg: { ...base, area: 33, floors: 2, rooms: 3, feats: ['doma', 'pantry'] } },
  { name: '30坪/平屋/土間+和室', cfg: { ...base, area: 30, floors: 1, rooms: 3, feats: ['doma', 'washitsu'] } },
  { name: '38坪/2階/全部のせ', cfg: { ...base, area: 38, floors: 2, rooms: 3, feats: ['kitchenFace', 'doma', 'study', 'wic', 'pantry', 'void', 'washitsu', 'laundry'] } },
  { name: '34坪/平屋/ランドリー+書斎', cfg: { ...base, area: 34, floors: 1, rooms: 4, feats: ['laundry', 'study', 'kitchenFace'] } },
]

/** 実現可能性が不可になる条件 */
export const INFEASIBLE: { name: string; cfg: PlanConfig }[] = [
  { name: '20坪/個室5', cfg: { ...base, area: 20, floors: 2, rooms: 5, feats: [] } },
  { name: '平屋+吹抜', cfg: { ...base, area: 30, floors: 1, rooms: 3, feats: ['void'] } },
  { name: '22坪/和室+書斎+個室4', cfg: { ...base, area: 22, floors: 1, rooms: 4, feats: ['washitsu', 'study'] } },
]

/** 実現可能と判定されるのに、検証を通る案が0になる条件（fallbackAlts の経路） */
export const ZERO_PLAN: PlanConfig = { ...base, area: 26, floors: 2, rooms: 2, feats: ['doma'] }

/** 0案・2案しか出ない境界条件（legacy と同じ結果になること自体を確認する用） */
export const BOUNDARY: { name: string; cfg: PlanConfig }[] = [
  { name: '境界: 36坪/2階/吹抜+個室4+WIC+書斎（0案）', cfg: { ...base, area: 36, floors: 2, rooms: 4, feats: ['void', 'wic', 'study', 'kitchenFace'] } },
  { name: '境界: 36坪/2階/吹抜+個室4+WIC（2案）', cfg: { ...base, area: 36, floors: 2, rooms: 4, feats: ['void', 'wic', 'kitchenFace'] } },
  { name: '境界: 26坪/2階/個室2/土間（0案）', cfg: ZERO_PLAN },
]

export const SEEDS = [1, 2, 3, 20261121, 99999]

export const ALL_FEATURES: FeatureKey[] = ['kitchenFace', 'doma', 'study', 'wic', 'pantry', 'void', 'washitsu', 'laundry']
