import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { enumeratePlans } from './enumerate'
import { computeDoors, doorSwingRect, openingPassage } from './derive'
import { PROGRAM, furnish, isVerticalLabel, kitchenCounter, labelRects, labelSpot, labelSpots, overlaps } from './furnish'
import { CONDITIONS, SEEDS } from './testing'
import { minShort } from './rooms'
import type { PlanConfig, Room, ScoredPlan } from './types'


/** 標本: 条件ごとに候補プールのスコア上位24案 + seed 2つの3案（ギャラリーの多様性優先は極端な形が増えるので使わない） */
function allPlans(): { cfg: PlanConfig; plan: ScoredPlan }[] {
  const out: { cfg: PlanConfig; plan: ScoredPlan }[] = []
  for (const { cfg } of CONDITIONS) {
    for (const plan of enumeratePlans(cfg).slice(0, 24)) out.push({ cfg, plan })
    for (const seed of SEEDS.slice(0, 2)) for (const plan of generatePlans(cfg, seed)) out.push({ cfg, plan })
  }
  return out
}

const PLANS = allPlans()

/** ラベルを省略した部屋の割合の上限（記録用。実測は下のコメント） */
const OMIT_MAX = 0.05

/** 洋室（bed）のうち pred を満たす部屋の数と、ベッドと机を全て置けた数 */
function bedStat(pred: (r: Room) => boolean): { ok: number; total: number } {
  let ok = 0
  let total = 0
  for (const { cfg, plan } of PLANS) {
    for (const fl of plan.floors) {
      const placed = furnish(fl.rooms, computeDoors(fl.rooms), { kitchenFace: cfg.feats.includes('kitchenFace') })
      fl.rooms.forEach((r, i) => {
        if (r.type !== 'bed' || !pred(r)) return
        total++
        if (placed.filter((p) => p.room === i).length === (PROGRAM.bed?.length ?? 0)) ok++
      })
    }
  }
  return { ok, total }
}

