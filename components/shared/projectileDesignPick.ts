import { designOfName, type DesignOfName } from '../library/catalogCore';

export function isSelectedProjectileDesign(
  selectedName: string | null | undefined,
  design: { name?: string | null },
): boolean {
  return selectedName != null && design.name === selectedName;
}

export function isCarriedDesign(
  selectedName: string | null | undefined,
  carried: unknown,
  design: { name?: string | null },
  library: readonly { id?: string; fileData: { type?: string; data: unknown } }[],
): boolean {
  if (!isSelectedProjectileDesign(selectedName, design)) return false;
  const same: DesignOfName[] = [];
  for (let i = 0; i < library.length; i++) {
    const f = library[i] && library[i].fileData;
    const d = f && (f.type === undefined || f.type === 'CustomProjectile') ? (f.data as { name?: string | null } | null) : null;
    if (d && d.name === design.name) same.push({ kind: 0, data: d, id: library[i].id ?? String(i) });
  }
  if (same.length <= 1) return true;
  const hit = designOfName(same, carried);
  return !!hit && hit.data === design;
}

export function isRepickOfSelectedDesign(
  selectedName: string | null | undefined,
  design: { name?: string | null },
  library: readonly { id?: string; fileData: { type?: string; data: unknown } }[],
  carried?: unknown,
): boolean {
  return isCarriedDesign(selectedName, carried, design, library);
}
