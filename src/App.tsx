import { useEffect, useMemo, useState } from 'react'
import type { Alt, PlanConfig, ScoredPlan } from './core/types'
import { generatePlans } from './core/generate'
import { enumeratePlans, planFromKey, planKey } from './core/enumerate'
import { mulberry32 } from './core/rng'
import { fallbackAlts, feasibility } from './core/program'
import { ConditionForm } from './components/ConditionForm'
import { FavoritesShelf } from './components/FavoritesShelf'
import { Gallery } from './components/Gallery'
import { Notice } from './components/Notice'
import { PlanCard } from './components/PlanCard'
import { PlanDialog } from './components/PlanDialog'
import { encodeHash, parseHash, toConfig, type AppState } from './lib/hash'
import { addFavorite, isFavorited, loadFavorites, removeFavorite, saveFavorites, MAX_FAVORITES, type Favorite, type KeyValueStorage } from './lib/favorites'
import { nextDistinctSeed, plansKey } from './lib/seedNav'
import { randomConfig } from './lib/randomCondition'

/** 戻れる「3案」の履歴の上限（ハッシュには入れない） */
const HISTORY_LIMIT = 20

function getStorage(): KeyValueStorage | null {
  try {
    return window.localStorage
  } catch {
    return null // プライベートモード等
  }
}

interface Detail {
  plan: ScoredPlan
  floor: number
  /** お気に入り棚から開いた場合の保存時条件（現在の条件と違うことがある） */
  favCfg?: PlanConfig
}

