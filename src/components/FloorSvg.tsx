import { useMemo } from 'react'
import type { Door, Plan, Room, RoomCategory } from '../core/types'
import { ROOM, findEntry } from '../core/rooms'
import { floorRect, type FloorRect } from '../core/types'
import { computeDoors, doorPath, entryDoor } from '../core/derive'
import { computeWindows } from '../core/windows'
import type { WindowSeg } from '../core/windows'
import { AREA_FS, LABEL_FS, furnish, isVerticalLabel, kitchenCounter, labelSpots, rowFs, stackMetrics, type LabelSpot } from '../core/furnish'
import { stairGeom, type StairGeom } from '../core/stair'
import { Furniture } from './Furniture'
import { Fixtures, STAIR_LABEL_MIN_H } from './Fixtures'
import { tatami } from '../lib/format'

import { computeFlows } from '../lib/flow'
import { FlowOverlay, legendHeight, legendWidth } from './FlowOverlay'

/** 不動産の間取り図の色分け（居室=フローリング系、和室=畳の緑、水回り=水色、廊下・収納=淡いグレー） */
const FILL: Record<RoomCategory, string> = {
  living: '#EAD7B7', bed: '#EAD7B7', water: '#D6E8F3', store: '#F1F0EC', circ: '#F1F0EC', void: '#F7F6F2',
}
const FILL_OVERRIDE: Partial<Record<Room['type'], string>> = {
  washitsu: '#DCE5B8', stair: '#E6E4DC', entry: '#E2DFD6',
}
/** 外形の余白（左右・上・下）。下は玄関ドアの弧と動線凡例のぶんを残す */
const PAD_X = 1.2
const PAD_TOP = 2.4
const PAD_BOTTOM = 2.2
const INK = '#333333'
const LABEL_FILL = '#2b2b2b'
const AREA_FILL = '#5a5a5a'

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

/** 縦に積むとき、長音「ー」は横線のままだと読めないので「｜」にする */
const vch = (ch: string) => (ch === 'ー' ? '｜' : ch)

/**
 * 折れ戸／引戸の記号。共有辺に沿った葉の区間の壁を背景色で抜き（壁より後に描く）、
 * 開き先（付属収納側）へ折れる M 字のジグザグ線を描く
 */
function FoldDoor({ d }: { d: Door }) {
  const { hinge, closed, open } = d.swing
  const horiz = d.edge.dir === 'h'
  // 折れの向きは開き先の符号（辺に垂直な方向で、open が hinge のどちら側か）に合わせる
  const sign = (horiz ? open.y - hinge.y : open.x - hinge.x) < 0 ? -1 : 1
  // M 字の折れ戸: 開口を4等分し、折れ点を交互に収納側へ振ったジグザグ（M 字）。弧がないので開き戸と混同しない
  const pt = (k: number) => {
    const t = k / 4
    const off = k % 2 === 1 ? 0.3 * sign : 0
    return horiz
      ? { x: hinge.x + (closed.x - hinge.x) * t, y: hinge.y + off }
      : { x: hinge.x + off, y: hinge.y + (closed.y - hinge.y) * t }
  }
  const pts = [0, 1, 2, 3, 4].map(pt)
  return (
    <g>
      <line x1={hinge.x} y1={hinge.y} x2={closed.x} y2={closed.y} stroke="#fdfcf8" strokeWidth={0.4} />
      <path d={pts.map((q, i) => `${i ? 'L' : 'M'} ${q.x} ${q.y}`).join(' ')} fill="none" stroke="#5a5a5a" strokeWidth={0.13} strokeLinejoin="round" />
    </g>
  )
}

/** 扉のない開口（階段の口）の記号。共有区間の壁を背景色で抜く（壁より後に描く）。弧も葉もない */
function OpeningGap({ d }: { d: Door }) {
  const { edge } = d
  const [x1, y1, x2, y2] = edge.dir === 'h' ? [edge.lo + 0.1, edge.at, edge.hi - 0.1, edge.at] : [edge.at, edge.lo + 0.1, edge.at, edge.hi - 0.1]
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fdfcf8" strokeWidth={0.4} />
}

