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
})
