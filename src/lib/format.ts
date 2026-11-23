export const MM = 455
export const meters = (cells: number, digits = 2) => ((cells * MM) / 1000).toFixed(digits)
export { tatami } from '../core/rooms'

/** 階別の板面積の表示用文字列（部分二階のとき「1F 約◯坪・2F 約◯坪」）。部分二階でなければ null */
export function floorAreaLabel(plan: { W: number; H: number; floors: { fp?: { W: number; H: number } }[] }): string | null {
  if (!plan.floors.some((f) => f.fp)) return null
  return plan.floors
    .map((f, i) => `${i + 1}F 約${(((f.fp?.W ?? plan.W) * (f.fp?.H ?? plan.H)) / 16).toFixed(1)}坪`)
    .join('・')
}
