import { backDoorCandidates, type BackDoor } from './backdoor'
import { findEntry } from './rooms'
import type { Plan, PlanConfig } from './types'

/**
 * 敷地の配置（R-IN-05・R-IN-06・R-IN-07。品質改善8件目、R-EXT-12 の L1）。純関数・フレームワーク非依存。
 * 敷地寸法は入力にせず、建物（1F の板）と駐車・庭の入力から導く。**生成・スコア・名前・タグ・explainPlan には一切効かない**
 * （配置図と敷地の文のためだけにある。固定3帯では玄関・LDK が常に南帯＝道路側にあるため、生成に効かせる余地が小さい）。
 *
 * 座標は建物（1F の板）の左上を原点とするセル（1セル = 455mm）。敷地は建物の外側に広がるので x・y は負になりうる。道路は南（y 大）。
 * 数値は［暫定］（描画の見た目と敷地の目安の妥当さで調整する。R-DRAW-24 と同じ扱い）。
 */

export interface SiteRect { x: number; y: number; w: number; h: number }
export interface SiteSeg { x1: number; y1: number; x2: number; y2: number }

/** 駐車枠 6×11 セル（2.73×5.0m） */
export const CAR_W = 6
export const CAR_D = 11
/** 玄関前のポーチ（2×2）と通路の幅 */
export const PORCH = 2
/** 建物の北・東西の余白（0.9m） */
export const MARGIN = 2
/** 庭を横へ回り込ませる側の余白 */
export const WRAP_MARGIN = 4
/** 庭の奥行（なし・小さめ・広め）。なしは前庭の最小の奥行 */
export const GARDEN_DEPTH = [4, 7, 11] as const
/** ウッドデッキの奥行・最大幅 */
export const DECK_D = 2
export const DECK_MAX_W = 8
/** LDK の南面の空き間口の下限（庭なし・庭あり）。下回るときは駐車を建物の横へ出す */
export const MIN_FREE = 4
export const MIN_FREE_GARDEN = 6
/** 物干し場（勝手口の外。サービスヤード）の奥行（建物から離れる向き）・長さ（物干し竿 1 本分）［暫定］。R-IN-09 */
export const DRY_D = 4
export const DRY_L = 6

export interface SiteCar extends SiteRect {
  /** front = 前庭に並べる／side = 建物の横（敷地を広げて置く） */
  mode: 'front' | 'side'
}

export interface SiteLayout {
  /** 敷地（建物・駐車・庭を内包する矩形） */
  lot: SiteRect
  building: SiteRect
  cars: SiteCar[]
  /** 玄関前のポーチ（玄関の南外壁に接する 2×2）。玄関が南の外壁に接しない案は null */
  porch: SiteRect | null
  /** アプローチの通路（ポーチを除く。駐車または道路からポーチまで） */
  approach: SiteRect[]
  /** 庭（駐車・アプローチ・ポーチ・デッキを除いた矩形の集まり。庭なしは空） */
  garden: SiteRect[]
  /** ウッドデッキ（庭ありで LDK の南面に空き間口があるとき） */
  deck: SiteRect | null
  /** 庭なしのときの目隠しの生け垣（敷地の南の境界の線。LDK の南面の空き間口の前） */
  hedge: SiteSeg[]
  /** 駐車・アプローチの側 = 玄関のある側 */
  side: 'W' | 'E'
  /** 庭を LDK の横へ回り込ませたか（LDK が side と反対の角にあるとき） */
  wrap: boolean
  /** LDK の南面のうち、前庭に並べた駐車にかからない間口（セル） */
  ldkFreeFront: number
  /** 前庭の奥行（セル） */
  frontDepth: number
  /**
   * 勝手口（洗濯機の部屋の東西の外壁、なければ 1F ホールの東西の端。R-FLOW-07）。物干し場が置けない案は null。
   * `computeDoors`・スコアには入れない
   */
  backDoor: BackDoor | null
  /** 物干し場（勝手口の外の建物の横。DRY_D × DRY_L）。backDoor がなければ null（庭ありならデッキが代わり） */
  drying: SiteRect | null
  /** 物干し場を置くのに必要な敷地の間口の広げ幅（セル。広げなくてよければ 0）。観測値のみで lot.w には含まれない（含めるのは描画と同時の PR-L2） */
  lotWidenByDrying: number
}

