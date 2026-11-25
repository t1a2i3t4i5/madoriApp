/// <reference types="node" />
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { planKey } from './enumerate'
import { GEN_VERSION, generatePlans } from './generate'
import { feasibility } from './program'
import type { PlanConfig } from './types'
import type { SamplesFile } from './fixtureSamples'

/**
 * 計測系テストの標本（部分二階を総二階と同じ条件集合で）の記録 gen-v<GEN_VERSION>-samples.json が、ライブ生成と一致することの検査。
 * 通常の npm test には入れない（192条件近いグリッドを生成するので重い）。版を上げるときは npm run test:archive で確かめる。
 * 更新: UPDATE_GOLDEN=1 npm run test:archive（genVersion が同じまま中身が変わる更新は拒否。UPDATE_GOLDEN=force で許可）
 */
const FILE = new URL(`./__fixtures__/gen-v${GEN_VERSION}-samples.json`, import.meta.url)

function build(): SamplesFile {
  const gridPartAlt: SamplesFile['gridPartAlt'] = {}
  for (const area of [20, 23, 26, 30, 36, 40]) {
    for (const rooms of [2, 3, 4, 5]) {
      for (const feats of [[], ['doma'], ['void', 'study'], ['washitsu', 'laundry', 'pantry', 'wic']] as PlanConfig['feats'][]) {
        const cfg: PlanConfig = { area, floors: 2, rooms, parking: 1, garden: 1, feats, story: 'partial' }
        if (feasibility(cfg).ok) gridPartAlt[JSON.stringify(cfg)] = generatePlans(cfg, 1).map(planKey)
      }
    }
  }
  return { genVersion: GEN_VERSION, gridPartAlt }
}

describe(`gen-v${GEN_VERSION}-samples（計測系テストの標本の記録）`, () => {
  const update = process.env.UPDATE_GOLDEN
  if (update) {
    it('記録を書き出す', () => {
      const next = build()
      if (existsSync(FILE) && update !== 'force') {
        const old = JSON.parse(readFileSync(FILE, 'utf8')) as SamplesFile
        if (old.genVersion === GEN_VERSION && JSON.stringify(old) !== JSON.stringify(next)) {
          throw new Error('samples の genVersion が同じまま中身が変わります。GEN_VERSION を上げるか UPDATE_GOLDEN=force で実行してください')
        }
      }
      writeFileSync(FILE, JSON.stringify(next, null, 1) + '\n')
    }, 600_000)
    return
  }
  it('記録がライブ生成と一致する（genVersion も現在の GEN_VERSION と一致）', () => {
    const rec = JSON.parse(readFileSync(FILE, 'utf8')) as SamplesFile
    expect(rec.genVersion).toBe(GEN_VERSION)
    expect(rec).toEqual(build())
  }, 600_000)
})
