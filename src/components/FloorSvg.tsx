import { useMemo } from 'react'
import type { Plan, Room, RoomCategory } from '../core/types'
import { ROOM } from '../core/rooms'
import { DOOR_R, computeDoors, computeWindows } from '../core/derive'
import { furnish, isVerticalLabel, kitchenCounter } from '../core/furnish'
import { Furniture } from './Furniture'
import { Fixtures } from './Fixtures'
import { tatami } from '../lib/format'
import { computeFlows } from '../lib/flow'
import { FlowOverlay, legendHeight, legendWidth } from './FlowOverlay'

const FILL: Record<RoomCategory, string> = {
  living: '#f3ddba', bed: '#dde7d8', water: '#d3e2ea', store: '#e7ddcb', circ: '#eae4d3', void: '#f4f1e6',
}
const PAD = 2.2

export interface FloorSvgProps {
  plan: Plan
  floorIdx: number
  /** pattern id の衝突を避けるための接頭辞 */
  uid: string
  kitchenFace?: boolean
  siteStrip?: boolean
  /** 家具を描く（拡大表示用） */
  showFurniture?: boolean
  /** 動線（来客・生活）を重ねる（拡大表示用） */
  showFlow?: boolean
  /** 全案で同じスケールに揃えるための最大外形 */
  scale?: { maxW: number; maxH: number }
}

