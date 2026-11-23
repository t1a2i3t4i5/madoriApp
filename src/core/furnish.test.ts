import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { enumeratePlans } from './enumerate'
import { computeDoors, doorSwingRect } from './derive'
import { PROGRAM, SIZE, areaLabelRect, blockedRects, candidates, furnish, isVerticalLabel, kitchenCounter, labelRect, overlaps, type FurnitureItem } from './furnish'
import { CONDITIONS, SEEDS } from './testing'
import type { Rect } from './derive'
import { minShort } from './rooms'
import type { PlanConfig, Room, ScoredPlan } from './types'

/**
 * 畳数行に重なった家具の件数の上限（GEN_VERSION 5 の標本での実測値585に余裕を足したもの（階段の前を塞ぐ行き止まりの切り出しをやめた後。それ以前は524）。増える退行を止める）。
 * v5 はクローゼット・収納が部屋に加わり（家具の対象外の部屋が増え）、洋室・主寝室がクローゼット分だけ小さくなったので、v4 の437より増えた。
 * v4 は最小の短辺で玄関・WIC などが幅3以上になり、部屋が細長く（帯の高さいっぱいに）なるため v2 の382より増えた。
 * v2 は変種が増え、同じ部屋形状が複数の案に現れるため v1 の標本（実測値190）より件数が多い。
 * 「避けられるのに重なった」件数は別途 0 を要求している
 */
const OVERLAP_MAX = 640

/** 標本: 条件ごとに候補プールのスコア上位24案 + seed 2つの3案（ギャラリーの多様性優先は極端な形が増えるので使わない） */
function allPlans(): { cfg: PlanConfig; plan: ScoredPlan }[] {
  const out: { cfg: PlanConfig; plan: ScoredPlan }[] = []
  for (const { cfg } of CONDITIONS) {
    for (const plan of enumeratePlans(cfg).slice(0, 24)) out.push({ cfg, plan })
    for (const seed of SEEDS.slice(0, 2)) for (const plan of generatePlans(cfg, seed)) out.push({ cfg, plan })
  }
  return out
}

const PLANS = allPlans()

/** 洋室（bed）のうち pred を満たす部屋の数と、ベッドと机を全て置けた数 */
function bedStat(pred: (r: Room) => boolean): { ok: number; total: number } {
  let ok = 0
  let total = 0
  for (const { cfg, plan } of PLANS) {
    for (const fl of plan.floors) {
      const placed = furnish(fl.rooms, computeDoors(fl.rooms), { kitchenFace: cfg.feats.includes('kitchenFace') })
      fl.rooms.forEach((r, i) => {
        if (r.type !== 'bed' || !pred(r)) return
        total++
        if (placed.filter((p) => p.room === i).length === (PROGRAM.bed?.length ?? 0)) ok++
      })
    }
  }
  return { ok, total }
}

