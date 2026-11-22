import { describe, expect, it } from 'vitest'
import { buildExportSvg, exportSize, parseViewBox, safeFileName } from './exportPng'

const SAMPLE = '<svg viewBox="-2.2 -3.8 20 10" xmlns="http://www.w3.org/2000/svg" role="img" class="block h-auto w-full"><rect x="0" y="0" width="1" height="1"/></svg>'

describe('exportPng（純粋部分）', () => {
  it('viewBox の解析: 正常・不正', () => {
    expect(parseViewBox('-2.2 -3.8 20 10')).toEqual({ x: -2.2, y: -3.8, w: 20, h: 10 })
    expect(parseViewBox('0,0,5,5')).toEqual({ x: 0, y: 0, w: 5, h: 5 })
    expect(parseViewBox('0 0 0 5')).toBeNull()
    expect(parseViewBox('a b c d')).toBeNull()
    expect(parseViewBox('0 0 5')).toBeNull()
    expect(parseViewBox(null)).toBeNull()
  })

  it('出力サイズは幅固定・縦は比率どおり', () => {
    expect(exportSize({ x: 0, y: 0, w: 20, h: 10 }, 1000)).toEqual({ width: 1000, height: 500 })
  })

  it('buildExportSvg: サイズ・フォント・背景矩形を足し、class を除く。中身は保つ', () => {
    const r = buildExportSvg(SAMPLE, 800)
    if (!r) throw new Error('null')
    expect(r.width).toBe(800)
    expect(r.height).toBe(400)
    expect(r.svg).toContain('width="800" height="400"')
    expect(r.svg).toContain('font-family=')
    expect(r.svg).not.toContain('class=')
    expect(r.svg).toContain('viewBox="-2.2 -3.8 20 10"')
    // 背景は最背面（最初の子）で viewBox 全体を覆う
    expect(r.svg).toMatch(/<svg[^>]*><rect x="-2.2" y="-3.8" width="20" height="10" fill="#fdfcf8"\/><rect x="0"/)
  })

  it('xmlns がなければ補う。svg でない・viewBox なしは null', () => {
    const r = buildExportSvg('<svg viewBox="0 0 4 2"></svg>')
    expect(r?.svg).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(buildExportSvg('<div></div>')).toBeNull()
    expect(buildExportSvg('<svg></svg>')).toBeNull()
  })

  it('safeFileName', () => {
    expect(safeFileName('上下で分ける/2F: 案?')).toBe('上下で分ける_2F_案')
    expect(safeFileName('///')).toBe('madori')
  })
})
