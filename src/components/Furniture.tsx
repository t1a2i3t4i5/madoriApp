import type { FurnitureItem } from '../core/furnish'

const STROKE = '#a39c86'
const FILL = 'rgba(255,255,255,0.55)'
const SW = 0.1

/** 家具の描画。細い線・薄い色で、部屋ラベルより下の層に置く（FloorSvg でラベルの前に差し込む） */
function Item({ it }: { it: FurnitureItem }) {
  const { x, y, w, h } = it
  const horizontal = w > h
  switch (it.kind) {
    case 'bed1':
    case 'bed2': {
      // 枕を短辺の壁側に2つ（ダブル）/1つ（シングル）。向きは長辺方向
      const n = it.kind === 'bed2' ? 2 : 1
      const pillows = Array.from({ length: n }, (_, i) => {
        if (horizontal) {
          const ph = (h - 0.3 * (n + 1)) / n
          return <rect key={i} x={x + 0.25} y={y + 0.3 + i * (ph + 0.3)} width={0.9} height={ph} rx={0.2} fill="#fff" stroke={STROKE} strokeWidth={SW} />
        }
        const pw = (w - 0.3 * (n + 1)) / n
        return <rect key={i} x={x + 0.3 + i * (pw + 0.3)} y={y + 0.25} width={pw} height={0.9} rx={0.2} fill="#fff" stroke={STROKE} strokeWidth={SW} />
      })
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={0.2} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {pillows}
        </g>
      )
    }
    case 'sofa':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={0.3} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {horizontal
            ? <line x1={x + 0.3} y1={y + 0.5} x2={x + w - 0.3} y2={y + 0.5} stroke={STROKE} strokeWidth={SW} />
            : <line x1={x + 0.5} y1={y + 0.3} x2={x + 0.5} y2={y + h - 0.3} stroke={STROKE} strokeWidth={SW} />}
        </g>
      )
    case 'dining':
      return (
        <g>
          <rect x={x} y={y} width={w} height={h} rx={0.2} fill={FILL} stroke={STROKE} strokeWidth={SW} />
          {horizontal
            ? <line x1={x + w / 2} y1={y} x2={x + w / 2} y2={y + h} stroke={STROKE} strokeWidth={SW} strokeDasharray="0.3 0.3" />
            : <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={STROKE} strokeWidth={SW} strokeDasharray="0.3 0.3" />}
        </g>
      )
    default: // tv, desk
      return <rect x={x} y={y} width={w} height={h} fill={FILL} stroke={STROKE} strokeWidth={SW} />
  }
}

export function Furniture({ items }: { items: FurnitureItem[] }) {
  return (
    <g aria-hidden="true">
      {items.map((it, i) => <Item key={i} it={it} />)}
    </g>
  )
}
