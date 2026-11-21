import { useEffect, useId, useRef, useState } from 'react'
import type { FeatureKey } from '../core/types'
import { FEATURES, type AppState } from '../lib/hash'

interface SegProps<T extends number> {
  label: string
  value: T
  options: { v: T; text: string }[]
  onChange: (v: T) => void
}

function Seg<T extends number>({ label, value, options, onChange }: SegProps<T>) {
  const id = useId()
  return (
    <div className="mb-[18px]">
      <div className="mb-2 text-[14.5px] font-bold" id={id}>{label}</div>
      <div className="flex gap-1 rounded-[10px] bg-surface2 p-1" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={o.v === value}
            onClick={() => onChange(o.v)}
            className={`min-h-10 flex-1 cursor-pointer rounded-[7px] border-0 px-1 py-2 text-sm font-bold ${
              o.v === value ? 'bg-surface text-ink shadow-[0_1px_4px_rgba(0,0,0,.14)]' : 'bg-transparent text-ink2'
            }`}
          >
            {o.text}
          </button>
        ))}
      </div>
    </div>
  )
}

interface AreaSliderProps {
  value: number
  onCommit: (v: number) => void
}

/** 延床スライダー: ドラッグ中は表示値だけ更新し、生成は指を離した時点（change）で走らせる */
function AreaSlider({ value, onCommit }: AreaSliderProps) {
  const [draft, setDraft] = useState(value)
  const [prevValue, setPrevValue] = useState(value)
  if (prevValue !== value) {
    // 外部（代替案ボタンなど）で値が変わったら表示も追従させる
    setPrevValue(value)
    setDraft(value)
  }
  const ref = useRef<HTMLInputElement>(null)
  const commitRef = useRef(onCommit)
  commitRef.current = onCommit
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // React の onChange は input イベントに対応するため、ネイティブの change（確定）を直接購読する
    const handle = () => commitRef.current(Number(el.value))
    el.addEventListener('change', handle)
    return () => el.removeEventListener('change', handle)
  }, [])
  return (
    <>
      <div className="mb-2 flex items-baseline justify-between">
        <label htmlFor="area" className="text-[14.5px] font-bold">延床面積</label>
        <span className="text-[17px] font-black text-accent">{draft}<small className="text-xs font-medium text-ink2"> 坪</small></span>
      </div>
      <input ref={ref} id="area" type="range" min={20} max={40} step={1} value={draft} className="h-9 w-full cursor-pointer" onChange={(e) => setDraft(Number(e.target.value))} />
    </>
  )
}

interface Props {
  state: AppState
  onChange: (patch: Partial<AppState>) => void
  onGenerate: () => void
}

export function ConditionForm({ state, onChange, onGenerate }: Props) {
  const toggle = (k: FeatureKey) =>
    onChange({ feats: state.feats.includes(k) ? state.feats.filter((f) => f !== k) : [...state.feats, k] })
  return (
    <section aria-label="条件入力" className="rounded-[14px] border border-line bg-surface p-[18px] shadow-panel min-[861px]:sticky min-[861px]:top-4">
      <h2 className="mb-3.5 text-[13px] font-bold tracking-[.08em] text-ink2">条件</h2>
      <div className="mb-[18px]">
        <AreaSlider value={state.area} onCommit={(area) => onChange({ area })} />
        <div className="-mt-1 flex justify-between text-[11px] text-ink2"><span>20坪</span><span>30坪</span><span>40坪</span></div>
      </div>
      <Seg label="階数" value={state.floors} options={[{ v: 1, text: '平屋' }, { v: 2, text: '2階建て' }]} onChange={(floors) => onChange({ floors })} />
      <Seg label="個室数（主寝室ふくむ）" value={state.rooms} options={[2, 3, 4, 5].map((v) => ({ v, text: `${v}室` }))} onChange={(rooms) => onChange({ rooms })} />
      <Seg label="駐車場" value={state.parking} options={[{ v: 0, text: 'なし' }, { v: 1, text: '1台' }, { v: 2, text: '2台' }]} onChange={(parking) => onChange({ parking })} />
      <Seg label="庭" value={state.garden} options={[{ v: 0, text: 'なし' }, { v: 1, text: '小さめ' }, { v: 2, text: '広め' }]} onChange={(garden) => onChange({ garden })} />
      <div className="mb-[18px]">
        <div className="mb-2 text-[14.5px] font-bold">こだわり</div>
        <div className="flex flex-wrap gap-2">
          {FEATURES.map((f) => {
            const on = state.feats.includes(f.key)
            return (
              <label key={f.key} className={`inline-flex min-h-[38px] cursor-pointer select-none items-center gap-[7px] rounded-full border-[1.5px] px-[13px] py-[9px] text-[13.5px] ${on ? 'border-accent bg-accent/10 font-bold' : 'border-line bg-chip font-medium'}`}>
                <input type="checkbox" className="m-0 size-[17px] flex-none" checked={on} onChange={() => toggle(f.key)} />
                {f.label}
              </label>
            )
          })}
        </div>
      </div>
      <button type="button" onClick={onGenerate} className="min-h-[50px] w-full cursor-pointer rounded-[11px] border-0 bg-accent p-3 text-base font-black text-accent-ink active:translate-y-px">
        この条件で3案作る
      </button>
      <p className="mt-3 text-[11.5px] leading-[1.55] text-ink2">道路は南側・敷地は矩形を想定。間取りはアイデアスケッチで、建築基準法・構造計算は考慮していません。</p>
    </section>
  )
}
