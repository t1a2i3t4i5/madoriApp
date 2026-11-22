import type { Alt } from '../core/types'

interface Props {
  title: string
  body: string
  alts: Alt[]
  onAlt: (a: Alt) => void
}

/** 無理な条件・生成失敗時に、理由と代替案を出す */
export function Notice({ title, body, alts, onAlt }: Props) {
  return (
    <div className="rounded-[14px] border-[1.5px] border-warn-line bg-warn-bg p-5 text-warn-ink" role="alert">
      <h2 className="mb-2 font-serif text-[19px]">{title}</h2>
      <p className="mb-2 text-sm">{body}</p>
      <div className="no-print mt-3.5 flex flex-wrap gap-2.5">
        {alts.map((a) => (
          <button key={a.label} type="button" onClick={() => onAlt(a)} className="min-h-11 cursor-pointer rounded-full border-[1.5px] border-warn-line bg-surface px-4 py-2.5 text-sm font-extrabold text-ink">{a.label}</button>
        ))}
      </div>
    </div>
  )
}
