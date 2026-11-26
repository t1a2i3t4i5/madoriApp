import type { Plan, Room } from './types'
import { bandHall } from './rooms'
import { STAIR_OPEN_TYPES, sharedEdge, type Rect } from './derive'

/**
 * 階段の幾何（GEN_VERSION 6。仕様 hall-stair-spec §5）。
 * 2階建ての階段は、上下階で同じ 4×hN（hN = 5 または 6）の折り返し階段（踊り場付き）。
 * 前提: 階高 約2.9m・14段上がり・踏面 約227mm。1セル = 455mm。幅0.91mの2列、各列 3セル（1.365m）に6段、奥2セルが踊り場（4×5）。
 * 4×6 は口の側に1セルの溜まり（上り口の手前）を足したもの。4×4 は踊り場が入らないので成立しない。
 */
export const STAIR_W = 4
/** 階段の長さ（北帯の高さ hN）の候補 */
export const STAIR_HS = [5, 6] as const
/** 踊り場の奥行（セル） */
const LANDING = 2
/** 1つの踏み段列の長さ（セル）。6段 × 227mm ≒ 1.365m = 3セル */
const FLIGHT = 3

/** 折り返し階段の寸法。口の辺は常に南（ホール帯側）。upCol は上りの列（建物の中央に近い列）で、描画だけに使う */
export interface StairGeom {
  kind: 'U'
  mouth: 'S'
  upCol: 'W' | 'E'
  /** 踊り場（北の外壁側、全幅） */
  landing: Rect
  /** 踏み段の列 [上り, 下り]（各 2×3） */
  flights: [Rect, Rect]
  /** 口の側の溜まり（4×6 のときだけ。全幅×1） */
  apron: Rect | null
}

/**
 * 階段の口の辺（南辺）に、開口でつながる部屋（ホール・玄関・土間・LDK）が接している区間。
 * 共有が2セル以上の部屋だけが開口を持つ（sharedEdge と同じ基準）
 */
function mouthSpans(rooms: readonly Room[], stair: Room): [number, number][] {
  const spans: [number, number][] = []
  for (const r of rooms) {
    if (r === stair || !STAIR_OPEN_TYPES.has(r.type) || r.y !== stair.y + stair.h) continue
    const e = sharedEdge(stair, r)
    if (e && e.dir === 'h') spans.push([e.lo, e.hi])
  }
  return spans
}

function covers(spans: [number, number][], lo: number, hi: number): boolean {
  const sorted = spans.slice().sort((a, b) => a[0] - b[0])
  let at = lo
  for (const [s, e] of sorted) {
    if (s > at) break
    at = Math.max(at, e)
  }
  return at >= hi
}

/** 階段の口の辺の全幅が、開口でつながる部屋（ホール・玄関・土間・LDK）で覆われているか（階段がなければ true） */
export function stairMouthCovered(rooms: readonly Room[]): boolean {
  const stair = rooms.find((r) => r.type === 'stair')
  return !stair || covers(mouthSpans(rooms, stair), stair.x, stair.x + stair.w)
}

/** 階段の口の辺の全幅が、ホール1室で覆われているか（階段がなければ true）。ホール帯の端の吸収・行き止まりの収納化が使う厳しい版 */
export function hallCoversMouth(rooms: readonly Room[]): boolean {
  const stair = rooms.find((r) => r.type === 'stair')
  const hall = bandHall(rooms)
  if (!stair) return true
  return !!hall && covers(mouthSpans([hall], stair), stair.x, stair.x + stair.w)
}

const sameRect = (a: Room, b: Room) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h

/**
 * i 階の階段の折り返しの形。2階建てで、階段が両階で同じ矩形（x・y・幅・高さ）の 4×5 / 4×6 で、
 * i 階の口の辺が開口でつながる部屋に全幅で接するときだけ返す。
 * そうでない案（旧版のお気に入りの直進階段・4×4 など）は null で、描画は従来の直進のまま。純関数・Room の追加フィールドなし
 */
export function stairGeom(plan: Pick<Plan, 'W' | 'floors'>, floorIdx: number): StairGeom | null {
  if (plan.floors.length !== 2) return null
  const stairs = plan.floors.map((f) => f.rooms.find((r) => r.type === 'stair'))
  const [s1, s2] = stairs
  const fl = plan.floors[floorIdx]
  const s = stairs[floorIdx]
  if (!s1 || !s2 || !fl || !s || !sameRect(s1, s2)) return null
  if (s.w !== STAIR_W || !(STAIR_HS as readonly number[]).includes(s.h)) return null
  if (!stairMouthCovered(fl.rooms)) return null
  // 上りの列は建物の中央に近い側（階段は東西どちらかの端にある）
  const upCol: 'W' | 'E' = s.x + s.w / 2 < plan.W / 2 ? 'E' : 'W'
  const colW = STAIR_W / 2
  const col = (c: 'W' | 'E'): Rect => ({ x: c === 'W' ? s.x : s.x + colW, y: s.y + LANDING, w: colW, h: FLIGHT })
  const down: 'W' | 'E' = upCol === 'W' ? 'E' : 'W'
  return {
    kind: 'U',
    mouth: 'S',
    upCol,
    landing: { x: s.x, y: s.y, w: s.w, h: LANDING },
    flights: [col(upCol), col(down)],
    apron: s.h > LANDING + FLIGHT ? { x: s.x, y: s.y + LANDING + FLIGHT, w: s.w, h: s.h - LANDING - FLIGHT } : null,
  }
}
