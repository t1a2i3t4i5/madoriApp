import type { Door, DoorSwing, Edge, Pt, Room, RoomType } from './types'
import { VIA } from './rooms'

/** 2部屋の共有辺。ドアは辺の中央でなく端寄り（34%地点）に置き、部屋中央のラベルと開き弧を分離する */
export function sharedEdge(a: Room, b: Room): Edge | null {
  if (a.x + a.w === b.x || b.x + b.w === a.x) {
    const lo = Math.max(a.y, b.y)
    const hi = Math.min(a.y + a.h, b.y + b.h)
    if (hi - lo >= 2) {
      return { dir: 'v', at: a.x + a.w === b.x ? a.x + a.w : b.x + b.w, mid: lo + (hi - lo) * 0.34, len: hi - lo, lo, hi }
    }
  }
  if (a.y + a.h === b.y || b.y + b.h === a.y) {
    const lo = Math.max(a.x, b.x)
    const hi = Math.min(a.x + a.w, b.x + b.w)
    if (hi - lo >= 2) {
      return { dir: 'h', at: a.y + a.h === b.y ? a.y + a.h : b.y + b.h, mid: lo + (hi - lo) * 0.34, len: hi - lo, lo, hi }
    }
  }
  return null
}

type RoomPair = readonly [RoomType, RoomType]

/** ドアを付けないペア。照合は pairKey で正規化した Set で行うので順不同でも効くが、定義は正規形（アルファベット順）で書く（テストで検査） */
export const NO_DOOR_PAIRS: readonly RoomPair[] = [
  ['bath', 'entry'], ['entry', 'wc'], ['bath', 'ldk'], ['ldk', 'wc'], ['bath', 'wc'],
  ['bath', 'master'], ['master', 'wc'], ['bath', 'bed'], ['bed', 'wc'], ['stair', 'void'], ['stair', 'wc'],
]
/** VIA の判定とは別に、明示的にドアを許すペア（VIA を含むペアも含む）。NO_DOOR に該当するペアは除く */
export const PAIR_OK_PAIRS: readonly RoomPair[] = [
  ['kitchen', 'pantry'], ['master', 'wic'], ['laundry', 'wash'], ['bath', 'wash'], ['doma', 'entry'], ['bed', 'hall'],
]

/** 部屋タイプ2つを順不同で同じキーにする（アルファベット順） */
export function pairKey(a: RoomType, b: RoomType): string {
  return [a, b].sort().join('-')
}

const NO_DOOR = new Set(NO_DOOR_PAIRS.map(([a, b]) => pairKey(a, b)))
const PAIR_OK = new Set(PAIR_OK_PAIRS.map(([a, b]) => pairKey(a, b)))

/** 階段と扉のない開口でつながる部屋の種別（GEN_VERSION 6。R-DOOR-04・R-DOOR-13・R-DOOR-14）。これ以外の部屋と階段の間には何も付けない */
export const STAIR_OPEN_TYPES: ReadonlySet<RoomType> = new Set<RoomType>(['hall', 'entry', 'doma', 'ldk'])

/** owned の持ち主（Room.of が指す位置）が other か */
function isOwnerOf(other: Room, owned: Room): boolean {
  return !!owned.of && other.x === owned.x + owned.of.dx && other.y === owned.y + owned.of.dy
}

/** 付属収納（Room.of を持つ部屋）か */
const isOwned = (r: Room) => r.of !== undefined

/**
 * 隣接する2部屋にドアを付けてよいか。通り抜け可否は部屋種別ごとの via 集合で判定。
 * 付属収納（Room.of）は、他のすべての規則より先に「相手が持ち主のときだけ」で判定する
 */
export function doorOK(a: Room, b: Room): boolean {
  if (isOwned(a) || isOwned(b)) {
    return (!isOwned(a) || isOwnerOf(b, a)) && (!isOwned(b) || isOwnerOf(a, b))
  }
  if (a.type === 'void' || b.type === 'void') return false
  // 階段（GEN_VERSION 6）: 相手がホール・玄関・土間・LDK のときだけ（扉でなく開口。computeDoors が kind 'open' にする）
  if (a.type === 'stair' || b.type === 'stair') return STAIR_OPEN_TYPES.has((a.type === 'stair' ? b : a).type)
  const key = pairKey(a.type, b.type)
  if (NO_DOOR.has(key)) return false
  // 浴室のドアは洗面とだけ付ける（ホール・階段などの VIA 室とも付けない）
  if (a.type === 'bath' || b.type === 'bath') return key === pairKey('bath', 'wash')
  if (VIA[a.type] || VIA[b.type]) return true
  return PAIR_OK.has(key)
}

/** ドアの葉の最大長（セル） */
export const DOOR_LEAF = 1.8
/** 玄関の外開きドアの半径の上限（セル） */
export const ENTRY_DOOR_R = 2.0

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * ドアの開き先。片方だけが通り抜け不可（VIA でない）ならその部屋、
 * 条件が同じなら面積の小さい方。それも同じなら y・x の小さい方（決定的）
 */
