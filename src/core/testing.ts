import type { Plan, PlanConfig } from './types'

/** テスト用の入力条件セット（generate / golden / invariants で共有） */
const base = { parking: 2, garden: 1 }

export const CONDITIONS: { name: string; cfg: PlanConfig }[] = [
  { name: '30坪/2階/個室3', cfg: { ...base, area: 30, floors: 2, rooms: 3, feats: ['kitchenFace', 'wic'] } },
  { name: '30坪/平屋/個室3', cfg: { ...base, area: 30, floors: 1, rooms: 3, feats: ['kitchenFace', 'wic'] } },
  { name: '35坪/2階/個室4', cfg: { ...base, area: 35, floors: 2, rooms: 4, feats: ['kitchenFace', 'wic'] } },
  { name: '平屋/個室2/最小こだわりなし', cfg: { ...base, area: 24, floors: 1, rooms: 2, feats: [] } },
  { name: '32坪/2階/吹抜', cfg: { ...base, area: 32, floors: 2, rooms: 3, feats: ['void'] } },
  { name: '36坪/2階/吹抜+WIC+書斎', cfg: { ...base, area: 36, floors: 2, rooms: 3, feats: ['void', 'wic', 'study', 'kitchenFace'] } },
  { name: '33坪/2階/土間+パントリー', cfg: { ...base, area: 33, floors: 2, rooms: 3, feats: ['doma', 'pantry'] } },
  { name: '30坪/平屋/土間+和室', cfg: { ...base, area: 30, floors: 1, rooms: 3, feats: ['doma', 'washitsu'] } },
  { name: '38坪/2階/全部のせ', cfg: { ...base, area: 38, floors: 2, rooms: 3, feats: ['kitchenFace', 'doma', 'study', 'wic', 'pantry', 'void', 'washitsu', 'laundry'] } },
  { name: '34坪/平屋/ランドリー+書斎', cfg: { ...base, area: 34, floors: 1, rooms: 4, feats: ['laundry', 'study', 'kitchenFace'] } },
]

/** 実現可能性が不可になる条件 */
export const INFEASIBLE: { name: string; cfg: PlanConfig }[] = [
  { name: '20坪/個室5', cfg: { ...base, area: 20, floors: 2, rooms: 5, feats: [] } },
  { name: '平屋+吹抜', cfg: { ...base, area: 30, floors: 1, rooms: 3, feats: ['void'] } },
  { name: '22坪/和室+書斎+個室4', cfg: { ...base, area: 22, floors: 1, rooms: 4, feats: ['washitsu', 'study'] } },
]

/** 実現可能と判定されるのに、検証を通る案が0になる条件（fallbackAlts の経路） */
export const ZERO_PLAN: PlanConfig = { ...base, area: 26, floors: 2, rooms: 2, feats: ['doma'] }

/** 0案・2案しか出ない境界条件（legacy と同じ結果になること自体を確認する用） */
export const BOUNDARY: { name: string; cfg: PlanConfig; /** generatePlans が全 SEEDS で返す件数（enumeratePlans の件数とも一致する） */ expected: number }[] = [
  { name: '境界: 36坪/2階/吹抜+個室4+WIC+書斎（0案）', cfg: { ...base, area: 36, floors: 2, rooms: 4, feats: ['void', 'wic', 'study', 'kitchenFace'] }, expected: 0 },
  { name: '境界: 36坪/2階/吹抜+個室4+WIC（2案）', cfg: { ...base, area: 36, floors: 2, rooms: 4, feats: ['void', 'wic', 'kitchenFace'] }, expected: 2 },
  { name: '境界: 26坪/2階/個室2/土間（0案）', cfg: ZERO_PLAN, expected: 0 },
]

export const SEEDS = [1, 2, 3, 20261121, 99999]

/** 配列の添字アクセスなどで undefined を除く（非nullアサーション `!` の代わり。テスト用） */
export function defined<T>(v: T | undefined, what = '値'): T {
  if (v === undefined) throw new Error(`${what} が undefined`)
  return v
}

/**
 * validatePlan とは独立した検証用の部品（invariants / enumerate のテストで共有）。
 * validator 自身のバグで不正なプランが素通りしないよう、同じ関数（touchesOuterWall など）は使わず、
 * セル塗りと素朴な座標比較で確かめる。
 */
export const LIVING = new Set(['ldk', 'master', 'bed', 'study', 'washitsu']) // rooms.ts の HABITABLE と同じ定義を独立に持つ

export function paint(plan: Plan, floorIdx: number): number[][] {
  const grid = Array.from({ length: plan.H }, () => Array.from({ length: plan.W }, () => 0))
  const fl = plan.floors[floorIdx]
  if (!fl) throw new Error(`floor ${floorIdx} がない`)
  for (const r of fl.rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const row = grid[y]
        if (!row || row[x] === undefined) throw new Error(`${r.name} が外形(${plan.W}x${plan.H})の外にはみ出している`)
        row[x] = (row[x] ?? 0) + 1
      }
    }
  }
  return grid
}

/** 独立検証で見つけた違反（なければ空）: 全セルが1部屋で塗られる／居室が外壁に接する／面積が w*h と一致する */
export function independentViolations(plan: Plan): string[] {
  const out: string[] = []
  plan.floors.forEach((fl, f) => {
    let grid: number[][]
    try {
      grid = paint(plan, f)
    } catch (e) {
      out.push(String(e))
      return
    }
    grid.forEach((row, y) => row.forEach((n, x) => { if (n !== 1) out.push(`${fl.label} (${x},${y}) が${n}部屋`) }))
    for (const r of fl.rooms) {
      if (r.area !== r.w * r.h) out.push(`${fl.label} ${r.name}: area が w*h と不一致`)
      if (LIVING.has(r.type) && !(r.x === 0 || r.y === 0 || r.x + r.w === plan.W || r.y + r.h === plan.H)) out.push(`${fl.label} ${r.name}: 居室が外壁に接していない`)
    }
  })
  return out
}
