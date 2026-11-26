import type { Door, Room } from './types'
import { computeDoors, sharedEdge } from './derive'
import { bandHall } from './rooms'
import { hallCoversMouth, stairMouthCovered } from './stair'

/**
 * 廊下・階段まわりの規則（GEN_VERSION 6）の調整値。通常は書き換えない
 * （計測スクリプトだけが、候補を比べるために書き換える。生成結果が変わるので、変えたら GEN_VERSION と fixture を更新する）。
 */
export const HALL_RULES = {
  /** ホール帯の端の吸収を行うか（計測用。false にすると吸収なし = v5 のホール帯のまま） */
  absorb: true,
  /** 吸収・行き止まりの収納化の後に残すホールの長さ（セル）の下限 */
  minHallLen: 4,
  /**
   * 階段の口の辺の全幅の条件（吸収・行き止まりの収納化の採否）。
   * 'hall' = ホール1室が全幅を覆う / 'open' = 開口でつながる部屋（ホール・玄関・土間・LDK）の和が全幅を覆う /
   * 'two' = ホールが辺を2セル以上共有する（試作の条件）
   */
  mouth: 'hall' as 'hall' | 'open' | 'two',
  /**
   * 吸収で個室収納（個室にドアでつながる 2×4 以上のクローゼット・WIC・持ち主のある収納）が減るなら、その吸収は採らない
   * （吸収が、ホール帯の端の収納化（carve）より先に端を取って個室のクローゼットを奪うのを防ぐ）
   */
  keepStorage: true,
  /** 玄関・土間の吸収は、最大面積を超えないときだけ */
  entryMaxOnly: true,
  /**
   * 主寝室・洋室は、ホール・玄関・土間からだけ入れる（和室・書斎は LDK からも可）。false = 個室すべてに LDK からの入口を許す。
   * 仕様の推奨どおり true。実測（レビュー時）: true にしても3案が出る条件は 69 → 69 で変わらず、人気6条件の提示案も不変
   * （平屋 30坪/個室3 の候補プールは 36 → 31 に減る）。false だと LDK を通らないと入れない寝室が出る（グリッド提示案207件のうち24件）。
   * 2階建ては LDK が1Fだけ・個室が2Fだけなので影響しない（平屋だけ）
   */
  strictBed: true,
}

const CIRC: ReadonlySet<string> = new Set(['hall', 'entry', 'doma'])

/**
 * 動線のガード（A4。ハード制約）の違反を返す（なければ空）。ドア・開口でつながる相手の種別で判定する:
 * - G1 トイレ: ホール・玄関・土間のいずれかとつながる
 * - G2 洗面: ホール・玄関・土間・LDK のいずれかとつながる（個室経由は不可）
 * - G3 個室: 主寝室・洋室・書斎・和室は、ホール・玄関・土間・LDK のいずれかとつながる（HALL_RULES.strictBed が true なら、主寝室・洋室は LDK を除く）
 * - G4 階段と玄関のある階（2階建ての1F）: 玄関（なければ土間）が階段と直接つながるか、玄関・ホール・階段がつながる
 */
export function guardViolations(rooms: readonly Room[], doors: readonly Door[] = computeDoors(rooms as Room[])): string[] {
  const out: string[] = []
  const nb = (r: Room): Room[] => doors.filter((d) => d.a === r || d.b === r).map((d) => (d.a === r ? d.b : d.a))
  const types = (r: Room) => nb(r).map((n) => n.type as string)
  for (const r of rooms) {
    const t = types(r)
    const circ = t.some((x) => CIRC.has(x))
    if (r.type === 'wc' && !circ) out.push('トイレがホール・玄関・土間につながっていない')
    if (r.type === 'wash' && !circ && !t.includes('ldk')) out.push('洗面がホール・玄関・土間・LDK につながっていない')
    if (r.type === 'master' || r.type === 'bed') {
      if (!circ && !(!HALL_RULES.strictBed && t.includes('ldk'))) out.push(`${r.name}がホール・玄関・土間につながっていない`)
    }
    if ((r.type === 'washitsu' || r.type === 'study') && !circ && !t.includes('ldk')) out.push(`${r.name}がホール・玄関・土間・LDK につながっていない`)
  }
  const stair = rooms.find((r) => r.type === 'stair')
  const entry = rooms.find((r) => r.type === 'entry') ?? rooms.find((r) => r.type === 'doma')
  if (stair && entry) {
    const direct = nb(entry).includes(stair)
    // 玄関ホール（GEN_VERSION 10）を挟んでもよい: 玄関からホールだけをたどって階段に着けば可
    const seen = new Set<Room>()
    const todo = nb(entry).filter((n) => n.type === 'hall')
    let viaHall = false
    while (todo.length > 0) {
      const h = todo.pop() as Room
      if (seen.has(h)) continue
      seen.add(h)
      if (nb(h).includes(stair)) {
        viaHall = true
        break
      }
      todo.push(...nb(h).filter((n) => n.type === 'hall'))
    }
    if (!direct && !viaHall) out.push('玄関から LDK を通らずに階段へ行けない')
  }
  return out
}

/** 階段の口の辺の全幅の条件（HALL_RULES.mouth）を満たすか。階段がなければ true。吸収（hall.ts）と行き止まりの収納化（carve.ts）の採否に使う */
export function mouthRuleOk(rooms: readonly Room[]): boolean {
  const stair = rooms.find((r) => r.type === 'stair')
  if (!stair) return true
  if (HALL_RULES.mouth === 'hall') return hallCoversMouth(rooms)
  if (HALL_RULES.mouth === 'open') return stairMouthCovered(rooms)
  const hall = bandHall(rooms)
  return !!hall && sharedEdge(stair, hall) !== null
}
