import type { Alt } from '../core/types'
import { BTN_SECONDARY } from './ui'

interface Props {
  title: string
  body: string
  alts: Alt[]
  onAlt: (a: Alt) => void
}

/** 無理な条件・生成失敗時に、理由と代替案を出す */
export function Notice({ title, body, alts, onAlt }: Props) {
  return (
    <div className="rounded-2xl border border-warn-line bg-warn-bg p-4 text-warn-ink" role="alert">
      <h2 className="mb-2 text-[17px] font-bold">{title}</h2>
      <p className="mb-2 text-sm">{body}</p>
      <div className="no-print mt-3.5 flex flex-wrap gap-2.5">
        {alts.map((a) => (
          <button key={a.label} type="button" onClick={() => onAlt(a)} className={`min-h-11 px-4 py-2.5 text-[13px] ${BTN_SECONDARY}`}>{a.label}</button>
        ))}
      </div>
    </div>
  )
}
