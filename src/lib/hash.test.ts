import { describe, expect, it } from 'vitest'
import { DEFAULT_STATE, decodeHash, encodeHash } from './hash'

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
})
