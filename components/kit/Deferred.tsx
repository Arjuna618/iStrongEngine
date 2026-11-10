import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Skeleton } from './kit';
import { SnapshotSkeleton, useSkeletonCapture } from './SkeletonSnapshot';
import { arriveAfterWait, motionOff } from './presence';

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export function useAfterFirstPaint(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raf = requestAnimationFrame(() => { raf = 0; setReady(true); });
    return () => { if (raf) cancelAnimationFrame(raf); };
  }, []);
  return ready;
}

export function usePresence(show: boolean, outMs = 120): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(show);
  useEffect(() => {
    if (show) { setMounted(true); return; }
    if (outMs <= 0) { setMounted(false); return; }
    const t = window.setTimeout(() => setMounted(false), outMs);
    return () => window.clearTimeout(t);
  }, [show, outMs]);
  return { mounted: show || (mounted && outMs > 0), leaving: !show && mounted && outMs > 0 };
}

export function useFadePresence(show: boolean, ms = 700): { mounted: boolean; style: React.CSSProperties } {
  const [mounted, setMounted] = useState(show);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (show) {
      setMounted(true);
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setOn(true)); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    setOn(false);
    const t = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(t);
  }, [show, ms]);
  const dur = reducedMotion() ? 1 : ms;
  return { mounted: show || mounted, style: { opacity: show && on ? 1 : 0, transition: `opacity ${dur}ms cubic-bezier(0.45, 0, 0.55, 1)`, pointerEvents: show ? undefined : 'none' } };
}

const reducedMotion = motionOff;

export function useArrival(box: React.RefObject<HTMLElement | null>, skel: React.RefObject<HTMLElement | null>, ready: boolean, on = true): boolean {
  const bornAt = useRef(0);
  if (bornAt.current === 0) bornAt.current = performance.now();
  const seen = useRef<boolean | null>(null);
  if (ready && seen.current === null) seen.current = on && performance.now() - bornAt.current > 150;
  const [gone, setGone] = useState(false);
  const waitedH = useRef(0);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !on) return;
    if (!ready) { waitedH.current = el.offsetHeight; return; }
    if (!seen.current) return;
    const cancel = arriveAfterWait(el, skel.current, waitedH.current, () => setGone(true));
    return () => { cancel(); setGone(true); };
  }, [ready, on]);
  return on && (!ready || (!!seen.current && !gone));
}

export function useCameLate(ready: boolean): boolean {
  const bornAt = useRef(0);
  if (bornAt.current === 0) bornAt.current = performance.now();
  const late = useRef<boolean | null>(null);
  if (ready && late.current === null) late.current = performance.now() - bornAt.current > 150;
  return !!late.current;
}

const heights = new Map<string, number>();

interface DeferredProps {
  children: React.ReactNode;
  id?: string;
  estimate?: number;
  skeleton: React.ReactNode;
  className?: string;
  skeletonClassName?: string;
  snapshot?: string;
  style?: React.CSSProperties;
}

export function Deferred({ children, id, estimate = 240, skeleton, className, skeletonClassName, style, snapshot }: DeferredProps) {
  const ready = useAfterFirstPaint();
  const boxRef = useRef<HTMLDivElement>(null);
  const skelRef = useRef<HTMLDivElement>(null);
  const skelOn = useArrival(boxRef, skelRef, ready);
  useLayoutEffect(() => { if (ready && id && boxRef.current) heights.set(id, boxRef.current.scrollHeight); }, [ready, id]);
  const waitH = (id && heights.get(id)) || estimate;
  useSkeletonCapture(snapshot ?? null, boxRef, ready && !skelOn);
  const skelEl = snapshot || ready
    ? <div ref={skelRef} className="k-skel-delay absolute inset-0 overflow-hidden" aria-hidden={ready || undefined}>{snapshot
      ? <SnapshotSkeleton id={snapshot} fallback={<div className={cx('h-full', skeletonClassName)}>{skeleton}</div>} />
      : <div className={cx('h-full', skeletonClassName)}>{skeleton}</div>}</div>
    : <div className={cx('k-skel-delay', skeletonClassName)}>{skeleton}</div>;
  return (
    <div ref={boxRef} className={cx(className, skelOn && (snapshot || ready) && 'relative')} aria-busy={ready ? undefined : true}
      style={ready ? style : { ...style, minHeight: waitH }}>
      {ready && children}
      {skelOn && skelEl}
    </div>
  );
}

export function PanelSkeleton({ cards = 3, rows = 3 }: { cards?: number; rows?: number }) {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: cards }, (_, c) => (
        <div key={c} className="k-skel-card">
          <Skeleton w={`${34 + ((c * 17) % 22)}%`} h={12} r={4} />
          <div className="mt-4 space-y-3.5">
            {Array.from({ length: rows }, (_, r) => (
              <div key={r} className="flex items-center justify-between gap-4">
                <Skeleton w={`${40 + ((c * 7 + r * 13) % 28)}%`} h={10} r={4} />
                <Skeleton w={r % 2 ? 36 : 64} h={r % 2 ? 20 : 24} r={r % 2 ? 10 : 6} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
