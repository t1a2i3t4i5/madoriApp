import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { enumeratePlans } from './enumerate'
import { computeDoors, doorSwingRect } from './derive'
import { furnish, isVerticalLabel, kitchenCounter, labelRect, overlaps, type FurnitureItem } from './furnish'
import { CONDITIONS, SEEDS } from './testing'
import type { PlanConfig, ScoredPlan } from './types'

function allPlans(): { cfg: PlanConfig; plan: ScoredPlan }[] {
  const out: { cfg: PlanConfig; plan: ScoredPlan }[] = []
  for (const { cfg } of CONDITIONS) {
    for (const plan of enumeratePlans(cfg)) out.push({ cfg, plan })
    for (const seed of SEEDS.slice(0, 2)) for (const plan of generatePlans(cfg, seed)) out.push({ cfg, plan })
  }
  return out
}

const PLANS = allPlans()

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
          for (const d of doors) expect(overlaps(it, doorSwingRect(d.edge)), `door ${msg}`).toBe(false)
          if (r.type === 'ldk' && kitchenFace) expect(overlaps(it, kitchenCounter(r)), `counter ${msg}`).toBe(false)
          expect(overlaps(it, labelRect(r, kitchenFace)), `label ${msg}`).toBe(false)
          placed.slice(i + 1).forEach((o) => expect(overlaps(it, o), `${msg} vs ${o.kind}`).toBe(false))
        })
      }
    }
    expect(items).toBeGreaterThan(100)
  })

  it('LDK と主寝室は8割以上で（その部屋の家具を全て）置ける', () => {
    const stat = { ldk: { ok: 0, total: 0 }, master: { ok: 0, total: 0 } }
    for (const { cfg, plan } of PLANS) {
      for (const fl of plan.floors) {
        const placed = furnish(fl.rooms, computeDoors(fl.rooms), { kitchenFace: cfg.feats.includes('kitchenFace') })
        const count = (i: number, kind: FurnitureItem['kind']) => placed.some((p) => p.room === i && p.kind === kind)
        fl.rooms.forEach((r, i) => {
          if (r.type === 'ldk') {
            stat.ldk.total++
            if (count(i, 'tv') && count(i, 'sofa') && count(i, 'dining')) stat.ldk.ok++
          }
          if (r.type === 'master') {
            stat.master.total++
            if (count(i, 'bed2')) stat.master.ok++
          }
        })
      }
    }
    for (const [name, { ok, total }] of Object.entries(stat)) {
      expect(total, name).toBeGreaterThan(20)
      expect(ok / total, `${name} ${ok}/${total}`).toBeGreaterThanOrEqual(0.8)
    }
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

  it('縦積みラベルの部屋: ラベル領域は縦長で、家具はそこを避ける', () => {
    const narrow = { type: 'study', name: '書斎', x: 0, y: 0, w: 2.6, h: 6, area: 16, target: 16, minArea: 8 } as const
    expect(isVerticalLabel(narrow)).toBe(true)
    const lab = labelRect(narrow, false)
    expect(lab.h).toBeGreaterThan(lab.w) // 横書き前提の見積もり（幅広・低い）ではない
    expect(lab.x).toBeGreaterThanOrEqual(0)
    expect(lab.x + lab.w).toBeLessThanOrEqual(narrow.w)
    expect(lab.y + lab.h).toBeLessThanOrEqual(narrow.h + 0.5)
    for (const it of furnish([narrow], [], { kitchenFace: false })) expect(overlaps(it, lab), it.kind).toBe(false)
    // 横書きの部屋は従来どおり横長
    const wide = { ...narrow, w: 8, h: 6 }
    expect(isVerticalLabel(wide)).toBe(false)
    expect(labelRect(wide, false).w).toBeGreaterThan(labelRect(wide, false).h)
  })

  it('置けない小部屋では置かない', () => {
    const tiny = { type: 'master', name: '主寝室', x: 0, y: 0, w: 3, h: 3, area: 9, target: 62, minArea: 40 } as const
    expect(furnish([tiny], [], { kitchenFace: false })).toEqual([])
  })
})
