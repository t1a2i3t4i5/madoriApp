/// <reference types="node" />
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, expect, it } from 'vitest'
import { generatePlans } from './generate'
import { feasibility } from './program'
import { planName, planTags } from './describe'
import { BOUNDARY, CONDITIONS, INFEASIBLE, SEEDS } from './testing'
import type { PlanConfig, ScoredPlan } from './types'

/**
 * legacy/index.html（移植元）の <script> から、DOM 非依存の core 部分（view/ の手前まで）を
 * 取り出して Node の vm で実行し、新実装と出力JSONが一致することを確認するゴールデンテスト。
 */
interface LegacyCore {
  generatePlans: (cfg: PlanConfig, seed: number) => ScoredPlan[]
  feasibility: (cfg: PlanConfig) => unknown
  planName: (cfg: PlanConfig, plan: ScoredPlan) => string
  planTags: (cfg: PlanConfig, plan: ScoredPlan) => string[]
}

function loadLegacyCore(): LegacyCore {
  const html = readFileSync(new URL('../../legacy/index.html', import.meta.url), 'utf8')
  const start = html.indexOf('<script>')
  const viewMarker = html.indexOf('view/ — SVG描画')
  if (start < 0 || viewMarker < 0) throw new Error('legacy/index.html の構造が想定と違います（script / view マーカーが見つからない）')
  const end = html.lastIndexOf('/*', viewMarker)
  const src = html.slice(start + '<script>'.length, end)
  // DOM 非依存であることの確認（混入したらここで気づく）
  expect(src).not.toMatch(/\b(document|window|location|localStorage)\b/)
  const ctx = vm.createContext({})
  const exported = vm.runInContext(`${src}\n;({ generatePlans, feasibility, planName, planTags })`, ctx, { filename: 'legacy-core.js' })
  return exported as LegacyCore
}

/** キー順の違いで落ちないよう、キーをソートして正規化したJSONにする */
function canon(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) => {
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      return Object.fromEntries(Object.entries(val).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
    }
    return val
  })
}

const legacy = loadLegacyCore()
const copy = (cfg: PlanConfig): PlanConfig => ({ ...cfg, feats: [...cfg.feats] })

describe('legacy とのゴールデン比較', () => {
  for (const { name, cfg } of [...CONDITIONS, ...BOUNDARY]) {
    it(`${name}: generatePlans が複数seedで legacy と一致`, () => {
      for (const seed of SEEDS) {
        const mine = generatePlans(copy(cfg), seed)
        const theirs = legacy.generatePlans(copy(cfg), seed)
        expect(canon(mine), `seed=${seed}`).toBe(canon(theirs))
      }
    })

    it(`${name}: planName / planTags が legacy と一致`, () => {
      for (const seed of SEEDS.slice(0, 2)) {
        for (const p of generatePlans(copy(cfg), seed)) {
          expect(planName(cfg, p)).toBe(legacy.planName(copy(cfg), p))
          expect(planTags(cfg, p)).toEqual(legacy.planTags(copy(cfg), p))
        }
      }
    })
  }

  it('比較が空振りしていない（全条件で少なくとも1つは案が出る）', () => {
    const nonEmpty = CONDITIONS.filter(({ cfg }) => SEEDS.some((s) => generatePlans(copy(cfg), s).length > 0))
    expect(nonEmpty).toHaveLength(CONDITIONS.length)
  })

  it('feasibility が legacy と一致（可・不可の両方）', () => {
    for (const { name, cfg } of [...CONDITIONS, ...BOUNDARY, ...INFEASIBLE]) {
      expect(canon(feasibility(copy(cfg))), name).toBe(canon(legacy.feasibility(copy(cfg))))
    }
    // 不可条件が本当に不可であること（比較の空振り防止）
    for (const { name, cfg } of INFEASIBLE) expect(feasibility(cfg).ok, name).toBe(false)
  })

  it('feasibility: 面積・個室数・こだわりを広く振っても legacy と一致', () => {
    for (const floors of [1, 2] as const) {
      for (const area of [20, 23, 26, 30, 36, 40]) {
        for (const rooms of [2, 3, 4, 5]) {
          for (const feats of [[], ['doma'], ['void', 'study'], ['washitsu', 'laundry', 'pantry', 'wic']] as PlanConfig['feats'][]) {
            const cfg: PlanConfig = { area, floors, rooms, parking: 1, garden: 1, feats }
            expect(canon(feasibility(copy(cfg))), JSON.stringify(cfg)).toBe(canon(legacy.feasibility(copy(cfg))))
          }
        }
      }
    }
  })
})
