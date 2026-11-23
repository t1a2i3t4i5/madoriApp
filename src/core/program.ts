import { CANONICAL, isPartial } from './types'
import type { Alt, ArchId, Feasibility, PlanConfig } from './types'
import { bandsFor, buildPlanStage } from './archetypes'
import { FOOTPRINT_LIMIT, candidatePool, generatePlansUncached } from './generate'
import { footprintList, footprintPairs, PARTIAL_RATIO } from './slicing'
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
  let minSum2 = 0
  for (let f = 1; f <= cfg.floors; f++) {
    let sum = 26 // ホール帯の最低面積
    const bs = bandsFor(cfg, 0, f, 16)
    if (bs) for (const b of bs) for (const c of b.cells) sum += c.minArea
    minSum += sum
    if (f === 2) minSum2 = sum
  }
  min = Math.max(min, (minSum * 1.18) / 16)
  if (cfg.area >= min) {
    // 部分二階: 2階の板は延床の 0.45 以下。2階の最低面積合計（×詰め込みロス）がそこに収まること
    const minPartial = isPartial(cfg) ? (minSum2 * 1.18) / 16 / PARTIAL_RATIO.max : 0
    if (cfg.area >= minPartial) return { ok: true }
    const needP = Math.ceil(minPartial)
    const alts: Alt[] = [{ label: '総二階にする', patch: { story: 'full' } }]
    if (needP <= 40) alts.push({ label: `延床を約${needP}坪にする`, patch: { area: needP } })
    if (cfg.rooms > 2) alts.push({ label: `個室を${cfg.rooms - 1}室にする`, patch: { rooms: cfg.rooms - 1 } })
    return {
      ok: false,
      reason: `部分二階では2階の板が延床の${Math.round(PARTIAL_RATIO.max * 100)}%以下に限られ、2階に個室が乗り切りません。計算上は最低でも約${needP}坪必要です（指定は${cfg.area}坪）。総二階にするか、条件を調整してください。`,
      alts,
    }
  }
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
  const partial = isPartial(cfg)
  const shapes = partial ? footprintPairs(cfg.area * 16) : footprintList((cfg.area * 16) / cfg.floors, FOOTPRINT_LIMIT)
  for (const arch of archs) {
    for (const fp of shapes) {
      const r = buildPlanStage(cfg, arch, fp, CANONICAL)
      if (r.plan) {
        if (!validatePlan(r.plan)) counts.validate++
      } else if (r.failed) counts[r.failed]++
    }
  }
  const has = (k: PlanConfig['feats'][number]) => cfg.feats.includes(k)
  // 1F/2F の割り付けが崩れたとき、最小の短辺の判定を外すと組めるなら原因は短辺
  const shortCause =
    (counts.f1 > 0 || counts.f2 > 0) &&
    archs.some((arch) => shapes.some((fp) => buildPlanStage(cfg, arch, fp, CANONICAL, undefined, { ignoreMinShort: true }).plan !== null))
  // どの階で崩れたか（平屋 / 1階 / 2階 / 両方）。2階は1階が組めたときだけ試すので、1階が崩れた形が1つでもあれば 1F も挙げる
  const where = cfg.floors === 1 ? '平屋では' : counts.f1 > 0 && counts.f2 > 0 ? '1階・2階とも' : counts.f2 > 0 ? '2階では' : '1階では'
  const shortMsg = `${where}、部屋の幅（短辺）の最低限 — 個室 2.3m・主寝室 2.7m・浴室と洗面 1.4m など — を確保すると、帯に部屋が収まりません。個室を減らすか、延床を広げてください。`
  if (shortCause) return partial ? `${shortMsg}総二階にするか、条件を調整してください。` : shortMsg
  if (partial) {
    const tail = '総二階にするか、条件を調整してください。'
    // 吹抜ありで f2/void が崩れたとき、吹抜を除いても組めるなら原因は吹抜（fixedW のセルが狭い2階の南帯を占める）
    if (has('void') && (counts.f2 > 0 || counts.void > 0)) {
      const noVoid: PlanConfig = { ...cfg, feats: cfg.feats.filter((f) => f !== 'void') }
      const fits = archs.some((arch) => shapes.some((fp) => buildPlanStage(noVoid, arch, fp, CANONICAL).plan !== null))
      if (fits) {
        return `部分二階では吹抜が2階に収まりませんでした（2階の板が狭く、吹抜の幅が2階の南帯を占めて他の部屋が最低面積を満たせません）。吹抜を外すか、総二階にしてください。`
      }
    }
    if (counts.f2 > 0 && counts.f1 === 0) {
      return `部分二階では2階に個室が乗り切りません（2階の板が1階の外形より小さく、個室・主寝室・階段が最低面積を満たせません）。${tail}`
    }
    if (has('void') && counts.void > 0 && counts.f1 === 0 && counts.f2 === 0) {
      return `部分二階では吹抜を1階のLDK直上に収められませんでした（2階の板が小さく、吹抜の位置と高さが合いません）。吹抜を外すか、総二階にしてください。`
    }
    if (counts.f1 > 0 && counts.f2 === 0 && counts.stair === 0 && counts.void === 0 && counts.validate === 0) {
      return `1階の部屋が外形に収まりませんでした（水回り・玄関・LDK などが帯の幅と高さの範囲で最低面積を満たせません）。${tail}`
    }
    if (counts.validate > 0) {
      return `部分二階では、部屋は収まりますが、全室への動線・居室の採光・水回りの隣接の検証を通過できませんでした。${tail}`
    }
    return `部分二階では、1階・2階とも部屋が外形に収まる組み合わせがほとんどありませんでした（2階の板が1階より小さくなる分、各階の帯に最低面積が収まりません）。${tail}`
  }
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
    return '部屋は収まりますが、全室への動線・居室の採光（外壁への接触）・水回り（浴室・ランドリー・トイレと洗面の隣接）の検証を通過できませんでした。'
  }
  return '面積は足りていても、部屋の並び（帯の幅・高さ）に収まらず、動線・採光・水回りの隣接の検証を通過できませんでした。'
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
  // 部分二階で足りないときは、総二階を最初の代替にする（3案出ると確かめられたときだけ採用される）
  if (isPartial(cfg)) candidates.push({ label: '総二階にする', patch: { story: 'full' } })
  // 部分二階＋吹抜は、吹抜が2階の狭い南帯を占めて崩れるのが主因。上限3件から押し出されないよう2番目に置く
  const voidFirst = isPartial(cfg) && has('void')
  if (voidFirst) candidates.push({ label: '吹抜を外す', patch: { feats: without('void') } })
  for (const d of [2, 4]) {
    if (cfg.area + d <= 40) candidates.push({ label: `延床を${cfg.area + d}坪にする`, patch: { area: cfg.area + d } })
  }
  if (cfg.rooms > 2) candidates.push({ label: `個室を${cfg.rooms - 1}室にする`, patch: { rooms: cfg.rooms - 1 } })
  const drop: [PlanConfig['feats'][number], string][] = [
    ['void', '吹抜を外す'], ['doma', '土間を外す'], ['washitsu', '和室を外す'], ['pantry', 'パントリーを外す'], ['laundry', 'ランドリーを外す'],
  ]
  for (const [k, label] of drop) if (has(k) && !(voidFirst && k === 'void')) candidates.push({ label, patch: { feats: without(k) } })
  if (!has('kitchenFace')) candidates.push({ label: '対面キッチンにする', patch: { feats: [...cfg.feats, 'kitchenFace'] } })
  const alts: Alt[] = []
  const works = (patch: Partial<PlanConfig>) => {
    const patched: PlanConfig = { ...cfg, feats: [...cfg.feats], ...patch }
    return feasibility(patched).ok && generatePlansUncached(patched, 1).length === 3
  }
  for (const a of candidates) {
    if (alts.length >= 3) break
    if (works(a.patch)) alts.push(a)
  }
  // 1つの変更では3案にならないとき（例: 部分二階+吹抜+個室4 は、吹抜だけ・総二階だけ・個室を減らすだけのどれでも0案）に限り、
  // 2つの変更の組み合わせを試す。組み合わせは候補の順（総二階 → 吹抜 → …）に並べ、同じ項目（延床どうし）の組は除く
  if (alts.length === 0) {
    const pairs: Alt[] = []
    for (const [i, a] of candidates.entries()) {
      for (const b of candidates.slice(i + 1)) {
        if (a.patch.area !== undefined && b.patch.area !== undefined) continue
        if (a.patch.rooms !== undefined && b.patch.rooms !== undefined) continue
        // feats は後の変更が前の結果から外す（吹抜を外す＋土間を外す など）。両方を外した集合にする
        const feats = a.patch.feats && b.patch.feats ? a.patch.feats.filter((f) => b.patch.feats?.includes(f)) : (b.patch.feats ?? a.patch.feats)
        pairs.push({ label: `${a.label}＋${b.label}`, patch: { ...a.patch, ...b.patch, ...(feats ? { feats } : {}) } })
      }
    }
    for (const a of pairs) {
      if (alts.length >= 3) break
      if (works(a.patch)) alts.push(a)
    }
  }
  const count = candidatePool(cfg).length
  return { reason: count > 0 ? fewReason(count) : emptyReason(cfg), alts }
}
