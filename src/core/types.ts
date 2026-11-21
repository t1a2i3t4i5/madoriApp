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

export interface Floor {
  label: string
  rooms: Room[]
}

/** アーキタイプ番号（ARCH_INFO の添字） */
export type ArchId = 0 | 1 | 2

export interface Plan {
  W: number
  H: number
  floors: Floor[]
  arch: ArchId
  totalArea: number
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

/** 案の識別子 "アーキタイプ-幅xy高さ"（例: "2-18x14"）。同じ条件なら1つの案に対応する */
export type PlanKey = `${ArchId}-${number}x${number}`

export interface Edge {
  dir: 'v' | 'h'
  at: number
  mid: number
  len: number
}

export interface Door {
  a: Room
  b: Room
  edge: Edge
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