function RoomLabel({ r, kitchenFace, furnished, halo, geom, spot }: { r: Room; kitchenFace?: boolean; furnished?: boolean; halo?: boolean; geom?: StairGeom | null; spot?: LabelSpot | null }) {
  // クローゼットは「CL」と短く表示し、畳数は出さない
  if (r.type === 'closet') {
    const lo = Math.min(r.w, r.h), hi = Math.max(r.w, r.h)
    if (lo < 2 || hi < 2.4) return null
    const fs = Math.min(0.8, lo - 0.9)
    // ハンガーパイプの線・折れ戸の記号の上でも読めるよう、部屋色の縁取りを常に付ける（動線表示中は白）
    return (
      <text x={r.x + r.w / 2} y={r.y + r.h / 2 + fs * 0.35} fontSize={fs} fontWeight={700} fill={LABEL_FILL} textAnchor="middle" stroke={halo ? '#fff' : FILL.store} strokeWidth={0.35} strokeLinejoin="round" paintOrder="stroke">CL</text>
    )
  }
  const cx = r.x + r.w / 2
  // 対面キッチンのカウンターがあるLDKはラベルを下へ逃がす
  const cy = r.y + r.h / 2 + (r.type === 'ldk' && kitchenFace ? 1.5 : 0)
  const outline = { stroke: '#fff', strokeWidth: 0.35, strokeLinejoin: 'round' as const, paintOrder: 'stroke' }
  // 動線表示中は、下を通る線の上でも読めるよう白い縁取りを付ける
  const haloProps = halo ? outline : {}
  const common = { fontWeight: 700, fill: LABEL_FILL, textAnchor: 'middle' as const, ...haloProps }
  const len = Math.max(1, r.name.length)
  if (r.type === 'stair' && geom) {
    // 折り返し階段: 名前は口の反対側（踊り場の側。上端）に置く。U 字の矢印の折り返しは踊り場の下寄りなので重ならない。4×5 でも踊り場が2セルあるので入る
    return <text x={cx} y={r.y + 0.95} fontSize={Math.min(0.95, (r.w - 0.5) / len)} {...common} {...outline}>{r.name}</text>
  }
  if (r.type === 'stair') {
    // 階段は矢印と重ならない上端に置く。矢印を逃がせない低い階段は名前を省く（段と矢印で階段と分かる）
    if (r.h < STAIR_LABEL_MIN_H || r.w < 2.2) return null
    // 段線の上でも読めるよう、白い縁取りを常に付ける
    return <text x={cx} y={r.y + 1.7} fontSize={Math.min(LABEL_FS, (r.w - 0.5) / len)} {...common} {...outline}>{r.name}</text>
  }
  // 細長い部屋（玄関・トイレ等）はラベルを縦積みにして壁に触れさせない
  // 家具を表示しているときの置き場所（labelSpots）。null は置けないので省く
  if (spot === null) return null
  if (spot) {
    if (spot.layout === 'stack') {
      const { fs, step } = stackMetrics(r, spot.s)
      const y0 = spot.cy - ((len - 1) * step) / 2 + fs * 0.35
      return (
        <text fontSize={fs} {...common}>
          {Array.from(r.name).map((ch, i) => (
            <tspan key={i} x={spot.cx} y={y0 + i * step}>{vch(ch)}</tspan>
          ))}
        </text>
      )
    }
    const nfs = rowFs(r, spot.s)
    const big = r.w >= 5 && r.h >= 4.5
    if (!big) return <text x={spot.cx} y={spot.cy + nfs * 0.35} fontSize={nfs} {...common}>{r.name}</text>
    return (
      <>
        <text x={spot.cx} y={spot.cy - 0.25} fontSize={nfs} {...common}>{r.name}</text>
        {spot.area && (
          <text x={spot.cx} y={spot.cy - 0.25 + 1.5 * spot.s} fontSize={AREA_FS * spot.s} fill={AREA_FILL} textAnchor="middle" {...outline}>{tatami(r.w, r.h)}帖</text>
        )}
      </>
    )
  }
  if (isVerticalLabel(r)) {
    const fs = Math.min(1.0, r.w - 0.5)
    const y0 = cy - ((r.name.length - 1) * 1.08) / 2 + 0.35
    return (
      <text fontSize={fs} {...common}>
        {Array.from(r.name).map((ch, i) => (
          <tspan key={i} x={cx} y={y0 + i * 1.08}>{vch(ch)}</tspan>
        ))}
      </text>
    )
  }
  const big = r.w >= 5 && r.h >= 4.5
  // 室名の大きさは全室で統一（LABEL_FS）。幅に収まらないときだけ縮め、縮めても読めない（0.75未満）なら
  // 縦積みに切り替え、縦にも収まらなければ描かない（文字が壁で切れるより省く）
  const fit = (r.w - 0.5) / len
  if (fit < 0.75) {
    const fs = Math.min(0.95, r.w - 0.5)
    if (r.w >= 1.6 && fs >= 0.75 && r.h >= len * (fs + 0.15) + 0.6) {
      const step = fs + 0.15
      const y0 = cy - ((len - 1) * step) / 2 + fs * 0.35
      return (
        <text fontSize={fs} {...common}>
          {Array.from(r.name).map((ch, i) => (
            <tspan key={i} x={cx} y={y0 + i * step}>{vch(ch)}</tspan>
          ))}
        </text>
      )
    }
    return null
  }
  const fs = Math.min(LABEL_FS, fit)
  if (big) {
    // 部屋名＋帖数の2段組み（「LDK」の下に「15.8帖」）
    return (
      <>
        <text x={cx} y={cy - 0.25} fontSize={fs} {...common}>{r.name}</text>
        <text
          x={cx}
          y={cy + 1.25}
          fontSize={AREA_FS}
          fill={AREA_FILL}
          textAnchor="middle"
          {...(furnished || halo ? outline : {})}
        >{tatami(r.w, r.h)}帖</text>
      </>
    )
  }
  if (r.w >= 2 && r.h >= 2.4) return <text x={cx} y={cy + fs * 0.35} fontSize={fs} {...common}>{r.name}</text>
  return null
}