function opensInto(a: Room, b: Room): 'a' | 'b' {
  const av = !!VIA[a.type], bv = !!VIA[b.type]
  if (av !== bv) return av ? 'b' : 'a'
  if (a.area !== b.area) return a.area < b.area ? 'a' : 'b'
  if (a.y !== b.y) return a.y < b.y ? 'a' : 'b'
  return a.x <= b.x ? 'a' : 'b'
}

/** doorSwing の上書き指定。opens: 開き先を固定、leaf: 葉を共有区間の下端（lo）／上端（hi）へ寄せる（既定は 34% 地点中心） */
export interface SwingOpt {
  opens?: 'a' | 'b'
  leaf?: 'lo' | 'hi'
}

/**
 * ドア1枚の形状。葉は共有区間内（長さ最大 DOOR_LEAF）で 34% 地点を中心に置き、区間内へクランプする。
 * 半径は葉の長さと、開き先の壁に垂直な深さの小さい方 → 弧の矩形は開き先の部屋に収まる。
 * 描画（FloorSvg）・家具配置（furnish）・動線（flow）が共有する唯一の定義
 */
export function doorSwing(a: Room, b: Room, e: Edge, opt: SwingOpt = {}): DoorSwing {
  const opens = opt.opens ?? opensInto(a, b)
  const room = opens === 'a' ? a : b
  // 開き先が辺の小さい座標側か大きい座標側か（at が部屋の末端か先端か）で開く向きが決まる
  const isV = e.dir === 'v'
  const depth = isV ? room.w : room.h
  const near = isV ? room.x : room.y // 開き先の部屋の、辺に垂直な方向の始点
  const dirSign = e.at === near ? 1 : -1
  const r = Math.max(0, Math.min(DOOR_LEAF, e.len, depth))
  const s = opt.leaf === 'lo' ? e.lo : opt.leaf === 'hi' ? e.hi - r : Math.min(Math.max(e.mid - r / 2, e.lo), e.hi - r)
  const pt = (along: number, perp: number): Pt => (isV ? { x: perp, y: along } : { x: along, y: perp })
  const hinge = pt(s, e.at)
  const closed = pt(s + r, e.at)
  const open = pt(s, e.at + dirSign * r)
  const center = pt(s + r / 2, e.at)
  const px = Math.min(e.at, e.at + dirSign * r)
  const rect: Rect = isV ? { x: px, y: s, w: r, h: r } : { x: s, y: px, w: r, h: r }
  return { opens, r, hinge, closed, open, center, rect }
}

/** 折れ戸の開き先側の厚み（セル）。弧を描かないので薄い矩形で表す */
const FOLD_DEPTH = 0.3

/**
 * 付属収納の折れ戸／引戸。開き先は付属収納側で、swing.rect は共有辺に沿った薄い矩形（個室側には出ない）。
 * 葉の位置は開き戸と同じ（34% 地点中心）
 */
function foldSwing(a: Room, b: Room, e: Edge): DoorSwing {
  const base = doorSwing(a, b, e, { opens: isOwned(a) ? 'a' : 'b' })
  const q = base.rect
  // 開く向き（付属収納側が共有辺の + 側か − 側か）で、薄い矩形を共有辺に沿わせる。
  // 開き先が − 側（西・北に収納があるとき）は、辺の手前 FOLD_DEPTH から辺までの帯にする
  const rect: Rect = e.dir === 'v'
    ? { x: base.open.x >= e.at ? e.at : e.at - FOLD_DEPTH, y: q.y, w: FOLD_DEPTH, h: q.h }
    : { x: q.x, y: base.open.y >= e.at ? e.at : e.at - FOLD_DEPTH, w: q.w, h: FOLD_DEPTH }
  return { ...base, rect }
}

/**
 * 扉のない開口の前の通路（2×2 セル程度）。階段以外の側の部屋の中に、通行点 swing.center を中心に取る。
 * 家具配置が避ける（開き戸の弧の矩形の代わり）。開口でなければ null
 */
export function openingPassage(d: Door): Rect | null {
  if (d.kind !== 'open') return null
  const PASS = 2
  const room = d.a.type === 'stair' ? d.b : d.a
  const { edge, swing } = d
  if (edge.dir === 'h') {
    const a = Math.max(edge.lo, swing.center.x - PASS / 2)
    const b = Math.min(edge.hi, swing.center.x + PASS / 2)
    return { x: a, y: room.y === edge.at ? edge.at : edge.at - PASS, w: b - a, h: PASS }
  }
  const a = Math.max(edge.lo, swing.center.y - PASS / 2)
  const b = Math.min(edge.hi, swing.center.y + PASS / 2)
  return { x: room.x === edge.at ? edge.at : edge.at - PASS, y: a, w: PASS, h: b - a }
}

