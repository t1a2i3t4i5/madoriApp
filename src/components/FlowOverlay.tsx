import type { FlowKind, FlowLine } from '../lib/flow'

export const FLOW_COLOR: Record<FlowKind, string> = { guest: '#c25e3a', life: '#2f7fb0' }

const LINE_W = 0.38
const dashOf = (k: FlowKind) => (k === 'life' ? '1.1 0.7' : undefined)

/** 凡例帯の寸法（FloorSvg が viewBox を広げるのにも使う） */
export const LEGEND = { rowH: 1.5, padY: 0.5, sample: 3, textGap: 0.8, fontSize: 1.05 } as const
export const legendHeight = (n: number) => (n > 0 ? LEGEND.padY * 2 + n * LEGEND.rowH : 0)
/** 凡例の幅（線見本＋文字。文字幅は全角で fontSize × 文字数と見積もる＝やや大きめ）。狭い外形で右にはみ出さないために使う */
export const legendWidth = (flows: FlowLine[]) =>
  flows.length ? LEGEND.sample + LEGEND.textGap + Math.max(...flows.map((f) => f.label.length)) * LEGEND.fontSize : 0

interface Props {
  flows: FlowLine[]
  /** 凡例帯の開始 y（敷地帯の下）。凡例は viewBox の下端に足した専用の帯に縦に積む */
  legendY: number
  /** 凡例の左端 x */
  legendX: number
}

/**
 * 動線の折れ線と丸マーカー、凡例。FloorSvg では部屋ラベルより下に描く（ラベルは白縁取りで読めるようにする）。
 * 凡例は図面と重ならないよう legendY 以降の帯に置く。線見本は本体と同じ stroke / dasharray の <line>（文字だと PNG で豆腐になる）
 */
export function FlowOverlay({ flows, legendY, legendX }: Props) {
  return (
    <g data-flow="overlay">
      {flows.map((f) => {
        const color = FLOW_COLOR[f.kind]
        return (
          <g key={f.kind} data-flow={f.kind}>
            <polyline
              points={f.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={color} strokeWidth={LINE_W} strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={dashOf(f.kind)} opacity={0.9}
            />
            {f.stops.map((s, i) => (
              <g key={i}>
                {s.role === 'stair' ? (
                  <>
                    <circle cx={s.x} cy={s.y} r={0.85} fill="#fff" stroke={color} strokeWidth={0.28} />
                    <text x={s.x} y={s.y - 1.2} fontSize={1.05} fontWeight={700} textAnchor="middle" fill={color} stroke="#fff" strokeWidth={0.3} paintOrder="stroke">{s.label}</text>
                  </>
                ) : s.role === 'via' ? (
                  <circle cx={s.x} cy={s.y} r={0.34} fill={color} />
                ) : (
                  <circle cx={s.x} cy={s.y} r={0.7} fill={s.role === 'start' ? color : '#fff'} stroke={color} strokeWidth={0.28} />
                )}
              </g>
            ))}
          </g>
        )
      })}
      {/* 凡例（PNG にも残る） */}
      <g data-flow="legend">
        {flows.map((f, i) => {
          const cy = legendY + LEGEND.padY + (i + 0.5) * LEGEND.rowH
          return (
            <g key={f.kind}>
              <line
                x1={legendX} y1={cy} x2={legendX + LEGEND.sample} y2={cy}
                stroke={FLOW_COLOR[f.kind]} strokeWidth={LINE_W} strokeLinecap="round" strokeDasharray={dashOf(f.kind)} opacity={0.9}
              />
              <text x={legendX + LEGEND.sample + LEGEND.textGap} y={cy + 0.36} fontSize={LEGEND.fontSize} fontWeight={700} fill={FLOW_COLOR[f.kind]}>{f.label}</text>
            </g>
          )
        })}
      </g>
    </g>
  )
}