describe('家具配置 furnish', () => {
  it('検証対象が空でない', () => {
    expect(PLANS.length).toBeGreaterThan(50)
  })

  it('全案・全階で、部屋内に収まりドア開き・カウンター・他家具と重ならない', () => {
    let items = 0
    for (const { cfg, plan } of PLANS) {
      const kitchenFace = cfg.feats.includes('kitchenFace')
      for (const fl of plan.floors) {
        const doors = computeDoors(fl.rooms)
        const placed = furnish(fl.rooms, doors, { kitchenFace })
        placed.forEach((it, i) => {
          items++
          const r = fl.rooms[it.room]
          expect(r).toBeDefined()
          if (!r) return
          const msg = `${r.type} ${it.kind} ${JSON.stringify(it)}`
          expect(it.x, msg).toBeGreaterThanOrEqual(r.x)
          expect(it.y, msg).toBeGreaterThanOrEqual(r.y)
          expect(it.x + it.w, msg).toBeLessThanOrEqual(r.x + r.w)
          expect(it.y + it.h, msg).toBeLessThanOrEqual(r.y + r.h)
          for (const d of doors) expect(overlaps(it, doorSwingRect(d)), `door ${msg}`).toBe(false)
          if (r.type === 'ldk' && kitchenFace) expect(overlaps(it, kitchenCounter(r)), `counter ${msg}`).toBe(false)
          expect(overlaps(it, labelRect(r, kitchenFace)), `label ${msg}`).toBe(false)
          placed.slice(i + 1).forEach((o) => expect(overlaps(it, o), `${msg} vs ${o.kind}`).toBe(false))
        })
      }
    }
    expect(items).toBeGreaterThan(100)
  })

  it('LDK は8割以上、主寝室は7割以上で（その部屋の家具を全て）置ける', () => {
    const stat = { ldk: { ok: 0, total: 0 }, master: { ok: 0, total: 0 } }
    for (const { cfg, plan } of PLANS) {
      for (const fl of plan.floors) {
        const placed = furnish(fl.rooms, computeDoors(fl.rooms), { kitchenFace: cfg.feats.includes('kitchenFace') })
        const count = (i: number, kind: FurnitureItem['kind']) => placed.some((p) => p.room === i && p.kind === kind)
        fl.rooms.forEach((r, i) => {
          if (r.type === 'ldk') {
            stat.ldk.total++
            if (count(i, 'tv') && count(i, 'sofa') && count(i, 'dining')) stat.ldk.ok++
          }
          if (r.type === 'master') {
            stat.master.total++
            if (count(i, 'bed2')) stat.master.ok++
          }
        })
      }
    }
    // 主寝室の下限 0.6 は GEN_VERSION 5 の実測 164/256（64.1%）の少し下。v4 は 160/256（62.5%）で下限 0.6、v3 までは 0.7 だった。
    // 主寝室の率は v4 から下がっていない（仕様の試作の予測は「下がる」だったが、実測は微増）。
    // v4 で下がった主因は部屋の形ではなく、(1) labelRect（部屋名ラベルの占有）の見積もりが大きめで置き場所を削ること、
    // (2) ドア弧を開き先の部屋側（内開き）へ正しく描くようにして、弧が室内を塞ぐことの2つ。
    // 以前の指標は細長い部屋ほど家具を壁沿いに並べやすく有利だったため、短辺を確保した形（幅広・短辺が長い）では見かけ上下がる。
    // 家具配置のロジックは変えていない。R-EXT-10（家具の見積もり）の前提課題は CLAUDE.md を参照
    const min: Record<string, number> = { ldk: 0.8, master: 0.6 }
    for (const [name, { ok, total }] of Object.entries(stat)) {
      expect(total, name).toBeGreaterThan(20)
      expect(ok / total, `${name} ${ok}/${total}`).toBeGreaterThanOrEqual(min[name] ?? 0.8)
    }
  })

  // 実測 97/522（18.6%）。0.17 は退行防止の下限（v4 は 79/522 = 15.1% で下限 0.14、v3 までは 0.25）。
  // v5 は v4 より上がったが、内訳は「小さい洋室が増え（4.4帖以下 23.2% → 29.3%）、4.4帖超の洋室の置ける率が上がった（19.7% → 26.3%）」。
  // 上がったのは後者で、前者は逆に率を押し下げている。4.4帖超で上がる理由は特定していない。ただし layoutFloor の帯の高さの目標に
  // クローゼット分を足す処理を外すと 97 → 43（8.2%）に落ちるので、その加算が効いている（仕様の試作の予測「下がる」とは逆の実測）
  it('子供部屋は（ベッドと机を）1割7分以上で置ける（退行防止の下限）', () => {
    const { ok, total } = bedStat(() => true)
    expect(total).toBeGreaterThan(100)
    expect(ok / total, `bed ${ok}/${total}`).toBeGreaterThanOrEqual(0.17)
  })

  // 別指標1: 短辺（MIN_SHORT）を満たす形に限った置ける率。実測 101/522（19.3%）。割り付けが短辺を下限にするので現状は全件が対象で、
  // 短辺の確保が緩んだとき（対象外が混ざる）に指標の意味が変わらないよう、対象を明示して固定する
  it('短辺を満たす洋室に限っても、ベッドと机は1割7分以上で置ける', () => {
    const { ok, total } = bedStat((r) => Math.min(r.w, r.h) >= minShort('bed'))
    expect(total).toBeGreaterThan(100)
    expect(ok / total, `bed(短辺OK) ${ok}/${total}`).toBeGreaterThanOrEqual(0.17)
  })

  // 別指標2: 洋室のうち 4.4帖（35.2セル²）以下の割合。実測 153/522（29.3%）で、この大きさでは1件も置けない（置けた97件は全て4.4帖超）。
  // 小さい洋室が増えるほど上の率は下がるので、割合の上限と、4.4帖超での置ける率（実測 97/369 = 26.3%）を別に固定する。
  // v4 の実測は 121/522（23.2%）・79/401（19.7%）。v5 は小さい洋室の割合が増え、4.4帖超の置ける率は上がった
  it('4.4帖以下の洋室は3割5分以下で、4.4帖超では2割5分以上で置ける', () => {
    const all = bedStat(() => true)
    const small = bedStat((r) => r.w * r.h <= 4.4 * 8)
    const large = bedStat((r) => r.w * r.h > 4.4 * 8)
    expect(small.total / all.total, `small ${small.total}/${all.total}`).toBeLessThanOrEqual(0.35)
    expect(small.ok, 'small ok').toBe(0)
    expect(large.ok / large.total, `large ${large.ok}/${large.total}`).toBeGreaterThanOrEqual(0.25)
  })

  it('書斎は7割5分以上で（机を）置ける（退行防止の下限）', () => {
    // ドアの弧の重なり回避を優先した結果、実測 92/115（80%）まで下がったのを受け入れ、余裕を持たせた下限にしている
    let ok = 0
    let total = 0
    for (const { cfg, plan } of PLANS) {
      for (const fl of plan.floors) {
        const placed = furnish(fl.rooms, computeDoors(fl.rooms), { kitchenFace: cfg.feats.includes('kitchenFace') })
        fl.rooms.forEach((r, i) => {
          if (r.type !== 'study') return
          total++
          if (placed.filter((p) => p.room === i).length === (PROGRAM.study?.length ?? 0)) ok++
        })
      }
    }
    expect(total).toBeGreaterThan(50)
    expect(ok / total, `study ${ok}/${total}`).toBeGreaterThanOrEqual(0.75)
  })

  it('畳数行: 避けられる位置があるケースでは家具が畳数行に重ならない（なければ部屋名のみ回避にフォールバック）', () => {
    let overlapped = 0
    let avoidable = 0
    let items = 0
    for (const { cfg, plan } of PLANS) {
      const kitchenFace = cfg.feats.includes('kitchenFace')
      for (const fl of plan.floors) {
        const doors = computeDoors(fl.rooms)
        const swings = doors.map((d) => doorSwingRect(d))
        const placed = furnish(fl.rooms, doors, { kitchenFace })
        placed.forEach((it, i) => {
          items++
          const r = fl.rooms[it.room]
          if (!r) return
          const area = areaLabelRect(r, kitchenFace)
          if (!area || !overlaps(it, area)) return
          overlapped++
          // 重なった家具について、同じ前提（先に置いた家具・ドア・カウンター・部屋名）で畳数行も避けられる候補が本当になかったか
          const blocked = [...blockedRects(r, swings, kitchenFace), area, ...placed.slice(0, i).filter((o) => o.room === it.room)]
          if (candidates(r, SIZE[it.kind], area).some((c) => !blocked.some((b) => overlaps(c, b)))) avoidable++
        })
      }
    }
    expect(items).toBeGreaterThan(100)
    expect(overlapped, `重なり件数の上限（退行検知）: ${overlapped}`).toBeLessThanOrEqual(OVERLAP_MAX)
    expect(avoidable).toBe(0)
  })

  it('旧候補リストでは畳数行に重なり、畳数行基準の候補で避けられる例（LDK 5×12 のダイニング）', () => {
    const ldk = { type: 'ldk', name: 'LDK', x: 0, y: 0, w: 5, h: 12, area: 60, target: 124, minArea: 72 } as const
    const area = areaLabelRect(ldk, false)
    expect(area).not.toBeNull()
    if (!area) return
    const blocked = blockedRects(ldk, [], false)
    // 旧版（畳数行基準の候補なし）の2段階配置を再現し、ダイニングが畳数行に重なることを確認
    const placedOld: Rect[] = []
    let oldDining: Rect | undefined
    for (const kind of PROGRAM.ldk ?? []) {
      const cs = candidates(ldk, SIZE[kind])
      const free = (c: Rect) => !blocked.some((b) => overlaps(c, b)) && !placedOld.some((o) => overlaps(c, o))
      const spot = cs.find((c) => free(c) && !overlaps(c, area)) ?? cs.find(free)
      if (spot) placedOld.push(spot)
      if (kind === 'dining') oldDining = spot
    }
    expect(oldDining).toBeDefined()
    if (oldDining) expect(overlaps(oldDining, area)).toBe(true)
    const dining = furnish([ldk], [], { kitchenFace: false }).find((i) => i.kind === 'dining')
    expect(dining).toBeDefined()
    if (dining) expect(overlaps(dining, area)).toBe(false)
  })

  it('配置数の保証: 単段配置（部屋名のみ回避）と2段階配置で置かれる家具の数が一致する', () => {
    for (const { cfg, plan } of PLANS) {
      const kitchenFace = cfg.feats.includes('kitchenFace')
      for (const fl of plan.floors) {
        const doors = computeDoors(fl.rooms)
        const swings = doors.map((d) => doorSwingRect(d))
        const two = furnish(fl.rooms, doors, { kitchenFace })
        fl.rooms.forEach((r, room) => {
          const placed: Rect[] = []
          for (const kind of PROGRAM[r.type] ?? []) {
            const blocked = blockedRects(r, swings, kitchenFace)
            const spot = candidates(r, SIZE[kind]).find((c) => !blocked.some((b) => overlaps(c, b)) && !placed.some((p) => overlaps(c, p)))
            if (spot) placed.push(spot)
          }
          expect(two.filter((t) => t.room === room).length, `${r.type} ${JSON.stringify(r)}`).toBe(placed.length)
        })
      }
    }
  })

  it('畳数行の見積もり: 描画条件（大きい横書きの部屋のみ）と一致し、部屋名の下に位置する', () => {
    const room = { type: 'master', name: '主寝室', x: 0, y: 0, w: 7, h: 8, area: 56, target: 56, minArea: 40 } as const
    const lab = labelRect(room, false)
    const area = areaLabelRect(room, false)
    expect(area).not.toBeNull()
    if (!area) return
    expect(area.y).toBeGreaterThanOrEqual(lab.y + lab.h - 0.5)
    expect(areaLabelRect({ ...room, w: 4, h: 4 }, false)).toBeNull()
    expect(areaLabelRect({ ...room, w: 2.6, h: 8 }, false)).toBeNull()
    // 部屋名・畳数行を避けられる広さの部屋では、ベッドは両方を避ける
    const roomy = { ...room, w: 14, h: 10 }
    const bed = furnish([roomy], [], { kitchenFace: false }).find((i) => i.kind === 'bed2')
    expect(bed).toBeDefined()
    if (bed) {
      expect(overlaps(bed, labelRect(roomy, false))).toBe(false)
      expect(overlaps(bed, areaLabelRect(roomy, false) ?? { x: 0, y: 0, w: 0, h: 0 })).toBe(false)
    }
  })

  it('再現性: 同じ入力で同じ結果、入力は破壊されない', () => {
    for (const { cfg, plan } of PLANS.slice(0, 40)) {
      for (const fl of plan.floors) {
        const doors = computeDoors(fl.rooms)
        const before = JSON.stringify(fl.rooms)
        const opts = { kitchenFace: cfg.feats.includes('kitchenFace') }
        expect(JSON.stringify(furnish(fl.rooms, doors, opts))).toBe(JSON.stringify(furnish(fl.rooms, doors, opts)))
        expect(JSON.stringify(fl.rooms)).toBe(before)
      }
    }
  })

  it('縦積みラベルの部屋: ラベル領域は縦長で、家具はそこを避ける', () => {
    const narrow = { type: 'study', name: '書斎', x: 0, y: 0, w: 2.6, h: 6, area: 16, target: 16, minArea: 8 } as const
    expect(isVerticalLabel(narrow)).toBe(true)
    const lab = labelRect(narrow, false)
    expect(lab.h).toBeGreaterThan(lab.w) // 横書き前提の見積もり（幅広・低い）ではない
    expect(lab.x).toBeGreaterThanOrEqual(0)
    expect(lab.x + lab.w).toBeLessThanOrEqual(narrow.w)
    expect(lab.y + lab.h).toBeLessThanOrEqual(narrow.h + 0.5)
    for (const it of furnish([narrow], [], { kitchenFace: false })) expect(overlaps(it, lab), it.kind).toBe(false)
    // 横書きの部屋は従来どおり横長
    const wide = { ...narrow, w: 8, h: 6 }
    expect(isVerticalLabel(wide)).toBe(false)
    expect(labelRect(wide, false).w).toBeGreaterThan(labelRect(wide, false).h)
  })

  it('置けない小部屋では置かない', () => {
    const tiny = { type: 'master', name: '主寝室', x: 0, y: 0, w: 3, h: 3, area: 9, target: 62, minArea: 40 } as const
    expect(furnish([tiny], [], { kitchenFace: false })).toEqual([])
  })
})
