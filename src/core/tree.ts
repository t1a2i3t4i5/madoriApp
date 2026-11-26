// スライシング木（GEN_VERSION 9 の PR0: 土台）。
// 各階の部屋の配置を、矩形を H 分割・V 分割で再帰的に割る木で表す（R-SPACE-40）。
// 木はイミュータブル（作った後に書き換えない。凍結する）。生成には使わず、layoutFloor の結果を木で見るためのもの。
// 純 TypeScript（React・DOM に依存しない）。
import type { Band, Room } from './types'
import { layoutFloor, type LayoutFloorOpts } from './slicing'

/** 木が割る矩形（階の板の座標） */
export interface TreeRect {
  readonly x: number
  readonly y: number
  readonly W: number
  readonly H: number
}

/** 葉: 部屋1室。room は書き換えない */
export interface TreeLeaf {
  readonly kind: 'leaf'
  readonly rect: TreeRect
  readonly room: Readonly<Room>
}

/**
 * 分割: dir 'H' = 水平線で割る（子は北 → 南に積む）、'V' = 垂直線で割る（子は西 → 東に並べる）。
 * 子は2つ以上。同じ向きの分割を入れ子にせず、1つの n 分木にまとめる
 */
export interface TreeSplit {
  readonly kind: 'split'
  readonly dir: 'H' | 'V'
  readonly rect: TreeRect
  readonly children: readonly TreeNode[]
}

export type TreeNode = TreeLeaf | TreeSplit

type Dir = 'H' | 'V'
const other = (d: Dir): Dir => (d === 'H' ? 'V' : 'H')

/** dir の向きの切断位置（rect の内側で、どの部屋も横切らない座標）の昇順 */
function cutsOf(rooms: readonly Room[], rect: TreeRect, dir: Dir): number[] {
  const lo = dir === 'H' ? rect.y : rect.x
  const hi = lo + (dir === 'H' ? rect.H : rect.W)
  const start = (r: Room) => (dir === 'H' ? r.y : r.x)
  const len = (r: Room) => (dir === 'H' ? r.h : r.w)
  const cands = new Set<number>()
  for (const r of rooms) {
    const c = start(r)
    if (c > lo && c < hi) cands.add(c)
  }
  return [...cands].filter((c) => !rooms.some((r) => start(r) < c && c < start(r) + len(r))).sort((a, b) => a - b)
}

function sub(rect: TreeRect, dir: Dir, from: number, to: number): TreeRect {
  return dir === 'H' ? { x: rect.x, y: from, W: rect.W, H: to - from } : { x: from, y: rect.y, W: to - from, H: rect.H }
}

function build(rooms: readonly Room[], rect: TreeRect, prefer: Dir): TreeNode | null {
  const only = rooms.length === 1 ? rooms[0] : undefined
  if (only) {
    const ok = only.x === rect.x && only.y === rect.y && only.w === rect.W && only.h === rect.H
    return ok ? Object.freeze({ kind: 'leaf' as const, rect: Object.freeze({ ...rect }), room: only }) : null
  }
  if (rooms.length === 0) return null
  for (const dir of [prefer, other(prefer)]) {
    const cuts = cutsOf(rooms, rect, dir)
    if (!cuts.length) continue
    // 有効な切断線で割るのは常に安全（ギロチン分割できるなら、どの有効な線から割っても割れる）。戻りはしない
    const lo = dir === 'H' ? rect.y : rect.x
    const hi = lo + (dir === 'H' ? rect.H : rect.W)
    const bounds = [lo, ...cuts, hi]
    const children: TreeNode[] = []
    for (let i = 0; i + 1 < bounds.length; i++) {
      const from = bounds[i] as number
      const to = bounds[i + 1] as number
      const group = rooms.filter((r) => (dir === 'H' ? r.y : r.x) >= from && (dir === 'H' ? r.y : r.x) < to)
      const child = build(group, sub(rect, dir, from, to), other(dir))
      if (!child) return null
      children.push(child)
    }
    return Object.freeze({ kind: 'split' as const, dir, rect: Object.freeze({ ...rect }), children: Object.freeze(children) })
  }
  return null
}

/**
 * 部屋の配列から木を作る（毎回新しく作る）。根は H 分割（北ゾーン / ホール / 南ゾーン）を優先し、
 * 以降は向きを交互に優先する。部屋が rect をちょうど敷き詰めていない、またはギロチン分割できないときは null。
 * 固定3帯の階は、根が H（帯）・その子が V（帯内の列）・列は葉か H 分割（クローゼットの切り出しなど）になる（R-SPACE-42）
 */
export function buildTree(rooms: readonly Room[], rect: TreeRect): TreeNode | null {
  // 面積0・負の部屋は、面積の合計に効かず葉にもならずに黙って落ちるので、木にしない
  if (rooms.some((r) => r.w <= 0 || r.h <= 0)) return null
  const area = rooms.reduce((s, r) => s + r.w * r.h, 0)
  if (area !== rect.W * rect.H) return null
  return build(rooms, rect, 'H')
}

/** 木の葉の部屋（北 → 南・西 → 東の深さ優先の順）。部屋は木が持つものそのもので、書き換えない */
export function treeRooms(node: TreeNode): Readonly<Room>[] {
  if (node.kind === 'leaf') return [node.room]
  return node.children.flatMap(treeRooms)
}

/** 木の深さ（葉だけ = 0） */
export function treeDepth(node: TreeNode): number {
  return node.kind === 'leaf' ? 0 : 1 + Math.max(...node.children.map(treeDepth))
}

/** 固定3帯の形（R-SPACE-42 の形の検査）に収まる木か: 根が H 分割、その子（帯）が V 分割か葉、帯の子（列）は葉か H 分割の葉の並び */
export function isBandTemplate(node: TreeNode): boolean {
  if (node.kind !== 'split' || node.dir !== 'H') return false
  return node.children.every((band) => {
    if (band.kind === 'leaf') return true
    if (band.dir !== 'V') return false
    return band.children.every((col) => col.kind === 'leaf' || (col.dir === 'H' && col.children.every((c) => c.kind === 'leaf')))
  })
}

/** layoutFloor の結果に、その階の木（板の座標 (0,0,W,H)）を添えたもの。rooms・heights は layoutFloor と同一 */
export function layoutFloorTree(
  W: number,
  H: number,
  bands: Band[],
  opts?: LayoutFloorOpts,
): { rooms: Room[]; heights: number[]; tree: TreeNode | null } | null {
  const res = layoutFloor(W, H, bands, opts)
  if (!res) return null
  return { ...res, tree: buildTree(res.rooms, { x: 0, y: 0, W, H }) }
}
