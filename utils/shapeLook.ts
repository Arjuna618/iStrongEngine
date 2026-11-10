import type { OtherPart } from '../types';
import { otherDrawList, otherReach, otherBodyRefusal, type OtherDrawList } from './otherDraw';

export interface ShapeLook {
  body: OtherPart;
  list: OtherDrawList;
  reach: number;
  memo: { key: string }[];
  team: boolean;
}

export function shapeLookRefusal(look: unknown): string | null {
  if (look === undefined) return null;
  if (look === null || typeof look !== 'object' || Array.isArray(look)) return 'This food shape file has a look that is no picture.';
  const why = otherBodyRefusal((look as { body?: unknown }).body);
  return why === null ? null : 'This food shape file has a look the engine cannot draw: ' + why;
}

export function makeShapeLook(look: { body: OtherPart } | undefined | null): ShapeLook | null {
  if (look === undefined || look === null || shapeLookRefusal(look) !== null) return null;
  const list = otherDrawList({ _designVersion: 1, otherId: 'other:shape-look', name: 'shape look', size: 2, body: look.body });
  const memo: { key: string }[] = [];
  for (let i = 0; i < list.items.length; i++) memo.push({ key: '' });
  let team = false;
  for (let i = 0; i < list.items.length; i++) if (list.items[i].part.teamColour === true) team = true;
  return { body: look.body, list, reach: otherReach(look.body), memo, team };
}
