import { describe, expect, it } from 'vitest'
import { applyVariant, bandsFor, effectiveHN, withNorthH } from './archetypes'
import { sharedEdge } from './derive'
import { bandHall, ENTRY_HALL, ROOM } from './rooms'
import { footprintList, layoutFloor } from './slicing'
import { trimHall } from './hall'
import { stackOvers } from './stack'
import { CONDITIONS } from './testing'
import { CANONICAL, type ArchId, type Room } from './types'

type Sample = { input: Room[]; out: Room[]; plate: { x: number; y: number; W: number; H: number } }

/** 1F の割り付け → trimHall の後（列の積みの入力）と、その結果。条件 × アーキタイプ × 外形 */
function samples(): Sample[] {
  const res: Sample[] = []
  for (const { cfg } of CONDITIONS) {
    for (const arch of [0, 1, 2] as ArchId[]) {
      for (const fp of footprintList(cfg.area * 16, 4)) {
        const b = bandsFor(cfg, arch, 1, fp.W)
        const bands = b && applyVariant(b, 1, CANONICAL, cfg.feats.indexOf('void') >= 0)
        if (!bands) continue
        const l = layoutFloor(fp.W, fp.H, withNorthH(bands, effectiveHN(cfg, CANONICAL)), { closet: 'soft' })
        if (!l) continue
        const plate = { x: 0, y: 0, W: fp.W, H: fp.H }
        const input = trimHall(l.rooms, plate)
        res.push({ input, out: stackOvers(input, plate), plate })
      }
    }
  }
  return res
}

const SAMPLES = samples()
const rectKey = (r: Room) => `${r.type}:${r.x},${r.y},${r.w},${r.h}`
const inRect = (a: Room, b: Room) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h
/** 列の積みで増えた部屋 */
const added = (s: Sample) => {
  const before = new Set(s.input.map(rectKey))
  return s.out.filter((r) => !before.has(rectKey(r)))
}
const stacked = SAMPLES.filter((s) => s.out.length > s.input.length)

