import { GEN_VERSION } from '../core/generate'
import { isPlanKey, planKey } from '../core/enumerate'
import { ROOM } from '../core/rooms'
import { SCORE_WEIGHTS } from '../core/score'
import { ALL_FEATURE_KEYS } from './features'
import { isPartial, type PlanConfig, type PlanKey, type ScoredPlan } from '../core/types'

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
    Array.isArray(v.feats) && v.feats.every((f) => (ALL_FEATURE_KEYS as readonly unknown[]).includes(f)) &&
    (v.story === undefined || v.story === 'full' || v.story === 'partial')
  )
}

function isVariant(v: unknown): boolean {
  return (
    isObj(v) && (v.stairEnd === 'E' || v.stairEnd === 'W') && (v.bedShift === -1 || v.bedShift === 0 || v.bedShift === 1 || v.bedShift === 2) &&
    Array.isArray(v.rev) && v.rev.length === 4 && v.rev.every((b: unknown) => typeof b === 'boolean')
  )
}

/** fp が建物（W × H）に収まる正の矩形か */
function isFpInside(fp: unknown, W: number, H: number): boolean {
  return (
    isObj(fp) && isNum(fp.x) && isNum(fp.y) && isNum(fp.W) && isNum(fp.H) &&
    fp.x >= 0 && fp.y >= 0 && fp.W > 0 && fp.H > 0 && fp.x + fp.W <= W && fp.y + fp.H <= H
  )
}

/** 描画で落ちない程度に、案データの形を確かめる（variant は GEN_VERSION 1 の旧データでは無い） */
function isPlan(v: unknown): v is ScoredPlan {
  if (!isObj(v) || !isNum(v.W) || !isNum(v.H) || !isNum(v.totalArea) || !(v.arch === 0 || v.arch === 1 || v.arch === 2)) return false
  if (typeof v.sig !== 'string' || typeof v.sigM !== 'string') return false
  if (v.variant !== undefined && !isVariant(v.variant)) return false
  const sc = v.score
  if (!isObj(sc) || !isNum(sc.total) || !isObj(sc.parts)) return false
  const parts = sc.parts
  if (!Object.keys(SCORE_WEIGHTS).every((k) => isNum(parts[k]))) return false
  const { W, H } = v
  if (!Array.isArray(v.floors) || v.floors.length < 1 || v.floors.length > 2) return false
  return v.floors.every(
    (fl: unknown) =>
      isObj(fl) && typeof fl.label === 'string' && Array.isArray(fl.rooms) &&
      (fl.fp === undefined || isFpInside(fl.fp, W, H)) &&
      fl.rooms.every(
        (r: unknown) =>
          isObj(r) && typeof r.type === 'string' && Object.hasOwn(ROOM, r.type) && typeof r.name === 'string' &&
          isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h) && isNum(r.area) && isNum(r.target) && isNum(r.minArea),
      ) &&
      hasValidOwners(fl.rooms as Record<string, unknown>[]),
  )
}

/** 付属収納の持ち主: of が整数で、同じ階にその位置（左上）の部屋がちょうど1つあり、自分自身ではない */
function hasValidOwners(rooms: readonly Record<string, unknown>[]): boolean {
  return rooms.every((r) => {
    if (r.of === undefined) return true
    const o = r.of
    if (!isObj(o) || !Number.isInteger(o.dx) || !Number.isInteger(o.dy)) return false
    const ox = (r.x as number) + (o.dx as number)
    const oy = (r.y as number) + (o.dy as number)
    return rooms.filter((q) => q !== r && q.x === ox && q.y === oy).length === 1
  })
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
  return JSON.stringify([cfg.area, cfg.floors, cfg.rooms, cfg.parking, cfg.garden, [...cfg.feats].sort(), ...(isPartial(cfg) ? ['p'] : [])])
}

/**
 * 同じ案か。条件が同じで、planKey が同じか、配置（sig）が同一または左右反転の関係にあること。
 * enumeratePlans は反転の重複を除くため、generatePlans の案とは planKey（アーキタイプ）がずれることがある。
 */
function samePlan(a: ScoredPlan, b: ScoredPlan): boolean {
  return planKey(a) === planKey(b) || a.sig === b.sig || a.sig === b.sigM || a.sigM === b.sig
}

const isSame = (f: Favorite, cfg: PlanConfig, plan: ScoredPlan) => cfgId(f.cfg) === cfgId(cfg) && samePlan(f.plan, plan)

function dedupe(list: readonly Favorite[]): Favorite[] {
  const out: Favorite[] = []
  for (const f of list) {
    if (!out.some((o) => isSame(o, f.cfg, f.plan))) out.push(f)
  }
  return out
}

export function isFavorited(list: readonly Favorite[], cfg: PlanConfig, plan: ScoredPlan): boolean {
  return list.some((f) => isSame(f, cfg, plan))
}

export type AddResult = { ok: true; list: Favorite[] } | { ok: false; reason: 'full' }

/** 先頭に追加。同じ（条件, 案）は追加済みとして何もしない。上限なら追加せず full を返す（古いお気に入りを黙って消さない） */
export function addFavorite(list: readonly Favorite[], cfg: PlanConfig, plan: ScoredPlan, now: number = Date.now()): AddResult {
  if (isFavorited(list, cfg, plan)) return { ok: true, list: [...list] }
  if (list.length >= MAX_FAVORITES) return { ok: false, reason: 'full' }
  const entry: Favorite = { key: planKey(plan), cfg: { ...cfg, feats: [...cfg.feats] }, v: GEN_VERSION, plan, savedAt: now }
  return { ok: true, list: [entry, ...list] }
}

export function removeFavorite(list: readonly Favorite[], cfg: PlanConfig, plan: ScoredPlan): Favorite[] {
  return list.filter((f) => !isSame(f, cfg, plan))
}

export const isOldVersion = (f: Favorite): boolean => f.v !== GEN_VERSION
