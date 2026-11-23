import { describe, expect, it } from 'vitest'
import { GEN_VERSION } from '../core/generate'
import { DEFAULT_STATE, decodeHash, encodeHash, isValidSeed, parseHash } from './hash'

describe('URLハッシュ', () => {
  it('入力+seed が往復で保存される', () => {
    const s = { area: 35, floors: 1 as const, rooms: 4, parking: 0, garden: 2, feats: ['doma' as const, 'study' as const], seed: 777 }
    expect(decodeHash(encodeHash(s))).toEqual(s)
  })
  it('genVersion を含む', () => {
    expect(decodeURIComponent(encodeHash(DEFAULT_STATE))).toContain(`"v":${GEN_VERSION}`)
  })
  it('壊れたハッシュは既定値になる', () => {
    expect(decodeHash('#c=%7Bbroken')).toEqual(DEFAULT_STATE)
  })

  const withSeed = (seed: unknown, v: unknown = 1) =>
    '#c=' + encodeURIComponent(JSON.stringify({ ...DEFAULT_STATE, seed, v }))

  it('seed: 安全整数は通り、+1しても変化し続ける', () => {
    expect(decodeHash(withSeed(0)).seed).toBe(0)
    expect(decodeHash(withSeed(-5)).seed).toBe(-5)
    expect(decodeHash(withSeed(Number.MAX_SAFE_INTEGER - 1)).seed).toBe(Number.MAX_SAFE_INTEGER - 1)
  })
  it('seed: seed+1 で変化しなくなる値・非整数・非有限は既定値に戻す', () => {
    for (const bad of [Number.MAX_SAFE_INTEGER, 2 ** 53, 2 ** 60, 1e300, 1.5, '12', null]) {
      expect(decodeHash(withSeed(bad)).seed, String(bad)).toBe(DEFAULT_STATE.seed)
    }
    // JSON は Infinity/NaN を null にするので、文字列直書きでも確認
    expect(decodeHash('#c=' + encodeURIComponent('{"seed":1e999}')).seed).toBe(DEFAULT_STATE.seed)
  })
  it('isValidSeed: 弾いた値は実際に seed+1 で変わらないか安全整数でない', () => {
    expect(isValidSeed(Number.MAX_SAFE_INTEGER)).toBe(false)
    expect(2 ** 53 + 1 === 2 ** 53).toBe(true) // 2^53 を超えると +1 が効かない
    expect(isValidSeed(2 ** 53)).toBe(false)
    expect(isValidSeed(20261121)).toBe(true)
  })
  it('genVersion: 一致なら注記なし、違う/未記載なら注記あり、ハッシュなしは注記なし', () => {
    expect(parseHash(encodeHash(DEFAULT_STATE)).versionMismatch).toBe(false)
    expect(parseHash(withSeed(1, 0)).versionMismatch).toBe(true)
    expect(parseHash(withSeed(1, 999)).versionMismatch).toBe(true)
    expect(parseHash('#c=' + encodeURIComponent('{"area":30}')).versionMismatch).toBe(true)
    expect(parseHash('').versionMismatch).toBe(false)
    expect(parseHash('#c=%7Bbroken').versionMismatch).toBe(false)
  })

  it('旧URL（v=3）: 警告つきで開き、条件は復元し、p は捨てる（GEN_VERSION 4 への移行）', () => {
    const c = encodeURIComponent('{"area":34,"floors":1,"rooms":4,"parking":1,"garden":1,"feats":["laundry"],"seed":7,"v":3}')
    const r = parseHash(`#c=${c}&p=1-18x15-E0000m`)
    expect(r.versionMismatch).toBe(true)
    expect(r.planKey).toBeUndefined()
    expect(r.state).toMatchObject({ area: 34, floors: 1, rooms: 4, feats: ['laundry'], seed: 7 })
    // 現行バージョンなら p は残る
    const cur = encodeURIComponent('{"area":34,"floors":1,"rooms":4,"parking":1,"garden":1,"feats":["laundry"],"seed":7,"v":4}')
    const r3 = parseHash(`#c=${cur}&p=1-18x15-E0000m`)
    expect(r3.versionMismatch).toBe(false)
    expect(r3.planKey).toBe('1-18x15-E0000m')
  })

  describe('p（planKey）', () => {
    it('往復できる。c と独立に取り出せる', () => {
      const h = encodeHash(DEFAULT_STATE, '2-18x14')
      expect(h).toContain('&p=2-18x14')
      const r = parseHash(h)
      expect(r.planKey).toBe('2-18x14')
      expect(r.state).toEqual(DEFAULT_STATE)
      expect(r.versionMismatch).toBe(false)
    })
    it('p なしのハッシュ（従来形式）は planKey なし', () => {
      expect(encodeHash(DEFAULT_STATE)).not.toContain('p=')
      expect(parseHash(encodeHash(DEFAULT_STATE)).planKey).toBeUndefined()
      expect(parseHash('').planKey).toBeUndefined()
    })
    it('不正な key は無視し、c の復元には影響しない', () => {
      const base = encodeHash(DEFAULT_STATE)
      for (const bad of ['3-18x14', '2-18', '2-0x0', 'x', '2-18x14x', '-1-18x14', '2-181x14', '%E0%A4%A', '', '<script>']) {
        const r = parseHash(`${base}&p=${bad}`)
        expect(r.planKey, bad).toBeUndefined()
        expect(r.state, bad).toEqual(DEFAULT_STATE)
      }
    })
    it('versionMismatch（旧バージョン・未記載）のときは p を捨て、c は復元する', () => {
      const old = '#c=' + encodeURIComponent(JSON.stringify({ area: 33, floors: 2, rooms: 3, parking: 1, garden: 1, feats: [], seed: 5, v: 1 })) + '&p=2-18x14'
      const r = parseHash(old)
      expect(r.versionMismatch).toBe(true)
      expect(r.planKey).toBeUndefined()
      expect(r.state.area).toBe(33)
      const noV = '#c=' + encodeURIComponent('{"area":30}') + '&p=2-18x14-E00000'
      expect(parseHash(noV).planKey).toBeUndefined()
    })
    it('v2 形式の key（変種つき）も往復できる', () => {
      expect(parseHash(encodeHash(DEFAULT_STATE, '1-16x14-E01000')).planKey).toBe('1-16x14-E01000')
    })
    it('c が壊れている・無い・オブジェクトでないときは p も捨てる（既定条件で意図しない案を開かない）', () => {
      for (const h of ['#c=%7Bbroken&p=0-14x12', '#p=0-14x12', '#c=123&p=0-14x12', '#c=null&p=0-14x12', '#c=%5B1%5D&p=0-14x12']) {
        const r = parseHash(h)
        expect(r.planKey, h).toBeUndefined()
        expect(r.state, h).toEqual(DEFAULT_STATE)
        expect(r.versionMismatch, h).toBe(false)
      }
    })
  })

  it('総二階・平屋の encodeHash は従来と同一の文字列（story を書かない）', () => {
    const legacy = '#c=' + encodeURIComponent('{"area":30,"floors":2,"rooms":3,"parking":2,"garden":1,"feats":["kitchenFace","wic"],"seed":20261121,"v":' + GEN_VERSION + '}')
    expect(encodeHash(DEFAULT_STATE)).toBe(legacy)
    expect(encodeHash({ ...DEFAULT_STATE, story: 'full' })).toBe(legacy)
    // 平屋では partial でも書かない
    const one = encodeHash({ ...DEFAULT_STATE, floors: 1 })
    expect(encodeHash({ ...DEFAULT_STATE, floors: 1, story: 'partial' })).toBe(one)
    expect(one).not.toContain('story')
  })
  it('部分二階: story=partial が往復し、2階建てのときだけ書く', () => {
    const s = { ...DEFAULT_STATE, story: 'partial' as const }
    expect(decodeURIComponent(encodeHash(s))).toContain('"story":"partial"')
    expect(decodeHash(encodeHash(s)).story).toBe('partial')
    expect(decodeHash(encodeHash(DEFAULT_STATE)).story).toBeUndefined()
  })
  it('story は partial のときだけ採用（それ以外は無視）', () => {
    const h = (story: unknown) => '#c=' + encodeURIComponent(JSON.stringify({ ...DEFAULT_STATE, story, v: GEN_VERSION }))
    expect(decodeHash(h('partial')).story).toBe('partial')
    for (const bad of ['full', 'x', 1, null, true]) expect(decodeHash(h(bad)).story, String(bad)).toBeUndefined()
  })
})
