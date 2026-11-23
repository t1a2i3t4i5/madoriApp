import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { enumeratePlans, galleryPlans } from '../core/enumerate'
import { CONDITIONS, PARTIAL_CONDITIONS, defined } from '../core/testing'
import { addFavorite } from '../lib/favorites'
import { FavoritesShelf } from './FavoritesShelf'
import { FloorSvg, shimoyaRects } from './FloorSvg'
import { Gallery } from './Gallery'
import { PlanCard } from './PlanCard'
import { PlanDialog } from './PlanDialog'

/** 描画で例外が出ないことの煙テスト（SSR）。見た目の確認は別途ブラウザで行う */
describe('コンポーネントの描画', () => {
  const { cfg } = defined(CONDITIONS[0])
  const plans = enumeratePlans(cfg)
  const noop = () => {}

  it('FloorSvg: 家具あり/なし。家具は部屋ラベルより前（下層）に描かれる', () => {
    const plan = defined(plans[0])
    const off = renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" kitchenFace />)
    const on = renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" kitchenFace showFurniture />)
    expect(on.length).toBeGreaterThan(off.length)
    expect(on).toContain('aria-hidden="true"')
    expect(on.indexOf('aria-hidden="true"')).toBeLessThan(on.indexOf('LDK</text>'))
    // 家具なしの描画は従来と同じ（家具の g を含まない）
    expect(off).not.toContain('aria-hidden="true"')
  })

  it('FloorSvg: 下屋は2Fに fp があるときだけ描かれ、総二階・1Fでは描かれない', () => {
    const pc = defined(PARTIAL_CONDITIONS[0]).cfg
    const pp = defined(enumeratePlans(pc)[0])
    const f2 = renderToStaticMarkup(<FloorSvg plan={pp} floorIdx={1} uid="t" />)
    expect(f2).toContain('下屋</text>')
    expect(f2).toContain('stroke-dasharray')
    expect(renderToStaticMarkup(<FloorSvg plan={pp} floorIdx={0} uid="t" />)).not.toContain('下屋</text>')
    const full = renderToStaticMarkup(<FloorSvg plan={defined(plans[0])} floorIdx={1} uid="t" />)
    expect(full).not.toContain('下屋</text>')
    expect(full).not.toContain('stroke-dasharray')
    // カード・拡大表示で階別の坪数が出る
    const card = renderToStaticMarkup(<PlanCard cfg={pc} plan={pp} index={0} scale={{ maxW: pp.W, maxH: pp.H }} onOpen={noop} starred={false} onToggleStar={noop} />)
    expect(card).toMatch(/1F 約[\d.]+坪・2F 約[\d.]+坪/)
  })

  it('shimoyaRects: 東西・南の下屋領域が1Fの板から2Fの板を引いた面積になる', () => {
    const outer = { x: 0, y: 0, W: 20, H: 16 }
    const area = (rs: { W: number; H: number }[]) => rs.reduce((s, r) => s + r.W * r.H, 0)
    const ew = shimoyaRects(outer, { x: 0, y: 0, W: 14, H: 16 })
    expect(ew).toEqual([{ x: 14, y: 0, W: 6, H: 16 }])
    const s = shimoyaRects(outer, { x: 0, y: 0, W: 20, H: 11 })
    expect(s).toEqual([{ x: 0, y: 11, W: 20, H: 5 }])
    expect(area(ew)).toBe(20 * 16 - 14 * 16)
    expect(shimoyaRects(outer, outer)).toEqual([])
  })

  it('FloorSvg: 動線は showFlow のときだけ描かれ、部屋ラベルより下（先）。ラベルには白縁取り', () => {
    const plan = defined(plans[0])
    const off = renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" />)
    const on = renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" showFlow />)
    expect(off).not.toContain('data-flow')
    expect(on).toContain('data-flow="guest"')
    expect(on).toContain('data-flow="life"')
    expect(on).toContain('来客動線（玄関→LDK）')
    expect(on.indexOf('data-flow="overlay"')).toBeLessThan(on.indexOf('LDK</text>'))
    expect(on).toMatch(/paint-order="stroke"[^>]*>LDK<\/text>/)
    expect(off).not.toContain('paint-order')
    // 2階（来客・生活の起点がない階）では何も描かない
    expect(renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={1} uid="t" showFlow />)).not.toContain('data-flow="guest"')
  })

  it('FloorSvg: 動線の凡例は viewBox 内の専用の帯にあり、北マーカー・敷地帯・図面と交わらない。線見本は <line>', () => {
    const num = (v: string | undefined) => Number(defined(v))
    let checked = 0
    for (const plan of plans.slice(0, 6)) {
      for (const opts of [{}, { siteStrip: true }, { scale: { maxW: plan.W + 6, maxH: plan.H + 3 } }, { siteStrip: true, scale: { maxW: plan.W, maxH: plan.H } }]) {
        const html = renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" showFlow {...opts} />)
        const [vx, vy, vw, vh] = defined(/viewBox="([^"]*)"/.exec(html)?.[1]).split(' ').map(Number) as [number, number, number, number]
        const legend = defined(/<g data-flow="legend">(.*?)<\/g><\/g><\/g>|<g data-flow="legend">(.*)$/.exec(html)?.[0].slice('<g data-flow="legend">'.length))
        // 凡例の幾何を独立に取り出す: 線見本の端点と、文字の位置・幅（全角で fontSize × 文字数）
        const lines = [...legend.matchAll(/<line x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"[^>]*>/g)]
        const texts = [...legend.matchAll(/<text x="([^"]+)" y="([^"]+)" font-size="([^"]+)"[^>]*>([^<]*)<\/text>/g)]
        expect(lines.length).toBe(texts.length)
        expect(lines.length).toBeGreaterThan(0)
        expect(legend).not.toMatch(/[━┅]/)
        // 破線の系統は本体と同じ dasharray を持つ
        expect(legend).toContain('stroke-dasharray="1.1 0.7"')
        const boxes = [
          ...lines.map((m) => ({ x0: num(m[1]), x1: num(m[3]), y0: num(m[2]) - 0.2, y1: num(m[4]) + 0.2 })),
          ...texts.map((m) => ({ x0: num(m[1]), x1: num(m[1]) + num(m[3]) * defined(m[4]).length, y0: num(m[2]) - num(m[3]), y1: num(m[2]) + num(m[3]) * 0.3 })),
        ]
        // 北マーカー（N と三角）の領域
        const north = { x0: plan.W - 1.2 - 1.2, x1: plan.W - 1.2 + 1.2, y0: -2.2 - 1.8, y1: -2.2 + 1.6 }
        // 図面・敷地帯・玄関ドアの弧の下端（H+2.0 / siteStrip は H+2.5）
        const planBottom = plan.H + ('siteStrip' in opts ? 2.5 : 2.0)
        for (const b of boxes) {
          expect(b.x0).toBeGreaterThanOrEqual(vx)
          expect(b.x1).toBeLessThanOrEqual(vx + vw)
          expect(b.y0).toBeGreaterThanOrEqual(vy)
          expect(b.y1).toBeLessThanOrEqual(vy + vh)
          expect(b.y0).toBeGreaterThanOrEqual(planBottom)
          expect(b.x1 < north.x0 || b.x0 > north.x1 || b.y1 < north.y0 || b.y0 > north.y1).toBe(true)
        }
        // 敷地帯の矩形（H+1.0〜H+2.5）も viewBox に収まる
        if ('siteStrip' in opts) expect(plan.H + 2.5).toBeLessThanOrEqual(vy + vh)
        checked++
      }
    }
    expect(checked).toBe(24)
  })

  it('FloorSvg: 動線を出さないときは viewBox を広げない（敷地帯の下端の切れだけ直す）', () => {
    const plan = defined(plans[0])
    const vb = (html: string) => defined(/viewBox="([^"]*)"/.exec(html)?.[1]).split(' ').map(Number)
    const a = vb(renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" />))
    const b = vb(renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" showFlow />))
    expect(b[3]).toBeGreaterThan(defined(a[3]))
    const c = vb(renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" siteStrip />))
    expect(defined(c[1]) + defined(c[3])).toBeGreaterThanOrEqual(plan.H + 2.5)
  })

  it('PlanCard: 画面は表示中の階だけ、印刷専用ブロックに全階（1F/2F）の図面がある', () => {
    const plan = defined(plans.find((p) => p.floors.length === 2))
    const html = renderToStaticMarkup(<PlanCard cfg={cfg} plan={plan} index={0} scale={{ maxW: plan.W, maxH: plan.H }} onOpen={noop} starred={false} onToggleStar={noop} />)
    const printPart = html.slice(html.indexOf('data-print-floors'))
    expect(printPart).toContain('1Fの間取り図')
    expect(printPart).toContain('2Fの間取り図')
    expect(printPart).toMatch(/^data-print-floors[^>]*class="[^"]*\bhidden\b[^"]*\bprint:grid\b/)
    // 画面用の図面は印刷時に隠す
    expect(html.slice(0, html.indexOf('data-print-floors'))).toMatch(/print:hidden[^>]*><svg/)
    // pattern id が画面用と印刷用で重複しない
    const ids = [...html.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('PlanDialog / Gallery / FavoritesShelf', () => {
    const plan = defined(plans[0])
    expect(renderToStaticMarkup(<PlanDialog cfg={cfg} plan={plan} initialFloor={0} onClose={noop} starred={false} onToggleStar={noop} shareUrl="http://x/#c=1&p=0-1x1" />)).toContain('家具を表示')
    expect(renderToStaticMarkup(<PlanDialog cfg={cfg} plan={plan} initialFloor={0} onClose={noop} starred={false} onToggleStar={noop} />)).toContain('PNGで保存')
    expect(renderToStaticMarkup(<PlanDialog cfg={cfg} plan={plan} initialFloor={0} onClose={noop} starred={false} onToggleStar={noop} />)).toContain('動線を表示')
    expect(renderToStaticMarkup(<Gallery cfg={cfg} plans={galleryPlans(cfg)} total={plans.length} isStarred={() => false} onToggleStar={noop} onOpen={noop} onClose={noop} />)).toContain(`候補（上位${galleryPlans(cfg).length}案／全${plans.length}案）`)
    const r = addFavorite([], cfg, plan, 1)
    if (!r.ok) throw new Error('add failed')
    const old = r.list.map((f) => ({ ...f, v: 0 }))
    const html = renderToStaticMarkup(<FavoritesShelf favorites={old} message={null} onOpen={noop} onRemove={noop} />)
    expect(html).toContain('旧バージョン')
    expect(renderToStaticMarkup(<FavoritesShelf favorites={[]} message={null} onOpen={noop} onRemove={noop} />)).toContain('まだありません')
  })

  it('印刷用CSS: 操作UIを隠し、カードの途中で改ページしない', () => {
    const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8')
    const print = css.slice(css.indexOf('@media print'))
    expect(print).toContain('.no-print')
    expect(print).toMatch(/\.print-card\s*\{[^}]*break-inside:\s*avoid/)
    // ダークモードで使う色変数は、印刷時に明るい配色へ上書きされている
    const dark = css.slice(css.indexOf('prefers-color-scheme: dark'), css.indexOf('@theme'))
    const darkVars = [...dark.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1])
    const printVars = new Set([...print.matchAll(/(--[a-z0-9-]+):/g)].map((m) => m[1]))
    for (const v of darkVars) expect(printVars.has(v), `${v} が印刷で上書きされていない`).toBe(true)
  })

  it('印刷: ボタンを含む文（全候補を見る・代替案）は文ごと no-print。途中で切れた文を残さない', () => {
    const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8')
    // 文の途中にボタンが入る段落
    expect(app).toMatch(/<p role="status" className="no-print[^"]*">\s*この条件で出せる案はここまでです。/)
    expect(app).toMatch(/<div className="no-print mt-4 text-center">\s*<button[\s\S]*?この条件の全候補/)
    expect(app).toMatch(/<div className="no-print mt-2 flex[^"]*">\s*\{diagnosis\.alts\.map/)
    expect(readFileSync(new URL('./Notice.tsx', import.meta.url), 'utf8')).toMatch(/<div className="no-print[^"]*">\s*\{alts\.map/)
  })
})
