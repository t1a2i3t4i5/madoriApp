/** SVG → PNG 書き出し。純粋な文字列処理（テスト可能）と、ブラウザ API を使う部分を分けている */

const EXPORT_FONT = "'Zen Kaku Gothic New','Hiragino Kaku Gothic ProN','Noto Sans CJK JP','Yu Gothic',sans-serif"
const PAPER = '#fdfcf8'

export interface ViewBox { x: number; y: number; w: number; h: number }

/** viewBox 属性の文字列を解析する。不正なら null */
export function parseViewBox(vb: string | null | undefined): ViewBox | null {
  if (!vb) return null
  const n = vb.trim().split(/[\s,]+/).map(Number)
  const [x, y, w, h] = n
  if (n.length !== 4 || x === undefined || y === undefined || !w || !h || n.some((v) => !Number.isFinite(v)) || w <= 0 || h <= 0) return null
  return { x, y, w, h }
}

/** 出力サイズ（px）。幅を targetWidth に揃え、縦は viewBox の比率で決める */
export function exportSize(vb: ViewBox, targetWidth = 1600): { width: number; height: number } {
  return { width: Math.round(targetWidth), height: Math.round((targetWidth * vb.h) / vb.w) }
}

/**
 * 画面表示用の SVG マークアップを、単体の画像として描ける形にする:
 * width/height・フォント指定を足し、透過を避けるため紙色の背景矩形を最背面に入れる。
 * viewBox がなければ null
 */
export function buildExportSvg(markup: string, targetWidth = 1600): { svg: string; width: number; height: number } | null {
  const open = /<svg\b[^>]*>/.exec(markup)
  if (!open) return null
  const vb = parseViewBox(/\sviewBox="([^"]*)"/.exec(open[0])?.[1])
  if (!vb) return null
  const { width, height } = exportSize(vb, targetWidth)
  let tag = open[0]
    .replace(/\s(width|height|class)="[^"]*"/g, '')
    .replace(/^<svg\b/, `<svg width="${width}" height="${height}" font-family="${EXPORT_FONT}"`)
  if (!/\sxmlns="/.test(tag)) tag = tag.replace(/^<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"')
  const bg = `<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="${PAPER}"/>`
  return { svg: markup.replace(open[0], tag + bg), width, height }
}

/** ファイル名に使えない文字を除く */
export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') || 'madori'
}

/** SVG 要素を canvas に描いて PNG の Blob にする（ブラウザ専用） */
export async function svgElementToPng(el: SVGSVGElement, targetWidth = 1600): Promise<Blob> {
  const built = buildExportSvg(new XMLSerializer().serializeToString(el), targetWidth)
  if (!built) throw new Error('SVG の viewBox を読み取れませんでした')
  const img = new Image()
  img.decoding = 'async'
  const loaded = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('SVG の読み込みに失敗しました'))
  })
  // data URL にすると canvas が汚染されず toBlob できる
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(built.svg)}`
  await loaded
  const canvas = document.createElement('canvas')
  canvas.width = built.width
  canvas.height = built.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas を使えません')
  ctx.drawImage(img, 0, 0, built.width, built.height)
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG の生成に失敗しました'))), 'image/png')
  })
}

/** Blob をファイルとしてダウンロードさせる（ブラウザ専用） */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
