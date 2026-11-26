import { cfgId, isPartial } from './types'
import type { ArchId, PlanConfig, Plan, ScoredPlan, Variant } from './types'
import { mulberry32 } from './rng'
import { applyVariant, bandsFor, buildPlan, f1MemoKey } from './archetypes'
import type { F1Memo } from './archetypes'
import { withCarveMemo } from './carve'
import { footprintList, footprintPairs } from './slicing'
import { STAIR_HS } from './stair'
import { validateFloor, validatePlan } from './validate'
import { scorePlan } from './score'
import { planSignature } from './diversity'
import { conceptKey, overlap } from './similarity'
import { chokkaRate } from './chokka'
import { privateStorageCount } from './closets'

/** 生成ロジックのバージョン。アルゴリズムを変えたら上げる（URLハッシュに保存） */
export const GEN_VERSION = 10

/** 外形候補の件数（縦横比 0.62〜1.62 の制限は footprintList 側で不変） */
export const FOOTPRINT_LIMIT = 10

/** スコア付きの案にする（sig は左右反転の重複検出用） */
export function scored(plan: Plan): ScoredPlan {
  return { ...plan, score: scorePlan(plan), sig: planSignature(plan, false), sigM: planSignature(plan, true) }
}

/** 変種の列挙順（正規形が先頭）: stairEnd → rev（1F北が最上位ビット）→ bedShift → クローゼットのモード（弱 → 強）→ 北帯の高さ hN（2階建てのみ。GEN_VERSION 6） */
const STAIR_ENDS: Variant['stairEnd'][] = ['E', 'W']
const BED_SHIFTS: Variant['bedShift'][] = [0, 1, 2, -1]

function variantsFor(cfg: PlanConfig): Variant[] {
  const out: Variant[] = []
  // 平屋は 2F・階段・個室配分に関係する項目を振らない（buildPlan も正規形以外を棄却する）
  const ends = cfg.floors === 1 ? STAIR_ENDS.slice(0, 1) : STAIR_ENDS
  const shifts = cfg.floors === 1 ? BED_SHIFTS.slice(0, 1) : BED_SHIFTS
  const revCount = cfg.floors === 1 ? 4 : 16
  for (const stairEnd of ends) {
    for (let m = 0; m < revCount; m++) {
      // 平屋は 1F北・1F南だけを振る（m の下位2ビット）。2階建ては4帯すべて
      const rev: Variant['rev'] =
        cfg.floors === 1
          ? [(m & 2) !== 0, (m & 1) !== 0, false, false]
          : [(m & 8) !== 0, (m & 4) !== 0, (m & 2) !== 0, (m & 1) !== 0]
      // クローゼットのモード（弱 → 強）は最内側の軸。同じ部屋配置になった案は重複除去で先着（弱）が残る
      for (const bedShift of shifts) {
        for (const closet of [undefined, 'hard'] as const) {
          // 2階建ては、北帯の高さ（= 階段の長さ）を両階で共通にして 5・6 を振る。平屋は階段がないので振らない
          for (const hN of cfg.floors === 1 ? [undefined] : STAIR_HS) {
            out.push({ stairEnd, rev, bedShift, ...(closet ? { closet } : {}), ...(hN ? { hN } : {}) })
          }
        }
      }
    }
  }
  return out
}

/**
 * arch の変種のうち、適用後の帯構成（両階）が正規形の列挙順で先に出たものと同一になるものを省く。
 * 動かせるユニットが1つ以下の帯での rev など、結果が変わらない変種は buildPlan まで回しても
 * 同一の案（同じ sig）になって重複除去で捨てられるだけなので、列挙前に落としてプール構築を速くする。
 * 先着を残すので、プールの中身・順序は変わらない（golden-fixture が検証）。
 */
function distinctVariants(cfg: PlanConfig, arch: ArchId, variants: Variant[]): Variant[] {
  const hasVoid = cfg.feats.indexOf('void') >= 0
  const base = [bandsFor(cfg, arch, 1), cfg.floors === 2 ? bandsFor(cfg, arch, 2) : null]
  const seen = new Set<string>()
  const out: Variant[] = []
  // クローゼットを切り出す個室セルが1つもない構成では、強モードは弱モードと同じ案になるので省く
  const hasClosetCell = base.some((b) => b?.some((band) => band.cells.some((c) => c.closet)))
  for (const v of variants) {
    if (v.closet && !hasClosetCell) continue
    const key = JSON.stringify([
      v.closet ?? '',
      v.hN ?? '',
      ...base.map((b, i) => (b ? applyVariant(b, i + 1, v, hasVoid) : null)),
    ])
    if (seen.has(key)) continue
    seen.add(key)
    out.push(v)
  }
  return out
}

const POOL_CACHE_MAX = 8
const poolCache = new Map<string, readonly ScoredPlan[]>()

/** 候補プールのキャッシュを空にする（計測・テスト用。HALL_RULES を書き換えて比べるときなど） */
export function resetPoolCache(): void {
  poolCache.clear()
}

