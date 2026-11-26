import { describe, expect, it } from 'vitest'
import { CONDITIONS } from './testing'
import { enumeratePlans } from './enumerate'
import { floorRect } from './types'
import { buildTree, isBandTemplate, layoutFloorTree, treeDepth, treeRooms, type TreeNode } from './tree'
import { layoutFloor } from './slicing'
import { bandsFor } from './archetypes'
import type { Room } from './types'

const r = (x: number, y: number, w: number, h: number): Room => ({ type: 'store', name: 's', x, y, w, h, area: w * h, target: 0, minArea: 0 })
const key = (q: Room) => `${q.type}|${q.x}|${q.y}|${q.w}|${q.h}`

describe('buildTree', () => {
  it('帯・列・列内の積みを H/V の入れ子で表す', () => {
    const rooms = [r(0, 0, 4, 3), r(4, 0, 4, 3), r(0, 3, 8, 2), r(0, 5, 3, 3), r(3, 5, 5, 1), r(3, 6, 5, 2)]
    const t = buildTree(rooms, { x: 0, y: 0, W: 8, H: 8 })
    expect(t?.kind).toBe('split')
    expect(t && t.kind === 'split' && t.dir).toBe('H')
    expect(t && treeRooms(t).map(key).sort()).toEqual(rooms.map(key).sort())
    expect(t && isBandTemplate(t)).toBe(true)
    expect(t && treeDepth(t)).toBe(3)
  })

  it('敷き詰めていない・重なる・風車型（ギロチンで割れない）は null', () => {
    expect(buildTree([r(0, 0, 4, 4)], { x: 0, y: 0, W: 8, H: 4 })).toBeNull()
    expect(buildTree([r(0, 0, 4, 4), r(2, 0, 4, 4)], { x: 0, y: 0, W: 6, H: 4 })).toBeNull()
    const pinwheel = [r(0, 0, 2, 1), r(2, 0, 1, 2), r(1, 2, 2, 1), r(0, 1, 1, 2), r(1, 1, 1, 1)]
    expect(buildTree(pinwheel, { x: 0, y: 0, W: 3, H: 3 })).toBeNull()
  })

  it('木はイミュータブル（凍結されている）で、入力の部屋を書き換えない', () => {
    const rooms = [r(0, 0, 4, 4), r(4, 0, 4, 4)]
    const snap = JSON.stringify(rooms)
    const t = buildTree(rooms, { x: 0, y: 0, W: 8, H: 4 }) as TreeNode
    expect(JSON.stringify(rooms)).toBe(snap)
    expect(Object.isFrozen(t)).toBe(true)
    if (t.kind === 'split') {
      expect(Object.isFrozen(t.children)).toBe(true)
      expect(() => {
        ;(t.children as TreeNode[]).push(t)
      }).toThrow()
    }
  })
})

describe('layoutFloorTree', () => {
  it('layoutFloor と rooms・heights が同一で、木が同じ部屋を表す', () => {
    let n = 0
    for (const { cfg } of CONDITIONS.slice(0, 3)) {
      for (const plan of enumeratePlans(cfg).slice(0, 10)) {
        const bands = bandsFor(cfg, plan.arch, 0, plan.W)
        if (!bands) continue
        const a = layoutFloor(plan.W, plan.H, bands, { closet: 'soft' })
        const b = layoutFloorTree(plan.W, plan.H, bands, { closet: 'soft' })
        expect(JSON.stringify(b && { rooms: b.rooms, heights: b.heights })).toBe(JSON.stringify(a))
        if (b?.tree) {
          n++
          expect(isBandTemplate(b.tree)).toBe(true)
          expect(treeRooms(b.tree).map(key).sort()).toEqual(b.rooms.map(key).sort())
        }
      }
    }
    expect(n).toBeGreaterThan(0)
  })
})

describe('生成済みの案の各階が木で表せる', () => {
  it('候補プールの案・全階で、木が作れて（ホール帯の吸収・収納化の後は帯の形でなくなりうる）、部屋が一致する', () => {
    let floors = 0
    for (const { cfg } of CONDITIONS.slice(0, 6)) {
      for (const plan of enumeratePlans(cfg).slice(0, 60)) {
        plan.floors.forEach((f, i) => {
          const t = buildTree(f.rooms, floorRect(plan, i))
          expect(t).not.toBeNull()
          if (!t) return
          floors++
          expect(treeRooms(t).map(key).sort()).toEqual(f.rooms.map(key).sort())
        })
      }
    }
    expect(floors).toBeGreaterThan(100)
  })
})
