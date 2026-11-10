export interface AnimTile {
  onScreen: boolean;
  live: { current: boolean } | null;
  draw: () => void;
}

export interface TileLoop {
  add(tile: AnimTile): void;
  remove(tile: AnimTile): void;
  wake(): void;
  readonly size: number;
  readonly running: boolean;
}

export function makeTileLoop(requestFrame: (cb: () => void) => number, cancelFrame: (id: number) => void, beforeFrame: () => void): TileLoop {
  const tiles: AnimTile[] = [];
  let frameId = 0;
  const frame = (): void => {
    frameId = 0;
    let drawn = 0;
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (!t.onScreen || (t.live !== null && !t.live.current)) continue;
      if (drawn === 0) beforeFrame();
      drawn++;
      t.draw();
    }
    if (drawn > 0) frameId = requestFrame(frame);
  };
  const wake = (): void => { if (frameId === 0 && tiles.length > 0) frameId = requestFrame(frame); };
  return {
    add(tile: AnimTile): void { tiles.push(tile); wake(); },
    remove(tile: AnimTile): void {
      const i = tiles.indexOf(tile);
      if (i >= 0) tiles.splice(i, 1);
      if (tiles.length === 0 && frameId !== 0) { cancelFrame(frameId); frameId = 0; }
    },
    wake,
    get size(): number { return tiles.length; },
    get running(): boolean { return frameId !== 0; },
  };
}