const clamp02 = (v: number) => Math.max(0, Math.min(2, Math.round(Number.isFinite(v) ? v : 0)))

/** 矩形 r から hole を引いた残り（高々4矩形） */
function subtract(r: SiteRect, hole: SiteRect): SiteRect[] {
  const ix0 = Math.max(r.x, hole.x)
  const ix1 = Math.min(r.x + r.w, hole.x + hole.w)
  const iy0 = Math.max(r.y, hole.y)
  const iy1 = Math.min(r.y + r.h, hole.y + hole.h)
  if (ix0 >= ix1 || iy0 >= iy1) return [r]
  const out: SiteRect[] = []
  if (iy0 > r.y) out.push({ x: r.x, y: r.y, w: r.w, h: iy0 - r.y })
  if (iy1 < r.y + r.h) out.push({ x: r.x, y: iy1, w: r.w, h: r.y + r.h - iy1 })
  if (ix0 > r.x) out.push({ x: r.x, y: iy0, w: ix0 - r.x, h: iy1 - iy0 })
  if (ix1 < r.x + r.w) out.push({ x: ix1, y: iy0, w: r.x + r.w - ix1, h: iy1 - iy0 })
  return out
}

const overlapLen = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/** 敷地の配置を決める。部分二階・平屋も 1F の板で同じ（2F は関係しない） */
export function siteLayout(plan: Pick<Plan, 'W' | 'H' | 'floors'>, cfg: Pick<PlanConfig, 'parking' | 'garden'>): SiteLayout {
  const { W, H } = plan
  const rooms = plan.floors[0]?.rooms ?? []
  const entry = findEntry(rooms)
  const ldk = rooms.find((r) => r.type === 'ldk')
  const n = clamp02(cfg.parking)
  const garden = clamp02(cfg.garden)

  // 1. 側の決定: 玄関の中心が建物の西半分なら W、そうでなければ E
  const side: 'W' | 'E' = entry && entry.x + entry.w / 2 < W / 2 ? 'W' : 'E'
  const lx0 = ldk ? ldk.x : 0
  const lx1 = ldk ? ldk.x + ldk.w : 0
  const ldkW = lx1 - lx0

  // 3. 駐車: side の端から前庭に並べる。LDK の空き間口が足りなくなる台は建物の横へ出す
  const blockSpan = (k: number): [number, number] => (side === 'W' ? [0, CAR_W * k] : [W - CAR_W * k, W])
  const freeAt = (k: number) => {
    const [b0, b1] = blockSpan(k)
    return ldkW - overlapLen(lx0, lx1, b0, b1)
  }
  const minFree = garden > 0 ? MIN_FREE_GARDEN : MIN_FREE
  let nFront = 0
  for (let k = n; k >= 1; k--) {
    if (freeAt(k) >= minFree) { nFront = k; break }
  }
  const nSide = n - nFront
  const ldkFreeFront = freeAt(nFront)

  // 2. 余白と前庭の奥行（前庭に駐車があるときはポーチの分も確保する）
  const gd = GARDEN_DEPTH[garden] ?? GARDEN_DEPTH[0]
  const D = nFront > 0 ? Math.max(gd, CAR_D + PORCH) : gd
  const wrap = garden > 0 && !!ldk && (side === 'W' ? ldk.x + ldk.w === W : ldk.x === 0)
  const mSide = MARGIN + CAR_W * nSide
  const mOpp = wrap ? WRAP_MARGIN : MARGIN
  // 庭の範囲の基準（物干し場による拡幅は含めない。庭の形は物干し場の有無で変えない）
  const x0 = side === 'W' ? -mSide : -mOpp
  const x1 = side === 'W' ? W + mOpp : W + mSide
  const building: SiteRect = { x: 0, y: 0, w: W, h: H }

  const carY = H + D - CAR_D
  const cars: SiteCar[] = []
  for (let i = 0; i < nFront; i++) {
    cars.push({ x: side === 'W' ? CAR_W * i : W - CAR_W * (i + 1), y: carY, w: CAR_W, h: CAR_D, mode: 'front' })
  }
  for (let j = 0; j < nSide; j++) {
    cars.push({ x: side === 'W' ? -(MARGIN + CAR_W * (j + 1)) : W + MARGIN + CAR_W * j, y: carY, w: CAR_W, h: CAR_D, mode: 'side' })
  }

  // 3b. 勝手口と物干し場（R-FLOW-07・R-IN-09）: 候補を先頭から試し、最初に物干し場が置けるものを採る。
  // 横付けの駐車と y が重なる側は置けない。その側の余白が DRY_D 未満なら敷地を広げる
  let backDoor: BackDoor | null = null
  let drying: SiteRect | null = null
  let lotWidenByDrying = 0
  const sideCars = cars.filter((c) => c.mode === 'side')
  for (const bd of backDoorCandidates(plan, side)) {
    const dy0 = Math.max(0, Math.min(Math.round(bd.y - 1), H - DRY_L))
    const dh = Math.min(DRY_L, H - dy0)
    if (dh < 2) continue
    if (bd.side === side && sideCars.some((c) => overlapLen(dy0, dy0 + dh, c.y, c.y + c.h) > 0)) continue
    backDoor = bd
    drying = { x: bd.side === 'W' ? -DRY_D : W, y: dy0, w: DRY_D, h: dh }
    const have = bd.side === 'W' ? -x0 : x1 - W
    if (have < DRY_D) {
      // 観測値のみ。lot には含めない（敷地図に物干し場が描かれる PR-L2 で、描画と同時に lot へ含める）
      lotWidenByDrying = DRY_D - have
    }
    break
  }
  const lot: SiteRect = { x: x0, y: -MARGIN, w: x1 - x0, h: H + D + MARGIN }

  // 4. アプローチ: 玄関の南外壁の前のポーチ + 駐車（なければ道路）からの通路
  let porch: SiteRect | null = null
  const approach: SiteRect[] = []
  if (entry && entry.y + entry.h === H) {
    const pw = Math.min(PORCH, entry.w)
    porch = { x: entry.x + Math.floor((entry.w - pw) / 2), y: H, w: pw, h: PORCH }
    const px0 = porch.x
    const px1 = porch.x + porch.w
    if (n === 0) {
      if (D > PORCH) approach.push({ x: px0, y: H + PORCH, w: pw, h: D - PORCH })
    } else if (nSide > 0) {
      // 建物の横の台から、玄関の前の行（y = H〜H+2）を通ってポーチへ。台の y 範囲がその行に届くときは台の横から、
      // 届かない（前庭に台があって D が深い）ときは台の上に重ねずに台の上の行から始める
      const beside = carY <= H && carY + CAR_D >= H + PORCH
      if (side === 'W') {
        const sx = beside ? -MARGIN : -MARGIN - 2
        approach.push({ x: sx, y: H, w: px0 - sx, h: PORCH })
      } else {
        const ex = beside ? W + MARGIN : W + MARGIN + 2
        approach.push({ x: px1, y: H, w: ex - px1, h: PORCH })
      }
    } else {
      // 前庭だけ: ポーチが駐車の列の真上にあるときは通路なし。なければ列の上の行（台の上端に接する）を通る
      const [b0, b1] = blockSpan(nFront)
      if (!(px0 < b1 && b0 < px1)) {
        if (side === 'W') approach.push({ x: b1 - 2, y: H, w: px0 - (b1 - 2), h: PORCH })
        else approach.push({ x: px1, y: H, w: b0 + 2 - px1, h: PORCH })
      }
    }
  }

  // 6. デッキ: 庭ありのとき、LDK の南面の空き間口の前に奥行2・幅 = 空き間口（最大 8）
  let deck: SiteRect | null = null
  if (garden > 0 && ldk && ldkFreeFront > 0) {
    const [b0, b1] = blockSpan(nFront)
    let a0 = side === 'W' ? Math.max(lx0, b1) : lx0
    let a1 = side === 'W' ? lx1 : Math.min(lx1, b0)
    // ポーチ・通路と重ならない最長の区間に絞る
    const obstacles = [...(porch ? [porch] : []), ...approach].filter((o) => o.y < H + DECK_D)
    for (const o of obstacles) {
      if (o.x < a1 && a0 < o.x + o.w) {
        const left = o.x - a0
        const right = a1 - (o.x + o.w)
        if (left >= right) a1 = o.x
        else a0 = o.x + o.w
      }
    }
    const len = Math.min(DECK_MAX_W, a1 - a0)
    if (len >= 2) deck = { x: a0 + Math.floor((a1 - a0 - len) / 2), y: H, w: len, h: DECK_D }
  }

  // 5. 庭: 前庭のうち駐車・アプローチ・ポーチ・デッキを除いた部分（LDK の前を含む）。LDK が反対の角なら横へ回り込む
  let gardenRects: SiteRect[] = []
  if (garden > 0) {
    const [b0, b1] = blockSpan(nFront)
    const gx0 = side === 'W' ? (nFront > 0 ? b1 : -MARGIN) : x0
    const gx1 = side === 'W' ? x1 : (nFront > 0 ? b0 : W + MARGIN)
    // 庭の奥行は入力（小さめ7・広め11）。前庭が駐車の奥行で深いときは、残りは庭にせず前庭のまま
    gardenRects = [{ x: gx0, y: H, w: gx1 - gx0, h: Math.min(gd, D) }]
    for (const hole of [...(porch ? [porch] : []), ...approach, ...(deck ? [deck] : [])]) {
      gardenRects = gardenRects.flatMap((r) => subtract(r, hole))
    }
    if (wrap && ldk) gardenRects.push({ x: side === 'W' ? W : -WRAP_MARGIN, y: ldk.y, w: WRAP_MARGIN, h: H - ldk.y })
    // 回り込みの帯と物干し場が重なる分は、物干し場を優先して庭から外す
    if (drying) gardenRects = gardenRects.flatMap((r) => subtract(r, drying as SiteRect))
  }

  // 7. 植栽（目隠し）: 庭なしのとき、LDK の南面の空き間口の前の敷地境界に生け垣の線
  const hedge: SiteSeg[] = []
  if (garden === 0 && ldk && ldkFreeFront > 0) {
    const [b0, b1] = blockSpan(nFront)
    const a0 = side === 'W' ? Math.max(lx0, b1) : lx0
    const a1 = side === 'W' ? lx1 : Math.min(lx1, b0)
    if (a1 > a0) hedge.push({ x1: a0, y1: H + D, x2: a1, y2: H + D })
  }

  return { lot, building, cars, porch, approach, garden: gardenRects, deck, hedge, side, wrap, ldkFreeFront, frontDepth: D, backDoor, drying, lotWidenByDrying }
}

