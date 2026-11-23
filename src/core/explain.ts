import type { Plan, PlanConfig, Room, ScoredPlan } from './types'
import { floorRect } from './types'
import { ROOM } from './rooms'
import { sharedEdge } from './derive'

/** 解説文に使う判定のしきい値（根拠のない褒め言葉を避けるため、満たしたときだけ書く） */
export const EXPLAIN_TH = {
  /** 水回り集約スコアがこれ以上なら「近くにまとまる」と書く */
  waterGood: 0.8,
  /** 廊下（ホール）面積 ÷ 延床 がこれ未満なら「廊下が短い」（planTags と同じ 7%） */
  hallShort: 0.07,
  /** 廊下率がこれ以上なら弱点として触れる */
  hallLong: 0.11,
  /** 収納室（パントリー・WIC・収納）面積 ÷ 延床 がこれ以上なら「収納率が高い」 */
  storeHigh: 0.07,
  /** スコア内訳がこれ未満の項目は弱点として触れる */
  weak: 0.55,
} as const

/** 割合の表示。しきい値（7%・11% など）と食い違って見えないよう、小数1桁へ切り捨てる（6.96% を「7%」と書かない） */
const pct = (v: number) => `${(Math.floor(v * 1000 + 1e-9) / 10).toFixed(1)}%`

/** 部分二階の文: 2階が1階の約何割か、下屋がかかる方角。部分二階でなければ null（総二階の解説は変えない） */
function partialSentence(plan: Plan): string | null {
  const fp = plan.floors[1]?.fp
  if (!fp) return null
  const tenths = Math.round(((fp.W * fp.H) / (plan.W * plan.H)) * 10)
  const sides: string[] = []
  if (fp.x > 0) sides.push('西')
  if (fp.x + fp.W < plan.W) sides.push('東')
  if (fp.y + fp.H < plan.H) sides.push('南')
  const where = sides.length ? `${sides.join('・')}側に下屋がかかります` : '下屋があります'
  return `2階は1階の約${tenths}割の部分二階で、${where}。`
}

/** 1つの事実。つなぐとき用の「〜て」形と、文末用の「〜です。」形を持つ */
interface Clause { te: string; end: string }
const clause = (te: string, end: string): Clause => ({ te, end })

/** 節を1文にする（最後だけ文末形、手前は読点でつなぐ） */
function sentence(cs: Clause[]): string {
  return cs.map((c, i) => (i === cs.length - 1 ? c.end : `${c.te}、`)).join('')
}

function allRooms(plan: Plan): Room[] {
  return plan.floors.flatMap((f) => f.rooms)
}

/** 階段が外形の東端・西端にあるときの側。どちらでもなければ null */
function stairSide(plan: Plan): { side: '東' | '西'; floorIdx: number; stair: Room } | null {
  for (const [floorIdx, fl] of plan.floors.entries()) {
    const stair = fl.rooms.find((r) => r.type === 'stair')
    if (!stair) continue
    const fp = floorRect(plan, floorIdx)
    if (stair.x === fp.x) return { side: '西', floorIdx, stair }
    if (stair.x + stair.w === fp.x + fp.W) return { side: '東', floorIdx, stair }
    return null
  }
  return null
}

/**
 * 案の特徴から2〜3文の日本語解説を作る純関数。
 * 判定はスコア内訳・部屋配置・入力条件だけから導き、当てはまらない特徴は書かない。
 * 1文目: 配置（LDK の位置・吹抜）、2文目: 動線・水回り・収納、3文目: 階段 or 気になる点
 */
