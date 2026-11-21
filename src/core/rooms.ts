import type { Cell, RoomDef, RoomType } from './types'

/** 部屋タイプ定義: target/minArea/maxArea は単位² */
export const ROOM: Record<RoomType, RoomDef> = {
  ldk:      { name: 'LDK',        cat: 'living', target: 124, minArea: 72, maxArea: 220 },
  kitchen:  { name: 'キッチン',   cat: 'living', target: 34,  minArea: 24, maxArea: 52 },
  master:   { name: '主寝室',     cat: 'bed',    target: 62,  minArea: 40, maxArea: 96 },
  bed:      { name: '洋室',       cat: 'bed',    target: 46,  minArea: 28, maxArea: 76 },
  study:    { name: '書斎',       cat: 'bed',    target: 30,  minArea: 22, maxArea: 48 },
  washitsu: { name: '和室',       cat: 'bed',    target: 48,  minArea: 36, maxArea: 72 },
  bath:     { name: '浴室',       cat: 'water',  target: 16,  minArea: 16, maxArea: 20 },
  wash:     { name: '洗面',       cat: 'water',  target: 16,  minArea: 12, maxArea: 26 },
  wc:       { name: 'トイレ',     cat: 'water',  target: 9,   minArea: 8,  maxArea: 14 },
  laundry:  { name: 'ランドリー', cat: 'water',  target: 16,  minArea: 12, maxArea: 24 },
  pantry:   { name: 'パントリー', cat: 'store',  target: 12,  minArea: 8,  maxArea: 20 },
  wic:      { name: 'WIC',        cat: 'store',  target: 16,  minArea: 12, maxArea: 28 },
  store:    { name: '収納',       cat: 'store',  target: 8,   minArea: 6,  maxArea: 16 },
  entry:    { name: '玄関',       cat: 'circ',   target: 16,  minArea: 12, maxArea: 26 },
  doma:     { name: '土間',       cat: 'circ',   target: 24,  minArea: 16, maxArea: 44 },
  hall:     { name: 'ホール',     cat: 'circ',   target: 0,   minArea: 0,  maxArea: 999 },
  stair:    { name: '階段',       cat: 'circ',   target: 24,  minArea: 16, maxArea: 40 },
  void:     { name: '吹抜',       cat: 'void',   target: 0,   minArea: 0,  maxArea: 999 },
}

/** 居室（外壁に接して採光が必要な部屋） */
export const HABITABLE: Partial<Record<RoomType, true>> = {
  ldk: true, master: true, bed: true, study: true, washitsu: true,
}

/** ドアの経由点（これらに隣接していれば原則ドアを付けられる） */
export const VIA: Partial<Record<RoomType, true>> = {
  entry: true, hall: true, ldk: true, doma: true, wash: true, stair: true,
}

export function cell(type: RoomType, opts?: Partial<Cell>): Cell {
  const d = ROOM[type]
  return {
    type, name: d.name, target: d.target, minArea: d.minArea, maxArea: d.maxArea,
    ...opts,
  }
}
