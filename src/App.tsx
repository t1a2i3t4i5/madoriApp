import { useEffect, useMemo, useState } from 'react'
import type { Alt, PlanConfig, ScoredPlan } from './core/types'
import { candidatePool, generatePlans } from './core/generate'
import { GALLERY_LIMIT, galleryPlans, planFromKey, planKey } from './core/enumerate'
import { mulberry32 } from './core/rng'
import { diagnoseEmpty, feasibility } from './core/program'
import { ConditionForm } from './components/ConditionForm'
import { FavoritesShelf } from './components/FavoritesShelf'
import { Gallery } from './components/Gallery'
import { Notice } from './components/Notice'
import { PlanCard } from './components/PlanCard'
import { PlanDialog } from './components/PlanDialog'
import { encodeHash, parseHash, toConfig, type AppState } from './lib/hash'
import { addFavorite, isFavorited, isOldVersion, loadFavorites, removeFavorite, saveFavorites, FAVORITES_STORAGE_KEY, MAX_FAVORITES, type Favorite, type KeyValueStorage } from './lib/favorites'
import { nextDistinctSeed } from './lib/seedNav'
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
  /** お気に入りが旧バージョンの生成ロジックで作られたもの（p の key が将来別の案を指しうるので共有リンクを出さない） */
  favOld?: boolean
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

  // seed だけが変わるときは cfg の同一性を保ちたいので、条件の各フィールドを依存にする
  const cfg: PlanConfig = useMemo(
    () => toConfig(state),
    [state.area, state.floors, state.rooms, state.parking, state.garden, state.feats, state.story],
  )
  const feas = useMemo(() => feasibility(cfg), [cfg])
  const plans = useMemo(() => (feas.ok ? generatePlans(cfg, state.seed) : []), [feas, cfg, state.seed])
  // 3案に満たないときだけ診断する（代替案の確認で複数条件を生成するため、毎回は走らせない）
  const diagnosis = useMemo(() => (feas.ok && plans.length < 3 ? diagnoseEmpty(cfg) : null), [feas, cfg, plans.length])
  const poolCount = useMemo(() => (feas.ok ? candidatePool(cfg).length : 0), [feas, cfg])
  // ギャラリーの24案選抜は重いので、開いたときだけ計算する（ボタンの文言は poolCount から出す）
  const galleryList = useMemo(() => (feas.ok && showGallery ? galleryPlans(cfg) : []), [feas, cfg, showGallery])
  const galleryCount = Math.min(GALLERY_LIMIT, poolCount)

  // 別タブでお気に入りが変わったら読み直す（storage イベントは他タブの変更だけで発火する）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== FAVORITES_STORAGE_KEY) return
      const st = getStorage()
      if (st) setFavorites(loadFavorites(st))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

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
    // 現在の組は表示中の plans から再利用する（found なら組が変わることは確定している）
    const { seed: ns, found: changed } = nextDistinctSeed(state.seed, sigsOf, undefined, plans.map((p) => p.sig))
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
    const seed = state.seed + 1 // patch 後に実際に使う seed で3案が出る条件を選ぶ
    const c = randomConfig(mulberry32((Math.random() * 2 ** 31) >>> 0), 200, seed)
    if (c) patch({ ...c, story: 'full', seed })
  }

  const persist = (list: Favorite[]) => {
    setFavorites(list)
    const st = getStorage()
    setFavMessage(st && saveFavorites(st, list) ? null : 'このブラウザでは保存できませんでした。ページを閉じるとお気に入りは消えます。')
  }
  const toggleStar = (c: PlanConfig, plan: ScoredPlan) => {
    if (isFavorited(favorites, c, plan)) {
      persist(removeFavorite(favorites, c, plan))
      return
    }
    const r = addFavorite(favorites, c, plan)
    if (r.ok) persist(r.list)
    else setFavMessage(`お気に入りは${MAX_FAVORITES}件までです。不要なものを削除してから追加してください。`)
  }

  const scale = { maxW: Math.max(0, ...plans.map((p) => p.W)), maxH: Math.max(0, ...plans.map((p) => p.H)) }
  const dlgCfg = detail?.favCfg ?? cfg
  const shareUrl = detail && !detail.favOld
    ? `${location.origin}${location.pathname}${location.search}${encodeHash({ ...dlgCfg, seed: state.seed }, planKey(detail.plan))}`
    : undefined

  let body
  if (!feas.ok) {
    body = <Notice title="この条件では作れません" body={feas.reason} alts={feas.alts} onAlt={applyAlt} />
  } else if (plans.length === 0) {
    body = (
      <Notice
        title="検証を通る案が作れませんでした"
        body={
          diagnosis && diagnosis.alts.length === 0
            ? diagnosis.reason
            : `${diagnosis?.reason ?? ''}要素を黙って落とす代わりに、実際に3案出ることを確かめた調整案を出します。`
        }
        alts={diagnosis?.alts ?? []}
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
        {plans.length < 3 && diagnosis && (
          <div role="status" className="mb-3.5 rounded-[10px] border border-warn-line bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-ink">
            <p>この条件では{plans.length}案です。{diagnosis.reason}</p>
            {diagnosis.alts.length > 0 && (
              <div className="no-print mt-2 flex flex-wrap gap-2">
                {diagnosis.alts.map((a) => (
                  <button key={a.label} type="button" onClick={() => applyAlt(a)} className="min-h-[38px] cursor-pointer rounded-full border-[1.5px] border-warn-line bg-surface px-3.5 py-1.5 text-[13px] font-extrabold text-ink">{a.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {exhausted && (
          <p role="status" className="no-print mb-3.5 rounded-[10px] border border-warn-line bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-ink">
            この条件で出せる案はここまでです。
            <button type="button" onClick={() => { setShowGallery(true); setTimeout(() => document.getElementById('gallery')?.scrollIntoView(), 0) }} className="ml-1 cursor-pointer border-0 bg-transparent p-0 font-bold text-accent underline">全候補（上位{galleryCount}案／全{poolCount}案）を見る</button>
            か、条件を少し変えてみてください。
          </p>
        )}
        <div className="plan-grid grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
          {plans.map((p, i) => (
            <PlanCard
              key={`${state.seed}-${i}`}
              cfg={cfg}
              plan={p}
              index={i}
              scale={scale}
              onOpen={(floor) => setDetail({ plan: p, floor })}
              starred={isFavorited(favorites, cfg, p)}
              onToggleStar={() => toggleStar(cfg, p)}
            />
          ))}
        </div>
        {!showGallery && poolCount > 0 && (
          <div className="no-print mt-4 text-center">
            <button type="button" onClick={() => setShowGallery(true)} className="min-h-[42px] cursor-pointer rounded-full border border-line bg-surface px-[18px] py-[9px] text-sm font-bold text-ink2">この条件の全候補（上位{galleryCount}案／全{poolCount}案）を見る</button>
          </div>
        )}
        {showGallery && (
          <div className="no-print"><Gallery
            cfg={cfg}
            plans={galleryList}
            total={poolCount}
            isStarred={(p) => isFavorited(favorites, cfg, p)}
            onToggleStar={(p) => toggleStar(cfg, p)}
            onOpen={(p, floor) => setDetail({ plan: p, floor })}
            onClose={() => setShowGallery(false)}
          /></div>
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
      <div className="app-grid grid items-start gap-5 max-[860px]:grid-cols-1 min-[861px]:grid-cols-[340px_1fr]">
        <div className="no-print"><ConditionForm state={state} onChange={patch} onGenerate={next} onRandom={random} /></div>
        <section aria-label="生成結果">
          {staleVersion && (
            <p role="status" className="mb-3.5 rounded-[10px] border border-warn-line bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-ink">
              このリンクは旧バージョンで作られたため同じ間取りは再現できません。同じ条件で新しく生成した案を表示しています
            </p>
          )}
          {body}
          <p className="mt-[22px] text-[11.5px] leading-[1.6] text-ink2">※ 建築基準法・構造は未考慮、敷地は想定の図面です。実際の設計は建築士にご相談ください。寸法は455mmグリッド基準、1坪＝約3.31㎡で換算しています。</p>
        </section>
      </div>
      <div className="no-print"><FavoritesShelf
        favorites={favorites}
        message={favMessage}
        onOpen={(f) => setDetail({ plan: f.plan, floor: 0, favCfg: f.cfg, favOld: isOldVersion(f) })}
        onRemove={(f) => persist(removeFavorite(favorites, f.cfg, f.plan))}
      /></div>
      {detail && (
        <PlanDialog
          key={`${planKey(detail.plan)}-${detail.favCfg ? 'fav' : 'cur'}`}
          cfg={dlgCfg}
          plan={detail.plan}
          initialFloor={detail.floor}
          onClose={() => setDetail(null)}
          starred={isFavorited(favorites, dlgCfg, detail.plan)}
          onToggleStar={() => toggleStar(dlgCfg, detail.plan)}
          shareUrl={shareUrl}
        />
      )}
    </div>
  )
}
