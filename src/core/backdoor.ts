import type { Plan, Room } from './types'

/**
 * 勝手口の候補（R-FLOW-07。洗濯動線 PR-L1）。純関数・フレームワーク非依存。1F だけ。
 * **生成・スコア・`computeDoors`・`computeWindows` には効かせない**（玄関の `entryDoor` と同じく別の導出）。
 * 候補の順: (1) 洗濯機の部屋（ランドリー、なければ洗面）の東西の外壁（接触 2 セル以上）→ (2) 1F ホールの東西の端。
 * 各側は駐車と反対の側を先に。北の外壁は日が当たらず干せないので候補にしない（R-FLOW-07）。
 * 物干し場が置けるかは敷地の都合（`site.ts` の `siteLayout`）なので、そこで先頭から試して最初に置ける候補を採る
 */

/** 勝手口の幅（セル。約 0.73m の片開き戸）［暫定］ */
export const BACKDOOR_W = 1.6

export interface BackDoor {
  /** B = 洗濯機の部屋の勝手口／C = 1F ホールの端の勝手口 */
  kind: 'B' | 'C'
  side: 'W' | 'E'
  /** 勝手口のある部屋 */
  room: Room
  /** 外壁上の中心の位置（セル。x は外壁の x、y は接触区間の中央） */
  x: number
  y: number
  /** 戸の幅（BACKDOOR_W） */
  w: number
}

/** 洗濯機の部屋: 1F のランドリー、なければ洗面（日本の戸建ての標準どおり洗面脱衣室に洗濯機があるとみなす。R-FLOW-06） */
export function washerRoom(plan: Pick<Plan, 'floors'>): Room | undefined {
  const rooms = plan.floors[0]?.rooms ?? []
  return rooms.find((r) => r.type === 'laundry') ?? rooms.find((r) => r.type === 'wash')
}

/** 部屋 r の東西の外壁の接触（接触 2 セル以上の側だけ）。板は 1F（総二階・平屋・部分二階とも W×H） */
function sideContacts(r: Room, W: number): { side: 'W' | 'E'; x: number; y: number }[] {
  const out: { side: 'W' | 'E'; x: number; y: number }[] = []
  if (r.h >= 2) {
    if (r.x === 0) out.push({ side: 'W', x: 0, y: r.y + r.h / 2 })
    if (r.x + r.w === W) out.push({ side: 'E', x: W, y: r.y + r.h / 2 })
  }
  return out
}

/** 勝手口の候補を優先順に返す。parkSide は駐車の側（玄関のある側）。なければ空 */
export function backDoorCandidates(plan: Pick<Plan, 'W' | 'floors'>, parkSide: 'W' | 'E'): BackDoor[] {
  const rooms = plan.floors[0]?.rooms ?? []
  const opp = parkSide === 'W' ? 'E' : 'W'
  const out: BackDoor[] = []
  const add = (kind: 'B' | 'C', room: Room | undefined) => {
    if (!room) return
    const cs = sideContacts(room, plan.W).sort((a, b) => (a.side === opp ? 0 : 1) - (b.side === opp ? 0 : 1))
    for (const c of cs) out.push({ kind, side: c.side, room, x: c.x, y: c.y, w: BACKDOOR_W })
  }
  add('B', washerRoom(plan))
  add('C', rooms.find((r) => r.type === 'hall'))
  return out
}
