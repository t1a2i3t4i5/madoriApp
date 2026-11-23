import type { Plan, PlanConfig } from '../core/types'

export function SiteSvg({ cfg, plan }: { cfg: PlanConfig; plan: Plan }) {
  const { W, H } = plan
  const lotW = W + 10
  const lotH = H + 12
  const gw = cfg.garden === 2 ? lotW * 0.42 : lotW * 0.24
  return (
    <svg viewBox={`0 0 ${lotW} ${lotH}`} xmlns="http://www.w3.org/2000/svg" role="img" aria-label="敷地イメージ" className="block h-auto w-full">
      <rect x={0.5} y={0.5} width={lotW - 1} height={lotH - 1} fill="#eeede6" stroke="#c4c1b4" strokeWidth={0.3} />
      {cfg.garden > 0 && (
        <>
          <rect x={lotW - gw - 1} y={1} width={gw} height={lotH - 9} fill="#d3dcc6" />
          <text x={lotW - gw / 2 - 1} y={6} fontSize={1.6} fill="#5b6b4c" textAnchor="middle">庭</text>
        </>
      )}
      <rect x={5} y={4} width={W} height={H} fill="#fdfcf8" stroke="#26241f" strokeWidth={0.4} />
      <text x={5 + W / 2} y={4 + H / 2 + 0.6} fontSize={1.8} fontWeight={700} fill="#33302a" textAnchor="middle">建物</text>
      {cfg.parking > 0 && (
        <>
          {Array.from({ length: cfg.parking }, (_, i) => {
            const px = 5 + i * 6
            return (
              <g key={i}>
                <rect x={px} y={4 + H + 1.2} width={5.4} height={9} fill="#d8d9d8" stroke="#9a9d9e" strokeWidth={0.25} />
                <rect x={px + 0.8} y={4 + H + 2.6} width={3.8} height={6} rx={0.8} fill="#aeb9bf" />
              </g>
            )
          })}
          <text x={5 + cfg.parking * 3} y={4 + H + 12.4} fontSize={1.5} fill="#5d686e" textAnchor="middle">駐車 {cfg.parking}台</text>
        </>
      )}
      <rect x={0.5} y={lotH - 2.2} width={lotW - 1} height={1.7} fill="#dedbd2" />
      <text x={lotW / 2} y={lotH - 0.9} fontSize={1.4} fill="#8a8578" textAnchor="middle">南道路</text>
    </svg>
  )
}
