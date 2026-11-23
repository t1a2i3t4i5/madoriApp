import { describe, expect, it } from 'vitest'
import { candidatePool } from './generate'
import { computeDoors, doorSwing, entryDoor, sharedEdge } from './derive'
import { VIA, findEntry } from './rooms'
import { CONDITIONS } from './testing'
import type { Room } from './types'

const EPS = 1e-9
const inside = (s: { x: number; y: number; w: number; h: number }, r: Room) =>
  s.x >= r.x - EPS && s.y >= r.y - EPS && s.x + s.w <= r.x + r.w + EPS && s.y + s.h <= r.y + r.h + EPS

describe('ドアの開き形状（全条件・全候補・全階）', () => {
  for (const { name, cfg } of CONDITIONS) {
    it(`${name}: 弧は開き先の部屋に収まり、葉は共有区間内。玄関ドアの弧は玄関の範囲内`, () => {
      let doors = 0
      let flipped = 0
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
            // 開き先: 片方だけ VIA でないならそちら。ただし既定の弧が他のドアと重なって切り替えた場合を除く
            if (!!VIA[d.a.type] !== !!VIA[d.b.type] && room !== (VIA[d.a.type] ? d.b : d.a)) {
              flipped++
              expect(s.opens, `${d.a.type}-${d.b.type} 切替は重なり回避のときだけ`).not.toBe(doorSwing(d.a, d.b, d.edge).opens)
            }
          }
          const entry = findEntry(fl.rooms)
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
      expect(flipped, '開き先の切替は例外的').toBeLessThan(doors * 0.05)
      expect(entries, '空振り防止（結合セル doma の案も玄関として数える）').toBeGreaterThan(0)
    })
  }

  for (const { name, cfg } of CONDITIONS) {
    it(`${name}: 同じ階の弧の矩形どうしが重ならない`, () => {
      let pairs = 0
      for (const p of candidatePool(cfg)) {
        for (const fl of p.floors) {
          const ds = computeDoors(fl.rooms)
          for (const [i, x] of ds.entries()) {
            for (const y of ds.slice(i + 1)) {
              pairs++
              const p1 = x.swing.rect, q = y.swing.rect
              const ov = p1.x < q.x + q.w - EPS && q.x < p1.x + p1.w - EPS && p1.y < q.y + q.h - EPS && q.y < p1.y + p1.h - EPS
              expect(ov, `${x.a.type}-${x.b.type} vs ${y.a.type}-${y.b.type}`).toBe(false)
            }
          }
        }
      }
      expect(pairs, '空振り防止').toBeGreaterThan(0)
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

  const room = (type: Room['type'], x: number, y: number, w: number, h: number, area = w * h): Room =>
    ({ type, name: type, x, y, w, h, area, target: area, minArea: 4 })
  const near = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.hypot(p.x - q.x, p.y - q.y)

  for (const { name, cfg } of CONDITIONS) it(`${name}: 外接矩形 = {hinge, closed, open} の外接矩形、|hinge−closed| = |hinge−open| = r`, () => {
    let n = 0
    {
      for (const p of candidatePool(cfg)) {
        for (const fl of p.floors) {
          for (const d of computeDoors(fl.rooms)) {
            n++
            const { hinge, closed, open, r, rect } = d.swing
            const xs = [hinge.x, closed.x, open.x], ys = [hinge.y, closed.y, open.y]
            expect(rect.x).toBeCloseTo(Math.min(...xs), 9)
            expect(rect.y).toBeCloseTo(Math.min(...ys), 9)
            expect(rect.x + rect.w).toBeCloseTo(Math.max(...xs), 9)
            expect(rect.y + rect.h).toBeCloseTo(Math.max(...ys), 9)
            expect(near(hinge, closed)).toBeCloseTo(r, 9)
            expect(near(hinge, open)).toBeCloseTo(r, 9)
          }
        }
      }
    }
    expect(n).toBeGreaterThan(0)
  })

  it('開き先の奥行きが 1.8 未満なら r が奥行きに切り詰められる', () => {
    const hall = room('hall', 0, 0, 8, 4)
    const wc = room('wc', 0, 4, 8, 1.2) // 奥行き 1.2
    const e = sharedEdge(hall, wc)
    if (!e) throw new Error('辺なし')
    const s = doorSwing(hall, wc, e)
    expect(s.opens).toBe('b')
    expect(s.r).toBeCloseTo(1.2, 9)
    expect(s.rect.y + s.rect.h).toBeLessThanOrEqual(wc.y + wc.h + EPS)
  })

  it('タイブレーク: 同条件なら面積の小さい方、面積も同じなら y・x の小さい方に開く', () => {
    const small = room('hall', 0, 0, 4, 4, 10)
    const large = room('stair', 4, 0, 4, 4, 16)
    const e1 = sharedEdge(small, large)
    if (!e1) throw new Error('辺なし')
    expect(doorSwing(small, large, e1).opens).toBe('a')
    expect(doorSwing(large, small, e1).opens).toBe('b')
    const top = room('hall', 0, 0, 4, 4, 16)
    const bottom = room('stair', 0, 4, 4, 4, 16)
    const e2 = sharedEdge(top, bottom)
    if (!e2) throw new Error('辺なし')
    expect(doorSwing(top, bottom, e2).opens).toBe('a')
    expect(doorSwing(bottom, top, e2).opens).toBe('b')
    const left = room('hall', 0, 0, 4, 4, 16)
    const right = room('stair', 4, 0, 4, 4, 16)
    const e3 = sharedEdge(left, right)
    if (!e3) throw new Error('辺なし')
    expect(doorSwing(left, right, e3).opens).toBe('a')
    expect(doorSwing(right, left, e3).opens).toBe('b')
  })

  it('重なり回避: 同じ部屋に開く2枚の弧が重なるとき、葉の端寄せ → 開き先の切替の順で避ける', () => {
    // 3×3 の WIC の下辺・右辺... 共有区間が短く、同じ部屋に2枚開く配置
    const wic = room('wic', 0, 0, 3, 4)
    const h1 = room('hall', 3, 0, 3, 4) // 右辺（共有区間 [0,4]）
    const h2 = room('hall', 0, 4, 3, 4) // 下辺（共有区間 [0,3]）
    const ds = computeDoors([wic, h1, h2])
    const into = ds.filter((d) => (d.swing.opens === 'a' ? d.a : d.b) === wic)
    expect(ds.length).toBeGreaterThanOrEqual(2)
    for (const [i, x] of into.entries()) {
      for (const y of into.slice(i + 1)) {
        const p = x.swing.rect, q = y.swing.rect
        expect(p.x < q.x + q.w - EPS && q.x < p.x + p.w - EPS && p.y < q.y + q.h - EPS && q.y < p.y + p.h - EPS).toBe(false)
      }
    }
  })
})
