import { describe, expect, it } from 'vitest'
import { NO_DOOR_PAIRS, PAIR_OK_PAIRS, computeDoors, doorOK, pairKey } from './derive'
import { candidatePool } from './generate'
import { CONDITIONS, PARTIAL_CONDITIONS } from './testing'
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

  it('浴室のドアは洗面とだけ付く（ホール・階段・土間などとは付かない）', () => {
    expect(doorOK(room('bath', 0), room('wash', 4))).toBe(true)
    expect(doorOK(room('wash', 0), room('bath', 4))).toBe(true)
    for (const t of ['hall', 'stair', 'doma', 'laundry', 'wic', 'study'] as RoomType[]) {
      expect(doorOK(room('bath', 0), room(t, 4)), `bath-${t}`).toBe(false)
      expect(doorOK(room(t, 0), room('bath', 4)), `${t}-bath`).toBe(false)
    }
  })

  it('階段-トイレはドアを付けない（両順序）', () => {
    expect(doorOK(room('stair', 0), room('wc', 4))).toBe(false)
    expect(doorOK(room('wc', 0), room('stair', 4))).toBe(false)
  })

  it('定義の全エントリが正規形（pairKey と一致する形）であること', () => {
    for (const [a, b] of [...NO_DOOR_PAIRS, ...PAIR_OK_PAIRS]) {
      expect(`${a}-${b}`, `${a}-${b} は正規形でない`).toBe(pairKey(a, b))
    }
  })
})

describe('付属収納（Room.of）', () => {
  // 洋室(0,0,6x6) の東に closet(6,0,2x6)、その下（南）にホール
  const bed: Room = { type: 'bed', name: '洋室', x: 0, y: 0, w: 6, h: 6, area: 36, target: 46, minArea: 28 }
  const cl: Room = { type: 'closet', name: 'クローゼット', x: 6, y: 0, w: 2, h: 6, area: 12, target: 8, minArea: 8, of: { dx: -6, dy: 0 } }
  const hall: Room = { type: 'hall', name: 'ホール', x: 6, y: 6, w: 4, h: 2, area: 8, target: 0, minArea: 0 }

  it('持ち主とだけドアが付く（VIA のホールとは付かない）', () => {
    expect(doorOK(bed, cl)).toBe(true)
    expect(doorOK(cl, bed)).toBe(true)
    expect(doorOK(cl, hall)).toBe(false)
    expect(doorOK(hall, cl)).toBe(false)
  })

  it('持ち主でない部屋とは付かない', () => {
    const other: Room = { ...bed, x: 0, y: 6 }
    expect(doorOK(cl, other)).toBe(false)
  })

  it('of のない収納は従来どおり（VIA のホールとドアが付く）', () => {
    const { of: _of, ...plain } = cl
    expect(doorOK({ ...plain, type: 'store' }, hall)).toBe(true)
  })

  it('computeDoors は付属収納に折れ戸を1枚だけ付け、矩形は共有辺に沿って個室側へ出ない', () => {
    const doors = computeDoors([bed, cl, hall])
    const clDoors = doors.filter((d) => d.a === cl || d.b === cl)
    expect(clDoors).toHaveLength(1)
    const d = clDoors[0]
    expect(d?.kind).toBe('fold')
    expect(d?.swing.rect.x).toBeGreaterThanOrEqual(cl.x)
  })

  // 収納が持ち主の東・西・南・北にあるとき、折れ戸の矩形は共有辺に接する薄い帯（収納側）になる
  const own = (t: Room, owner: Room): Room => ({ ...t, of: { dx: owner.x - t.x, dy: owner.y - t.y } })
  const mkOwned = (x: number, y: number, w: number, h: number): Room => own({ ...cl, x, y, w, h }, { ...bed, x: 10, y: 10 })
  const owner: Room = { ...bed, x: 10, y: 10 }
  const cases: [string, Room, (r: { x: number; y: number; w: number; h: number }) => void][] = [
    ['東', mkOwned(16, 10, 2, 6), (r) => { expect(r.x).toBeCloseTo(16); expect(r.w).toBeCloseTo(0.3) }],
    ['西', mkOwned(8, 10, 2, 6), (r) => { expect(r.x).toBeCloseTo(10 - 0.3); expect(r.w).toBeCloseTo(0.3) }],
    ['南', mkOwned(10, 16, 6, 2), (r) => { expect(r.y).toBeCloseTo(16); expect(r.h).toBeCloseTo(0.3) }],
    ['北', mkOwned(10, 8, 6, 2), (r) => { expect(r.y).toBeCloseTo(10 - 0.3); expect(r.h).toBeCloseTo(0.3) }],
  ]
  for (const [name, closet, check] of cases) {
    it(`${name}側の収納: 折れ戸の矩形が共有辺に沿い、収納の内側に収まる`, () => {
      const d = computeDoors([owner, closet]).find((x) => x.kind === 'fold')
      if (!d) throw new Error('折れ戸がない')
      const r = d.swing.rect
      check(r)
      expect(r.x).toBeGreaterThanOrEqual(closet.x - 1e-9)
      expect(r.y).toBeGreaterThanOrEqual(closet.y - 1e-9)
      expect(r.x + r.w).toBeLessThanOrEqual(closet.x + closet.w + 1e-9)
      expect(r.y + r.h).toBeLessThanOrEqual(closet.y + closet.h + 1e-9)
    })
  }
})

describe('生成は付属収納を作らない（GEN_VERSION 5 PR-A）', () => {
  it('候補プールに closet も of も存在しない（総二階・平屋・部分二階）', () => {
    for (const { name, cfg } of [...CONDITIONS, ...PARTIAL_CONDITIONS]) {
      for (const p of candidatePool(cfg)) {
        for (const fl of p.floors) {
          for (const r of fl.rooms) {
            expect(r.type, name).not.toBe('closet')
            expect(r.of, name).toBeUndefined()
          }
        }
      }
    }
  })
})
