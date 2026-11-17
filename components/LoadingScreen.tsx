import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { uiThemeId, subscribeUiTheme } from '../utils/uiTheme';
import { motionOff } from './kit/presence';
import type { DataLoadProgress } from '@/game/DataRegistry';
import { MenuCardHead, MenuCardStage, MenuFootLinks, useMenuCardLayout, usePulseDelay } from './menu/MainMenu';
import { useClassicIconsReady } from './ui/icons';
import { ThemeSwitch } from './kit/ThemeSwitch';
import { SwapInPlace, Fade } from './kit/Collapse';
import { letPageGo } from '../utils/leaveGuard';

interface Props {
  progress: DataLoadProgress;
  visible: boolean;
  onRetry?: () => void;
  onHidden?: () => void;
  restoring?: boolean;
}

const FADE_MS = 320;

function statusText(progress: DataLoadProgress, restoring: boolean): string {
  if (restoring && progress.phase === 'done') return 'Restoring your work';
  switch (progress.phase) {
    case 'manifest':
      return 'Finding game files';
    case 'loading':
      return progress.total > 0 ? `Loading ${progress.loaded} of ${progress.total} files` : 'Loading game files';
    case 'registering':
      return 'Preparing the game';
    case 'done':
      return 'Loading the main menu';
    default:
      return '';
  }
}

function loadedShare(progress: DataLoadProgress): number {
  if (progress.phase === 'loading') return progress.total > 0 ? Math.min(1, progress.loaded / progress.total) : 0;
  return progress.phase === 'registering' || progress.phase === 'done' ? 1 : 0;
}

const reloadPage = () => (letPageGo(), window.location.reload());

const classicUiNow = () => uiThemeId() === 'classic';

const BAR_GLIDE_MS = 700, BAR_CREEP_MS = 6000;
const BAR_Q: [number, number, number, number] = [0.22, 1, 0.36, 1], BAR_CREEP: [number, number, number, number] = [0.3, 0.6, 0.4, 1];
const bezierCss = (b: number[]) => `cubic-bezier(${b.join(', ')})`;
function bezierAt(b: number[], x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const [x1, y1, x2, y2] = b;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  let t = x;
  for (let k = 0; k < 8; k++) { const fx = ((ax * t + bx) * t + cx) * t - x, d = (3 * ax * t + 2 * bx) * t + cx; if (Math.abs(fx) < 1e-6 || d === 0) break; t -= fx / d; }
  t = Math.max(0, Math.min(1, t));
  return ((ay * t + by) * t + cy) * t;
}
interface BarPlan { start: number; from: number; to: number; creep: number; glideMs: number; creepMs: number }
function barAt(p: BarPlan, now: number): number {
  const e = now - p.start;
  if (e < p.glideMs) return p.from + (p.to - p.from) * bezierAt(BAR_Q, e / p.glideMs);
  if (p.creepMs <= 0) return p.to;
  return p.to + (p.creep - p.to) * bezierAt(BAR_CREEP, Math.min(1, (e - p.glideMs) / p.creepMs));
}
function useBarMotion(ref: React.RefObject<HTMLElement | null>, share: number, kind: 'slide' | 'scale'): void {
  const anim = useRef<Animation | null>(null);
  const plan = useRef<BarPlan | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const at = (p: number) => (kind === 'slide' ? `translateX(${((p - 1) * 100).toFixed(3)}%)` : `scaleX(${p.toFixed(4)})`);
    if (motionOff() || typeof el.animate !== 'function') { anim.current?.cancel(); anim.current = null; plan.current = null; el.style.transform = at(share); return; }
    const now = performance.now();
    const from = Math.max(0, Math.min(1, plan.current ? barAt(plan.current, now) : 0));
    const to = Math.max(from, Math.min(1, share));
    const creep = to >= 1 ? 1 : Math.min(0.985, to + (1 - to) / 3);
    const frames: Keyframe[] = [];
    const glideMs = to > from + 1e-4 ? BAR_GLIDE_MS : 0, creepMs = creep > to + 1e-4 ? BAR_CREEP_MS : 0;
    if (glideMs) frames.push({ transform: at(from), easing: bezierCss(BAR_Q) });
    if (creepMs) frames.push({ transform: at(to), easing: bezierCss(BAR_CREEP) });
    frames.push({ transform: at(creep) });
    if (frames.length < 2) return;
    if (frames.length === 3) frames[1].offset = glideMs / (glideMs + creepMs);
    anim.current?.cancel();
    anim.current = el.animate(frames, { duration: glideMs + creepMs, fill: 'forwards' });
    plan.current = { start: now, from, to, creep, glideMs, creepMs };
  }, [share, kind, ref]);
  useEffect(() => () => { anim.current?.cancel(); anim.current = null; plan.current = null; }, []);
}

