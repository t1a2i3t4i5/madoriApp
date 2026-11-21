import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, decodeHash, encodeHash, isValidSeed, parseHash } from './hash'

describe('URLハッシュ', () => {
  it('入力+seed が往復で保存される', () => {
    const s = { area: 35, floors: 1 as const, rooms: 4, parking: 0, garden: 2, feats: ['doma' as const, 'study' as const], seed: 777 }
    expect(decodeHash(encodeHash(s))).toEqual(s)
  })
  it('genVersion を含む', () => {
    expect(decodeURIComponent(encodeHash(DEFAULT_STATE))).toContain('"v":1')
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
    it('c が壊れている・無い・オブジェクトでないときは p も捨てる（既定条件で意図しない案を開かない）', () => {
      for (const h of ['#c=%7Bbroken&p=0-14x12', '#p=0-14x12', '#c=123&p=0-14x12', '#c=null&p=0-14x12', '#c=%5B1%5D&p=0-14x12']) {
        const r = parseHash(h)
        expect(r.planKey, h).toBeUndefined()
        expect(r.state, h).toEqual(DEFAULT_STATE)
        expect(r.versionMismatch, h).toBe(false)
      }
    })
  })
})
