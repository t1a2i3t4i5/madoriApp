import type { Plan } from './types'

/** 部屋重心シグネチャ。mirror=true で左右反転した版 */
export function planSignature(plan: Plan, mirror: boolean): string {
  const pts: string[] = []
  plan.floors.forEach((fl, fi) => {
    for (const r of fl.rooms) {
      let cx = r.x + r.w / 2
      if (mirror) cx = plan.W - cx
      pts.push(`${r.type}:${fi}:${Math.round(cx)},${Math.round(r.y + r.h / 2)}`)
    }
  })
  return pts.sort().join('|')
}

/** アーキタイプ + 部屋重心マップの距離 */
export function planDistance(a: Plan, b: Plan): number {
  const d = a.arch !== b.arch ? 0.45 : 0
  const mapOf = (p: Plan) => {
    const m = new Map<string, [number, number]>()
    p.floors.forEach((fl, fi) => {
      for (const r of fl.rooms) m.set(r.type + fi, [r.x + r.w / 2, r.y + r.h / 2])
    })
    return m
  }
  const ma = mapOf(a)
  const mb = mapOf(b)
  let s = 0, n = 0
  for (const [k, pa] of ma) {
    const pb = mb.get(k)
    if (pb) {
      s += Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / Math.max(a.W, a.H)
      n++
    }
  }
  return d + (n ? s / n : 0)
}
