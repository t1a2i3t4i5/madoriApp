import { GEN_VERSION } from '../core/generate'
import { isPlanKey, planKey } from '../core/enumerate'
import { ROOM } from '../core/rooms'
import { SCORE_WEIGHTS } from '../core/score'
import { ALL_FEATURE_KEYS } from './features'
import type { PlanConfig, PlanKey, ScoredPlan } from '../core/types'

export interface Favorite {
  key: PlanKey
  cfg: PlanConfig
  /** 保存時の GEN_VERSION */
  v: number
  plan: ScoredPlan
  savedAt: number
}

export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const FAVORITES_STORAGE_KEY = 'madori.favorites'
export const MAX_FAVORITES = 30

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function isCfg(v: unknown): v is PlanConfig {
  return (
    isObj(v) && isNum(v.area) && (v.floors === 1 || v.floors === 2) && isNum(v.rooms) && isNum(v.parking) && isNum(v.garden) &&
    Array.isArray(v.feats) && v.feats.every((f) => (ALL_FEATURE_KEYS as readonly unknown[]).includes(f))
  )
}

/** 描画で落ちない程度に、案データの形を確かめる */
function isPlan(v: unknown): v is ScoredPlan {
  if (!isObj(v) || !isNum(v.W) || !isNum(v.H) || !isNum(v.totalArea) || !(v.arch === 0 || v.arch === 1 || v.arch === 2)) return false
  if (typeof v.sig !== 'string' || typeof v.sigM !== 'string') return false
  const sc = v.score
  if (!isObj(sc) || !isNum(sc.total) || !isObj(sc.parts)) return false
  const parts = sc.parts
  if (!Object.keys(SCORE_WEIGHTS).every((k) => isNum(parts[k]))) return false
  if (!Array.isArray(v.floors) || v.floors.length < 1 || v.floors.length > 2) return false
  return v.floors.every(
    (fl: unknown) =>
      isObj(fl) && typeof fl.label === 'string' && Array.isArray(fl.rooms) &&
      fl.rooms.every(
        (r: unknown) =>
          isObj(r) && typeof r.type === 'string' && r.type in ROOM && typeof r.name === 'string' &&
          isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h) && isNum(r.area) && isNum(r.target) && isNum(r.minArea),
      ),
  )
}

function isFavorite(v: unknown): v is Favorite {
  return isObj(v) && isPlanKey(v.key) && isCfg(v.cfg) && isNum(v.v) && isNum(v.savedAt) && isPlan(v.plan) && planKey(v.plan) === v.key
}

/** 保存データを読む。壊れた全体は空、壊れた要素は捨てる。ストレージ例外も空扱い */
export function loadFavorites(storage: KeyValueStorage): Favorite[] {
  try {
    const raw = storage.getItem(FAVORITES_STORAGE_KEY)
    if (raw === null) return []
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) return []
    return dedupe(data.filter(isFavorite)).slice(0, MAX_FAVORITES)
  } catch {
    return []
  }
}

/** 保存。失敗（容量超過・プライベートモードなど）は false */
export function saveFavorites(storage: KeyValueStorage, list: readonly Favorite[]): boolean {
  try {
    storage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list))
    return true
  } catch {
    return false
  }
}

/** 条件の同一判定用。こだわりの並びは無視する */
export function cfgId(cfg: PlanConfig): string {
  return JSON.stringify([cfg.area, cfg.floors, cfg.rooms, cfg.parking, cfg.garden, [...cfg.feats].sort()])
}

const favId = (f: Pick<Favorite, 'key' | 'cfg'>) => `${cfgId(f.cfg)}#${f.key}`

function dedupe(list: readonly Favorite[]): Favorite[] {
  const seen = new Set<string>()
  const out: Favorite[] = []
  for (const f of list) {
    const id = favId(f)
    if (seen.has(id)) continue
    seen.add(id)
    out.push(f)
  }
  return out
}

export function isFavorited(list: readonly Favorite[], cfg: PlanConfig, key: PlanKey): boolean {
  const id = favId({ cfg, key })
  return list.some((f) => favId(f) === id)
}

export type AddResult = { ok: true; list: Favorite[] } | { ok: false; reason: 'full' }

/** 先頭に追加。同じ（条件, key）は追加済みとして何もしない。上限なら追加せず full を返す（古いお気に入りを黙って消さない） */
export function addFavorite(list: readonly Favorite[], cfg: PlanConfig, plan: ScoredPlan, now: number = Date.now()): AddResult {
  const key = planKey(plan)
  if (isFavorited(list, cfg, key)) return { ok: true, list: [...list] }
  if (list.length >= MAX_FAVORITES) return { ok: false, reason: 'full' }
  const entry: Favorite = { key, cfg: { ...cfg, feats: [...cfg.feats] }, v: GEN_VERSION, plan, savedAt: now }
  return { ok: true, list: [entry, ...list] }
}

export function removeFavorite(list: readonly Favorite[], cfg: PlanConfig, key: PlanKey): Favorite[] {
  const id = favId({ cfg, key })
  return list.filter((f) => favId(f) !== id)
}

export const isOldVersion = (f: Favorite): boolean => f.v !== GEN_VERSION
