import type { GameModeConfig } from '../types';

export const STARTING_SCORE_MAX = 1_000_000;
export const VAMP_STARTING_SCORE = 26263;
export const VAMP_SIPHON = 0.5;

export function vampirismOn(gm: Pick<GameModeConfig, 'vampirism'> | null | undefined): boolean {
  return !!gm && gm.vampirism === true;
}

export function vampBarScore(gm: Pick<GameModeConfig, 'startingScore'> | null | undefined): number {
  const s = shownScoreStart(gm);
  return s > 0 ? s : VAMP_STARTING_SCORE;
}

export function shownScoreStart(gm: Pick<GameModeConfig, 'startingScore'> | null | undefined): number {
  const v = gm ? gm.startingScore : undefined;
  return typeof v === 'number' && v > 0 && Number.isFinite(v) ? (v > STARTING_SCORE_MAX ? STARTING_SCORE_MAX : Math.round(v)) : 0;
}
