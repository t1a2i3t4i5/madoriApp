import { describe, expect, it } from 'vitest'
import { enumeratePlans, planKey } from '../core/enumerate'
import { GEN_VERSION } from '../core/generate'
import type { ScoredPlan } from '../core/types'
import { CONDITIONS, PARTIAL_CONDITIONS, defined } from '../core/testing'
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

const { cfg } = defined(CONDITIONS[0])
const plans = enumeratePlans(cfg)
const p0 = defined(plans[0])
const p1 = defined(plans[1])

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
    expect(isFavorited(b, cfg, p0)).toBe(true)
  })

  it('同じ（条件,key）の重複は追加されない。条件が違えば別物', () => {
    const a = must(addFavorite([], cfg, p0, 1))
    expect(must(addFavorite(a, { ...cfg, feats: [...cfg.feats].reverse() }, p0, 2))).toHaveLength(1)
    expect(must(addFavorite(a, { ...cfg, rooms: cfg.rooms + 1 }, p0, 3))).toHaveLength(2)
  })

  it('削除できる。存在しないものの削除は何も起きない', () => {
    const a = must(addFavorite(must(addFavorite([], cfg, p0, 1)), cfg, p1, 2))
    expect(removeFavorite(a, cfg, p0).map((f) => f.key)).toEqual([planKey(p1)])
    expect(removeFavorite(a, { ...cfg, rooms: cfg.rooms + 1 }, p0)).toHaveLength(2) // 条件違いは別物なので何も消えない
    expect(removeFavorite([], cfg, p0)).toHaveLength(0)
  })

  it(`上限${MAX_FAVORITES}件: 超える追加は拒否し、既存を消さない`, () => {
    let list: Favorite[] = []
    for (let i = 0; i < MAX_FAVORITES; i++) list = must(addFavorite(list, { ...cfg, area: 20 + (i % 21), rooms: 2 + Math.floor(i / 21) }, p0, i))
    expect(list).toHaveLength(MAX_FAVORITES)
    const r = addFavorite(list, { ...cfg, garden: 0, parking: 0, area: 21 }, p0, 999)
    expect(r).toEqual({ ok: false, reason: 'full' })
    // 既に入っているものを「追加」しても上限エラーにはならない
    const first = defined(list[0])
    expect(addFavorite(list, first.cfg, first.plan, 1000).ok).toBe(true)
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
    const good = defined(must(addFavorite([], cfg, p0, 1))[0])
    const brokenPlan = { ...good, plan: { ...good.plan, floors: [{ label: '1F', rooms: [{ type: 'ldk' }] }] } }
    const badKey = { ...good, key: 'zzz' }
    const mismatch = { ...good, key: planKey(p1) }
    const badCfg = { ...good, cfg: { ...good.cfg, feats: ['nope'] } }
    const st = memory(JSON.stringify([brokenPlan, good, badKey, mismatch, badCfg, null]))
    expect(loadFavorites(st)).toEqual([good])
  })

  it('部分二階の案（story と 2F の fp）は保存・読込で残り、story や fp の形が壊れたものは捨てる', () => {
    const pc = defined(PARTIAL_CONDITIONS[0]).cfg
    const pp = defined(enumeratePlans(pc)[0])
    const good = defined(must(addFavorite([], pc, pp, 1))[0])
    expect(good.plan.floors[1]?.fp).toBeDefined()
    expect(loadFavorites(memory(JSON.stringify([good])))).toEqual([good])
    const badStory = { ...good, cfg: { ...good.cfg, story: 'half' } }
    const badFp = { ...good, plan: { ...good.plan, floors: [good.plan.floors[0], { ...good.plan.floors[1], fp: { x: 0, y: 0, W: 'a', H: 3 } }] } }
    expect(loadFavorites(memory(JSON.stringify([badStory, good, badFp])))).toEqual([good])
    // 建物からはみ出す・大きさ0・負の fp も捨てる
    const withFp = (fp: unknown) => ({ ...good, plan: { ...good.plan, floors: [good.plan.floors[0], { ...good.plan.floors[1], fp }] } })
    const { W, H } = good.plan
    for (const fp of [{ x: 0, y: 0, W: W + 1, H: 3 }, { x: -1, y: 0, W: 3, H: 3 }, { x: 0, y: 0, W: 0, H: 3 }, { x: W - 2, y: 0, W: 3, H: 3 }, { x: 0, y: H, W: 3, H: 1 }]) {
      expect(loadFavorites(memory(JSON.stringify([withFp(fp)]))), JSON.stringify(fp)).toEqual([])
    }
    // 総二階（story 省略）の保存データは従来どおり読める
    expect(loadFavorites(memory(JSON.stringify([defined(must(addFavorite([], cfg, p0, 1))[0])])))).toHaveLength(1)
  })

  it('保存データに重複・上限超えがあっても読込時に整える', () => {
    const good = defined(must(addFavorite([], cfg, p0, 1))[0])
    expect(loadFavorites(memory(JSON.stringify([good, good, good])))).toHaveLength(1)
  })

  it('planKey が違っても、左右反転の関係（sig / sigM）にある案は同じ案として☆状態が一致する（v1 の key で保存した案など）', () => {
    let shifted = 0
    for (const c of CONDITIONS) {
      for (const a of enumeratePlans(c.cfg).slice(0, 5)) {
        // 反転した配置（sig と sigM が入れ替わる）で、v1 形式の key（variant なし）の案
        const g: ScoredPlan = { ...a, variant: undefined, sig: a.sigM, sigM: a.sig }
        if (planKey(a) === planKey(g)) continue
        shifted++
        const list = must(addFavorite([], c.cfg, a, 1))
        expect(isFavorited(list, c.cfg, g), `${planKey(a)} と ${planKey(g)}`).toBe(true)
        expect(must(addFavorite(list, c.cfg, g, 2)), '重複追加しない').toHaveLength(1)
        expect(removeFavorite(list, c.cfg, g)).toHaveLength(0)
      }
    }
    expect(shifted, 'key がずれる実例が1件以上ある（空転防止）').toBeGreaterThan(0)
  })

  it('v1 の旧データ（variant なし・接尾辞なしの key）は有効なまま読め、旧バージョン扱いになる。壊れた variant は捨てる', () => {
    const { variant: _v, ...v1plan } = p0
    void _v
    const old: Favorite = { key: planKey(v1plan), cfg, v: 1, plan: v1plan, savedAt: 5 }
    expect(old.key).toMatch(/^\d-\d+x\d+$/)
    const loaded = loadFavorites(memory(JSON.stringify([old])))
    expect(loaded).toHaveLength(1)
    expect(isOldVersion(defined(loaded[0]))).toBe(true)
    const broken = { ...must(addFavorite([], cfg, p0, 1))[0], plan: { ...p0, variant: { stairEnd: 'X', rev: [], bedShift: 9 } } }
    expect(loadFavorites(memory(JSON.stringify([broken])))).toHaveLength(0)
  })

  it('別配置の案は別物', () => {
    const list = must(addFavorite([], cfg, p0, 1))
    const other = defined(plans.find((p) => p.sig !== p0.sig && p.sigM !== p0.sig))
    expect(isFavorited(list, cfg, other)).toBe(false)
  })

  it('roomの type は自前プロパティのみ許す（toString 等のプロトタイプ名は壊れたデータ）', () => {
    const good = defined(must(addFavorite([], cfg, p0, 1))[0])
    const fl = defined(good.plan.floors[0])
    const evil = { ...good, plan: { ...good.plan, floors: [{ ...fl, rooms: fl.rooms.map((r) => ({ ...r, type: 'toString' })) }] } }
    expect(loadFavorites(memory(JSON.stringify([evil])))).toEqual([])
  })

  it('付属収納の of は、closet / store が個室の持ち主と辺を共有しているときだけ受け付ける', () => {
    const good = defined(must(addFavorite([], cfg, p0, 1))[0])
    const fl = defined(good.plan.floors[0])
    const base = defined(fl.rooms[0])
    const bed = { ...base, type: 'bed', name: '洋室', x: 0, y: 0, w: 6, h: 6 }
    const hall = { ...base, type: 'hall', name: 'ホール', x: 0, y: 6, w: 6, h: 2 }
    const mk = (over: Record<string, unknown>, owner: Record<string, unknown> = bed) => {
      const cl = { ...base, type: 'closet', name: 'CL', x: 6, y: 0, w: 2, h: 6, of: { dx: -6, dy: 0 }, ...over }
      return { ...good, plan: { ...good.plan, floors: [{ ...fl, rooms: [owner, cl, hall] }, ...good.plan.floors.slice(1)] } }
    }
    const loads = (f: unknown) => loadFavorites(memory(JSON.stringify([f]))).length
    expect(loads(mk({}))).toBe(1)
    expect(loads(mk({ type: 'store' }))).toBe(1)
    expect(loads(mk({ of: { dx: 1000, dy: 0 } }))).toBe(0)
    expect(loads(mk({ of: { dx: -5.5, dy: 0 } }))).toBe(0)
    expect(loads(mk({ of: { dx: 0, dy: 0 } }))).toBe(0) // 自分自身
    expect(loads(mk({ of: 'x' }))).toBe(0)
    expect(loads(mk({ type: 'bath' }))).toBe(0) // of を付けられない種別
    expect(loads(mk({}, { ...bed, type: 'ldk' }))).toBe(0) // 持ち主が個室でない
    expect(loads(mk({ x: 9, of: { dx: -9, dy: 0 } }))).toBe(0) // 離れている
    // 2階でも同じ規則: 同じ階に持ち主がいれば通り、持ち主が別の階にしかなければ棄却
    const floors2 = (rooms: unknown[]) => ({ ...good, plan: { ...good.plan, floors: [fl, { ...fl, label: '2F', rooms }] } })
    const cl2 = { ...base, type: 'closet', name: 'CL', x: 6, y: 0, w: 2, h: 6, of: { dx: -6, dy: 0 } }
    expect(loads(floors2([bed, cl2, hall]))).toBe(1)
    expect(loads(floors2([cl2, hall]))).toBe(0)
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
    const f = defined(must(addFavorite([], cfg, p0, 1))[0])
    expect(isOldVersion(f)).toBe(false)
    expect(isOldVersion({ ...f, v: GEN_VERSION - 1 })).toBe(true)
  })
})

describe('planMetrics', () => {
  it('LDK畳数・個室平均畳数・廊下率', () => {
    const m = planMetrics(p0)
    const all = p0.floors.flatMap((f) => f.rooms)
    const ldk = defined(all.find((r) => r.type === 'ldk'))
    expect(m.ldkTatami).toBeCloseTo(ldk.area / 8)
    const beds = all.filter((r) => r.type === 'master' || r.type === 'bed')
    expect(m.roomAvgTatami).toBeCloseTo(beds.reduce((s, r) => s + r.area, 0) / beds.length / 8)
    const hall = all.filter((r) => r.type === 'hall').reduce((s, r) => s + r.area, 0)
    expect(m.hallRatio).toBeCloseTo(hall / p0.totalArea)
    expect(m.hallRatio).toBeGreaterThan(0)
  })
})
