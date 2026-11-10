import React, { useEffect, useRef } from 'react';
import type { DataLoadProgress } from '@/game/DataRegistry';
import { MenuCardHead, MenuCardStage, useMenuCardLayout, usePulseDelay } from './menu/MainMenu';
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

export const LoadingScreen: React.FC<Props> = ({ progress, visible, onRetry, onHidden, restoring }) => {
  const canRetry = progress.phase === 'error' && !!progress.canRetry && !!onRetry;
  const failed = progress.phase === 'error';
  const cardRef = useRef<HTMLDivElement>(null);
  const { zoom, width, wide } = useMenuCardLayout(cardRef);
  const pulse = usePulseDelay();

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
              </>
            )}
          </SwapInPlace>

          <div className="k-mm-foot">
            <Fade when={!failed}><span className="k-mm-fill" style={{ transform: `scaleX(${loadedShare(progress)})` }} aria-hidden="true" /></Fade>
            <p className="k-mm-status" role="status"><SwapInPlace swapKey={!!failed} hold={false} className="k-swap-text">{failed ? '' : statusText(progress, !!restoring)}</SwapInPlace></p>
          </div>
        </div>
      </MenuCardStage>
    </div>
  );
};
