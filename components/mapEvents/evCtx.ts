import { useCallback, useState } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import type { MapEventsDoc, ZoneLike } from '../../game/mapEvents/doc';
import { newEventsDoc } from '../../game/mapEvents/doc';
import type { PlacedZone } from '../../types';
import { ZONES_KEY, type EvCtx } from './fields';

export function useEvCtx(logic: GameLogic, areaId: string): EvCtx & { refresh: () => void } {
  const [, bump] = useState(0);
  const refresh = useCallback(() => bump(n => n + 1), []);
  const commit = useCallback((edit: (doc: MapEventsDoc | undefined) => MapEventsDoc | undefined) => {
    logic.applyEventsZonesEdit(areaId, (doc, zones) => {
      const root = { ...(doc ?? newEventsDoc()), [ZONES_KEY]: zones } as MapEventsDoc;
      const next = edit(root);
      if (next === root || next === undefined) return null;
      const { [ZONES_KEY]: z, ...rest } = next;
      return { doc: rest as MapEventsDoc, zones: (z === zones ? zones : z) as readonly PlacedZone[] };
    });
    bump(n => n + 1);
  }, [logic, areaId]);
  const view = logic.mapEventsView(areaId);
  return { logic, areaId, doc: view?.doc, zones: (view?.zones ?? []) as unknown as readonly ZoneLike[], commit, refresh };
}

let _problemsOf: { logic: GameLogic; mapConfig: unknown; areas: unknown; lib: unknown; map: unknown; out: ReturnType<GameLogic['mapEventsProblems']> } | null = null;
export function problemsOf(logic: GameLogic): ReturnType<GameLogic['mapEventsProblems']> {
  const s = logic.state, c = _problemsOf;
  if (c && c.logic === logic && c.mapConfig === s.mapConfig && c.areas === s.multiAreaConfig.areas && c.lib === s.tankLibrary && c.map === logic.mapState) return c.out;
  const out = logic.mapEventsProblems();
  _problemsOf = { logic, mapConfig: s.mapConfig, areas: s.multiAreaConfig.areas, lib: s.tankLibrary, map: logic.mapState, out };
  return out;
}
