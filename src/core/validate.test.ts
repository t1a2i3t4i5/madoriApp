import { describe, expect, it } from 'vitest'
import type { Room, RoomType } from './types'
import { wetViolations } from './validate'

function room(type: RoomType, x: number, y: number, w = 4, h = 4): Room {
  return { type, name: type, x, y, w, h, area: w * h, target: w * h, minArea: 8 }
}

describe('wetViolations（水回りの隣接）', () => {
  it('浴室・ランドリー・トイレが洗面や水回りに接していれば違反なし', () => {
    expect(wetViolations([room('laundry', 0, 0), room('wash', 4, 0), room('bath', 8, 0), room('wc', 4, 4)])).toEqual([])
  })
  it('浴室が洗面に接していなければ違反', () => {
    expect(wetViolations([room('wash', 0, 0), room('bath', 8, 0)])).toHaveLength(1)
  })
  it('ランドリーが洗面に接していなければ違反', () => {
    expect(wetViolations([room('laundry', 0, 0), room('wash', 8, 0)])).toHaveLength(1)
  })
  it('トイレは水回りのどれにも接していなければ違反。水回りがない階では対象外', () => {
    expect(wetViolations([room('wash', 0, 0), room('wc', 12, 0)])).toHaveLength(1)
    expect(wetViolations([room('wc', 12, 0), room('hall', 0, 0)])).toEqual([])
  })
  it('辺の共有が1セルだけ（角・短い辺）では接していない扱い', () => {
    expect(wetViolations([room('wash', 0, 0), room('bath', 4, 3)])).toHaveLength(1)
  })
  it('キッチン・パントリーは対象外', () => {
    expect(wetViolations([room('kitchen', 0, 0), room('pantry', 20, 0)])).toEqual([])
  })
})
