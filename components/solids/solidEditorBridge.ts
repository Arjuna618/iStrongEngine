import type { SolidDesign } from '../../types';

export interface SolidEditorSnapshot {
  readonly open: boolean;
  readonly design: SolidDesign | null;
  readonly seq: number;
}
let _snap: SolidEditorSnapshot = Object.freeze({ open: false, design: null, seq: 0 });
const _listeners = new Set<() => void>();
function publish(next: SolidEditorSnapshot): void { _snap = Object.freeze(next); _listeners.forEach((l) => l()); }

export function openSolidEditor(design: SolidDesign | null): void {
  publish({ open: true, design: design ? (JSON.parse(JSON.stringify(design)) as SolidDesign) : null, seq: _snap.seq + 1 });
}
export function closeSolidEditor(): void {
  if (_snap.open) publish({ open: false, design: _snap.design, seq: _snap.seq });
}
export function solidEditorSnapshot(): SolidEditorSnapshot { return _snap; }
export function subscribeSolidEditor(l: () => void): () => void { _listeners.add(l); return () => { _listeners.delete(l); }; }
