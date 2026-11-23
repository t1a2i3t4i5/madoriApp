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

/** 部分二階の条件セット（gen-v4-partial fixture・不変条件テストで共有）。先頭3件が人気条件 */
export const PARTIAL_CONDITIONS: { name: string; cfg: PlanConfig }[] = [
  { name: '部分二階: 30坪/個室3', cfg: { ...base, area: 30, floors: 2, rooms: 3, feats: ['kitchenFace', 'wic'], story: 'partial' } },
  { name: '部分二階: 35坪/個室4', cfg: { ...base, area: 35, floors: 2, rooms: 4, feats: ['kitchenFace', 'wic'], story: 'partial' } },
  { name: '部分二階: 32坪/個室2', cfg: { ...base, area: 32, floors: 2, rooms: 2, feats: [], story: 'partial' } },
  { name: '部分二階: 34坪/個室3/吹抜', cfg: { ...base, area: 34, floors: 2, rooms: 3, feats: ['void'], story: 'partial' } },
  { name: '部分二階: 36坪/個室3/土間+パントリー+書斎', cfg: { ...base, area: 36, floors: 2, rooms: 3, feats: ['doma', 'pantry', 'study'], story: 'partial' } },
  { name: '部分二階: 38坪/個室4/ランドリー+和室', cfg: { ...base, area: 38, floors: 2, rooms: 4, feats: ['laundry', 'washitsu', 'kitchenFace'], story: 'partial' } },
]

/** 実現可能性が不可になる条件 */
export const INFEASIBLE: { name: string; cfg: PlanConfig }[] = [
  { name: '20坪/個室5', cfg: { ...base, area: 20, floors: 2, rooms: 5, feats: [] } },
  { name: '平屋+吹抜', cfg: { ...base, area: 30, floors: 1, rooms: 3, feats: ['void'] } },
  { name: '22坪/和室+書斎+個室4', cfg: { ...base, area: 22, floors: 1, rooms: 4, feats: ['washitsu', 'study'] } },
]

/** 実現可能と判定されるのに、検証を通る案が0になる条件（diagnoseEmpty の経路） */
export const ZERO_PLAN: PlanConfig = { ...base, area: 26, floors: 2, rooms: 2, feats: ['doma'] }

/** 0案・3案の境界条件（件数が変わったら気づくために件数を固定する）（GEN_VERSION 4 の実測。先頭3件は短辺の制約を入れても件数が変わらず、末尾の「30坪/平屋/個室5」は短辺の制約で0案になる） */
export const BOUNDARY: { name: string; cfg: PlanConfig; /** generatePlans が全 SEEDS で返す件数（0案なら候補プールも空） */ expected: number }[] = [
  { name: '境界: 36坪/2階/吹抜+個室4+WIC+書斎（0案）', cfg: { ...base, area: 36, floors: 2, rooms: 4, feats: ['void', 'wic', 'study', 'kitchenFace'] }, expected: 0 },
  { name: '境界: 36坪/2階/吹抜+個室4+WIC（3案）', cfg: { ...base, area: 36, floors: 2, rooms: 4, feats: ['void', 'wic', 'kitchenFace'] }, expected: 3 },
  { name: '境界: 26坪/2階/個室2/土間（0案）', cfg: ZERO_PLAN, expected: 0 },
  { name: '境界: 30坪/平屋/個室5（0案: 短辺）', cfg: { ...base, area: 30, floors: 1, rooms: 5, feats: [] }, expected: 0 },
]

/** 末尾の 2**40+5 は 2^32 以上の seed（seed32 の上位ビット経路を通す）。golden.test.ts は先頭2件だけ使う */
export const SEEDS = [1, 2, 3, 20261121, 99999, 2 ** 40 + 5]

/** キー順の違いで落ちないよう、キーをソートして正規化した JSON にする（golden の比較用） */
export function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    }
    return val
  })
}

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

