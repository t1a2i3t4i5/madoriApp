import type { Room } from '../core/types'
import type { StairGeom } from '../core/stair'

/** 階段の上り矢印と重ならないよう、ラベルは上端に置き、矢印は下側に短縮する（この高さ以上のときだけ。FloorSvg の RoomLabel と共有） */
export const STAIR_LABEL_MIN_H = 5.2

/**
 * 折り返し階段（GEN_VERSION 6）。2列の境の手すり壁・各列の段線（6段 = 5本）・踊り場（段線なし）・口の辺の側から始まり踊り場で折り返す U 字の矢印。
 * 1F は上りの列の途中に切断線（斜めの二重線）を引き、それより上（2階に属する部分）を破線にする。2F は全体を実線で描き、矢印に「下」を添える。
 * 段数の注記は描かない（段数の根拠が［暫定］のため）
 */
function UStair({ geom, floorIdx }: { geom: StairGeom; floorIdx: number }) {
  const INK_S = '#55504a'
  const LINE = '#9a958a'
  const [up, down] = geom.flights
  const TREADS = 6
  const first = floorIdx === 0
  // 上り（1F）: 口 → 上りの列 → 踊り場 → 下りの列。2F の下りは逆向き（矢印は同じ U の逆回り）
  const startCol = first ? up : down
  const endCol = first ? down : up
  const sx = startCol.x + startCol.w / 2
  const ex = endCol.x + endCol.w / 2
  const yMouth = up.y + up.h - 0.35
  const yTurn = geom.landing.y + geom.landing.h - 0.5
  // 矢印の先端（口の側）。頭は南向き
  const tipY = yMouth
  // 切断線（1F）: 上りの列の 3 段目と 4 段目の境（列の中ほど）。それより北は破線
  const cutK = TREADS / 2
  const cutY = up.y + up.h - (up.h / TREADS) * cutK
  const stepLines = (f: StairGeom['flights'][number], dashedFrom: number | null) =>
    Array.from({ length: TREADS - 1 }, (_, k) => {
      // k 本目の段線（口に近い側から数える）
      const yy = f.y + f.h - (f.h / TREADS) * (k + 1)
      const dashed = dashedFrom !== null && k + 1 > dashedFrom
      return <line key={k} x1={f.x} y1={yy} x2={f.x + f.w} y2={yy} stroke={LINE} strokeWidth={0.12} strokeDasharray={dashed ? '0.4 0.3' : undefined} />
    })
  return (
    <>
      {stepLines(up, first ? cutK : null)}
      {stepLines(down, first ? 0 : null)}
      {/* 中央の手すり壁（2列の境）。踊り場の下端から口の側の端まで */}
      <line x1={up.x + (up.x < down.x ? up.w : 0)} y1={geom.landing.y + geom.landing.h} x2={up.x + (up.x < down.x ? up.w : 0)} y2={up.y + up.h} stroke={INK_S} strokeWidth={0.2} />
      {first && (
        <g stroke={INK_S} strokeWidth={0.14}>
          <line x1={up.x - 0.1} y1={cutY + 0.45} x2={up.x + up.w + 0.1} y2={cutY - 0.15} />
          <line x1={up.x - 0.1} y1={cutY + 0.75} x2={up.x + up.w + 0.1} y2={cutY + 0.15} />
        </g>
      )}
      {/* U 字の矢印: 口 → 列の北端 → 踊り場で折り返し → もう一方の列を口の側へ（頭は口の側） */}
      <path d={`M ${sx} ${yMouth} L ${sx} ${yTurn} L ${ex} ${yTurn} L ${ex} ${tipY - 0.2}`} fill="none" stroke={INK_S} strokeWidth={0.22} strokeLinejoin="round" />
      <path d={`M ${ex - 0.55} ${tipY - 1.0} L ${ex} ${tipY} L ${ex + 0.55} ${tipY - 1.0}`} fill="none" stroke={INK_S} strokeWidth={0.22} strokeLinejoin="round" />
      {!first && <text x={sx} y={yMouth - 0.55} fontSize={0.9} fontWeight={700} fill={INK_S} textAnchor="middle" stroke="#fff" strokeWidth={0.3} strokeLinejoin="round" paintOrder="stroke">下</text>}
    </>
  )
}

