import { describe, expect, it } from 'vitest'
import { candidatePool } from './generate'
import { computeDoors, doorSwing, entryDoor, sharedEdge } from './derive'
import { VIA } from './rooms'
import { CONDITIONS } from './testing'
import type { Room } from './types'

const EPS = 1e-9
const inside = (s: { x: number; y: number; w: number; h: number }, r: Room) =>
  s.x >= r.x - EPS && s.y >= r.y - EPS && s.x + s.w <= r.x + r.w + EPS && s.y + s.h <= r.y + r.h + EPS

describe('ドアの開き形状（全条件・全候補・全階）', () => {
  for (const { name, cfg } of CONDITIONS) {
    it(`${name}: 弧は開き先の部屋に収まり、葉は共有区間内。玄関ドアの弧は玄関の範囲内`, () => {
      let doors = 0
      let entries = 0
      for (const p of candidatePool(cfg)) {
        for (const fl of p.floors) {
          for (const d of computeDoors(fl.rooms)) {
            doors++
            const s = d.swing
            const room = s.opens === 'a' ? d.a : d.b
            expect(inside(s.rect, room), `${d.a.type}-${d.b.type} 弧が開き先 ${room.type} に収まる`).toBe(true)
            expect(s.r).toBeGreaterThan(0)
            expect(s.r).toBeLessThanOrEqual(1.8 + EPS)
            // 葉の区間 = 弧の矩形の辺方向の範囲 → 共有区間内
            const [from, to] = d.edge.dir === 'v' ? [s.rect.y, s.rect.y + s.rect.h] : [s.rect.x, s.rect.x + s.rect.w]
            expect(from).toBeGreaterThanOrEqual(d.edge.lo - EPS)
            expect(to).toBeLessThanOrEqual(d.edge.hi + EPS)
            // 通行点は葉の区間の中心で、壁上にある
            const c = d.edge.dir === 'v' ? { a: s.center.y, w: s.center.x } : { a: s.center.x, w: s.center.y }
            expect(c.a).toBeCloseTo((from + to) / 2, 9)
            expect(c.w).toBe(d.edge.at)
            // 開き先: 片方だけ VIA でないならそちら
            if (!!VIA[d.a.type] !== !!VIA[d.b.type]) expect(room).toBe(VIA[d.a.type] ? d.b : d.a)
          }
          const entry = fl.rooms.find((r) => r.type === 'entry')
          if (entry && entry.y + entry.h === p.H) {
            entries++
            const ed = entryDoor(entry, p.H)
            expect(ed.r).toBeLessThanOrEqual(entry.w + EPS)
            expect(ed.rect.x).toBeGreaterThanOrEqual(entry.x - EPS)
            expect(ed.rect.x + ed.rect.w).toBeLessThanOrEqual(entry.x + entry.w + EPS)
            expect(ed.rect.y).toBe(p.H)
          }
        }
      }
      expect(doors, '空振り防止').toBeGreaterThan(0)
      expect(entries, '空振り防止').toBeGreaterThan(0)
    })
  }

  it('決定的: 同じ入力なら同じ形状', () => {
    const a: Room = { type: 'wash', name: '洗面', x: 0, y: 0, w: 4, h: 4, area: 16, target: 16, minArea: 8 }
    const b: Room = { type: 'hall', name: 'ホール', x: 0, y: 4, w: 4, h: 2, area: 8, target: 8, minArea: 4 }
    const e = sharedEdge(a, b)
    if (!e) throw new Error('辺なし')
    expect(doorSwing(a, b, e)).toEqual(doorSwing(a, b, e))
  })

  it('wash-hall（共有区間 [0,4]）でも葉は建物の外に出ない', () => {
    const wash: Room = { type: 'wash', name: '洗面', x: 0, y: 0, w: 4, h: 4, area: 16, target: 16, minArea: 8 }
    const hall: Room = { type: 'hall', name: 'ホール', x: 0, y: 4, w: 4, h: 4, area: 16, target: 16, minArea: 4 }
    const e = sharedEdge(wash, hall)
    if (!e) throw new Error('辺なし')
    const s = doorSwing(wash, hall, e)
    expect(s.rect.x).toBeGreaterThanOrEqual(0)
    expect(s.rect.x + s.rect.w).toBeLessThanOrEqual(4)
  })
})