/** 最小の短辺の閾値（rooms.ts の MIN_SHORT とは別に持つ独立実装。R-VERIFY-09） */
const SHORT_MIN: Record<string, number> = {
  master: 6, bed: 5, study: 5, washitsu: 5, bath: 3, wash: 3, wc: 2, laundry: 3,
  kitchen: 3, pantry: 2, wic: 3, closet: 2, entry: 3, doma: 3,
}

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
 * 階の板（fp）の独立検証（types.ts の floorRect・footprintPairs とは別に素朴に書く）:
 * 1F には fp がない／fp は建物に内包される／北寄せ（y=0）／一辺共有の2形のどちらか
 * （東西下屋: H2=H・k=W−W2≥3・W2≥9・階段側の端に寄る、南下屋: W2=W・x=0・k=H−H2≥3・H2≥13）／
 * 階段が 2F の板の stairEnd 側の端にある。総二階（fp なし）は何も言わない
 */
export function footprintViolations(plan: Plan): string[] {
  const out: string[] = []
  if (plan.floors[0]?.fp) out.push('1F に fp がある')
  const fp = plan.floors[1]?.fp
  if (!fp) return out
  const { W, H } = plan
  if (fp.x < 0 || fp.y < 0 || fp.x + fp.W > W || fp.y + fp.H > H) out.push(`2F の板(${fp.x},${fp.y},${fp.W}x${fp.H})が建物(${W}x${H})に内包されていない`)
  if (fp.y !== 0) out.push('2F の板が北寄せ（y=0）でない')
  const ew = fp.H === H && fp.W < W
  const south = fp.W === W && fp.H < H
  if (ew === south) out.push('2F の板が一辺共有の2形（東西下屋・南下屋）のどちらでもない')
  if (ew && (W - fp.W < 3 || fp.W < 9)) out.push(`東西下屋の出(${W - fp.W})か W2(${fp.W}) が下限未満`)
  if (south && (H - fp.H < 3 || fp.H < 13 || fp.x !== 0)) out.push(`南下屋の出(${H - fp.H})か H2(${fp.H}) が下限未満、または x≠0`)
  const ratio = (fp.W * fp.H) / (W * H + fp.W * fp.H)
  if (ratio < 0.35 - 1e-9 || ratio > 0.45 + 1e-9) out.push(`2F 割合 ${ratio.toFixed(3)} が 0.35〜0.45 の外`)
  if (plan.totalArea !== W * H + fp.W * fp.H) out.push('totalArea が各階の板面積の合計と一致しない')
  const stair = plan.floors[1]?.rooms.find((r) => r.type === 'stair')
  if (stair && ew) {
    const e = plan.variant?.stairEnd
    if (e === 'E' && stair.x + stair.w !== W) out.push('階段が東端でない（stairEnd=E）')
    if (e === 'W' && stair.x !== 0) out.push('階段が西端でない（stairEnd=W）')
    if (e === 'E' && fp.x + fp.W !== W) out.push('stairEnd=E なのに 2F の板が東寄せでない')
    if (e === 'W' && fp.x !== 0) out.push('stairEnd=W なのに 2F の板が西寄せでない')
  }
  return out
}

/** 付属収納の持ち主の種別（rooms.ts・closets.ts・favorites.ts とは別に持つ独立実装） */
const OWNER_OK: Record<string, string[]> = {
  closet: ['master', 'bed'],
  store: ['hall', 'wash', 'laundry', 'master', 'bed'],
}

/**
 * 付属収納（Room.of）の独立検証: 持ち主は同じ階にちょうど1つ・辺を共有・種別が許すもの。
 * クローゼットは奥行（短辺）2・長さ4〜8、持ち主のある収納は奥行2。WIC のある主寝室にはクローゼットを付けない
 */
export function ownerViolations(plan: Plan): string[] {
  const out: string[] = []
  for (const fl of plan.floors) {
    for (const r of fl.rooms) {
      if (r.type === 'closet' && !r.of) out.push(`${fl.label} ${r.name}: クローゼットに持ち主がない`)
      if (!r.of) continue
      const ox = r.x + r.of.dx
      const oy = r.y + r.of.dy
      const owners = fl.rooms.filter((q) => q !== r && q.x === ox && q.y === oy)
      const owner = owners[0]
      if (owners.length !== 1 || !owner) {
        out.push(`${fl.label} ${r.name}: 持ち主が1つに定まらない(${owners.length})`)
        continue
      }
      if (!(OWNER_OK[r.type] ?? []).includes(owner.type)) out.push(`${fl.label} ${r.name}(${r.type}) の持ち主の種別 ${owner.type} が不正`)
      if (!sharesEdge(r, owner)) out.push(`${fl.label} ${r.name}: 持ち主と辺を共有していない`)
      const short = Math.min(r.w, r.h)
      const long = Math.max(r.w, r.h)
      if (short !== 2) out.push(`${fl.label} ${r.name}: 奥行 ${short} が2でない`)
      if (r.type === 'closet' && (long < 4 || long > 8)) out.push(`${fl.label} ${r.name}: クローゼットの長さ ${long} が 4〜8 の外`)
      if (r.type === 'closet' && owner.type === 'master' && fl.rooms.some((q) => q.type === 'wic')) out.push(`${fl.label} WIC のある主寝室にクローゼットがある`)
    }
  }
  return out
}

