import { describe, expect, it } from 'vitest'
import { clampFloor } from './floor'
import { generatePlans } from '../core/generate'
import { CONDITIONS } from '../core/testing'

describe('clampFloor', () => {
  it('範囲内はそのまま', () => {
    expect(clampFloor(0, 2)).toBe(0)
    expect(clampFloor(1, 2)).toBe(1)
  })
  it('2Fタブ選択中に平屋へ変わっても 0 になる（クラッシュ回帰）', () => {
    expect(clampFloor(1, 1)).toBe(0)
  })
  it('負値や空は 0', () => {
    expect(clampFloor(-1, 2)).toBe(0)
    expect(clampFloor(3, 0)).toBe(0)
  })
  it('平屋プランに対して 2F 選択をクランプすると floors[...] が必ず存在する', () => {
    const flat = CONDITIONS.find((c) => c.cfg.floors === 1)
    expect(flat).toBeDefined()
    if (!flat) return
    const plans = generatePlans(flat.cfg, 1)
    expect(plans.length).toBeGreaterThan(0)
    for (const p of plans) expect(p.floors[clampFloor(1, p.floors.length)]).toBeDefined()
  })
})
