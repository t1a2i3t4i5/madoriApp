import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { ROOM } from './rooms'
import { CONDITIONS, LIVING, SEEDS, paint } from './testing'

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
