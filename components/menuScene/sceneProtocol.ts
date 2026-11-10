import type { DataPackList } from '../../types';

export interface SceneView { vpW: number; vpH: number; dpr: number;
  hole?: { w: number; h: number };
  budget?: number }

export interface ScenePlan {
  key: string; title: string;
  cssW: number; cssH: number; pxW: number; pxH: number;
  cx0: number; cy0: number; cx1: number; cy1: number;
  durMs: number; extMs: number;
  vpW: number; vpH: number;
}

export type ToWorker =
  | { t: 'list'; list: DataPackList }
  | { t: 'pack'; file: string; bytes: ArrayBuffer }
  | { t: 'make'; id: number; view: SceneView; spare: boolean; only?: string; page: string }
  | { t: 'export'; id: number; view: SceneView; only?: string }
  | { t: 'park' };

export type FromWorker =
  | { t: 'ready'; tanks: number }
  | { t: 'scene'; id: number; plan: ScenePlan; light: ImageBitmap; dark: ImageBitmap; makeMs: number }
  | { t: 'exported'; id: number; plan: ScenePlan; light: Blob; dark: Blob; thumbLight: Blob; thumbDark: Blob }
  | { t: 'spareSaved'; id: number }
  | { t: 'failed'; id: number; why: string }
  | { t: 'parked'; list: DataPackList | null; packs: { file: string; bytes: ArrayBuffer }[] };
