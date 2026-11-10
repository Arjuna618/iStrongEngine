const _g = globalThis as { __ISTRONG_OLD_LAYER_TURN?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_LAYER_TURN === 1 || _g.process?.env?.ISTRONG_OLD_LAYER_TURN === '1';

export const LAYER_TURN: number = _old ? 0 : 1;

export function layerTurnInBody(layer: { stationary?: boolean; _currentAngle: number }, bodyAngle: number): number {
  return layer.stationary === true && LAYER_TURN !== 0 ? -bodyAngle : layer._currentAngle;
}

const _oldRounds = (_g as { __ISTRONG_OLD_LAYER_ROUNDS?: unknown }).__ISTRONG_OLD_LAYER_ROUNDS === 1
  || _g.process?.env?.ISTRONG_OLD_LAYER_ROUNDS === '1'
  || (typeof location !== 'undefined' && /[?&]oldlayerrounds(?:[=&]|$)/.test(location.search));

export const LAYER_ROUNDS_ABOVE: number = _oldRounds ? 0 : 1;

export function layerStandsStill(layer: { stationary?: boolean }): boolean {
  return layer.stationary === true && LAYER_TURN !== 0;
}
