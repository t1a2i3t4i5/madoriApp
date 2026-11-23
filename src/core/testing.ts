import type { Plan, PlanConfig, Room } from './types'

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

/** 実現可能と判定されるのに、検証を通る案が0になる条件（diagnoseEmpty の経路） */
export const ZERO_PLAN: PlanConfig = { ...base, area: 26, floors: 2, rooms: 2, feats: ['doma'] }

/** 0案・3案の境界条件（件数が変わったら気づくために件数を固定する）（GEN_VERSION 2 の実測。36坪/吹抜+個室4+WIC は3案に改善） */
export const BOUNDARY: { name: string; cfg: PlanConfig; /** generatePlans が全 SEEDS で返す件数（0案なら候補プールも空） */ expected: number }[] = [
  { name: '境界: 36坪/2階/吹抜+個室4+WIC+書斎（0案）', cfg: { ...base, area: 36, floors: 2, rooms: 4, feats: ['void', 'wic', 'study', 'kitchenFace'] }, expected: 0 },
  { name: '境界: 36坪/2階/吹抜+個室4+WIC（3案）', cfg: { ...base, area: 36, floors: 2, rooms: 4, feats: ['void', 'wic', 'kitchenFace'] }, expected: 3 },
  { name: '境界: 26坪/2階/個室2/土間（0案）', cfg: ZERO_PLAN, expected: 0 },
]

/** 末尾の 2**40+5 は 2^32 以上の seed（seed32 の上位ビット経路を通す）。golden.test.ts は先頭2件だけ使う */
export const SEEDS = [1, 2, 3, 20261121, 99999, 2 ** 40 + 5]

/** 配列の添字アクセスなどで undefined を除く（非nullアサーション `!` の代わり。テスト用） */
export function defined<T>(v: T | null | undefined, what = '値'): T {
  if (v === undefined || v === null) throw new Error(`${what} が undefined か null`)
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
  const fp = fl.fp ?? { x: 0, y: 0, W: plan.W, H: plan.H } // 板の外のセルは塗れない（はみ出し）
  for (const r of fl.rooms) {
    if (r.x < fp.x || r.y < fp.y || r.x + r.w > fp.x + fp.W || r.y + r.h > fp.y + fp.H) throw new Error(`${r.name} が板(${fp.W}x${fp.H})の外にはみ出している`)
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

/** 2部屋が長さ2セル以上の辺を共有するか（derive.ts の sharedEdge とは別に素朴に書いた独立版） */
export function sharesEdge(a: Room, b: Room): boolean {
  const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0)
  const vert = (a.x + a.w === b.x || b.x + b.w === a.x) && overlap(a.y, a.y + a.h, b.y, b.y + b.h) >= 2
  const horz = (a.y + a.h === b.y || b.y + b.h === a.y) && overlap(a.x, a.x + a.w, b.x, b.x + b.w) >= 2
  return vert || horz
}

/** 辺を共有すべきクラスタ（同じ階に両方あれば隣接していること） */
const CLUSTER_PAIRS: [Room['type'], Room['type'], string][] = [
  ['wash', 'bath', '洗面-浴室'], ['laundry', 'wash', 'ランドリー-洗面'], ['master', 'wic', '主寝室-WIC'], ['ldk', 'kitchen', 'LDK-キッチン'], ['entry', 'doma', '玄関-土間'],
]

/**
 * 独立検証で見つけた違反（なければ空）: 全セルが1部屋で塗られる／居室が外壁に接する／面積が w*h と一致する／
 * クラスタの辺の共有（ランドリー-洗面を含む）／トイレと水回りの接触／階段 x の両階一致／吹抜が LDK の x・y の範囲に収まる
 */
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
    const fp = fl.fp ?? { x: 0, y: 0, W: plan.W, H: plan.H } // validate.ts の floorRect とは別に素朴に書く
    // 板の内側は全セルが1部屋、外側は0部屋
    grid.forEach((row, y) => row.forEach((n, x) => {
      const inside = x >= fp.x && x < fp.x + fp.W && y >= fp.y && y < fp.y + fp.H
      if (n !== (inside ? 1 : 0)) out.push(`${fl.label} (${x},${y}) が${n}部屋`)
    }))
    for (const r of fl.rooms) {
      if (r.area !== r.w * r.h) out.push(`${fl.label} ${r.name}: area が w*h と不一致`)
      if (LIVING.has(r.type) && !(r.x === fp.x || r.y === fp.y || r.x + r.w === fp.x + fp.W || r.y + r.h === fp.y + fp.H)) out.push(`${fl.label} ${r.name}: 居室が外壁に接していない`)
    }
  })
  plan.floors.forEach((fl) => {
    for (const [ta, tb, label] of CLUSTER_PAIRS) {
      const a = fl.rooms.find((r) => r.type === ta)
      const b = fl.rooms.find((r) => r.type === tb)
      if (a && b && !sharesEdge(a, b)) out.push(`${fl.label} ${label} が辺を共有していない`)
    }
  })
  // トイレは、同じ階に浴室・洗面・ランドリーのどれかがあれば、そのいずれかに接する
  plan.floors.forEach((fl) => {
    const wets = fl.rooms.filter((r) => r.type === 'bath' || r.type === 'wash' || r.type === 'laundry')
    if (wets.length === 0) return
    // 浴室・ランドリーがあれば、同じ階に洗面がある（CLUSTER_PAIRS は両方ある場合しか見ないため別に確認）
    if (wets.some((r) => r.type === 'bath' || r.type === 'laundry') && !fl.rooms.some((r) => r.type === 'wash')) {
      out.push(`${fl.label} 浴室・ランドリーがあるのに洗面がない`)
    }
    for (const wc of fl.rooms) {
      if (wc.type === 'wc' && !wets.some((w) => sharesEdge(wc, w))) out.push(`${fl.label} ${wc.name} が水回りに接していない`)
    }
  })
  if (plan.floors.length === 2) {
    const [f1, f2] = plan.floors
    const s1 = f1?.rooms.find((r) => r.type === 'stair')
    const s2 = f2?.rooms.find((r) => r.type === 'stair')
    if (!s1 || !s2) out.push('階段が両階にない')
    else if (s1.x !== s2.x || s1.w !== s2.w) out.push(`階段の x が両階で不一致 (${s1.x}+${s1.w} / ${s2.x}+${s2.w})`)
    const ldk = f1?.rooms.find((r) => r.type === 'ldk')
    const vd = f2?.rooms.find((r) => r.type === 'void')
    if (vd) {
      if (!ldk) out.push('吹抜があるのに1Fに LDK がない')
      else if (vd.x < ldk.x || vd.x + vd.w > ldk.x + ldk.w || vd.y < ldk.y || vd.y + vd.h > ldk.y + ldk.h) {
        out.push('吹抜が LDK の x・y の範囲に収まっていない')
      }
    }
  }
  return out
}
