/** 選択中の階を、実在する階（0..count-1）に収める。階数が減った条件変更後でも floors[idx] が undefined にならない */
export function clampFloor(idx: number, floorCount: number): number {
  return Math.max(0, Math.min(idx, floorCount - 1))
}
