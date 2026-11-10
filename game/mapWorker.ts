import { generateMap, generateMultiAreaMap, beginMazeRunLog, takeMazeRunLog, type AreaBounds, type PackedMazeRun } from './MapSystem';
import { ensureRegionFields } from './Navigation';
import type { MapConfig, MapState, MultiAreaMapConfig } from '@/types';

export interface MultiAreaResult {
  areaStates: MapState[];
  unified: MapState;
  areaBounds: AreaBounds[];
}

export type MapWorkerRequest =
  | { kind: 'single'; config: MapConfig; genId: number }
  | { kind: 'multi'; multiConfig: MultiAreaMapConfig; genId: number };

export type MapWorkerResponse =
  | { kind: 'single'; state: MapState; genId: number; runs: PackedMazeRun[] }
  | { kind: 'multi'; result: MultiAreaResult; genId: number; runs: PackedMazeRun[] };

function collectTransferables(state: MapState, set: Set<ArrayBuffer>): void {
  set.add(state.tileGrid.buffer);
  set.add(state.wallGrid.buffer);
  set.add(state.rockGrid.buffer);
  set.add(state.rockBucketStart.buffer);
  set.add(state.rockBucketIdx.buffer);
  if (state.connectedBaseLabel) set.add(state.connectedBaseLabel.buffer);
  const nav = state.navigation;
  if (nav) {
    set.add(nav.flowDirX.buffer);
    set.add(nav.flowDirY.buffer);
    set.add(nav.flowDist.buffer);
    set.add(nav.deadEndDepth.buffer);
    set.add(nav.deadEndExitDirX.buffer);
    set.add(nav.deadEndExitDirY.buffer);
    set.add(nav.regionFlow.buffer);
    set.add(nav.clearance.buffer);
    set.add(nav.navBlocked.buffer);
    set.add(nav.navComponent.buffer);
    set.add(nav.regionSeedIdx.buffer);
    set.add(nav.regionSeedX.buffer);
    set.add(nav.regionSeedY.buffer);
    set.add(nav.regionAxis.buffer);
    set.add(nav.regionAxisStart.buffer);
    set.add(nav.regionAxisEnd.buffer);
  }
}

self.onmessage = (e: MessageEvent<MapWorkerRequest>) => {
  const req = e.data;
  const transferSet = new Set<ArrayBuffer>();

  beginMazeRunLog();
  if (req.kind === 'single') {
    const state = generateMap(req.config);
    const runs = takeMazeRunLog();
    for (let i = 0; i < runs.length; i++) transferSet.add(runs[i].squares.buffer as ArrayBuffer);
    ensureRegionFields(state.navigation, state, 0, 0);
    collectTransferables(state, transferSet);
    const response: MapWorkerResponse = { kind: 'single', state, genId: req.genId, runs };
    (self as unknown as Worker).postMessage(response, Array.from(transferSet));
    return;
  }

  const result = generateMultiAreaMap(req.multiConfig);
  const runs = takeMazeRunLog();
  for (let i = 0; i < runs.length; i++) transferSet.add(runs[i].squares.buffer as ArrayBuffer);
  collectTransferables(result.unified, transferSet);
  for (let i = 0; i < result.areaStates.length; i++) {
    const st = result.areaStates[i];
    const area = req.multiConfig.areas[i];
    if (area && area.id === st.areaId) {
      ensureRegionFields(st.navigation, st, area.worldOffsetX, area.worldOffsetY);
    }
    collectTransferables(st, transferSet);
  }
  const response: MapWorkerResponse = { kind: 'multi', result, genId: req.genId, runs };
  (self as unknown as Worker).postMessage(response, Array.from(transferSet));
};
