import type { GameLogic } from './GameLogic';
import { sanitizeImport } from './ValueClamp';
import { ALL_RARITIES, POLYHEDRA_DEFS, RETIRED_POLYHEDRA, makeUserShapeId, makeUserShapeIdLegacy } from './ShapeRegistry';
import { otherRefusal } from '../utils/otherDraw';
import { shapeLookRefusal } from '../utils/shapeLook';
import { importChanges, recordImportChanges } from '../utils/importChanges';
import { SMALL_FIX } from './smallFixSwitch';
import { tankFileOfOldDriveLaw, convertOldDriveLaw } from './tankFileLaw';
import type {
  DataManifest,
  DataManifestEntry,
  DataPackEntry,
  DataPackList,
  ExportFile,
  LibraryItem,
  CustomProjectileDesign,
  TurretPreset,
  FoodShapeDesign,
  OtherDesign,
  TankConfig,
} from '@/types';

const USER_SHAPE_ID_RE = /^user:[\p{L}\p{N}-]{1,48}$/u;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export const DATA_PACKS: { ON: 0 | 1 } = { ON: 1 };
const _OLD_LOAD: boolean = typeof location !== 'undefined' && /[?&]oldload(?:[=&]|$)/.test(location.search);

export const DATA_PACK_FORMAT = 1;

export const DATA_LOAD_FAILED_TEXT = 'Some game files did not load. Check your connection, then try again.';

export interface PackRecord {
  path: string;
  file: ExportFile;
}

const BASE_URL: string = (() => {
  try { return import.meta.env.BASE_URL; } catch { return '/'; }
})();

function loadMark(name: string): void {
  if (typeof performance !== 'undefined' && typeof performance.mark === 'function') performance.mark(name);
}

export interface DataLoadProgress {
  phase: 'manifest' | 'loading' | 'registering' | 'done' | 'error';
  loaded: number;
  total: number;
  currentFile?: string;
  errorMessage?: string;
  canRetry?: boolean;
}

export type ProgressCallback = (progress: DataLoadProgress) => void;