const ClassicLoadBar: React.FC<{ share: number; text: string }> = ({ share, text }) => {
  const fillRef = useRef<HTMLSpanElement>(null);
  useBarMotion(fillRef, share, 'slide');
  return (
    <span className="k-mm-lbar" aria-hidden="true">
      <span className="k-mm-lbar-track"><span ref={fillRef} className="k-mm-lbar-fill" /></span>
      <span className="k-mm-lbar-text">{text}</span>
    </span>
  );
};

const ModernLoadFill: React.FC<{ share: number }> = ({ share }) => {
  const ref = useRef<HTMLSpanElement>(null);
  useBarMotion(ref, share, 'scale');
  return <span ref={ref} className="k-mm-fill" aria-hidden="true" />;
};

export const LoadingScreen: React.FC<Props> = ({ progress, visible, onRetry, onHidden, restoring }) => {
  const canRetry = progress.phase === 'error' && !!progress.canRetry && !!onRetry;
  const failed = progress.phase === 'error';
  const cardRef = useRef<HTMLDivElement>(null);
  const { zoom, width, wide } = useMenuCardLayout(cardRef);
  const pulse = usePulseDelay();
  const classic = useSyncExternalStore(subscribeUiTheme, classicUiNow, classicUiNow);
  const iconsReady = useClassicIconsReady();

  useEffect(() => {
    if (visible || !onHidden) return;
    const id = window.setTimeout(onHidden, FADE_MS + 40);
    return () => window.clearTimeout(id);
  }, [visible, onHidden]);

  return (
    <div className={visible ? 'k-mm-loading' : 'k-mm-loading k-mm-loading-off'} inert={!visible || undefined} aria-busy={visible && !failed}>
      <MenuCardStage zoom={zoom}>
        <div ref={cardRef} className={wide ? 'k-mm-card k-mm-card-wide' : 'k-mm-card'} style={{ width, '--k-mm-pulse-at': pulse } as React.CSSProperties}>
          <div className="k-mm-theme"><ThemeSwitch /></div>
          <MenuCardHead />

          <SwapInPlace swapKey={!!failed} hold={false} className="k-mm-actions">
            {failed ? (
              <div className="k-mm-error" role="alert">
                {canRetry ? (
                  <p className="k-mm-error-title">{progress.errorMessage}</p>
                ) : (
                  <>
                    <p className="k-mm-error-title">Could not load the game file list.</p>
                    {progress.errorMessage && <p className="k-mm-error-text">{progress.errorMessage}</p>}
                  </>
                )}
                {canRetry && (
                  <button type="button" onClick={onRetry} className="k-btn k-btn-secondary k-btn-md k-mm-error-btn">
                    Try again
                  </button>
                )}
                {!canRetry && (
                  <button type="button" onClick={reloadPage} className="k-btn k-btn-secondary k-btn-md k-mm-error-btn">
                    Reload
                  </button>
                )}
              </div>
            ) : (
              <>
                <span className="k-mm-skel k-mm-skel-action" aria-hidden="true" />
                <span className="k-mm-skel k-mm-skel-action" aria-hidden="true" />
                <span className="k-mm-skel k-mm-skel-action" aria-hidden="true" />
                {classic && <ClassicLoadBar share={loadedShare(progress)} text={statusText(progress, !!restoring)} />}
              </>
            )}
          </SwapInPlace>

          {classic ? (
            <>
              {iconsReady ? <MenuFootLinks waiting fadeIn /> : <div className="k-mm-foot" />}
              <p className="k-mm-status sr-only" role="status">{failed ? '' : statusText(progress, !!restoring)}</p>
            </>
          ) : (
            <div className="k-mm-foot">
              <Fade when={!failed}><ModernLoadFill share={loadedShare(progress)} /></Fade>
              <p className="k-mm-status" role="status"><SwapInPlace swapKey={!!failed} hold={false} className="k-swap-text">{failed ? '' : statusText(progress, !!restoring)}</SwapInPlace></p>
            </div>
          )}
        </div>
      </MenuCardStage>
    </div>
  );
};