export interface SiteStats {
  /** LDK の南面のうち前庭の駐車にかからない間口（セル） */
  ldkFreeFront: number
  /** R-WIN-05: LDK の南面から道路までの前庭の奥行（セル）。駐車が前庭にあると奥行が増える */
  ldkFrontDepth: number
  /**
   * R-WIN-05: LDK の南面（幅 = 1）を道路から隔てるものの内訳（合計 1。LDK がなければすべて 0）。
   * 前庭の駐車がかかる割合・庭で隔てる割合（庭あり）・生け垣だけで隔てる割合（庭なし）。案ごとに変わる
   */
  ldkByCar: number
  ldkByGarden: number
  ldkByHedge: number
  /** 前庭に並べた台数・建物の横に出した台数 */
  carMode: { front: number; side: number }
  /** 物干し場の側（勝手口の側。物干し場がなければ null）と、物干し場による敷地の間口の拡幅（セル）。観測のみ */
  dryingSide: 'W' | 'E' | null
  lotWidenByDrying: number
  /** 敷地の目安（坪・間口と奥行のセル数） */
  lotArea: number
  lotW: number
  lotH: number
}

/** 敷地の観測（スコアにはしない。R-EVAL-13 の観測項目「道路からの視線」の基準値） */
export function siteStats(plan: Pick<Plan, 'W' | 'H' | 'floors'>, cfg: Pick<PlanConfig, 'parking' | 'garden'>): SiteStats {
  const L = siteLayout(plan, cfg)
  const ldk = plan.floors[0]?.rooms.find((r) => r.type === 'ldk')
  const w = ldk && ldk.w > 0 ? ldk.w : 0
  const byCar = w > 0 ? (w - L.ldkFreeFront) / w : 0
  const free = w > 0 ? L.ldkFreeFront / w : 0
  return {
    ldkFreeFront: L.ldkFreeFront,
    ldkFrontDepth: L.frontDepth,
    ldkByCar: byCar,
    ldkByGarden: L.garden.length > 0 ? free : 0,
    ldkByHedge: L.hedge.length > 0 ? free : 0,
    carMode: { front: L.cars.filter((c) => c.mode === 'front').length, side: L.cars.filter((c) => c.mode === 'side').length },
    dryingSide: L.drying && L.backDoor ? L.backDoor.side : null,
    lotWidenByDrying: L.lotWidenByDrying,
    lotArea: (L.lot.w * L.lot.h) / 16,
    lotW: L.lot.w,
    lotH: L.lot.h,
  }
}

