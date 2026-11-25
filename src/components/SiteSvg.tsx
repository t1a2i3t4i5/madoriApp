import { useMemo } from 'react'
import type { Plan, PlanConfig, Room } from '../core/types'
import { floorRect } from '../core/types'
import { ROOM, findEntry } from '../core/rooms'
import { entryDoor } from '../core/derive'
import { computeWindows } from '../core/windows'
import { CAR_D, CAR_W, siteLayout, type SiteRect } from '../core/site'

/** 敷地図（配置図）。siteLayout の結果に、1階の間取りの簡略版（部屋の外形・LDK と玄関のラベル・玄関ドア・LDK の南の窓）を重ねる。
 * 生成には関係しない（R-IN-05〜07、R-DRAW-25）。家具・動線は描かない */
const PAD = 1.5
const ROAD_H = 2.6
const INK = '#333333'

const ROOM_FILL: Partial<Record<Room['type'], string>> = { ldk: '#EAD7B7', entry: '#E2DFD6', doma: '#D9D5C9', stair: '#E6E4DC', washitsu: '#DCE5B8' }
const fillOf = (r: Room): string => ROOM_FILL[r.type] ?? (ROOM[r.type].cat === 'water' ? '#D6E8F3' : ROOM[r.type].cat === 'bed' ? '#EAD7B7' : '#F1F0EC')

const Rect = ({ box, ...p }: { box: SiteRect } & Omit<React.SVGProps<SVGRectElement>, 'r'>) => <rect x={box.x} y={box.y} width={box.w} height={box.h} {...p} />

function Car({ r, vertical }: { r: SiteRect; vertical: boolean }) {
  // 車の記号: 駐車枠の中に、道路側へ向けた車体の丸角矩形
  const cx = r.x + r.w / 2
  return (
    <g>
      <Rect box={r} fill="#d8d9d8" stroke="#9a9d9e" strokeWidth={0.15} />
      <rect x={cx - 1.7} y={r.y + (vertical ? 2.2 : 1.8)} width={3.4} height={CAR_D - 4.4} rx={0.9} fill="#aeb9bf" />
      <rect x={cx - 1.2} y={r.y + 3.4} width={2.4} height={1.6} rx={0.4} fill="#c9d3d8" />
    </g>
  )
}

