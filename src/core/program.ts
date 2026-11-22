import { CANONICAL } from './types'
import type { Alt, ArchId, Feasibility, PlanConfig } from './types'
import { bandsFor, buildPlanStage } from './archetypes'
import { FOOTPRINT_LIMIT, candidatePool, generatePlansUncached } from './generate'
import { footprintList } from './slicing'
import { validatePlan } from './validate'

/** 実現可能性: 最低限必要な延床を見積もり、無理なら理由と代替案を返す */
export function feasibility(cfg: PlanConfig): Feasibility {
  const has = (k: PlanConfig['feats'][number]) => cfg.feats.includes(k)
  if (cfg.floors === 1 && has('void')) {
    return {
      ok: false,
      reason: '吹き抜けは2階建てでないと作れません（平屋には上の階がないため）。',
      alts: [
        { label: '2階建てに変える', patch: { floors: 2 } },
        { label: '吹き抜けを外す', patch: { feats: cfg.feats.filter((f) => f !== 'void') } },
      ],
    }
  }
  let min = 12.5 + 3.5 + (cfg.rooms - 1) * 2.6 + (cfg.floors === 1 ? 1.5 : 2.0)
  if (has('doma')) min += 1.2
  if (has('study')) min += 2.0
  if (has('wic')) min += 0.8
  if (has('pantry')) min += 0.5
  if (has('laundry')) min += 0.8
  if (has('washitsu')) min += 3.0
  if (has('void')) min += 2.0
  if (has('kitchenFace')) min += 0.3
  // 面積合計ベースの下限（各部屋の最低面積の合計×詰め込みロス）も併用する
  let minSum = 0
  for (let f = 1; f <= cfg.floors; f++) {
    const bs = bandsFor(cfg, 0, f, 16)
    if (bs) for (const b of bs) for (const c of b.cells) minSum += c.minArea
    minSum += 26 // ホール帯の最低面積
  }
  min = Math.max(min, (minSum * 1.18) / 16)
  if (cfg.area >= min) return { ok: true }
  const need = Math.ceil(min)
  const alts: Alt[] = []
  if (need <= 40) alts.push({ label: `延床を約${need}坪にする`, patch: { area: need } })
  const baseOthers = min - (cfg.rooms - 1) * 2.6
  const maxRooms = Math.max(2, 1 + Math.floor((cfg.area - baseOthers) / 2.6))
  if (maxRooms < cfg.rooms) alts.push({ label: `個室を${maxRooms}室にする`, patch: { rooms: maxRooms } })
  if (has('washitsu')) alts.push({ label: '和室を外す', patch: { feats: cfg.feats.filter((f) => f !== 'washitsu') } })
  return {
    ok: false,
    reason: `この条件だと各部屋の最低サイズが確保できず、計算上は最低でも約${need}坪必要です（指定は${cfg.area}坪）。要素を黙って落とす代わりに、条件の調整案を出します。`,
    alts,
  }
}

/** 生成が0案だったときの理由と、実際に3案出ることを確かめた代替案（最大3件） */
export interface Diagnosis {
  reason: string
  alts: Alt[]
}

/** 正規形の組み立て（全アーキタイプ × 外形上位10件）でどこが崩れたかを数えて、理由文にする */
function emptyReason(cfg: PlanConfig): string {
  const counts = { f1: 0, f2: 0, stair: 0, void: 0, variant: 0, validate: 0 }
  const archs: ArchId[] = cfg.floors === 1 ? [0, 1] : [0, 1, 2]
  for (const arch of archs) {
    for (const fp of footprintList((cfg.area * 16) / cfg.floors, FOOTPRINT_LIMIT)) {
      const r = buildPlanStage(cfg, arch, fp, CANONICAL)
      if (r.plan) {
        if (!validatePlan(r.plan)) counts.validate++
      } else if (r.failed) counts[r.failed]++
    }
  }
  const has = (k: PlanConfig['feats'][number]) => cfg.feats.includes(k)
  if (counts.f1 > 0 && counts.f2 === 0 && counts.stair === 0 && counts.void === 0 && counts.validate === 0) {
    return cfg.floors === 1
      ? '部屋が外形に収まりませんでした（帯の幅と高さの範囲で、各部屋の最低面積を満たせません）。'
      : '1階の部屋が外形に収まりませんでした（水回り・玄関・LDK などが帯の幅と高さの範囲で最低面積を満たせません）。'
  }
  if (counts.f2 > 0 && counts.f1 === 0) {
    return '2階の部屋が外形に収まりませんでした（個室・主寝室・階段が帯の幅と高さの範囲で最低面積を満たせません）。'
  }
  if (counts.f1 > 0 && counts.f2 > 0) {
    return '1階・2階とも、部屋が外形に収まる組み合わせがほとんどありませんでした（帯の幅と高さの範囲で最低面積を満たせません）。'
  }
  if (has('void') && counts.void > 0) {
    return '吹抜を1階のLDK直上（東西・南北とも）に収められる組み合わせがありませんでした。'
  }
  if (counts.validate > 0) {
    return '部屋は収まりますが、全室への動線や居室の採光（外壁への接触）の検証を通過できませんでした。'
  }
  return '面積は足りていても、部屋の並び（帯の幅・高さ）に収まらず、動線と採光の検証を通過できませんでした。'
}

/** 1〜2案だけのときの理由（0案前提の「収まりませんでした」系の文言は出さない） */
export function fewReason(count: number): string {
  return `条件に合う案が全${count}案しかなく、顔ぶれの違う3案を選べませんでした。`
}

/** 3案に満たないときの診断（0案なら崩れた理由、1〜2案なら少ない旨）: 理由と、適用すると generatePlans が3案を返すことを確かめた代替案（最大3件） */
export function diagnoseEmpty(cfg: PlanConfig): Diagnosis {
  const has = (k: PlanConfig['feats'][number]) => cfg.feats.includes(k)
  const without = (k: PlanConfig['feats'][number]) => cfg.feats.filter((f) => f !== k)
  const candidates: Alt[] = []
  for (const d of [2, 4]) {
    if (cfg.area + d <= 40) candidates.push({ label: `延床を${cfg.area + d}坪にする`, patch: { area: cfg.area + d } })
  }
  if (cfg.rooms > 2) candidates.push({ label: `個室を${cfg.rooms - 1}室にする`, patch: { rooms: cfg.rooms - 1 } })
  const drop: [PlanConfig['feats'][number], string][] = [
    ['void', '吹抜を外す'], ['doma', '土間を外す'], ['washitsu', '和室を外す'], ['pantry', 'パントリーを外す'], ['laundry', 'ランドリーを外す'],
  ]
  for (const [k, label] of drop) if (has(k)) candidates.push({ label, patch: { feats: without(k) } })
  if (!has('kitchenFace')) candidates.push({ label: '対面キッチンにする', patch: { feats: [...cfg.feats, 'kitchenFace'] } })
  const alts: Alt[] = []
  for (const a of candidates) {
    if (alts.length >= 3) break
    const patched: PlanConfig = { ...cfg, feats: [...cfg.feats], ...a.patch }
    if (feasibility(patched).ok && generatePlansUncached(patched, 1).length === 3) alts.push(a)
  }
  const count = candidatePool(cfg).length
  return { reason: count > 0 ? fewReason(count) : emptyReason(cfg), alts }
}
