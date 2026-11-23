import { GEN_VERSION } from '../core/generate'
import { isPlanKey } from '../core/enumerate'
import { isPartial, type PlanConfig, type PlanKey } from '../core/types'
import { FEATURES } from './features'

export { FEATURES } from './features'

export interface AppState extends PlanConfig {
  seed: number
}

export const DEFAULT_STATE: AppState = {
  area: 30, floors: 2, rooms: 3, parking: 2, garden: 1, feats: ['kitchenFace', 'wic'], seed: 20261121,
}

export function toConfig(s: PlanConfig): PlanConfig {
  const cfg: PlanConfig = { area: s.area, floors: s.floors, rooms: s.rooms, parking: s.parking, garden: s.garden, feats: s.feats }
  // 総二階（既定）では story を付けない。平屋では無視される値なので付けない
  if (isPartial(s)) cfg.story = 'partial'
  return cfg
}

/** 入力 + seed + genVersion を URL ハッシュへ保存する形式。p（planKey）があれば、その案の拡大表示が開いた状態で開く */
export function encodeHash(s: AppState, p?: PlanKey): string {
  // story は部分二階かつ2階建てのときだけ書く（総二階・平屋の文字列は従来と同一）
  const o = {
    area: s.area, floors: s.floors, rooms: s.rooms, parking: s.parking, garden: s.garden, feats: s.feats,
    ...(isPartial(s) ? { story: 'partial' } : {}), seed: s.seed, v: GEN_VERSION,
  }
  return '#c=' + encodeURIComponent(JSON.stringify(o)) + (p ? '&p=' + encodeURIComponent(p) : '')
}

export interface ParsedHash {
  state: AppState
  /** ハッシュが現在と異なる genVersion（または未記載）で作られており、同じ間取りは再現されない */
  versionMismatch: boolean
  /** 開く案の planKey。不正な形式、および versionMismatch のときは undefined */
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
  const out: AppState = { ...DEFAULT_STATE, feats: [...DEFAULT_STATE.feats] }
  let versionMismatch = false
  try {
    const raw = hash.match(/c=([^&]+)/)?.[1]
    // c が無い・壊れている場合は既定条件になる。その条件で p の案を開くと意図しない案になるので p も捨てる
    if (raw === undefined) return { state: out, versionMismatch }
    const parsed: unknown = JSON.parse(decodeURIComponent(raw))
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('c がオブジェクトではない')
    const o = parsed as Record<string, unknown>
    versionMismatch = o.v !== GEN_VERSION
    if (typeof o.area === 'number') out.area = Math.min(40, Math.max(20, Math.round(o.area)))
    if (o.floors === 1 || o.floors === 2) out.floors = o.floors
    if (typeof o.rooms === 'number') out.rooms = Math.min(5, Math.max(2, Math.round(o.rooms)))
    if (typeof o.parking === 'number') out.parking = Math.min(2, Math.max(0, Math.round(o.parking)))
    if (typeof o.garden === 'number') out.garden = Math.min(2, Math.max(0, Math.round(o.garden)))
    if (o.story === 'partial') out.story = 'partial'
    if (isValidSeed(o.seed)) out.seed = o.seed
    if (Array.isArray(o.feats)) out.feats = FEATURES.map((f) => f.key).filter((k) => (o.feats as unknown[]).includes(k))
  } catch {
    /* 壊れたハッシュは既定値にフォールバック（p も捨てる） */
    return { state: { ...DEFAULT_STATE, feats: [...DEFAULT_STATE.feats] }, versionMismatch: false }
  }
  // 旧バージョンのリンクの p は、いまのロジックでは別の案を指しうるので捨てる
  return { state: out, versionMismatch, planKey: versionMismatch ? undefined : parsePlanKeyParam(hash) }
}
