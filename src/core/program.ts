import type { Feasibility, Alt, PlanConfig } from './types'
import { bandsFor } from './archetypes'

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

/** 生成が0案だったときの調整案 */
export function fallbackAlts(cfg: PlanConfig): Alt[] {
  const alts: Alt[] = []
  if (cfg.area <= 38) alts.push({ label: `延床を${cfg.area + 2}坪にする`, patch: { area: cfg.area + 2 } })
  if (cfg.rooms > 2) alts.push({ label: `個室を${cfg.rooms - 1}室にする`, patch: { rooms: cfg.rooms - 1 } })
  if (cfg.feats.length) alts.push({ label: 'こだわりを全部外す', patch: { feats: [] } })
  return alts
}
