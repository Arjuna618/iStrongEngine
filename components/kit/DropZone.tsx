import React, { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { dragWatch, type DropZoneReg } from './dragWatch';
import { Upload, EMPTY_LINE } from '../ui/icons';

export const DROP_GRACE_MS = 150;

interface LatchTimers { set(f: () => void, ms: number): number; clear(t: number): void }

export class GraceLatch {
  private shown = false;
  private timer = 0;
  constructor(
    private onChange: (shown: boolean) => void,
    private timers: LatchTimers = { set: (f, ms) => window.setTimeout(f, ms), clear: t => window.clearTimeout(t) },
  ) {}
  set(over: boolean): void {
    if (over) {
      if (this.timer) { this.timers.clear(this.timer); this.timer = 0; }
      if (!this.shown) { this.shown = true; this.onChange(true); }
    } else if (this.shown && !this.timer) {
      this.timer = this.timers.set(() => { this.timer = 0; this.shown = false; this.onChange(false); }, DROP_GRACE_MS);
    }
  }
  dispose(): void { if (this.timer) { this.timers.clear(this.timer); this.timer = 0; } }
}

export function useDropTarget(box: React.RefObject<HTMLElement | null>, enabled: boolean, onDrop: (dt: DataTransfer) => void): boolean {
  const on = useRef({ enabled, onDrop }); on.current = { enabled, onDrop };
  const reg = useMemo<DropZoneReg>(() => ({
    el: () => box.current,
    accepts: () => on.current.enabled,
    onDrop: (dt) => on.current.onDrop(dt),
  }), []);
  useEffect(() => dragWatch.register(reg), [reg]);
  const overNow = useCallback(() => dragWatch.over(reg), [reg]);
  const over = useSyncExternalStore(dragWatch.subscribe, overNow, () => false);
  const [shown, setShown] = useState(false);
  const latch = useMemo(() => new GraceLatch(setShown), []);
  useEffect(() => { latch.set(over); }, [latch, over]);
  useEffect(() => () => latch.dispose(), [latch]);
  return shown;
}

export const DropOverlay: React.FC<{ shown: boolean; label?: string; sub?: string }> = ({ shown, label = 'Release files here', sub }) => (
  <div aria-hidden={!shown} className={`k-dz-overlay${shown ? ' k-dz-on' : ''}`}>
    <div className="k-dz-frame">
      <Upload size={40} strokeWidth={EMPTY_LINE} />
      <div className="k-dz-label">{label}</div>
      {sub && <div className="k-dz-sub">{sub}</div>}
    </div>
  </div>
);

export const DropZone: React.FC<{
  enabled: boolean;
  onDrop: (dt: DataTransfer) => void;
  label?: string;
  sub?: string;
  className?: string;
  style?: React.CSSProperties;
  boxRef?: React.MutableRefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}> = ({ enabled, onDrop, label, sub, className, style, boxRef, children }) => {
  const own = useRef<HTMLDivElement>(null);
  const box = boxRef ?? own;
  const shown = useDropTarget(box, enabled, onDrop);
  return (
    <div ref={box} className={`relative ${className ?? ''}`} style={style}>
      {children}
      <DropOverlay shown={shown} label={label} sub={sub} />
    </div>
  );
};
