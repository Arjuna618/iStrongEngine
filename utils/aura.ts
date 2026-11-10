export const ARRAS_AURA_DAMAGE = 0.4;
export const ARRAS_AURA_HEAL_SHARE = 1 / 3;

export const AURA_DEFAULT = Object.freeze({ size: 3, strength: 1, opacity: 0.3 });
export const AURA_RANGE = Object.freeze({
  size: Object.freeze({ min: 0.5, max: 20, step: 0.05 }),
  strength: Object.freeze({ min: 0, max: 10, step: 0.05 }),
  opacity: Object.freeze({ min: 0, max: 1, step: 0.01 }),
});

export const AURA_RING_SLOT = Object.freeze({ damage: 10, heal: 12 });

export const AURA_TYPES: ReadonlyArray<{ value: 'damage' | 'heal'; label: string }> = Object.freeze([
  Object.freeze({ value: 'damage' as const, label: 'Damage' }),
  Object.freeze({ value: 'heal' as const, label: 'Heal' }),
]);

export function auraHeals(t: { auraType?: 'damage' | 'heal' }): boolean {
  return t.auraType === 'heal';
}
export function auraRadius(t: { auraSize?: number }, bodyRadius: number): number {
  const s = t.auraSize;
  return (typeof s === 'number' && s > 0 ? s : AURA_DEFAULT.size) * bodyRadius;
}
export function auraOpacityOf(t: { auraOpacity?: number }): number {
  const o = t.auraOpacity;
  return typeof o === 'number' && o >= 0 ? (o > 1 ? 1 : o) : AURA_DEFAULT.opacity;
}
export function auraTickDamage(t: { auraStrength?: number; auraType?: 'damage' | 'heal' }, damSkill: number): number {
  const k = t.auraStrength;
  const strength = typeof k === 'number' && k >= 0 ? k : AURA_DEFAULT.strength;
  return ARRAS_AURA_DAMAGE * (t.auraType === 'heal' ? ARRAS_AURA_HEAL_SHARE : 1) * strength * damSkill;
}
