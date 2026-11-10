export const SHAPE_HEAD = 'shape:', OTHER_HEAD = 'other:', PROJECTILE_HEAD = 'projectile:', TURRET_HEAD = 'turret:';
export const MAP_TANK_HEAD = 'maptank:';
export function isShapeThing(word: string | undefined): boolean { return !!word && (word.startsWith(SHAPE_HEAD) || word.startsWith(OTHER_HEAD)); }