/**
 * 先着順に、sig または sigM（左右反転）が既出の案を除く。
 * 注: 現行の実データでは「反転のみが違う重複」が0件で、この除去は発動しない。
 * 発動条件は合成データのテスト（generate.test.ts）で検証している。
 */
export function dedupeBySig(plans: readonly ScoredPlan[]): ScoredPlan[] {
  const seen = new Set<string>()
  const out: ScoredPlan[] = []
  for (const sp of plans) {
    if (seen.has(sp.sig)) continue
    seen.add(sp.sig)
    seen.add(sp.sigM)
    out.push(sp)
  }
  return out
}

/** プール構築の作業量（テスト用。時間でなく回数で性能の退行を見る） */
export interface PoolStats {
  /** buildPlan の呼び出し回数 */
  assembled: number
  /** 1F の割り付けを実際に行った回数（メモのミスの数。部分二階のみ） */
  f1Layouts: number
  /** 1F の検証を実際に行った回数（部分二階のみ） */
  f1Validations: number
}

/** 候補の組み立て（キャッシュを介さない）。candidatePool と診断（キャッシュを汚さない用途）が使う */
function buildPool(cfg: PlanConfig, stats?: PoolStats, diag?: { ignoreStairUnify: true }): readonly ScoredPlan[] {
  return withCarveMemo(() => buildPoolBody(cfg, stats, diag))
}

function buildPoolBody(cfg: PlanConfig, stats?: PoolStats, diag?: { ignoreStairUnify: true }): readonly ScoredPlan[] {
  const archs: ArchId[] = cfg.floors === 1 ? [0, 1] : [0, 1, 2]
  const allVariants = variantsFor(cfg)
  const built: ScoredPlan[] = []
  const partial = isPartial(cfg)
  // 1F は (arch, 1Fの板, stairEnd, rev[0], rev[1], hN) で決まるので、割り付けを使い回す。検証の使い回しは部分二階のみ（総二階は plan 全体を検証する）
  const memo: F1Memo = new Map()
  const f1Valid = new Map<string, boolean>()
  const shapes: { W: number; H: number; W2?: number; H2?: number }[] = partial
    ? footprintPairs(cfg.area * 16)
    : footprintList((cfg.area * 16) / cfg.floors, FOOTPRINT_LIMIT)
  for (const arch of archs) {
    // 診断専用（階段の上下一致を外す）では hN は効かないので、hN = 6 の変種は省く（hN = 5 と同じ案になる）
    const variants = distinctVariants(cfg, arch, allVariants).filter((v) => !diag || v.hN !== 6)
    for (const fp of shapes) {
      for (const variant of variants) {
        if (stats) stats.assembled++
        const plan = buildPlan(cfg, arch, fp, variant, memo, diag)
        if (!plan) continue
        if (partial) {
          const key = f1MemoKey(cfg, arch, fp.W, fp.H, variant)
          let ok = f1Valid.get(key)
          if (ok === undefined) {
            if (stats) stats.f1Validations++
            ok = validateFloor(plan, 0)
            f1Valid.set(key, ok)
          }
          if (!ok || !validateFloor(plan, 1)) continue
        } else if (!validatePlan(plan)) continue
        built.push(scored(plan))
      }
    }
  }
  if (stats) stats.f1Layouts = memo.size
  return dedupeBySig(built).sort((a, b) => b.score.total - a.score.total)
}

/**
 * 診断専用: 階段を上下で同じ形にする制約（北帯の高さ hN の共通化。GEN_VERSION 6）を外したときの候補プールの件数（キャッシュを介さない）。
 * 0 でないのに通常のプールが空なら、0案の原因は階段（program.ts の emptyReason が使う）。生成では使わない
 */
export function poolSizeWithoutStairUnify(cfg: PlanConfig): number {
  return buildPool(cfg, undefined, { ignoreStairUnify: true }).length
}

/** プール構築を（キャッシュを介さず）1回行い、作業量を返す。テスト用 */
export function poolBuildStats(cfg: PlanConfig): PoolStats & { poolSize: number } {
  const stats: PoolStats = { assembled: 0, f1Layouts: 0, f1Validations: 0 }
  const pool = buildPool(cfg, stats)
  return { ...stats, poolSize: pool.length }
}

/**
 * 候補プール: seed と無関係に、アーキタイプ × 外形（総二階・平屋は上位10件、部分二階は footprintPairs の12組）× 変種を決まった順に全部組み立て、
 * 検証・スコアして、左右反転を含む重複（sig / sigM）は先着を残し、スコア降順（安定ソート）で返す。
 * cfg ごとにメモ化する（最大8件）。
 *
 * 注意: readonly は配列レベルだけ（push などは型で防ぐが、中の ScoredPlan は freeze していない）。
 * 返った案のオブジェクトを書き換えるとキャッシュを汚すので、触るなら複製すること
 * （深い freeze は挙動リスクがあるため入れていない）。
 */
