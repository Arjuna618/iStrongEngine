export const ADMIT_ONLY_ARMED_LAYERS = 1;

export const RESERVE_PLAYER_ML_SLOT = 1;

export const RESERVE_PLAYER_INVIS_SLOT = 1;

export const FADE_LAYERED_AS_ONE_UNIT = 1;

export function needsLayerInterleaveSlot(bodyLayerCount: number, turretCount: number): boolean {
    if (bodyLayerCount <= 0) return false;
    if (!ADMIT_ONLY_ARMED_LAYERS) return true;
    return turretCount > 0;
}

export function fadesAsOneUnit(
    canFade: boolean, bodyLayerCount: number, turretCount: number,
): boolean {
    if (!FADE_LAYERED_AS_ONE_UNIT) return false;
    if (!canFade) return false;
    return needsLayerInterleaveSlot(bodyLayerCount, turretCount);
}

export function enemyQueueBudget(maxSlots: number, playerReserves: boolean): number {
    if (!playerReserves) return maxSlots;
    return Math.max(1, maxSlots - 1);
}

export function playerReservesMultiLayerSlot(bodyLayerCount: number, turretCount: number): boolean {
    if (!RESERVE_PLAYER_ML_SLOT) return false;
    return needsLayerInterleaveSlot(bodyLayerCount, turretCount);
}

export function playerReservesInvisibleSlot(
    bodyLayerCount: number, alpha: number, fadeThreshold: number,
    canFade = false, turretCount = 0,
): boolean {
    if (!RESERVE_PLAYER_INVIS_SLOT) return false;
    if (fadesAsOneUnit(canFade, bodyLayerCount, turretCount)) return true;
    if (bodyLayerCount > 0) return false;
    return alpha < fadeThreshold;
}

export const NESTED_SPAWN_AS_ONE_UNIT = 1;

export function nestedShapeFadesAsOneUnit(
    labyLevel: number, fadingOut: boolean, fadingIn: boolean, baseOpacity: number,
    seeThroughAsSet = false,
): boolean {
    if (!(labyLevel > 0)) return false;
    if (fadingOut) return true;
    if (seeThroughAsSet && baseOpacity < 1) return true;
    if (!NESTED_SPAWN_AS_ONE_UNIT) return false;
    return fadingIn && baseOpacity >= 1;
}

export const ROUND_AS_ONE_UNIT = 1;

export function roundDrawsAsOneUnit(nested: boolean, armed: boolean, dying: boolean, canHide: boolean): boolean {
    if (armed && dying) return true;
    if (!ROUND_AS_ONE_UNIT) return false;
    if (!nested && !armed) return false;
    return dying || canHide;
}
