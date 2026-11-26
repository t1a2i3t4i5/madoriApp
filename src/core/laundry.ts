import { backDoorCandidates, washerRoom, type BackDoor } from './backdoor'
import { computeDoors } from './derive'
import { ROOM, VIA } from './rooms'
import { siteLayout } from './site'
import type { Plan, PlanConfig, Room } from './types'
import { hasDryPipe } from './washer'

/**
 * 洗濯動線の観測（R-FLOW-06・R-IDX-11。洗濯動線 PR-L1）。純関数・フレームワーク非依存。
 * **生成・スコア・名前・タグ・explainPlan・cfgId・fixture には効かせない**（観測のみ。R-EVAL-13）。
 *
 * 経路の定義（R-FLOW-06）:
 * - 始点（洗う）: 1F のランドリー、なければ 1F の洗面。ノード = (階, 部屋)、辺 = `computeDoors` のドアと開口（`kind: 'open'`）。
 *   上下の階段どうしは長さ 0 の辺でつなぐ（階の変化は `floors` に数える）
 * - 長さ（セル）: 部屋の中心 → ドア・開口の通行点（`Door.swing.center`）→ 次の部屋の中心 …… → 終点の部屋の中の出口の点のユークリッド距離の和。
 *   `src/lib/flow.ts`（R-FLOW-01）と同じ測り方。flow.ts は lib にあり core から参照できないので、core 側に最短経路を持つ
 * - 中継: VIA 以外の部屋を途中で通るのは、VIA だけで届かないときの最後の手段（R-FLOW-02 と同じ。ペナルティを辞書式で課す）
 * - 終点（干す）: A 庭（LDK の南面。デッキがあればデッキの中心の真上）／B 洗濯機の部屋の勝手口／C 1F ホールの端の勝手口／F 室内干し（ランドリー室。長さ 0）
 *   2F バルコニー（D・E）は作らない（洗濯動線を長くする。仕様 §5.4）
 * - しまう: 干す場所の出口から主寝室（クローゼット・WIC の持ち主の代表）までの同じ経路
 */

export interface LaundryRoute {
  /** 経路の長さ（セル。×0.455 でメートル） */
  len: number
  /** 通った部屋（始点・終点を含む。階をまたぐと2階の部屋も入る） */
  rooms: Room[]
  /** 中継に LDK を含む、または終点が LDK */
  crossesLdk: boolean
  /** 中継に個室（cat が bed。主寝室・洋室・書斎・和室）を含む */
  crossesPrivate: boolean
  /** 階段で階が変わった回数 */
  floors: number
  /** ドア（扉・折れ戸）の数と、扉のない開口の数 */
  doors: number
  openings: number
}

interface Pt { x: number; y: number }
const center = (r: Room): Pt => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

interface Edge { to: number; pt: Pt | null; kind: 'door' | 'fold' | 'open' | 'stair' }

