import { describe, expect, it } from 'vitest'
import { candidatePool, generatePlans } from './generate'
import { computeDoors, doorOK, openingPassage, sharedEdge } from './derive'
import { stairGeom, stairMouthCovered, hallCoversMouth } from './stair'
import { trimHall } from './hall'
import { guardViolations, HALL_RULES } from './circulation'
import { validateRooms, validatePlan } from './validate'
import { planKey } from './enumerate'
import { CONDITIONS, PARTIAL_CONDITIONS, SEEDS, defined, guardViolationsIndependent, hallViolations, independentViolations, stairDoorViolations, stairViolations } from './testing'
import { ROOM } from './rooms'
import type { Plan, PlanConfig, Room, RoomType } from './types'

/** 合成用の部屋 */
function R(type: RoomType, x: number, y: number, w: number, h: number, name?: string): Room {
  const d = ROOM[type]
  return { type, name: name ?? d.name, x, y, w, h, area: w * h, target: d.target, minArea: d.minArea }
}

/** 16×14: 北帯6（主寝室・トイレ・階段）、ホール帯2、南帯6（LDK・キッチン）。主寝室は西端、LDK は南西 */
function floor16(): Room[] {
  return [
    R('master', 0, 0, 8, 6), R('wc', 8, 0, 4, 6), R('stair', 12, 0, 4, 6),
    R('hall', 0, 6, 16, 2),
    R('ldk', 0, 8, 12, 6), R('kitchen', 12, 8, 4, 6),
  ]
}
const plate16 = { x: 0, y: 0, W: 16, H: 14 }

describe('階段の開口（R-DOOR-04・R-DOOR-13・R-DOOR-14）', () => {
  it('階段の相手がホール・玄関・土間・LDK のときだけ doorOK（両順序）。それ以外は不可', () => {
    const stair = R('stair', 0, 0, 4, 5)
    for (const t of ['hall', 'entry', 'doma', 'ldk'] as RoomType[]) {
      expect(doorOK(stair, R(t, 4, 0, 4, 5)), t).toBe(true)
      expect(doorOK(R(t, 4, 0, 4, 5), stair), t).toBe(true)
    }
    for (const t of ['master', 'bed', 'study', 'washitsu', 'wash', 'wc', 'bath', 'laundry', 'store', 'wic', 'pantry', 'kitchen', 'void'] as RoomType[]) {
      expect(doorOK(stair, R(t, 4, 0, 4, 5)), t).toBe(false)
      expect(doorOK(R(t, 4, 0, 4, 5), stair), t).toBe(false)
    }
  })
  it('computeDoors: 階段に付くのは kind open だけ。弧も葉もなく、通行点は共有区間の中点', () => {
    const doors = computeDoors(floor16())
    const st = doors.filter((d) => d.a.type === 'stair' || d.b.type === 'stair')
    expect(st).toHaveLength(1) // ホールだけ（トイレとは壁）
    const d = defined(st[0])
    expect(d.kind).toBe('open')
    expect(d.swing.rect).toEqual({ x: 14, y: 6, w: 0, h: 0 })
    expect(d.swing.center).toEqual({ x: 14, y: 6 })
    expect(d.swing.r).toBe(0)
    expect(stairDoorViolations({ W: 16, H: 14, floors: [{ label: '2F', rooms: floor16() }] } as Plan, computeDoors)).toEqual([])
  })
  it('開口の前の通路（2×2）は階段と反対側の部屋の中に取る。開き戸には無い', () => {
    const doors = computeDoors(floor16())
    const open = defined(doors.find((d) => d.kind === 'open'))
    expect(openingPassage(open)).toEqual({ x: 13, y: 6, w: 2, h: 2 })
    const swing = defined(doors.find((d) => d.kind === undefined))
    expect(openingPassage(swing)).toBeNull()
  })
  it('階段の隣に個室・収納・水回りがあっても扉は付かない（GEN_VERSION 5 では付いた）', () => {
    const rooms = [R('stair', 0, 0, 4, 5), R('bed', 4, 0, 6, 5), R('wash', 10, 0, 4, 5), R('hall', 0, 5, 14, 2)]
    const adj = computeDoors(rooms).filter((d) => d.a.type === 'stair' || d.b.type === 'stair')
    expect(adj.map((d) => (d.a.type === 'stair' ? d.b.type : d.a.type))).toEqual(['hall'])
  })
})

