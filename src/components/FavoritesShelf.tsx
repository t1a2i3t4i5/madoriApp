import { useState } from 'react'
import { planName } from '../core/describe'
import { cfgId, isOldVersion, type Favorite } from '../lib/favorites'
import { planMetrics } from '../lib/metrics'
import { clampFloor } from '../lib/floor'
import { FloorSvg } from './FloorSvg'
import { FloorTabs } from './FloorTabs'
import { BTN_SECONDARY, CARD, NOTE } from './ui'

interface Props {
  favorites: Favorite[]
  message: string | null
  onOpen: (f: Favorite) => void
  onRemove: (f: Favorite) => void
}

const MAX_COMPARE = 3
const idOf = (f: Favorite) => `${cfgId(f.cfg)}#${f.key}`

/** 画面下部のお気に入り棚。2〜3案を選ぶと同一縮尺で横並び比較できる */
export function FavoritesShelf({ favorites, message, onOpen, onRemove }: Props) {
  const [picked, setPicked] = useState<string[]>([])
  const [floorSel, setFloor] = useState(0)
  // 削除されたものは選択から外す
  const selected = favorites.filter((f) => picked.includes(idOf(f)))
  const toggle = (f: Favorite) => {
    const id = idOf(f)
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_COMPARE ? p : [...p, id]))
  }
  const floorCount = Math.max(1, ...selected.map((f) => f.plan.floors.length))
  const floor = clampFloor(floorSel, floorCount)
  const scale = { maxW: Math.max(0, ...selected.map((f) => f.plan.W)), maxH: Math.max(0, ...selected.map((f) => f.plan.H)) }
  const fmt = (v: number | null, unit: string) => (v === null ? '—' : `${v.toFixed(1)}${unit}`)

  return (
    <section id="favorites" aria-label="お気に入り" className="mt-14">
      <h2 className="mb-1 text-[20px] font-bold">お気に入り {favorites.length}件</h2>
      <p className="mb-3 text-[13px] text-ink2">☆で保存した案はこのブラウザに残ります。2〜{MAX_COMPARE}案にチェックを入れると横並びで比べられます。</p>
      {message && <p role="status" className={`mb-3 ${NOTE}`}>{message}</p>}
      {favorites.length === 0 ? (
        <p className="text-sm text-ink2">まだありません。気に入った案の☆を押すと、ここに並びます。</p>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(210px,100%),1fr))] gap-4">
          {favorites.map((f, i) => {
            const checked = picked.includes(idOf(f))
            const name = planName(f.cfg, f.plan)
            return (
              <li key={idOf(f)} className={`p-2.5 ${CARD}`}>
                <button type="button" onClick={() => onOpen(f)} aria-label={`${name}を拡大表示`} className="block w-full cursor-pointer rounded-xl border border-plan-line bg-paper p-1">
                  <FloorSvg plan={f.plan} floorIdx={0} uid={`fav${i}`} kitchenFace={f.cfg.feats.includes('kitchenFace')} />
                </button>
                <p className="mt-1.5 text-[13px] leading-snug font-bold">{name}</p>
                <p className="text-[11.5px] text-ink2">{f.cfg.area}坪・{f.cfg.floors === 2 ? '2階建て' : '平屋'}・{f.cfg.rooms}個室・スコア {f.plan.score.total}</p>
                {isOldVersion(f) && <span className="mt-1 inline-block rounded-full border border-warn-line px-2 py-px text-[11px] font-bold text-warn-ink">旧バージョン</span>}
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <label className="inline-flex min-h-9 cursor-pointer select-none items-center gap-1.5 text-[12.5px] font-bold">
                    <input type="checkbox" className="size-[17px]" checked={checked} disabled={!checked && selected.length >= MAX_COMPARE} onChange={() => toggle(f)} />
                    比較
                  </label>
                  <button type="button" onClick={() => onRemove(f)} className={`min-h-9 px-3 text-xs ${BTN_SECONDARY}`}>削除</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {selected.length >= 2 && (
        <div className="mt-5" aria-label="比較">
          <div className="mb-2 flex items-center gap-3">
            <h3 className="text-[16px] font-bold">比較（同一縮尺）</h3>
            {floorCount === 2 && <FloorTabs value={floor} onChange={setFloor} />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr>
                  <th className="w-24 border-b border-line p-1.5" />
                  {selected.map((f) => <th key={idOf(f)} className="border-b border-line p-1.5 text-left align-top">{planName(f.cfg, f.plan)}</th>)}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row" className="p-1.5 text-left align-top text-ink2">間取り図</th>
                  {selected.map((f, i) => (
                    <td key={idOf(f)} className="p-1.5 align-top">
                      <div className="rounded-xl border border-plan-line bg-paper p-1">
                        <FloorSvg plan={f.plan} floorIdx={floor} uid={`cmp${i}f${floor}`} kitchenFace={f.cfg.feats.includes('kitchenFace')} scale={scale} />
                      </div>
                    </td>
                  ))}
                </tr>
                {([
                  ['条件', (f: Favorite) => `${f.cfg.area}坪・${f.cfg.floors === 2 ? '2階建て' : '平屋'}・${f.cfg.rooms}個室`],
                  ['LDK', (f: Favorite) => fmt(planMetrics(f.plan).ldkTatami, '帖')],
                  ['個室の平均', (f: Favorite) => fmt(planMetrics(f.plan).roomAvgTatami, '帖')],
                  ['廊下率', (f: Favorite) => `${(planMetrics(f.plan).hallRatio * 100).toFixed(1)}%`],
                  ['収納率', (f: Favorite) => `${(planMetrics(f.plan).storageRatio * 100).toFixed(1)}%`],
                  ['スコア', (f: Favorite) => String(f.plan.score.total)],
                ] as const).map(([label, get]) => (
                  <tr key={label}>
                    <th scope="row" className="border-t border-line p-1.5 text-left text-ink2">{label}</th>
                    {selected.map((f) => <td key={idOf(f)} className="border-t border-line p-1.5 tabular-nums">{get(f)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  )
}
