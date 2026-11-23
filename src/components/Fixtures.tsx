import type { Room } from '../core/types'

/** 水回りの器具・階段・畳目など、部屋種別ごとの描き込み */
export function Fixtures({ r }: { r: Room }) {
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
      const steps = Math.max(3, Math.floor(h) - 1)
      const cx = x + w / 2
      return (
        <>
          {Array.from({ length: steps - 1 }, (_, k) => {
            const yy = y + (h / steps) * (k + 1)
            return <line key={k} x1={x} y1={yy} x2={x + w} y2={yy} stroke="#9a958a" strokeWidth={0.12} />
          })}
          <line x1={cx} y1={y + h - 0.7} x2={cx} y2={y + 1.1} stroke="#55504a" strokeWidth={0.22} />
          <path d={`M ${cx - 0.55} ${y + 1.9} L ${cx} ${y + 0.8} L ${cx + 0.55} ${y + 1.9}`} fill="none" stroke="#55504a" strokeWidth={0.22} />
        </>
      )
    }
    case 'washitsu': {
      const S = '#aebd9f'
      return (
        <>
          <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={S} strokeWidth={0.14} />
          <line x1={x} y1={y + h / 2} x2={x + w / 2} y2={y + h / 2} stroke={S} strokeWidth={0.14} />
          <line x1={x + w / 2} y1={y + h / 4} x2={x + w} y2={y + h / 4} stroke={S} strokeWidth={0.14} />
          <line x1={x + w / 2} y1={y + (3 * h) / 4} x2={x + w} y2={y + (3 * h) / 4} stroke={S} strokeWidth={0.14} />
        </>
      )
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
