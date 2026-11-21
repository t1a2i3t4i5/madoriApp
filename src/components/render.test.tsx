import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { enumeratePlans } from '../core/enumerate'
import { CONDITIONS, defined } from '../core/testing'
import { addFavorite } from '../lib/favorites'
import { FavoritesShelf } from './FavoritesShelf'
import { FloorSvg } from './FloorSvg'
import { Gallery } from './Gallery'
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

  it('PlanDialog / Gallery / FavoritesShelf', () => {
    const plan = defined(plans[0])
    expect(renderToStaticMarkup(<PlanDialog cfg={cfg} plan={plan} initialFloor={0} onClose={noop} starred={false} onToggleStar={noop} shareUrl="http://x/#c=1&p=0-1x1" />)).toContain('家具を表示')
    expect(renderToStaticMarkup(<Gallery cfg={cfg} plans={plans} isStarred={() => false} onToggleStar={noop} onOpen={noop} onClose={noop} />)).toContain(`全候補 ${plans.length}案`)
    const r = addFavorite([], cfg, plan, 1)
    if (!r.ok) throw new Error('add failed')
    const old = r.list.map((f) => ({ ...f, v: 0 }))
    const html = renderToStaticMarkup(<FavoritesShelf favorites={old} message={null} onOpen={noop} onRemove={noop} />)
    expect(html).toContain('旧バージョン')
    expect(renderToStaticMarkup(<FavoritesShelf favorites={[]} message={null} onOpen={noop} onRemove={noop} />)).toContain('まだありません')
  })
})
