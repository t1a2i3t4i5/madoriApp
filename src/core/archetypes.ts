import { CANONICAL, cfgId, isPartial } from './types'
import type { ArchId, Band, Cell, FeatureKey, Plan, PlanConfig, Room, RoomType, Variant } from './types'
import type { Rng } from './rng'
import { cell } from './rooms'
import { layoutFloor } from './slicing'

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

/** ユニット分解: 従属クラスタ → 先頭（ヘッド）の部屋種別 */
const FOLLOWS: Partial<Record<RoomType, RoomType>> = {
  wic: 'master', bath: 'wash', laundry: 'wash', kitchen: 'ldk', pantry: 'ldk', doma: 'entry',
}

/** 水回りユニット内の並び順（小さいほど西側）: ランドリー → 洗面 → 浴室 */
const WET_ORDER: Partial<Record<RoomType, number>> = { laundry: 0, wash: 1, bath: 2 }

/**
 * 変種を帯に適用する。bands / cells は書き換えず新しく作る。floor は 1始まり。
 * - 帯のセルをユニット（ヘッド+従属: wic→master, bath/laundry→wash, kitchen/pantry→ldk, doma→entry）に
 *   まとめてから並べ直す（ヘッドの相対順は保つ。クラスタの辺共有を常に保証するため正規形でも行う）。
 *   stair は stairEnd 側の端、void と（吹抜ありの1Fの）ldk ユニットは西端に固定し、
 *   rev=true の帯は固定以外のユニット列を逆順にする
 * - bedShift は2Fのみ。個数が足りなければ null
 */
export function applyVariant(bands: Band[], floor: number, variant: Variant, hasVoid: boolean): Band[] | null {
  const copy = (b: Band): Band => ({ ...b, cells: b.cells.map((c): Cell => ({ ...c })) })
  const out: Band[] = []
  for (const [bi, b] of bands.entries()) {
    const hasStair = b.cells.some((c) => c.type === 'stair')
    const rev = bi === 0 || bi === 2 ? variant.rev[(floor - 1) * 2 + (bi === 0 ? 0 : 1)] === true : false
    if (b.cells.length <= 1 && !hasStair) {
      out.push(copy(b))
      continue
    }
    // ユニット化（ヘッドが同じ帯にあれば続ける、なければ単独）
    const units: Cell[][] = []
    const headUnit = new Map<RoomType, Cell[]>()
    const followers: Cell[] = []
    for (const c of b.cells) {
      const head = FOLLOWS[c.type]
      if (head && b.cells.some((x) => x.type === head)) followers.push(c)
      else {
        const u = [{ ...c }]
        units.push(u)
        headUnit.set(c.type, u)
      }
    }
    for (const c of followers) {
      const u = headUnit.get(FOLLOWS[c.type] as RoomType)
      if (u) u.push({ ...c })
    }
    // 水回りユニットは「ランドリー → 洗面 → 浴室」（洗面が中心）に並べる。洗面が浴室とランドリーの両方と辺を共有する
    for (const u of units) {
      if (u[0]?.type === 'wash') u.sort((p, q) => (WET_ORDER[p.type] ?? 1) - (WET_ORDER[q.type] ?? 1))
    }
    const isFixedWest = (u: Cell[]) => {
      const t = u[0]?.type
      return t === 'void' || (t === 'ldk' && floor === 1 && hasVoid)
    }
    const stairUnits = units.filter((u) => u[0]?.type === 'stair')
    const west = units.filter(isFixedWest)
    let mid = units.filter((u) => !isFixedWest(u) && u[0]?.type !== 'stair')
    if (rev) mid = mid.slice().reverse()
    const ordered =
      variant.stairEnd === 'E' ? [...west, ...mid, ...stairUnits] : [...stairUnits, ...west, ...mid]
    out.push({ ...b, cells: ordered.flat() })
  }
  if (floor === 2 && variant.bedShift !== 0) {
    const north = out[0]
    const south = out[2]
    if (!north || !south) return null
    const d = variant.bedShift
    const nc = north.cells.slice()
    const sc = south.cells.slice()
    if (d > 0) {
      const idx = sc.flatMap((c, i) => (c.type === 'bed' ? [i] : [])).slice(-d)
      if (idx.length < d) return null
      const moved = idx.map((i) => sc[i] as Cell)
      for (const i of idx.slice().reverse()) sc.splice(i, 1)
      const at = variant.stairEnd === 'E' ? nc.findIndex((c) => c.type === 'stair') : nc.length
      nc.splice(at < 0 ? nc.length : at, 0, ...moved)
    } else {
      const i = nc.findIndex((c) => c.type === 'bed')
      if (i < 0) return null
      const [moved] = nc.splice(i, 1)
      if (!moved) return null
      sc.push(moved)
    }
    out[0] = { ...north, cells: nc }
    out[2] = { ...south, cells: sc }
  }
  return out
}