/** 1階の板から2階の板を引いた領域（東西下屋 or 南下屋の一辺共有の形なので高々2矩形） */
export function shimoyaRects(outer: FloorRect, fp: FloorRect): FloorRect[] {
  const out: FloorRect[] = []
  // 西（x 小さい側）・東の帯
  if (fp.x > outer.x) out.push({ x: outer.x, y: outer.y, W: fp.x - outer.x, H: outer.H })
  if (fp.x + fp.W < outer.x + outer.W) out.push({ x: fp.x + fp.W, y: outer.y, W: outer.x + outer.W - (fp.x + fp.W), H: outer.H })
  // 北・南の帯（東西の帯と重ならない、2階の板の幅の範囲）
  if (fp.y > outer.y) out.push({ x: fp.x, y: outer.y, W: fp.W, H: fp.y - outer.y })
  if (fp.y + fp.H < outer.y + outer.H) out.push({ x: fp.x, y: fp.y + fp.H, W: fp.W, H: outer.y + outer.H - (fp.y + fp.H) })
  return out
}

function Shimoya({ outer, fp, uid }: { outer: FloorRect; fp: FloorRect; uid: string }) {
  const rects = shimoyaRects(outer, fp)
  return (
    <g>
      {rects.map((r, i) => (
        <g key={i}>
          <rect x={r.x} y={r.y} width={r.W} height={r.H} fill={`url(#shimoya${uid})`} />
          {r.W >= 2.4 && r.H >= 2.4 && (
            <text x={r.x + r.W / 2} y={r.y + r.H / 2 + 0.4} fontSize={Math.min(1.2, r.W - 0.4)} fill="#7a7568" textAnchor="middle" fontWeight={700}>下屋</text>
          )}
        </g>
      ))}
      <rect x={outer.x} y={outer.y} width={outer.W} height={outer.H} fill="none" stroke="#8a8578" strokeWidth={0.12} strokeDasharray="0.6 0.4" />
    </g>
  )
}

const NO_ROOMS: Room[] = []

/** 窓の線分（外壁上。南北は水平、東西は垂直） */
function windowLine(wd: WindowSeg, fp: FloorRect) {
  if (wd.side === 'N' || wd.side === 'S') {
    const y = wd.side === 'S' ? fp.y + fp.H : fp.y
    return { horizontal: true, main: { x1: wd.a, y1: y, x2: wd.b, y2: y } }
  }
  const x = wd.side === 'E' ? fp.x + fp.W : fp.x
  return { horizontal: false, main: { x1: x, y1: wd.a, x2: x, y2: wd.b } }
}

