export const MM = 455
/** 割合（0〜1）を小数1桁の % に切り捨てて表示する（解説文の pct と同じ丸め） */
export const pctFloor = (v: number) => `${(Math.floor(v * 1000 + 1e-9) / 10).toFixed(1)}%`
export const meters = (cells: number, digits = 2) => ((cells * MM) / 1000).toFixed(digits)
export { tatami } from '../core/rooms'

/** 階別の板面積の表示用文字列（部分二階のとき「1F 約◯坪・2F 約◯坪」）。部分二階でなければ null */
export function floorAreaLabel(plan: { W: number; H: number; floors: { fp?: { W: number; H: number } }[] }): string | null {
  if (!plan.floors.some((f) => f.fp)) return null
  return plan.floors
    .map((f, i) => `${i + 1}F 約${(((f.fp?.W ?? plan.W) * (f.fp?.H ?? plan.H)) / 16).toFixed(1)}坪`)
    .join('・')
}