/** 洋室のラベルを位置順（北→南、西→東）で「洋室1..n」に振り直す（配置済みの部屋のコピーを返す） */
function relabelBeds(rooms: Room[]): Room[] {
  const beds = rooms.filter((r) => r.type === 'bed').sort((a, b) => a.y - b.y || a.x - b.x)
  const names = new Map(beds.map((r, i) => [r, '洋室' + (i + 1)]))
  return rooms.map((r) => ({ ...r, name: names.get(r) ?? r.name }))
}

/** 外形。部分二階は 2F の板の W2×H2 も持つ（1F の板は W×H。一辺共有の組は footprintPairs が作る） */
export interface BuildFootprint {
  W: number
  H: number
  W2?: number
  H2?: number
}

/** 1F の割り付け結果（部分二階のプール構築で、同じ (arch, W, H, stairEnd, rev[0], rev[1]) を使い回すためのメモ） */
export type F1Layout = { rooms: Room[]; heights: number[] } | 'variant' | 'f1'
export type F1Memo = Map<string, F1Layout>

/** 1F の割り付けが依存するもの: (cfg, arch, 1Fの板, stairEnd, rev[0], rev[1])。cfg が違う memo の使い回しで取り違えないよう cfgId を先頭に含める */
export function f1MemoKey(cfg: PlanConfig, arch: ArchId, W: number, H: number, v: Variant): string {
  return `${cfgId(cfg)}|${arch}|${W}x${H}|${v.stairEnd}${v.rev[0] ? 1 : 0}${v.rev[1] ? 1 : 0}`
}

/** 外形にアーキタイプを当てはめて1案を組み立てる。構造検査に落ちたら null。variant 省略は正規形（plan.variant は付けない） */
export function buildPlan(cfg: PlanConfig, arch: ArchId, fp: BuildFootprint, variant?: Variant, memo?: F1Memo): Plan | null {
  return buildPlanStage(cfg, arch, fp, variant, memo).plan
}

/** 組み立てが崩れた段階（0案の理由づけ用）: 1F/2F の割り付け、階段の一致、吹抜の位置、その他（変種が作れない） */
export type BuildFailure = 'f1' | 'f2' | 'stair' | 'void' | 'variant'

/**
 * buildPlan の本体。失敗した段階も返す。
 * 部分二階（実効 story が partial で fp に W2・H2 がある）: 2F の板は北寄せ（oy=0）＋階段側寄せ
 * （stairEnd=E なら ox=W−W2、W なら ox=0）。2F の部屋は 1F 基準の共通座標（オフセット適用済み）で持ち、
 * 2F の Floor にだけ fp を付ける。吹抜の高さは 2F 南帯 ≤ 1F 南帯 −（H−H2）に抑える（y の包含）。
 * memo を渡すと 1F の割り付けを使い回す（結果は同じ。呼び出し側が同じ cfg でだけ使うこと）
 */