describe('階段の折り返しの形（stairGeom）', () => {
  const plan = (h: number, x = 12, f2h = h): Pick<Plan, 'W' | 'floors'> => ({
    W: 16,
    floors: [
      { label: '1F', rooms: [R('stair', x, 0, 4, h), R('hall', 0, h, 16, 2)] },
      { label: '2F', rooms: [R('stair', x, 0, 4, f2h), R('hall', 0, f2h, 16, 2)] },
    ],
  })
  it('4×5 は踊り場 4×2 と踏み段 2×3 が2列で、ぴったり埋まる。4×6 は口の側に 4×1 の溜まりが付く', () => {
    const g5 = defined(stairGeom(plan(5), 0))
    expect(g5.landing).toEqual({ x: 12, y: 0, w: 4, h: 2 })
    expect(g5.apron).toBeNull()
    const g6 = defined(stairGeom(plan(6), 1))
    expect(g6.apron).toEqual({ x: 12, y: 5, w: 4, h: 1 })
    for (const g of [g5, g6]) {
      const area = g.landing.w * g.landing.h + g.flights.reduce((s, f) => s + f.w * f.h, 0) + (g.apron ? g.apron.w * g.apron.h : 0)
      expect(area).toBe(4 * (g === g5 ? 5 : 6))
      expect(g.kind).toBe('U')
      expect(g.mouth).toBe('S')
    }
  })
  it('上りの列は建物の中央に近い側（東端の階段は西列、西端の階段は東列）', () => {
    expect(defined(stairGeom(plan(5, 12), 0)).upCol).toBe('W')
    expect(defined(stairGeom(plan(5, 0), 0)).upCol).toBe('E')
    expect(defined(stairGeom(plan(5, 12), 0)).flights[0].x).toBe(12)
    expect(defined(stairGeom(plan(5, 0), 0)).flights[0].x).toBe(2)
  })
  it('成立しない矩形（4×4・上下の食い違い・平屋・口が覆われない）は null', () => {
    expect(stairGeom(plan(4), 0)).toBeNull()
    expect(stairGeom(plan(5, 12, 6), 0)).toBeNull()
    expect(stairGeom({ W: 16, floors: [plan(5).floors[0] as Plan['floors'][number]] }, 0)).toBeNull()
    const blocked = plan(5)
    blocked.floors[0]?.rooms.splice(1, 1, R('hall', 0, 5, 6, 2)) // ホールが口の辺に届かない
    expect(stairGeom(blocked, 0)).toBeNull()
  })
})

describe('階段の口の辺の全幅', () => {
  it('stairMouthCovered: ホール・玄関・土間・LDK の和が全幅を覆えば真。個室や隙間は覆わない', () => {
    const stair = R('stair', 12, 0, 4, 5)
    expect(stairMouthCovered([stair, R('hall', 0, 5, 16, 2)])).toBe(true)
    expect(stairMouthCovered([stair, R('hall', 0, 5, 14, 2), R('entry', 14, 5, 2, 4)])).toBe(true)
    expect(stairMouthCovered([stair, R('hall', 0, 5, 14, 2), R('bed', 14, 5, 2, 4)])).toBe(false)
    expect(stairMouthCovered([stair, R('hall', 0, 5, 13, 2)])).toBe(false) // 共有 1 セルでは開口にならない
    expect(stairMouthCovered([R('hall', 0, 5, 14, 2)])).toBe(true) // 階段がなければ真
  })
  it('hallCoversMouth は玄関に覆われていてもホールが覆わなければ偽（厳しい版）', () => {
    const stair = R('stair', 12, 0, 4, 5)
    expect(hallCoversMouth([stair, R('hall', 0, 5, 14, 2), R('entry', 14, 5, 2, 4)])).toBe(false)
    expect(hallCoversMouth([stair, R('hall', 4, 5, 12, 2)])).toBe(true)
  })
})