declare global {
  interface Window {
    showSaveFilePicker?: (options?: {
      suggestedName?: string;
      startIn?: 'downloads' | 'desktop' | 'documents';
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
    showOpenFilePicker?: (options?: {
      startIn?: 'downloads' | 'desktop' | 'documents';
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
      multiple?: boolean;
    }) => Promise<FileSystemFileHandle[]>;
  }
}

export class DataRegistry {
  private loadedFilenames: Set<string> = new Set();
  private loadRunning = false;

  private static readonly BATCH_SIZE = 50;

  static isFileSystemAccessSupported(): boolean {
    return typeof window.showSaveFilePicker === 'function';
  }

  static lastRejectReason: string | null = null;

  static libraryIdFor(file: ExportFile): string {
    if (file.type === 'FoodShape') return 'shape-' + (file.data as FoodShapeDesign).shapeId;
    if (file.type === 'Other') return 'other-' + (file.data as OtherDesign).otherId;
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  static validateImport(json: any, keepLaw: boolean = false): ExportFile | null {
    const before = json && typeof json === 'object' && json.data && typeof json.data === 'object' ? structuredClone(json.data) : null;
    const oldDrive = SMALL_FIX.R564 !== 0 && !keepLaw && tankFileOfOldDriveLaw(json);
    const file = DataRegistry.validateFileType(json);
    if (file && before !== null) recordImportChanges(file, importChanges(before, file.data));
    if (file && oldDrive && file.type === 'Tank') convertOldDriveLaw(file.data as TankConfig);
    return file;
  }

  static validateFileType(json: any): ExportFile | null {
    DataRegistry.lastRejectReason = null;
    if (!json || typeof json !== 'object' || !json.data) return null;

    const data = json.data;
    const claimedType = json.type;

    const isTank = typeof data.tankHP === 'number' && Array.isArray(data.turrets);
    const isTurretPreset = Array.isArray(data.turrets) && typeof data.name === 'string'
      && data.tankSides === undefined && data.tankHP === undefined && !Array.isArray(data.layers)
      && data.visual === undefined;
    const isTurret = Array.isArray(data.layers) && typeof data.baseSize === 'number';
    const isProjectile = data.visual !== undefined && typeof data.motionType === 'string';
    const isMap = typeof data.mazeType === 'number' && typeof data.gridCells === 'number' && typeof data.seed === 'number';
    const isMultiAreaMap = Array.isArray(data.areas) && typeof data.enableMultiArea === 'boolean';
    const isFoodShape = typeof data.shapeId === 'string' && typeof data.sides === 'number'
      && typeof data.rarity === 'string' && typeof data.labyLevel === 'number'
      && data.turrets === undefined && data.visual === undefined && data.tankHP === undefined;

    const isOther = typeof data.otherId === 'string' && data.body !== null && typeof data.body === 'object'
      && data.turrets === undefined && data.tankHP === undefined && data.visual === undefined && data.shapeId === undefined
      && !Array.isArray(data.layers) && data.mazeType === undefined && data.areas === undefined;

    if (data.gameModeFile === 1) {
      const ok = data.config && typeof data.config === 'object' && typeof data.config.mode === 'string' && typeof data.map === 'object' && data.map !== null && typeof data.map.gridCells === 'number';
      if (!ok) { DataRegistry.lastRejectReason = 'This mode file holds no rules or no map.'; return null; }
      if (data.areas !== undefined && !(data.areas && Array.isArray(data.areas.areas) && data.areas.areas.length > 0)) delete data.areas;
      return { version: json.version ?? '1', type: 'GameMode', name: typeof json.name === 'string' ? json.name : 'Game Mode', timestamp: Number(json.timestamp) || 0, data };
    }
    let actualType: 'Tank' | 'TurretPreset' | 'CustomTurret' | 'CustomProjectile' | 'Map' | 'MultiAreaMap' | 'FoodShape' | 'Other' | null = null;
    if (isTank) actualType = 'Tank';
    else if (isOther) {
      const why = otherRefusal(data);
      if (why !== null) { DataRegistry.lastRejectReason = why; return null; }
      actualType = 'Other';
    }
    else if (isFoodShape) {
      if (!ALL_RARITIES.includes(data.rarity)) {
        DataRegistry.lastRejectReason = `This food shape file uses a color mode the engine does not have: ${String(data.rarity)}.`;
        return null;
      }
      if (!Number.isInteger(data.labyLevel) || data.labyLevel < 0 || data.labyLevel > 5) {
        DataRegistry.lastRejectReason = `This food shape file has a nesting level outside 0 to 5: ${String(data.labyLevel)}.`;
        return null;
      }
      if (!USER_SHAPE_ID_RE.test(data.shapeId)) {
        DataRegistry.lastRejectReason = `This food shape file has a shape id the engine cannot use: ${String(data.shapeId)}. A user shape id looks like user:my-shape.`;
        return null;
      }
      if (typeof data.name !== 'string' || data.name.length === 0) {
        DataRegistry.lastRejectReason = 'This food shape file has no name.';
        return null;
      }
      if (typeof data.color !== 'string' || !HEX_COLOR_RE.test(data.color)) {
        DataRegistry.lastRejectReason = `This food shape file has a color that is not a six digit hex code: ${String(data.color)}.`;
        return null;
      }
      if (typeof data.polyhedronType === 'string' && RETIRED_POLYHEDRA.has(data.polyhedronType)) delete data.polyhedronType;
      if (data.polyhedronType !== undefined && data.polyhedronType !== null
          && (typeof data.polyhedronType !== 'string' || !POLYHEDRA_DEFS[data.polyhedronType])) {
        DataRegistry.lastRejectReason = `This food shape file names a polyhedron the engine does not have: ${String(data.polyhedronType)}.`;
        return null;
      }
      const _lookWhy = shapeLookRefusal(data.look);
      if (_lookWhy !== null) { DataRegistry.lastRejectReason = _lookWhy; return null; }
      if (data.shapeId !== makeUserShapeId(data.name) && data.shapeId !== makeUserShapeIdLegacy(data.name)) {
        DataRegistry.lastRejectReason = `This food shape file has an id that does not match its name. For the name "${String(data.name)}" the id should be ${makeUserShapeId(data.name)}.`;
        return null;
      }
      actualType = 'FoodShape';
    }
    else if (isTurretPreset) actualType = 'TurretPreset';
    else if (isTurret) actualType = 'CustomTurret';
    else if (isProjectile) actualType = 'CustomProjectile';
    else if (isMultiAreaMap) actualType = 'MultiAreaMap';
    else if (isMap) actualType = 'Map';
    else return null;
    if (actualType === 'CustomProjectile' && (typeof data.name !== 'string' || data.name.length === 0)
        && typeof json.name === 'string' && json.name.length > 0) {
      data.name = json.name;
    }

    if (claimedType && claimedType !== actualType) {
      console.warn(
        `[DataRegistry] File "${json.name || 'unnamed'}" claims type "${claimedType}" but data matches "${actualType}". Re-categorizing.`
      );
    }

    return sanitizeImport({
      version: json.version || '1.0.0',
      type: actualType,
      name: typeof json.name === 'string' ? json.name : 'Unnamed',
      timestamp: json.timestamp || 0,
      category: typeof json.category === 'string' ? json.category : undefined,
      data,
    });
  }

  async loadFromManifest(logic: GameLogic, onProgress: ProgressCallback): Promise<void> {
    if (this.loadRunning) return;
    this.loadRunning = true;
    try {
      loadMark('data:start');
      if (DATA_PACKS.ON && !_OLD_LOAD) {
        const handled = await this.loadFromPacks(logic, onProgress);
        if (handled) return;
      }
      await this.loadFileByFile(logic, onProgress);
    } finally {
      this.loadRunning = false;
    }
  }

  static PACK_RETRY_WAITS_MS: number[] = [0, 600, 1800];

  static packTap: ((file: string, bytes: ArrayBuffer) => void) | null = null;
  static packListTap: ((list: DataPackList) => void) | null = null;

  private async loadFromPacks(logic: GameLogic, onProgress: ProgressCallback): Promise<boolean> {
    onProgress({ phase: 'manifest', loaded: 0, total: 0 });

    const arrived = new Map<string, PackRecord[]>();
    let total = 0;

    for (let attempt = 0; attempt < DataRegistry.PACK_RETRY_WAITS_MS.length; attempt++) {
      const waitMs = DataRegistry.PACK_RETRY_WAITS_MS[attempt];
      if (waitMs > 0) await new Promise<void>((resolve) => setTimeout(resolve, waitMs));

      const list = await this.fetchPackList();
      if (list === 'none') return false;
      if (!list) continue;
      loadMark('data:list');

      total = list.count;
      let loaded = 0;
      for (const p of list.packs) if (arrived.has(p.file)) loaded += p.files;
      onProgress({ phase: 'loading', loaded, total });

      const came = await Promise.all(
        list.packs.map(async (p) => {
          if (arrived.has(p.file)) return true;
          const records = await this.fetchPack(p);
          if (!records) return false;
          arrived.set(p.file, records);
          loaded += p.files;
          onProgress({ phase: 'loading', loaded, total });
          return true;
        })
      );
      if (!came.every(Boolean)) continue;
      loadMark('data:fetched');

      const byPath = new Map<string, ExportFile>();
      for (const p of list.packs) {
        for (const record of arrived.get(p.file)!) byPath.set(record.path, record.file);
      }
      const validated: PackRecord[] = [];
      for (const path of list.order) {
        const file = byPath.get(path);
        if (!file) continue;
        validated.push({ path, file });
        this.loadedFilenames.add(path);
      }

      onProgress({ phase: 'registering', loaded: total, total });
      this.registerWithGameLogic(logic, validated);
      loadMark('data:registered');

      onProgress({ phase: 'done', loaded: validated.length, total });
      return true;
    }

    onProgress({ phase: 'error', loaded: 0, total, errorMessage: DATA_LOAD_FAILED_TEXT, canRetry: true });
    return true;
  }

  private async fetchPackList(): Promise<DataPackList | 'none' | null> {
    try {
      const res = await fetch(BASE_URL + 'data-packs.json', { cache: 'no-store' });
      if (res.status === 404) return 'none';
      if (!res.ok) return null;
      if ((res.headers.get('content-type') || '').includes('text/html')) return 'none';
      const list = await res.json();
      if (!list || list.format !== DATA_PACK_FORMAT || typeof list.count !== 'number'
        || !Array.isArray(list.packs) || !Array.isArray(list.order)) return null;
      let files = 0;
      for (const p of list.packs) {
        if (!p || typeof p.file !== 'string' || typeof p.files !== 'number') return null;
        files += p.files;
      }
      if (files !== list.count || list.order.length !== list.count) return null;
      DataRegistry.packListTap?.(list as DataPackList);
      return list as DataPackList;
    } catch {
      return null;
    }
  }

  private async fetchPack(entry: DataPackEntry): Promise<PackRecord[] | null> {
    try {
      const res = await fetch(BASE_URL + entry.file);
      if (!res.ok) return null;
      const tap = DataRegistry.packTap;
      if (tap) res.clone().arrayBuffer().then(b => tap(entry.file, b), () => { });
      return DataRegistry.readPack(await res.json(), entry.files);
    } catch {
      return null;
    }
  }

  static readPack(pack: any, expectFiles?: number): PackRecord[] | null {
    if (!pack || pack.format !== DATA_PACK_FORMAT || !Array.isArray(pack.files)) return null;
    if (expectFiles !== undefined && pack.files.length !== expectFiles) return null;
    const out: PackRecord[] = [];
    for (const record of pack.files) {
      if (!record || typeof record.path !== 'string') return null;
      const file = DataRegistry.validateFileType(record.file);
      if (!file) {
        console.warn(`[DataRegistry] File ${record.path} failed type validation, skipping.`);
        continue;
      }
      out.push({ path: record.path, file });
    }
    return out;
  }

  private async loadFileByFile(logic: GameLogic, onProgress: ProgressCallback): Promise<void> {
    onProgress({ phase: 'manifest', loaded: 0, total: 0 });

    let manifest: DataManifest;
    try {
      const res = await fetch(BASE_URL + 'data-manifest.json');
      if (!res.ok) {
        onProgress({ phase: 'done', loaded: 0, total: 0 });
        return;
      }
      manifest = await res.json();
    } catch (err) {
      onProgress({
        phase: 'error',
        loaded: 0,
        total: 0,
        errorMessage: `Failed to load data manifest: ${(err as Error).message}`,
      });
      return;
    }
    loadMark('data:list');

    if (!manifest.files || manifest.files.length === 0) {
      onProgress({ phase: 'done', loaded: 0, total: 0 });
      return;
    }

    const total = manifest.files.length;
    let loaded = 0;

    onProgress({ phase: 'loading', loaded: 0, total });

    const validated: PackRecord[] = [];

    for (let i = 0; i < manifest.files.length; i += DataRegistry.BATCH_SIZE) {
      const batch = manifest.files.slice(i, i + DataRegistry.BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((entry) => this.fetchAndValidate(entry))
      );

      for (const result of results) {
        loaded++;
        if (result.status === 'fulfilled' && result.value) {
          validated.push(result.value);
        }
      }

      onProgress({
        phase: 'loading',
        loaded,
        total,
        currentFile: batch[batch.length - 1]?.name,
      });
    }
    loadMark('data:fetched');

    onProgress({ phase: 'registering', loaded: total, total });
    this.registerWithGameLogic(logic, validated);
    loadMark('data:registered');

    onProgress({ phase: 'done', loaded: validated.length, total });
  }

  private async fetchAndValidate(entry: DataManifestEntry): Promise<PackRecord | null> {
    try {
      const res = await fetch(`${BASE_URL}${entry.path}`);
      if (!res.ok) {
        console.warn(`[DataRegistry] Failed to fetch ${entry.path}: HTTP ${res.status}`);
        return null;
      }
      const json = await res.json();
      const file = DataRegistry.validateFileType(json);
      if (!file) {
        console.warn(`[DataRegistry] File ${entry.path} failed type validation, skipping.`);
        return null;
      }
      this.loadedFilenames.add(entry.path);
      return { path: entry.path, file };
    } catch (err) {
      console.warn(`[DataRegistry] Error loading ${entry.path}:`, (err as Error).message);
      return null;
    }
  }

  private registerWithGameLogic(logic: GameLogic, validated: PackRecord[]) {
    const libraryItems: LibraryItem[] = [];
    const turretPresets: TurretPreset[] = [];
    const projectileDesigns: CustomProjectileDesign[] = [];

    for (const { path, file } of validated) {
      libraryItems.push({
        id: file.type === 'FoodShape'
          ? `shape-${(file.data as FoodShapeDesign).shapeId}`
          : `data-${path}`,
        name: file.name,
        fileData: file,
        loadedAt: Date.now(),
        source: 'data-library',
      });

      if (file.type === 'TurretPreset') {
        turretPresets.push(file.data as TurretPreset);
      } else if (file.type === 'CustomProjectile') {
        projectileDesigns.push(file.data as CustomProjectileDesign);
      }
    }

    logic.addToLibraryBatch(libraryItems);
    logic.addTurretPresetBatch(turretPresets);
    logic.addProjectileDesignBatch(projectileDesigns);
    logic.flushDataLoadComplete();
  }

  async smartExport(fileContent: ExportFile, fileName: string): Promise<'saved' | 'cancelled' | 'unsupported'> {
    if (!window.showSaveFilePicker) return 'unsupported';

    try {
      const handle = await window.showSaveFilePicker!({
        suggestedName: fileName,
        startIn: 'downloads',
        types: [
          {
            description: 'JSON Files',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(JSON.stringify(fileContent, null, 2));
      await writable.close();
      return 'saved';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
      console.error('[DataRegistry] Smart export failed:', err);
      return 'unsupported';
    }
  }

  async smartImport(onProject?: (file: File) => void): Promise<ExportFile | 'cancelled' | 'invalid' | 'routed' | false> {
    if (!window.showOpenFilePicker) return false;
    DataRegistry.lastRejectReason = null;

    try {
      const accept: Record<string, string[]> = { 'application/json': ['.json'] };
      if (onProject) accept['application/octet-stream'] = ['.istrong', '.istrongbackup'];
      const [fileHandle] = await window.showOpenFilePicker!({
        types: [{ description: onProject ? 'iStrongEngine files' : 'JSON Files', accept }],
      });
      const file = await fileHandle.getFile();
      if (onProject && /\.(istrong|istrongbackup)$/i.test(file.name)) { onProject(file); return 'routed'; }
      const text = await file.text();
      const json = JSON.parse(text);
      return DataRegistry.validateImport(json) ?? 'invalid';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
      console.error('[DataRegistry] Smart import failed:', err);
      return 'invalid';
    }
  }
}
