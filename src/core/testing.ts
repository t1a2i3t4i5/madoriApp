import type { Plan, PlanConfig, Room } from './types'

/** テスト用の入力条件セット（generate / golden / invariants で共有） */
const base = { parking: 2, garden: 1 }

export const CONDITIONS: { name: string; cfg: PlanConfig }[] = [
  { name: '30坪/2階/個室3', cfg: { ...base, area: 30, floors: 2, rooms: 3, feats: ['kitchenFace', 'wic'] } },
  { name: '30坪/平屋/個室3', cfg: { ...base, area: 30, floors: 1, rooms: 3, feats: ['kitchenFace', 'wic'] } },
  { name: '35坪/2階/個室4', cfg: { ...base, area: 35, floors: 2, rooms: 4, feats: ['kitchenFace', 'wic'] } },
  { name: '平屋/個室2/最小こだわりなし', cfg: { ...base, area: 24, floors: 1, rooms: 2, feats: [] } },
  { name: '32坪/2階/吹抜', cfg: { ...base, area: 32, floors: 2, rooms: 3, feats: ['void'] } },
  { name: '40坪/2階/吹抜+WIC+書斎', cfg: { ...base, area: 40, floors: 2, rooms: 3, feats: ['void', 'wic', 'study', 'kitchenFace'] } },
  { name: '33坪/2階/土間+パントリー', cfg: { ...base, area: 33, floors: 2, rooms: 3, feats: ['doma', 'pantry'] } },
  { name: '30坪/平屋/土間+和室', cfg: { ...base, area: 30, floors: 1, rooms: 3, feats: ['doma', 'washitsu'] } },
  { name: '40坪/2階/全部のせ', cfg: { ...base, area: 40, floors: 2, rooms: 3, feats: ['kitchenFace', 'doma', 'study', 'wic', 'pantry', 'void', 'washitsu', 'laundry'] } },
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

/**
 * 0案・3案の境界条件（件数が変わったら気づくために件数を固定する）（GEN_VERSION 6 の実測。すべて0案）。
 * 「0案: 階段」の3件（36坪/吹抜+個室4+WIC、36坪/吹抜+WIC+書斎、38坪/全部のせ）は、階段を上下で同じ 4×5/4×6 にする制約（GEN_VERSION 6）で
 * 0案になる条件。v5 では 1F の階段が 4×4（どの階段形式も成立しない寸法）か、上下で高さが食い違う案だけを出していた（golden-fixture.test.ts の移行検証で確かめる）。
 * 30坪/平屋/個室5 は短辺（GEN_VERSION 4）で0案。CONDITIONS には、これらの代わりに v6 でも3案が出る 40坪の同種の条件を置いた
 */
export const BOUNDARY: { name: string; cfg: PlanConfig; /** generatePlans が全 SEEDS で返す件数（0案なら候補プールも空） */ expected: number }[] = [
  { name: '境界: 36坪/2階/吹抜+個室4+WIC+書斎（0案）', cfg: { ...base, area: 36, floors: 2, rooms: 4, feats: ['void', 'wic', 'study', 'kitchenFace'] }, expected: 0 },
  { name: '境界: 36坪/2階/吹抜+個室4+WIC（0案: 階段）', cfg: { ...base, area: 36, floors: 2, rooms: 4, feats: ['void', 'wic', 'kitchenFace'] }, expected: 0 },
  { name: '境界: 36坪/2階/吹抜+WIC+書斎（0案: 階段）', cfg: { ...base, area: 36, floors: 2, rooms: 3, feats: ['void', 'wic', 'study', 'kitchenFace'] }, expected: 0 },
  { name: '境界: 38坪/2階/全部のせ（0案: 階段）', cfg: { ...base, area: 38, floors: 2, rooms: 3, feats: ['kitchenFace', 'doma', 'study', 'wic', 'pantry', 'void', 'washitsu', 'laundry'] }, expected: 0 },
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
 * 付属収納の持ち主の関係（ownerViolations）／階段の矩形の一致と口の辺・ホールの長さ／クラスタの辺の共有（ランドリー-洗面を含む）／トイレと水回りの接触／吹抜が LDK の x・y の範囲に収まる
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
  // 階段の矩形の両階一致・4×5/4×6・口の辺の全幅（GEN_VERSION 6）、ホールの長さ
  out.push(...stairViolations(plan), ...hallViolations(plan))
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

/* ---------------- GEN_VERSION 6: 階段・廊下の独立検証と計測（stair.ts・circulation.ts・validate.ts とは別に素朴に書く） ---------------- */

/** 階段の口の辺に開口でつながってよい種別（derive.ts の STAIR_OPEN_TYPES とは別に持つ独立定義） */
const OPEN_TYPES = new Set(['hall', 'entry', 'doma', 'ldk'])

/** (x, y) を含む部屋（セル塗りで引く） */
function roomAt(rooms: readonly Room[], x: number, y: number): Room | undefined {
  return rooms.find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)
}

/**
 * 階段の独立検証（2階建て）: 両階で x・y・幅・高さが一致／短辺 4・長辺 5〜6／口の辺（南）の全セルが開口でつながる部屋
 * （ホール・玄関・土間・LDK）に接し、その連なりが2セル以上（開口が成り立つ）
 */
export function stairViolations(plan: Plan): string[] {
  const out: string[] = []
  if (plan.floors.length !== 2) return out
  const stairs = plan.floors.map((f) => f.rooms.find((r) => r.type === 'stair'))
  const [s1, s2] = stairs
  if (!s1 || !s2) return ['階段が両階にない']
  if (s1.x !== s2.x || s1.y !== s2.y || s1.w !== s2.w || s1.h !== s2.h) out.push(`階段の矩形が両階で不一致 (${s1.x},${s1.y},${s1.w}x${s1.h} / ${s2.x},${s2.y},${s2.w}x${s2.h})`)
  if (s1.w !== 4 || (s1.h !== 5 && s1.h !== 6)) out.push(`階段が 4×5 / 4×6 でない (${s1.w}x${s1.h})`)
  plan.floors.forEach((fl, f) => {
    const s = stairs[f]
    if (!s) return
    let run = 0
    let minRun = Infinity
    for (let x = s.x; x <= s.x + s.w; x++) {
      const r = x < s.x + s.w ? roomAt(fl.rooms, x, s.y + s.h) : undefined
      if (r && OPEN_TYPES.has(r.type)) run++
      else {
        if (run > 0) minRun = Math.min(minRun, run)
        if (x < s.x + s.w) out.push(`${fl.label} 階段の口の辺 x=${x} が開口でつながる部屋に接していない`)
        run = 0
      }
    }
    if (minRun < 2) out.push(`${fl.label} 階段の口の辺の連なりが2セル未満`)
  })
  return out
}

/** 階段の扉・開口の独立検証（R-DOOR-04・R-DOOR-13・R-DOOR-14）: 階段に付くのは kind 'open' だけで、相手はホール・玄関・土間・LDK だけ。開口に葉・弧がない */
export function stairDoorViolations(plan: Plan, doorsOf: (rooms: Room[]) => { a: Room; b: Room; kind?: string; swing: { rect: { w: number; h: number } } }[]): string[] {
  const out: string[] = []
  for (const fl of plan.floors) {
    for (const d of doorsOf(fl.rooms)) {
      const other = d.a.type === 'stair' ? d.b : d.b.type === 'stair' ? d.a : null
      if (!other) {
        if (d.kind === 'open') out.push(`${fl.label} 階段以外に開口がある`)
        continue
      }
      if (d.kind !== 'open') out.push(`${fl.label} 階段に扉（${d.kind ?? 'swing'}）が付いている`)
      if (!OPEN_TYPES.has(other.type)) out.push(`${fl.label} 階段と ${other.type} の間に開口・扉がある`)
      if (d.swing.rect.w !== 0 || d.swing.rect.h !== 0) out.push(`${fl.label} 階段の開口に弧の矩形がある`)
    }
  }
  return out
}

/**
 * 動線のガード G1〜G4 の独立検証（doorsOf で得た、ドア・開口でつながる相手の種別から判定する）。
 * G3 は strictBed に従う（true: 主寝室・洋室はホール・玄関・土間から。和室・書斎は LDK も可）
 */
export function guardViolationsIndependent(
  plan: Plan,
  doorsOf: (rooms: Room[]) => { a: Room; b: Room }[],
  strictBed = true,
): string[] {
  const out: string[] = []
  for (const fl of plan.floors) {
    const ds = doorsOf(fl.rooms)
    const around = (r: Room) => ds.flatMap((d) => (d.a === r ? [d.b] : d.b === r ? [d.a] : []))
    const circ = (r: Room) => around(r).some((n) => n.type === 'hall' || n.type === 'entry' || n.type === 'doma')
    const ldk = (r: Room) => around(r).some((n) => n.type === 'ldk')
    for (const r of fl.rooms) {
      if (r.type === 'wc' && !circ(r)) out.push(`${fl.label} G1 ${r.name}`)
      if (r.type === 'wash' && !circ(r) && !ldk(r)) out.push(`${fl.label} G2 ${r.name}`)
      if ((r.type === 'master' || r.type === 'bed') && !circ(r) && !(!strictBed && ldk(r))) out.push(`${fl.label} G3 ${r.name}`)
      if ((r.type === 'washitsu' || r.type === 'study') && !circ(r) && !ldk(r)) out.push(`${fl.label} G3 ${r.name}`)
    }
    const stair = fl.rooms.find((r) => r.type === 'stair')
    const entry = fl.rooms.find((r) => r.type === 'entry') ?? fl.rooms.find((r) => r.type === 'doma')
    if (stair && entry) {
      const direct = around(entry).includes(stair)
      const viaHall = around(entry).some((n) => n.type === 'hall' && around(n).includes(stair))
      if (!direct && !viaHall) out.push(`${fl.label} G4 玄関から階段へ LDK を通らずに行けない`)
    }
  }
  return out
}

/** ホールの独立検証: 各階に1つ以上、長さ（幅）4 以上 */
export function hallViolations(plan: Plan): string[] {
  const out: string[] = []
  for (const fl of plan.floors) {
    const halls = fl.rooms.filter((r) => r.type === 'hall')
    if (halls.length !== 1) out.push(`${fl.label} ホールが ${halls.length} 個`)
    for (const h of halls) if (h.w < 4) out.push(`${fl.label} ホールの長さ ${h.w} が4未満`)
  }
  return out
}

/** 廊下率（ホール面積 ÷ 延床。独立実装） */
export function hallRatioIndependent(plan: Plan): number {
  let hall = 0
  for (const fl of plan.floors) for (const r of fl.rooms) if (r.type === 'hall') hall += r.w * r.h
  return hall / (plan.totalArea || 1)
}

/** 2F に、2F の板の全幅のホールがあるか */
export function fullWidthHall2F(plan: Plan): boolean {
  const fl = plan.floors[1]
  if (!fl) return false
  const fp = fl.fp ?? { x: 0, y: 0, W: plan.W, H: plan.H }
  return fl.rooms.some((r) => r.type === 'hall' && r.w === fp.W)
}

/**
 * 直下率（R-IDX-09 の測り方）: 2F の間仕切り（板の外周以外の部屋の辺。吹抜の辺は数えない）を単位長の壁片に分け、
 * 1F の壁（部屋の辺。外周を含む）の真上にある壁片の割合。2階建てだけ。間仕切りが無ければ NaN
 */
export function chokkaRate(plan: Plan): number {
  const f1 = plan.floors[0]
  const f2 = plan.floors[1]
  if (!f1 || !f2) return NaN
  const segs = (rooms: readonly Room[], skip?: (r: Room) => boolean): Set<string> => {
    const s = new Set<string>()
    for (const r of rooms) {
      if (skip?.(r)) continue
      for (let x = r.x; x < r.x + r.w; x++) {
        s.add(`h${x},${r.y}`)
        s.add(`h${x},${r.y + r.h}`)
      }
      for (let y = r.y; y < r.y + r.h; y++) {
        s.add(`v${r.x},${y}`)
        s.add(`v${r.x + r.w},${y}`)
      }
    }
    return s
  }
  const lower = segs(f1.rooms)
  const fp = f2.fp ?? { x: 0, y: 0, W: plan.W, H: plan.H }
  const upper = segs(f2.rooms, (r) => r.type === 'void')
  let total = 0
  let on = 0
  for (const k of upper) {
    const [, a = '', b = ''] = /^[hv](\d+),(\d+)$/.exec(k) ?? []
    const x = Number(a)
    const y = Number(b)
    const outer = k[0] === 'h' ? y === fp.y || y === fp.y + fp.H : x === fp.x || x === fp.x + fp.W
    if (outer) continue
    // 吹抜と接する壁片は数えない（吹抜の辺は 2F の間仕切りではない）
    const vd = f2.rooms.find((r) => r.type === 'void')
    if (vd) {
      const onVoid = k[0] === 'h'
        ? x >= vd.x && x < vd.x + vd.w && (y === vd.y || y === vd.y + vd.h)
        : y >= vd.y && y < vd.y + vd.h && (x === vd.x || x === vd.x + vd.w)
      if (onVoid) continue
    }
    total++
    if (lower.has(k)) on++
  }
  return total ? on / total : NaN
}

/** 分位点（測定スクリプトと同じ定義: 昇順の添字 floor(p*(n-1)+0.5)）。空なら NaN */
export function quantile(xs: readonly number[], p: number): number {
  if (xs.length === 0) return NaN
  const s = xs.slice().sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))] ?? NaN
}