/** 個室（主寝室・洋室）のうち、2×4 以上の付属収納（持ち主がその個室のクローゼット・収納）か、主寝室の隣の WIC がある個室の数と個室の数（独立実装） */
export function privateStorageIndependent(plan: Plan): { with: number; total: number } {
  let w = 0
  let total = 0
  for (const fl of plan.floors) {
    for (const p of fl.rooms) {
      if (p.type !== 'master' && p.type !== 'bed') continue
      total++
      const ok = fl.rooms.some((s) => {
        if (s === p || Math.min(s.w, s.h) < 2 || s.w * s.h < 8 || !sharesEdge(s, p)) return false
        if (s.type === 'wic') return p.type === 'master'
        return (s.type === 'closet' || s.type === 'store') && !!s.of && s.x + s.of.dx === p.x && s.y + s.of.dy === p.y
      })
      if (ok) w++
    }
  }
  return { with: w, total }
}

/** 収納率（R-IDX-02）の独立実装: クローゼット・WIC・パントリー・収納のうち最小の短辺（SHORT_MIN）を満たすものの面積 ÷ 延床 */
export function storageRatioIndependent(plan: Plan): number {
  let sum = 0
  for (const fl of plan.floors) {
    for (const r of fl.rooms) {
      if (!['closet', 'wic', 'pantry', 'store'].includes(r.type)) continue
      if (Math.min(r.w, r.h) >= (SHORT_MIN[r.type] ?? 0)) sum += r.w * r.h
    }
  }
  return sum / (plan.totalArea || 1)
}

/**
 * 独立検証で見つけた違反（なければ空）: 全セルが1部屋で塗られる／居室が外壁に接する／面積が w*h と一致する／
 * 付属収納の持ち主の関係（ownerViolations）／階段とホールの辺の共有／クラスタの辺の共有（ランドリー-洗面を含む）／トイレと水回りの接触／階段 x の両階一致／吹抜が LDK の x・y の範囲に収まる
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
    const fp = fl.fp ?? { x: 0, y: 0, W: plan.W, H: plan.H } // types.ts の floorRect とは別に素朴に書く
    // 板の内側は全セルが1部屋、外側は0部屋
    grid.forEach((row, y) => row.forEach((n, x) => {
      const inside = x >= fp.x && x < fp.x + fp.W && y >= fp.y && y < fp.y + fp.H
      if (n !== (inside ? 1 : 0)) out.push(`${fl.label} (${x},${y}) が${n}部屋`)
    }))
    for (const r of fl.rooms) {
      if (r.area !== r.w * r.h) out.push(`${fl.label} ${r.name}: area が w*h と不一致`)
      const need = SHORT_MIN[r.type]
      if (need !== undefined && (r.w < need || r.h < need)) out.push(`${fl.label} ${r.name}: 短辺 ${Math.min(r.w, r.h)} が最小 ${need} 未満`)
      if (LIVING.has(r.type) && !(r.x === fp.x || r.y === fp.y || r.x + r.w === fp.x + fp.W || r.y + r.h === fp.y + fp.H)) out.push(`${fl.label} ${r.name}: 居室が外壁に接していない`)
    }
  })
  out.push(...footprintViolations(plan))
  out.push(...ownerViolations(plan))
  // 階段はホールと辺を共有する（階段の前を塞がれていない）。carve の到達可能性は VIA を見ないので、ここで補う
  plan.floors.forEach((fl) => {
    const stair = fl.rooms.find((r) => r.type === 'stair')
    const hall = fl.rooms.find((r) => r.type === 'hall')
    if (stair && hall && !sharesEdge(stair, hall)) out.push(`${fl.label} 階段がホールと辺を共有していない`)
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
