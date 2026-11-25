import { useState } from 'react'
import type { PlanConfig, ScoredPlan } from '../core/types'
import { planName, planTags } from '../core/describe'
import { explainPlan } from '../core/explain'
import { FloorSvg } from './FloorSvg'
import { FloorTabs } from './FloorTabs'
import { SiteSvg } from './SiteSvg'
import { explainSite, siteCaption, siteLayout } from '../core/site'
import { floorAreaLabel, meters } from '../lib/format'
import { storageCount } from '../lib/metrics'
import { clampFloor } from '../lib/floor'
import { StarButton } from './StarButton'
import { CARD } from './ui'

interface Props {
  cfg: PlanConfig
  plan: ScoredPlan
  index: number
  scale: { maxW: number; maxH: number }
  onOpen: (floor: number) => void
  starred: boolean
  onToggleStar: () => void
  /** FloorSvg の pattern id 衝突を避ける接頭辞（メインの3案とギャラリーで分ける） */
  uidPrefix?: string
}

export function PlanCard({ cfg, plan, index, scale, onOpen, starred, onToggleStar, uidPrefix = 'c' }: Props) {
  const [selectedFloor, setFloor] = useState(0)
  // 条件変更で階数が減ってもタブ選択が残るため、存在する階にクランプする
  const floor = clampFloor(selectedFloor, plan.floors.length)
  const name = planName(cfg, plan)
  const cl = storageCount(plan)
  const open = () => onOpen(floor)
  return (
    // カード全体のクリックはマウス・タッチ用の補助。キーボード・支援技術向けの操作は下の「拡大表示」ボタン（本物の button）が受ける。
    // role=button の中に☆ボタンやタブのボタンを入れ子にしない。
    <article
      onClick={open}
      className={`print-card relative w-full cursor-pointer overflow-hidden text-left ${CARD}`}
    >
      <StarButton starred={starred} onToggle={onToggleStar} className="absolute top-1.5 right-1.5 z-10" />
      <div className="border-b border-line bg-paper p-1 print:hidden">
        <FloorSvg plan={plan} floorIdx={floor} uid={`${uidPrefix}${index}f${floor}`} kitchenFace={cfg.feats.includes('kitchenFace')} sweepWindows={cfg.garden > 0} scale={scale} />
      </div>
      {/* 印刷専用: 画面は表示中の階だけなので、印刷時は全階を並べる（pattern id は画面用と分ける） */}
      <div data-print-floors className="hidden gap-2 print:grid print:grid-cols-2" aria-hidden="true">
        {plan.floors.map((_, fi) => (
          <div key={fi} className="border border-plan-line bg-paper p-1.5">
            <FloorSvg plan={plan} floorIdx={fi} uid={`${uidPrefix}${index}p${fi}`} kitchenFace={cfg.feats.includes('kitchenFace')} sweepWindows={cfg.garden > 0} scale={scale} />
          </div>
        ))}
        {/* 全階の後に敷地図を1つ足す（R-DRAW-27） */}
        <div className="border border-plan-line bg-paper p-1.5">
          <SiteSvg cfg={cfg} plan={plan} uid={`${uidPrefix}${index}s`} />
          <p className="mt-1 text-[9px] leading-snug text-ink2">{siteCaption(siteLayout(plan, cfg))}</p>
        </div>
      </div>
      <div className="p-4 pt-3">
        {cfg.floors === 2 && <div className="mb-3 -mt-0.5"><FloorTabs value={floor} onChange={setFloor} /></div>}
        <p className="text-[19px] leading-[1.35] font-bold">{name}</p>
        <div className="mt-1.5 mb-2.5 flex flex-wrap gap-x-3.5 gap-y-0.5 text-[12px] text-ink2">
          <span>実測 <b className="font-bold text-ink">約{(plan.totalArea / 16).toFixed(1)}坪</b></span>
          {floorAreaLabel(plan) && <span>{floorAreaLabel(plan)}</span>}
          <span>{cfg.floors === 2 ? '2階建て' : '平屋'}・{cfg.rooms}個室{cl.with > 0 && `（＋収納 ${cl.with}室）`}</span>
          <span>{meters(plan.W, 3).replace(/0+$/, '').replace(/\.$/, '')}m × {meters(plan.H, 3).replace(/0+$/, '').replace(/\.$/, '')}m</span>
        </div>
        <p className="mb-2.5 flex flex-wrap gap-1.5">
          {planTags(cfg, plan).map((t) => (
            <span key={t} className="rounded-full border border-line bg-chip px-2.5 py-0.5 text-[11.5px] font-medium text-ink2">{t}</span>
          ))}
        </p>
        <p className="mb-3 text-[12.5px] leading-[1.8] text-ink2">
          {explainPlan(cfg, plan)}
          {/* 敷地の文は explainPlan とは別（R-TEXT-10）。解説文の後に続ける */}
          {explainSite(cfg, plan) && <span data-site-text> {explainSite(cfg, plan)}</span>}
        </p>
        <div className="flex items-center gap-3 text-[12px] text-ink2">
          <span>スコア</span>
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface2"><i className="block h-full rounded-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, plan.score.total))}%` }} /></span>
          <b className="min-w-7 text-right text-[18px] leading-none font-bold text-ink tabular-nums">{plan.score.total}</b>
        </div>
        {/* クリックは article の onClick へ伝わって開く（ここに onClick を付けると二重に開く） */}
        <button type="button" aria-label={`${name}を拡大表示`} className="mt-3 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-accent">タップで拡大表示 →</button>
      </div>
    </article>
  )
}