/**
 * 居室ごとの、窓（main）がある方位の独立実装（windows.ts の computeWindows とは別に、セルの外側が板の外かで素朴に数える）。
 * 外壁に接するセルが2つ以上ある面に窓が付く（R-WIN-07）。返り値は階ごと・居室ごとの方位の文字列（例 'NE'）
 */
export function windowSidesIndependent(plan: Plan): { floor: number; room: Room; sides: string }[] {
  const out: { floor: number; room: Room; sides: string }[] = []
  plan.floors.forEach((fl, f) => {
    const rc = fl.fp ?? { x: 0, y: 0, W: plan.W, H: plan.H }
    for (const r of fl.rooms) {
      if (!LIVING.has(r.type)) continue
      let n = 0, s = 0, e = 0, w = 0
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (y - 1 < rc.y) n++
          if (y + 1 >= rc.y + rc.H) s++
          if (x - 1 < rc.x) w++
          if (x + 1 >= rc.x + rc.W) e++
        }
      }
      out.push({ floor: f, room: r, sides: `${n >= 2 ? 'N' : ''}${s >= 2 ? 'S' : ''}${e >= 2 ? 'E' : ''}${w >= 2 ? 'W' : ''}` })
    }
  })
  return out
}

/**
 * 居室ごとの通風レベル（A/B/C）の独立実装（windows.ts の windowStats とは別に書く）。
 * A = 居室の main の窓が2方位以上／B = そうでなくても、ドア・開口でつながる共用部（ホール・玄関・土間・階段・LDK）をたどって、
 * 居室自身にない方位の窓（共用部は main・小窓）に届く／C = どちらもない。
 * 窓の有無は、外壁に接するセルが2つ以上ある面（R-WIN-07）。玄関（findEntry と同じ順: 玄関 → 土間 → 階段）の南の小窓は、
 * 外開きドアの区間を除いた残りが 1.4 セル以上ないと消える（place の l = 残り − 0.4 ≥ 1）。
 * ドアのつながり（doorsOf）と玄関ドアの矩形（entryDoorX）は呼び出し側が渡す（derive.ts を core/testing に依存させない）
 */
