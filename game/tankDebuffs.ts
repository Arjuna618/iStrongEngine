const _g = globalThis as { process?: { env?: Record<string, string | undefined> } };

export const TANK_DEBUFF = {
  ON: _g.process?.env?.ISTRONG_OLD_TANK_DEBUFF === '1' ? 0 : 1,
};

export type TankKindId = 'dominators' | 'sanctuaries';

export interface TankDebuff {
  resist?: number;
  health?: number;
}
export type TankDebuffs = Partial<Record<TankKindId, TankDebuff>>;

export interface TankKind {
  id: TankKindId;
  one: string;
  fileResist: number;
  words: readonly string[];
}

export const TANK_KINDS: readonly TankKind[] = [
  { id: 'dominators', one: 'Dominator', fileResist: 100,
    words: ['dominator', 'destroyerDominator', 'gunnerDominator', 'trapperDominator', 'Dominator', 'Dominator Destroyer', 'Dominator Gunner', 'Dominator Trapper'] },
  { id: 'sanctuaries', one: 'Sanctuary', fileResist: 100,
    words: ['sanctuary', 'sanctuaryTier1', 'sanctuaryTier2', 'sanctuaryTier3', 'sanctuaryTier4', 'sanctuaryTier5', 'sanctuaryTier6',
      'Sanctuary', 'Sanctuary Tier 1', 'Sanctuary Tier 2', 'Sanctuary Tier 3', 'Sanctuary Tier 4', 'Sanctuary Tier 5', 'Sanctuary Tier 6'] },
];

const _KIND_OF = new Map<string, number>();
for (let i = 0; i < TANK_KINDS.length; i++) for (const w of TANK_KINDS[i].words) _KIND_OF.set(w, i);

export interface TankGroupRule {
  name: string;
  words: ReadonlySet<string>;
  debuff?: { resist?: number; health?: number };
  stop?: number;
  portals?: { rethinkS?: number; rest?: boolean; restMin?: number };
}
let _groups: readonly TankGroupRule[] = [];
const _GROUP_OF = new Map<string, number>();
const _DEBUFF_GROUP_OF = new Map<string, number>();
let _groupsVer = 0;
export function setTankGroupRules(rules: readonly TankGroupRule[]): void {
  _groups = rules;
  _GROUP_OF.clear(); _DEBUFF_GROUP_OF.clear();
  for (let i = 0; i < rules.length; i++) {
    const g = rules[i];
    g.words.forEach(w => {
      if (!_GROUP_OF.has(w)) _GROUP_OF.set(w, i);
      if (g.debuff && !_DEBUFF_GROUP_OF.has(w)) _DEBUFF_GROUP_OF.set(w, i);
    });
  }
  _groupsVer++;
}
export function tankGroupsVersion(): number { return _groupsVer; }
export function groupStopChance(word: string | undefined | null): number | undefined {
  if (!word) return undefined;
  const i = _GROUP_OF.get(word);
  if (i === undefined) return undefined;
  for (let j = i; j < _groups.length; j++) { const g = _groups[j]; if (g.stop !== undefined && g.words.has(word)) return g.stop; }
  return undefined;
}
export function groupPortals(word: string | undefined | null): { rethinkS?: number; rest?: boolean; restMin?: number } | null {
  if (!word) return null;
  const i = _GROUP_OF.get(word);
  if (i === undefined) return null;
  for (let j = i; j < _groups.length; j++) { const g = _groups[j]; if (g.portals && g.words.has(word)) return g.portals; }
  return null;
}

export function tankKindOf(word: string | undefined | null, fileResist: number | undefined): number {
  if (!word) return -1;
  if (TANK_DEBUFF.ON !== 0) { const gi = _DEBUFF_GROUP_OF.get(word); if (gi !== undefined) return TANK_KINDS.length + gi; }
  if (!(fileResist !== undefined && fileResist > 1)) return -1;
  const k = _KIND_OF.get(word);
  return k === undefined ? -1 : k;
}
function groupDebuff(k: number): { resist?: number; health?: number } | undefined {
  return k >= TANK_KINDS.length ? _groups[k - TANK_KINDS.length]?.debuff : undefined;
}
export function kindFileResist(k: number, own: number): number { return k >= 0 && k < TANK_KINDS.length ? TANK_KINDS[k].fileResist : own; }

export const DEBUFF_RESIST_MIN = 1;
export const DEBUFF_HEALTH_MIN = 1;
export const DEBUFF_HEALTH_MAX = 100;

export function debuffResist(d: TankDebuffs | undefined, k: number, file: number): number {
  if (TANK_DEBUFF.ON === 0 || k < 0) return file;
  if (k >= TANK_KINDS.length) { const r = groupDebuff(k)?.resist; return r !== undefined && r > 0 ? Math.max(DEBUFF_RESIST_MIN, Math.min(file, r)) : file; }
  if (d === undefined) return file;
  const r = d[TANK_KINDS[k].id]?.resist;
  return r !== undefined && r > 0 ? r : file;
}

export function debuffHealthK(d: TankDebuffs | undefined, k: number): number {
  if (TANK_DEBUFF.ON === 0 || k < 0) return 1;
  if (k >= TANK_KINDS.length) { const h = groupDebuff(k)?.health; return h !== undefined && h > 0 ? Math.max(DEBUFF_HEALTH_MIN, Math.min(DEBUFF_HEALTH_MAX, h)) / 100 : 1; }
  if (d === undefined) return 1;
  const h = d[TANK_KINDS[k].id]?.health;
  return h !== undefined && h > 0 ? h / 100 : 1;
}

export const SERVER_DOMINATOR: Readonly<TankDebuff> = { resist: 1, health: 71 };

const _num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export function clampTankDebuffs(raw: unknown): TankDebuffs | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const src = raw as Record<string, unknown>;
  const out: TankDebuffs = {};
  let any = false;
  for (const kind of TANK_KINDS) {
    const d = src[kind.id];
    if (d === null || typeof d !== 'object') continue;
    const r = _num((d as Record<string, unknown>).resist), h = _num((d as Record<string, unknown>).health);
    const one: TankDebuff = {};
    if (r !== undefined) one.resist = Math.max(DEBUFF_RESIST_MIN, Math.min(kind.fileResist, r));
    if (h !== undefined) one.health = Math.max(DEBUFF_HEALTH_MIN, Math.min(DEBUFF_HEALTH_MAX, h));
    if (one.resist !== undefined || one.health !== undefined) { out[kind.id] = one; any = true; }
  }
  return any ? out : undefined;
}
