import { cardMapKeyOf } from './gameModeRegistry';

export const HIS_TOP_PICKS: readonly string[] = [
  'halloween',
  'growth-arms-manhunt-maze',
  'growth-arms-rock-ffa',
  'growth-arms-soccer',
  'growth-arms-outbreak-maze',
  'growth-arms-siege-blitz',
  'old-dreadnoughts',
  'labyrinth',
  'nexus',
  'growth-arms-vampirism',
  'growth-arms-siege-fortress',
  'growth-arms-maze-2tdm',
  'growth-arms-duos',
  'growth-arms-assault-stronghold',
  'growth-arms-magic-maze',
  'growth-arms-4tdm',
  'growth-arms-portal-2tdm',
  'growth-arms-assault-booster',
  'growth-arms-assault-branches',
];

const REST_ORDER: readonly string[] = [
  'ffa', 'outbreak-squads', '2-domination', 'maze-4tdm', 'blackout-ffa', 'mothership', 'manhunt', 'capture-the-flag',
  'old-dreadnoughts-4tdm', 'assault-bunker', 'open-4-tag', 'squads', 'siege-citadel', 'portal-maze-4tdm', 'blackout-vampirism', 'maze',
  '4-domination', 'clan-wars', 'open-4tdm', 'outbreak-maze-squads', 'maze-mothership', 'assault-eye', 'maze-duos', 'manhunt-rock',
  'old-dreadnoughts-open-4tdm', 'open-maze-3-domination', 'blackout-maze', '2tdm', 'open-maze-4-tag', 'assault-yinyang', 'portal-4tdm',
  'maze-squads', '4-mothership', 'open-2tdm', 'maze-2-domination', 'assault-trenches', 'maze-clan-wars', 'old-dreadnoughts-open-3tdm',
  'open-maze-4tdm', 'portal-mothership', 'open-3-tag', 'assault-bastion', 'open-2-domination', 'open-maze-2tdm', 'assault-acropolis',
  'open-maze-3-tag', 'open-3-domination', 'assault-line', 'open-3tdm', 'open-maze-4-domination', 'open-maze-3tdm',
];

export const MAP_ORDER: readonly string[] = Array.from(new Set([...HIS_TOP_PICKS.map(cardMapKeyOf), ...REST_ORDER]));

function versionRank(key: string): number {
  return key.startsWith('growth-arms-') ? 0 : key.startsWith('growth-') ? 1 : key.startsWith('arms-') ? 2 : 3;
}

export function topPickRanks(keys: readonly string[]): Map<string, number> {
  const known = new Set(keys);
  const picks = HIS_TOP_PICKS.filter(k => known.has(k));
  const lines = new Map<string, string[]>();
  for (const k of keys) {
    const m = cardMapKeyOf(k);
    let l = lines.get(m);
    if (!l) { l = []; lines.set(m, l); }
    l.push(k);
  }
  for (const [m, l] of lines) {
    const pick = picks.find(k => cardMapKeyOf(k) === m);
    l.sort((a, b) => (a === pick ? -1 : b === pick ? 1 : versionRank(a) - versionRank(b)));
  }
  const maps = [...MAP_ORDER.filter(m => lines.has(m)), ...Array.from(lines.keys()).filter(m => !MAP_ORDER.includes(m))];
  const out = new Map<string, number>();
  for (const k of picks) out.set(k, out.size);
  const most = Math.max(0, ...Array.from(lines.values(), l => l.length));
  for (let round = 0; round < most; round++) {
    for (const m of maps) {
      const k = lines.get(m)![round];
      if (k !== undefined && !out.has(k)) out.set(k, out.size);
    }
  }
  return out;
}