export default function App() {
  const [boot] = useState(() => parseHash(location.hash))
  const [state, setState] = useState<AppState>(boot.state)
  const [staleVersion, setStaleVersion] = useState(boot.versionMismatch)
  const [detail, setDetail] = useState<Detail | null>(() => {
    // p パラメータ: その案の拡大表示が開いた状態で開く。作れない案は無視
    const bootCfg = toConfig(boot.state)
    if (boot.planKey === undefined || !feasibility(bootCfg).ok) return null
    const plan = planFromKey(bootCfg, boot.planKey)
    return plan ? { plan, floor: 0 } : null
  })
  const [seedHistory, setSeedHistory] = useState<number[]>([])
  const [exhausted, setExhausted] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [favorites, setFavorites] = useState<Favorite[]>(() => {
    const st = getStorage()
    return st ? loadFavorites(st) : []
  })
  const [favMessage, setFavMessage] = useState<string | null>(null)

  const cfg: PlanConfig = useMemo(
    () => toConfig({ area: state.area, floors: state.floors, rooms: state.rooms, parking: state.parking, garden: state.garden, feats: state.feats }),
    [state.area, state.floors, state.rooms, state.parking, state.garden, state.feats],
  )
  const feas = useMemo(() => feasibility(cfg), [cfg])
  const plans = useMemo(() => (feas.ok ? generatePlans(cfg, state.seed) : []), [feas, cfg, state.seed])
  const allPlans = useMemo(() => (feas.ok ? enumeratePlans(cfg) : []), [feas, cfg])

  const openKey = detail && !detail.favCfg ? planKey(detail.plan) : undefined
  useEffect(() => {
    history.replaceState(null, '', encodeHash(state, openKey))
  }, [state, openKey])

  const resetView = () => { setDetail(null); setStaleVersion(false); setExhausted(false) }
  /** 条件の変更。別条件では seed の履歴も意味を持たないので捨てる */
  const patch = (p: Partial<AppState>) => {
    setState((s) => ({ ...s, ...p }))
    resetView()
    setSeedHistory([])
    setShowGallery(false)
  }
  const applyAlt = (a: Alt) => patch({ ...a.patch, seed: state.seed + 1 })

  /** 別の3案: 3案の組が変わる seed まで進める。変わらなければ「ここまで」と伝える */
  const next = () => {
    if (!feas.ok) { patch({ seed: state.seed + 1 }); return }
    const sigsOf = (s: number) => generatePlans(cfg, s).map((p) => p.sig)
    const ns = nextDistinctSeed(state.seed, sigsOf)
    const changed = plansKey(sigsOf(ns)) !== plansKey(plans.map((p) => p.sig))
    setState((s) => ({ ...s, seed: ns }))
    setDetail(null)
    setStaleVersion(false)
    setExhausted(!changed)
    if (changed) setSeedHistory((h) => [...h, state.seed].slice(-HISTORY_LIMIT))
  }
  const prev = () => {
    const last = seedHistory[seedHistory.length - 1]
    if (last === undefined) return
    setSeedHistory((h) => h.slice(0, -1))
    setState((s) => ({ ...s, seed: last }))
    resetView()
  }
  const random = () => {
    const c = randomConfig(mulberry32((Math.random() * 2 ** 31) >>> 0))
    if (c) patch({ ...c, seed: state.seed + 1 })
  }

  const persist = (list: Favorite[]) => {
    setFavorites(list)
    const st = getStorage()
    setFavMessage(st && saveFavorites(st, list) ? null : 'このブラウザでは保存できませんでした。ページを閉じるとお気に入りは消えます。')
  }
  const toggleStar = (c: PlanConfig, plan: ScoredPlan) => {
    if (isFavorited(favorites, c, planKey(plan))) {
      persist(removeFavorite(favorites, c, planKey(plan)))
      return
    }
    const r = addFavorite(favorites, c, plan)
    if (r.ok) persist(r.list)
    else setFavMessage(`お気に入りは${MAX_FAVORITES}件までです。不要なものを削除してから追加してください。`)
  }

  const scale = { maxW: Math.max(0, ...plans.map((p) => p.W)), maxH: Math.max(0, ...plans.map((p) => p.H)) }
  const dlgCfg = detail?.favCfg ?? cfg
  const shareUrl = detail
    ? `${location.origin}${location.pathname}${location.search}${encodeHash({ ...dlgCfg, seed: state.seed }, planKey(detail.plan))}`
    : undefined

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
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={prev} disabled={seedHistory.length === 0} className="min-h-[42px] cursor-pointer rounded-full border border-line bg-surface px-[18px] py-[9px] text-sm font-bold text-ink2 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40">← 前の3案</button>
            <button type="button" onClick={next} className="min-h-[42px] cursor-pointer rounded-full border-[1.5px] border-accent bg-transparent px-[18px] py-[9px] text-sm font-extrabold text-accent active:translate-y-px">別の3案を作る</button>
          </div>
        </div>
        {exhausted && (
          <p role="status" className="mb-3.5 rounded-[10px] border border-warn-line bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-ink">
            この条件で出せる案はここまでです。
            <button type="button" onClick={() => { setShowGallery(true); setTimeout(() => document.getElementById('gallery')?.scrollIntoView(), 0) }} className="ml-1 cursor-pointer border-0 bg-transparent p-0 font-bold text-accent underline">全候補（{allPlans.length}案）を見る</button>
            か、条件を少し変えてみてください。
          </p>
        )}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {plans.map((p, i) => (
            <PlanCard
              key={`${state.seed}-${i}`}
              cfg={cfg}
              plan={p}
              index={i}
              scale={scale}
              onOpen={(floor) => setDetail({ plan: p, floor })}
              starred={isFavorited(favorites, cfg, planKey(p))}
              onToggleStar={() => toggleStar(cfg, p)}
            />
          ))}
        </div>
        {!showGallery && allPlans.length > 0 && (
          <div className="mt-4 text-center">
            <button type="button" onClick={() => setShowGallery(true)} className="min-h-[42px] cursor-pointer rounded-full border border-line bg-surface px-[18px] py-[9px] text-sm font-bold text-ink2">この条件の全候補（{allPlans.length}案）を見る</button>
          </div>
        )}
        {showGallery && (
          <Gallery
            cfg={cfg}
            plans={allPlans}
            isStarred={(p) => isFavorited(favorites, cfg, planKey(p))}
            onToggleStar={(p) => toggleStar(cfg, p)}
            onOpen={(p, floor) => setDetail({ plan: p, floor })}
            onClose={() => setShowGallery(false)}
          />
        )}
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
        <ConditionForm state={state} onChange={patch} onGenerate={next} onRandom={random} />
        <section aria-label="生成結果">
          {staleVersion && (
            <p role="status" className="mb-3.5 rounded-[10px] border border-warn-line bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-ink">
              このURLは別バージョンの生成ロジックで作られたため、保存時と同じ間取りにならない場合があります。
            </p>
          )}
          {body}
          <p className="mt-[22px] text-[11.5px] leading-[1.6] text-ink2">※ 建築基準法・構造は未考慮、敷地は想定の図面です。実際の設計は建築士にご相談ください。寸法は455mmグリッド基準、1坪＝約3.31㎡で換算しています。</p>
        </section>
      </div>
      <FavoritesShelf
        favorites={favorites}
        message={favMessage}
        onOpen={(f) => setDetail({ plan: f.plan, floor: 0, favCfg: f.cfg })}
        onRemove={(f) => persist(removeFavorite(favorites, f.cfg, f.key))}
      />
      {detail && (
        <PlanDialog
          key={`${planKey(detail.plan)}-${detail.favCfg ? 'fav' : 'cur'}`}
          cfg={dlgCfg}
          plan={detail.plan}
          initialFloor={detail.floor}
          onClose={() => setDetail(null)}
          starred={isFavorited(favorites, dlgCfg, planKey(detail.plan))}
          onToggleStar={() => toggleStar(dlgCfg, detail.plan)}
          shareUrl={shareUrl}
        />
      )}
    </div>
  )
}