export function candidatePool(cfg: PlanConfig): readonly ScoredPlan[] {
  const id = cfgId(cfg)
  const hit = poolCache.get(id)
  if (hit) return hit
  const pool = buildPool(cfg)
  if (poolCache.size >= POOL_CACHE_MAX) {
    const oldest = poolCache.keys().next().value
    if (oldest !== undefined) poolCache.delete(oldest)
  }
  poolCache.set(id, pool)
  return pool
}

/**
 * generatePlans と同じ結果を、プールのキャッシュを介さずに返す。
 * 診断（diagnoseEmpty）が代替条件を何件も試すときに、現在の条件のプールをキャッシュから追い出さないために使う。
 */
export function generatePlansUncached(cfg: PlanConfig, seed: number): ScoredPlan[] {
  const id = cfgId(cfg)
  return selectPlans(poolCache.get(id) ?? buildPool(cfg), seed)
}

/** 選抜に入る、最良スコアからの差 */
const WINDOW = 8
/** Gumbel の温度（スコア差を温度2で確率に直す） */
const TEMPERATURE = 2
/** 概念パス・形のパスの重なりしきい値（1 − overlap がこれを超える案だけ採る。［暫定］）。形のパスは先頭から段階的に緩める */
const SHAPE_STEPS = [0.2, 0.15, 0.1] as const
/** 概念パスで、1案目より下がってよい直下率の幅（U3 のガード） */
const CHOKKA_MARGIN = 0.1

/** 53bit までの seed を 32bit に畳む */
function seed32(seed: number): number {
  return (seed >>> 0) ^ (Math.floor(seed / 2 ** 32) >>> 0)
}

/** 個室収納の付属率（個室がなければ 1）。収納ガードの比較用 */
function storageRate(p: Plan): number {
  const { with: w, total } = privateStorageCount(p)
  return total === 0 ? 1 : w / total
}

/**
 * seed による選抜（GEN_VERSION 9。R-SEL-05・R-SEL-10・R-SEL-12）:
 * 最良から8点以内の窓を Gumbel キー（温度2）の降順に並べ（乱数列は v8 と同じ）、
 * 1) 概念パス: 「考え方」(conceptKey) が選んだ案と重ならず、重なり距離が最初のしきい値を超える案を採る。
 *    1案目より個室収納の付属率が低い案、1案目より直下率が 10pt を超えて低い2階建ては採らない（ガード）。
 * 2) 形のパス: 重なり距離のしきい値を 0.20（ガードあり → なし）→ 0.15 → 0.10 と緩めて残りを埋める。
 * 3) 補充: 抽選順 → pool 順（距離を見ない。v8 と同じ）。pool は書き換えない。
 */
export function selectPlans(pool: readonly ScoredPlan[], seed: number, count = 3): ScoredPlan[] {
  const best = pool[0]
  if (!best) return []
  const rng = mulberry32(seed32(seed) ^ 0x2f6b1d3a)
  const keyed = pool
    .filter((p) => p.score.total >= best.score.total - WINDOW)
    .map((p) => {
      const u = rng()
      return { p, key: p.score.total / TEMPERATURE - Math.log(-Math.log(u === 0 ? 1e-12 : u)) }
    })
  const order = keyed.slice().sort((a, b) => b.key - a.key).map((k) => k.p)
  const picked: ScoredPlan[] = []
  const farEnough = (c: ScoredPlan, th: number) => picked.every((p) => 1 - overlap(p, c) > th)

  const first = order[0]
  if (first) {
    const keys = new Set<string>()
    const sr0 = storageRate(first)
    const ch0 = chokkaRate(first)
    /** U3 のガード: 1案目より収納付属率が低い、または直下率が 10pt を超えて低い案は採らない */
    const guardOk = (c: ScoredPlan) => {
      if (storageRate(c) < sr0) return false
      const ch = chokkaRate(c)
      return !(ch0 !== null && ch !== null && ch < ch0 - CHOKKA_MARGIN)
    }
    for (const c of order) {
      if (picked.length >= count) break
      const k = conceptKey(c)
      if (keys.has(k)) continue
      if (picked.length > 0 && !(guardOk(c) && farEnough(c, SHAPE_STEPS[0]))) continue
      picked.push(c)
      keys.add(k)
    }
    // 形のパス: 最初の段（0.20）だけ、ガードあり → なしの2回に分ける（件数の保証は変えない）
    const shapeSteps: [number, boolean][] = [[SHAPE_STEPS[0], true], ...SHAPE_STEPS.map((th): [number, boolean] => [th, false])]
    for (const [th, guarded] of shapeSteps) {
      for (const c of order) {
        if (picked.length >= count) break
        if (!picked.includes(c) && (!guarded || guardOk(c)) && farEnough(c, th)) picked.push(c)
      }
    }
  }
  for (const list of [order, pool]) {
    for (const c of list) {
      if (picked.length >= count) break
      if (!picked.includes(c)) picked.push(c)
    }
  }
  return picked
}

/** パイプライン: 候補プール（seed 非依存）→ seed による多様性つき選抜で最大3案 */
export function generatePlans(cfg: PlanConfig, seed: number): ScoredPlan[] {
  return selectPlans(candidatePool(cfg), seed)
}