describe('ホール帯の端の吸収（trimHall）', () => {
  it('合成: 西端を主寝室が高さ +2 で吸収し、ホールは 8 になる。階段の口・トイレの入口は保たれる（LDK が吸収すると主寝室・トイレの入口を失うので採らない）', () => {
    const base = floor16()
    expect(validateRooms(base, plate16)).toBe(true)
    const out = trimHall(base, plate16)
    const master = defined(out.find((r) => r.type === 'master'))
    expect([master.x, master.y, master.w, master.h, master.area]).toEqual([0, 0, 8, 8, 64])
    const hall = defined(out.find((r) => r.type === 'hall'))
    expect([hall.x, hall.w, hall.area]).toEqual([8, 8, 16])
    expect(validateRooms(out, plate16)).toBe(true)
    // 入力は書き換えない
    expect(base.find((r) => r.type === 'master')?.h).toBe(6)
  })
  it('合成: 水回り（トイレ）・階段は吸収しない', () => {
    const rooms = [
      R('wc', 0, 0, 4, 6), R('master', 4, 0, 8, 6), R('stair', 12, 0, 4, 6), R('hall', 0, 6, 16, 2),
      R('ldk', 0, 8, 12, 6), R('kitchen', 12, 8, 4, 6),
    ]
    const out = trimHall(rooms, plate16)
    expect(out.find((r) => r.type === 'wc')?.h).toBe(6)
    expect(out.find((r) => r.type === 'stair')?.h).toBe(6)
  })
  it('合成: 吸収の結果、動線のガード（個室の入口）を壊す候補は採らない', () => {
    // 西端の北は主寝室、南は洋室。どちらが吸収しても、もう一方がホールに面さなくなり（入口を失い）個室の入口のガードに触れるので、どちらも採らない
    const rooms = [
      R('master', 0, 0, 8, 6), R('wc', 8, 0, 4, 6), R('stair', 12, 0, 4, 6), R('hall', 0, 6, 16, 2),
      R('bed', 0, 8, 8, 6, '洋室1'), R('bed', 8, 8, 8, 6, '洋室2'),
    ]
    expect(trimHall(rooms, plate16).find((r) => r.type === 'hall')?.w).toBe(16)
    const out = trimHall(rooms, plate16)
    expect(guardViolations(out)).toEqual([])
    expect(validateRooms(out, plate16)).toBe(true)
  })
  it('残るホールは HALL_RULES.minHallLen 以上', () => {
    const out = trimHall(floor16(), plate16)
    expect(defined(out.find((r) => r.type === 'hall')).w).toBeGreaterThanOrEqual(HALL_RULES.minHallLen)
  })
})

describe('validateRooms の起点（玄関+土間の結合セル）', () => {
  it('平屋で玄関+土間が結合セル（type doma）でも、起点として到達可能性を判定できる（GEN_VERSION 5 までは全棄却）', () => {
    // 結合セル doma（玄関を兼ねる）・LDK・ホール・個室。階段も玄関もないので、以前は start が undefined で false だった
    const rooms = [
      R('master', 0, 0, 8, 6), R('bed', 8, 0, 8, 6, '洋室1'), R('hall', 0, 6, 16, 2),
      R('doma', 0, 8, 4, 6, '玄関・土間'), R('ldk', 4, 8, 12, 6),
    ]
    expect(validateRooms(rooms, plate16)).toBe(true)
    expect(sharedEdge(defined(rooms[3]), defined(rooms[2]))).not.toBeNull()
  })
  it('結合セルの平屋の案が候補プールに入る', () => {
    const cfg: PlanConfig = { parking: 2, garden: 1, area: 30, floors: 1, rooms: 3, feats: ['doma', 'washitsu'] }
    const merged = candidatePool(cfg).filter((p) => p.floors[0]?.rooms.some((r) => r.type === 'doma') && !p.floors[0]?.rooms.some((r) => r.type === 'entry'))
    expect(merged.length).toBeGreaterThan(0)
    for (const p of merged) expect(validatePlan(p)).toBe(true)
  })
})

/** 全プールの案を検査する条件（人気6条件と、吹抜・土間・平屋の代表） */
const POOL_CONDITIONS = [
  ...CONDITIONS.slice(0, 3), ...PARTIAL_CONDITIONS.slice(0, 3),
  ...CONDITIONS.filter((c) => /吹抜|土間/.test(c.name)), ...PARTIAL_CONDITIONS.slice(3),
]

describe('v6 の不変条件（全プールの全案。独立実装で検査）', () => {
  for (const { name, cfg } of POOL_CONDITIONS) {
    it(`${name}: 階段の矩形・口・扉・ガード・ホール・独立検証が全案で満たされる`, () => {
      const pool = candidatePool(cfg)
      expect(pool.length, '空振り防止').toBeGreaterThan(0)
      for (const p of pool) {
        const k = planKey(p)
        expect(stairViolations(p), k).toEqual([])
        expect(stairDoorViolations(p, computeDoors), k).toEqual([])
        expect(guardViolationsIndependent(p, computeDoors, HALL_RULES.strictBed), k).toEqual([])
        expect(hallViolations(p), k).toEqual([])
        expect(independentViolations(p), k).toEqual([])
        if (cfg.floors === 2) {
          expect(p.variant?.hN, k).toBeDefined()
          expect(k).toMatch(/-h[56]/)
          for (const f of [0, 1]) expect(stairGeom(p, f), `${k} ${f}F`).not.toBeNull()
        } else {
          expect(k).not.toMatch(/-h/)
        }
      }
    })
  }
  it('人気6条件: 全 seed で3案', () => {
    for (const { cfg } of POOL_CONDITIONS.slice(0, 6)) for (const seed of SEEDS) expect(generatePlans(cfg, seed)).toHaveLength(3)
  })
})
