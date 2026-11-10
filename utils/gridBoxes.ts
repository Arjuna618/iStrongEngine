import { GRID_SPACING } from '../game/constants';

export interface GridArea { minX: number; maxX: number; minY: number; maxY: number }

export const GRID_BOXES = { a: new Float32Array(16 * 4), n: 0 };

function put(minX: number, minY: number, maxX: number, maxY: number): void {
  if (maxX < minX || maxY < minY) return;
  if ((GRID_BOXES.n + 1) * 4 > GRID_BOXES.a.length) {
    const grown = new Float32Array(GRID_BOXES.a.length * 2);
    grown.set(GRID_BOXES.a);
    GRID_BOXES.a = grown;
  }
  const o = GRID_BOXES.n * 4;
  GRID_BOXES.a[o] = minX; GRID_BOXES.a[o + 1] = minY; GRID_BOXES.a[o + 2] = maxX; GRID_BOXES.a[o + 3] = maxY;
  GRID_BOXES.n++;
}

export function gridBoxesOf(
  areas: readonly GridArea[], inDesigner: boolean, mapLimit: number, mapLimitY: number,
  bMinX: number, bMinY: number, bMaxX: number, bMaxY: number,
): number {
  GRID_BOXES.n = 0;
  if (inDesigner) {
    if (areas.length > 0) for (let i = 0; i < areas.length; i++) put(areas[i].minX, areas[i].minY, areas[i].maxX, areas[i].maxY);
    else put(-mapLimit, -mapLimitY, mapLimit, mapLimitY);
    return GRID_BOXES.n;
  }
  const ox = areas.length > 0 ? 0 : -mapLimit, oy = areas.length > 0 ? 0 : -mapLimitY;
  put(ox + Math.floor((bMinX - ox) / GRID_SPACING) * GRID_SPACING, oy + Math.floor((bMinY - oy) / GRID_SPACING) * GRID_SPACING,
      ox + Math.ceil((bMaxX - ox) / GRID_SPACING) * GRID_SPACING, oy + Math.ceil((bMaxY - oy) / GRID_SPACING) * GRID_SPACING);
  return GRID_BOXES.n;
}
