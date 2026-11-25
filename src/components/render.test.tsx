import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { explainPlan } from '../core/explain'
import { explainSite } from '../core/site'
import { enumeratePlans, galleryPlans } from '../core/enumerate'
import { CONDITIONS, PARTIAL_CONDITIONS, defined } from '../core/testing'
import { addFavorite } from '../lib/favorites'
import { FavoritesShelf } from './FavoritesShelf'
import { FloorSvg, shimoyaRects } from './FloorSvg'
import { Gallery } from './Gallery'
import { PlanCard } from './PlanCard'
import { ConditionForm } from './ConditionForm'
import { PlanDialog } from './PlanDialog'
import { SiteSvg } from './SiteSvg'

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

  it('FloorSvg: 折り返し階段（GEN_VERSION 6）。1F は破線の段線と切断線、2F は「下」。階段の口は壁を抜く。旧版の4×4・直進の階段は従来の直進のまま', () => {
    const plan = defined(plans[0])
    const f1 = renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" />)
    const f2 = renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={1} uid="t" />)
    // 段線の破線（切断線より上）は1Fだけ。クローゼットのハンガーパイプの破線（"1.2 0.3 0.2 0.3"）とは別
    expect(f1).toContain('stroke-dasharray="0.4 0.3"')
    expect(f2).not.toContain('stroke-dasharray="0.4 0.3"')
    expect(f2).toContain('>下</text>')
    expect(f1).not.toContain('>下</text>')
    // 階段のラベルは踊り場（上端）に出る
    expect(f1).toMatch(/>階段<\/text>/)
    // 開口: 壁を背景色で抜く線（階段とホールの共有区間。弧は描かない）が1本以上
    expect(f1).toContain('stroke="#fdfcf8" stroke-width="0.4"')
    // 旧版（直進・4×4）の階段: stairGeom が null なので従来どおり。切断線も「下」もない
    const legacy = structuredClone(plan)
    for (const fl of legacy.floors) {
      const st = defined(fl.rooms.find((r) => r.type === 'stair'))
      st.h = 4
      st.area = st.w * st.h
    }
    const old = renderToStaticMarkup(<FloorSvg plan={legacy} floorIdx={1} uid="t" />)
    expect(old).not.toContain('>下</text>')
    expect(old).not.toContain('stroke-dasharray="0.4 0.3"')
  })

  it('FloorSvg: 下屋は2Fに fp があるときだけ描かれ、総二階・1Fでは描かれない', () => {
    const pc = defined(PARTIAL_CONDITIONS[0]).cfg
    const pp = defined(enumeratePlans(pc)[0])
    const f2 = renderToStaticMarkup(<FloorSvg plan={pp} floorIdx={1} uid="t" />)
    expect(f2).toContain('下屋</text>')
    expect(f2).toContain('stroke-dasharray="0.6 0.4"') // 1F 外形の破線（クローゼットのハンガーパイプの破線とは別）
    expect(renderToStaticMarkup(<FloorSvg plan={pp} floorIdx={0} uid="t" />)).not.toContain('下屋</text>')
    const full = renderToStaticMarkup(<FloorSvg plan={defined(plans[0])} floorIdx={1} uid="t" />)
    expect(full).not.toContain('下屋</text>')
    expect(full).not.toContain('stroke-dasharray="0.6 0.4"')
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
    // 西側に下屋が出る（2階の板が東寄り）
    expect(shimoyaRects(outer, { x: 6, y: 0, W: 14, H: 16 })).toEqual([{ x: 0, y: 0, W: 6, H: 16 }])
  })

  it('FloorSvg: 下屋は窓・外壁より先（下層）に描かれる', () => {
    const pp = defined(enumeratePlans(defined(PARTIAL_CONDITIONS[0]).cfg)[0])
    const html = renderToStaticMarkup(<FloorSvg plan={pp} floorIdx={1} uid="t" />)
    const shimoya = html.indexOf('下屋</text>')
    expect(shimoya).toBeGreaterThanOrEqual(0)
    expect(shimoya).toBeLessThan(html.indexOf('stroke="#fdfcf8"')) // 窓（壁抜きの白線）
    expect(shimoya).toBeLessThan(html.indexOf('stroke-width="0.42"')) // 外壁
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
    // 折り返し階段の名前は常に白縁取りを持つ（段線の上で読めるように）ので、それを除いて確かめる
    expect(off.replace(/<text[^>]*>階段<\/text>/g, '')).not.toContain('paint-order')
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

  it('SiteSvg: 駐車の台数・庭・デッキ・生け垣・道路が配置どおりに出る（駐車・庭を変えると図が変わる）', () => {
    const plan = defined(plans[0])
    const site = (parking: number, garden: number) => renderToStaticMarkup(<SiteSvg cfg={{ ...cfg, parking, garden }} plan={plan} uid="t" />)
    const htmls = new Set<string>()
    for (const parking of [0, 1, 2]) for (const garden of [0, 1, 2]) htmls.add(site(parking, garden))
    expect(htmls.size).toBe(9)
    expect(site(2, 1)).toContain('駐車 2台')
    expect(site(0, 1)).not.toContain('駐車')
    expect(site(1, 1)).toContain('>庭</text>')
    expect(site(1, 1)).toContain('デッキ')
    expect(site(1, 0)).toContain('生け垣')
    expect(site(1, 0)).not.toContain('>庭</text>')
    expect(site(1, 1)).toContain('南道路')
    // 間取りの簡略版: LDK と玄関のラベル。家具・動線は描かない
    expect(site(1, 1)).toContain('>LDK</text>')
    expect(site(1, 1)).not.toContain('動線')
    // 図面の pattern id と衝突しない（uid 付き）
    expect(site(1, 1)).toContain('id="deckt"')
  })

  it('FloorSvg: 庭ありの 1F は LDK の南の窓を掃き出しに描き分け、2F・庭なしでは描かない。窓の線（青の二重線）の本数は変わらない', () => {
    const plan = defined(plans.find((p) => p.floors.length === 2))
    const base = renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" />)
    const sweep = renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={0} uid="t" sweepWindows />)
    const count = (h: string, re: RegExp) => (h.match(re) ?? []).length
    expect(count(sweep, /<path d="M [\d.]+ [\d.]+ v 0\.7 M/g)).toBeGreaterThan(0)
    expect(count(base, /<path d="M [\d.]+ [\d.]+ v 0\.7 M/g)).toBe(0)
    expect(count(sweep, /stroke="#2f7fb0"/g)).toBeGreaterThan(count(base, /stroke="#2f7fb0"/g))
    expect(count(sweep, /<line /g)).toBe(count(base, /<line /g))
    expect(count(renderToStaticMarkup(<FloorSvg plan={plan} floorIdx={1} uid="t" sweepWindows />), /v 0\.7 M/g)).toBe(0)
  })

  it('PlanCard: 印刷専用ブロックの全階の後に敷地図が足される。画面用の図面・PNG の対象（表示中の階の図面）には敷地図を入れない', () => {
    const plan = defined(plans.find((p) => p.floors.length === 2))
    const html = renderToStaticMarkup(<PlanCard cfg={cfg} plan={plan} index={0} scale={{ maxW: plan.W, maxH: plan.H }} onOpen={noop} starred={false} onToggleStar={noop} />)
    const printPart = html.slice(html.indexOf('data-print-floors'))
    expect(printPart.indexOf('2Fの間取り図')).toBeLessThan(printPart.indexOf('敷地の配置図'))
    expect(html.slice(0, html.indexOf('data-print-floors'))).not.toContain('敷地の配置図')
    expect(printPart).toContain('敷地の目安')
    const ids = [...html.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    // PNG 書き出しは PlanDialog の図面の箱（svgBoxRef）の最初の svg だけを使う。敷地図はその箱の外にある
    const dlg = readFileSync(new URL('./PlanDialog.tsx', import.meta.url), 'utf8')
    const box = dlg.slice(dlg.indexOf('<div ref={svgBoxRef}'), dlg.indexOf('</div>', dlg.indexOf('<div ref={svgBoxRef}')))
    expect(box).toContain('<FloorSvg')
    expect(box).not.toContain('SiteSvg')
  })

  it('敷地の文: カードは解説文の後、拡大表示は敷地図の下に出る。explainPlan の文には混ぜない。駐車・庭を変えると文が変わる', () => {
    const plan = defined(plans[0])
    const site = explainSite(cfg, plan)
    expect(site).not.toBe('')
    expect(explainPlan(cfg, plan)).not.toContain(site)
    const card = renderToStaticMarkup(<PlanCard cfg={cfg} plan={plan} index={0} scale={{ maxW: plan.W, maxH: plan.H }} onOpen={noop} starred={false} onToggleStar={noop} />)
    expect(card).toContain(site)
    expect(card.indexOf(explainPlan(cfg, plan))).toBeLessThan(card.indexOf(site))
    const dlg = renderToStaticMarkup(<PlanDialog cfg={cfg} plan={plan} initialFloor={0} onClose={noop} starred={false} onToggleStar={noop} />)
    expect(dlg.indexOf('敷地の配置図')).toBeLessThan(dlg.indexOf(site))
    const other = renderToStaticMarkup(<PlanCard cfg={{ ...cfg, parking: 0, garden: 0 }} plan={plan} index={0} scale={{ maxW: plan.W, maxH: plan.H }} onOpen={noop} starred={false} onToggleStar={noop} />)
    expect(other).not.toContain(site)
    expect(other).toContain('生け垣')
  })

  it('ConditionForm: 駐車場・庭は生成に影響しない旨の注記がある', () => {
    const html = renderToStaticMarkup(<ConditionForm state={{ ...cfg, seed: 1 }} onChange={noop} onGenerate={noop} onRandom={noop} />)
    expect(html).toContain('生成には影響しません')
  })

  it('クローゼット付きの案: カードに「＋収納 n室」、部屋一覧に「＋CL」', () => {
    const { cfg: c2 } = defined(CONDITIONS[2])
    const p2 = defined(enumeratePlans(c2).find((q) => q.floors.some((f) => f.rooms.some((r) => r.type === 'closet'))))
    const card = renderToStaticMarkup(<PlanCard cfg={c2} plan={p2} index={0} scale={{ maxW: p2.W, maxH: p2.H }} onOpen={noop} starred={false} onToggleStar={noop} />)
    expect(card).toMatch(/＋収納 \d+室/)
    const dlg = renderToStaticMarkup(<PlanDialog cfg={c2} plan={p2} initialFloor={0} onClose={noop} starred={false} onToggleStar={noop} />)
    expect(dlg).toContain('＋CL')
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
    expect(app).toMatch(/<p role="status" className=\{?[`"]no-print[^>]*>\s*この条件で出せる案はここまでです。/)
    expect(app).toMatch(/<div className="no-print mt-4 text-center">\s*<button[\s\S]*?この条件の全候補/)
    expect(app).toMatch(/<div className="no-print mt-2 flex[^"]*">\s*\{diagnosis\.alts\.map/)
    expect(readFileSync(new URL('./Notice.tsx', import.meta.url), 'utf8')).toMatch(/<div className="no-print[^"]*">\s*\{alts\.map/)
  })
})