export function ventLevelsIndependent(
  plan: Plan,
  doorsOf: (rooms: Room[]) => { a: Room; b: Room }[],
  entryDoorX: (entry: Room, bottom: number) => { x: number; w: number },
): { floor: number; room: Room; level: 'A' | 'B' | 'C' }[] {
  const shared = new Set(['hall', 'entry', 'doma', 'stair', 'ldk'])
  const out: { floor: number; room: Room; level: 'A' | 'B' | 'C' }[] = []
  plan.floors.forEach((fl, f) => {
    const rc = fl.fp ?? { x: 0, y: 0, W: plan.W, H: plan.H }
    const entry = fl.rooms.find((r) => r.type === 'entry') ?? fl.rooms.find((r) => r.type === 'doma') ?? fl.rooms.find((r) => r.type === 'stair')
    /** 部屋 r の、窓（main または共用部の小窓）がある方位 */
    const sidesOf = (r: Room, includeSmall: boolean): Set<string> => {
      const s = new Set<string>()
      const cnt = { N: 0, S: 0, E: 0, W: 0 }
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (y - 1 < rc.y) cnt.N++
          if (y + 1 >= rc.y + rc.H) cnt.S++
          if (x - 1 < rc.x) cnt.W++
          if (x + 1 >= rc.x + rc.W) cnt.E++
        }
      }
      const main = LIVING.has(r.type)
      if (!main && !includeSmall) return s
      for (const k of ['N', 'S', 'E', 'W'] as const) {
        if (cnt[k] < 2) continue
        if (!main && r === entry && k === 'S') {
          const d = entryDoorX(r, rc.y + rc.H)
          const left = d.x - r.x
          const right = r.x + r.w - (d.x + d.w)
          if (Math.max(left, right) < 1.4) continue
        }
        s.add(k)
      }
      return s
    }
    const adj = new Map<Room, Room[]>()
    for (const d of doorsOf(fl.rooms)) {
      adj.set(d.a, [...(adj.get(d.a) ?? []), d.b])
      adj.set(d.b, [...(adj.get(d.b) ?? []), d.a])
    }
    for (const r of fl.rooms) {
      if (!LIVING.has(r.type)) continue
      const own = sidesOf(r, false)
      let level: 'A' | 'B' | 'C' = own.size >= 2 ? 'A' : 'C'
      if (level === 'C') {
        const seen = new Set<Room>([r])
        const stack = [r]
        const reach = new Set(own)
        for (let cur = stack.pop(); cur; cur = stack.pop()) {
          for (const nb of adj.get(cur) ?? []) {
            if (seen.has(nb) || !shared.has(nb.type)) continue
            seen.add(nb)
            stack.push(nb)
            sidesOf(nb, true).forEach((s) => reach.add(s))
          }
        }
        if (reach.size > own.size) level = 'B'
      }
      out.push({ floor: f, room: r, level })
    }
  })
  return out
}

