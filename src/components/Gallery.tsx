import type { PlanConfig, ScoredPlan } from '../core/types'
import { planKey } from '../core/enumerate'
import { PlanCard } from './PlanCard'

interface Props {
  cfg: PlanConfig
  /** 表示する案（多様性を優先して選んだ上位） */
  plans: ScoredPlan[]
  /** この条件の候補の総数 */
  total: number
  isStarred: (plan: ScoredPlan) => boolean
  onToggleStar: (plan: ScoredPlan) => void
  onOpen: (plan: ScoredPlan, floor: number) => void
  onClose: () => void
}

/** この条件の候補（多様性を優先して選んだ上位をスコア順に表示）。左右反転だけの重複は除いてある */
export function Gallery({ cfg, plans, total, isStarred, onToggleStar, onOpen, onClose }: Props) {
  const scale = { maxW: Math.max(0, ...plans.map((p) => p.W)), maxH: Math.max(0, ...plans.map((p) => p.H)) }
  return (
    <section id="gallery" aria-label="全候補" className="mt-8">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-serif text-[21px]">この条件の候補（上位{plans.length}案／全{total}案）</h2>
        <button type="button" onClick={onClose} className="min-h-[42px] cursor-pointer rounded-full border border-line bg-surface px-[18px] py-[9px] text-sm font-bold text-ink2">閉じる</button>
      </div>
      <p className="mb-3 text-[13px] text-ink2">アーキタイプ × 外形 × 並べ替えの組み合わせを全部作り、似た案が並ばないように選んだ上位を、スコアの高い順に並べています（左右反転だけの違いは除外）。</p>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        {plans.map((p, i) => (
          <PlanCard
            key={planKey(p)}
            cfg={cfg}
            plan={p}
            index={i}
            uidPrefix="g"
            scale={scale}
            onOpen={(floor) => onOpen(p, floor)}
            starred={isStarred(p)}
            onToggleStar={() => onToggleStar(p)}
          />
        ))}
      </div>
    </section>
  )
}
