/** 3案の組の識別子: 各案の sig をソートして連結する（順序違いは同じ組とみなす） */
export function plansKey(sigs: readonly string[]): string {
  return [...sigs].sort().join('\n')
}

/**
 * seed+1 から順に試し、3案の組が現在の seed と違う最初の seed を返す。
 * maxTries 個試しても見つからなければ seed+1（この条件では出せる組が尽きている）。
 */
export function nextDistinctSeed(seed: number, sigsOf: (seed: number) => readonly string[], maxTries = 30): number {
  const current = plansKey(sigsOf(seed))
  for (let i = 1; i <= maxTries; i++) {
    if (plansKey(sigsOf(seed + i)) !== current) return seed + i
  }
  return seed + 1
}
