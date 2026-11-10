import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ContentLibraryIcon, Search, SearchX, X, Upload, FolderOpen, Star, Check, ChevronDown, ArrowUpDown, Lock, PanelRightClose, MessageSquareWarning, EMPTY_LINE, SlidersHorizontal } from '../ui/icons';
import type { GameLogic } from '../../game/GameLogic';
import type { TankConfig, CustomProjectileDesign, OtherDesign, TurretPreset } from '../../types';
import { useEscapeOwner } from '../shared/escapeStack';
import { useBackdropClose } from '../shared/useBackdropClose';
import { getMenuScale, usePortalMenuScale, useFitScale, PHONE_EDGE } from '../../utils/useMenuScale';
import { isTouchScreen, isPhoneUi } from '../../utils/device';
import { getEffectiveDPR, getEffectiveViewportHeight, getEffectiveViewportWidth, getZoomCompensation } from '../../utils/zoomCompensation';
import { cmBorderRgb, cmHex, CM, CM_USE, CM_BORDER_BLEND_DARK, CM_BORDER_BLEND_LIGHT } from '../../utils/colorMap';
import { updateAnimatedColors, RARITY_LABELS } from '../../game/ShapeRegistry';
import { useToast } from '../ui/Toast';
import {
  getCatalogSliced, loadBuiltCatalog, runFilter, emptyKindFilter, KIND_GROUPS, LIB_KIND_LABEL, LIB_KIND_ONE, SORT_LABEL,
  type LibCatalog, type LibEntry, type LibKind, type KindFilter, type SortId, type FilterResult,
} from './catalog';
import { LibraryGrid, type GridHost, type GridPassProvider, type GridSection, type LibraryGridHandle } from './LibraryGrid';
import { libraryGL, type LibFrame, type LibPass } from './libraryGL';
import { FrameLoop } from './frameLoop';
import { pictureOf, hasPicture, rgb01, forgetPictures } from './libraryPictures';
import { cardFacts, roundsOf, ROUND_WORD } from './libraryMeta';
import { onKindOpened, type LibMode, type LibAction } from './libraryModes';
import { importFiles, filesOfDrop, filesOfInput, KIND_WORD, type ImportSummary, type PickedFile } from './libraryImport';
import { routeProjectFiles, APP_FILE_ACCEPT } from '../project/projectActions';
import * as store from './libraryStore';
import { FACT } from './catalogCore';
import { useGameDark } from '../../utils/useGameTheme';
import { ThemeSwitch } from '../kit/ThemeSwitch';
import { useSwapFade, useMenuStage, SWAP_OUT_MS, SWAP_IN_MS } from '../kit/motion';
import { useLeave, useHeld, motionOff, scrollGlide, noteMotion } from '../kit/presence';
import { useWindowFrame } from '../kit/focusScope';
import { useLibraryCanvas } from './libraryCanvas';
import { useDropTarget, DropOverlay } from '../kit/DropZone';
import { useDropMenu, DropMenu, menuOpen } from '../kit/DropMenu';
import { useAfterFirstPaint } from '../kit/Deferred';
import { SnapshotSkeleton, useSkeletonCapture } from '../kit/SkeletonSnapshot';
import { PanelFold, IconButton, EmptyState, emptyArt, SearchEnd } from '../kit/kit';
import { SwapText, Reveal, Fade, FOLD_FADE_MS } from '../kit/Collapse';
import { InlineMotion } from '../kit/TagLine';
import { gameGridLine } from '../shared/GameFloor';
import { useDebugRevokeClose } from '../shared/debugRevoke';

interface Props {
  logic: GameLogic;
  mode: LibMode;
  onClose: () => void;
}

const MARGIN = 28;
export function windowSize(): { w: number; h: number } {
  const s = getMenuScale() || 1;
  if (isTouchScreen()) {
    const m = isPhoneUi() ? PHONE_EDGE : MARGIN;
    const z = libTouchZoom();
    const tw = (getEffectiveViewportWidth() - m * 2) / z;
    const th = (getEffectiveViewportHeight() - m * 2) / z;
    return { w: Math.round(Math.max(LIB_TOUCH_MIN_W, Math.min(1500, tw))), h: Math.round(Math.max(LIB_TOUCH_MIN_H, Math.min(960, th))) };
  }
  const w = (getEffectiveViewportWidth() - MARGIN * 2) / s;
  const h = (getEffectiveViewportHeight() - MARGIN * 2) / s;
  return { w: Math.round(Math.max(900, Math.min(1500, w))), h: Math.round(Math.max(560, Math.min(960, h))) };
}
const LIB_NARROW_BELOW = 760;
const LIB_STACK_BELOW = 560;
const LIB_SHORT_BELOW = 460;
const LIB_TOUCH_NEED_H = 380;
export function libTouchZoom(): number {
  const s = getMenuScale() || 1;
  const m = isPhoneUi() ? PHONE_EDGE : MARGIN;
  const room = (getEffectiveViewportHeight() - m * 2) / LIB_TOUCH_NEED_H;
  const roomW = (getEffectiveViewportWidth() - m * 2) / LIB_TOUCH_MIN_W;
  return Math.min(s, Math.max(Math.min(1, s), room), roomW);
}
const LIB_TOUCH_MIN_W = 260;
const LIB_TOUCH_MIN_H = 220;

const TagChip: React.FC<{
  label: string; count: number; on: boolean; onClick: () => void;
}> = React.memo(({ label, count, on, onClick }) => {
  const dim = !on && count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title={on ? 'Click again to deselect' : `Show only ${label.toLowerCase()}`}
      aria-pressed={on}
      className={`k-lib-tag${on ? ' k-lib-tag-on' : ''}${dim ? ' k-dim' : ''}`}
    >
      {on && <Check size={12} strokeWidth={2.5} className="-ml-0.5" />}
      <span>{label}</span>
    </button>
  );
});
TagChip.displayName = 'TagChip';

const FilterShape: React.FC<{ kind: LibKind }> = ({ kind }) => (
  <div className="space-y-5 p-4 k-skel-sweep" aria-hidden>
    {KIND_GROUPS[kind].filter(g => !g.showWith).map(g => (
      <div key={g.id}>
        <div className="flex items-center justify-between h-5">
          <span className="k-subhead"><span className="k-skel-fill rounded inline-block leading-none">{g.label}</span></span>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {g.options.map(op => <span key={op.id} className="k-lib-tag k-skel-fill">{op.label}</span>)}
        </div>
      </div>
    ))}
  </div>
);

interface PanelPicHost {
  setPanel(p: GridPassProvider | null): void;
  panelAlpha(): number;
  rectOf(el: HTMLElement): { x: number; y: number; w: number; h: number };
  loop: FrameLoop;
}