/** 案の隣接グラフ上の最短経路を引く道具。同じ案で何度も引くので、グラフは1度だけ作る */
export function makeRouter(plan: Pick<Plan, 'floors'>) {
  const nodes: { f: number; r: Room }[] = []
  const id = new Map<Room, number>()
  plan.floors.forEach((fl, f) => fl.rooms.forEach((r) => { id.set(r, nodes.length); nodes.push({ f, r }) }))
  const adj: Edge[][] = nodes.map(() => [])
  plan.floors.forEach((fl) => {
    for (const d of computeDoors(fl.rooms)) {
      const a = id.get(d.a), b = id.get(d.b)
      if (a === undefined || b === undefined) continue
      const kind: Edge['kind'] = d.kind === 'fold' ? 'fold' : d.kind === 'open' ? 'open' : 'door'
      adj[a]?.push({ to: b, pt: d.swing.center, kind })
      adj[b]?.push({ to: a, pt: d.swing.center, kind })
    }
  })
  nodes.forEach((na, a) => {
    if (na.r.type !== 'stair') return
    nodes.forEach((nb, b) => {
      if (a !== b && nb.r.type === 'stair' && Math.abs(na.f - nb.f) === 1) adj[a]?.push({ to: b, pt: null, kind: 'stair' })
    })
  })

  /** from（startPt があればその点）から to（endPt があればその点）への最短。つながらなければ null */
  function route(from: Room, to: Room, endPt?: Pt, startPt?: Pt): LaundryRoute | null {
    const s = id.get(from), t = id.get(to)
    if (s === undefined || t === undefined) return null
    const N = nodes.length
    const len = new Array<number>(N).fill(Infinity)
    const pen = new Array<number>(N).fill(Infinity)
    const prev = new Array<number>(N).fill(-1)
    const pos: (Pt | null)[] = new Array<Pt | null>(N).fill(null)
    const via = new Array<Edge['kind'] | ''>(N).fill('')
    const done = new Array<boolean>(N).fill(false)
    len[s] = 0; pen[s] = 0; pos[s] = startPt ?? center(from)
    // 辞書式（通り抜けた非 VIA の数 → 長さ）。浮動小数の和に頼らないよう、キーは (pen, len) の組で比べる
    const less = (p1: number, l1: number, p2: number, l2: number) => p1 < p2 || (p1 === p2 && l1 < l2)
    for (;;) {
      let u = -1
      for (let i = 0; i < N; i++) {
        if (done[i] || (len[i] ?? Infinity) === Infinity) continue
        if (u < 0 || less(pen[i] ?? 0, len[i] ?? 0, pen[u] ?? 0, len[u] ?? 0)) u = i
      }
      if (u < 0) break
      done[u] = true
      if (u === t) break
      const here = pos[u]
      const nu = nodes[u]
      if (!here || !nu) continue
      for (const e of adj[u] ?? []) {
        if (done[e.to]) continue
        const nr = nodes[e.to]?.r
        if (!nr) continue
        const through = e.to !== t && !VIA[nr.type] ? 1 : 0
        let np: Pt, nd: number
        if (e.kind === 'stair' || !e.pt) { np = center(nr); nd = len[u] ?? 0 }
        else {
          np = e.to === t && endPt ? endPt : center(nr)
          nd = (len[u] ?? 0) + dist(here, e.pt) + dist(e.pt, np)
        }
        const npen = (pen[u] ?? 0) + through
        if (less(npen, nd, pen[e.to] ?? Infinity, len[e.to] ?? Infinity)) {
          len[e.to] = nd; pen[e.to] = npen; prev[e.to] = u; pos[e.to] = np; via[e.to] = e.kind
        }
      }
    }
    if ((len[t] ?? Infinity) === Infinity) return null
    const seq: number[] = []
    const kinds: Edge['kind'][] = []
    for (let v = t; v >= 0; v = prev[v] ?? -1) {
      seq.push(v)
      if ((prev[v] ?? -1) >= 0) { const k = via[v]; if (k) kinds.push(k) }
    }
    seq.reverse(); kinds.reverse()
    const rooms = seq.map((i) => nodes[i]?.r).filter((r): r is Room => !!r)
    const mid = rooms.slice(1, -1)
    return {
      len: len[t] ?? 0,
      rooms,
      crossesLdk: mid.some((r) => r.type === 'ldk') || to.type === 'ldk',
      crossesPrivate: mid.some((r) => ROOM[r.type].cat === 'bed'),
      floors: kinds.filter((k) => k === 'stair').length,
      doors: kinds.filter((k) => k === 'door' || k === 'fold').length,
      openings: kinds.filter((k) => k === 'open').length,
    }
  }
  return { route }
}

/** 庭への出口（A）: LDK の南面。デッキがあればデッキの中心の真上、なければ LDK の南面の中央。LDK が 1F の南の外壁に接しない案は null */
export function gardenExit(plan: Pick<Plan, 'W' | 'H' | 'floors'>, cfg: Pick<PlanConfig, 'parking' | 'garden'>): { ldk: Room; pt: Pt; deck: boolean } | null {
  const ldk = plan.floors[0]?.rooms.find((r) => r.type === 'ldk')
  if (!ldk || ldk.y + ldk.h !== plan.H) return null
  const L = siteLayout(plan, cfg)
  return { ldk, pt: { x: L.deck ? L.deck.x + L.deck.w / 2 : ldk.x + ldk.w / 2, y: plan.H }, deck: !!L.deck }
}

