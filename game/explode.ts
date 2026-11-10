import type { Turret, ExplodeConfig, ExplodeRing } from '../types';
import { v4 as uuidv4 } from 'uuid';
export const EXPLODE_MAX_DEPTH = 3;
export const EXPLODE_MAX_COUNT = 32;
export const EXPLODE_MAX_RINGS = 8;
export const EXPLODE_MAX_PIECES_PER_SHOT = 512;
export const EXPLODE_DEFAULT_COUNT = 8;

const HANG_TYPES: ReadonlySet<string> = new Set(['hangNearOwner', 'hangNearOwnerV2', 'minionControl', 'invisible']);

export function explodeCount(n: unknown): number {
  if (typeof n !== 'number' || !isFinite(n)) return 0;
  const c = Math.round(n);
  return c < 1 ? 0 : (c > EXPLODE_MAX_COUNT ? EXPLODE_MAX_COUNT : c);
}

export function explodeAngleDeg(count: number, startDeg: number, arcDeg: number, i: number): number {
  if (count <= 1) return startDeg;
  if (arcDeg >= 360) return startDeg + (360 / count) * i;
  return startDeg - arcDeg / 2 + (arcDeg / (count - 1)) * i;
}

export function explodeActive(ex: ExplodeConfig | null | undefined): ex is ExplodeConfig {
  return !!ex && ex.enabled === true && Array.isArray(ex.rings) && ex.rings.length > 0;
}

export function explodeTotalPieces(ex: ExplodeConfig | null | undefined, level: number = 1): number {
  if (!explodeActive(ex) || level > EXPLODE_MAX_DEPTH) return 0;
  let total = 0;
  const rings = ex.rings;
  const nr = rings.length < EXPLODE_MAX_RINGS ? rings.length : EXPLODE_MAX_RINGS;
  for (let i = 0; i < nr; i++) {
    const r = rings[i];
    if (!r || !r.fragment) continue;
    const n = explodeCount(r.count);
    total += n * (1 + explodeTotalPieces(r.fragment.explode, level + 1));
  }
  return total;
}

export function roundNeverAges(t: Turret): boolean {
  const pt = t.projectileType;
  if (pt && pt.lifetime > 0) return false;
  const bh = t.projectileBehaviors;
  if (!bh) return false;
  for (let i = 0; i < bh.length; i++) {
    if (bh[i] && bh[i].enabled && HANG_TYPES.has(bh[i].type)) return true;
  }
  return false;
}

export function piecesPileUp(fragment: Turret): boolean {
  if (!roundNeverAges(fragment)) return false;
  const cap = fragment.projectileType ? (fragment.projectileType.maxAlive || 0) : 0;
  return !(cap > 0);
}

export function getFragmentAt(root: Turret | null | undefined, path: readonly number[]): Turret | null {
  let t: Turret | null | undefined = root;
  for (let i = 0; i < path.length; i++) {
    const ex = t?.explode;
    if (!ex || !Array.isArray(ex.rings)) return null;
    const ring = ex.rings[path[i]];
    if (!ring || !ring.fragment) return null;
    t = ring.fragment;
  }
  return t ?? null;
}

export function updateAtPath(root: Turret, path: readonly number[], updates: Partial<Turret>): ExplodeConfig | undefined {
  const out = _withUpdate(root, path, 0, updates);
  return out ? out.explode : undefined;
}

function _withUpdate(t: Turret, path: readonly number[], i: number, updates: Partial<Turret>): Turret | null {
  if (i === path.length) return _applyUpdates(t, updates);
  const ex = t.explode;
  if (!ex || !Array.isArray(ex.rings)) return null;
  const ri = path[i];
  const ring = ex.rings[ri];
  if (!ring || !ring.fragment) return null;
  const frag = _withUpdate(ring.fragment, path, i + 1, updates);
  if (!frag) return null;
  const rings = ex.rings.slice();
  rings[ri] = { ...ring, fragment: frag };
  return { ...t, explode: { ...ex, rings } };
}

function _applyUpdates(t: Turret, updates: Partial<Turret>): Turret {
  const next: Turret = { ...t, ...updates };
  const newPt = updates.projectileType;
  if (newPt && newPt.customProjectileDesign && newPt.customProjectileDesign !== t.projectileType?.customProjectileDesign) {
    next.projectileType = { ...newPt, customProjectileDesign: structuredClone(newPt.customProjectileDesign) };
  }
  return next;
}

export function cloneRing(ring: ExplodeRing): ExplodeRing {
  const copy = structuredClone(ring);
  _reIdFragments(copy, 0);
  return copy;
}

export function cloneExplode(ex: ExplodeConfig | undefined): ExplodeConfig | undefined {
  if (!ex || typeof ex !== 'object' || !Array.isArray(ex.rings)) return undefined;
  return { ...ex, rings: ex.rings.map(r => cloneRing(r)) };
}

function _reIdFragments(ring: ExplodeRing, depth: number): void {
  if (!ring || !ring.fragment || depth > EXPLODE_MAX_DEPTH + 2) return;
  ring.fragment.id = uuidv4();
  const ex = ring.fragment.explode;
  if (ex && Array.isArray(ex.rings)) {
    for (let i = 0; i < ex.rings.length; i++) _reIdFragments(ex.rings[i], depth + 1);
  }
}

export function fragmentLabel(f: Turret): string {
  const pt = f.projectileType;
  if (!pt) return 'Bullet';
  if (pt.tankAsProjectile) return pt.tankAsProjectile;
  if (pt.customProjectileDesign && pt.customProjectileDesignName) return pt.customProjectileDesignName;
  if (pt.customProjectileDesign && pt.customProjectileDesign.name) return pt.customProjectileDesign.name;
  const v = pt.visual || 'bullet';
  return v.charAt(0).toUpperCase() + v.slice(1);
}