export function FloorSvg({ plan, floorIdx, uid, kitchenFace, siteStrip, showFurniture, showFlow, scale }: FloorSvgProps) {
  const fl = plan.floors[floorIdx]
  const { W, H } = plan
  const fp = floorRect(plan, floorIdx)
  const fpBottom = fp.y + fp.H
  const rooms = fl?.rooms ?? NO_ROOMS
  const doors = useMemo(() => computeDoors(rooms), [rooms])
  const windows = useMemo(() => computeWindows(rooms, fp), [rooms, fp.x, fp.y, fp.W, fp.H])
  const furniture = useMemo(
    () => (showFurniture ? furnish(rooms, doors, { kitchenFace: !!kitchenFace }) : []),
    [showFurniture, rooms, doors, kitchenFace],
  )
  const labelPos = useMemo(() => (furniture.length > 0 ? labelSpots(rooms, doors, furniture, !!kitchenFace) : null), [furniture, rooms, doors, kitchenFace])
  const geom = useMemo(() => stairGeom(plan, floorIdx), [plan, floorIdx])
  const flows = useMemo(() => (showFlow ? computeFlows(plan, floorIdx) : []), [showFlow, plan, floorIdx])
  // 存在しない階を指された場合は何も描かない（フックの後で判定する）
  if (!fl) return null
  const ldk = fl.rooms.find((r) => r.type === 'ldk')
  const entry = findEntry(fl.rooms)

  let vbX = -PAD_X, vbW = W + PAD_X * 2
  const vbY = -PAD_TOP
  let vbH = H + PAD_TOP + PAD_BOTTOM
  if (scale) {
    const targetW = scale.maxW + PAD_X * 2
    vbX -= (targetW - vbW) / 2
    vbW = targetW
    vbH = scale.maxH + PAD_TOP + PAD_BOTTOM
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
  const counter = ldk && kitchenFace ? kitchenCounter(ldk) : null

  return (
    <svg viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label={`${fl.label}の間取り図`} className="block h-auto w-full">
      <defs>
        <pattern id={`hatch${uid}`} width={1.6} height={1.6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width={1.6} height={1.6} fill="#F7F6F2" />
          <line x1={0} y1={0} x2={0} y2={1.6} stroke="#d2cfc4" strokeWidth={0.3} />
        </pattern>
        <pattern id={`shimoya${uid}`} width={1.2} height={1.2} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width={1.2} height={1.2} fill="#f7f4ea" />
          <line x1={0} y1={0} x2={0} y2={1.2} stroke="#d6cfb8" strokeWidth={0.2} />
        </pattern>
        <pattern id={`dots${uid}`} width={1.4} height={1.4} patternUnits="userSpaceOnUse">
          <rect width={1.4} height={1.4} fill="#D9D5C9" />
          <circle cx={0.7} cy={0.7} r={0.16} fill="#b5b0a0" />
        </pattern>
      </defs>
      {/* 方位: 小さな円形コンパス（図の中だけの色）。余白の左上に置く（右上はカードの☆ボタンに隠れる）。
          N は円の右隣に置き、PAD_TOP の余白内（viewBox 内）に円・矢印・N がすべて収まる */}
      <g transform={`translate(1 ${-PAD_TOP + 0.95})`}>
        <circle r={0.75} fill="#fff" stroke="#E05A1E" strokeWidth={0.12} />
        <path d="M 0 -0.62 L 0.29 0.13 L 0 -0.04 L -0.29 0.13 Z" fill="#E05A1E" />
        <path d="M 0 0.62 L 0.29 -0.13 L 0 0.04 L -0.29 -0.13 Z" fill="#c9c6bd" />
        <text x={1.0} y={0.33} fontSize={0.95} fontWeight={700} fill="#E05A1E" textAnchor="start">N</text>
      </g>
      {/* 下屋（部分二階の2階）: 1階の外形を破線で重ね、1階の板から2階の板を引いた部分に淡いハッチと「下屋」ラベル。
          2階の外壁・窓より下層に描く（後に描くと外壁が半分の太さに見え、窓の二重線が潰れる） */}
      {fl.fp && floorIdx > 0 && <Shimoya outer={floorRect(plan, 0)} fp={fp} uid={uid} />}
      {/* 部屋の塗り */}
      {fl.rooms.map((r, i) => {
        let fill = FILL_OVERRIDE[r.type] ?? FILL[ROOM[r.type].cat]
        if (r.type === 'doma') fill = `url(#dots${uid})`
        if (r.type === 'void') fill = `url(#hatch${uid})`
        return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={fill} />
      })}
      {/* 対面キッチンカウンター */}
      {ldk && counter && (
        <>
          <rect x={counter.x} y={counter.y} width={counter.w} height={counter.h} fill="#e6d8bf" stroke="#a38c64" strokeWidth={0.14} />
          <rect x={ldk.x + ldk.w - Math.min(8, ldk.w - 3) + 0.1} y={ldk.y + 1.45} width={1.7} height={1.0} fill="#fff" stroke="#8a8a8a" strokeWidth={0.1} />
        </>
      )}
      {fl.rooms.map((r, i) => <Fixtures key={i} r={r} geom={geom} floorIdx={floorIdx} />)}
      {furniture.length > 0 && <Furniture items={furniture} />}
      {/* ドアの開き弧 */}
      <g stroke="#5a5a5a" strokeWidth={0.13} fill="rgba(90,90,90,0.07)">
        {doors.map((d, i) => (d.kind === 'fold' || d.kind === 'open' ? null : <path key={i} d={doorPath(d)} />))}
      </g>
      {/* 壁（外壁は内壁の約2倍強の太さ） */}
      <g fill="none" stroke={INK}>
        {fl.rooms.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} strokeWidth={0.19} />)}
        <rect x={fp.x} y={fp.y} width={fp.W} height={fp.H} strokeWidth={0.42} />
      </g>
      {/* 窓: 外壁を白抜きしてから二重線（4方位。小窓は細く、吹抜の高窓は破線）。白抜きの太さは外壁の線（0.42）に合わせ、
          室内側への食い込みを約0.02に抑える（器具・カウンター・階段の段線を削らない）。壁より後に描かないと壁が抜けない */}
      <g strokeLinecap="butt">
        {windows.map((wd, i) => {
          const g = windowLine(wd, fp)
          return <line key={i} {...g.main} stroke="#fdfcf8" strokeWidth={0.46} />
        })}
      </g>
      <g stroke="#2f7fb0" strokeWidth={0.17}>
        {windows.map((wd, i) => {
          const g = windowLine(wd, fp)
          const o = wd.kind === 'small' ? 0.2 : 0.26
          const dash = wd.kind === 'high' ? '0.5 0.3' : undefined
          const shift = (l: typeof g.main, d: number) =>
            g.horizontal ? { ...l, y1: l.y1 + d, y2: l.y2 + d } : { ...l, x1: l.x1 + d, x2: l.x2 + d }
          return (
            <g key={i} strokeDasharray={dash}>
              <line {...shift(g.main, -o)} />
              <line {...shift(g.main, o)} />
            </g>
          )
        })}
      </g>
      {/* 付属収納の折れ戸／引戸（弧なし）。壁を抜くので壁より後に描く。折れ戸があるときだけ */}
      {doors.some((d) => d.kind === 'fold') && (
        <g>{doors.map((d, i) => (d.kind === 'fold' ? <FoldDoor key={i} d={d} /> : null))}</g>
      )}
      {/* 階段の開口（扉なし）: 壁を抜く */}
      {doors.some((d) => d.kind === 'open') && (
        <g>{doors.map((d, i) => (d.kind === 'open' ? <OpeningGap key={i} d={d} /> : null))}</g>
      )}
      {/* 動線は部屋名ラベルより下 */}
      {showFlow && <FlowOverlay flows={flows} legendY={legendY} legendX={vbX + 1.2} />}
      {fl.rooms.map((r, i) => <RoomLabel key={i} r={r} kitchenFace={kitchenFace} furnished={furniture.length > 0} halo={showFlow && flows.length > 0} geom={geom} spot={labelPos?.[i]} />)}
      {/* 玄関ドア（南側・外開き） */}
      {entry && entry.y + entry.h === fpBottom && (() => {
        const ed = entryDoor(entry, fpBottom)
        return <path d={ed.path} fill="rgba(90,90,90,0.07)" stroke="#5a5a5a" strokeWidth={0.13} />
      })()}
      {siteStrip && (
        <>
          <rect x={0} y={H + 1.0} width={W} height={1.5} fill="#dedbd2" />
          <text x={W / 2} y={H + 2.15} fontSize={1.15} fill="#8a8578" textAnchor="middle">南道路</text>
        </>
      )}
    </svg>
  )
}
