import type { FlowKind, FlowLine } from '../lib/flow'

export const FLOW_COLOR: Record<FlowKind, string> = { guest: '#c25e3a', life: '#2f7fb0' }

/** 動線の折れ線と丸マーカー。FloorSvg の最前面（部屋ラベルより上）に重ねる */
export function FlowOverlay({ flows }: { flows: FlowLine[] }) {
  return (
    <g data-flow="overlay">
      {flows.map((f) => {
        const color = FLOW_COLOR[f.kind]
        return (
          <g key={f.kind} data-flow={f.kind}>
            <polyline
              points={f.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none" stroke={color} strokeWidth={0.38} strokeLinejoin="round" strokeLinecap="round"
              strokeDasharray={f.kind === 'life' ? '1.1 0.7' : undefined} opacity={0.9}
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
      {flows.map((f, i) => (
        <text key={f.kind} x={0} y={-3.2 + i * 1.35} fontSize={1.05} fontWeight={700} fill={FLOW_COLOR[f.kind]}>
          {f.kind === 'guest' ? '━' : '┅'} {f.label}
        </text>
      ))}
    </g>
  )
}
