import { useEffect, useId, useRef, useState } from 'react'
import type { FeatureKey } from '../core/types'
import { FEATURES, type AppState } from '../lib/hash'
import { BTN_PRIMARY, BTN_SECONDARY } from './ui'

interface SegProps<T extends number | string> {
  label: string
  value: T
  options: { v: T; text: string }[]
  onChange: (v: T) => void
  /** 選べない状態（グレーアウト）。補足文 note と併用する */
  disabled?: boolean
  note?: string
}

const ROW = 'py-3'
const LBL = 'text-[13px] font-bold text-ink'

function Seg<T extends number | string>({ label, value, options, onChange, disabled, note }: SegProps<T>) {
  const id = useId()
  return (
    <div className={`${ROW} ${disabled ? 'opacity-50' : ''}`}>
      <div className={`mb-2.5 ${LBL}`} id={id}>{label}</div>
      <div className="flex gap-0.5 rounded-xl bg-surface2 p-0.5" role="group" aria-labelledby={id}>
        {options.map((o) => (
          <button
            key={o.v}
            type="button"
            aria-pressed={o.v === value}
            disabled={disabled}
            onClick={() => onChange(o.v)}
            className={`min-h-11 flex-1 ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} rounded-[10px] border-0 px-2 py-1.5 text-sm ${
              o.v === value ? 'bg-btn font-bold text-btn-ink shadow-panel' : 'bg-transparent font-medium text-ink2'
            }`}
          >
            {o.text}
          </button>
        ))}
      </div>
      {note && <p className="mt-2 text-[11px] leading-[1.55] text-ink2">{note}</p>}
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
      <div className="mb-1 flex items-baseline justify-between">
        <label htmlFor="area" className={LBL}>延床面積</label>
        <span className="text-[28px] leading-none font-bold text-ink">{draft}<small className="text-xs font-normal text-ink2"> 坪</small></span>
      </div>
      <input ref={ref} id="area" type="range" min={20} max={40} step={1} value={draft} className="h-9 w-full cursor-pointer" onChange={(e) => setDraft(Number(e.target.value))} />
    </>
  )
}

interface Props {
  state: AppState
  onChange: (patch: Partial<AppState>) => void
  onGenerate: () => void
  onRandom: () => void
}

export function ConditionForm({ state, onChange, onGenerate, onRandom }: Props) {
  const toggle = (k: FeatureKey) =>
    onChange({ feats: state.feats.includes(k) ? state.feats.filter((f) => f !== k) : [...state.feats, k] })
  return (
    <section aria-label="条件入力" className="p-4 min-[861px]:sticky min-[861px]:top-4 min-[861px]:rounded-2xl min-[861px]:bg-surface min-[861px]:shadow-panel">
      <h2 className="mb-1 text-[17px] font-bold">条件</h2>
      <div className={ROW}>
        <AreaSlider value={state.area} onCommit={(area) => onChange({ area })} />
        <div className="-mt-1 flex justify-between text-[11px] text-ink2"><span>20坪</span><span>30坪</span><span>40坪</span></div>
      </div>
      <Seg label="階数" value={state.floors} options={[{ v: 1, text: '平屋' }, { v: 2, text: '2階建て' }]} onChange={(floors) => onChange({ floors })} />
      <Seg
        label="2階の形"
        value={state.floors === 2 && state.story === 'partial' ? 'partial' : 'full'}
        options={[{ v: 'full', text: '総二階' }, { v: 'partial', text: '部分二階' }]}
        onChange={(story) => onChange({ story })}
        disabled={state.floors === 1}
        note={state.floors === 1 ? '平屋では選べません' : '部分二階は2階を1階より小さくし、1階の屋根（下屋）が出る形です。'}
      />
      <Seg label="個室数（主寝室ふくむ）" value={state.rooms} options={[2, 3, 4, 5].map((v) => ({ v, text: `${v}室` }))} onChange={(rooms) => onChange({ rooms })} />
      <Seg label="駐車場" value={state.parking} options={[{ v: 0, text: 'なし' }, { v: 1, text: '1台' }, { v: 2, text: '2台' }]} onChange={(parking) => onChange({ parking })} />
      <Seg label="庭" value={state.garden} options={[{ v: 0, text: 'なし' }, { v: 1, text: '小さめ' }, { v: 2, text: '広め' }]} onChange={(garden) => onChange({ garden })} note="駐車場・庭は敷地の配置図に反映します（生成には影響しません）。" />
      <div className={ROW}>
        <div className={`mb-2.5 ${LBL}`}>こだわり</div>
        <div className="flex flex-wrap gap-2">
          {FEATURES.map((f) => {
            const on = state.feats.includes(f.key)
            return (
              <label key={f.key} className={`inline-flex min-h-10 cursor-pointer select-none items-center gap-[7px] rounded-[10px] border px-3 text-[13.5px] ${on ? 'border-accent bg-surface2 font-bold text-ink' : 'border-transparent bg-surface2 font-medium text-ink2'}`}>
                <input type="checkbox" className="m-0 size-[16px] flex-none" checked={on} onChange={() => toggle(f.key)} />
                {f.label}
              </label>
            )
          })}
        </div>
      </div>
      <button type="button" onClick={onGenerate} className={`mt-2 min-h-[48px] w-full p-3 text-[15px] ${BTN_PRIMARY}`}>
        この条件で3案作る
      </button>
      <button type="button" onClick={onRandom} className={`mt-2 min-h-11 w-full p-2.5 text-[13px] ${BTN_SECONDARY}`}>
        おまかせ条件で作る
      </button>
      <p className="mt-4 text-[11px] leading-[1.65] text-ink2">道路は南側・敷地は矩形を想定。間取りはアイデアスケッチで、建築基準法・構造計算は考慮していません。</p>
    </section>
  )
}