describe('stackOvers: 列の積み（R-SPACE-43）', () => {
  it('標本が十分にあり、割られる階が多い', () => {
    expect(SAMPLES.length).toBeGreaterThan(50)
    expect(stacked.length).toBeGreaterThan(20)
  })

  it('入力の部屋を書き換えない（作り直しても入力は同じ内容のまま）', () => {
    for (const s of SAMPLES) {
      const copy = JSON.stringify(s.input)
      const again = stackOvers(s.input, s.plate)
      expect(JSON.stringify(s.input)).toBe(copy)
      expect(JSON.stringify(again)).toBe(JSON.stringify(s.out)) // 純関数（同じ入力は同じ出力）
      for (const r of s.out) expect(s.input.includes(r)).toBe(false) // 部屋のオブジェクトを共有しない
    }
  })

  it('面積は保存され（板を敷き詰めたまま）、増えた部屋は主室の分割か付属か玄関ホール', () => {
    for (const s of stacked) {
      const sum = (rs: Room[]) => rs.reduce((a, r) => a + r.w * r.h, 0)
      expect(sum(s.out)).toBe(sum(s.input))
      for (const r of added(s)) expect(['store', 'closet', 'hall'].includes(r.type) || s.input.some((q) => q.type === r.type)).toBe(true)
    }
  })

  it('付属収納は厚さ 2・面積 6〜16（クローゼットは 8〜16）。玄関ホールは対象外', () => {
    let n = 0
    for (const s of stacked) {
      const before = new Set(s.input.map(rectKey))
      for (const r of s.out) {
        if (!r.of || before.has(rectKey(r))) continue
        n++
        const area = r.w * r.h
        expect(Math.min(r.w, r.h), rectKey(r)).toBe(2)
        expect(area, rectKey(r)).toBeGreaterThanOrEqual(ROOM[r.type === 'closet' ? 'closet' : 'store'].minArea)
        expect(area, rectKey(r)).toBeLessThanOrEqual(16)
        expect(r.minArea).toBe(ROOM[r.type === 'closet' ? 'closet' : 'store'].minArea)
      }
    }
    expect(n).toBeGreaterThan(10)
  })

  it('付属の持ち主は辺を共有する部屋。クローゼットの持ち主は個室、収納の持ち主は主室・ホール・水回り・LDK・玄関・土間・キッチン・個室', () => {
    const OK = ['hall', 'wash', 'laundry', 'master', 'bed', 'ldk', 'doma', 'entry', 'kitchen']
    for (const s of stacked) {
      const before = new Set(s.input.map(rectKey))
      for (const r of s.out) {
        if (!r.of || before.has(rectKey(r))) continue
        const o = s.out.find((q) => q !== r && q.x === r.x + (r.of?.dx ?? 0) && q.y === r.y + (r.of?.dy ?? 0))
        expect(o, rectKey(r)).toBeDefined()
        if (!o) continue
        expect(sharedEdge(o, r), rectKey(r)).not.toBeNull()
        if (r.type === 'closet') expect(['master', 'bed']).toContain(o.type)
        else expect(OK).toContain(o.type)
      }
    }
  })

  it('持ち主の順（個室が先）: 個室が持ち主になった付属が標本にあり、その持ち主は収納のなかった個室', () => {
    let privateOwned = 0
    for (const s of stacked) {
      const before = new Set(s.input.map(rectKey))
      for (const r of s.out) {
        if (!r.of || before.has(rectKey(r)) || r.type === 'hall') continue
        const o = s.out.find((q) => q !== r && q.x === r.x + (r.of?.dx ?? 0) && q.y === r.y + (r.of?.dy ?? 0))
        if (!o || (o.type !== 'master' && o.type !== 'bed')) continue
        privateOwned++
        // 入力の時点で、その個室に収納（クローゼット・持ち主のある収納）はなかった
        const had = s.input.some((q) => q.of && q.x + (q.of.dx) === o.x && q.y + q.of.dy === o.y)
        expect(had, rectKey(o)).toBe(false)
      }
    }
    expect(privateOwned).toBeGreaterThan(0)
  })

  it('1室につき最大3回（増えた部屋は、最大面積を超えた部屋の数 × 3 以下）', () => {
    const over = (r: Room) => !['ldk', 'hall', 'stair', 'void', 'closet', 'store'].includes(r.type) && !r.of && r.w * r.h > ROOM[r.type].maxArea
    for (const s of stacked) {
      const targets = s.input.filter(over).length
      expect(s.out.length - s.input.length, `targets ${targets}`).toBeLessThanOrEqual(targets * 3 + 2) // 玄関・土間は結合セルの最大面積が大きい。それでも超過の数に比例
    }
  })

  it('玄関・土間の北に玄関ホール（type hall）ができ、帯のホールは bandHall で変わらず取れる', () => {
    let n = 0
    for (const s of stacked) {
      const eh = s.out.filter((r) => r.type === 'hall' && r.name === ENTRY_HALL)
      n += eh.length
      expect(eh.length).toBeLessThanOrEqual(2)
      const bh = bandHall(s.out)
      const bh0 = bandHall(s.input)
      expect(bh && { x: bh.x, y: bh.y, w: bh.w, h: bh.h }).toEqual(bh0 && { x: bh0.x, y: bh0.y, w: bh0.w, h: bh0.h })
      for (const h of eh) {
        const below = s.out.find((q) => (q.type === 'entry' || q.type === 'doma') && q.x === h.x && q.w === h.w && q.y === h.y + h.h)
        expect(below, rectKey(h)).toBeDefined()
      }
    }
    expect(n).toBeGreaterThan(0)
  })

  it('洗濯機の部屋（洗面・ランドリー）: 付属をホール側に付けず、東西の外壁に接していたら接したまま', () => {
    let n = 0
    for (const s of stacked) {
      const hall = bandHall(s.input)
      if (!hall) continue
      for (const w of s.input.filter((r) => r.type === 'wash' || r.type === 'laundry')) {
        const parts = s.out.filter((r) => inRect(r, w))
        if (parts.length < 2) continue
        n++
        const main = parts.find((r) => !r.of && (r.type === 'wash' || r.type === 'laundry'))
        expect(main, rectKey(w)).toBeDefined()
        if (!main) continue
        // 付属はホールと辺を共有しない（H 分割でホール側に付けない）か、ホール側にはもともと主室が接していて付属は反対側
        const fills = parts.filter((r) => r !== main)
        const hallTouchedBefore = sharedEdge(w, hall) !== null
        if (hallTouchedBefore) {
          expect(sharedEdge(main, hall), rectKey(w)).not.toBeNull()
          for (const f of fills) if (f.y === w.y || f.y + f.h === w.y + w.h) {
            if (f.w === w.w) expect(sharedEdge(f, hall), rectKey(f)).toBeNull()
          }
        }
        // 東西の外壁への接し方を失わない
        const wallW = w.x === s.plate.x
        const wallE = w.x + w.w === s.plate.x + s.plate.W
        if (wallW) expect(main.x, rectKey(w)).toBe(s.plate.x)
        if (wallE) expect(main.x + main.w, rectKey(w)).toBe(s.plate.x + s.plate.W)
      }
    }
    expect(n).toBeGreaterThan(0)
  })

  it('ホールのない階はそのまま返す（コピー）', () => {
    const rooms: Room[] = [{ type: 'ldk', name: 'LDK', x: 0, y: 0, w: 10, h: 10, area: 100, target: 100, minArea: 60 }]
    const out = stackOvers(rooms, { x: 0, y: 0, W: 10, H: 10 })
    expect(out).toEqual(rooms)
    expect(out[0]).not.toBe(rooms[0])
  })
})