/** 水回りの器具・階段・畳目など、部屋種別ごとの描き込み。stair は geom（折り返し）があれば折り返しで、なければ従来の直進で描く */
export function Fixtures({ r, geom, floorIdx = 0 }: { r: Room; geom?: StairGeom | null; floorIdx?: number }) {
  const { x, y, w, h } = r
  const B = '#7f949f'
  switch (r.type) {
    case 'bath':
      return (
        <>
          <rect x={x + 0.5} y={y + 0.6} width={Math.max(2.4, w - 1.6)} height={1.7} rx={0.7} fill="#fff" stroke={B} strokeWidth={0.14} />
          <rect x={x + w - 2.1} y={y + h - 2.3} width={1.6} height={1.6} fill="#fff" stroke={B} strokeWidth={0.12} />
        </>
      )
    case 'wc':
      return (
        <>
          <rect x={x + w / 2 - 0.75} y={y + 0.4} width={1.5} height={0.8} fill="#fff" stroke={B} strokeWidth={0.12} />
          <ellipse cx={x + w / 2} cy={y + 1.9} rx={0.75} ry={0.95} fill="#fff" stroke={B} strokeWidth={0.12} />
        </>
      )
    case 'wash': {
      const bw = Math.min(2.6, w - 0.8)
      return (
        <>
          <rect x={x + 0.4} y={y + 0.4} width={bw} height={1.2} fill="#fff" stroke={B} strokeWidth={0.12} />
          <ellipse cx={x + 0.4 + bw / 2} cy={y + 1.0} rx={0.8} ry={0.42} fill="none" stroke={B} strokeWidth={0.1} />
        </>
      )
    }
    case 'kitchen':
      return (
        <>
          <rect x={x} y={y} width={w} height={1.4} fill="#e6d8bf" stroke="#a38c64" strokeWidth={0.12} />
          <rect x={x + 0.5} y={y + 0.25} width={1.6} height={0.9} fill="#fff" stroke="#8a8a8a" strokeWidth={0.1} />
          {[0, 1].map((i) => (
            <circle key={i} cx={x + w - 1.6 - i * 1.1} cy={y + 0.7} r={0.42 - i * 0.14} fill="none" stroke="#8a8a8a" strokeWidth={0.1} />
          ))}
        </>
      )
    case 'stair': {
      if (geom) return <UStair geom={geom} floorIdx={floorIdx} />
      const steps = Math.max(3, Math.floor(h) - 1)
      const cx = x + w / 2
      // 名前を上端に置ける高さのときは、矢印の頭をラベルの下で止める
      const top = r.h >= STAIR_LABEL_MIN_H && w >= 2.2 ? y + 3.0 : y + 1.1
      return (
        <>
          {Array.from({ length: steps - 1 }, (_, k) => {
            const yy = y + (h / steps) * (k + 1)
            return <line key={k} x1={x} y1={yy} x2={x + w} y2={yy} stroke="#9a958a" strokeWidth={0.12} />
          })}
          <line x1={cx} y1={y + h - 0.7} x2={cx} y2={top} stroke="#55504a" strokeWidth={0.22} />
          <path d={`M ${cx - 0.55} ${top + 0.8} L ${cx} ${top - 0.3} L ${cx + 0.55} ${top + 0.8}`} fill="none" stroke="#55504a" strokeWidth={0.22} />
        </>
      )
    }
    case 'washitsu': {
      const S = '#a9b783'
      return (
        <>
          <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={S} strokeWidth={0.14} />
          <line x1={x} y1={y + h / 2} x2={x + w / 2} y2={y + h / 2} stroke={S} strokeWidth={0.14} />
          <line x1={x + w / 2} y1={y + h / 4} x2={x + w} y2={y + h / 4} stroke={S} strokeWidth={0.14} />
          <line x1={x + w / 2} y1={y + (3 * h) / 4} x2={x + w} y2={y + (3 * h) / 4} stroke={S} strokeWidth={0.14} />
        </>
      )
    }
    case 'closet': {
      // ハンガーパイプ: 長辺に沿った一点鎖線
      const vertical = h >= w
      const pipe = vertical
        ? { x1: x + w / 2, y1: y + 0.5, x2: x + w / 2, y2: y + h - 0.5 }
        : { x1: x + 0.5, y1: y + h / 2, x2: x + w - 0.5, y2: y + h / 2 }
      return <line {...pipe} stroke="#b3a077" strokeWidth={0.12} strokeDasharray="1.2 0.3 0.2 0.3" />
    }
    case 'wic':
    case 'store':
    case 'pantry':
      return <rect x={x + 0.25} y={y + 0.25} width={Math.max(0.6, w - 0.5)} height={0.55} fill="#d8c9a8" stroke="#b3a077" strokeWidth={0.08} />
    case 'laundry':
      return (
        <>
          <rect x={x + 0.4} y={y + 0.4} width={1.5} height={1.5} rx={0.25} fill="#fff" stroke={B} strokeWidth={0.12} />
          <circle cx={x + 1.15} cy={y + 1.15} r={0.5} fill="none" stroke={B} strokeWidth={0.1} />
        </>
      )
    default:
      return null
  }
}
