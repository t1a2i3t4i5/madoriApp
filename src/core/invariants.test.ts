import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { ROOM } from './rooms'
import { CONDITIONS, LIVING, PARTIAL_CONDITIONS, SEEDS, paint } from './testing'
import type { Plan } from './types'

/** 階の板。types.ts の floorRect とは別に素朴に書く（fp がなければ建物全体） */
const rectOf = (p: Plan, f: number) => p.floors[f]?.fp ?? { x: 0, y: 0, W: p.W, H: p.H }

const ALL = [...CONDITIONS, ...PARTIAL_CONDITIONS]

describe('validator と独立した構造検証', () => {
  for (const { name, cfg } of ALL) {
    it(`${name}: 全セルが過不足なく1部屋で塗られる（重なり・隙間なし）`, () => {
      let n = 0
      for (const seed of SEEDS) {
        for (const p of generatePlans(cfg, seed)) {
          n++
          expect(p.floors).toHaveLength(cfg.floors)
          for (let f = 0; f < p.floors.length; f++) {
            const grid = paint(p, f)
            const rc = rectOf(p, f)
            for (let y = 0; y < p.H; y++) {
              for (let x = 0; x < p.W; x++) {
                const inside = x >= rc.x && x < rc.x + rc.W && y >= rc.y && y < rc.y + rc.H
                expect(grid[y]?.[x], `seed=${seed} floor=${f} (${x},${y})`).toBe(inside ? 1 : 0)
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
          expect(p.totalArea).toBe(p.floors.reduce((s, _, f) => s + rectOf(p, f).W * rectOf(p, f).H, 0))
          if (cfg.story !== 'partial') expect(p.totalArea).toBe(p.W * p.H * cfg.floors)
          for (const [f, fl] of p.floors.entries()) {
            const rc = rectOf(p, f)
            for (const r of fl.rooms) {
              for (const v of [r.x, r.y, r.w, r.h, r.area]) expect(Number.isInteger(v), `${r.name}: ${v}`).toBe(true)
              expect(r.x).toBeGreaterThanOrEqual(rc.x)
              expect(r.y).toBeGreaterThanOrEqual(rc.y)
              expect(r.w).toBeGreaterThan(0)
              expect(r.h).toBeGreaterThan(0)
              expect(r.area).toBe(r.w * r.h)
              expect(r.x + r.w).toBeLessThanOrEqual(rc.x + rc.W)
              expect(r.y + r.h).toBeLessThanOrEqual(rc.y + rc.H)
            }
          }
        }
      }
    })

    it(`${name}: 居室はすべて外壁に接している`, () => {
      let livingRooms = 0
      for (const seed of SEEDS) {
        for (const p of generatePlans(cfg, seed)) {
          for (const [f, fl] of p.floors.entries()) {
            const rc = rectOf(p, f)
            for (const r of fl.rooms) {
              if (!LIVING.has(r.type)) continue
              livingRooms++
              const touches = r.x === rc.x || r.y === rc.y || r.x + r.w === rc.x + rc.W || r.y + r.h === rc.y + rc.H
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