export function explainPlan(cfg: PlanConfig, plan: ScoredPlan): string {
  const rooms = allRooms(plan)
  const ldkFloor = plan.floors.findIndex((f) => f.rooms.some((r) => r.type === 'ldk'))
  const ldk = plan.floors[ldkFloor]?.rooms.find((r) => r.type === 'ldk')
  const parts = plan.score.parts
  const area = plan.totalArea || 1
  const hallRatio = rooms.filter((r) => r.type === 'hall').reduce((s, r) => s + r.area, 0) / area
  const storeRatio = rooms.filter((r) => ROOM[r.type].cat === 'store').reduce((s, r) => s + r.area, 0) / area
  const hasVoid = rooms.some((r) => r.type === 'void')

  // --- 1文目: 配置 ---
  const s1: Clause[] = []
  if (ldk) {
    // LDK は1F前提のため、南判定は plan.H（1Fの板）のまま。部分二階でも 1F は plan.W × plan.H
    const south = ldk.y + ldk.h === plan.H
    // キッチンが独立している案は、LDK の畳数にキッチンを含める（LDK として使う広さ）
    const kitchen = plan.floors[ldkFloor]?.rooms.find((r) => r.type === 'kitchen')
    const tatami = Math.round((ldk.area + (kitchen?.area ?? 0)) / 8)
    const where = plan.floors.length === 2 ? `${plan.floors[ldkFloor]?.label ?? ''}の` : ''
    s1.push(south
      ? clause(`${where}LDKは南側で日当たりがよく約${tatami}畳あり`, `${where}LDKは南側で日当たりがよく、約${tatami}畳です。`)
      : clause(`${where}LDKは約${tatami}畳で`, `${where}LDKは約${tatami}畳です。`))
  }
  if (hasVoid) s1.push(clause('吹抜で縦の広がりもあり', '吹抜で縦の広がりもあります。'))
  else if (plan.floors.length === 1) s1.push(clause('ワンフロアで生活が完結し', 'ワンフロアで生活が完結します。'))

  // --- 2文目: 動線・水回り・収納 ---
  const s2: Clause[] = []
  if (hallRatio === 0) s2.push(clause('廊下がなく', '廊下がありません。'))
  else if (hallRatio < EXPLAIN_TH.hallShort) s2.push(clause(`廊下は延床の約${pct(hallRatio)}と短く`, `廊下は延床の約${pct(hallRatio)}と短めです。`))
  if (parts.水回り集約 >= EXPLAIN_TH.waterGood) s2.push(clause('水回りが近くに集約され', '水回りが近くに集約されています。'))
  if (storeRatio >= EXPLAIN_TH.storeHigh) s2.push(clause(`収納室が延床の約${pct(storeRatio)}あり`, `収納室が延床の約${pct(storeRatio)}あり、収納は多めです。`))

  const sentences: string[] = []
  if (s1.length) sentences.push(sentence(s1))
  if (s2.length) sentences.push(sentence(s2))

  // --- 3文目: 階段（個室が面しているかを階ごとの事実として）と、気になる点 ---
  // 弱点がある案では必ず触れる。枠（3文）が足りないときは階段の文と1文にまとめる
  const weak: string[] = []
  if (hallRatio >= EXPLAIN_TH.hallLong) weak.push('廊下がやや長いこと')
  if (parts.縦横比 < EXPLAIN_TH.weak) weak.push('細長い部屋があること')
  if (parts.面積適合 < EXPLAIN_TH.weak) weak.push('目標の広さから外れた部屋があること')
  const weakText = weak.length ? `気になる点は、${weak.join('、')}です。` : ''

  const st = stairSide(plan)
  if (st && plan.floors.length === 2) {
    // 階ごとに、その階の個室（cat が bed: 主寝室・洋室・書斎・和室）がその階の階段に面しているかを見る
    const perFloor = plan.floors.map((f) => {
      const stair = f.rooms.find((r) => r.type === 'stair')
      const beds = f.rooms.filter((r) => ROOM[r.type].cat === 'bed')
      return { beds, facing: !!stair && beds.some((b) => sharedEdge(b, stair)) }
    })
    const hasBeds = perFloor.some((f) => f.beds.length > 0)
    const quiet = hasBeds && perFloor.every((f) => !f.facing)
    const stairText = quiet
      ? `階段は${st.side}端にあり、個室は階段に面していないため静かに保ちやすい配置です。`
      : `階段は${st.side}端に寄せています。`
    if (weakText && sentences.length >= 2) sentences.push(`階段は${st.side}端に寄せていますが、${weakText}`)
    else sentences.push(stairText, ...(weakText ? [weakText] : []))
  } else if (weakText) {
    sentences.push(weakText)
  }

  // --- 補い: 2文に満たないときは事実だけを足す ---
  if (sentences.length < 2) {
    if (parts.採光 >= 1) sentences.push('すべての居室が外壁に面しており、採光は確保されています。')
    else sentences.push(`${cfg.floors === 2 ? '2階建て' : '平屋'}・個室${cfg.rooms}室の構成です。`)
  }
  // 部分二階は、割合と下屋の文を先頭に足す（本体の2〜3文は総二階と同じ判定。弱点の文が押し出されないよう別枠）
  const head = partialSentence(plan)
  return (head ? [head, ...sentences.slice(0, 3)] : sentences.slice(0, 3)).join('')
}
