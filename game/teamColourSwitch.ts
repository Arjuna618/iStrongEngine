const _g = globalThis as { __ISTRONG_OLD_TEAM_COLOUR?: unknown; process?: { env?: Record<string, string | undefined> } };
const _old = _g.__ISTRONG_OLD_TEAM_COLOUR === 1 || _g.process?.env?.ISTRONG_OLD_TEAM_COLOUR === '1';

export const TEAM_COLOUR = { ON: _old ? 0 : 1 };

export const LAYER_OWN = 0, LAYER_BODY = 1, LAYER_TEAM = 2;

export function layerColourOf(layer: { useInheritColor?: boolean; intangible?: boolean; teamColour?: boolean }, bodyWearsTeam: boolean, teamKnown: boolean): number {
  if (layer.useInheritColor) return LAYER_BODY;
  const tc = TEAM_COLOUR.ON !== 0 ? layer.teamColour : undefined;
  if (tc === false) return LAYER_OWN;
  if (bodyWearsTeam) return tc === true || !layer.intangible ? LAYER_BODY : LAYER_OWN;
  return tc === true && teamKnown ? LAYER_TEAM : LAYER_OWN;
}

export function layerTeamShown(layer: { intangible?: boolean; teamColour?: boolean }, keepOwnColor: boolean): boolean {
  return layer.teamColour ?? (!keepOwnColor && !layer.intangible);
}
export function teamColourEntry(layer: { intangible?: boolean }, keepOwnColor: boolean, on: boolean): boolean | undefined {
  return on === (!keepOwnColor && !layer.intangible) ? undefined : on;
}

export function anyForcedTeamLayer(layers: readonly { useInheritColor?: boolean; teamColour?: boolean }[] | null | undefined): boolean {
  if (TEAM_COLOUR.ON === 0 || !layers) return false;
  for (let i = 0; i < layers.length; i++) if (layers[i].teamColour === true && !layers[i].useInheritColor) return true;
  return false;
}
