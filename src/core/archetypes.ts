import type { ArchId, Band, FeatureKey, Plan, PlanConfig } from './types'
import type { Rng } from './rng'
import { cell } from './rooms'
import { footprintCandidates, layoutFloor } from './slicing'

export type { Rng }

/** アーキタイプ定義（クラスタ単位の帯構成を返す）。floor は 1始まり。 */
export function bandsFor(cfg: PlanConfig, arch: ArchId, floor: number, W?: number): Band[] | null {
  const voidW = W ? (W >= 18 ? 8 : W >= 15 ? 6 : 5) : 8
  const F = cfg.feats
  const has = (k: FeatureKey) => F.indexOf(k) >= 0
  const kids = cfg.rooms - 1 // 主寝室以外の個室数

  if (cfg.floors === 1) {
    if (floor !== 1) return null
    if (arch === 0) {
      // 北に個室+水回り、南にLDK
      const north = [cell('master')]
      if (has('wic')) north.push(cell('wic'))
      for (let i = 0; i < kids; i++) north.push(cell('bed', { label: '洋室' + (i + 1) }))
      north.push(cell('wash'), cell('bath'), cell('wc'))
      if (has('laundry')) north.push(cell('laundry'))
      const south = [cell('entry')]
      if (has('doma')) south.push(cell('doma'))
      south.push(cell('ldk'))
      if (!has('kitchenFace')) south.push(cell('kitchen'))
      if (has('pantry')) south.push(cell('pantry'))
      if (has('washitsu')) south.push(cell('washitsu'))
      if (has('study')) south.push(cell('study'))
      return [
        { cells: north, minH: 7, maxH: 11 },
        { cells: [cell('hall')], fixedH: 2 },
        { cells: south, minH: 8, maxH: 13 },
      ]
    }
    // arch 1: 主寝室を南西に離し、水回りを北東に集約
    const north = [cell('wash'), cell('bath')]
    if (has('laundry')) north.push(cell('laundry'))
    north.push(cell('wc'))
    for (let i = 0; i < kids; i++) north.push(cell('bed', { label: '洋室' + (i + 1) }))
    north.push(cell('store'))
    const south = [cell('master')]
    if (has('wic')) south.push(cell('wic'))
    south.push(cell('ldk'))
    if (!has('kitchenFace')) south.push(cell('kitchen'))
    if (has('pantry')) south.push(cell('pantry'))
    south.push(cell('entry'))
    if (has('doma')) south.push(cell('doma'))
    if (has('washitsu')) south.push(cell('washitsu'))
    if (has('study')) south.push(cell('study'))
    return [
      { cells: north, minH: 6, maxH: 10 },
      { cells: [cell('hall')], fixedH: 2 },
      { cells: south, minH: 8, maxH: 13 },
    ]
  }

  /* 2階建て */
  if (floor === 1) {
    const north = [cell('wash'), cell('bath'), cell('wc')]
    if (has('laundry')) north.push(cell('laundry'))
    north.push(cell('stair', { fixedW: 4 }))
    const south = []
    if (has('void')) {
      // 吹抜はLDKの上。LDKを西端に固定
      south.push(cell('ldk'))
      south.push(cell('entry'))
    } else if (arch === 1) {
      south.push(cell('ldk'))
      south.push(cell('entry'))
    } else {
      south.push(cell('entry'))
      south.push(cell('ldk'))
    }
    if (has('doma')) south.splice(1, 0, cell('doma'))
    if (!has('kitchenFace')) south.push(cell('kitchen'))
    if (has('pantry')) south.push(cell('pantry'))
    if (has('washitsu')) south.push(cell('washitsu'))
    if (arch === 2 && has('study')) south.push(cell('study'))
    return [
      { cells: north, minH: 4, maxH: 8 },
      { cells: [cell('hall')], fixedH: 2 },
      { cells: south, minH: 7, maxH: 12 },
    ]
  }

  /* 2階 */
  if (has('void') && arch === 2) {
    // 吹抜アーキタイプ: 主寝室を北へ逃がし、南は吹抜+個室
    const northV = [cell('master')]
    if (has('wic')) northV.push(cell('wic'))
    northV.push(cell('wc'), cell('stair', { fixedW: 4 }))
    const southV = [cell('void', { fixedW: voidW })]
    for (let i = 0; i < kids; i++) southV.push(cell('bed', { label: '洋室' + (i + 1) }))
    if (has('study')) southV.push(cell('study'))
    return [
      { cells: northV, minH: 7, maxH: 9 },
      { cells: [cell('hall')], fixedH: 2 },
      { cells: southV, minH: 7, maxH: 12 },
    ]
  }
  const south = []
  if (has('void')) south.push(cell('void', { fixedW: voidW }))
  south.push(cell('master'))
  if (has('wic')) south.push(cell('wic'))
  let southKids =
    arch === 1 ? kids : arch === 2 ? (kids <= 1 ? 0 : Math.floor((kids - 1) / 2)) : Math.ceil(kids / 2)
  if (has('void') && arch === 1) southKids = Math.max(0, kids - 1)
  for (let i = 0; i < southKids; i++) south.push(cell('bed', { label: '洋室' + (i + 1) }))
  const north = [cell('wc')]
  if (kids <= 2 && !has('void')) north.push(cell('store'))
  const northKids = kids - southKids
  for (let i = 0; i < northKids; i++) north.push(cell('bed', { label: '洋室' + (southKids + i + 1) }))
  if (has('study') && arch !== 2) north.push(cell('study'))
  north.push(cell('stair', { fixedW: 4 }))
  return [
    { cells: north, minH: 5, maxH: 9 },
    { cells: [cell('hall')], fixedH: 2 },
    { cells: south, minH: 6, maxH: 12 },
  ]
}