export function SiteSvg({ cfg, plan, uid = 'site' }: { cfg: PlanConfig; plan: Plan; uid?: string }) {
  const L = useMemo(() => siteLayout(plan, cfg), [plan, cfg.parking, cfg.garden])
  const rooms = plan.floors[0]?.rooms ?? []
  const fp = floorRect(plan, 0)
  const entry = findEntry(rooms)
  const windows = useMemo(() => computeWindows(rooms, fp).filter((w) => w.room.type === 'ldk' && w.side === 'S'), [rooms, fp.x, fp.y, fp.W, fp.H])
  const { lot } = L
  const vbX = lot.x - PAD
  const vbY = lot.y - PAD - 1.2
  const vbW = lot.w + PAD * 2
  const roadY = lot.y + lot.h
  const vbH = roadY + ROAD_H + PAD * 0.5 - vbY
  const ldk = rooms.find((r) => r.type === 'ldk')
  const sweep = cfg.garden > 0
  const frontCars = L.cars.filter((c) => c.mode === 'front').length
  return (
    <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="敷地の配置図（南道路）" className="block h-auto w-full">
      <defs>
        <pattern id={`deck${uid}`} width={0.8} height={0.8} patternUnits="userSpaceOnUse">
          <rect width={0.8} height={0.8} fill="#d9c29a" />
          <line x1={0} y1={0} x2={0.8} y2={0} stroke="#b89d6f" strokeWidth={0.12} />
        </pattern>
      </defs>
      {/* 方位 */}
      <g transform={`translate(${vbX + 1.4} ${vbY + 1.2})`}>
        <circle r={0.75} fill="#fff" stroke="#E05A1E" strokeWidth={0.12} />
        <path d="M 0 -0.62 L 0.29 0.13 L 0 -0.04 L -0.29 0.13 Z" fill="#E05A1E" />
        <path d="M 0 0.62 L 0.29 -0.13 L 0 0.04 L -0.29 -0.13 Z" fill="#c9c6bd" />
        <text x={1.0} y={0.33} fontSize={0.95} fontWeight={700} fill="#E05A1E">N</text>
      </g>
      {/* 敷地（砂利・舗装の地） */}
      <Rect box={lot} fill="#eeede6" stroke="#8a8578" strokeWidth={0.2} strokeDasharray="0.8 0.4" />
      {/* 庭 */}
      {L.garden.map((g, i) => <Rect key={i} box={g} fill="#d3dcc6" />)}
      {L.garden.length > 0 && (() => {
        // ラベルは最も大きい庭の矩形の中央
        const big = [...L.garden].sort((a, b) => b.w * b.h - a.w * a.h)[0]
        return big ? <text x={big.x + big.w / 2} y={big.y + big.h / 2 + 0.5} fontSize={1.5} fill="#5b6b4c" textAnchor="middle" fontWeight={700}>庭</text> : null
      })()}
      {/* アプローチ・ポーチ */}
      {L.approach.map((a, i) => <Rect key={i} box={a} fill="#e4dfd2" stroke="#c4bda8" strokeWidth={0.1} />)}
      {L.porch && <Rect box={L.porch} fill="#d9d3c2" stroke="#b5ad96" strokeWidth={0.12} />}
      {/* 駐車 */}
      {L.cars.map((c, i) => <Car key={i} r={c} vertical={c.mode === 'front'} />)}
      {L.cars.length > 0 && (() => {
        const first = L.cars[0]
        if (!first) return null
        const xs = L.cars.map((c) => c.x)
        const x0 = Math.min(...xs)
        const x1 = Math.max(...xs) + CAR_W
        return <text x={(x0 + x1) / 2} y={first.y + CAR_D + (frontCars > 0 ? -0.4 : -0.4)} fontSize={1.3} fill="#5d686e" textAnchor="middle">{`駐車 ${L.cars.length}台`}</text>
      })()}
      {/* ウッドデッキ */}
      {L.deck && <><Rect box={L.deck} fill={`url(#deck${uid})`} stroke="#a58b5e" strokeWidth={0.12} /><text x={L.deck.x + L.deck.w / 2} y={L.deck.y + L.deck.h + 1.25} fontSize={1.0} fill="#7a6540" textAnchor="middle">デッキ</text></>}
      {/* 建物（1階の簡略版） */}
      <g>
        {rooms.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={fillOf(r)} stroke={INK} strokeWidth={0.1} />)}
        <Rect box={L.building} fill="none" stroke={INK} strokeWidth={0.36} />
        {ldk && <text x={ldk.x + ldk.w / 2} y={ldk.y + ldk.h / 2 + 0.5} fontSize={1.5} fontWeight={700} fill="#2b2b2b" textAnchor="middle">LDK</text>}
        {entry && <text x={entry.x + entry.w / 2} y={entry.y + entry.h / 2 + 0.45} fontSize={Math.min(1.2, entry.w - 0.6)} fontWeight={700} fill="#2b2b2b" textAnchor="middle">{entry.type === 'doma' ? '土間' : '玄関'}</text>}
        {/* LDK の南の窓。庭ありは掃き出し（窓の線を外壁の外へ延ばした記号） */}
        {windows.map((w, i) => (
          <g key={i} stroke="#2f7fb0" strokeWidth={0.2} fill="none">
            <line x1={w.a} y1={fp.y + fp.H} x2={w.b} y2={fp.y + fp.H} stroke="#fdfcf8" strokeWidth={0.5} />
            <line x1={w.a} y1={fp.y + fp.H} x2={w.b} y2={fp.y + fp.H} />
            {sweep && <path d={`M ${w.a} ${fp.y + fp.H} v 0.7 M ${w.b} ${fp.y + fp.H} v 0.7`} strokeWidth={0.16} />}
          </g>
        ))}
        {entry && entry.y + entry.h === fp.y + fp.H && <path d={entryDoor(entry, fp.y + fp.H).path} fill="rgba(90,90,90,0.07)" stroke="#5a5a5a" strokeWidth={0.1} />}
      </g>
      {/* 生け垣（庭なし）: 敷地の南の境界の線に丸い植栽 */}
      {L.hedge.map((h, i) => (
        <g key={i}>
          <line x1={h.x1} y1={h.y1} x2={h.x2} y2={h.y2} stroke="#7fa267" strokeWidth={0.5} strokeDasharray="0.9 0.5" strokeLinecap="round" />
          <text x={(h.x1 + h.x2) / 2} y={h.y1 - 0.7} fontSize={1.0} fill="#5b6b4c" textAnchor="middle">生け垣</text>
        </g>
      ))}
      {/* 南の道路 */}
      <rect x={lot.x - PAD * 0.5} y={roadY} width={lot.w + PAD} height={ROAD_H} fill="#dedbd2" />
      <text x={lot.x + lot.w / 2} y={roadY + ROAD_H / 2 + 0.5} fontSize={1.3} fill="#8a8578" textAnchor="middle">南道路</text>
    </svg>
  )
}
