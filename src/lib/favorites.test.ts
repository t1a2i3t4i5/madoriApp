import { describe, expect, it } from 'vitest'
import { enumeratePlans, planKey } from '../core/enumerate'
import { GEN_VERSION } from '../core/generate'
import { CONDITIONS } from '../core/testing'
import {
  FAVORITES_STORAGE_KEY, MAX_FAVORITES, addFavorite, isFavorited, isOldVersion, loadFavorites, removeFavorite, saveFavorites,
  type Favorite, type KeyValueStorage,
} from './favorites'
import { planMetrics } from './metrics'

function memory(initial?: string): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>()
  if (initial !== undefined) data.set(FAVORITES_STORAGE_KEY, initial)
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

const { cfg } = CONDITIONS[0]!
const plans = enumeratePlans(cfg)
const p0 = plans[0]!
const p1 = plans[1]!

function must(r: ReturnType<typeof addFavorite>): Favorite[] {
  if (!r.ok) throw new Error('add failed')
  return r.list
}

describe('お気に入り', () => {
  it('追加すると key / cfg / v / plan / savedAt が入り、先頭に積まれる', () => {
    const a = must(addFavorite([], cfg, p0, 100))
    const b = must(addFavorite(a, cfg, p1, 200))
    expect(b.map((f) => f.key)).toEqual([planKey(p1), planKey(p0)])
    expect(b[1]).toMatchObject({ key: planKey(p0), cfg, v: GEN_VERSION, savedAt: 100 })
    expect(b[1]?.plan).toEqual(p0)
    expect(isFavorited(b, cfg, planKey(p0))).toBe(true)
  })

  it('同じ（条件,key）の重複は追加されない。条件が違えば別物', () => {
    const a = must(addFavorite([], cfg, p0, 1))
    expect(must(addFavorite(a, { ...cfg, feats: [...cfg.feats].reverse() }, p0, 2))).toHaveLength(1)
    expect(must(addFavorite(a, { ...cfg, rooms: cfg.rooms + 1 }, p0, 3))).toHaveLength(2)
  })

  it('削除できる。存在しないものの削除は何も起きない', () => {
    const a = must(addFavorite(must(addFavorite([], cfg, p0, 1)), cfg, p1, 2))
    expect(removeFavorite(a, cfg, planKey(p0)).map((f) => f.key)).toEqual([planKey(p1)])
    expect(removeFavorite(a, cfg, '0-99x99')).toHaveLength(2)
  })

  it(`上限${MAX_FAVORITES}件: 超える追加は拒否し、既存を消さない`, () => {
    let list: Favorite[] = []
    for (let i = 0; i < MAX_FAVORITES; i++) list = must(addFavorite(list, { ...cfg, area: 20 + (i % 21), rooms: 2 + Math.floor(i / 21) }, p0, i))
    expect(list).toHaveLength(MAX_FAVORITES)
    const r = addFavorite(list, { ...cfg, garden: 0, parking: 0, area: 21 }, p0, 999)
    expect(r).toEqual({ ok: false, reason: 'full' })
    // 既に入っているものを「追加」しても上限エラーにはならない
    expect(addFavorite(list, list[0]!.cfg, list[0]!.plan, 1000).ok).toBe(true)
  })

  it('保存→読込で往復する', () => {
    const st = memory()
    const list = must(addFavorite(must(addFavorite([], cfg, p0, 1)), cfg, p1, 2))
    expect(saveFavorites(st, list)).toBe(true)
    expect(loadFavorites(st)).toEqual(list)
  })

  it('壊れたデータは捨てて空として扱う', () => {
    for (const bad of ['{broken', 'null', '123', '{"a":1}', '"x"', '[1,2,3]', '[null]']) {
      expect(loadFavorites(memory(bad)), bad).toEqual([])
    }
    expect(loadFavorites(memory())).toEqual([])
  })

  it('壊れた要素だけ捨てて、正常な要素は残す', () => {
    const good = must(addFavorite([], cfg, p0, 1))[0]!
    const brokenPlan = { ...good, plan: { ...good.plan, floors: [{ label: '1F', rooms: [{ type: 'ldk' }] }] } }
    const badKey = { ...good, key: 'zzz' }
    const mismatch = { ...good, key: planKey(p1) }
    const badCfg = { ...good, cfg: { ...good.cfg, feats: ['nope'] } }
    const st = memory(JSON.stringify([brokenPlan, good, badKey, mismatch, badCfg, null]))
    expect(loadFavorites(st)).toEqual([good])
  })

  it('保存データに重複・上限超えがあっても読込時に整える', () => {
    const good = must(addFavorite([], cfg, p0, 1))[0]!
    expect(loadFavorites(memory(JSON.stringify([good, good, good])))).toHaveLength(1)
  })

  it('ストレージが例外を投げても落ちない', () => {
    const throwing: KeyValueStorage = {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('quota') },
    }
    expect(loadFavorites(throwing)).toEqual([])
    expect(saveFavorites(throwing, [])).toBe(false)
  })

  it('v が GEN_VERSION と違えば旧バージョン', () => {
    const f = must(addFavorite([], cfg, p0, 1))[0]!
    expect(isOldVersion(f)).toBe(false)
    expect(isOldVersion({ ...f, v: GEN_VERSION - 1 })).toBe(true)
  })
})

describe('planMetrics', () => {
  it('LDK畳数・個室平均畳数・廊下率', () => {
    const m = planMetrics(p0)
    const all = p0.floors.flatMap((f) => f.rooms)
    const ldk = all.find((r) => r.type === 'ldk')!
    expect(m.ldkTatami).toBeCloseTo(ldk.area / 8)
    const beds = all.filter((r) => r.type === 'master' || r.type === 'bed')
    expect(m.roomAvgTatami).toBeCloseTo(beds.reduce((s, r) => s + r.area, 0) / beds.length / 8)
    const hall = all.filter((r) => r.type === 'hall').reduce((s, r) => s + r.area, 0)
    expect(m.hallRatio).toBeCloseTo(hall / p0.totalArea)
    expect(m.hallRatio).toBeGreaterThan(0)
  })
})
