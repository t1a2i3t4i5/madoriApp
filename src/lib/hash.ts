import { GEN_VERSION } from '../core/generate'
import { isPlanKey } from '../core/enumerate'
import type { PlanConfig, PlanKey } from '../core/types'
import { FEATURES } from './features'

export { FEATURES } from './features'

export interface AppState extends PlanConfig {
  seed: number
}

export const DEFAULT_STATE: AppState = {
  area: 30, floors: 2, rooms: 3, parking: 2, garden: 1, feats: ['kitchenFace', 'wic'], seed: 20261121,
}

export function toConfig(s: PlanConfig): PlanConfig {
  return { area: s.area, floors: s.floors, rooms: s.rooms, parking: s.parking, garden: s.garden, feats: s.feats }
}

/** 入力 + seed + genVersion を URL ハッシュへ保存する形式。p（planKey）があれば、その案の拡大表示が開いた状態で開く */
export function encodeHash(s: AppState, p?: PlanKey): string {
  const o = { area: s.area, floors: s.floors, rooms: s.rooms, parking: s.parking, garden: s.garden, feats: s.feats, seed: s.seed, v: GEN_VERSION }
  return '#c=' + encodeURIComponent(JSON.stringify(o)) + (p ? '&p=' + encodeURIComponent(p) : '')
}

export interface ParsedHash {
  state: AppState
  /** ハッシュが現在と異なる genVersion（または未記載）で作られており、同じ間取りは再現されない */
  versionMismatch: boolean
  /** 開く案の planKey。不正な形式は無視（undefined） */
  planKey?: PlanKey
}

/** seed として使える値か。seed+1（「別の3案」）でも値が変わり続けるよう、seed+1 も安全整数であることを要求する */
export function isValidSeed(v: unknown): v is number {
  return typeof v === 'number' && Number.isSafeInteger(v) && Number.isSafeInteger(v + 1)
}

export function decodeHash(hash: string): AppState {
  return parseHash(hash).state
}

function parsePlanKeyParam(hash: string): PlanKey | undefined {
  const raw = hash.match(/[#&]p=([^&]+)/)?.[1]
  if (raw === undefined) return undefined
  try {
    const v = decodeURIComponent(raw)
    return isPlanKey(v) ? v : undefined
  } catch {
    return undefined
  }
}

export function parseHash(hash: string): ParsedHash {
  const planKey = parsePlanKeyParam(hash)
  const out: AppState = { ...DEFAULT_STATE, feats: [...DEFAULT_STATE.feats] }
  let versionMismatch = false
  try {
    const raw = hash.match(/c=([^&]+)/)?.[1]
    if (raw === undefined) return { state: out, versionMismatch, planKey }
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
  return { state: out, versionMismatch, planKey }
}
