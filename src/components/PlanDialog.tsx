import { useEffect, useRef, useState } from 'react'
import type { PlanConfig, ScoredPlan } from '../core/types'
import { planName, planTags } from '../core/describe'
import { explainPlan } from '../core/explain'
import { FloorSvg } from './FloorSvg'
import { FloorTabs } from './FloorTabs'
import { SiteSvg } from './SiteSvg'
import { floorAreaLabel, meters, tatami } from '../lib/format'
import { clampFloor } from '../lib/floor'
import { StarButton } from './StarButton'
import { downloadBlob, safeFileName, svgElementToPng } from '../lib/exportPng'

interface Props {
  cfg: PlanConfig
  plan: ScoredPlan
  initialFloor: number
  onClose: () => void
  starred: boolean
  onToggleStar: () => void
  /** この案を直接開く共有リンク（p パラメータ付き）。なければボタンを出さない */
  shareUrl?: string
}

export function PlanDialog({ cfg, plan, initialFloor, onClose, starred, onToggleStar, shareUrl }: Props) {
  const [selectedFloor, setFloor] = useState(initialFloor)
  const floor = clampFloor(selectedFloor, plan.floors.length)
  const closeRef = useRef<HTMLButtonElement>(null)
  const [furniture, setFurniture] = useState(false)
  const [flow, setFlow] = useState(false)
  const [copied, setCopied] = useState<'ok' | 'ng' | null>(null)
  const copy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied('ok')
    } catch {
      setCopied('ng')
    }
  }
  const svgBoxRef = useRef<HTMLDivElement>(null)
  const [pngState, setPngState] = useState<'idle' | 'busy' | 'ng'>('idle')
  /** 表示中の階・家具の ON/OFF をそのまま PNG にする */
  const savePng = async () => {
    const svg = svgBoxRef.current?.querySelector('svg')
    if (!svg) return
    setPngState('busy')
    try {
      const blob = await svgElementToPng(svg)
      downloadBlob(blob, `${safeFileName(`${planName(cfg, plan)}_${plan.floors[floor]?.label ?? ''}`)}.png`)
      setPngState('idle')
    } catch {
      setPngState('ng')
    }
  }
  // onClose は親の再描画のたびに新しい関数になる。ref 経由で最新を呼び、effect は初回マウント時の1回だけ
  // （☆を押した再描画でフォーカスが×ボタンへ飛び、次の Enter/Space でダイアログが閉じるのを防ぐ）
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  const name = planName(cfg, plan)
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(10,12,11,.62)] px-3 py-[18px]" role="dialog" aria-modal="true" aria-labelledby="dlgTitle" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-[860px] rounded-2xl bg-surface p-5 shadow-panel">
        <div className="float-right flex gap-2">
          <StarButton starred={starred} onToggle={onToggleStar} />
          <button ref={closeRef} type="button" aria-label="閉じる" onClick={onClose} className="size-10 cursor-pointer rounded-full border border-line bg-surface text-lg leading-none text-ink">×</button>
        </div>
        <h2 id="dlgTitle" className="mr-10 mb-1 font-serif text-[22px] leading-[1.4]">{name}</h2>
        <div className="mb-2.5 text-[13px] text-ink2">
          実測延床 約{(plan.totalArea / 16).toFixed(1)}坪{floorAreaLabel(plan) ? `（${floorAreaLabel(plan)}）` : ''} ／ 建物 {meters(plan.W)}m × {meters(plan.H)}m ／ スコア {plan.score.total}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {planTags(cfg, plan).map((t) => <span key={t} className="rounded-full bg-surface2 px-[9px] py-[3px] text-[11.5px] font-bold text-ink2">{t}</span>)}
        </div>
        <p className="mt-2.5 text-[13.5px] leading-[1.75] text-ink">{explainPlan(cfg, plan)}</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {cfg.floors === 2 && <FloorTabs value={floor} onChange={setFloor} />}
          <label className="mt-2.5 inline-flex min-h-9 cursor-pointer select-none items-center gap-2 text-[13px] font-bold text-ink2">
            <input type="checkbox" className="size-[17px]" checked={furniture} onChange={(e) => setFurniture(e.target.checked)} />
            家具を表示
          </label>
          <label className="mt-2.5 inline-flex min-h-9 cursor-pointer select-none items-center gap-2 text-[13px] font-bold text-ink2">
            <input type="checkbox" className="size-[17px]" checked={flow} onChange={(e) => setFlow(e.target.checked)} />
            動線を表示
          </label>
          {shareUrl && (
            <button type="button" onClick={copy} className="mt-2.5 min-h-9 cursor-pointer rounded-[7px] border border-line bg-surface px-3 py-1 text-[12.5px] font-bold text-ink2">この案のリンクをコピー</button>
          )}
          <button type="button" onClick={savePng} disabled={pngState === 'busy'} className="no-print mt-2.5 min-h-9 cursor-pointer rounded-[7px] border border-line bg-surface px-3 py-1 text-[12.5px] font-bold text-ink2 disabled:opacity-50">
            {pngState === 'busy' ? '作成中…' : 'PNGで保存'}
          </button>
          {pngState === 'ng' && <span role="status" className="mt-2.5 text-xs text-ink2">PNGを作れませんでした。お使いのブラウザでは対応していない可能性があります</span>}
          <span role="status" className="mt-2.5 text-xs text-ink2">
            {copied === 'ok' && 'コピーしました'}
            {copied === 'ng' && 'コピーできませんでした。アドレスバーのURLをお使いください'}
          </span>
        </div>
        <div ref={svgBoxRef} className="mt-2.5 rounded-[9px] border border-[#e3e0d2] bg-paper p-3">
          <FloorSvg plan={plan} floorIdx={floor} uid="dlg" kitchenFace={cfg.feats.includes('kitchenFace')} siteStrip showFurniture={furniture} showFlow={flow} />
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