/** 弧の外接矩形。FloorSvg の描画と一致する */
export function doorSwingRect(d: Door): Rect {
  return d.swing.rect
}

/** 開き弧の SVG パス（hinge → from → 弧 → to → 閉じる）。sweep は外積の向きから決める */
export function swingPath(hinge: Pt, from: Pt, to: Pt, r: number): string {
  const cross = (from.x - hinge.x) * (to.y - hinge.y) - (from.y - hinge.y) * (to.x - hinge.x)
  return `M ${hinge.x} ${hinge.y} L ${from.x} ${from.y} A ${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${to.x} ${to.y} Z`
}

export function doorPath(d: Door): string {
  const s = d.swing
  return swingPath(s.hinge, s.closed, s.open, s.r)
}

/** 玄関（南外壁に接するもの）の外開きドア。半径は玄関の幅以下で、弧は玄関の間口の範囲内に収まる */
export function entryDoor(entry: Room, H: number): { path: string; rect: Rect; r: number } {
  const r = Math.min(ENTRY_DOOR_R, entry.w)
  const hx = entry.x + (entry.w - r) / 2
  const hinge = { x: hx, y: H }
  return {
    path: swingPath(hinge, { x: hx, y: H + r }, { x: hx + r, y: H }, r),
    rect: { x: hx, y: H, w: r, h: r },
    r,
  }
}

function rectsOverlap(p: Rect, q: Rect): boolean {
  return p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h
}

/**
 * 同じ部屋に開く2枚のドアの弧が重ならないようにする後処理。先に決まったドアを優先し、
 * 後のドアを (1) 葉を共有区間の反対側の端へ寄せる → (2) 反対側の端 → (3) 開き先を反対の部屋に切り替える（既定位置 → 両端）の順に試す。
 * どれでも避けられなければ既定の形のまま残す
 */
function separateSwings(doors: Door[]): Door[] {
  const out: Door[] = []
  for (const d of doors) {
    const opensRoom = (x: Door, o: 'a' | 'b') => (o === 'a' ? x.a : x.b)
    const clash = (sw: DoorSwing) =>
      out.some((o) => opensRoom(o, o.swing.opens) === opensRoom(d, sw.opens) && rectsOverlap(o.swing.rect, sw.rect))
    if (!clash(d.swing)) {
      out.push(d)
      continue
    }
    const other = d.swing.opens === 'a' ? 'b' : 'a'
    // 既定位置は 34% 地点（下端寄り）なので、まず上端、次に下端
    const tries: SwingOpt[] = [
      { leaf: 'hi' }, { leaf: 'lo' },
      { opens: other }, { opens: other, leaf: 'hi' }, { opens: other, leaf: 'lo' },
    ]
    let best = d.swing
    for (const t of tries) {
      const sw = doorSwing(d.a, d.b, d.edge, { opens: d.swing.opens, ...t })
      if (!clash(sw)) {
        best = sw
        break
      }
    }
    out.push(best === d.swing ? d : { ...d, swing: best })
  }
  return out
}

/**
 * 扉のない開口（階段の口）。葉も弧もないので swing.rect は幅0・高さ0、swing.center は共有区間の中点
 * （通行点。動線が通る）。r・hinge・closed・open も中点に置く
 */
function openingSwing(a: Room, e: Edge): DoorSwing {
  const m = (e.lo + e.hi) / 2
  const c: Pt = e.dir === 'v' ? { x: e.at, y: m } : { x: m, y: e.at }
  return { opens: a.type === 'stair' ? 'b' : 'a', r: 0, hinge: c, closed: c, open: c, center: c, rect: { x: c.x, y: c.y, w: 0, h: 0 } }
}

export function computeDoors(rooms: Room[]): Door[] {
  const doors: Door[] = []
  for (const [i, a] of rooms.entries()) {
    for (const b of rooms.slice(i + 1)) {
      const e = sharedEdge(a, b)
      if (!e || !doorOK(a, b)) continue
      doors.push(
        isOwned(a) || isOwned(b)
          ? { a, b, edge: e, swing: foldSwing(a, b, e), kind: 'fold' }
          : a.type === 'stair' || b.type === 'stair'
            ? { a, b, edge: e, swing: openingSwing(a, e), kind: 'open' }
            : { a, b, edge: e, swing: doorSwing(a, b, e) },
      )
    }
  }
  // 折れ戸・開口は弧を出さないので、開き戸どうしの弧の分離の対象外（先頭に並べず、後ろへ回して開き戸の順序を保つ）
  const noArc = (d: Door) => d.kind === 'fold' || d.kind === 'open'
  return [...separateSwings(doors.filter((d) => !noArc(d))), ...doors.filter((d) => d.kind === 'fold'), ...doors.filter((d) => d.kind === 'open')]
}
