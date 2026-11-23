import { Children, useRef, useState, type ReactNode } from 'react'

/**
 * 3案の並び。デスクトップは従来どおりのグリッド、モバイル（860px以下）は横スワイプ（scroll-snap）＋位置ドット。
 * 見た目だけの部品で、印刷では index.css が縦に並べ直す（ドットは no-print）。
 */
export function PlanCarousel({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const items = Children.toArray(children)
  const onScroll = () => {
    const el = ref.current
    if (!el || el.children.length === 0) return
    const first = el.children[0] as HTMLElement
    const step = first.offsetWidth + 12 // gap-3
    setActive(Math.max(0, Math.min(items.length - 1, Math.round(el.scrollLeft / Math.max(1, step)))))
  }
  const go = (i: number) => {
    const el = ref.current
    const child = el?.children[i] as HTMLElement | undefined
    if (el && child) el.scrollTo({ left: child.offsetLeft - el.offsetLeft, behavior: 'smooth' })
  }
  return (
    <>
      <div
        ref={ref}
        onScroll={onScroll}
        className="plan-grid snap-row grid gap-5 min-[861px]:grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] max-[860px]:-mx-4 max-[860px]:flex max-[860px]:snap-x max-[860px]:snap-mandatory max-[860px]:gap-3 max-[860px]:overflow-x-auto max-[860px]:px-4 max-[860px]:pb-1"
      >
        {items.map((c, i) => (
          <div key={i} className="min-w-0 max-[860px]:w-[88%] max-[860px]:flex-none max-[860px]:snap-center">{c}</div>
        ))}
      </div>
      {items.length > 1 && (
        <div className="no-print mt-3 flex justify-center gap-2 min-[861px]:hidden" aria-hidden="true">
          {items.map((_, i) => (
            <span key={i} onClick={() => go(i)} className={`size-2 rounded-full ${i === active ? 'bg-accent' : 'bg-line'}`} />
          ))}
        </div>
      )}
    </>
  )
}
