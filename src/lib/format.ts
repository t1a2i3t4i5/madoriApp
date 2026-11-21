export const MM = 455
export const meters = (cells: number, digits = 2) => ((cells * MM) / 1000).toFixed(digits)
export const tatami = (w: number, h: number) => ((w * h) / 8).toFixed(1).replace(/\.0$/, '')
