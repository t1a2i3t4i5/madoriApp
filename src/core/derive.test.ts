import { describe, expect, it } from 'vitest'
import { NO_DOOR_PAIRS, PAIR_OK_PAIRS, doorOK, pairKey } from './derive'
import type { Room, RoomType } from './types'

function room(type: RoomType, x: number): Room {
  return { type, name: type, x, y: 0, w: 4, h: 4, area: 16, target: 16, minArea: 8 }
}

describe('doorOK', () => {
  it('玄関-浴室はドアを付けない（引数の順序によらない）', () => {
    expect(doorOK(room('entry', 0), room('bath', 4))).toBe(false)
    expect(doorOK(room('bath', 0), room('entry', 4))).toBe(false)
  })

  it('NO_DOOR の全ペアが両順序で false', () => {
    for (const [a, b] of NO_DOOR_PAIRS) {
      expect(doorOK(room(a, 0), room(b, 4)), `${a}-${b}`).toBe(false)
      expect(doorOK(room(b, 0), room(a, 4)), `${b}-${a}`).toBe(false)
    }
  })

  it('PAIR_OK の全ペアが両順序で true', () => {
    for (const [a, b] of PAIR_OK_PAIRS) {
      expect(doorOK(room(a, 0), room(b, 4)), `${a}-${b}`).toBe(true)
      expect(doorOK(room(b, 0), room(a, 4)), `${b}-${a}`).toBe(true)
    }
  })

  it('浴室-LDK はドアを付けない（両順序・固定の期待値）', () => {
    expect(doorOK(room('bath', 0), room('ldk', 4))).toBe(false)
    expect(doorOK(room('ldk', 0), room('bath', 4))).toBe(false)
  })

  it('NO_DOOR の主要ペアは表に依存せず両順序で false', () => {
    const fixed: [RoomType, RoomType][] = [
      ['bath', 'entry'], ['bath', 'ldk'], ['bath', 'master'], ['bath', 'bed'],
      ['entry', 'wc'], ['ldk', 'wc'], ['bath', 'wc'], ['stair', 'void'],
    ]
    for (const [a, b] of fixed) {
      expect(doorOK(room(a, 0), room(b, 4)), `${a}-${b}`).toBe(false)
      expect(doorOK(room(b, 0), room(a, 4)), `${b}-${a}`).toBe(false)
    }
  })

  it('定義の全エントリが正規形（pairKey と一致する形）であること', () => {
    for (const [a, b] of [...NO_DOOR_PAIRS, ...PAIR_OK_PAIRS]) {
      expect(`${a}-${b}`, `${a}-${b} は正規形でない`).toBe(pairKey(a, b))
    }
  })
})
