/// <reference types="node" />
/**
 * 計測系テスト（windows・site・similarity・chokka・closet）の標本を、fixture に記録した提示案の planKey から組み直す。
 * 192条件グリッドの生成をテストファイルごとにやり直さないための共有（生成コードではない。テスト専用）。
 *
 * - 総二階・平屋のグリッド: `gen-v<GEN_VERSION>.json` の grid
 * - 部分二階のグリッド（24〜40坪の5条件）: `gen-v<GEN_VERSION>-partial.json` の grid
 * - 部分二階のグリッド（総二階と同じ条件集合 × story: 'partial'。chokka・similarity の標本）: `gen-v<GEN_VERSION>-samples.json`
 *   （`samples.archive.test.ts` が生成と一致を検査する。更新は UPDATE_GOLDEN=1 npm run test:archive）
 *
 * 計測側が見るのは版の一致だけ。生成が変われば golden-fixture が落ちる。各テストは `genVersion` が GEN_VERSION と一致することを検査する
 */
import { readFileSync } from 'node:fs'
import { planFromKey } from './enumerate'
import { GEN_VERSION } from './generate'
import type { PlanConfig, ScoredPlan } from './types'

export interface GridSample {
  genVersion: number
  /** 条件ごとの提示案（fixture の grid の順。3案が出ない条件は短い／空） */
  groups: ScoredPlan[][]
  /** 全条件の提示案を平らにしたもの */
  plans: ScoredPlan[]
}

const url = (name: string) => new URL(`./__fixtures__/${name}`, import.meta.url)

/** 記録用ファイル（gen-v<GEN_VERSION>-samples.json）の形 */
export interface SamplesFile {
  genVersion: number
  /** 総二階と同じ条件集合（2階建て・可能なもの）の story: 'partial' の seed 1 の提示案の key。JSON.stringify(cfg) → keys */
  gridPartAlt: Record<string, string[]>
}

export function loadGrid(name: string, pick: (json: { genVersion: number; grid?: Record<string, string[]>; gridPartAlt?: Record<string, string[]> }) => Record<string, string[]> | undefined): GridSample {
  const json = JSON.parse(readFileSync(url(name), 'utf8')) as { genVersion: number; grid?: Record<string, string[]>; gridPartAlt?: Record<string, string[]> }
  const grid = pick(json) ?? {}
  const groups = Object.entries(grid).map(([id, keys]) => {
    const cfg = JSON.parse(id) as PlanConfig
    return keys.map((k) => {
      const p = planFromKey(cfg, k)
      if (!p) throw new Error(`${name}: planFromKey が再構築できません: ${id} ${k}`)
      return p
    })
  })
  return { genVersion: json.genVersion, groups, plans: groups.flat() }
}

const cache = new Map<string, GridSample>()
const once = (name: string, f: () => GridSample) => {
  let g = cache.get(name)
  if (!g) cache.set(name, (g = f()))
  return g
}

/** 総二階・平屋の feasibility グリッド × seed 1（207案） */
export const gridFullSample = () => once('full', () => loadGrid(`gen-v${GEN_VERSION}.json`, (j) => j.grid))
/** 部分二階の feasibility グリッド（24〜40坪）× seed 1（132案） */
export const gridPartSample = () => once('part', () => loadGrid(`gen-v${GEN_VERSION}-partial.json`, (j) => j.grid))
/** 総二階と同じ条件集合（2階建て）の部分二階 × seed 1（99案。chokka・similarity の標本） */
export const gridPartAltSample = () => once('partAlt', () => loadGrid(`gen-v${GEN_VERSION}-samples.json`, (j) => j.gridPartAlt))