describe('家具配置 furnish', () => {
  it('検証対象が空でない', () => {
    expect(PLANS.length).toBeGreaterThan(50)
  })

  it('全案・全階で、部屋内に収まりドア開き・カウンター・他家具と重ならない', () => {
    let items = 0
    for (const { cfg, plan } of PLANS) {
      const kitchenFace = cfg.feats.includes('kitchenFace')
      for (const fl of plan.floors) {
        const doors = computeDoors(fl.rooms)
        const placed = furnish(fl.rooms, doors, { kitchenFace })
        placed.forEach((it, i) => {
          items++
          const r = fl.rooms[it.room]
          expect(r).toBeDefined()
          if (!r) return
          const msg = `${r.type} ${it.kind} ${JSON.stringify(it)}`
          expect(it.x, msg).toBeGreaterThanOrEqual(r.x)
          expect(it.y, msg).toBeGreaterThanOrEqual(r.y)
          expect(it.x + it.w, msg).toBeLessThanOrEqual(r.x + r.w)
          expect(it.y + it.h, msg).toBeLessThanOrEqual(r.y + r.h)
          for (const d of doors) expect(overlaps(it, doorSwingRect(d)), `door ${msg}`).toBe(false)
          if (r.type === 'ldk' && kitchenFace) expect(overlaps(it, kitchenCounter(r)), `counter ${msg}`).toBe(false)
          placed.slice(i + 1).forEach((o) => expect(overlaps(it, o), `${msg} vs ${o.kind}`).toBe(false))
        })
      }
    }
    expect(items).toBeGreaterThan(100)
  })

  // PR2（R-EXT-10 の前提課題）: 家具の判定はラベルを見ないので、部屋の形・ドアの弧だけが制約。実測は LDK 280/280・主寝室 280/280・洋室 570/570（100%）
  it('LDK・主寝室・洋室・書斎は95%以上で（その部屋の家具を全て）置ける', () => {
    const stat = { ldk: { ok: 0, total: 0 }, master: { ok: 0, total: 0 }, bed: { ok: 0, total: 0 }, study: { ok: 0, total: 0 } }
    for (const { cfg, plan } of PLANS) {
      for (const fl of plan.floors) {
        const placed = furnish(fl.rooms, computeDoors(fl.rooms), { kitchenFace: cfg.feats.includes('kitchenFace') })
        fl.rooms.forEach((r, i) => {
          if (r.type !== 'ldk' && r.type !== 'master' && r.type !== 'bed' && r.type !== 'study') return
          stat[r.type].total++
          if (placed.filter((p) => p.room === i).length === (PROGRAM[r.type]?.length ?? 0)) stat[r.type].ok++
        })
      }
    }
    for (const [name, { ok, total }] of Object.entries(stat)) {
      expect(total, name).toBeGreaterThan(20)
      expect(ok / total, `${name} ${ok}/${total}`).toBeGreaterThanOrEqual(0.95)
    }
  })

  it('短辺を満たす洋室に限っても、ベッドと机は95%以上で置ける', () => {
    const { ok, total } = bedStat((r) => Math.min(r.w, r.h) >= minShort('bed'))
    expect(total).toBeGreaterThan(100)
    expect(ok / total, `bed(短辺OK) ${ok}/${total}`).toBeGreaterThanOrEqual(0.95)
  })

  describe('部屋名ラベル labelSpot（家具の後に空いた場所へ置く）', () => {
    /** 全案・全階の、家具のある部屋のラベルの置き場所 */
    function spotStats() {
      let rooms = 0
      let omitted = 0
      let moved = 0
      const overlapsFound: string[] = []
      for (const { cfg, plan } of PLANS) {
        const kitchenFace = cfg.feats.includes('kitchenFace')
        for (const fl of plan.floors) {
          const doors = computeDoors(fl.rooms)
          const items = furnish(fl.rooms, doors, { kitchenFace })
          const swings = doors.map((d) => openingPassage(d) ?? doorSwingRect(d))
          const spots = labelSpots(fl.rooms, doors, items, kitchenFace)
          fl.rooms.forEach((r, i) => {
            const sp = spots[i]
            if (sp === undefined) return
            rooms++
            if (sp === null) {
              omitted++
              return
            }
            if (sp.s !== 1 || sp.cx !== r.x + r.w / 2) moved++
            for (const q of labelRects(r, sp)) {
              for (const it of items) if (it.room === i && overlaps(q, it)) overlapsFound.push(`${r.type} ${it.kind}`)
              for (const s of swings) if (overlaps(q, s)) overlapsFound.push(`${r.type} door`)
              if (r.type === 'ldk' && kitchenFace) {
                if (overlaps(q, kitchenCounter(r))) overlapsFound.push('ldk counter')
              }
            }
          })
        }
      }
      return { rooms, omitted, moved, overlapsFound }
    }

    it('描かれるラベルは、同じ部屋の家具・ドアの弧・カウンターと重ならない', () => {
      const { rooms, overlapsFound } = spotStats()
      expect(rooms).toBeGreaterThan(100)
      expect(overlapsFound).toEqual([])
    })

    it('ラベルを置けずに省略した部屋の割合（記録用の上限）', () => {
      const { rooms, omitted, moved } = spotStats()
      // 実測 51/1230（4.1%）。家具のある部屋のうち、従来の描画でも省く部屋（幅不足）を含む。上限は実測に余裕を足した値
      expect(omitted / rooms, `omitted ${omitted}/${rooms} (moved ${moved})`).toBeLessThanOrEqual(OMIT_MAX)
    })

    it('家具のない部屋は undefined（従来どおり中央に描く）', () => {
      const room = { type: 'bath', name: '浴室', x: 0, y: 0, w: 4, h: 4, area: 16, target: 16, minArea: 8 } as const
      expect(labelSpots([room], [], [], false)).toEqual([undefined])
    })

    it('障害物がなければ既定（中央・倍率1・畳数行つき）をそのまま返す', () => {
      const room = { type: 'master', name: '主寝室', x: 0, y: 0, w: 7, h: 8, area: 56, target: 56, minArea: 40 } as const
      expect(labelSpot(room, false, [])).toEqual({ cx: 3.5, cy: 4, s: 1, layout: 'row', area: true })
      expect(labelRects(room, { cx: 3.5, cy: 4, s: 1, layout: 'row', area: true })).toHaveLength(2)
      expect(labelRects(room, { cx: 3.5, cy: 4, s: 1, layout: 'row', area: false })).toHaveLength(1)
    })

    it('中央が塞がれていると、障害物を避ける位置へずらす', () => {
      const room = { type: 'master', name: '主寝室', x: 0, y: 0, w: 14, h: 10, area: 140, target: 56, minArea: 40 } as const
      const block = { x: 5, y: 3, w: 4, h: 4 }
      const sp = labelSpot(room, false, [block])
      expect(sp).not.toBeNull()
      if (sp) for (const q of labelRects(room, sp)) expect(overlaps(q, block)).toBe(false)
    })

    it('置き場所がなければ null（省略）', () => {
      const room = { type: 'master', name: '主寝室', x: 0, y: 0, w: 6, h: 6, area: 36, target: 56, minArea: 40 } as const
      expect(labelSpot(room, false, [{ x: 0, y: 0, w: 6, h: 6 }])).toBeNull()
    })

    it('縦積みの部屋: 縦長のまま置かれ、横書きにはならない', () => {
      const narrow = { type: 'study', name: '書斎', x: 0, y: 0, w: 2.6, h: 6, area: 16, target: 16, minArea: 8 } as const
      expect(isVerticalLabel(narrow)).toBe(true)
      const sp = labelSpot(narrow, false, [])
      expect(sp?.layout).toBe('stack')
      const [lab] = sp ? labelRects(narrow, sp) : []
      expect(lab).toBeDefined()
      if (lab) {
        expect(lab.h).toBeGreaterThan(lab.w)
        expect(lab.x).toBeGreaterThanOrEqual(0)
        expect(lab.x + lab.w).toBeLessThanOrEqual(narrow.w)
      }
      const wide = { ...narrow, w: 8, h: 6 }
      const wl = labelRects(wide, labelSpot(wide, false, []) ?? { cx: 4, cy: 3, s: 1, layout: 'row', area: false })[0]
      expect(wl && wl.w > wl.h).toBe(true)
    })

    it('幅が足りない横書きの部屋（fit < 0.75）は、従来どおり縦積みか省略で、極小の横書きにしない', () => {
      // 幅 3・名前 5 文字: (3-0.5)/5 = 0.5 < 0.75。高さが足りれば縦積み、足りなければ省略
      const tall = { type: 'store', name: 'ABCDE', x: 0, y: 0, w: 3, h: 9, area: 27, target: 16, minArea: 8 } as const
      const short = { ...tall, h: 4 }
      expect(labelSpot(tall, false, [])?.layout).toBe('stack')
      expect(labelSpot(short, false, [])).toBeNull()
      // 障害物でずらすときも横書きに切り替えない
      const sp = labelSpot(tall, false, [{ x: 0, y: 3, w: 3, h: 3 }])
      if (sp) expect(sp.layout).toBe('stack')
    })
  })

  it('再現性: 同じ入力で同じ結果、入力は破壊されない', () => {
    for (const { cfg, plan } of PLANS.slice(0, 40)) {
      for (const fl of plan.floors) {
        const doors = computeDoors(fl.rooms)
        const before = JSON.stringify(fl.rooms)
        const opts = { kitchenFace: cfg.feats.includes('kitchenFace') }
        expect(JSON.stringify(furnish(fl.rooms, doors, opts))).toBe(JSON.stringify(furnish(fl.rooms, doors, opts)))
        expect(JSON.stringify(fl.rooms)).toBe(before)
      }
    }
  })

  it('置けない小部屋では置かない', () => {
    const tiny = { type: 'master', name: '主寝室', x: 0, y: 0, w: 3, h: 3, area: 9, target: 62, minArea: 40 } as const
    expect(furnish([tiny], [], { kitchenFace: false })).toEqual([])
  })
})