export const ARCH_INFO = [
  { suffix: '中廊下で仕切る家', desc: 'ホールを真ん中に通し、公私をきれいに分ける' },
  { suffix: '南に開くLDKの家', desc: 'LDKを南西に大きく取り、個室は静かな側へ' },
  { suffix: '水回りを固めた家', desc: '配管を北側に集約して、家事動線を短く' },
] as const

/** 外形(W,H)にアーキタイプを当てはめて1案を組み立てる。構造検査に落ちたら null */
export function buildPlan(cfg: PlanConfig, arch: ArchId, fp: { W: number; H: number }): Plan | null {
  const { W, H } = fp
  const f1bands = bandsFor(cfg, arch, 1, W)
  if (!f1bands) return null
  const f1 = layoutFloor(W, H, f1bands)
  if (!f1) return null
  const floors = [{ label: '1F', rooms: f1 }]
  if (cfg.floors === 2) {
    const f2bands = bandsFor(cfg, arch, 2, W)
    if (!f2bands) return null
    const f2 = layoutFloor(W, H, f2bands)
    if (!f2) return null
    floors.push({ label: '2F', rooms: f2 })
    // 階段の両階一致を検証（構造的には同じ帯・同じ端だが念のためアサーション）
    const s1 = f1.find((r) => r.type === 'stair')
    const s2 = f2.find((r) => r.type === 'stair')
    if (!s1 || !s2 || s1.x !== s2.x || s1.y !== s2.y || s1.w !== s2.w) return null
    // 吹抜はLDK直上にあること
    if (cfg.feats.indexOf('void') >= 0) {
      const ldk = f1.find((r) => r.type === 'ldk')
      const vd = f2.find((r) => r.type === 'void')
      if (!ldk || !vd) return null
      if (vd.x < ldk.x || vd.x + vd.w > ldk.x + ldk.w) return null
    }
  }
  return { W, H, floors, arch, totalArea: W * H * cfg.floors }
}

/** 候補外形の列挙（generate から使う薄いラッパ） */
export { footprintCandidates }
