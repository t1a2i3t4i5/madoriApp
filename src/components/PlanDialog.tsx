import { useEffect, useRef, useState } from 'react'
import type { PlanConfig, ScoredPlan } from '../core/types'
import { planName, planTags } from '../core/describe'
import { FloorSvg } from './FloorSvg'
import { FloorTabs } from './FloorTabs'
import { SiteSvg } from './SiteSvg'
import { meters, tatami } from '../lib/format'
import { clampFloor } from '../lib/floor'

interface Props {
  cfg: PlanConfig
  plan: ScoredPlan
  initialFloor: number
  onClose: () => void
}

export function PlanDialog({ cfg, plan, initialFloor, onClose }: Props) {
  const [selectedFloor, setFloor] = useState(initialFloor)
  const floor = clampFloor(selectedFloor, plan.floors.length)
  const closeRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const name = planName(cfg, plan)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(10,12,11,.62)] px-3 py-[18px]" role="dialog" aria-modal="true" aria-labelledby="dlgTitle" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-[860px] rounded-2xl bg-surface p-5 shadow-panel">
        <button ref={closeRef} type="button" aria-label="閉じる" onClick={onClose} className="float-right size-10 cursor-pointer rounded-full border border-line bg-surface text-lg leading-none text-ink">×</button>
        <h2 id="dlgTitle" className="mr-10 mb-1 font-serif text-[22px] leading-[1.4]">{name}</h2>
        <div className="mb-2.5 text-[13px] text-ink2">
          実測延床 約{(plan.totalArea / 16).toFixed(1)}坪 ／ 建物 {meters(plan.W)}m × {meters(plan.H)}m ／ スコア {plan.score.total}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {planTags(cfg, plan).map((t) => <span key={t} className="rounded-full bg-surface2 px-[9px] py-[3px] text-[11.5px] font-bold text-ink2">{t}</span>)}
        </div>
        {cfg.floors === 2 && <FloorTabs value={floor} onChange={setFloor} />}
        <div className="mt-2.5 rounded-[9px] border border-[#e3e0d2] bg-paper p-3">
          <FloorSvg plan={plan} floorIdx={floor} uid="dlg" kitchenFace={cfg.feats.includes('kitchenFace')} siteStrip />
        </div>
        <div className="mt-4 grid gap-[18px] max-[640px]:grid-cols-1 min-[641px]:grid-cols-2">
          <div>
            <h3 className="mb-2 text-[13px] tracking-[.06em] text-ink2">部屋一覧</h3>
            {plan.floors.map((fl) => (
              <table key={fl.label} className="w-full border-collapse text-[13px]">
                <thead><tr><th colSpan={3} className="border-b border-line px-1.5 py-[5px] text-left">{fl.label}</th></tr></thead>
                <tbody>
                  {fl.rooms.map((r, i) => (
                    <tr key={i}>
                      <td className="border-b border-line px-1.5 py-[5px]">{r.name}</td>
                      <td className="border-b border-line px-1.5 py-[5px] text-right whitespace-nowrap tabular-nums">{meters(r.w)}×{meters(r.h)}m</td>
                      <td className="border-b border-line px-1.5 py-[5px] text-right whitespace-nowrap tabular-nums">{tatami(r.w, r.h)}畳</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
          <div>
            <h3 className="mb-2 text-[13px] tracking-[.06em] text-ink2">スコア内訳</h3>
            {Object.entries(plan.score.parts).map(([k, v]) => (
              <div key={k} className="mb-1.5 grid grid-cols-[86px_1fr_30px] items-center gap-2 text-[12.5px]">
                <span>{k}</span>
                <span className="h-[7px] overflow-hidden rounded bg-surface2"><i className="block h-full bg-accent" style={{ width: `${Math.round(v * 100)}%` }} /></span>
                <b className="text-right tabular-nums">{Math.round(v * 100)}</b>
              </div>
            ))}
            <h3 className="mt-[18px] mb-2 text-[13px] tracking-[.06em] text-ink2">敷地のイメージ（南道路）</h3>
            <div className="rounded-[9px] border border-[#e3e0d2] bg-paper p-2"><SiteSvg cfg={cfg} plan={plan} /></div>
          </div>
        </div>
      </div>
    </div>
  )
}
