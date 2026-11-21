export const MM = 455
export const meters = (cells: number, digits = 2) => ((cells * MM) / 1000).toFixed(digits)
export { tatami } from '../core/rooms'
