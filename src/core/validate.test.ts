import { describe, expect, it } from 'vitest'
import type { ArchId, Plan, Room, RoomType, Variant } from './types'
import { wetViolations, validatePlan } from './validate'
import { buildPlan } from './archetypes'
import { footprintList } from './slicing'
import { CONDITIONS, defined } from './testing'

function room(type: RoomType, x: number, y: number, w = 4, h = 4): Room {
  return { type, name: type, x, y, w, h, area: w * h, target: w * h, minArea: 8 }
}

describe('wetViolations（水回りの隣接）', () => {
  it('浴室・ランドリー・トイレが洗面や水回りに接していれば違反なし', () => {
    expect(wetViolations([room('laundry', 0, 0), room('wash', 4, 0), room('bath', 8, 0), room('wc', 4, 4)])).toEqual([])
  })
  it('浴室が洗面に接していなければ違反', () => {
    expect(wetViolations([room('wash', 0, 0), room('bath', 8, 0)])).toHaveLength(1)
  })
  it('ランドリーが洗面に接していなければ違反', () => {
    expect(wetViolations([room('laundry', 0, 0), room('wash', 8, 0)])).toHaveLength(1)
  })
  it('トイレは水回りのどれにも接していなければ違反。水回りがない階では対象外', () => {
    expect(wetViolations([room('wash', 0, 0), room('wc', 12, 0)])).toHaveLength(1)
    expect(wetViolations([room('wc', 12, 0), room('hall', 0, 0)])).toEqual([])
  })
  it('辺の共有が1セルだけ（角・短い辺）では接していない扱い', () => {
    expect(wetViolations([room('wash', 0, 0), room('bath', 4, 3)])).toHaveLength(1)
  })
  it('キッチン・パントリーは対象外', () => {
    expect(wetViolations([room('kitchen', 0, 0), room('pantry', 20, 0)])).toEqual([])
  })
})

/** generate.ts の variantsFor と同じ列挙（非公開のためテスト側で再現し、全変種を網羅する） */
function allVariants(floors: number): Variant[] {
  const out: Variant[] = []
  const ends: Variant['stairEnd'][] = floors === 1 ? ['E'] : ['E', 'W']
  const shifts: Variant['bedShift'][] = floors === 1 ? [0] : [0, 1, 2, -1]
  const revCount = floors === 1 ? 4 : 16
  for (const stairEnd of ends) {
    for (let m = 0; m < revCount; m++) {
      const rev: Variant['rev'] =
        floors === 1
          ? [(m & 2) !== 0, (m & 1) !== 0, false, false]
          : [(m & 8) !== 0, (m & 4) !== 0, (m & 2) !== 0, (m & 1) !== 0]
      for (const bedShift of shifts) out.push({ stairEnd, rev, bedShift })
    }
  }
  return out
}

describe('制約C: 水回りの隣接は buildPlan の出力で棄却0件', () => {
  const NAMES = ['30坪/2階/個室3', '38坪/2階/全部のせ', '34坪/平屋/ランドリー+書斎']
  for (const name of NAMES) {
    it(`${name}: buildPlan の全出力で wetViolations が空`, () => {
      const cfg = defined(CONDITIONS.find((c) => c.name === name)).cfg
      const archs: ArchId[] = cfg.floors === 1 ? [0, 1] : [0, 1, 2]
      const variants = allVariants(cfg.floors)
      let built = 0
      for (const arch of archs) {
        for (const fp of footprintList((cfg.area * 16) / cfg.floors, 10)) {
          for (const variant of variants) {
            const plan = buildPlan(cfg, arch, fp, variant)
            if (!plan) continue
            built++
            for (const fl of plan.floors) expect(wetViolations(fl.rooms)).toEqual([])
          }
        }
      }
      expect(built).toBeGreaterThan(0)
    })
  }

  it('違反のある Plan は validatePlan が false を返す', () => {
    const cfg = defined(CONDITIONS.find((c) => c.name === '34坪/平屋/ランドリー+書斎')).cfg
    const fp = defined(footprintList((cfg.area * 16) / cfg.floors, 10)[0])
    let plan: Plan | null = null
    for (const v of allVariants(cfg.floors)) {
      const p = buildPlan(cfg, 0, fp, v)
      if (p && validatePlan(p)) { plan = p; break }
    }
    const ok = defined(plan, '検証を通る案')
    expect(validatePlan(ok)).toBe(true)
    // 洗面を取り除く → 浴室・ランドリーが洗面に接していない違反になる
    const broken: Plan = {
      ...ok,
      floors: ok.floors.map((fl) => ({ ...fl, rooms: fl.rooms.filter((r) => r.type !== 'wash') })),
    }
    expect(broken.floors.some((fl) => wetViolations(fl.rooms).length > 0)).toBe(true)
    expect(validatePlan(broken)).toBe(false)
  })
})