const PanelPicture: React.FC<{ e: LibEntry; dark: boolean; host: PanelPicHost; floor: string; gridLine: string }> = ({ e, dark, host, floor, gridLine }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const eRef = useRef(e); eRef.current = e;
  const bornAt = useRef(0);
  const readyAt = useRef(-1);
  useLayoutEffect(() => { readyRef.current = false; setReady(false); bornAt.current = performance.now(); readyAt.current = -1; host.loop.request(); }, [e.key, dark, host]);
  useEffect(() => {
    const provider: GridPassProvider = {
      fill(pass: LibPass, dev: number, until: number, dk: boolean) {
        const box = boxRef.current;
        if (!box) { pass.count = 0; return false; }
        const r = host.rectOf(box);
        const sc = box.closest('[data-panel-scroll]') as HTMLElement | null;
        const v = sc ? host.rectOf(sc) : r;
        const cl = box.closest('[data-panel-clip]') as HTMLElement | null;
        const c = cl ? host.rectOf(cl) : v;
        const x0 = Math.max(r.x, v.x, c.x), y0 = Math.max(r.y, v.y, c.y);
        const x1 = Math.min(r.x + r.w, v.x + v.w, c.x + c.w), y1 = Math.min(r.y + r.h, v.y + v.h, c.y + c.h);
        if (x1 <= x0 || y1 <= y0) { pass.count = 0; return false; }
        const o = { x: r.x, y: r.y };
        const w = r.w, h = r.h;
        pass.x = x0 * dev; pass.y = y0 * dev; pass.w = (x1 - x0) * dev; pass.h = (y1 - y0) * dev;
        pass.iconPx = Math.min(w, h) * 0.66 * dev;
        const en = eRef.current;
        if (!hasPicture(en, dk) && performance.now() > until) { pass.count = 0; return true; }
        const pic = pictureOf(en, dk);
        if (!readyRef.current) {
          readyRef.current = true; setReady(true);
          const now = performance.now();
          if (now - bornAt.current > 50) readyAt.current = now;
        }
        if (pic.parts.length === 0) { pass.count = 0; return false; }
        let late = 1;
        if (readyAt.current >= 0) {
          late = Math.max(0, Math.min(1, (performance.now() - readyAt.current - 200) / FOLD_FADE_MS));
          if (late >= 1) readyAt.current = -1;
        }
        const a = host.panelAlpha() * late;
        if (a <= 0.001) { pass.count = 0; return false; }
        if (!pass.slots[0]) pass.slots[0] = { pic, x: 0, y: 0, fade: 0 };
        const s = pass.slots[0];
        s.pic = pic; s.x = (o.x + w / 2) * dev; s.y = (o.y + h / 2) * dev; s.fade = 0;
        s.alpha = a < 0.999 ? a : undefined;
        pass.count = 1;
        return late < 1;
      },
    };
    host.setPanel(provider);
    const ro = new ResizeObserver(() => host.loop.request());
    if (boxRef.current) ro.observe(boxRef.current);
    return () => { host.setPanel(null); ro.disconnect(); };
  }, [host]);
  return (
    <div ref={boxRef} className="relative w-full rounded-xl overflow-hidden border border-[var(--alpha-card-border)]" style={{ aspectRatio: '1 / 0.82', backgroundColor: floor,
      backgroundImage: `linear-gradient(${gridLine} 1px, transparent 1px), linear-gradient(90deg, ${gridLine} 1px, transparent 1px)`, backgroundSize: '22px 22px', backgroundPosition: 'center center' }}>
      <div className={`absolute inset-0 skeleton-shimmer transition-opacity duration-200 ${ready ? 'opacity-0 k-skel-still' : 'opacity-100'}`} style={{ borderRadius: 0 }} />
    </div>
  );
};

function factRows(e: LibEntry, logic: GameLogic): [string, string][] {
  const rows: [string, string][] = [];
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? String(Math.round(v * 100) / 100) : '');
  const [, flags, barrels, sides] = e.facts;
  switch (e.kind) {
    case 'tank': case 'sentry': {
      const d = (e.kind === 'sentry' ? e.sentry!.tankConfig : e.item!.fileData.data) as TankConfig;
      if (e.kind === 'sentry') { rows.push(['Health', String(e.sentry!.hp)], ['Experience', String(e.sentry!.xp)]); }
      else {
        if (num(d.tankHP)) rows.push(['Health', num(d.tankHP)]);
        if (num(d.tankBodyDamage)) rows.push(['Body damage', num(d.tankBodyDamage)]);
        if (num(d.tankMovementSpeed)) rows.push(['Speed', num(d.tankMovementSpeed)]);
        if (num(d.tankSize)) rows.push(['Size', num(d.tankSize)]);
      }
      rows.push(['Barrels', String(barrels)]);
      if (d.bodyLayers && d.bodyLayers.length > 0) rows.push(['Body layers', String(d.bodyLayers.length)]);
      rows.push(['Body', sides < 3 ? 'Circle' : `${sides} sides`]);
      if (flags & FACT.SMASHER) rows.push(['Skill', 'Engine Acceleration (Smasher)']);
      break;
    }
    case 'turret': {
      const p = e.item!.fileData.data as TurretPreset;
      rows.push(['Turrets', String(p.turrets?.length ?? 0)], ['Barrels', String(barrels)]);
      if (flags & FACT.AUTO) rows.push(['Type', 'Auto turret']);
      break;
    }
    case 'projectile': {
      const d = e.item!.fileData.data as CustomProjectileDesign;
      rows.push(['It is a', d.visual ? d.visual[0].toUpperCase() + d.visual.slice(1) : 'Bullet']);
      rows.push(['Turrets on it', String(d.turrets?.length ?? 0)]);
      rows.push(['Shape', (d.shape ?? 0) < 3 ? 'Circle' : `${d.shape} sides`]);
      break;
    }
    case 'other': {
      const d = e.item!.fileData.data as OtherDesign;
      rows.push(['Shapes', String(sides)], ['Width', num(d.size)]);
      break;
    }
    case 'shape': {
      const s = e.shape!;
      try {
        const ps = logic.shapeSpawnPreviewStats(s);
        rows.push(['Health', String(Math.round(ps.hp))], ['Experience', String(ps.xpValue)]);
      } catch { }
      rows.push(['Sides', s.isPolyhedron ? 'Solid' : s.sides < 3 ? 'Circle' : String(s.sides)]);
      rows.push(['Rarity', RARITY_LABELS[s.rarity]]);
      if (s.labyLevel > 0) rows.push(['Nested layers', String(s.labyLevel)]);
      if (s.scaleVariant !== 'normal') rows.push(['Size', s.scaleVariant === 'alpha' ? 'Alpha' : 'Beta']);
      if (s.isCrasher) rows.push(['Behaviour', 'Crasher']);
      break;
    }
  }
  return rows;
}

const COLLECTION_WORD = (e: LibEntry): string => {
  const g = KIND_GROUPS[e.kind][0];
  const op = g.options.find(o => o.id === e.collection);
  let w = op ? op.label : '';
  if (e.group && e.group !== e.collection && op && op.label !== e.group && (e.collection === 'bosses' || e.collection === 'mapEntities')) {
    const gg = KIND_GROUPS[e.kind].find(x => x.id === (e.collection === 'bosses' ? 'bossGroup' : 'mapGroup'));
    w += ', ' + (gg?.options.find(o => o.id === e.group)?.label ?? e.group);
  }
  return w;
};

