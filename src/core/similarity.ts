import type { Plan, Room, RoomType } from './types'
import { floorRect } from './types'

/**
 * 案どうしの似通い度の観測（R-SEL-05・R-SEL-12 の指標の案。多様性の PR1。生成・選抜は参照しない）。
 * - `overlap`: 部屋配置の重なり（左右反転を同一とみなす）
 * - `conceptKey`: 「考え方」のキー（LDK・階段・水回りの位置を見る粒度。K3）
 * `testing.ts` の `overlapIndependent`・`conceptKeyIndependent` は別の計算法の独立実装で、`similarity.test.ts` で一致を確かめる。
 * 粗い種別の表・標本の細かさは［暫定］（design.md R-SEL-12）。
 */

/** 標本の細かさ（各階の板を n×n 点で標本化。U7: 16・32 でも結論が変わらないことを観測テストで確かめる） */
export const OVERLAP_GRID = 24

/** 似通った組とみなす重なりの下限 */
export const SIMILAR_OVERLAP = 0.8

export type CoarseKind = 'bed' | 'water' | 'store' | 'ldk' | 'entry' | 'hall' | 'stair' | 'void'

/** 粗い種別（重なりで同じとみなす種別） */
export const COARSE: Record<RoomType, CoarseKind> = {
  master: 'bed', bed: 'bed', study: 'bed', washitsu: 'bed',
  bath: 'water', wash: 'water', wc: 'water', laundry: 'water',
  pantry: 'store', wic: 'store', store: 'store', closet: 'store',
  ldk: 'ldk', kitchen: 'ldk',
  entry: 'entry', doma: 'entry',
  hall: 'hall', stair: 'stair', void: 'void',
}

const KINDS: readonly CoarseKind[] = ['bed', 'water', 'store', 'ldk', 'entry', 'hall', 'stair', 'void']

/** i 階の n×n の標本（行優先。板の外・部屋のない点は -1）。座標は板に正規化する */
function raster(plan: Plan, fi: number, n: number, mirror = false): Int8Array {
  const out = new Int8Array(n * n).fill(-1)
  const fl = plan.floors[fi]
  if (!fl) return out
  const rc0 = floorRect(plan, fi)
  // 反転は部屋と板の座標を折り返してから標本化する（標本点が辺に乗るときの半開区間の向きまで反転にそろえる）
  const rc = mirror ? { ...rc0, x: plan.W - rc0.x - rc0.W } : rc0
  for (const r0 of fl.rooms) {
    const r = mirror ? { ...r0, x: plan.W - r0.x - r0.w } : r0
    const k = KINDS.indexOf(COARSE[r.type])
    // 部屋 [x, x+w) に入る標本の添字の範囲。標本 i の座標は rc.x + (i+0.5)*rc.W/n（整数で比べる）
    const lo = (v: number, size: number, off: number) => Math.max(0, Math.ceil(((v - off) * n) / size - 0.5))
    const i0 = lo(r.x, rc.W, rc.x)
    const i1 = Math.min(n, lo(r.x + r.w, rc.W, rc.x))
    const j0 = lo(r.y, rc.H, rc.y)
    const j1 = Math.min(n, lo(r.y + r.h, rc.H, rc.y))
    for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) out[j * n + i] = k
  }
  return out
}

/**
 * 部屋配置の重なり（0〜1）。各階の板を n×n 点で標本化し、粗い種別が一致する点の割合を階の数で平均する。
 * b を左右反転したもの（部屋の座標を折り返してから標本化）とも比べて大きい方を採る。a→b と b→a の平均（対称）。階の数が違うときは多い方の階の数で割る（無い階は一致0）。
 * 外形が違っても比べられる（板に正規化する）
 */
export function overlap(a: Plan, b: Plan, n = OVERLAP_GRID): number {
  const floors = Math.max(a.floors.length, b.floors.length)
  // 標本点が辺に乗ると、半開区間の向きで反転との比べ方が非対称になる。a→b と b→a の両方向を計算して平均し、overlap(a,b) = overlap(b,a) にする
  let abS = 0, abM = 0, baS = 0, baM = 0
  for (let f = 0; f < floors; f++) {
    const ra = raster(a, f, n)
    const rma = raster(a, f, n, true)
    const rb = raster(b, f, n)
    const rmb = raster(b, f, n, true)
    for (let k = 0; k < n * n; k++) {
      const va = ra[k] ?? -1
      if (va >= 0) {
        if (va === rb[k]) abS++
        if (va === rmb[k]) abM++
      }
      const vb = rb[k] ?? -1
      if (vb >= 0) {
        if (vb === ra[k]) baS++
        if (vb === rma[k]) baM++
      }
    }
  }
  return (Math.max(abS, abM) + Math.max(baS, baM)) / (2 * floors * n * n)
}

