import { useState } from 'react'
import type { PlanConfig, ScoredPlan } from '../core/types'
import { planName, planTags } from '../core/describe'
import { explainPlan } from '../core/explain'
import { FloorSvg } from './FloorSvg'
import { FloorTabs } from './FloorTabs'
import { floorAreaLabel, meters } from '../lib/format'
import { clampFloor } from '../lib/floor'
import { StarButton } from './StarButton'

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
  const open = () => onOpen(floor)
  return (
    // カード全体のクリックはマウス・タッチ用の補助。キーボード・支援技術向けの操作は下の「拡大表示」ボタン（本物の button）が受ける。
    // role=button の中に☆ボタンやタブのボタンを入れ子にしない。
    <article
      onClick={open}
      className="print-card relative w-full cursor-pointer border-t border-ink pt-3 text-left"
    >
      <StarButton starred={starred} onToggle={onToggleStar} className="absolute top-2 right-0" />
      <div className="flex items-baseline gap-3.5">
        <span aria-hidden="true" className="font-serif text-[40px] leading-none font-light tracking-[-.02em] text-accent">{String(index + 1).padStart(2, '0')}</span>
        <p className="mr-10 font-serif text-[20px] leading-[1.35] font-bold tracking-[.02em]">{name}</p>
      </div>
      <div className="mt-2 mb-2.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11.5px] tracking-[.06em] text-ink2">
        <span>実測 <b className="font-bold text-ink">約{(plan.totalArea / 16).toFixed(1)}坪</b></span>
        {floorAreaLabel(plan) && <span>{floorAreaLabel(plan)}</span>}
        <span>{cfg.floors === 2 ? '2階建て' : '平屋'}・{cfg.rooms}個室</span>
        <span>{meters(plan.W, 3).replace(/0+$/, '').replace(/\.$/, '')}m × {meters(plan.H, 3).replace(/0+$/, '').replace(/\.$/, '')}m</span>
      </div>
      <p className="mb-2.5 flex flex-wrap text-[11.5px] font-bold text-ink2">
        {planTags(cfg, plan).map((t, i) => (
          <span key={t} className={`${i === 0 ? 'text-accent' : ''} after:mx-1.5 after:font-normal after:text-line after:content-['・'] last:after:content-none`}>{t}</span>
        ))}
      </p>
      <p className="mb-3 border-l border-line pl-3 text-[12px] leading-[1.8] text-ink2">{explainPlan(cfg, plan)}</p>
      <div className="crop border border-plan-line bg-paper p-2 print:hidden">
        <FloorSvg plan={plan} floorIdx={floor} uid={`${uidPrefix}${index}f${floor}`} kitchenFace={cfg.feats.includes('kitchenFace')} scale={scale} />
      </div>
      {/* 印刷専用: 画面は表示中の階だけなので、印刷時は全階を並べる（pattern id は画面用と分ける） */}
      <div data-print-floors className="hidden gap-2 print:grid print:grid-cols-2" aria-hidden="true">
        {plan.floors.map((_, fi) => (
          <div key={fi} className="border border-plan-line bg-paper p-1.5">
            <FloorSvg plan={plan} floorIdx={fi} uid={`${uidPrefix}${index}p${fi}`} kitchenFace={cfg.feats.includes('kitchenFace')} scale={scale} />
          </div>
        ))}
      </div>
      {cfg.floors === 2 && <FloorTabs value={floor} onChange={setFloor} />}
      <div className="mt-3 flex items-end justify-between gap-3 border-b border-line pb-1 text-[11px] tracking-[.14em] text-ink2">
        <span>スコア</span>
        <b className="font-serif text-[30px] leading-none font-light tracking-normal text-ink">{plan.score.total}</b>
      </div>
      {/* クリックは article の onClick へ伝わって開く（ここに onClick を付けると二重に開く） */}
      <button type="button" aria-label={`${name}を拡大表示`} className="mt-2.5 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-ink underline decoration-ink2 underline-offset-[3px]">タップで拡大表示 →</button>
    </article>
  )
}
