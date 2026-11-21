import type { Plan, ScoreResult } from './types'
import { HABITABLE, ROOM } from './rooms'
import { clamp } from './rng'
import { computeDoors } from './derive'
import { touchesOuterWall } from './validate'

export const SCORE_WEIGHTS = {
  採光: 0.2,
  面積適合: 0.2,
  縦横比: 0.15,
  廊下の少なさ: 0.15,
  '動線・ドア': 0.15,
  水回り集約: 0.1,
  '910モジュール': 0.05,
} as const

/** ソフトスコア: 採光.20 面積適合.20 縦横比.15 廊下率.15 ドア.15 水回り集約.10 モジュール.05 */
export function scorePlan(plan: Plan): ScoreResult {
  let light = 0, lightN = 0, fit = 0, fitN = 0, aspect = 0, aspN = 0
  let hallArea = 0, doorCount = 0, roomCount = 0, mod = 0, modN = 0
  const waters: { x: number; y: number }[] = []
  for (const fl of plan.floors) {
    doorCount += computeDoors(fl.rooms).length
    for (const r of fl.rooms) {
      roomCount++
      if (r.type === 'hall') hallArea += r.area
      if (HABITABLE[r.type]) {
        lightN++
        if (touchesOuterWall(r, plan.W, plan.H)) light++
      }
      if (r.type !== 'hall' && r.type !== 'void' && r.type !== 'stair') {
        const ratio = clamp(r.area / r.target, 0.4, 1.8)
        fit += 1 - Math.min(1, Math.abs(1 - ratio))
        fitN++
        const ar = Math.max(r.w, r.h) / Math.min(r.w, r.h)
        aspect += clamp(1 - (ar - 1) / 3, 0, 1)
        aspN++
      }
      if (r.x % 2 === 0 && r.w % 2 === 0) mod++
      modN++
      if (ROOM[r.type].cat === 'water') waters.push({ x: r.x + r.w / 2, y: r.y + r.h / 2 })
    }
  }
  let waterScore = 1
  if (waters.length >= 2) {
    let cx = 0, cy = 0
    for (const w of waters) { cx += w.x; cy += w.y }
    cx /= waters.length
    cy /= waters.length
    let d = 0
    for (const w of waters) d += Math.hypot(w.x - cx, w.y - cy)
    d /= waters.length
    waterScore = clamp(1 - d / (plan.W * 0.55), 0, 1)
  }
  const parts: Record<string, number> = {
    採光: lightN ? light / lightN : 1,
    面積適合: fitN ? fit / fitN : 1,
    縦横比: aspN ? aspect / aspN : 1,
    廊下の少なさ: clamp(1 - hallArea / plan.totalArea / 0.14, 0, 1),
    '動線・ドア': clamp(doorCount / Math.max(1, roomCount * 0.62), 0, 1),
    水回り集約: waterScore,
    '910モジュール': modN ? mod / modN : 1,
  }
  let total = 0
  for (const k of Object.keys(parts)) total += parts[k] * SCORE_WEIGHTS[k as keyof typeof SCORE_WEIGHTS]
  return { total: Math.round(total * 100), parts }
}
