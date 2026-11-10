import type { ExportFile } from '../../types';

let _canvasLibrary: (() => void) | null = null;

export const canvasLibraryDoor = {
  set(fn: (() => void) | null): void { _canvasLibrary = fn; },
  open(): boolean { if (!_canvasLibrary) return false; _canvasLibrary(); return true; },
};

export type ExportKind = 'tank' | 'turret-preset' | 'projectile' | 'food-shape';

let _exportKind: ((kind: ExportKind) => void) | null = null;

export const exportKindDoor = {
  set(fn: ((kind: ExportKind) => void) | null): void { _exportKind = fn; },
  open(kind: ExportKind): boolean { if (!_exportKind) return false; _exportKind(kind); return true; },
};

let _mapExport: (() => void) | null = null;

export const mapExportDoor = {
  set(fn: (() => void) | null): void { _mapExport = fn; },
  open(): boolean { if (!_mapExport) return false; _mapExport(); return true; },
};

export function whenToolShown(tool: string, limitMs = 3000): Promise<boolean> {
  return new Promise(resolve => {
    const t0 = performance.now();
    const step = () => {
      const el = document.querySelector<HTMLElement>(`[data-tool-layer="${tool}"]`);
      if (el && el.classList.contains('k-tool-layer-on')) {
        requestAnimationFrame(() => {
          const runs = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
          void Promise.all(runs.map(a => a.finished.catch(() => undefined))).then(() => resolve(true));
        });
        return;
      }
      if (performance.now() - t0 > limitMs) { resolve(false); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

let _mapLoad: ((file: ExportFile) => void) | null = null;

export const mapLoadDoor = {
  set(fn: ((file: ExportFile) => void) | null): void { _mapLoad = fn; },
  load(file: ExportFile): boolean { if (!_mapLoad) return false; _mapLoad(file); return true; },
};
