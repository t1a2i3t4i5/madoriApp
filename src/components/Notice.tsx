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
    <div className="border-y border-line border-t-warn-line border-t-2 bg-warn-bg py-4 text-warn-ink" role="alert">
      <h2 className="mb-2 font-serif text-[17px] tracking-[.06em]">{title}</h2>
      <p className="mb-2 text-sm">{body}</p>
      <div className="no-print mt-3.5 flex flex-wrap gap-2.5">
        {alts.map((a) => (
          <button key={a.label} type="button" onClick={() => onAlt(a)} className="min-h-11 cursor-pointer rounded-[1px] border border-ink2 bg-transparent px-4 py-2.5 text-[13px] font-bold text-ink">{a.label}</button>
        ))}
      </div>
    </div>
  )
}
