import { isPartial } from './types'
import type { ArchId, FloorRect, PlanConfig, PlanKey, Plan, ScoredPlan, Variant } from './types'
import { buildPlan } from './archetypes'
import { footprintList, footprintPairs } from './slicing'
import { validatePlan } from './validate'
import { FOOTPRINT_LIMIT, candidatePool, scored } from './generate'
import { planDistance } from './diversity'

/** 変種の key 部分: stairEnd + rev4桁(0/1) + shift(m=-1 / 0 / 1 / 2) */
function variantSuffix(v: Variant): string {
  return v.stairEnd + v.rev.map((r) => (r ? '1' : '0')).join('') + (v.bedShift === -1 ? 'm' : String(v.bedShift))
}

/**
 * 案の key。variant なし（GEN_VERSION 1 の案）は従来の "a-WxH"、v2 は "a-WxH-" + 変種。
 * 部分二階（2F に fp がある案）は末尾に "-p<W2>x<H2>"（2Fの板の寸法。オフセットは配置ルールから復元できるので入れない）
 */
export function planKey(plan: Pick<Plan, 'arch' | 'W' | 'H' | 'variant'> & { floors?: readonly { fp?: FloorRect }[] }): PlanKey {
  const base = `${plan.arch}-${plan.W}x${plan.H}` as const
  if (!plan.variant) return base
  const fp2 = plan.floors?.[1]?.fp
  const v = `${base}-${variantSuffix(plan.variant)}` as const
  return fp2 ? `${v}-p${fp2.W}x${fp2.H}` : v
}

const KEY_RE = /^([0-2])-(\d{1,2})x(\d{1,2})(?:-([EW])([01]{4})([m012])(?:-p(\d{1,2})x(\d{1,2}))?)?$/

/** 文字列が planKey の形式か（形式のみ。実在する案かは planFromKey で確かめる） */
export function parsePlanKey(s: unknown): { arch: ArchId; W: number; H: number; variant?: Variant; fp2?: { W2: number; H2: number } } | null {
  if (typeof s !== 'string') return null
  const m = KEY_RE.exec(s)
  if (!m) return null
  const arch = Number(m[1]) as ArchId
  const W = Number(m[2])
  const H = Number(m[3])
  if (W < 1 || H < 1) return null
  const [, , , , se, bits, sh, w2, h2] = m
  if (se === undefined || bits === undefined || sh === undefined) return { arch, W, H }
  const rev: Variant['rev'] = [bits[0] === '1', bits[1] === '1', bits[2] === '1', bits[3] === '1']
  const bedShift = (sh === 'm' ? -1 : Number(sh)) as Variant['bedShift']
  const variant: Variant = { stairEnd: se as Variant['stairEnd'], rev, bedShift }
  if (w2 === undefined || h2 === undefined) return { arch, W, H, variant }
  if (Number(w2) < 1 || Number(h2) < 1) return null
  return { arch, W, H, variant, fp2: { W2: Number(w2), H2: Number(h2) } }
}

export function isPlanKey(s: unknown): s is PlanKey {
  return parsePlanKey(s) !== null
}

/** 全候補（候補プールのコピー）。左右反転の重複を除き、スコア降順。generatePlans の3案は必ず含まれる */
export function enumeratePlans(cfg: PlanConfig): ScoredPlan[] {
  return candidatePool(cfg).slice()
}

/** ギャラリーの表示上限 */
export const GALLERY_LIMIT = 24

/**
 * ギャラリー用: 多様性を優先した貪欲選択（最良案から始め、選択済みとの最小距離が最大の案を足していく）。
 * 結果はスコア降順（同点はプール順）で返す。
 */
export function galleryPlans(cfg: PlanConfig, limit = GALLERY_LIMIT): ScoredPlan[] {
  const pool = candidatePool(cfg)
  if (pool.length <= limit) return pool.slice()
  const minDist = pool.map(() => Infinity)
  const chosen: number[] = []
  const taken = new Set<number>()
  let next = 0
  while (chosen.length < limit) {
    chosen.push(next)
    taken.add(next)
    const added = pool[next]
    if (!added) break
    let bestI = -1
    let bestD = -1
    for (const [i, p] of pool.entries()) {
      if (taken.has(i)) continue
      minDist[i] = Math.min(minDist[i] ?? Infinity, planDistance(added, p))
      const d = minDist[i] ?? 0
      if (d > bestD) {
        bestD = d
        bestI = i
      }
    }
    if (bestI < 0) break
    next = bestI
  }
  return chosen.sort((a, b) => a - b).flatMap((i) => (pool[i] ? [pool[i]] : []))
}

/**
 * planKey から案を再構築する（URL共有・お気に入り用）。
 * 形式不正・変種なしの key（GEN_VERSION 1 の key）・外形が上位10件以外・生成不能・検証不通過は null。
 * 部分二階の key（-p<W2>x<H2>）は cfg が部分二階で、(W,H,W2,H2) の組が footprintPairs にあるときだけ。
 * cfg が部分二階なのに -p のない key、cfg が総二階なのに -p のある key は null
 */
export function planFromKey(cfg: PlanConfig, key: unknown): ScoredPlan | null {
  const k = parsePlanKey(key)
  if (!k || !k.variant) return null
  if (cfg.floors === 1 && k.arch === 2) return null
  if (isPartial(cfg) !== (k.fp2 !== undefined)) return null
  let fp: { W: number; H: number; W2?: number; H2?: number }
  if (k.fp2) {
    const { W2, H2 } = k.fp2
    if (!footprintPairs(cfg.area * 16).some((f) => f.W === k.W && f.H === k.H && f.W2 === W2 && f.H2 === H2)) return null
    fp = { W: k.W, H: k.H, W2, H2 }
  } else {
    if (!footprintList((cfg.area * 16) / cfg.floors, FOOTPRINT_LIMIT).some((f) => f.W === k.W && f.H === k.H)) return null
    fp = { W: k.W, H: k.H }
  }
  const plan = buildPlan(cfg, k.arch, fp, k.variant)
  if (!plan || !validatePlan(plan)) return null
  return scored(plan)
}
