import { MAX_ROUND_LAYERS } from './constants';

export { MAX_ROUND_LAYERS };

export const ROUND_LAYER_RUNTIME = { CAP: 1 };
export function roundMayFire(generation: number): boolean {
  return ROUND_LAYER_RUNTIME.CAP === 0 || generation + 1 < MAX_ROUND_LAYERS;
}

export const MAX_AUTO_SUB_HOPS = 1;

export function roundCanNest(layer: number): boolean {
  return layer < MAX_ROUND_LAYERS;
}

export function autoSubCanNest(hops: number): boolean {
  return hops < MAX_AUTO_SUB_HOPS;
}

export function turretRoundDepth(t: any, layer: number = 1, hops: number = 0): number {
  if (!t || typeof t !== 'object') return 0;
  let deepest = layer;
  if (layer > MAX_ROUND_LAYERS) return deepest;
  const pt = t.projectileType;
  if (pt && typeof pt === 'object') {
    const cpd = pt.customProjectileDesign;
    if (cpd && typeof cpd === 'object' && Array.isArray(cpd.turrets)) {
      for (let i = 0; i < cpd.turrets.length; i++) {
        const d = turretRoundDepth(cpd.turrets[i], layer + 1, 0);
        if (d > deepest) deepest = d;
      }
    }
    if (Array.isArray(pt.subTurrets) && pt.subTurrets.length > 0 && layer + 1 > deepest) deepest = layer + 1;
  }
  if (autoSubCanNest(hops) && Array.isArray(t.autoSubTurrets)) {
    for (let i = 0; i < t.autoSubTurrets.length; i++) {
      const d = turretRoundDepth(t.autoSubTurrets[i], layer, hops + 1);
      if (d > deepest) deepest = d;
    }
  }
  const ex = t.explode;
  if (ex && typeof ex === 'object' && Array.isArray(ex.rings)) {
    for (let i = 0; i < ex.rings.length; i++) {
      const r = ex.rings[i];
      if (!r || !r.fragment) continue;
      const d = turretRoundDepth(r.fragment, layer + 1, 0);
      if (d > deepest) deepest = d;
    }
  }
  return deepest;
}

export function designRoundDepth(cpd: any): number {
  if (!cpd || typeof cpd !== 'object' || !Array.isArray(cpd.turrets)) return 0;
  let deepest = 0;
  for (let i = 0; i < cpd.turrets.length; i++) {
    const d = turretRoundDepth(cpd.turrets[i], 1, 0);
    if (d > deepest) deepest = d;
  }
  return deepest;
}

export function tankRoundDepth(cfg: any): number {
  return designRoundDepth(cfg);
}

export function designFits(layer: number, cpd: any): boolean {
  return layer + designRoundDepth(cpd) <= MAX_ROUND_LAYERS;
}

export function explodeSeedFits(layer: number, bomb: any): boolean {
  if (!bomb || typeof bomb !== 'object') return false;
  const pieceLayer = layer + 1;
  if (pieceLayer > MAX_ROUND_LAYERS) return false;
  const pt = bomb.projectileType;
  let deepest = pieceLayer;
  if (pt && typeof pt === 'object') {
    const d = designRoundDepth(pt.customProjectileDesign);
    if (pieceLayer + d > deepest) deepest = pieceLayer + d;
    if (Array.isArray(pt.subTurrets) && pt.subTurrets.length > 0 && pieceLayer + 1 > deepest) deepest = pieceLayer + 1;
  }
  return deepest <= MAX_ROUND_LAYERS;
}
