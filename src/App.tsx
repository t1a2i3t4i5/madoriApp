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
import { PlanCarousel } from './components/PlanCarousel'
import { BTN_PRIMARY, BTN_SECONDARY, NOTE } from './components/ui'
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
  /** モバイルの条件シートの開閉（見た目のみ） */
  const [sheetOpen, setSheetOpen] = useState(false)

  // 仕様: 平屋に切り替えても state.story（2階の形）は残す。toConfig・encodeHash は平屋では story を無視／出力しないので、
  // 2階建てに戻せば元の選択に戻る。ただしハッシュには残らないため、平屋のままリロードすると総二階に戻る（許容）。
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
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[20px] font-bold">間取り {plans.length}案</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={prev} disabled={seedHistory.length === 0} className={`min-h-[40px] px-4 py-2 text-[13px] ${BTN_SECONDARY}`}>← 前の3案</button>
            <button type="button" onClick={next} className={`min-h-[40px] px-4 py-2 text-[13px] ${BTN_PRIMARY}`}>別の3案を作る</button>
          </div>
        </div>
        {plans.length < 3 && diagnosis && (
          <div role="status" className={`mb-3.5 ${NOTE}`}>
            <p>この条件では{plans.length}案です。{diagnosis.reason}</p>
            {diagnosis.alts.length > 0 && (
              <div className="no-print mt-2 flex flex-wrap gap-2">
                {diagnosis.alts.map((a) => (
                  <button key={a.label} type="button" onClick={() => applyAlt(a)} className={`min-h-[38px] px-3.5 py-1.5 text-[13px] ${BTN_SECONDARY}`}>{a.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
        {exhausted && (
          <p role="status" className={`no-print mb-3.5 ${NOTE}`}>
            この条件で出せる案はここまでです。
            <button type="button" onClick={() => { setShowGallery(true); setTimeout(() => document.getElementById('gallery')?.scrollIntoView(), 0) }} className="ml-1 cursor-pointer border-0 bg-transparent p-0 font-bold text-accent underline underline-offset-2">全候補（上位{galleryCount}案／全{poolCount}案）を見る</button>
            か、条件を少し変えてみてください。
          </p>
        )}
        <PlanCarousel>
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
        </PlanCarousel>
        {!showGallery && poolCount > 0 && (
          <div className="no-print mt-4 text-center">
            <button type="button" onClick={() => setShowGallery(true)} className={`min-h-[40px] px-4 py-2 text-[13px] ${BTN_SECONDARY}`}>この条件の全候補（上位{galleryCount}案／全{poolCount}案）を見る</button>
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

  const summary = `${state.area}坪・${state.floors === 2 ? '2階建て' : '平屋'}・${state.rooms}室`
  const closeSheet = () => setSheetOpen(false)

  return (
    <div className="mx-auto max-w-[1180px] px-4 pt-4 pb-12">
      <header className="mb-4 flex items-center justify-between gap-3 py-1 max-[860px]:mb-2">
        <h1 className="text-[22px] leading-none font-bold">間取りアプリ</h1>
        {/* モバイル: 上端に固定した条件サマリー。タップで条件シートが開く */}
        <button type="button" onClick={() => setSheetOpen(true)} aria-expanded={sheetOpen} className="no-print hidden min-h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[13px] font-bold text-ink shadow-panel max-[860px]:inline-flex">
          {summary} <span aria-hidden="true" className="text-ink2">▾</span>
        </button>
      </header>
      <div className="app-grid grid items-start gap-6 max-[860px]:grid-cols-1 min-[861px]:grid-cols-[340px_1fr]">
        {/* デスクトップは左カラム。モバイルは同じフォームを下からのシートに入れる（フォームは1つだけ） */}
        <div
          className={`no-print max-[860px]:fixed max-[860px]:inset-0 max-[860px]:z-40 max-[860px]:transition-[visibility] ${sheetOpen ? 'max-[860px]:visible' : 'max-[860px]:invisible'}`}
        >
          <div onClick={closeSheet} className={`hidden bg-scrim transition-opacity max-[860px]:absolute max-[860px]:inset-0 max-[860px]:block ${sheetOpen ? 'opacity-100' : 'opacity-0'}`} />
          <div
            role="group"
            aria-label="条件シート"
            className={`max-[860px]:absolute max-[860px]:inset-x-0 max-[860px]:bottom-0 max-[860px]:max-h-[88%] max-[860px]:overflow-y-auto max-[860px]:rounded-t-[20px] max-[860px]:bg-surface max-[860px]:pb-[env(safe-area-inset-bottom)] max-[860px]:transition-transform ${sheetOpen ? 'max-[860px]:translate-y-0' : 'max-[860px]:translate-y-full'}`}
          >
            <div className="hidden items-center justify-between px-4 pt-3 max-[860px]:flex">
              <span aria-hidden="true" className="mx-auto h-1 w-10 rounded-full bg-line" />
            </div>
            <ConditionForm state={state} onChange={patch} onGenerate={() => { next(); closeSheet() }} onRandom={() => { random(); closeSheet() }} />
            <div className="hidden px-4 pb-4 max-[860px]:block">
              <button type="button" onClick={closeSheet} className={`min-h-11 w-full text-[14px] ${BTN_SECONDARY}`}>閉じる</button>
            </div>
          </div>
        </div>
        <section aria-label="生成結果">
          {staleVersion && (
            <p role="status" className={`mb-3.5 ${NOTE}`}>
              このリンクは旧バージョンで作られたため同じ間取りは再現できません。同じ条件で新しく生成した案を表示しています
            </p>
          )}
          {body}
          <p className="mt-8 text-[11px] leading-[1.7] text-ink2">※ 建築基準法・構造は未考慮、敷地は想定の図面です。実際の設計は建築士にご相談ください。寸法は455mmグリッド基準、1坪＝約3.31㎡で換算しています。</p>
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
