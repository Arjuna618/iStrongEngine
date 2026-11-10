import { isTouchScreen } from './device';

type FsDocument = Document & { webkitFullscreenEnabled?: boolean; webkitFullscreenElement?: Element | null };
type FsElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };

export function fullscreenSupported(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FsDocument;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function isFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const d = document as FsDocument;
  return !!(d.fullscreenElement || d.webkitFullscreenElement);
}

export function subscribeFullscreen(f: () => void): () => void {
  document.addEventListener('fullscreenchange', f);
  document.addEventListener('webkitfullscreenchange', f);
  return () => {
    document.removeEventListener('fullscreenchange', f);
    document.removeEventListener('webkitfullscreenchange', f);
  };
}

function turnSideways(): void {
  try {
    const o = (screen as Screen & { orientation?: ScreenOrientation & { lock?: (o: string) => Promise<void> } }).orientation;
    const q = o && typeof o.lock === 'function' ? o.lock('landscape') : null;
    if (q && typeof q.catch === 'function') q.catch(() => { });
  } catch { }
}

export function enterFullscreen(): Promise<boolean> {
  try {
    const b = document.body as FsElement;
    const p = b.requestFullscreen ? b.requestFullscreen() : b.webkitRequestFullscreen ? b.webkitRequestFullscreen() : null;
    if (p && typeof (p as Promise<void>).then === 'function') return (p as Promise<void>).then(() => { turnSideways(); return true; }, () => false);
    turnSideways();
    return Promise.resolve(true);
  } catch { return Promise.resolve(false); }
}

const NOTICE_OFF_KEY = 'istrong_fullscreen_notice_off';
let _noticeOffThisVisit = false;

export function fullscreenNoticeDue(): boolean {
  if (_noticeOffThisVisit || !isTouchScreen() || !fullscreenSupported() || isFullscreen()) return false;
  try { return localStorage.getItem(NOTICE_OFF_KEY) !== '1'; } catch { return true; }
}

export function fullscreenNoticeOff(): void {
  _noticeOffThisVisit = true;
  try { localStorage.setItem(NOTICE_OFF_KEY, '1'); } catch { }
}
