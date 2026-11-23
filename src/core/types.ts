import type { SCORE_WEIGHTS } from './score'

/** 単位: 455mmグリッド。1坪 = 16単位²、1畳 = 8単位²。 */

export type RoomType =
  | 'ldk' | 'kitchen' | 'master' | 'bed' | 'study' | 'washitsu'
  | 'bath' | 'wash' | 'wc' | 'laundry'
  | 'pantry' | 'wic' | 'store'
  | 'entry' | 'doma' | 'hall' | 'stair' | 'void'

export type RoomCategory = 'living' | 'bed' | 'water' | 'store' | 'circ' | 'void'

export type FeatureKey =
  | 'kitchenFace' | 'doma' | 'study' | 'wic'
  | 'pantry' | 'void' | 'washitsu' | 'laundry'

export type Floors = 1 | 2

/** ユーザー入力（URLハッシュにも保存される） */
export interface PlanConfig {
  area: number // 延床（坪）
  floors: Floors
  rooms: number // 個室数（主寝室ふくむ）
  parking: number // 0..2
  garden: number // 0..2
  feats: FeatureKey[]
}

export interface RoomDef {
  name: string
  cat: RoomCategory
  target: number
  minArea: number
  maxArea: number
}

/** 帯（バンド）内の1セル。配置前の部屋プログラム */
export interface Cell {
  type: RoomType
  name: string
  label?: string
  target: number
  minArea: number
  maxArea: number
  fixedW?: number
}

export interface Band {
  cells: Cell[]
  minH?: number
  maxH?: number
  fixedH?: number
}

/** 配置済みの部屋 */
export interface Room {
  type: RoomType
  name: string
  x: number
  y: number
  w: number
  h: number
  area: number
  target: number
  minArea: number
}

/** 外形の矩形（セル。1F基準の共通座標。x,y は左上） */
export interface FloorRect {
  x: number
  y: number
  W: number
  H: number
}

export interface Floor {
  label: string
  rooms: Room[]
  /**
   * その階の板（部分二階の2F）。1F基準の共通座標。省略 = Plan の W×H 全体（総二階。総二階には付けない）
   */
  fp?: FloorRect
}

/** アーキタイプ番号（ARCH_INFO の添字） */
export type ArchId = 0 | 1 | 2

/**
 * アーキタイプ内の変種（GEN_VERSION 2）。rev は帯ごとのクラスタ列の逆順フラグ（1F北,1F南,2F北,2F南）、
 * bedShift は2Fの個室の南北配分（+d: 南の末尾d個を北へ、-1: 北の先頭1個を南へ）
 */
export interface Variant {
  stairEnd: 'E' | 'W'
  rev: [boolean, boolean, boolean, boolean]
  bedShift: -1 | 0 | 1 | 2
}

/** i 階の板の矩形。fp がなければ建物全体（Plan.W × Plan.H） */
export function floorRect(plan: { W: number; H: number; floors: Floor[] }, i: number): FloorRect {
  return plan.floors[i]?.fp ?? { x: 0, y: 0, W: plan.W, H: plan.H }
}

/** 正規形（v1 と同じ並び） */
export const CANONICAL: Variant = { stairEnd: 'E', rev: [false, false, false, false], bedShift: 0 }

export interface Plan {
  W: number
  H: number
  floors: Floor[]
  arch: ArchId
  totalArea: number
  /** 変種。GEN_VERSION 1 の旧データでは undefined */
  variant?: Variant
}

export interface ScoreResult {
  total: number
  parts: Record<keyof typeof SCORE_WEIGHTS, number>
}

export interface ScoredPlan extends Plan {
  score: ScoreResult
  sig: string
  sigM: string
}

/**
 * 案の識別子。v1: "アーキタイプ-幅x高さ"（例: "2-18x14"）。
 * v2: 末尾に変種 "-" + stairEnd + rev4桁 + shift（例: "1-16x14-E01000"）。同じ条件なら1つの案に対応する
 */
export type PlanKey = `${ArchId}-${number}x${number}` | `${ArchId}-${number}x${number}-${string}`

export interface Edge {
  dir: 'v' | 'h'
  at: number
  /** 共有区間の 34% 地点（ドアの葉の位置の目安）。実際の通行点は Door.swing.center */
  mid: number
  len: number
  /** 共有区間（辺に沿った座標）の始点・終点 */
  lo: number
  hi: number
}

export interface Pt {
  x: number
  y: number
}

/** ドア1枚の開き形状。葉の区間は共有区間内、弧の矩形は開き先の部屋内に収まる */
export interface DoorSwing {
  /** 開き先の部屋（Door.a / Door.b のどちらか） */
  opens: 'a' | 'b'
  r: number
  hinge: Pt
  /** 閉じた葉の先端（壁に沿う） */
  closed: Pt
  /** 開いた葉の先端（壁に垂直） */
  open: Pt
  /** 葉の区間の中心（通行点。動線が通る） */
  center: Pt
  /** 弧の外接矩形 */
  rect: { x: number; y: number; w: number; h: number }
}

export interface Door {
  a: Room
  b: Room
  edge: Edge
  swing: DoorSwing
}

export interface Footprint {
  W: number
  H: number
  diff: number
}

export interface Alt {
  label: string
  patch: Partial<PlanConfig>
}

export type Feasibility =
  | { ok: true }
  | { ok: false; reason: string; alts: Alt[] }