export function buildPlanStage(
  cfg: PlanConfig,
  arch: ArchId,
  fp: BuildFootprint,
  variant?: Variant,
  memo?: F1Memo,
): { plan: Plan | null; failed?: BuildFailure } {
  const fail = (failed: BuildFailure) => ({ plan: null, failed })
  const { W, H } = fp
  const v = variant ?? CANONICAL
  const hasVoid = cfg.feats.indexOf('void') >= 0
  const partial = isPartial(cfg)
  if (partial && (fp.W2 === undefined || fp.H2 === undefined)) return fail('variant')
  // 平屋では2F・階段・個室配分に関係する項目は正規形のみ
  if (cfg.floors === 1 && (v.stairEnd !== 'E' || v.bedShift !== 0 || v.rev[2] || v.rev[3])) return fail('variant')
  // 1F → 2F の順に組む（吹抜ありなら2F南帯の高さを1F南帯（LDK）の高さ以下に抑える）
  const memoKey = f1MemoKey(cfg, arch, W, H, v)
  let f1: F1Layout | undefined = memo?.get(memoKey)
  if (f1 === undefined) {
    const b1 = bandsFor(cfg, arch, 1, W)
    const f1bands = b1 && applyVariant(b1, 1, v, hasVoid)
    f1 = !f1bands ? 'variant' : (layoutFloor(W, H, f1bands) ?? 'f1')
    memo?.set(memoKey, f1)
  }
  if (typeof f1 === 'string') return fail(f1)
  const floors: Plan['floors'] = [{ label: '1F', rooms: relabelBeds(f1.rooms) }]
  let area = W * H * cfg.floors
  if (cfg.floors === 2) {
    const W2 = partial ? (fp.W2 as number) : W
    const H2 = partial ? (fp.H2 as number) : H
    const ox = partial && v.stairEnd === 'E' ? W - W2 : 0
    const b2 = bandsFor(cfg, arch, 2, W2)
    const f2bands = b2 && applyVariant(b2, 2, v, hasVoid)
    if (!f2bands) return fail('variant')
    const southH = f1.heights[2]
    if (southH === undefined) return fail('f1')
    const capSouth = southH - (H - H2)
    const f2 = layoutFloor(W2, H2, f2bands, hasVoid ? { capH: { 2: capSouth } } : undefined)
    if (!f2) return fail('f2')
    const f2rooms = ox === 0 ? f2.rooms : f2.rooms.map((r) => ({ ...r, x: r.x + ox }))
    const floor2: Plan['floors'][number] = { label: '2F', rooms: relabelBeds(f2rooms) }
    if (partial) {
      floor2.fp = { x: ox, y: 0, W: W2, H: H2 }
      area = W * H + W2 * H2
    }
    floors.push(floor2)
    // 階段の両階一致を検証（構造的には同じ帯・同じ端だが念のためアサーション）
    const s1 = f1.rooms.find((r) => r.type === 'stair')
    const s2 = f2rooms.find((r) => r.type === 'stair')
    if (!s1 || !s2 || s1.x !== s2.x || s1.y !== s2.y || s1.w !== s2.w) return fail('stair')
    // 吹抜はLDK直上（x・y の両方）にあること。
    // y の検査は、現状の帯の高さ範囲では capH（上の layoutFloor）が効くため構造上は違反が出ない。
    // capH の退行や将来の帯範囲の変更に備えた二重の守りとして残している
    // （capH の効きは slicing.test.ts の合成構成で固定してある）
    if (hasVoid) {
      const ldk = f1.rooms.find((r) => r.type === 'ldk')
      const vd = f2rooms.find((r) => r.type === 'void')
      if (!ldk || !vd) return fail('void')
      if (vd.x < ldk.x || vd.x + vd.w > ldk.x + ldk.w) return fail('void')
      if (vd.y < ldk.y || vd.y + vd.h > ldk.y + ldk.h) return fail('void')
    }
  }
  const plan: Plan = { W, H, floors, arch, totalArea: area }
  if (variant) plan.variant = { stairEnd: variant.stairEnd, rev: [...variant.rev], bedShift: variant.bedShift }
  return { plan }
}