export interface LaundryRoutes {
  /** A 庭・デッキ（LDK の南） */
  A: LaundryRoute | null
  /** B 洗濯機の部屋の勝手口（物干し場が置けるかは問わない。置ける候補は siteLayout の backDoor） */
  B: LaundryRoute | null
  /** C 1F ホールの端の勝手口 */
  C: LaundryRoute | null
  /** F 室内干し（ランドリー室。長さ 0） */
  F: LaundryRoute | null
}

/** 勝手口 bd までの経路（洗濯機の部屋 → 勝手口の外壁上の点） */
function routeToBackDoor(rt: ReturnType<typeof makeRouter>, washer: Room, bd: BackDoor): LaundryRoute | null {
  const pt = { x: bd.x, y: bd.y }
  if (bd.room === washer) {
    return { len: dist(center(washer), pt), rooms: [washer], crossesLdk: false, crossesPrivate: false, floors: 0, doors: 0, openings: 0 }
  }
  return rt.route(washer, bd.room, pt)
}

/** 洗濯機の部屋から、干す場所の候補ごとの経路。洗濯機の部屋がなければすべて null */
export function laundryRoutes(plan: Plan, cfg: Pick<PlanConfig, 'parking' | 'garden'>): LaundryRoutes {
  const washer = washerRoom(plan)
  const none: LaundryRoutes = { A: null, B: null, C: null, F: null }
  if (!washer) return none
  const rt = makeRouter(plan)
  const g = gardenExit(plan, cfg)
  const L = siteLayout(plan, cfg)
  const cands = backDoorCandidates(plan, L.side)
  const b = cands.find((c) => c.kind === 'B')
  const c = cands.find((x) => x.kind === 'C')
  return {
    A: g ? rt.route(washer, g.ldk, g.pt) : null,
    B: b ? routeToBackDoor(rt, washer, b) : null,
    C: c ? routeToBackDoor(rt, washer, c) : null,
    F: washer.type === 'laundry' ? { len: 0, rooms: [washer], crossesLdk: false, crossesPrivate: false, floors: 0, doors: 0, openings: 0 } : null,
  }
}

export interface LaundryStats {
  /** 洗濯機の部屋の種別。洗濯機の部屋（ランドリー・洗面）がなければ null */
  washer: 'laundry' | 'wash' | null
  /** 庭（A）までの経路 */
  toGarden: LaundryRoute | null
  /** 採った勝手口の種別（siteLayout の backDoor。物干し場が置けるもの）。なければ null */
  backDoor: 'B' | 'C' | null
  /** 干す場所までの経路: 勝手口があればその経路、なければ庭（A） */
  toDry: LaundryRoute | null
  /** 室内干しの場（ランドリー室）がある */
  indoorDry: boolean
  /** 干す場所の出口から主寝室までの経路（しまう。主寝室がなければ null） */
  dryToMaster: LaundryRoute | null
  /** 洗面に LDK からしか入れない（LDK とつながり、ホール・玄関・土間のどれともつながらない。R-FLOW-05 G2 が許す形。別件の観測） */
  washOnlyFromLdk: boolean
}

/** 洗面に LDK からしか入れないか（1F。ドア・開口でつながる相手の種別で判定） */
export function washOnlyFromLdk(plan: Pick<Plan, 'floors'>): boolean {
  const rooms = plan.floors[0]?.rooms ?? []
  const wash = rooms.find((r) => r.type === 'wash')
  if (!wash) return false
  const partners = new Set<string>()
  for (const d of computeDoors(rooms)) {
    if (d.a === wash) partners.add(d.b.type)
    else if (d.b === wash) partners.add(d.a.type)
  }
  return partners.has('ldk') && !partners.has('hall') && !partners.has('entry') && !partners.has('doma')
}