const meters = (cells: number) => ((cells * 455) / 1000).toFixed(1)

/** 敷地の目安の文言（敷地図の下・印刷に出す） */
export function siteCaption(layout: SiteLayout): string {
  const tsubo = Math.round((layout.lot.w * layout.lot.h) / 16)
  return `敷地の目安 約${tsubo}坪（間口 ${meters(layout.lot.w)}m × 奥行 ${meters(layout.lot.h)}m）。建物と駐車・庭から計算した目安で、敷地の条件は考慮していません`
}

const DIR = { W: '西', E: '東' } as const

/**
 * 敷地の解説文（R-TEXT-02: 当てはまる事実だけ。PR3）。`explainPlan` とは別関数
 * （explainPlan の出力は gen-v8-partial.json の fixture に入っているので、ここに文を足さない）。
 * 駐車も庭もなくて書くことがなければ空文字
 */
export function explainSite(cfg: Pick<PlanConfig, 'parking' | 'garden'>, plan: Pick<Plan, 'W' | 'H' | 'floors'>): string {
  const L = siteLayout(plan, cfg)
  const ldk = plan.floors[0]?.rooms.find((r) => r.type === 'ldk')
  if (!ldk) return ''
  const n = clamp02(cfg.parking)
  const garden = clamp02(cfg.garden)
  const nSide = L.cars.filter((c) => c.mode === 'side').length
  const nFront = L.cars.length - nSide
  const dir = DIR[L.side]
  const yard = garden > 0 ? '庭' : '前庭'
  const out: string[] = []
  // 前庭の駐車が LDK の前にかかる案は、「LDK の前を空けている」と言い切らない
  const covered = nFront > 0 && L.ldkFreeFront < ldk.w
  const front = covered ? `LDK の前は車がかかる部分を除いて${yard}として空けています。` : `LDK の前を${yard}として空けています。`
  if (n > 0) {
    if (nSide === 0) out.push(`駐車${n}台は玄関のある${dir}側の前庭に並べ、玄関へそのままアプローチできます。`)
    else if (nFront === 0) out.push(`駐車${n}台は建物の${dir}側の横に置き、${front}`)
    else out.push(`駐車${n}台のうち${nSide}台は建物の${dir}側の横に出し、${front}`)
    if (covered) out.push('前庭の駐車が LDK の前に一部かかるため、その部分は車が道路からの視線をさえぎります。')
  }
  if (garden > 0) {
    let s = `LDK は南の${garden === 2 ? '広めの' : '小さめの'}庭に面し${L.deck ? '、前にウッドデッキを置けます' : ''}`
    if (L.wrap) s += `。角の LDK なので${DIR[L.side === 'W' ? 'E' : 'W']}側にも庭を回しています`
    out.push(`${s}。`)
  } else if (L.hedge.length > 0) {
    // 前庭に駐車があって道路まで深い案（13 セル ≒ 5.9m）では「道路に近い」と書かない
    out.push(L.frontDepth <= 8 ? 'LDK の南は道路に近いため、生け垣などの目隠しを想定しています。' : 'LDK の南の道路側に、生け垣などの目隠しを想定しています。')
  }
  return out.join('')
}
