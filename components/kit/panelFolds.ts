export const PANEL_CARD_FOLDS: Readonly<Record<string, { open?: readonly string[]; closed?: readonly string[] }>> = {
  'tool:tank': { open: ['Base Stats', 'Tank Body Layers', 'Projectile Layers', 'Picked Part'] },
  'tool:shape': { open: ['Shape'] },
  'tool:turret': { open: ['Installed Turrets', 'Showing an Other', 'Editing food shape'] },
  'tool:game-mode': { open: ['Mode'] },
  'tool:enemy': { open: ['Team Bots'] },
  'tool:map-designer': { open: ['Map Generation', 'Custom Editor'] },
  'tool:import-export': { closed: ['Nexum Converter'] },
  'tool:settings': { closed: ['Developer'] },
};

export function cardStartsOpen(scope: string | null, card: string | null): boolean | undefined {
  if (!scope || !card) return undefined;
  const r = PANEL_CARD_FOLDS[scope];
  if (!r) return undefined;
  if (r.open) return r.open.includes(card);
  return !(r.closed ?? []).includes(card);
}