/** 洗濯動線の観測。観測のみ（生成・スコア・fixture に効かせない） */
export function laundryStats(plan: Plan, cfg: Pick<PlanConfig, 'parking' | 'garden'>): LaundryStats {
  const washer = washerRoom(plan)
  const only = washOnlyFromLdk(plan)
  if (!washer) return { washer: null, toGarden: null, backDoor: null, toDry: null, indoorDry: false, dryToMaster: null, washOnlyFromLdk: only }
  const rt = makeRouter(plan)
  const g = gardenExit(plan, cfg)
  const toGarden = g ? rt.route(washer, g.ldk, g.pt) : null
  const L = siteLayout(plan, cfg)
  const bd = L.backDoor
  const toBack = bd ? routeToBackDoor(rt, washer, bd) : null
  const toDry = toBack ?? toGarden
  const master = plan.floors.flatMap((fl) => fl.rooms).find((r) => r.type === 'master')
  let dryToMaster: LaundryRoute | null = null
  if (master && toDry) {
    const endRoom = toBack && bd ? bd.room : g?.ldk
    const endPt = toBack && bd ? { x: bd.x, y: bd.y } : g?.pt
    if (endRoom && endPt) dryToMaster = rt.route(endRoom, master, undefined, endPt)
  }
  return {
    washer: washer.type === 'laundry' ? 'laundry' : 'wash',
    toGarden,
    backDoor: toBack && bd ? bd.kind : null,
    toDry,
    indoorDry: washer.type === 'laundry',
    dryToMaster,
    washOnlyFromLdk: only,
  }
}

const SIDE = { W: '西', E: '東' } as const

/**
 * 勝手口の文を出さない形（R-IDX-11・R-TEXT-11）: 勝手口の経路が LDK を横切り、かつ庭までの経路より長い案。
 * 洗面に LDK からしか入れない案で勝手口 C が付く形（実測 10 件）で、「勝手口から出られる」と書くと実態より近く読める。
 * 庭までの経路がない（`toGarden` が null。庭なしなど）ときは比べる相手がないので、LDK を横切るだけで抑制する
 * （庭なしの案では、抑制しても代わりの文は出ない。庭なしの10件のうち9件は洗濯の文が空になる）
 */
export function backDoorTextSuppressed(s: Pick<LaundryStats, 'backDoor' | 'toGarden' | 'toDry'>): boolean {
  if (s.backDoor !== 'C' || !s.toDry) return false
  return s.toDry.crossesLdk && (!s.toGarden || s.toDry.len > s.toGarden.len)
}

/**
 * 敷地の文に足す洗濯の1文（R-TEXT-11。PR-L3）。観測の事実だけを書き、洗濯機の部屋がない案・干す場所のない案は空文字。
 * 勝手口がある案: 勝手口から物干し場へ。ない案（または文を出さない形）: 庭ありなら LDK を通って庭・デッキで干す
 */
export function laundryClause(plan: Plan, cfg: Pick<PlanConfig, 'parking' | 'garden'>): string {
  const s = laundryStats(plan, cfg)
  if (!s.washer) return ''
  const washer = washerRoom(plan)
  const L = siteLayout(plan, cfg)
  const bd = L.backDoor
  // 室内干しは図の物干しパイプ（hasDryPipe）が描かれるランドリーだけ。観測の indoorDry（ランドリーがあるか）とは条件が違う
  const pipe = !!washer && hasDryPipe(washer)
  const indoor = pipe ? '、雨の日は室内干しもできます' : ''
  if (bd && L.drying && !backDoorTextSuppressed(s)) {
    // 洗濯機の部屋の勝手口は「<部屋>の西の勝手口」、ホールの端なら「ホールの西端の勝手口」
    const where = bd.room === washer ? `${bd.room.name}の${SIDE[bd.side]}` : `${bd.room.name}の${SIDE[bd.side]}端`
    return `${where}の勝手口から、建物の${SIDE[bd.side]}側の物干し場へ出られます${indoor}。`
  }
  if (cfg.garden > 0 && s.toGarden) {
    const spot = L.deck ? 'ウッドデッキ' : '庭'
    // 物干し場は図にあるが、勝手口の経路のほうが遠い案は、庭への近道を比べる言い方にする
    if (bd && L.drying && backDoorTextSuppressed(s)) return `物干し場より、LDK を通って${spot}に出るほうが近道です${indoor}。`
    return `洗濯物は LDK を通って${spot}で干す配置です${indoor}。`
  }
  return pipe ? '雨の日はランドリーで室内干しができます。' : ''
}
