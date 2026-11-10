import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Play, Megaphone, Discord, GameEngine, LegalTerms, Settings, SourceCode, Github } from '../ui/icons';
import { SOURCE_CODE_ON } from '../source/sourceSwitch';
import { Fade } from '../kit/Collapse';
import { useTermsAgreed, agreeToTerms } from '../legal/termsConsent';
import appLogo from '../ui/media/logo5.webp';
import { AsciiFluidBackground } from './AsciiFluidBackground';
import { menuScenes, menuScenesSupported, menuSceneStatus } from '../menuScene/sceneClient';
import { ThemeSwitch } from '../kit/ThemeSwitch';
import { useMenuScale } from '../../utils/useMenuScale';
import { getEffectiveViewportWidth, getEffectiveViewportHeight } from '../../utils/zoomCompensation';
import { isPhoneDevice, isTouchScreen } from '../../utils/device';
import { MOBILE_UI } from '../../game/mobileSwitch';

const MENU_CARD_W = 400;
const MENU_CARD_MIN_W = 300;
const MENU_SIDE = 16;
const MENU_END = 24;
const MENU_WIDE_W = 640;
const MENU_WIDE_BELOW_H = 560;
const TERMS_FOOT = 20;
const TERMS_GAP = 12;
const PULSE_MS = 1500;

export interface MenuCardLayout {
  zoom: number;
  width: number;
  scale: number;
  wide: boolean;
  barZoom: number;
  room: number;
}

export function useMenuCardLayout(cardRef: React.RefObject<HTMLElement | null>, barH = 0): MenuCardLayout {
  const menuScale = useMenuScale();
  const scale = MOBILE_UI === 0 && isPhoneDevice() ? Math.min(menuScale, 1) : menuScale;
  const [vp, setVp] = useState(() => ({ w: getEffectiveViewportWidth(), h: getEffectiveViewportHeight() }));
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const w = getEffectiveViewportWidth(), h = getEffectiveViewportHeight();
        setVp(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
      });
    };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const [natH, setNatH] = useState(0);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const measure = () => { const h = el.offsetHeight; setNatH(prev => (prev === h ? prev : h)); };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cardRef]);
  const touch = isTouchScreen();
  const wide = touch && vp.w > vp.h && (vp.h - 2 * MENU_END) / scale < MENU_WIDE_BELOW_H;
  const barMemo = useRef({ w: 0, h: 0, bar: 0, z: 0 });
  const width = wide ? MENU_WIDE_W : Math.max(MENU_CARD_MIN_W, Math.min(MENU_CARD_W, (vp.w - 2 * MENU_SIDE) / scale));
  let zoom = Math.min(scale, (vp.w - 2 * MENU_SIDE) / width);
  const bm = barMemo.current;
  if (bm.w !== vp.w || bm.h !== vp.h) { bm.w = vp.w; bm.h = vp.h; bm.bar = 0; bm.z = 0; }
  let room = 0;
  if (touch && barH > 0) {
    if (barH > bm.bar) bm.bar = barH;
    if (natH > 0) zoom = Math.min(zoom, (vp.h - 2 * MENU_END - TERMS_FOOT - TERMS_GAP) / (natH + bm.bar));
    zoom = Math.max(0.1, zoom);
    bm.z = zoom;
    room = bm.bar * zoom + TERMS_FOOT + TERMS_GAP;
  } else {
    if (natH > 0) zoom = Math.min(zoom, (vp.h - 2 * MENU_END) / natH);
    if (touch && bm.z > 0) zoom = Math.min(zoom, bm.z);
    zoom = Math.max(0.1, zoom);
  }
  return { zoom, width, scale, wide, barZoom: zoom, room };
}

export function usePulseDelay(): string {
  const [delay] = useState(() => `-${Math.round(performance.now() % PULSE_MS)}ms`);
  return delay;
}

export function MenuCardStage({ zoom, room = 0, children }: { zoom: number; room?: number; children: React.ReactNode }) {
  return (
    <div className="k-mm-stage" style={room > 0 ? { paddingBottom: room } : undefined}>
      <div className="k-mm-zoom" style={{ zoom }}>{children}</div>
    </div>
  );
}


function MenuLogo() {
  const [shown, setShown] = useState(false);
  const imgRef = useCallback((img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth > 0) setShown(true);
  }, []);
  return (
    <span className="k-mm-logo">
      <img ref={imgRef} src={appLogo} alt="iStrongEngine" draggable={false}
        className={shown ? 'k-mm-logo-img k-mm-logo-on' : 'k-mm-logo-img'} onLoad={() => setShown(true)} />
    </span>
  );
}

export function MenuCardHead() {
  return (
    <div className="k-mm-head">
      <MenuLogo />
      <h1 className="k-mm-word">iStrongEngine</h1>
      <span className="k-mm-tag">Open Early Access</span>
    </div>
  );
}

interface Props {
  onPlay: () => void;
  onEngine: () => void;
  isDark: boolean;
  onOpenUpdates: () => void;
  updatesUnseen: boolean;
  ready: boolean;
  onOpenTerms: () => void;
  onOpenSettings: () => void;
  onOpenSource?: () => void;
}

