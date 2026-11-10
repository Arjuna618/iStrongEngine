import { ARRAS_ROCK_DEAL, ARRAS_ROCK_DEAL_SEPTEMBER } from './constants';

export type RockKind = 'rock' | 'stone' | 'gravel';
export interface RockMix { readonly rock: number; readonly stone: number; readonly gravel: number }

export function rockDealOf(pattern: string | undefined): RockMix {
  return pattern === 'rock-ffa' || pattern === 'before-10' || pattern === 'before-20' ? ARRAS_ROCK_DEAL_SEPTEMBER : ARRAS_ROCK_DEAL;
}

const ORDER: readonly RockKind[] = ['gravel', 'stone', 'rock'];

export function rockCircleTooNear(rocks: readonly { x: number; y: number; size: number }[], x: number, y: number, r: number): boolean {
  for (let j = 0; j < rocks.length; j++) {
    const e = rocks[j], dx = x - e.x, dy = y - e.y, need = 10 + r + e.size;
    if (dx * dx + dy * dy < need * need) return true;
  }
  return false;
}

export function dealRockKinds(n: number, mix: RockMix, use: (k: RockKind) => boolean, rand: () => number): RockKind[] {
  const w = [use('gravel') ? mix.gravel : 0, use('stone') ? mix.stone : 0, use('rock') ? mix.rock : 0];
  const all = w[0] + w[1] + w[2];
  const out: RockKind[] = [];
  if (!(all > 0) || !(n > 0)) return out;
  const exact = [n * w[0] / all, n * w[1] / all, n * w[2] / all];
  const cnt = [Math.floor(exact[0]), Math.floor(exact[1]), Math.floor(exact[2])];
  const byRest = [0, 1, 2].filter((i) => w[i] > 0).sort((a, b) => (exact[b] - cnt[b]) - (exact[a] - cnt[a]) || a - b);
  for (let left = Math.round(n) - cnt[0] - cnt[1] - cnt[2], i = 0; left > 0; left--, i = (i + 1) % byRest.length) cnt[byRest[i]]++;
  for (let i = 0; i < 3; i++) for (let k = 0; k < cnt[i]; k++) out.push(ORDER[i]);
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = out[i]; out[i] = out[j]; out[j] = t; }
  return out;
}
