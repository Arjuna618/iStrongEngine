import React from 'react';
import type { MapConfig } from '../types';
import { magicMazeOf, MM_BOUNDS, type MagicMazeConfig } from '../game/magicMaze';
import { WALL_RULES } from '../game/wallTypes';
import { SliderRow, ToggleItem, CollapsibleSection } from './shared/mapDesignerControls';
import { Reveal } from './kit/Collapse';
import { Button } from './kit/kit';

const SHOWN_ORDER = [0, 12, 11, 3, 7, 8, 9, 10, 1, 5, 4, 6, 2, 13, 14, 15, 16, 17, 18];

export const MagicMazeSettings: React.FC<{ config: MapConfig; updateConfig: (p: Partial<MapConfig>) => void }> = ({ config, updateConfig }) => {
  const m = magicMazeOf(config);
  const put = (patch: Partial<MagicMazeConfig>) => updateConfig({ magicMaze: { ...m, ...patch } });
  const setType = (t: number, v: number) => { const types = m.types.slice(); types[t] = v; put({ types }); };
  const total = m.types.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  const stillOn = (t: number) => m.still.indexOf(t) >= 0;
  return (
    <div className="space-y-3">
      <SliderRow label="Corner Walls From" value={m.cornerMin} min={MM_BOUNDS.fill[0]} max={MM_BOUNDS.fill[1]} step={1} suffix="%"
        onChange={v => put({ cornerMin: v, cornerMax: Math.max(v, m.cornerMax) })}
        tooltip="How many of the corner spots hold a wall, the least. Each new map rolls a number between this and the next one. The default Magic Maze holds 60 to 97 percent." />
      <SliderRow label="Corner Walls To" value={m.cornerMax} min={MM_BOUNDS.fill[0]} max={MM_BOUNDS.fill[1]} step={1} suffix="%"
        onChange={v => put({ cornerMax: v, cornerMin: Math.min(v, m.cornerMin) })}
        tooltip="How many of the corner spots hold a wall, the most." />
      <SliderRow label="Side Walls" value={m.sideShare} min={MM_BOUNDS.share[0]} max={MM_BOUNDS.share[1]} step={1} suffix="%"
        onChange={v => put({ sideShare: v })}
        tooltip="The side spots between two corners hold a wall this share as often as a corner does. The default: 48 percent. Only side walls move." />
      <SliderRow label="Empty Ring" value={m.ring} min={MM_BOUNDS.ring[0]} max={MM_BOUNDS.ring[1]} step={1} suffix=" cells"
        onChange={v => put({ ring: v })}
        tooltip="Open ground round the maze, in cells. The default: 1. The maze takes the rest of the grid." />
      <SliderRow label="Born Near The Edge" value={m.edge} min={MM_BOUNDS.edge[0]} max={MM_BOUNDS.edge[1]} step={1} suffix=" cells"
        onChange={v => put({ edge: v })}
        tooltip="Tanks, yours and the bots', are born this many cells or fewer from the map's edge. The default: 4. 0: anywhere." />

      <CollapsibleSection nested title="Wall Types">
        <div className="space-y-3">
          {SHOWN_ORDER.map(t => (
            <React.Fragment key={t}><SliderRow label={WALL_RULES[t].name} value={m.types[t]} min={MM_BOUNDS.chance[0]} max={MM_BOUNDS.chance[1]} step={0.5}
              suffix="" display={total > 0 ? `${Math.round(m.types[t] / total * 1000) / 10} %` : '0 %'}
              onChange={v => setType(t, v)}
              tooltip="Its chance next to the others: each wall takes a type at random by these numbers. All at 0: plain walls." /></React.Fragment>
          ))}
          <Button size="sm" variant="secondary" onClick={() => put({ types: magicMazeOf(undefined).types })}>Default Mix</Button>
        </div>
      </CollapsibleSection>

      <CollapsibleSection nested title="Moving Walls">
        <div className="space-y-3">
          <ToggleItem label="Walls Move" checked={m.moving} onChange={v => put({ moving: v })}
            desc="In a match the side walls slide two cells to a free spot now and then, each on its own clock. Corners never move." />
          <Reveal when={m.moving}>
            <div className="space-y-3">
              <SliderRow label="Moves A Minute" value={m.perMinute} min={MM_BOUNDS.perMinute[0]} max={MM_BOUNDS.perMinute[1]} step={0.05}
                onChange={v => put({ perMinute: v })} tooltip="How often each side wall moves, on average. The default: 1.2 a minute per wall." />
              <SliderRow label="Seconds A Move" value={m.slide} min={MM_BOUNDS.slide[0]} max={MM_BOUNDS.slide[1]} step={0.01} suffix=" s"
                onChange={v => put({ slide: v })} tooltip="How long one slide of two cells takes. The default: 1.99 seconds." />
              <SliderRow label="Rest After A Move" value={m.rest} min={MM_BOUNDS.rest[0]} max={MM_BOUNDS.rest[1]} step={0.5} suffix=" s"
                onChange={v => put({ rest: v })} tooltip="How long a wall stays where it arrived before it may move again." />
              {SHOWN_ORDER.filter(t => m.types[t] > 0).map(t => (
                <React.Fragment key={t}><ToggleItem label={`${WALL_RULES[t].name} Moves`} checked={!stillOn(t)}
                  onChange={v => put({ still: v ? m.still.filter(x => x !== t) : [...m.still, t] })}
                  desc="Off: walls of this type stay where the map built them." /></React.Fragment>
              ))}
            </div>
          </Reveal>
        </div>
      </CollapsibleSection>
    </div>
  );
};
