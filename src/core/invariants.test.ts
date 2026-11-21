import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { ROOM } from './rooms'
import { CONDITIONS, SEEDS } from './testing'
import type { Plan } from './types'

/**
 * validatePlan とは独立した検証。validator 自身のバグで不正なプランが素通りしないよう、
 * 同じ関数（touchesOuterWall など）は使わず、セル塗りと素朴な座標比較で確かめる。
 */
const LIVING = new Set(['ldk', 'master', 'bed', 'study', 'washitsu']) // rooms.ts の HABITABLE と同じ定義を独立に持つ

function paint(plan: Plan, floorIdx: number): number[][] {
  const grid = Array.from({ length: plan.H }, () => Array.from({ length: plan.W }, () => 0))
  const fl = plan.floors[floorIdx]
  if (!fl) throw new Error(`floor ${floorIdx} がない`)
  for (const r of fl.rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const row = grid[y]
        if (!row || row[x] === undefined) throw new Error(`${r.name} が外形(${plan.W}x${plan.H})の外にはみ出している`)
        row[x] = (row[x] ?? 0) + 1
      }
    }
  }
  return grid
}

describe('validator と独立した構造検証', () => {
  for (const { name, cfg } of CONDITIONS) {
    it(`${name}: 全セルが過不足なく1部屋で塗られる（重なり・隙間なし）`, () => {
      let n = 0
      for (const seed of SEEDS) {
        for (const p of generatePlans(cfg, seed)) {
          n++
          expect(p.floors).toHaveLength(cfg.floors)
          for (let f = 0; f < p.floors.length; f++) {
            const grid = paint(p, f)
            for (let y = 0; y < p.H; y++) {
              for (let x = 0; x < p.W; x++) {
                expect(grid[y]?.[x], `seed=${seed} floor=${f} (${x},${y})`).toBe(1)
              }
            }
          }
        }
      }
      expect(n, '空振り防止').toBeGreaterThan(0)
    })

    it(`${name}: 全座標・寸法が正の整数で、面積が w*h と一致する`, () => {
      for (const seed of SEEDS) {
        for (const p of generatePlans(cfg, seed)) {
          expect(Number.isInteger(p.W) && Number.isInteger(p.H)).toBe(true)
          expect(p.totalArea).toBe(p.W * p.H * cfg.floors)
          for (const fl of p.floors) {
            for (const r of fl.rooms) {
              for (const v of [r.x, r.y, r.w, r.h, r.area]) expect(Number.isInteger(v), `${r.name}: ${v}`).toBe(true)
              expect(r.x).toBeGreaterThanOrEqual(0)
              expect(r.y).toBeGreaterThanOrEqual(0)
              expect(r.w).toBeGreaterThan(0)
              expect(r.h).toBeGreaterThan(0)
              expect(r.area).toBe(r.w * r.h)
              expect(r.x + r.w).toBeLessThanOrEqual(p.W)
              expect(r.y + r.h).toBeLessThanOrEqual(p.H)
            }
          }
        }
      }
    })

    it(`${name}: 居室はすべて外壁に接している`, () => {
      let livingRooms = 0
      for (const seed of SEEDS) {
        for (const p of generatePlans(cfg, seed)) {
          for (const fl of p.floors) {
            for (const r of fl.rooms) {
              if (!LIVING.has(r.type)) continue
              livingRooms++
              const touches = r.x === 0 || r.y === 0 || r.x + r.w === p.W || r.y + r.h === p.H
              expect(touches, `seed=${seed} ${fl.label} ${r.name}`).toBe(true)
            }
          }
        }
      }
      expect(livingRooms, '空振り防止').toBeGreaterThan(0)
    })
  }

  it('居室の定義が rooms.ts の ROOM カテゴリと矛盾しない（独立定義のずれ検出）', () => {
    for (const t of LIVING) expect(['living', 'bed']).toContain(ROOM[t as keyof typeof ROOM].cat)
  })
})
