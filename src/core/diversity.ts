import type { Plan, ScoredPlan } from './types'

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
    const m: Record<string, [number, number]> = {}
    p.floors.forEach((fl, fi) => {
      for (const r of fl.rooms) m[r.type + fi] = [r.x + r.w / 2, r.y + r.h / 2]
    })
    return m
  }
  const ma = mapOf(a)
  const mb = mapOf(b)
  let s = 0, n = 0
  for (const k of Object.keys(ma)) {
    if (mb[k]) {
      s += Math.hypot(ma[k][0] - mb[k][0], ma[k][1] - mb[k][1]) / Math.max(a.W, a.H)
      n++
    }
  }
  return d + (n ? s / n : 0)
}

/** 左右反転だけの案を除去し、スコア順に多様性しきい値つきで最大3案を選ぶ */
export function pickDiverse(candidates: ScoredPlan[], count = 3): ScoredPlan[] {
  const uniq: ScoredPlan[] = []
  for (const c of candidates) {
    if (uniq.some((u) => u.sig === c.sig || u.sigM === c.sig)) continue
    uniq.push(c)
  }
  uniq.sort((a, b) => b.score.total - a.score.total)
  const picked: ScoredPlan[] = []
  for (const c of uniq) {
    if (picked.length >= count) break
    if (picked.every((p) => planDistance(p, c) > 0.16)) picked.push(c)
  }
  for (const c of uniq) {
    if (picked.length >= count) break
    if (!picked.includes(c)) picked.push(c)
  }
  return picked
}