export const ContentLibrary: React.FC<Props> = ({ logic, mode, onClose }) => {
  const dark = useGameDark();
  const { showToast } = useToast();
  const portalScale = usePortalMenuScale();
  const cardRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const close = useCallback((after?: unknown) => {
    if (closingRef.current) return;
    closingRef.current = true;
    const a = document.activeElement;
    if (a instanceof HTMLElement && cardRef.current && cardRef.current.contains(a)) a.blur();
    setClosing(true);
    window.setTimeout(typeof after === 'function' ? (after as () => void) : onClose, CLOSE_MS);
  }, [onClose]);
  const scrimRef = useRef<HTMLDivElement>(null);
  useWindowFrame({ scrim: scrimRef, card: cardRef, closing });
  useDebugRevokeClose(logic, close);
  useLayoutEffect(() => () => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && cardRef.current && cardRef.current.contains(a)) {
      a.blur();
      queueMicrotask(() => document.body.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    }
  }, []);
  const [size, setSize] = useState(windowSize);
  useEffect(() => {
    let raf = 0;
    const on = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; setSize(prev => { const n = windowSize(); return n.w === prev.w && n.h === prev.h ? prev : n; }); }); };
    window.addEventListener('resize', on);
    return () => { window.removeEventListener('resize', on); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const fit = useFitScale(cardRef, portalScale, true);
  const touch = isTouchScreen();
  const stackSearch = touch && size.w < LIB_STACK_BELOW;
  const shortLib = touch && size.h < LIB_SHORT_BELOW;
  const narrowLib = touch && (size.w < LIB_NARROW_BELOW || shortLib);
  const tabsInHead = shortLib && !stackSearch;
  const touchZoom = touch ? libTouchZoom() * (portalScale / (getMenuScale() || 1)) : 1;
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [builtReady, setBuiltReady] = useState(false);
  const [cat, setCat] = useState<LibCatalog | null>(null);
  const [libVersion, setLibVersion] = useState(0);
  useEffect(() => { let live = true; loadBuiltCatalog().then(() => { if (live) setBuiltReady(true); }); return () => { live = false; }; }, []);
  const libSize = logic.state.tankLibrary.length * 1e6 + logic.state.otherLibrary.length * 1e3 + logic.state.projectileDesigns.length;
  const libRev = logic.libraryRev;
  const bodyReady = useAfterFirstPaint();
  useEffect(() => {
    if (!builtReady || !bodyReady) return;
    let live = true;
    getCatalogSliced({ tankLibrary: logic.state.tankLibrary, otherLibrary: logic.state.otherLibrary, projectileDesigns: logic.state.projectileDesigns, rev: logic.libraryRev }).then(c => {
      if (!live) return;
      forgetPictures(c.byKey);
      store.pruneDeadImports(c.byKey);
      setCat(c);
    });
    return () => { live = false; };
  }, [builtReady, bodyReady, libVersion, libSize, libRev, logic]);

  const kinds = mode.kinds;
  const [kind, setKindState] = useState<LibKind>(() => {
    const s = store.storedTab(mode.place);
    const open = (k: LibKind | undefined) => k && kinds.includes(k) && !mode.lockedKinds?.[k];
    if (open(mode.startKind)) return mode.startKind!;
    if (open(s)) return s!;
    return kinds.find(k => !mode.lockedKinds?.[k]) ?? kinds[0];
  });
  const [filters, setFilters] = useState<Partial<Record<LibKind, KindFilter>>>(() => {
    const pf = mode.presetFilter;
    if (!pf) return {};
    const f = emptyKindFilter(pf.kind);
    const gs = KIND_GROUPS[pf.kind];
    for (const [gid, oid] of pf.picks) {
      const gi = gs.findIndex(g => g.id === gid);
      const oi = gi >= 0 ? gs[gi].options.findIndex(op => op.id === oid) : -1;
      if (oi >= 0) f.inc[gi] = (f.inc[gi] | (1 << oi)) >>> 0;
    }
    return { [pf.kind]: f };
  });
  const filterOf = (k: LibKind): KindFilter => filters[k] ?? store.storedFilter(k, KIND_GROUPS[k].length) ?? emptyKindFilter(k);
  const filter = filterOf(kind);
  const [sorts, setSorts] = useState<Partial<Record<LibKind, SortId>>>({});
  const sort: SortId = sorts[kind] ?? store.storedSort(kind) ?? 'best';
  const [query, setQuery] = useState('');
  const dq = useDeferredValue(query);
  const [cardSize, setCardSize] = useState<store.CardSize>(store.storedSize);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [storeV, setStoreV] = useState(store.storeVersion());
  const sortMenu = useDropMenu({ align: 'end', estimatedHeight: 200, estimatedWidth: 184 });
  const importMenu = useDropMenu({ align: 'end', estimatedHeight: 150 });
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const gridRef = useRef<LibraryGridHandle>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const [tabShown, setTabShown] = useState<LibKind>(kind);
  const kindSwap = useSwapFade();
  const setKind = useCallback((k: LibKind) => {
    if (mode.lockedKinds?.[k]) return;
    setTabShown(k);
    kindSwap.run(() => { setKindState(k); store.storeTab(mode.place, k); setSelectedKey(null); setFocusKey(null); onKindOpened(k); });
  }, [mode, kindSwap.run]);
  useEffect(() => { onKindOpened(kind); }, []);

  const setFilter = useCallback((k: LibKind, f: KindFilter) => { setFilters(prev => ({ ...prev, [k]: f })); store.storeFilter(k, f); }, []);
  const toggleTag = (gi: number, bit: number) => {
    const f = filterOf(kind);
    const inc = f.inc.slice();
    inc[gi] = (inc[gi] ^ bit) >>> 0;
    if (gi === 0) {
      KIND_GROUPS[kind].forEach((g, i) => {
        if (!g.showWith) return;
        const oi = KIND_GROUPS[kind][0].options.findIndex(o => o.id === g.showWith);
        const b = oi >= 0 ? (1 << oi) >>> 0 : 0;
        if (!(inc[0] & b)) inc[i] = 0;
      });
    }
    setFilter(kind, { inc });
  };
  const clearTag = (gi: number, bit: number) => {
    const f = filterOf(kind);
    const inc = f.inc.slice();
    inc[gi] = (inc[gi] & ~bit) >>> 0;
    setFilter(kind, { inc });
  };
  const clearAll = () => { setFilter(kind, emptyKindFilter(kind)); setQuery(''); };

  const ctx = useMemo(() => ({ fav: store.favourites(), recent: store.recents(), used: store.usage() }), [storeV]);
  const result: FilterResult | null = useMemo(() => cat ? runFilter(cat.byKind[kind], kind, filter, dq, sort, ctx) : null, [cat, kind, filter, dq, sort, ctx]);
  useEffect(() => {
    if (focusKey === null || !result) return;
    const l = result.list;
    for (let i = 0; i < l.length; i++) if (l[i].key === focusKey) return;
    setFocusKey(null);
  }, [result]);
  const totals = useMemo(() => cat ? runFilter(cat.byKind[kind], kind, emptyKindFilter(kind), '', 'best', ctx).counts : null, [cat, kind, ctx]);
  const anyActive = filter.inc.some(v => v !== 0) || dq.trim() !== '';
  const sections: GridSection[] = useMemo(() => {
    if (!result || !cat) return [];
    if (anyActive) return [{ id: 'all', entries: result.list }];
    const top: GridSection[] = [];
    const cs = mode.chosenSection, isChosen = mode.isChosen;
    if (cs && isChosen) {
      const mine = cat.byKind[kind].filter(e => isChosen(e));
      if (cs.rank) { const rank = cs.rank; mine.sort((a, b) => rank(a) - rank(b)); }
      if (mine.length > 0) top.push({ id: 'chosen', title: cs.title, entries: mine });
    }
    const rec: LibEntry[] = [];
    for (const k of store.recentList()) {
      const e = cat.byKey.get(k);
      if (e && e.kind === kind) rec.push(e);
      if (rec.length >= 8) break;
    }
    if (rec.length > 0) top.push({ id: 'recent', title: 'Recently used', entries: rec });
    if (top.length === 0) return [{ id: 'all', entries: result.list }];
    return [...top, { id: 'all', title: 'All ' + LIB_KIND_LABEL[kind].toLowerCase(), entries: result.list }];
  }, [result, cat, anyActive, kind, storeV, mode]);
  const resetKey = `${kind}|${dq}|${filter.inc.join(',')}|${sort}`;
  const tabCount = (k: LibKind) => cat ? cat.byKind[k].length : 0;
  const chosenSet = useMemo(() => {
    const s = new Set<string>();
    if (mode.isChosen && cat) for (const e of cat.byKind[kind]) if (mode.isChosen(e)) s.add(e.key);
    return s;
  }, [mode, cat, kind]);
  const selected = selectedKey && cat ? cat.byKey.get(selectedKey) ?? null : null;
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [panelOut, setPanelOut] = useState(false);
  const panelWrapRef = useRef<HTMLDivElement>(null);
  const [panelSwap, setPanelSwap] = useState<'idle' | 'out' | 'scroll' | 'in'>('idle');
  const swapRef = useRef<{ phase: 'idle' | 'out' | 'scroll' | 'in'; next: string | null; t0: number; timer: number }>({ phase: 'idle', next: null, t0: 0, timer: 0 });
  const panelAlpha = useCallback((): number => {
    const w = swapRef.current;
    if (w.phase === 'idle') return 1;
    if (w.phase === 'scroll') return 0;
    const t = Math.min(1, Math.max(0, (performance.now() - w.t0) / (w.phase === 'out' ? SWAP_OUT_MS : SWAP_IN_MS)));
    return w.phase === 'out' ? 1 - t : t;
  }, []);
  const stopSwap = useCallback(() => {
    const w = swapRef.current;
    window.clearTimeout(w.timer);
    w.phase = 'idle'; w.next = null;
    setPanelSwap('idle');
  }, []);
  useEffect(() => () => window.clearTimeout(swapRef.current.timer), []);
  useEffect(() => {
    const w = swapRef.current;
    if (selectedKey && shownKey && !panelOut && (selectedKey !== shownKey || w.phase !== 'idle')) {
      w.next = selectedKey;
      if (w.phase !== 'idle') return;
      const reduced = motionOff();
      if (reduced) { setShownKey(selectedKey); return; }
      const fadeIn = () => {
        setShownKey(w.next); w.phase = 'in'; w.t0 = performance.now(); setPanelSwap('in');
        w.timer = window.setTimeout(() => { w.phase = 'idle'; w.next = null; setPanelSwap('idle'); }, SWAP_IN_MS);
      };
      w.phase = 'out'; w.t0 = performance.now(); setPanelSwap('out');
      w.timer = window.setTimeout(() => {
        const sc = panelWrapRef.current?.querySelector('[data-panel-scroll]') as HTMLElement | null;
        if (!sc || sc.scrollTop <= 1) { fadeIn(); return; }
        w.phase = 'scroll'; setPanelSwap('scroll');
        scrollGlide(sc, 0);
        const until = performance.now() + PANEL_SCROLL_MS;
        const wait = () => {
          if (w.phase !== 'scroll') return;
          if (sc.scrollTop <= 1 || performance.now() >= until) fadeIn();
          else w.timer = window.setTimeout(wait, 16);
        };
        w.timer = window.setTimeout(wait, 16);
      }, SWAP_OUT_MS);
      return;
    }
    if (selectedKey) { stopSwap(); setShownKey(selectedKey); setPanelOut(false); return; }
    stopSwap();
    if (!shownKey) return;
    noteMotion(PANEL_MS);
    setPanelOut(true);
    const id = window.setTimeout(() => { setShownKey(null); setPanelOut(false); }, PANEL_MS);
    return () => window.clearTimeout(id);
  }, [selectedKey, panelSwap]);
  const shown = shownKey && cat ? cat.byKey.get(shownKey) ?? null : null;

  const runAction = useCallback((a: LibAction, e: LibEntry) => {
    const closes = a.run(e);
    store.noteUsed(e.key);
    setStoreV(store.storeVersion());
    if (closes === true) close();
  }, [close]);
  const onSelect = useCallback((e: LibEntry) => { setSelectedKey(e.key); setFocusKey(e.key); }, []);
  const onActivate = useCallback((e: LibEntry) => {
    if (mode.lockOf && mode.lockOf(e)) return;
    const a = mode.actionsOf(e)[0];
    if (a) runAction(a, e);
  }, [mode, runAction]);
  const onFav = useCallback((e: LibEntry) => { store.toggleFavourite(e.key); setStoreV(store.storeVersion()); }, []);

  const importQueue = useRef<Promise<void>>(Promise.resolve());
  const importsPending = useRef(0);
  const doImport = useCallback((all: PickedFile[], epochAt?: number): Promise<void> => {
    const at = epochAt ?? logic.projectEpoch;
    const picked = routeProjectFiles(all);
    if (picked.length === 0) return importQueue.current;
    importsPending.current++;
    setImporting(true);
    importQueue.current = importQueue.current.then(async () => {
      try {
        const sum = await importFiles(logic, picked, undefined, at);
        setSummary(sum);
        setLibVersion(v => v + 1);
      } catch (err) {
        console.error('[ContentLibrary] import failed', err);
        showToast('error', 'The import stopped: a file could not be read.');
      } finally { if (--importsPending.current === 0) setImporting(false); }
    });
    return importQueue.current;
  }, [logic, showToast]);

  const bodyRef = useRef<HTMLDivElement>(null);
  const gpuOk = useMemo(() => libraryGL().available, []);
  const loopRef = useRef<FrameLoop | null>(null);
  if (!loopRef.current) loopRef.current = new FrameLoop();
  const loop = loopRef.current;
  const gridP = useRef<GridPassProvider | null>(null);
  const panelP = useRef<GridPassProvider | null>(null);
  const darkRef = useRef(dark); darkRef.current = dark;
  const devRef = useRef(1);
  const host: GridHost & PanelPicHost = useMemo(() => ({
    loop,
    panelAlpha,
    setGrid: (p) => { gridP.current = p; loop.request(); },
    setPanel: (p) => { panelP.current = p; loop.request(); },
    offsetOf: (el: HTMLElement) => {
      const body = bodyRef.current;
      let x = 0, y = 0;
      let n: HTMLElement | null = el;
      while (n && n !== body) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent as HTMLElement | null; }
      return { x, y };
    },
    rectOf: (el: HTMLElement) => {
      const body = bodyRef.current;
      if (!body) return { x: 0, y: 0, w: 0, h: 0 };
      const b = body.getBoundingClientRect(), r = el.getBoundingClientRect();
      const k = body.clientWidth > 0 ? b.width / body.clientWidth : 1;
      return { x: (r.left - b.left) / k, y: (r.top - b.top) / k, w: r.width / k, h: r.height / k };
    },
    occluderLeft: () => {
      const body = bodyRef.current, w = panelWrapRef.current?.firstElementChild as HTMLElement | null;
      if (!body || !w) return null;
      const b = body.getBoundingClientRect(), r = w.getBoundingClientRect();
      const k = body.clientWidth > 0 ? b.width / body.clientWidth : 1;
      return (r.left - b.left) / k;
    },
  }), [loop, panelAlpha]);
  useEffect(() => {
    if (panelSwap === 'idle') { loop.request(); return; }
    let raf = 0;
    const tick = () => { loop.request(); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [panelSwap, loop]);
  useEffect(() => {
    if (!shownKey) return;
    let raf = 0; const end = performance.now() + PANEL_MS + 60;
    const tick = () => { loop.request(); if (performance.now() < end) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [shownKey, panelOut, loop]);
  devRef.current = (fit / (getZoomCompensation() || 1)) * getEffectiveDPR();
  useLibraryCanvas({ bodyRef, ready: bodyReady, loop, devRef, darkRef, gridP, panelP });
  useEffect(() => { loop.request(); }, [dark, fit, loop, sections, selectedKey]);

  useEscapeOwner(close);
  useEscapeOwner(() => setSelectedKey(null), selectedKey !== null && !summary);
  useEscapeOwner(() => setSummary(null), summary !== null);
  const sumStage = useMenuStage<'sum'>(summary ? 'sum' : null);
  const heldSummary = useHeld(summary);
  const onKeyDown = (ev: React.KeyboardEvent) => {
    if (ev.key !== 'Escape') ev.stopPropagation();
    const t = ev.target as HTMLElement;
    const inField = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA';
    if ((ev.key === 'k' && (ev.ctrlKey || ev.metaKey)) || (ev.key === '/' && !inField)) { ev.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return; }
    const g = gridRef.current;
    if (!g) return;
    if (inField && t !== searchRef.current) return;
    if ((t.tagName === 'BUTTON' || t.tagName === 'SELECT' || t.tagName === 'A') && (ev.key === 'Enter' || ev.key === ' ')) return;
    if (inField && ev.key !== 'ArrowDown' && ev.key !== 'Enter') return;
    const move = (dx: number, dy: number) => {
      const cur = focusKey ?? g.firstKey();
      if (!cur) return;
      const next = focusKey ? g.neighbour(cur, dx, dy) : cur;
      if (next) { setFocusKey(next); g.scrollToKey(next); }
    };
    switch (ev.key) {
      case 'ArrowRight': ev.preventDefault(); move(1, 0); break;
      case 'ArrowLeft': ev.preventDefault(); move(-1, 0); break;
      case 'ArrowDown': ev.preventDefault(); if (inField) { (ev.target as HTMLElement).blur(); cardRef.current?.focus(); } move(0, 1); break;
      case 'ArrowUp': ev.preventDefault(); move(0, -1); break;
      case 'PageDown': ev.preventDefault(); g.page(1); break;
      case 'PageUp': ev.preventDefault(); g.page(-1); break;
      case 'Home': if (!inField) { ev.preventDefault(); g.toEdge(false); } break;
      case 'End': if (!inField) { ev.preventDefault(); g.toEdge(true); } break;
      case 'Enter': {
        const k = focusKey ?? (inField && result && result.list[0] ? result.list[0].key : null);
        const e = k && cat ? cat.byKey.get(k) : null;
        if (e) { ev.preventDefault(); onActivate(e); }
        break;
      }
      case ' ': if (!inField && focusKey && cat) { ev.preventDefault(); const e = cat.byKey.get(focusKey); if (e) onSelect(e); } break;
    }
  };

  const sideRef = useRef<HTMLDivElement>(null);
  const filterSkelId = 'lib:filters:' + mode.place + ':' + kind;
  useSkeletonCapture(filterSkelId, sideRef, !!cat && !!result && !!totals);
  const backdrop = useBackdropClose(close);
  const dropShown = useDropTarget(cardRef, !!mode.allowImport && !summary && !closing, (dt) => { const at = logic.projectEpoch; void filesOfDrop(dt).then(f => doImport(f, at)); });
  const floor = cmHex(CM.BACKGROUND, dark, CM_USE.GENERAL);
  const gridLine = useMemo(() => gameGridLine(dark), [dark]);

  const emptyHint = useMemo(() => {
    if (!cat || !result || result.list.length > 0) return null;
    let best: { label: string; n: number; run: () => void } | null = null;
    KIND_GROUPS[kind].forEach((g, gi) => g.options.forEach((op, oi) => {
      const bit = (1 << oi) >>> 0;
      if (!(filter.inc[gi] & bit)) return;
      const f2 = { inc: filter.inc.slice() };
      f2.inc[gi] = (f2.inc[gi] & ~bit) >>> 0;
      const n = runFilter(cat.byKind[kind], kind, f2, dq, 'best', ctx).list.length;
      if (n > 0 && (!best || n > best.n)) best = { label: op.label, n, run: () => clearTag(gi, bit) };
    }));
    return best as { label: string; n: number; run: () => void } | null;
  }, [cat, result, kind, filter, dq, ctx]);

  const groups = KIND_GROUPS[kind];
  const activeChips: { gi: number; bit: number; label: string }[] = [];
  groups.forEach((g, gi) => g.options.forEach((op, oi) => {
    const bit = (1 << oi) >>> 0;
    if (result && !result.visible[gi]) return;
    if (filter.inc[gi] & bit) activeChips.push({ gi, bit, label: op.label });
  }));
  const one = LIB_KIND_ONE[kind];
  const resultN = result ? result.list.length : 0;
  const extraH = mode.extraH ?? 0;

  const searchBlock = (
    <div className="relative flex-1 max-w-[560px] mx-auto">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--k-search-icon)] pointer-events-none" />
      <input
        ref={searchRef}
        type="text"
        value={query}
        autoFocus={!isTouchScreen()}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={e => { if (e.key === 'Escape' && query) { e.preventDefault(); e.stopPropagation(); setQuery(''); } }}
        placeholder={stackSearch ? 'Search' : `Search ${LIB_KIND_LABEL[kind].toLowerCase()}`}
        className={(touch ? 'k-text-in k-search-bar w-full h-9 pl-9 pr-9 rounded-lg' : 'k-text-in k-search-bar w-full h-9 pl-9 pr-16 rounded-lg') + ' text-[13px] bg-[var(--k-search-bg)] border border-[var(--alpha-card-border)] shadow-[var(--shadow-input)] text-[var(--text-primary)] placeholder:text-[var(--k-placeholder)] outline-none'}
      />
      <SearchEnd query={query} onClear={() => { setQuery(''); searchRef.current?.focus(); }} />
    </div>
  );
  const kindTabs = (
    <div className="k-lib-tabs" role="tablist">
      {kinds.map(k => {
        const lockedWhy = mode.lockedKinds?.[k];
        const on = k === tabShown;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} disabled={!!lockedWhy} onClick={() => setKind(k)} title={lockedWhy}
            className={`k-lib-tab${on ? ' k-lib-tab-on' : ''}`}>
            {lockedWhy && <Lock size={12} />}
            {LIB_KIND_LABEL[k]}
            <span className="k-lib-count">{cat ? tabCount(k) : ''}</span>
          </button>
        );
      })}
    </div>
  );
  const sizeToggle = (
    <div className="k-lib-tabs k-lib-tabs-sm" role="radiogroup" aria-label="Card size">
      {(['s', 'm', 'l'] as store.CardSize[]).map(sz => (
        <button key={sz} type="button" role="radio" aria-checked={cardSize === sz} onClick={() => { if (sz !== cardSize) kindSwap.run(() => { setCardSize(sz); store.storeSize(sz); }); }}
          title={sz === 's' ? 'Small cards' : sz === 'm' ? 'Medium cards' : 'Large cards'} aria-label={sz === 's' ? 'Small cards' : sz === 'm' ? 'Medium cards' : 'Large cards'}
          className={`k-ico k-lib-tab k-lib-tab-icon${cardSize === sz ? ' k-lib-tab-on' : ''}`}>
          <span className="k-ico-art grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${sz === 's' ? 3 : sz === 'm' ? 2 : 1}, 1fr)` }}>
            {Array.from({ length: sz === 's' ? 9 : sz === 'm' ? 4 : 1 }, (_, i) => <span key={i} className="block rounded-[1.5px] bg-current" style={{ width: sz === 's' ? 3 : sz === 'm' ? 5 : 11, height: sz === 's' ? 3 : sz === 'm' ? 5 : 11 }} />)}
          </span>
        </button>
      ))}
    </div>
  );

  const card = (
    <div ref={scrimRef} className={`modal-scrim z-[70] animate-fadeIn ${closing ? 'pointer-events-none' : ''}`} {...backdrop}>
      <div style={{ zoom: touch ? touchZoom : fit }} onClick={e => e.stopPropagation()}>
        <div
          ref={cardRef}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          onMouseDown={(ev) => {
            const t = ev.target as HTMLElement;
            if (!t.closest('input,button,textarea,select') && cardRef.current && document.activeElement !== cardRef.current) cardRef.current.focus({ preventScroll: true });
          }}
          className={`modal-card k-lib-window flex flex-col outline-none relative animate-scaleUp${narrowLib ? ' k-lib-narrow' : ''}${stackSearch ? ' k-lib-stack' : ''}${shortLib ? ' k-lib-short' : ''}`}
          style={{ width: size.w, height: size.h }}
          role="dialog"
          aria-label={mode.title}
        >
          <div className={(kinds.length > 1 && !tabsInHead) || stackSearch ? `k-win-head shrink-0 flex items-center gap-4 pl-5 pr-3 ${shortLib ? 'h-[52px]' : 'h-[60px]'}` : `k-win-head shrink-0 flex items-center gap-4 pl-5 pr-3 ${shortLib ? 'h-[52px]' : 'h-[60px]'} border-b border-[var(--alpha-divider)]`}>
            <div className={stackSearch ? 'flex items-center gap-2.5 min-w-0 flex-1' : narrowLib ? 'flex items-center gap-2.5 min-w-0 shrink' : 'flex items-center gap-2.5 min-w-0 w-[280px] shrink-0'}>
              <ContentLibraryIcon size={20} absoluteStrokeWidth className="text-[var(--text-primary)] shrink-0" />
              <h2 className="k-modal-title min-w-0 truncate"><SwapText className="truncate">{mode.title}</SwapText></h2>
            </div>
            {tabsInHead && kinds.length > 1 ? kindTabs : null}
            {stackSearch ? null : searchBlock}
            <div className="flex items-center gap-2 shrink-0">
              {mode.allowImport && (
                <div className="relative">
                  <button type="button" ref={importMenu.triggerRef as React.RefObject<HTMLButtonElement>} onClick={e => importMenu.toggle(e.currentTarget.getBoundingClientRect())}
                    aria-haspopup="menu" aria-expanded={menuOpen(importMenu)} className="k-btn k-btn-secondary k-btn-md" disabled={importing}>
                    <span className="k-btn-icon"><Upload size={14} /></span>
                    <span className="truncate">{importing ? 'Importing' : 'Import'}</span>
                    <span className="k-btn-icon"><ChevronDown size={14} className="text-[var(--text-tertiary)]" /></span>
                  </button>
                  <DropMenu menu={importMenu} className="k-menu">
                        <button type="button" role="menuitem" onClick={() => { importMenu.close(); fileRef.current?.click(); }} className="k-menu-item">
                          <Upload size={14} className="shrink-0" />
                          <span className="k-menu-text"><span className="k-menu-title">Import files</span><span className="k-menu-sub">One or many files</span></span>
                        </button>
                        <button type="button" role="menuitem" onClick={() => { importMenu.close(); folderRef.current?.click(); }} className="k-menu-item">
                          <FolderOpen size={14} className="shrink-0" />
                          <span className="k-menu-text"><span className="k-menu-title">Import a folder</span><span className="k-menu-sub">Every file inside, sub folders too</span></span>
                        </button>
                        <div className="mt-1 pt-2 px-2.5 pb-1 border-t border-[var(--alpha-divider)] text-[11px] leading-[1.45] text-[var(--text-tertiary)]">You can also drop files or a folder on this window.</div>
                  </DropMenu>
                  <input ref={fileRef} type="file" accept={APP_FILE_ACCEPT} multiple className="hidden" onChange={e => { const f = filesOfInput(e.target.files); e.target.value = ''; doImport(f); }} />
                  <input ref={folderRef} type="file" multiple className="hidden" {...({ webkitdirectory: '', directory: '' } as any)} onChange={e => { const f = filesOfInput(e.target.files); e.target.value = ''; doImport(f); }} />
                </div>
              )}
              {stackSearch || shortLib ? null : sizeToggle}
              <ThemeSwitch />
              <IconButton label="Close" onClick={close}><X size={18} /></IconButton>
            </div>
          </div>

          {stackSearch ? (
            <div className={kinds.length > 1 ? 'k-win-head shrink-0 flex items-center gap-2 px-4 pb-3' : 'k-win-head shrink-0 flex items-center gap-2 px-4 pb-3 border-b border-[var(--alpha-divider)]'}>
              {searchBlock}
              {sizeToggle}
            </div>
          ) : null}

          {kinds.length > 1 && !tabsInHead && (
          <div className="k-win-head shrink-0 flex items-center px-5 pb-3 border-b border-[var(--alpha-divider)]">
            {kindTabs}
          </div>
          )}

          <div ref={bodyRef} inert={kindSwap.inert || undefined} className={`relative flex-1 min-h-0 flex ${kindSwap.swapClass}`}>
            {!gpuOk && (
              <div className="absolute inset-0 z-[6] grid place-items-center bg-[var(--k-content)]">
                <EmptyState icon={emptyArt(MessageSquareWarning)} title="GPU Acceleration Unavailable" words />
              </div>
            )}
            {narrowLib && filtersOpen ? <div className="absolute inset-0 z-[7]" onClick={() => setFiltersOpen(false)} /> : null}
            <div ref={sideRef} className={narrowLib
              ? `k-lib-side k-lib-side-sheet${filtersOpen ? ' k-lib-side-sheet-on' : ''} border-r border-[var(--alpha-divider)] overflow-y-auto popup-scrollbar`
              : 'k-lib-side w-[264px] shrink-0 border-r border-[var(--alpha-divider)] overflow-y-auto popup-scrollbar'}
              inert={narrowLib && !filtersOpen ? true : undefined}>
              {narrowLib ? (
                <div className="k-lib-sheet-head">
                  <span className="k-group-title">Filters</span>
                  <button type="button" className="k-btn k-btn-secondary k-btn-md" onClick={() => setFiltersOpen(false)}>Done</button>
                </div>
              ) : null}
              {!cat || !result || !totals ? <SnapshotSkeleton id={filterSkelId} fallback={<FilterShape kind={kind} />} /> : (
                <div className="space-y-5 p-4">
                  {groups.map((g, gi) => {
                    const shown = g.options.map((op, oi) => ({ op, oi })).filter(({ oi }) => g.dynamic || totals[gi][oi] > 0 || (filter.inc[gi] & (1 << oi)));
                    const groupOn = filter.inc[gi] !== 0;
                    return (
                      <Reveal key={g.id} when={result.visible[gi] && shown.length > 0}>
                      <div>
                        <div className="flex items-center justify-between h-5">
                          <span className="k-subhead">{g.label}</span>
                          <Fade when={groupOn}><button type="button" onClick={() => { const f = { inc: filter.inc.slice() }; f.inc[gi] = 0; setFilter(kind, f); }} className="k-btn k-btn-ghost k-lib-btn-xs -mr-2 -my-0.5">Clear</button></Fade>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {shown.map(({ op, oi }) => {
                            const bit = (1 << oi) >>> 0;
                            return <TagChip key={op.id} label={op.label} count={result.counts[gi][oi]} on={(filter.inc[gi] & bit) !== 0} onClick={() => toggleTag(gi, bit)} />;
                          })}
                        </div>
                      </div>
                      </Reveal>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="k-lib-content flex-1 min-w-0 flex flex-col">
              <div className="k-lib-results shrink-0 flex items-center gap-2 px-[18px] min-h-[52px] py-2 border-b border-[var(--alpha-divider)]">
                {narrowLib ? (
                  <button type="button" onClick={() => setFiltersOpen(o => !o)} aria-expanded={filtersOpen} className="k-btn k-btn-secondary k-btn-md shrink-0">
                    <span className="k-btn-icon"><SlidersHorizontal size={13} /></span>
                    <span className="truncate">Filters</span>
                    <Fade when={activeChips.length > 0}>{() => <span className="k-lib-count"><SwapText>{String(activeChips.length)}</SwapText></span>}</Fade>
                  </button>
                ) : null}
                <div className="flex-1 min-w-0 flex flex-wrap items-center gap-y-1.5">
                  {shortLib && mode.status ? <span className="k-lib-status flex flex-wrap items-center gap-x-3 gap-y-0.5 mr-3">{mode.status}</span> : null}
                  <span className={shortLib && kinds.length > 1 ? 'hidden' : 'text-[12px] text-[var(--text-secondary)] tabular-nums mr-2.5'}>
                    <SwapText>{cat ? `${resultN} ${resultN === 1 ? one : LIB_KIND_LABEL[kind].toLowerCase()}` : ''}</SwapText>
                  </span>
                  <InlineMotion items={[
                    ...activeChips.map(c => ({ key: c.gi + ':' + c.bit, node: (
                      <span className="k-lib-chip">
                        <span>{c.label}</span>
                        <button type="button" onClick={() => clearTag(c.gi, c.bit)} className="k-chip-x" aria-label={`Remove ${c.label}`}><X size={11} /></button>
                      </span>
                    ) })),
                    ...((activeChips.length > 0 || query) ? [{ key: 'clear-all', node: <button type="button" onClick={clearAll} className="k-btn k-btn-ghost k-lib-btn-xs">Clear all</button> }] : []),
                  ]} />
                </div>
                {shortLib && !stackSearch ? <div className="shrink-0">{sizeToggle}</div> : null}
                <div className="relative shrink-0">
                  <button type="button" ref={sortMenu.triggerRef as React.RefObject<HTMLButtonElement>} onClick={e => sortMenu.toggle(e.currentTarget.getBoundingClientRect())}
                    aria-haspopup="menu" aria-expanded={menuOpen(sortMenu)} className="k-btn k-btn-secondary k-btn-md">
                    <span className="k-btn-icon"><ArrowUpDown size={13} /></span>
                    <span className="truncate">{SORT_LABEL[sort]}</span>
                    <span className="k-btn-icon"><ChevronDown size={14} className="text-[var(--text-tertiary)]" /></span>
                  </button>
                  <DropMenu menu={sortMenu} className="k-lib-menu w-[184px]">
                      {(Object.keys(SORT_LABEL) as SortId[]).filter(s => kind === 'tank' || s !== 'tier').map(s => (
                        <button key={s} type="button" role="menuitemradio" aria-checked={s === sort} onClick={() => { setSorts(p => ({ ...p, [kind]: s })); store.storeSort(kind, s); sortMenu.close(); }}
                          className={`k-lib-menu-item${s === sort ? ' k-lib-menu-item-on' : ''}`}>
                          {SORT_LABEL[s]} {s === sort && <Check size={14} className="shrink-0 text-[var(--accent)]" />}
                        </button>
                      ))}
                  </DropMenu>
                </div>
              </div>
              <LibraryGrid
                ref={gridRef}
                sections={sections}
                size={cardSize}
                extraH={extraH}
                narrow={narrowLib}
                dark={dark}
                selectedKey={selectedKey}
                focusKey={focusKey}
                chosen={chosenSet}
                lockOf={mode.lockOf}
                favs={ctx.fav}
                onSelect={onSelect}
                onActivate={onActivate}
                onFav={onFav}
                renderExtra={mode.renderExtra}
                resetKey={resetKey}
                pageKey={kind}
                host={host}
                loading={!cat}
                empty={
                  <div className="text-center max-w-[340px]">
                    <span className="flex justify-center text-[var(--text-primary)]">{emptyArt(SearchX)}</span>
                    <div className="sr-only">Nothing matches.{' '}
                      {emptyHint ? <>Remove <span className="font-medium text-[var(--text-secondary)]">{emptyHint.label}</span> to see {emptyHint.n} {emptyHint.n === 1 ? one : LIB_KIND_LABEL[kind].toLowerCase()}.</> : (query ? 'Try another word, or check the spelling.' : `No ${LIB_KIND_LABEL[kind].toLowerCase()} here yet.`)}
                    </div>
                    {emptyHint ? <button type="button" onClick={emptyHint.run} className="k-btn k-btn-secondary k-btn-md mt-4">Remove {emptyHint.label}</button>
                      : (activeChips.length > 0 || query) && <button type="button" onClick={clearAll} className="k-btn k-btn-secondary k-btn-md mt-4">Clear all</button>}
                  </div>
                }
              />
            </div>

            {mode.settingsPanel && (
              <aside className="k-pop-pane w-[300px] shrink-0 border-l border-[var(--alpha-divider)] bg-[var(--layer-1)] overflow-y-auto popup-scrollbar p-4 space-y-3" aria-label={mode.settingsPanel.title}>
                <div className="k-section-head"><span className="k-group-title">{mode.settingsPanel.title}</span></div>
                {mode.settingsPanel.content}
              </aside>
            )}

            {shown && cat && (
              <div ref={panelWrapRef} data-panel-clip className="absolute top-0 bottom-0 z-[4] overflow-hidden pointer-events-none flex justify-end"
                style={narrowLib ? { right: 0, width: '100%' } : { right: mode.settingsPanel ? 300 : 0, width: 356 }}>
                <div className={`k-lib-panel pointer-events-auto flex ${panelOut ? 'k-lib-panel-out' : 'k-lib-panel-in'}`}>
                  <SidePanel key={shown.key} swapClass={panelSwap === 'out' || panelSwap === 'scroll' ? 'k-swap-out' : panelSwap === 'in' ? 'k-swap-in' : ''} e={shown} cat={cat} mode={mode} logic={logic} dark={dark} host={host} floor={floor} gridLine={gridLine}
                    fav={ctx.fav.has(shown.key)} onFav={() => onFav(shown)} onClose={() => setSelectedKey(null)}
                    onPick={(e) => { setSelectedKey(e.key); setFocusKey(e.key); }} run={runAction} />
                </div>
              </div>
            )}
          </div>

          {mode.footer && <div className="k-pop-foot shrink-0 border-t border-[var(--alpha-divider)] bg-[var(--k-content)]"><div className="k-bar bg-[var(--k-foot-bg)]">{typeof mode.footer === 'function' ? mode.footer(close, shortLib && !!mode.status) : mode.footer}</div></div>}

          {mode.allowImport && <DropOverlay shown={dropShown} sub="Every file is checked as one import is checked." />}
          {sumStage.shown && heldSummary && <ImportSummarySheet sum={heldSummary} leaving={sumStage.leaving} onClose={() => setSummary(null)} />}
        </div>
      </div>
    </div>
  );
  return createPortal(<PanelFold on={false}>{card}</PanelFold>, document.body);
};

const CLOSE_MS = 120;
const PANEL_MS = 155;
const PANEL_SCROLL_MS = 320;

const SidePanel: React.FC<{
  e: LibEntry; cat: LibCatalog; mode: LibMode; logic: GameLogic; dark: boolean; host: PanelPicHost; floor: string; gridLine: string;
  fav: boolean; onFav: () => void; onClose: () => void; onPick: (e: LibEntry) => void; run: (a: LibAction, e: LibEntry) => void;
  swapClass?: string;
}> = ({ e, cat, mode, logic, dark, host, floor, gridLine, fav, onFav, onClose, onPick, run, swapClass }) => {
  const acts = mode.actionsOf(e);
  const lock = mode.lockOf ? mode.lockOf(e) : null;
  const rows = factRows(e, logic);
  const fires = roundsOf(e.facts[0]);
  const ups = e.fileKey ? (cat.children.get(e.fileKey) ?? []) : [];
  const froms = e.fileKey ? (cat.parents.get(e.fileKey) ?? []) : [];
  const fired = e.kind === 'projectile' ? (cat.firedBy.get(e.key) ?? []) : [];
  const chip = (k: string) => {
    const en = k.includes(':') ? cat.byKey.get(k) : cat.byFileKey.get(k);
    if (!en) return null;
    return (
      <button key={en.key} type="button" onClick={() => onPick(en)} className="k-lib-tag k-lib-tag-sm">
        <span>{en.name}</span>
      </button>
    );
  };
  return (
    <div className="k-lib-panel-box w-[332px] shrink-0 border-l border-[var(--alpha-divider)] bg-[var(--layer-1)] flex flex-col min-h-0">
      <div className="flex items-center justify-between px-4 h-[52px] shrink-0">
        <span className="k-subhead truncate">{COLLECTION_WORD(e) || LIB_KIND_LABEL[e.kind]}</span>
        <div className="flex items-center">
          <IconButton label={fav ? 'Remove from favourites' : 'Add to favourites'} onClick={onFav}>
            <Star size={16} fill={fav ? 'currentColor' : 'none'} />
          </IconButton>
          <IconButton label="Close the panel" onClick={onClose}><PanelRightClose size={16} /></IconButton>
        </div>
      </div>
      <div data-panel-scroll className={`flex-1 min-h-0 overflow-y-auto popup-scrollbar px-4 pb-4 ${swapClass ?? ''}`} onScroll={() => host.loop.request()}>
        <PanelPicture e={e} dark={dark} host={host} floor={floor} gridLine={gridLine} />
        <div className="mt-4">
          <h3 className="text-[17px] font-medium leading-snug text-[var(--text-primary)] break-words">{e.name}</h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {e.tier > 0 && <span className="k-badge">Tier {e.tier}</span>}
            {e.kind === 'tank' && e.tier === 0 && <span className="k-badge text-[var(--text-tertiary)]">No tier</span>}
            {e.mine && <span className="k-badge">My Content</span>}
            {cardFacts(e).map(t => <span key={t} className="k-badge">{t}</span>)}
          </div>
        </div>
        {lock && (
          <div className="mt-3 k-soft flex items-center gap-2 px-3 py-2.5 text-[12px] leading-relaxed text-[var(--text-secondary)]">
            <Lock size={13} className="shrink-0" /> <span>{lock}</span>
          </div>
        )}
        {acts.length > 0 && (
          <div className="mt-4 flex flex-col gap-2">
            {acts.map((a, i) => (
              <button key={a.id} disabled={!!lock} onClick={() => run(a, e)}
                className={`k-btn k-btn-lg w-full ${i === 0 ? 'k-btn-primary' : 'k-btn-secondary'}`}>
                {a.icon && <span className="k-btn-icon"><a.icon size={15} /></span>}<SwapText className="truncate">{a.label}</SwapText>
              </button>
            ))}
          </div>
        )}
        {mode.renderPanelExtra && <div className="mt-3">{mode.renderPanelExtra(e)}</div>}
        {fires.length > 0 && (
          <div className="mt-5">
            <div className="k-subhead mb-2">{e.kind === 'projectile' ? 'Its turrets fire' : 'Fires'}</div>
            <div className="flex flex-wrap gap-1.5">
              {fires.map(k => (
                <span key={k} className="k-badge text-[var(--text-secondary)]">{ROUND_WORD[k]}</span>
              ))}
            </div>
          </div>
        )}
        {rows.length > 0 && (
          <div className="mt-5 k-info-card divide-y divide-[var(--alpha-divider)] overflow-hidden">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-center justify-between gap-3 px-3 min-h-[34px] py-1.5">
                <span className="text-[12px] text-[var(--text-secondary)]">{k}</span>
                <span className="text-[12px] text-[var(--text-primary)] text-right tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        )}
        {froms.length > 0 && (
          <div className="mt-5">
            <div className="k-subhead mb-2">Upgrades from</div>
            <div className="flex flex-wrap gap-1.5">{froms.map(chip)}</div>
          </div>
        )}
        {ups.length > 0 && (
          <div className="mt-4">
            <div className="k-subhead mb-2">Upgrades to</div>
            <div className="flex flex-wrap gap-1.5">{ups.map(chip)}</div>
          </div>
        )}
        {fired.length > 0 && (
          <div className="mt-5">
            <div className="k-subhead mb-2">Fired by</div>
            <div className="flex flex-wrap gap-1.5">{fired.slice(0, 24).map(chip)}{fired.length > 24 && <span className="text-[11px] text-[var(--text-tertiary)] self-center">and {fired.length - 24} more</span>}</div>
          </div>
        )}
        {e.kind === 'tank' && e.fileKey && <div className="mt-5 text-[11px] text-[var(--text-quaternary)] break-all">File: {e.fileKey}</div>}
      </div>
    </div>
  );
};

const ImportSummarySheet: React.FC<{ sum: ImportSummary; onClose: () => void; leaving: boolean }> = ({ sum, onClose, leaving }) => {
  const coverRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useLeave(coverRef, leaving, 'fade');
  useLeave(sheetRef, leaving, 'pop');
  let addedTotal = 0;
  for (const k of Object.keys(sum.added)) addedTotal += sum.added[k];
  const list = (title: string, items: string[]) => items.length === 0 ? null : (
    <div className="mt-4">
      <div className="k-subhead mb-1.5">{title} ({items.length})</div>
      <div className="max-h-[120px] overflow-y-auto popup-scrollbar rounded-lg border border-[var(--alpha-card-border)] px-3 py-2 text-[12px] leading-relaxed text-[var(--text-secondary)]">
        {items.slice(0, 200).map((s, i) => <div key={i} className="truncate">{s}</div>)}
        {items.length > 200 && <div>and {items.length - 200} more</div>}
      </div>
    </div>
  );
  return (
    <div ref={coverRef} className={`absolute inset-0 z-50 grid place-items-center animate-fadeIn ${leaving ? 'pointer-events-none' : ''}`} style={{ background: 'color-mix(in srgb, var(--k-content) 82%, transparent)' }} onClick={onClose}>
      <div ref={sheetRef} className="w-[480px] max-h-[86%] overflow-y-auto popup-scrollbar rounded-[10px] border border-[var(--alpha-card-border)] bg-[var(--layer-2)] shadow-[var(--k-pop-shadow)] p-5 animate-scaleUp" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="k-modal-title">Import finished</h3>
          <IconButton label="Close" onClick={onClose}><X size={16} /></IconButton>
        </div>
        <div className="mt-2 text-[13px] text-[var(--text-secondary)]">
          {addedTotal === 0 ? 'Nothing new was added.' : `${addedTotal} ${addedTotal === 1 ? 'file was' : 'files were'} added to My Content.`}
        </div>
        {addedTotal > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(sum.added).map(([t, n]) => (
              <span key={t} className="k-badge">{n} {KIND_WORD[t] ?? t}</span>
            ))}
          </div>
        )}
        {list('Replaced (the same id was loaded before)', sum.replaced)}
        {list('Skipped, already loaded', sum.duplicates)}
        {sum.refused.length > 0 && (
          <div className="mt-4">
            <div className="k-subhead mb-1.5">Not imported ({sum.refused.length})</div>
            <div className="max-h-[160px] overflow-y-auto popup-scrollbar rounded-lg border border-[var(--alpha-card-border)] px-3 py-2 space-y-1.5">
              {sum.refused.slice(0, 200).map((r, i) => (
                <div key={i} className="text-[12px] leading-snug"><div className="font-medium text-[var(--text-primary)] truncate">{r.file}</div><div className="text-[var(--text-tertiary)]">{r.why}</div></div>
              ))}
            </div>
          </div>
        )}
        {list('Projectile layers past the limit removed', sum.trimmed)}
        {sum.changed.length > 0 && (
          <div className="mt-4">
            <div className="k-subhead mb-1.5">Changed to fit the game ({sum.changed.length})</div>
            <div className="max-h-[160px] overflow-y-auto popup-scrollbar rounded-lg border border-[var(--alpha-card-border)] px-3 py-2 space-y-1.5">
              {sum.changed.slice(0, 200).map((r, i) => (
                <div key={i} className="text-[12px] leading-snug"><div className="font-medium text-[var(--text-primary)] truncate">{r.file}</div><div className="text-[var(--text-tertiary)]">{r.what}</div></div>
              ))}
            </div>
          </div>
        )}
        {sum.skipped.length > 0 && <div className="mt-4 text-[11px] text-[var(--text-tertiary)]">{sum.skipped.length} {sum.skipped.length === 1 ? 'file was' : 'files were'} not JSON and left alone.</div>}
        <button type="button" onClick={onClose} className="k-btn k-btn-primary k-btn-lg mt-5 w-full">Done</button>
      </div>
    </div>
  );
};
