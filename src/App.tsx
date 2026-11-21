import { useEffect, useMemo, useState } from 'react'
import type { Alt, PlanConfig } from './core/types'
import { generatePlans } from './core/generate'
import { fallbackAlts, feasibility } from './core/program'
import { ConditionForm } from './components/ConditionForm'
import { Notice } from './components/Notice'
import { PlanCard } from './components/PlanCard'
import { PlanDialog } from './components/PlanDialog'
import { decodeHash, encodeHash, type AppState } from './lib/hash'

export default function App() {
  const [state, setState] = useState<AppState>(() => decodeHash(location.hash))
  const [detail, setDetail] = useState<{ index: number; floor: number } | null>(null)

  useEffect(() => {
    history.replaceState(null, '', encodeHash(state))
  }, [state])

  const cfg: PlanConfig = useMemo(
    () => ({ area: state.area, floors: state.floors, rooms: state.rooms, parking: state.parking, garden: state.garden, feats: state.feats }),
    [state.area, state.floors, state.rooms, state.parking, state.garden, state.feats],
  )
  const feas = useMemo(() => feasibility(cfg), [cfg])
  const plans = useMemo(() => (feas.ok ? generatePlans(cfg, state.seed) : []), [feas, cfg, state.seed])

  const patch = (p: Partial<AppState>) => { setState((s) => ({ ...s, ...p })); setDetail(null) }
  const applyAlt = (a: Alt) => patch({ ...a.patch, seed: state.seed + 1 })
  const next = () => patch({ seed: state.seed + 1 })

  const scale = { maxW: Math.max(0, ...plans.map((p) => p.W)), maxH: Math.max(0, ...plans.map((p) => p.H)) }

  let body
  if (!feas.ok) {
    body = <Notice title="この条件では作れません" body={feas.reason} alts={feas.alts} onAlt={applyAlt} />
  } else if (plans.length === 0) {
    body = (
      <Notice
        title="検証を通る案が作れませんでした"
        body="面積は足りていても、部屋の並び（帯の幅・高さ）に収まらず、動線と採光の検証を通過できませんでした。条件を少し緩めると作れます。"
        alts={fallbackAlts(cfg)}
        onAlt={applyAlt}
      />
    )
  } else {
    body = (
      <>
        <div className="mt-0.5 mb-3.5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-[21px]">間取り {plans.length}案</h2>
          <button type="button" onClick={next} className="min-h-[42px] cursor-pointer rounded-full border-[1.5px] border-accent bg-transparent px-[18px] py-[9px] text-sm font-extrabold text-accent active:translate-y-px">別の3案を作る</button>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {plans.map((p, i) => (
            <PlanCard key={`${state.seed}-${i}`} cfg={cfg} plan={p} index={i} scale={scale} onOpen={(floor) => setDetail({ index: i, floor })} />
          ))}
        </div>
      </>
    )
  }

  return (
    <div className="mx-auto max-w-[1180px] px-4 pt-5 pb-10">
      <div className="mt-1.5 mb-[18px]">
        <h1 className="mb-1.5 font-serif text-[clamp(24px,4.5vw,36px)] leading-[1.3] font-bold">条件を選ぶと、間取りが3案出てくる。</h1>
        <p className="max-w-[640px] text-[14.5px] text-ink2">延床・階数・部屋数とこだわりを指定すると、455mmグリッドの上で間取り候補を大量生成し、動線・採光・階段位置を検証して残った中から、顔ぶれの違う3案を並べます。</p>
      </div>
      <div className="grid items-start gap-5 max-[860px]:grid-cols-1 min-[861px]:grid-cols-[340px_1fr]">
        <ConditionForm state={state} onChange={patch} onGenerate={next} />
        <section aria-label="生成結果">
          {body}
          <p className="mt-[22px] text-[11.5px] leading-[1.6] text-ink2">※ 建築基準法・構造は未考慮、敷地は想定の図面です。実際の設計は建築士にご相談ください。寸法は455mmグリッド基準、1坪＝約3.31㎡で換算しています。</p>
        </section>
      </div>
      {detail && plans[detail.index] && (
        <PlanDialog key={`${state.seed}-${detail.index}`} cfg={cfg} plan={plans[detail.index]} initialFloor={detail.floor} onClose={() => setDetail(null)} />
      )}
    </div>
  )
}
