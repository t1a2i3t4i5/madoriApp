import { describe, expect, it } from 'vitest'
import { enumeratePlans } from '../core/enumerate'
import { CONDITIONS, defined } from '../core/testing'
import type { Plan, Room } from '../core/types'
import { VIA } from '../core/rooms'
import { computeDoors } from '../core/derive'
import { computeFlows } from './flow'

const room = (type: Room['type'], x: number, y: number, w: number, h: number): Room =>
  ({ type, name: type, x, y, w, h, area: w * h, target: 0, minArea: 0 })

/** 手組みの1階: 玄関─ホール─LDK、ホール─洗面─浴室 */
function tiny(): Plan {
  return {
    W: 12, H: 8, arch: 0, totalArea: 96,
    floors: [{ label: '1F', rooms: [
      room('entry', 0, 4, 3, 4), room('hall', 3, 4, 3, 4), room('ldk', 6, 4, 6, 4),
      room('wash', 3, 0, 3, 4), room('bath', 0, 0, 3, 4), room('store', 6, 0, 6, 4),
    ] }],
  }
}

describe('computeFlows', () => {
  it('手組み: 来客動線は玄関→ホール→LDK、生活動線は LDK→…→洗面→浴室。ホールを通る', () => {
    const lines = computeFlows(tiny(), 0)
    const guest = defined(lines.find((l) => l.kind === 'guest'))
    expect(guest.stops[0]).toMatchObject({ role: 'start', x: 1.5, y: 6 })
    expect(guest.stops[guest.stops.length - 1]).toMatchObject({ role: 'end', x: 9, y: 6 })
    expect(guest.stops.filter((s) => s.role === 'via').map((s) => [s.x, s.y])).toEqual([[4.5, 6]])
    const life = defined(lines.find((l) => l.kind === 'life'))
    expect(life.stops[0]).toMatchObject({ role: 'start', x: 9, y: 6 })
    expect(life.stops[life.stops.length - 1]).toMatchObject({ role: 'end', x: 1.5, y: 2 })
    // 洗面（4.5,2）を経由する
    expect(life.stops.some((s) => s.role === 'via' && s.x === 4.5 && s.y === 2)).toBe(true)
  })

  it('結合セル（玄関+土間 = doma）は玄関を兼ね、来客動線の起点になる', () => {
    const p = tiny()
    const merged: Plan = { ...p, floors: [{ label: '1F', rooms: defined(p.floors[0]).rooms.map((r) => (r.type === 'entry' ? { ...r, type: 'doma' as const } : r)) }] }
    const guest = defined(computeFlows(merged, 0).find((l) => l.kind === 'guest'))
    expect(guest.stops[0]).toMatchObject({ role: 'start', x: 1.5, y: 6 })
  })

  it('部屋が無い系統は描かない（玄関なし→来客なし／洗面も浴室もなし→生活なし）', () => {
    const p = tiny()
    const noEntry: Plan = { ...p, floors: [{ label: '1F', rooms: defined(p.floors[0]).rooms.filter((r) => r.type !== 'entry') }] }
    expect(computeFlows(noEntry, 0).map((l) => l.kind)).toEqual(['life'])
    const noWet: Plan = { ...p, floors: [{ label: '1F', rooms: defined(p.floors[0]).rooms.filter((r) => r.type !== 'wash' && r.type !== 'bath') }] }
    expect(computeFlows(noWet, 0).map((l) => l.kind)).toEqual(['guest'])
    expect(computeFlows(p, 5)).toEqual([])
  })

  it('浴室のドアは洗面とだけ付くため、洗面が無い浴室だけでは生活動線を描かない（隣接していても）', () => {
    const base = defined(tiny().floors[0]).rooms.filter((r) => r.type !== 'wash' && r.type !== 'bath')
    const touching: Plan = { ...tiny(), floors: [{ label: '1F', rooms: [...base, room('bath', 3, 0, 3, 4)] }] }
    expect(computeFlows(touching, 0).map((l) => l.kind)).toEqual(['guest'])
    // 他のどの部屋とも辺を共有しない浴室
    const isolated: Plan = { ...tiny(), W: 20, floors: [{ label: '1F', rooms: [...base, room('bath', 16, 0, 3, 4)] }] }
    expect(computeFlows(isolated, 0).map((l) => l.kind)).toEqual(['guest'])
  })

  it('全条件・全階: 座標は外形内、点は2つ以上、階段マーカーは階段室の中心', () => {
    let drawn = 0
    for (const { cfg } of CONDITIONS) {
      for (const plan of enumeratePlans(cfg).slice(0, 20)) {
        for (const [fi, fl] of plan.floors.entries()) {
          const lines = computeFlows(plan, fi)
          expect(new Set(lines.map((l) => l.kind)).size).toBe(lines.length)
          for (const l of lines) {
            drawn++
            expect(l.points.length).toBeGreaterThanOrEqual(2)
            for (const p of [...l.points, ...l.stops]) {
              expect(p.x).toBeGreaterThanOrEqual(0)
              expect(p.x).toBeLessThanOrEqual(plan.W)
              expect(p.y).toBeGreaterThanOrEqual(0)
              expect(p.y).toBeLessThanOrEqual(plan.H)
            }
            expect(l.stops[0]?.role === 'start' || l.stops[0]?.role === 'stair').toBe(true)
            for (const s of l.stops.filter((s) => s.role === 'stair')) {
              expect(s.label).toMatch(/^\dF(へ|から)$/)
              const st = defined(fl.rooms.find((r) => r.type === 'stair'))
              expect([s.x, s.y]).toEqual([st.x + st.w / 2, st.y + st.h / 2])
            }
          }
        }
      }
    }
    expect(drawn).toBeGreaterThan(50)
  })

  it('1Fは来客・生活の2系統。LDK・洗面が1Fなら2Fには動線がなく階段マーカーも出ない', () => {
    const { cfg } = defined(CONDITIONS[0])
    const plan = defined(enumeratePlans(cfg)[0])
    const f1 = computeFlows(plan, 0)
    expect(f1.map((l) => l.kind).sort()).toEqual(['guest', 'life'])
    const wetOn1F = defined(plan.floors[0]).rooms.some((r) => r.type === 'wash' || r.type === 'bath')
    expect(wetOn1F).toBe(true)
    expect(computeFlows(plan, 1)).toEqual([])
  })

  it('2階に洗面がある案: 1Fは階段で「2Fへ」、2Fは階段から「1Fから」', () => {
    const p: Plan = {
      W: 12, H: 8, arch: 0, totalArea: 192,
      floors: [
        { label: '1F', rooms: [room('entry', 0, 4, 3, 4), room('ldk', 3, 4, 6, 4), room('stair', 9, 4, 3, 4), room('store', 0, 0, 12, 4)] },
        { label: '2F', rooms: [room('stair', 9, 4, 3, 4), room('hall', 3, 4, 6, 4), room('wash', 3, 0, 4, 4), room('bath', 7, 0, 5, 4), room('bed', 0, 4, 3, 4)] },
      ],
    }
    // LDK(1F)→洗面(2F)。階段が LDK と接しているので 1F では階段まで
    const f1 = defined(computeFlows(p, 0).find((l) => l.kind === 'life'))
    expect(defined(f1.stops[f1.stops.length - 1])).toMatchObject({ role: 'stair', label: '2Fへ', x: 10.5, y: 6 })
    const f2 = defined(computeFlows(p, 1).find((l) => l.kind === 'life'))
    expect(f2.stops[0]).toMatchObject({ role: 'stair', label: '1Fから' })
    expect(defined(f2.stops[f2.stops.length - 1])).toMatchObject({ role: 'end' })
    // 2F には玄関・LDK がないので来客動線は出ない
    expect(computeFlows(p, 1).some((l) => l.kind === 'guest')).toBe(false)
  })

  it('階段が無くて別の階へつなげない系統は描かない', () => {
    const p: Plan = {
      W: 12, H: 8, arch: 0, totalArea: 192,
      floors: [
        { label: '1F', rooms: [room('ldk', 0, 0, 12, 8)] },
        { label: '2F', rooms: [room('wash', 0, 0, 6, 8), room('bed', 6, 0, 6, 8)] },
      ],
    }
    expect(computeFlows(p, 0)).toEqual([])
    expect(computeFlows(p, 1)).toEqual([])
  })
  it('合成: 近道にキッチンがあってもホール経由を選ぶ。VIA だけで届かないときに限りキッチンを通す', () => {
    // 玄関─キッチン─LDK が一直線（最短）。上の帯のホールは玄関・キッチン・LDK すべてに接する
    const p: Plan = {
      W: 12, H: 8, arch: 0, totalArea: 96,
      floors: [{ label: '1F', rooms: [
        room('hall', 0, 0, 12, 4), room('entry', 0, 4, 3, 4), room('kitchen', 3, 4, 3, 4), room('ldk', 6, 4, 6, 4),
      ] }],
    }
    const guest = defined(computeFlows(p, 0).find((l) => l.kind === 'guest'))
    expect(guest.stops.filter((s) => s.role === 'via').map((s) => [s.x, s.y])).toEqual([[6, 2]])
    // ホールが無く、キッチンだけが玄関とLDKをつなぐ。それでも来客動線は途切れさせない（最後の手段）
    const q: Plan = {
      W: 12, H: 8, arch: 0, totalArea: 96,
      floors: [{ label: '1F', rooms: [room('entry', 0, 4, 3, 4), room('kitchen', 3, 4, 3, 4), room('ldk', 6, 4, 6, 4), room('store', 0, 0, 12, 4)] }],
    }
    const g2 = defined(computeFlows(q, 0).find((l) => l.kind === 'guest'))
    expect(g2.stops.filter((s) => s.role === 'via').map((s) => [s.x, s.y])).toEqual([[4.5, 6]])
  })

  it('全条件の全候補・全階: VIA のみの経路があるのに VIA 以外を経由した動線はない', () => {
    let lines = 0, viaThrough = 0
    for (const { cfg } of CONDITIONS) {
      for (const plan of enumeratePlans(cfg)) {
        for (const [fi, fl] of plan.floors.entries()) {
          const at = (x: number, y: number) => fl.rooms.find((r) => r.x + r.w / 2 === x && r.y + r.h / 2 === y)
          const doors = computeDoors(fl.rooms)
          for (const l of computeFlows(plan, fi)) {
            lines++
            const first = defined(at(defined(l.stops[0]).x, defined(l.stops[0]).y))
            const lastStop = defined(l.stops[l.stops.length - 1])
            const last = defined(at(lastStop.x, lastStop.y))
            const vias = l.stops.filter((s) => s.role === 'via').map((s) => defined(at(s.x, s.y)))
            const nonVia = vias.filter((r) => !VIA[r.type])
            if (!nonVia.length) continue
            // 端点以外は VIA 室だけを通る経路（幅優先）が存在するか
            const seen = new Set<Room>([first])
            const queue = [first]
            while (queue.length) {
              const cur = defined(queue.shift())
              if (cur === last) break
              for (const d of doors) {
                const o = d.a === cur ? d.b : d.b === cur ? d.a : null
                if (!o || seen.has(o) || (o !== last && !VIA[o.type])) continue
                seen.add(o)
                queue.push(o)
              }
            }
            expect(seen.has(last), `${cfg.area}坪 ${fl.label}: VIA だけで届くのに ${nonVia.map((r) => r.type)} を経由`).toBe(false)
            viaThrough++
          }
        }
      }
    }
    expect(lines).toBeGreaterThan(1000)
    // VIA のみの経路がなく例外的に通した動線は、あってもごく一部
    expect(viaThrough).toBeLessThan(lines * 0.05)
  })
})
