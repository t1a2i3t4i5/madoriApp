import { GEN_VERSION } from '../core/generate'
import type { FeatureKey, PlanConfig } from '../core/types'

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

export interface AppState extends PlanConfig {
  seed: number
}

export const DEFAULT_STATE: AppState = {
  area: 30, floors: 2, rooms: 3, parking: 2, garden: 1, feats: ['kitchenFace', 'wic'], seed: 20261121,
}

/** 入力 + seed + genVersion を URL ハッシュへ保存する形式 */
export function encodeHash(s: AppState): string {
  const o = { area: s.area, floors: s.floors, rooms: s.rooms, parking: s.parking, garden: s.garden, feats: s.feats, seed: s.seed, v: GEN_VERSION }
  return '#c=' + encodeURIComponent(JSON.stringify(o))
}

export interface ParsedHash {
  state: AppState
  /** ハッシュが現在と異なる genVersion（または未記載）で作られており、同じ間取りは再現されない */
  versionMismatch: boolean
}

/** seed として使える値か。seed+1（「別の3案」）でも値が変わり続けるよう、seed+1 も安全整数であることを要求する */
export function isValidSeed(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && Number.isSafeInteger(v + 1)
}

export function decodeHash(hash: string): AppState {
  return parseHash(hash).state
}

export function parseHash(hash: string): ParsedHash {
  const out: AppState = { ...DEFAULT_STATE, feats: [...DEFAULT_STATE.feats] }
  let versionMismatch = false
  try {
    const raw = hash.match(/c=([^&]+)/)?.[1]
    if (raw === undefined) return { state: out, versionMismatch }
    const o = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>
    versionMismatch = o.v !== GEN_VERSION
    if (typeof o.area === 'number') out.area = Math.min(40, Math.max(20, Math.round(o.area)))
    if (o.floors === 1 || o.floors === 2) out.floors = o.floors
    if (typeof o.rooms === 'number') out.rooms = Math.min(5, Math.max(2, Math.round(o.rooms)))
    if (typeof o.parking === 'number') out.parking = Math.min(2, Math.max(0, Math.round(o.parking)))
    if (typeof o.garden === 'number') out.garden = Math.min(2, Math.max(0, Math.round(o.garden)))
    if (isValidSeed(o.seed)) out.seed = o.seed
    if (Array.isArray(o.feats)) out.feats = FEATURES.map((f) => f.key).filter((k) => (o.feats as unknown[]).includes(k))
  } catch {
    /* 壊れたハッシュは既定値にフォールバック */
  }
  return { state: out, versionMismatch }
}