/**
 * 部屋配置の重なりの独立実装（similarity.ts の overlap とは別の計算法: 標本点ごとに部屋を総当たりで探し、反転は板と部屋の x を折り返す）。
 * 粗い種別の表も別に持つ
 */
const COARSE_INDEPENDENT: Record<string, string> = {
  master: 'S', bed: 'S', study: 'S', washitsu: 'S',
  bath: 'W', wash: 'W', wc: 'W', laundry: 'W',
  pantry: 'R', wic: 'R', store: 'R', closet: 'R',
  ldk: 'L', kitchen: 'L', entry: 'E', doma: 'E', hall: 'H', stair: 'T', void: 'V',
}
export function overlapIndependent(a: Plan, b: Plan, n = 24): number {
  const kindAt = (p: Plan, f: number, u: number, v: number, mirror: boolean): string | null => {
    const fl = p.floors[f]
    if (!fl) return null
    const rc = fl.fp ?? { x: 0, y: 0, W: p.W, H: p.H }
    // 反転は板と部屋の x を折り返した座標系で判定する
    const fx = (x: number, w: number) => (mirror ? p.W - x - w : x)
    const px = fx(rc.x, rc.W) + u * rc.W
    const py = rc.y + v * rc.H
    const r = fl.rooms.find((q) => fx(q.x, q.w) <= px && px < fx(q.x, q.w) + q.w && q.y <= py && py < q.y + q.h)
    return r ? (COARSE_INDEPENDENT[r.type] ?? null) : null
  }
  const floors = Math.max(a.floors.length, b.floors.length)
  const score = (a: Plan, b: Plan, mirror: boolean): number => {
    let hit = 0
    for (let f = 0; f < floors; f++) {
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const ka = kindAt(a, f, (i + 0.5) / n, (j + 0.5) / n, false)
          const kb = kindAt(b, f, (i + 0.5) / n, (j + 0.5) / n, mirror)
          if (ka !== null && ka === kb) hit++
        }
      }
    }
    return hit
  }
  const best = (x: Plan, y: Plan) => Math.max(score(x, y, false), score(x, y, true))
  return (best(a, b) + best(b, a)) / (2 * floors * n * n)
}