function RoomLabel({ r, kitchenFace, furnished, halo }: { r: Room; kitchenFace?: boolean; furnished?: boolean; halo?: boolean }) {
  const cx = r.x + r.w / 2
  // 対面キッチンのカウンターがあるLDKはラベルを下へ逃がす
  const cy = r.y + r.h / 2 + (r.type === 'ldk' && kitchenFace ? 1.5 : 0)
  // 動線表示中は、下を通る線の上でも読めるよう白い縁取りを付ける
  const haloProps = halo ? { stroke: '#fff', strokeWidth: 0.35, strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {}
  const common = { fontWeight: 700, fill: '#33302a', textAnchor: 'middle' as const, ...haloProps }
  // 細長い部屋（玄関・トイレ等）はラベルを縦積みにして壁に触れさせない
  if (isVerticalLabel(r)) {
    const fs = Math.min(1.0, r.w - 0.5)
    const y0 = cy - ((r.name.length - 1) * 1.08) / 2 + 0.35
    return (
      <text fontSize={fs} {...common}>
        {Array.from(r.name).map((ch, i) => (
          <tspan key={i} x={cx} y={y0 + i * 1.08}>{ch}</tspan>
        ))}
      </text>
    )
  }
  const big = r.w >= 5 && r.h >= 4.5
  const mid = r.w >= 3.4 && r.h >= 3.2
  const fitFs = (base: number) => Math.min(base, (r.w - 0.25) / Math.max(1, r.name.length))
  if (big) {
    return (
      <>
        <text x={cx} y={cy - 0.35} fontSize={fitFs(1.55)} {...common}>{r.name}</text>
        <text
          x={cx}
          y={cy + 1.55}
          fontSize={1.2}
          fill="#7a7568"
          textAnchor="middle"
          {...(furnished || halo ? { stroke: '#fff', strokeWidth: 0.35, strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {})}
        >{tatami(r.w, r.h)}畳</text>
      </>
    )
  }
  if (mid) return <text x={cx} y={cy + 0.5} fontSize={fitFs(1.25)} {...common}>{r.name}</text>
  if (r.w >= 2 && r.h >= 2.4) return <text x={cx} y={cy + 0.42} fontSize={fitFs(0.98)} {...common}>{r.name}</text>
  return null
}

const NO_ROOMS: Room[] = []

export function FloorSvg({ plan, floorIdx, uid, kitchenFace, siteStrip, showFurniture, showFlow, scale }: FloorSvgProps) {
  const fl = plan.floors[floorIdx]
  const { W, H } = plan
  const rooms = fl?.rooms ?? NO_ROOMS
  const doors = useMemo(() => computeDoors(rooms), [rooms])
  const windows = useMemo(() => computeWindows(rooms, H), [rooms, H])
  const furniture = useMemo(
    () => (showFurniture ? furnish(rooms, doors, { kitchenFace: !!kitchenFace }) : []),
    [showFurniture, rooms, doors, kitchenFace],
  )
  const flows = useMemo(() => (showFlow ? computeFlows(plan, floorIdx) : []), [showFlow, plan, floorIdx])
  // 存在しない階を指された場合は何も描かない（フックの後で判定する）
  if (!fl) return null
  const ldk = fl.rooms.find((r) => r.type === 'ldk')
  const entry = fl.rooms.find((r) => r.type === 'entry')

  let vbX = -PAD, vbW = W + PAD * 2
  const vbY = -PAD - 1.6
  let vbH = H + PAD * 2 + 1.6
  if (scale) {
    const targetW = scale.maxW + 4.4
    vbX -= (targetW - vbW) / 2
    vbW = targetW
    vbH = scale.maxH + 4.4 + 1.6
  }
  // 敷地帯（南道路）の矩形の下端 H+2.5 まで、余白 0.3 を足して viewBox に収める
  if (siteStrip) {
    const need = H + 2.5 + 0.3 - (vbY + vbH)
    if (need > 0) vbH += need
  }
  // 動線の凡例は、敷地帯・玄関ドアの弧より下に専用の帯を足して置く（北マーカー・図面と重ならない）
  const legendY = vbY + vbH
  // 外形が狭くて凡例の文字が右にはみ出す場合は、右へ広げる
  vbW = Math.max(vbW, 1.2 + legendWidth(flows) + 0.6)
  vbH += legendHeight(flows.length)
  const R = DOOR_R
  const counter = ldk && kitchenFace ? kitchenCounter(ldk) : null

  return (
    <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`${fl.label}の間取り図`} className="block h-auto w-full">
      <defs>
        <pattern id={`hatch${uid}`} width={1.6} height={1.6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={1.6} height={1.6} fill="#f4f1e6" />
          <line x1={0} y1={0} x2={0} y2={1.6} stroke="#c9c2ab" strokeWidth={0.35} />
        </pattern>
        <pattern id={`dots${uid}`} width={1.4} height={1.4} patternUnits="userSpaceOnUse">
          <rect width={1.4} height={1.4} fill="#d9cbae" />
          <circle cx={0.7} cy={0.7} r={0.16} fill="#b7a67f" />
        </pattern>
      </defs>
      {/* 方位 */}
      <text x={W - 1.2} y={-PAD - 0.1} fontSize={1.7} fill="#8a8578" textAnchor="middle" fontWeight={700}>N</text>
      <path d={`M ${W - 1.2} ${-PAD + 0.6} l 0.45 0.9 h -0.9 z`} fill="#8a8578" />
      {/* 部屋の塗り */}
      {fl.rooms.map((r, i) => {
        let fill = FILL[ROOM[r.type].cat]
        if (r.type === 'doma') fill = `url(#dots${uid})`
        if (r.type === 'void') fill = `url(#hatch${uid})`
        if (r.type === 'hall') fill = '#efe9da'
        if (r.type === 'stair') fill = '#e3ded0'
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={fill} />
      })}
      {/* 対面キッチンカウンター */}
      {ldk && counter && (
        <>
          <rect x={counter.x} y={counter.y} width={counter.w} height={counter.h} fill="#e8c9a0" stroke="#b08b57" strokeWidth={0.14} />
          <rect x={ldk.x + ldk.w - Math.min(8, ldk.w - 3) + 0.1} y={ldk.y + 1.45} width={1.7} height={1.0} fill="#fff" stroke="#8a8a8a" strokeWidth={0.1} />
        </>
      )}
      {fl.rooms.map((r, i) => <Fixtures key={i} r={r} />)}
      {furniture.length > 0 && <Furniture items={furniture} />}
      {/* 窓: 壁を抜いてから二重線 */}
      <g stroke="#fdfcf8" strokeWidth={0.55}>
        {windows.map((wd, i) => {
          const yy = wd.side === 'S' ? H : 0
          return <line key={i} x1={wd.cx - wd.len / 2} y1={yy} x2={wd.cx + wd.len / 2} y2={yy} />
        })}
      </g>
      <g stroke="#4a90b8" strokeWidth={0.13}>
        {windows.map((wd, i) => {
          const yy = wd.side === 'S' ? H : 0
          return (
            <g key={i}>
              <line x1={wd.cx - wd.len / 2} y1={yy - 0.22} x2={wd.cx + wd.len / 2} y2={yy - 0.22} />
              <line x1={wd.cx - wd.len / 2} y1={yy + 0.22} x2={wd.cx + wd.len / 2} y2={yy + 0.22} />
            </g>
          )
        })}
      </g>
      {/* ドアの開き弧 */}
      <g stroke="#6d675c" strokeWidth={0.13} fill="rgba(109,103,92,0.10)">
        {doors.map((d, i) => {
          const e = d.edge
          return e.dir === 'v' ? (
            <path key={i} d={`M ${e.at} ${e.mid} L ${e.at} ${e.mid - R} A ${R} ${R} 0 0 1 ${e.at + R} ${e.mid} Z`} />
          ) : (
            <path key={i} d={`M ${e.mid} ${e.at} L ${e.mid - R} ${e.at} A ${R} ${R} 0 0 1 ${e.mid} ${e.at - R} Z`} />
          )
        })}
      </g>
      {/* 壁（外壁は内壁の約2.5倍の太さ） */}
      <g fill="none" stroke="#3a382f">
        {fl.rooms.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} strokeWidth={0.17} />)}
        <rect x={0} y={0} width={W} height={H} strokeWidth={0.42} />
      </g>
      {/* 動線は部屋名ラベルより下 */}
      {showFlow && <FlowOverlay flows={flows} legendY={legendY} legendX={vbX + 1.2} />}
      {fl.rooms.map((r, i) => <RoomLabel key={i} r={r} kitchenFace={kitchenFace} furnished={furniture.length > 0} halo={showFlow && flows.length > 0} />)}
      {/* 玄関ドア（南側・外開き） */}
      {entry && entry.y + entry.h === H && (() => {
        const ex = entry.x + entry.w / 2
        return <path d={`M ${ex} ${H} L ${ex} ${H + 2.0} A 2.0 2.0 0 0 0 ${ex + 2.0} ${H} Z`} fill="rgba(109,103,92,0.10)" stroke="#6d675c" strokeWidth={0.13} />
      })()}
      {siteStrip && (
        <>
          <rect x={0} y={H + 1.0} width={W} height={1.5} fill="#d8d5cc" />
          <text x={W / 2} y={H + 2.15} fontSize={1.15} fill="#8a8578" textAnchor="middle">南道路</text>
        </>
      )}
    </svg>
  )
}
