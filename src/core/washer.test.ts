import { describe, expect, it } from 'vitest'
import { computeDoors } from './derive'
import { generatePlans } from './generate'
import { CONDITIONS } from './testing'
import { WASHER_SIZE, backDoorPassage, dryPipeLine, doorwayPassage, hasDryPipe, washBasinRect, washerInWash, washerSpot } from './washer'
import { siteLayout } from './site'
import { doorSwingRect, openingPassage } from './derive'
import type { Plan, PlanConfig, Room } from './types'

const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

describe('洗面の洗濯機・室内干しパイプ（R-DRAW-28）', () => {
  const plans: { cfg: PlanConfig; plan: Plan }[] = []
  for (const { cfg } of CONDITIONS.slice(0, 6)) for (const seed of [1, 2, 3]) for (const plan of generatePlans(cfg, seed)) plans.push({ cfg, plan })

  it('標本がある', () => expect(plans.length).toBeGreaterThan(30))

  it('洗濯機は洗面の内側に置かれ、洗面台・ドアの弧と重ならない。置けない洗面は null', () => {
    let placed = 0, total = 0
    for (const { cfg, plan } of plans) {
      const wr = washerInWash(plan)
      if (!wr) continue
      total++
      const doors = computeDoors(plan.floors[0]?.rooms ?? [])
      const bd = siteLayout(plan, cfg).backDoor
      const sp = washerSpot(wr, doors, bd)
      if (!sp) continue
      placed++
      expect(sp.w).toBe(WASHER_SIZE)
      expect(sp.x >= wr.x && sp.y >= wr.y && sp.x + sp.w <= wr.x + wr.w && sp.y + sp.h <= wr.y + wr.h).toBe(true)
      expect(hit(sp, washBasinRect(wr))).toBe(false)
      // 洗面に接するすべてのドア（開く向き・種別を問わない）の弧と、洗面側の戸口の前の通路を避ける
      for (const d of doors) if (d.a === wr || d.b === wr) {
        expect(hit(sp, openingPassage(d) ?? doorSwingRect(d))).toBe(false)
        expect(hit(sp, doorwayPassage(d, wr))).toBe(false)
      }
      if (bd && bd.room === wr) expect(hit(sp, backDoorPassage(bd))).toBe(false)
    }
    expect(total).toBeGreaterThan(0)
    // 戸口の前を空けるので置ける率は下がる（実測 PR-L2 修正後: 人気 CONDITIONS 先頭6条件 × seed 1〜3 で 下限を固定）
    expect(placed / total).toBeGreaterThan(0.5)
  })

  it('室内干しパイプはドアの弧・開口の通路・勝手口の通路と重ならない（2 セル以上。置けなければ描かない）', () => {
    let rooms = 0
    for (const { cfg, plan } of plans) {
      const all = plan.floors[0]?.rooms ?? []
      const doors = computeDoors(all)
      const bd = siteLayout(plan, cfg).backDoor
      for (const r of all) {
        if (!hasDryPipe(r)) continue
        rooms++
        const l = dryPipeLine(r, doors, bd)
        if (!l) continue
        const box = { x: Math.min(l.x1, l.x2) - 0.05, y: Math.min(l.y1, l.y2) - 0.05, w: Math.abs(l.x2 - l.x1) + 0.1, h: Math.abs(l.y2 - l.y1) + 0.1 }
        expect(Math.hypot(l.x2 - l.x1, l.y2 - l.y1)).toBeGreaterThanOrEqual(2)
        for (const d of doors) if (d.a === r || d.b === r) expect(hit(box, openingPassage(d) ?? doorSwingRect(d))).toBe(false)
        if (bd && bd.room === r) expect(hit(box, backDoorPassage(bd))).toBe(false)
      }
    }
    expect(rooms).toBeGreaterThanOrEqual(0)
  })

  it('ランドリーのある案は洗面に洗濯機を描かない', () => {
    const wr: Room = { type: 'laundry', name: 'ランドリー', x: 0, y: 0, w: 4, h: 4 } as Room
    expect(washerInWash({ floors: [{ label: '1階', rooms: [wr] }] } as unknown as Plan)).toBeNull()
  })

  it('室内干しパイプは面積16以上かつ短辺3以上のランドリーだけ', () => {
    const mk = (w: number, h: number, type: Room['type'] = 'laundry') => ({ type, name: '', x: 0, y: 0, w, h }) as Room
    expect(hasDryPipe(mk(4, 4))).toBe(true)
    expect(hasDryPipe(mk(3, 5))).toBe(false) // 面積 15
    expect(hasDryPipe(mk(2, 8))).toBe(false) // 短辺 2
    expect(hasDryPipe(mk(4, 4, 'wash'))).toBe(false)
  })
})