function TermsBar({ show, onRead, barRef }: { show: boolean; onRead: () => void; barRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div>
      <Fade when={show} className="k-terms-fade">
        <div ref={barRef} className="k-terms-bar" role="region" aria-label="Terms of Use">
          <p className="k-terms-text">iStrongEngine is a free project made for learning. To use it, please read and accept the Terms of Use.</p>
          <div className="k-terms-actions">
            <button type="button" className="k-btn k-btn-secondary k-btn-md" onClick={onRead}>Read the Terms</button>
            <button type="button" className="k-btn k-btn-primary k-btn-md" onClick={agreeToTerms}>I Agree</button>
          </div>
        </div>
      </Fade>
    </div>
  );
}

export const MainMenu: React.FC<Props> = ({ onPlay, onEngine, isDark, onOpenUpdates, updatesUnseen, ready, onOpenTerms, onOpenSettings, onOpenSource }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const agreed = useTermsAgreed();
  const [barH, setBarH] = useState(0);
  const barObs = useRef<ResizeObserver | null>(null);
  const barRef = useCallback((el: HTMLDivElement | null) => {
    barObs.current?.disconnect();
    barObs.current = null;
    if (!el) { setBarH(0); return; }
    const read = () => { const h = el.offsetHeight; setBarH(prev => (prev === h ? prev : h)); };
    read();
    barObs.current = new ResizeObserver(read);
    barObs.current.observe(el);
  }, []);
  useEffect(() => () => barObs.current?.disconnect(), []);
  const { zoom, width, wide, barZoom, room } = useMenuCardLayout(cardRef, ready && !agreed ? barH : 0);
  const pulse = usePulseDelay();
  const scenesOff = useSyncExternalStore(menuSceneStatus.subscribe, menuSceneStatus.get) === 'off';
  const scenes = !scenesOff && menuScenesSupported();
  useEffect(() => {
    if (!scenes) return;
    menuScenes.attach();
    return () => menuScenes.detach();
  }, [scenes]);
  useEffect(() => { menuScenes.setReady(ready); }, [ready]);
  return (
    <div className="k-mm-root fixed inset-0 z-40 bg-[var(--surface-canvas)] select-none" inert={!ready || undefined}>
      {!scenes && <AsciiFluidBackground isDark={isDark} />}

      <MenuCardStage zoom={zoom} room={room}>
        <div ref={cardRef} className={(wide ? 'k-mm-card k-mm-card-wide' : 'k-mm-card') + (ready ? ' k-mm-card-in' : ' k-mm-card-wait')} style={{ width, '--k-mm-pulse-at': pulse } as React.CSSProperties}>
          <div className="k-mm-theme"><ThemeSwitch /></div>
          <MenuCardHead />

          <div className="k-mm-actions">
            <button type="button" className="k-btn k-btn-primary k-mm-action" onClick={onPlay}>
              <Play size={18} fill="currentColor" absoluteStrokeWidth /> Play Game
            </button>
            <button type="button" className="k-btn k-btn-secondary k-mm-action" onClick={onEngine}>
              <GameEngine size={18} absoluteStrokeWidth /> Game Engine
            </button>
            <button type="button" className="k-btn k-btn-secondary k-mm-action" onClick={onOpenSettings}>
              <Settings size={18} absoluteStrokeWidth /> App Settings
            </button>
          </div>

          <div className="k-mm-foot">
            <button type="button" className="k-mm-link k-mm-link-ico" onClick={onOpenUpdates} title="Update Log" aria-label="Update Log">
              <span className="k-mm-link-icon">
                <Megaphone size={16} />
                {updatesUnseen && <span className="k-mm-dot" />}
              </span>
            </button>
            {SOURCE_CODE_ON && onOpenSource && (
              <button type="button" className="k-mm-link k-mm-link-ico" onClick={onOpenSource} title="Source Code" aria-label="Source Code">
                <SourceCode size={16} />
              </button>
            )}
            <a href="https://github.com/Arjuna618/iStrongEngine" target="_blank" rel="noopener noreferrer" title="GitHub" aria-label="GitHub"
              className="k-mm-link k-mm-link-ico">
              <Github size={16} />
            </a>
            <a href="https://discord.gg/HTE9MTsmBm" target="_blank" rel="noopener noreferrer" title="Join our Discord" aria-label="Join our Discord"
              className="k-mm-link k-mm-link-ico">
              <Discord size={16} />
            </a>
            <button type="button" className="k-mm-link k-mm-link-ico" onClick={onOpenTerms} title="Terms of Use" aria-label="Terms of Use">
              <LegalTerms size={16} />
            </button>
          </div>
        </div>
      </MenuCardStage>

      <div className="k-terms-stage">
        <div className="k-terms-zoom" style={{ zoom: barZoom }}>
          <TermsBar show={ready && !agreed} onRead={onOpenTerms} barRef={barRef} />
        </div>
      </div>
    </div>
  );
};
