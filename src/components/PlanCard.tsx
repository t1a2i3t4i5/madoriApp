import { useState } from 'react'
import type { PlanConfig, ScoredPlan } from '../core/types'
import { planName, planTags } from '../core/describe'
import { FloorSvg } from './FloorSvg'
import { FloorTabs } from './FloorTabs'
import { meters } from '../lib/format'
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
    <article
      role="button"
      tabIndex={0}
      aria-label={`${name}を拡大表示`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open() }
      }}
      className="relative w-full cursor-pointer rounded-[14px] border border-line bg-surface p-3.5 text-left shadow-panel hover:border-accent"
    >
      <StarButton starred={starred} onToggle={onToggleStar} className="absolute top-2 right-2" />
      <p className="mb-0.5 mr-10 font-serif text-[17.5px] leading-[1.4] font-bold">{name}</p>
      <div className="mb-2 flex flex-wrap gap-3 text-[12.5px] text-ink2">
        <span>実測 <b className="text-ink">約{(plan.totalArea / 16).toFixed(1)}坪</b></span>
        <span>{cfg.floors === 2 ? '2階建て' : '平屋'}・{cfg.rooms}個室</span>
        <span>{meters(plan.W, 3).replace(/0+$/, '').replace(/\.$/, '')}m × {meters(plan.H, 3).replace(/0+$/, '').replace(/\.$/, '')}m</span>
      </div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {planTags(cfg, plan).map((t, i) => (
          <span key={t} className={`rounded-full px-[9px] py-[3px] text-[11.5px] font-bold ${i === 0 ? 'bg-warm/15 text-warm' : 'bg-surface2 text-ink2'}`}>{t}</span>
        ))}
      </div>
      <div className="rounded-[9px] border border-[#e3e0d2] bg-paper p-2">
        <FloorSvg plan={plan} floorIdx={floor} uid={`${uidPrefix}${index}f${floor}`} kitchenFace={cfg.feats.includes('kitchenFace')} scale={scale} />
      </div>
      {cfg.floors === 2 && <FloorTabs value={floor} onChange={setFloor} />}
      <div className="mt-2 flex items-center gap-2 text-xs text-ink2">
        <span>スコア</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-surface2"><i className="block h-full bg-accent" style={{ width: `${plan.score.total}%` }} /></span>
        <b className="text-[13px] text-ink">{plan.score.total}</b>
      </div>
      <div className="mt-2.5 text-xs font-bold text-accent">タップで拡大表示 →</div>
    </article>
  )
}
