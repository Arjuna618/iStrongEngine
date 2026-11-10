import { generateMap, generateMultiAreaMap } from '../../game/MapSystem';
import type { MapConfig, MultiAreaMapConfig } from '@/types';
import { picDataOf, type PicData } from './mapPicData';

export type PicRequest =
  | { id: number; kind: 'single'; config: MapConfig }
  | { id: number; kind: 'multi'; mac: MultiAreaMapConfig };

export type PicResponse =
  | { id: number; ok: true; kind: 'single'; data: PicData; seedUsed: number }
  | { id: number; ok: true; kind: 'multi'; areas: { id: string; offX: number; offY: number; data: PicData }[] }
  | { id: number; ok: false };

self.onmessage = (e: MessageEvent<PicRequest>) => {
  const req = e.data;
  let res: PicResponse;
  try {
    if (req.kind === 'single') {
      const ms = generateMap(req.config);
      res = { id: req.id, ok: true, kind: 'single', data: picDataOf(ms, req.config), seedUsed: ms.seedUsed };
    } else {
      const r = generateMultiAreaMap(req.mac);
      const areas = [];
      for (const st of r.areaStates) {
        const a = req.mac.areas.find(x => x.id === st.areaId);
        if (a) areas.push({ id: a.id, offX: a.worldOffsetX, offY: a.worldOffsetY, data: picDataOf(st, a.mapConfig) });
      }
      res = { id: req.id, ok: true, kind: 'multi', areas };
    }
  } catch {
    res = { id: req.id, ok: false };
  }
  (self as unknown as Worker).postMessage(res);
};
