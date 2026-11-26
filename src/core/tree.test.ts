import { describe, expect, it } from 'vitest'
import { CONDITIONS, PARTIAL_CONDITIONS } from './testing'
import { enumeratePlans } from './enumerate'
import { CANONICAL, floorRect } from './types'
import { buildTree, isBandTemplate, layoutFloorTree, treeDepth, treeRooms, type TreeNode } from './tree'
import { layoutFloor } from './slicing'
import { applyVariant, bandsFor, effectiveHN, withNorthH } from './archetypes'
import type { LayoutFloorOpts } from './slicing'
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

  it('面積0の部屋を含むと null（黙って落とさない）', () => {
    expect(buildTree([r(0, 0, 4, 4), r(4, 0, 0, 4)], { x: 0, y: 0, W: 4, H: 4 })).toBeNull()
  })

  it('木はイミュータブル（凍結されている）で、入力の部屋を書き換えない', () => {
    const rooms = [r(0, 0, 4, 4), r(4, 0, 4, 4)]
    const snap = JSON.stringify(rooms)
    const t = buildTree(rooms, { x: 0, y: 0, W: 8, H: 4 }) as TreeNode
    expect(JSON.stringify(rooms)).toBe(snap)
    expect(Object.isFrozen(t)).toBe(true)
    if (t.kind === 'split') {
      expect(Object.isFrozen(t.rect)).toBe(true)
      expect(Object.isFrozen(t.children)).toBe(true)
      for (const c of t.children) {
        expect(Object.isFrozen(c)).toBe(true)
        expect(Object.isFrozen(c.rect)).toBe(true)
      }
      expect(() => {
        ;(t.children as TreeNode[]).push(t)
      }).toThrow()
    }
  })
})

describe('layoutFloorTree', () => {
  it('buildPlan が実際に使う引数（北帯の高さの固定・closet・2F・align）で layoutFloor と同一の結果になり、帯の形の木で表せる', () => {
    let calls = 0
    let withAlign = 0
    let hard = 0
    let f2 = 0
    for (const { cfg } of [...CONDITIONS.slice(0, 6), ...PARTIAL_CONDITIONS.slice(0, 3)]) {
      const hasVoid = cfg.feats.indexOf('void') >= 0
      for (const plan of enumeratePlans(cfg).slice(0, 40)) {
        const v = plan.variant ?? CANONICAL
        const hN = effectiveHN(cfg, v)
        const closet = v.closet === 'hard' ? 'hard' : 'soft'
        const check = (W: number, H: number, bands: ReturnType<typeof bandsFor>, opts: LayoutFloorOpts) => {
          if (!bands) return null
          const bs = withNorthH(bands, hN)
          const a = layoutFloor(W, H, bs, opts)
          const b = layoutFloorTree(W, H, bs, opts)
          expect(JSON.stringify(b && { rooms: b.rooms, heights: b.heights })).toBe(JSON.stringify(a))
          if (!a) return null
          calls++
          expect(b?.tree).not.toBeNull()
          if (!b?.tree) return null
          expect(isBandTemplate(b.tree)).toBe(true)
          expect(treeRooms(b.tree).map(key).sort()).toEqual(a.rooms.map(key).sort())
          return a
        }
        if (closet === 'hard') hard++
        const b1 = bandsFor(cfg, plan.arch, 1, plan.W)
        const l1 = check(plan.W, plan.H, b1 && applyVariant(b1, 1, v, hasVoid), { closet })
        if (cfg.floors !== 2 || !l1) continue
        // 2F: buildPlan と同じ板（部分二階は fp）・吹抜の capH・align（1F の壁の x。寄せない割り付けの帯の y 範囲ごと）
        f2++
        const fp = plan.floors[1]?.fp
        const W2 = fp?.W ?? plan.W
        const H2 = fp?.H ?? plan.H
        const ox = fp?.x ?? 0
        const b2 = bandsFor(cfg, plan.arch, 2, W2)
        const f2bands = b2 && applyVariant(b2, 2, v, hasVoid)
        const southH = l1.heights[2]
        if (!f2bands || southH === undefined) continue
        const f2opts: LayoutFloorOpts = { ...(hasVoid ? { capH: { 2: southH - (plan.H - H2) } } : {}), closet }
        const base = check(W2, H2, f2bands, f2opts)
        if (!base) continue
        const align: Record<number, number[]> = {}
        let by = 0
        base.heights.forEach((bh, bi) => {
          if (bi === 0 || bi === 2) {
            const xs = new Set<number>()
            for (const q of l1.rooms) {
              if (q.y >= by + bh || q.y + q.h <= by) continue
              for (const x of [q.x - ox, q.x + q.w - ox]) if (x > 0 && x < W2) xs.add(x)
            }
            align[bi] = [...xs].sort((a, c) => a - c)
          }
          by += bh
        })
        if (check(W2, H2, f2bands, { ...f2opts, align, alignD: 1 })) withAlign++
      }
    }
    // 検査が空振りしていない（2F・align・強モードを実際に通っている）
    expect(calls).toBeGreaterThan(100)
    expect(f2).toBeGreaterThan(20)
    expect(withAlign).toBeGreaterThan(20)
    expect(hard).toBeGreaterThan(0)
  })
})

describe('生成済みの案の各階が木で表せる', () => {
  it('総二階・平屋（CONDITIONS 先頭6）と部分二階（PARTIAL_CONDITIONS 全件）の候補プールの案の全階で、木が作れて部屋が一致する', () => {
    // ホール帯の吸収・収納化の後は帯の形でなくなりうるので、形（isBandTemplate）は見ない
    let floors = 0
    let offset = 0
    for (const { cfg } of [...CONDITIONS.slice(0, 6), ...PARTIAL_CONDITIONS]) {
      for (const plan of enumeratePlans(cfg)) {
        plan.floors.forEach((f, i) => {
          const rect = floorRect(plan, i)
          const t = buildTree(f.rooms, rect)
          expect(t).not.toBeNull()
          if (!t) return
          floors++
          if (rect.x !== 0) offset++
          expect(treeRooms(t).map(key).sort()).toEqual(f.rooms.map(key).sort())
        })
      }
    }
    expect(floors).toBeGreaterThan(100)
    expect(offset).toBeGreaterThan(0)
  })
})
