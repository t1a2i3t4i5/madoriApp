/** 3案の組の識別子: 各案の sig をソートして連結する（順序違いは同じ組とみなす） */
export function plansKey(sigs: readonly string[]): string {
  return [...sigs].sort().join('\n')
}

export interface NextSeed {
  seed: number
  /** 組が変わる seed を見つけたか。false なら seed+1 を返しただけ（この条件では出せる組が尽きている） */
  found: boolean
}

/**
 * seed+1 から順に試し、3案の組が現在と違う最初の seed を返す。
 * maxTries 個試しても見つからなければ { seed: seed+1, found: false }。
 * 表示中の3案の sig が分かっていれば currentSigs で渡すと、現在の seed の生成を省ける。
 */
export function nextDistinctSeed(
  seed: number,
  sigsOf: (seed: number) => readonly string[],
  maxTries = 30,
  currentSigs?: readonly string[],
): NextSeed {
  const current = plansKey(currentSigs ?? sigsOf(seed))
  for (let i = 1; i <= maxTries; i++) {
    if (plansKey(sigsOf(seed + i)) !== current) return { seed: seed + i, found: true }
  }
  return { seed: seed + 1, found: false }
}
