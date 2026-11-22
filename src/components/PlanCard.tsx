import { useState } from 'react'
import type { PlanConfig, ScoredPlan } from '../core/types'
import { planName, planTags } from '../core/describe'
import { explainPlan } from '../core/explain'
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
    // カード全体のクリックはマウス・タッチ用の補助。キーボード・支援技術向けの操作は下の「拡大表示」ボタン（本物の button）が受ける。
    // role=button の中に☆ボタンやタブのボタンを入れ子にしない。
    <article
      onClick={open}
      className="print-card relative w-full cursor-pointer rounded-[14px] border border-line bg-surface p-3.5 text-left shadow-panel hover:border-accent"
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
      <p className="mb-2.5 text-[12.5px] leading-[1.7] text-ink2">{explainPlan(cfg, plan)}</p>
      <div className="rounded-[9px] border border-[#e3e0d2] bg-paper p-2 print:hidden">
        <FloorSvg plan={plan} floorIdx={floor} uid={`${uidPrefix}${index}f${floor}`} kitchenFace={cfg.feats.includes('kitchenFace')} scale={scale} />
      </div>
      {/* 印刷専用: 画面は表示中の階だけなので、印刷時は全階を並べる（pattern id は画面用と分ける） */}
      <div data-print-floors className="hidden gap-2 print:grid print:grid-cols-2" aria-hidden="true">
        {plan.floors.map((_, fi) => (
          <div key={fi} className="rounded-[9px] border border-[#e3e0d2] bg-paper p-1.5">
            <FloorSvg plan={plan} floorIdx={fi} uid={`${uidPrefix}${index}p${fi}`} kitchenFace={cfg.feats.includes('kitchenFace')} scale={scale} />
          </div>
        ))}
      </div>
      {cfg.floors === 2 && <FloorTabs value={floor} onChange={setFloor} />}
      <div className="mt-2 flex items-center gap-2 text-xs text-ink2">
        <span>スコア</span>
        <span className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-surface2"><i className="block h-full bg-accent" style={{ width: `${plan.score.total}%` }} /></span>
        <b className="text-[13px] text-ink">{plan.score.total}</b>
      </div>
      {/* クリックは article の onClick へ伝わって開く（ここに onClick を付けると二重に開く） */}
      <button type="button" aria-label={`${name}を拡大表示`} className="mt-2.5 cursor-pointer border-0 bg-transparent p-0 text-xs font-bold text-accent">タップで拡大表示 →</button>
    </article>
  )
}