/** 従属クラスタをヘッドの種別に畳む（収納・クローゼット・ホールは null = 除く） */
const FOLD: Partial<Record<RoomType, RoomType | null>> = {
  wic: 'master', kitchen: 'ldk', pantry: 'ldk', doma: 'entry', bath: 'wash', laundry: 'wash',
  store: null, closet: null, hall: null,
}

function foldType(t: RoomType): RoomType | null {
  return t in FOLD ? (FOLD[t] ?? null) : t
}

/** 向きの関係。中央 = 板の中心から幅の 1/6 以内。c2 は重心 x の2倍 */
function side(c2: number, W: number): -1 | 0 | 1 {
  const dev = c2 - W
  return 3 * Math.abs(dev) <= W ? 0 : dev < 0 ? -1 : 1
}

const c2x = (r: Room) => 2 * r.x + r.w

/** a の LDK 基準の位置: 中央 'C'／LDK が中央 'X'／同じ側 '='／反対側 '!' */
function relTo(ldk: Room | undefined, r: Room | undefined, W: number): string {
  if (!r) return '-'
  const s = side(c2x(r), W)
  if (s === 0) return 'C'
  if (!ldk) return 'X'
  const l = side(c2x(ldk), W)
  return l === 0 ? 'X' : l === s ? '=' : '!'
}

/**
 * 「考え方」のキー K3（R-SEL-05 の言い換え）。左右反転で変わらない。
 * K2 = 全階の「南面に接する部屋の西→東の並び」（従属クラスタはヘッドに畳み、続く同種は1つに。収納・ホールは除く）
 * K3 = K2 + 1F の LDK を基準にした階段の位置（同じ側／中央／反対側）+ 洗面の位置（同＋北／南）。北帯の並び順そのものは見ない
 */
export function conceptKey(plan: Plan): string {
  const south = plan.floors.map((fl, fi) => {
    const rc = floorRect(plan, fi)
    const rooms = fl.rooms.filter((r) => r.y + r.h === rc.y + rc.H).sort((p, q) => p.x - q.x)
    const seq: RoomType[] = []
    for (const r of rooms) {
      const t = foldType(r.type)
      if (t && seq[seq.length - 1] !== t) seq.push(t)
    }
    return seq
  })
  const fwd = south.map((s) => s.join('>')).join('/')
  const bwd = south.map((s) => [...s].reverse().join('>')).join('/')
  const k2 = fwd <= bwd ? fwd : bwd
  const f1 = plan.floors[0]?.rooms ?? []
  const ldk = f1.find((r) => r.type === 'ldk')
  const stair = f1.find((r) => r.type === 'stair')
  const wash = f1.find((r) => r.type === 'wash')
  const washY = wash ? (2 * wash.y + wash.h < plan.H ? 'N' : 'S') : ''
  return `${k2}|st${relTo(ldk, stair, plan.W)}|ws${relTo(ldk, wash, plan.W)}${washY}`
}

export interface TrioSimilarity {
  /** 3案のうち最も似たペアの重なり */
  maxOverlap: number
  /** 重なりが SIMILAR_OVERLAP 以上のペアの数 */
  similarPairs: number
  /** 概念キー K3 の種類数 */
  conceptKinds: number
  /** アーキタイプの種類数 */
  archKinds: number
  /** アーキタイプが違うのに重なりが SIMILAR_OVERLAP 以上のペア数（arch ラベルと実態のずれ） */
  archDiffSimilarPairs: number
  pairs: number
}

/** 提示案の組（2案以上）の似通い度 */
export function trioSimilarity(plans: readonly Plan[], n = OVERLAP_GRID): TrioSimilarity {
  let maxOverlap = 0
  let similarPairs = 0
  let archDiffSimilarPairs = 0
  let pairs = 0
  for (let i = 0; i < plans.length; i++) {
    for (let j = i + 1; j < plans.length; j++) {
      const a = plans[i]
      const b = plans[j]
      if (!a || !b) continue
      const o = overlap(a, b, n)
      pairs++
      if (o > maxOverlap) maxOverlap = o
      if (o >= SIMILAR_OVERLAP) {
        similarPairs++
        if (a.arch !== b.arch) archDiffSimilarPairs++
      }
    }
  }
  return {
    maxOverlap, similarPairs, pairs, archDiffSimilarPairs,
    conceptKinds: new Set(plans.map(conceptKey)).size,
    archKinds: new Set(plans.map((p) => p.arch)).size,
  }
}
