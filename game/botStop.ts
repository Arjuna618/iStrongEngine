export const BOT_STOP_CHANCES: readonly number[] = [1, 2, 4, 8];

export function botStopSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function botStopNext(a: number): number { return (a + 0x6D2B79F5) >>> 0; }
export function botStopValue(a: number): number {
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function stopChanceAt(tier: number, boxes: readonly number[] | undefined): number {
  const b = boxes ?? BOT_STOP_CHANCES;
  if (tier < 1) return 0;
  const v = b[Math.min(tier, b.length) - 1];
  return Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : 0;
}