/**
 * 概念キー K3 の独立実装（similarity.ts の conceptKey とは別の計算法: 南の辺の上のセルを列ごとに走査し、反転は列の並びを逆にして比べる）。
 * 同じ定義の文字列を返す（K2 は全階の南面の並びを、反転で小さい方に正規化）
 */
export function conceptKeyIndependent(plan: Plan): string {
  const head: Record<string, string | null> = {
    wic: 'master', kitchen: 'ldk', pantry: 'ldk', doma: 'entry', bath: 'wash', laundry: 'wash', store: null, closet: null, hall: null,
  }
  const perFloor = plan.floors.map((fl, f) => {
    const rc = fl.fp ?? { x: 0, y: 0, W: plan.W, H: plan.H }
    const seq: string[] = []
    for (let x = rc.x; x < rc.x + rc.W; x++) {
      const r = fl.rooms.find((q) => q.x <= x && x < q.x + q.w && q.y <= rc.y + rc.H - 1 && rc.y + rc.H - 1 < q.y + q.h)
      if (!r) continue
      const t = r.type in head ? head[r.type] : r.type
      if (t && seq[seq.length - 1] !== t) seq.push(t)
    }
    void f
    return seq
  })
  const a = perFloor.map((s) => s.join('>')).join('/')
  const b = perFloor.map((s) => s.slice().reverse().join('>')).join('/')
  const k2 = a < b || a === b ? a : b
  const f1 = plan.floors[0]?.rooms ?? []
  const find = (t: string) => f1.find((r) => r.type === t)
  const cx = (r: Room) => r.x + r.w / 2
  // 板の中心から幅の 1/6 以内なら中央
  const zone = (r: Room): number => (Math.abs(cx(r) - plan.W / 2) <= plan.W / 6 ? 0 : cx(r) < plan.W / 2 ? -1 : 1)
  const rel = (r: Room | undefined): string => {
    if (!r) return '-'
    const z = zone(r)
    if (z === 0) return 'C'
    const l = find('ldk')
    if (!l) return 'X'
    const lz = zone(l)
    return lz === 0 ? 'X' : lz === z ? '=' : '!'
  }
  const wash = find('wash')
  const wy = wash ? (wash.y + wash.h / 2 < plan.H / 2 ? 'N' : 'S') : ''
  return `${k2}|st${rel(find('stair'))}|ws${rel(wash)}${wy}`
}
