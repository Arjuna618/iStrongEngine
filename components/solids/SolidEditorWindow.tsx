import { shortcutKey } from '../../utils/shortcutKey';
import { SMALL_FIX } from '../../game/smallFixSwitch';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import type { SolidDesign } from '../../types';
import { DataRegistry } from '../../game/DataRegistry';
import { Modal } from '../kit/Modal';
import { Button, Dim, NumberField, PickRow, SliderRow, TextField } from '../kit/kit';
import { MotionList, Reveal } from '../kit/Collapse';
import { TEXT_LIMITS } from '../kit/textLimits';
import { Box, Focus, Redo2, Save, Undo2 } from '../ui/icons';
import { toast } from '../ui/Toast';
import { askChoice } from '../project/dialogs';
import { HelpTooltip } from '../shared/HelpTooltip';
import { writeExportFile } from '../exportFile';
import { mapEditorInk, mapEditorMuted } from '../shared/mapEditorOverlay';
import { useModalMaxHeight } from '../../utils/useMenuScale';
import { getCumulativeZoom, getEffectiveDPR } from '../../utils/zoomCompensation';
import { useGameDark, useGameThemeVersion } from '../../utils/useGameTheme';
import { CM, CM_USE, cmHex } from '../../utils/colorMap';
import { darkenColor } from '../../utils/p5Utils';
import { GLIDE_KEEP_PER_60 } from '../../utils/motionArras';
import { SOLID_STROKE_OF_BORDER } from '../../utils/solidArras';
import { SOLID_LIMITS, solidFileNameOf } from '../../utils/solidDesign';
import { closeSolidEditor, solidEditorSnapshot, subscribeSolidEditor } from './solidEditorBridge';
import {
  camFit, camHold, camReset, camStep, camWheel, cornerAt, dragTurn, frameOf, makeCam, makeSolidFrame, makeTurn, moveInView, viewRadius,
  SOLID_VIEW_MIN_REACH, type SolidCam, type SolidFrame, type SolidTurn, type Vec3,
} from './solidView';
import { GAME_SOURCES, STARTER_SOURCES, SOLID_SIZE_MAX, SOLID_SIZE_MIN, SolidEdit, savedSources, startOf, type SolidSource } from './solidEdit';

const WIN_W = 920;
const SIDE_W = 240;
const CHROME_H = 116;
const BODY_MAX = 600;
const BODY_MIN = 380;
const VIEW_PAD = 18;
const VIEW_BORDER = 3;
const HANDLE = 4;
const BEHIND_ALPHA = 0.35;
const RING_ALPHA = 0.8;
const RING_DASH: number[] = [5, 4];
const SOLID_LINE: number[] = [];
const CLICK_PX = 3;
export const SOLID_LIVE = { MS: 90 };
const WHEEL_LINE_PX = 33;

const VIEW_HINT = 'Drag to turn it, drag a corner to move it, the wheel zooms.';
const VIEW_TIP = 'Drag the solid to turn it, or drag a corner to move it. The wheel zooms where the pointer is, and Fit View shows the '
  + 'whole solid again. After every move the faces turn the right way out by themselves. A corner pushed in past the middle of the '
  + 'solid makes a dent, and the faces around that corner can then show inside out.';
const SIZE_TIP = 'How big the solid is: how far its farthest corner reaches from the middle. The dashed circle in the view is size 1, '
  + 'the edge of its body when it is used as a food shape.';

interface Paint { floor: string; fill: string; line: string; ink: string; muted: string }

interface ViewState {
  cv: HTMLCanvasElement | null;
  c: CanvasRenderingContext2D | null;
  ro: ResizeObserver | null;
  turn: SolidTurn;
  frame: SolidFrame;
  cam: SolidCam;
  w: number; h: number;
  rectL: number; rectT: number; rectW: number; rectH: number;
  reachShown: number; reachTarget: number;
  glideAt: number;
  facesSeen: number[][] | null;
  drag: number;
  pointerId: number; downX: number; downY: number; lastX: number; lastY: number; moved: boolean;
  liveDirty: boolean; liveMark: number; liveAt: number;
  corner: number; sx: number; sy: number; sz: number;
  hover: number;
  cursor: string;
  paint: Paint;
  raf: number;
  out: Vec3;
}

function paintView(c: CanvasRenderingContext2D, cv: HTMLCanvasElement, w: number, h: number, ed: SolidEdit, t: SolidTurn, f: SolidFrame, r: number, mx: number, my: number, hover: number, p: Paint): void {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.clearRect(0, 0, cv.width, cv.height);
  c.fillStyle = p.floor;
  c.fillRect(0, 0, cv.width, cv.height);
  if (!(w > 0 && h > 0)) return;
  const kx = cv.width / w, ky = cv.height / h;
  c.setTransform(kx, 0, 0, ky, 0, 0);
  frameOf(t, ed.verts, ed.faces, f);
  const faces = ed.faces, X = f.x, Y = f.y;
  c.beginPath();
  for (let k = 0; k < f.nf; k++) {
    if (f.shown[k] === 0) continue;
    const face = faces[k];
    c.moveTo(mx + X[face[0]] * r, my + Y[face[0]] * r);
    for (let j = 1; j < face.length; j++) c.lineTo(mx + X[face[j]] * r, my + Y[face[j]] * r);
    c.closePath();
  }
  c.fillStyle = p.fill;
  c.fill();
  c.lineJoin = 'round';
  c.lineWidth = VIEW_BORDER * SOLID_STROKE_OF_BORDER;
  c.strokeStyle = p.line;
  c.stroke();
  c.globalAlpha = RING_ALPHA;
  c.lineWidth = 1 / kx;
  c.strokeStyle = p.muted;
  c.setLineDash(RING_DASH);
  c.beginPath();
  c.arc(mx, my, r, 0, Math.PI * 2);
  c.stroke();
  c.setLineDash(SOLID_LINE);
  c.globalAlpha = 1;
  c.lineWidth = 1 / kx;
  c.strokeStyle = p.ink;
  for (let front = 0; front < 2; front++) {
    for (let i = 0; i < f.n; i++) {
      if (f.front[i] !== front) continue;
      c.globalAlpha = front === 0 && i !== hover && i !== ed.pick ? BEHIND_ALPHA : 1;
      const x = mx + X[i] * r, y = my + Y[i] * r;
      c.fillStyle = i === ed.pick ? p.ink : p.floor;
      c.fillRect(x - HANDLE, y - HANDLE, HANDLE * 2, HANDLE * 2);
      c.strokeRect(x - HANDLE, y - HANDLE, HANDLE * 2, HANDLE * 2);
    }
  }
  c.globalAlpha = 1;
}

function makeView(ed: SolidEdit) {
  const vs: ViewState = {
    cv: null, c: null, ro: null, turn: makeTurn(), frame: makeSolidFrame(), cam: makeCam(),
    w: 0, h: 0, rectL: 0, rectT: 0, rectW: 1, rectH: 1,
    reachShown: 1, reachTarget: 1, glideAt: 0, facesSeen: null,
    drag: 0, pointerId: -1, downX: 0, downY: 0, lastX: 0, lastY: 0, moved: false, liveDirty: false, liveMark: 0, liveAt: -Infinity,
    corner: -1, sx: 0, sy: 0, sz: 0, hover: -1, cursor: '',
    paint: { floor: '', fill: '', line: '', ink: '', muted: '' }, raf: 0, out: { x: 0, y: 0, z: 0 },
  };
  const radius = (): number => viewRadius(vs.w, vs.h, vs.reachShown, VIEW_PAD) * vs.cam.zoom;
  const midX = (): number => vs.w / 2 + vs.cam.offX;
  const midY = (): number => vs.h / 2 + vs.cam.offY;
  const toX = (clientX: number): number => (clientX - vs.rectL) * (vs.w / (vs.rectW > 0 ? vs.rectW : 1));
  const toY = (clientY: number): number => (clientY - vs.rectT) * (vs.h / (vs.rectH > 0 ? vs.rectH : 1));
  const readRect = (): void => {
    if (!vs.cv) return;
    const b = vs.cv.getBoundingClientRect();
    vs.rectL = b.left; vs.rectT = b.top; vs.rectW = b.width; vs.rectH = b.height;
  };
  const setCursor = (): void => {
    const cur = vs.drag !== 0 ? 'var(--cur-grabbing)' : vs.hover >= 0 ? 'var(--cur-move)' : 'var(--cur-grab)';
    if (cur !== vs.cursor && vs.cv) { vs.cursor = cur; vs.cv.style.cursor = cur; }
  };
  const frame = (time: number): void => {
    vs.raf = 0;
    if (!vs.cv || !vs.c) return;
    let again = false;
    if (vs.drag !== 2) {
      const dt = vs.glideAt > 0 ? Math.min(0.1, Math.max(0, (time - vs.glideAt) / 1000)) : 1 / 60;
      if (vs.reachShown !== vs.reachTarget) {
        vs.reachShown += (vs.reachTarget - vs.reachShown) * (1 - Math.pow(GLIDE_KEEP_PER_60, 60 * dt));
        if (Math.abs(vs.reachTarget - vs.reachShown) <= 1e-4 * vs.reachTarget) vs.reachShown = vs.reachTarget;
        else again = true;
      }
      if (camStep(vs.cam, dt)) again = true;
    }
    vs.glideAt = again ? time : 0;
    paintView(vs.c, vs.cv, vs.w, vs.h, ed, vs.turn, vs.frame, radius(), midX(), midY(), vs.hover, vs.paint);
    if (vs.liveDirty) {
      if (ed.live !== vs.liveMark) vs.liveDirty = false;
      else if (time - vs.liveAt >= SOLID_LIVE.MS) { vs.liveDirty = false; vs.liveAt = time; ed.touchLive(); }
    }
    if (again || (SMALL_FIX.G953 !== 0 && vs.liveDirty)) schedule();
  };
  const liveMoved = (): void => {
    if (!vs.liveDirty) { vs.liveDirty = true; vs.liveMark = ed.live; }
    schedule();
  };
  const schedule = (): void => {
    if (vs.raf !== 0 || !vs.cv) return;
    vs.raf = requestAnimationFrame(frame);
  };
  const fitTo = (w: number, h: number): void => {
    const cv = vs.cv;
    if (!cv) return;
    if (vs.w > 0 && Math.abs(vs.w - w) <= 4 && Math.abs(vs.h - h) <= 4) return;
    const k = getEffectiveDPR() * (getCumulativeZoom(cv) || 1);
    vs.w = w; vs.h = h;
    cv.width = Math.max(1, Math.round(w * k));
    cv.height = Math.max(1, Math.round(h * k));
    readRect();
    schedule();
  };
  const attach = (el: HTMLCanvasElement | null): void => {
    if (vs.ro) { vs.ro.disconnect(); vs.ro = null; }
    if (vs.raf !== 0) { cancelAnimationFrame(vs.raf); vs.raf = 0; }
    vs.cv = el; vs.c = el ? el.getContext('2d') : null; vs.cursor = '';
    vs.drag = 0; vs.pointerId = -1; vs.hover = -1; vs.glideAt = 0; vs.liveDirty = false;
    if (!el) return;
    vs.w = 0; vs.h = 0;
    fitTo(el.clientWidth, el.clientHeight);
    const ro = new ResizeObserver((es) => { const b = es[0].contentRect; fitTo(b.width, b.height); });
    ro.observe(el);
    vs.ro = ro;
    setCursor();
  };
  const changed = (): void => {
    const target = Math.max(SOLID_VIEW_MIN_REACH, ed.reach());
    if (ed.faces !== vs.facesSeen) {
      if (SMALL_FIX.G992 !== 0 && vs.drag === 2) {
        try { vs.cv?.releasePointerCapture(vs.pointerId); } catch { }
        vs.drag = 0; vs.pointerId = -1; vs.liveDirty = false; setCursor();
      }
      vs.facesSeen = ed.faces; vs.reachShown = target; camReset(vs.cam);
    }
    vs.reachTarget = target;
    schedule();
  };
  const setPaint = (p: Paint): void => { vs.paint = p; schedule(); };
  const redraw = (): void => { schedule(); };
  const fit = (): void => { camFit(vs.cam); schedule(); };

  const down = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (e.button !== 0 || vs.drag !== 0 || !vs.cv) return;
    readRect();
    const px = toX(e.clientX), py = toY(e.clientY);
    frameOf(vs.turn, ed.verts, ed.faces, vs.frame);
    const i = cornerAt(vs.frame, px, py, midX(), midY(), radius());
    vs.pointerId = e.pointerId; vs.downX = vs.lastX = px; vs.downY = vs.lastY = py; vs.moved = false;
    try { vs.cv.setPointerCapture(e.pointerId); } catch { }
    if (i >= 0 && ed.cornerInto(i, vs.out)) {
      camHold(vs.cam);
      vs.drag = 2; vs.corner = i; vs.sx = vs.out.x; vs.sy = vs.out.y; vs.sz = vs.out.z;
      vs.liveAt = -Infinity;
      ed.setPick(i);
    } else vs.drag = 1;
    setCursor();
    schedule();
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!vs.cv) return;
    const px = toX(e.clientX), py = toY(e.clientY);
    if (vs.drag === 0) {
      frameOf(vs.turn, ed.verts, ed.faces, vs.frame);
      const i = cornerAt(vs.frame, px, py, midX(), midY(), radius());
      if (i !== vs.hover) { vs.hover = i; setCursor(); schedule(); }
      return;
    }
    if (e.pointerId !== vs.pointerId) return;
    if (!vs.moved && Math.abs(px - vs.downX) + Math.abs(py - vs.downY) < CLICK_PX) return;
    vs.moved = true;
    if (vs.drag === 1) dragTurn(vs.turn, px - vs.lastX, py - vs.lastY);
    else {
      moveInView(vs.turn, vs.sx, vs.sy, vs.sz, px - vs.downX, py - vs.downY, radius(), vs.out);
      ed.setCorner(vs.corner, vs.out.x, vs.out.y, vs.out.z);
      liveMoved();
    }
    vs.lastX = px; vs.lastY = py;
    schedule();
  };
  const up = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    if (vs.drag === 0 || e.pointerId !== vs.pointerId) return;
    const kind = vs.drag;
    vs.drag = 0; vs.pointerId = -1;
    try { vs.cv?.releasePointerCapture(e.pointerId); } catch { }
    if (kind === 2) {
      const stepped = vs.moved && ed.commitMove(vs.corner, vs.sx, vs.sy, vs.sz, 'drag');
      if (!stepped && vs.liveDirty && ed.live === vs.liveMark) ed.touchLive();
      vs.liveDirty = false;
    }
    else if (!vs.moved) ed.setPick(-1);
    setCursor();
    schedule();
  };
  const wheel = (e: React.WheelEvent<HTMLCanvasElement>): void => {
    if (!vs.cv || vs.drag === 2) return;
    readRect();
    const d = e.deltaMode === 1 ? e.deltaY * WHEEL_LINE_PX : e.deltaMode === 2 ? e.deltaY * vs.h : e.deltaY;
    camWheel(vs.cam, toX(e.clientX) - vs.w / 2, toY(e.clientY) - vs.h / 2, d);
    schedule();
  };
  const enter = (): void => { readRect(); };
  const leave = (): void => { if (vs.drag === 0 && vs.hover !== -1) { vs.hover = -1; setCursor(); schedule(); } };
  return { vs, attach, changed, setPaint, redraw, liveMoved, fit, down, move, up, wheel, enter, leave };
}
type SolidView = ReturnType<typeof makeView>;

export const SolidEditorWindow: React.FC<{ logic: GameLogic | null }> = React.memo(function SolidEditorWindow({ logic }) {
  const snap = useSyncExternalStore(subscribeSolidEditor, solidEditorSnapshot, solidEditorSnapshot);
  if (!snap.open || !logic) return null;
  return <SolidEditor key={snap.seq} logic={logic} design={snap.design} />;
});

function factsOf(d: SolidDesign): { key: string; text: string }[] {
  const n = (d.verts.length / 3) | 0, m = d.faces.length;
  return [{ key: 'corners', text: n === 1 ? '1 corner' : `${n} corners` }, { key: 'faces', text: m === 1 ? '1 face' : `${m} faces` }];
}

const SolidList: React.FC<{ ed: SolidEdit; saved: readonly SolidSource[] }> = React.memo(function SolidList({ ed, saved }) {
  useSyncExternalStore(ed.subscribe, ed.getRev, ed.getRev);
  const row = (s: SolidSource) => (
    <PickRow key={s.key} title={s.design.name} facts={factsOf(s.design)} selected={ed.key === s.key} onPick={() => { ed.load(s); }} />
  );
  return (
    <aside className="k-lib-side shrink-0 border-r border-[var(--alpha-divider)] overflow-y-auto popup-scrollbar p-4 space-y-3" style={{ width: SIDE_W }}>
      <span className="k-subhead">Starters</span>
      <div className="k-stack">{STARTER_SOURCES.map(row)}</div>
      <span className="k-subhead">Game Solids</span>
      <div className="k-stack">{GAME_SOURCES.map(row)}</div>
      <Reveal when={saved.length > 0}>
        <div className="space-y-3">
          <span className="k-subhead">Saved</span>
          <MotionList gap={8}>{saved.map(row)}</MotionList>
        </div>
      </Reveal>
    </aside>
  );
});

const _box: Vec3 = { x: 0, y: 0, z: 0 };
const AXES = ['x', 'y', 'z'] as const;
const shown3 = (v: number): number => Math.round(v * 1000) / 1000;
const AXIS_TIPS = [
  'Where the picked corner stands along the solid\'s X axis, from minus 4 to 4, where 0 is the middle.',
  'Where the picked corner stands along the solid\'s Y axis, from minus 4 to 4, where 0 is the middle.',
  'Where the picked corner stands along the solid\'s Z axis, from minus 4 to 4, where 0 is the middle.',
] as const;

const CornerBoxes: React.FC<{ ed: SolidEdit }> = React.memo(function CornerBoxes({ ed }) {
  useSyncExternalStore(ed.subscribe, ed.getLive, ed.getLive);
  const has = ed.cornerInto(ed.pick, _box);
  const values = [_box.x, _box.y, _box.z];
  const typed = (axis: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    const i = ed.pick;
    if (!Number.isFinite(v) || !ed.cornerInto(i, _box)) return;
    const fx = _box.x, fy = _box.y, fz = _box.z;
    ed.setCorner(i, axis === 0 ? v : fx, axis === 1 ? v : fy, axis === 2 ? v : fz);
    ed.commitMove(i, fx, fy, fz, AXES[axis]);
  };
  return (
    <Dim when={!has} why="Click a corner of the solid to pick it.">
      <div className="grid grid-cols-3 gap-3" onBlur={() => ed.seal()}>
        {AXES.map((a, k) => (
          <NumberField key={a} id={`solid-corner-${a}`} label={a.toUpperCase()} help={AXIS_TIPS[k]} value={has ? shown3(values[k]) : ''} onChange={typed(k)}
            min={-SOLID_LIMITS.coord} max={SOLID_LIMITS.coord} step={0.1} disabled={!has} />
        ))}
      </div>
    </Dim>
  );
});

const SizeRow: React.FC<{ ed: SolidEdit; view: SolidView }> = React.memo(function SizeRow({ ed, view }) {
  useSyncExternalStore(ed.subscribe, ed.getRev, ed.getRev);
  const drag = useRef<number | null>(null);
  const size = drag.current ?? ed.reach();
  const onLive = (v: number | null): void => {
    if (v === null) {
      if (drag.current !== null) { drag.current = null; ed.endResize(); view.redraw(); }
      return;
    }
    if (drag.current === null) drag.current = ed.reach();
    ed.resize(v, 'drag', true);
    view.liveMoved();
  };
  const onChange = (v: number): void => {
    const wasDrag = drag.current !== null;
    drag.current = null;
    ed.resize(v, wasDrag ? 'drag' : 'size', false);
  };
  return (
    <div onBlur={() => ed.seal()}>
      <SliderRow label="Size" help={SIZE_TIP} value={size} min={SOLID_SIZE_MIN} max={SOLID_SIZE_MAX} step={0.01} deferred
        onLive={onLive} onChange={onChange} format={(v) => v.toFixed(2)} />
    </div>
  );
});

function typesText(t: HTMLElement): boolean {
  if (t.tagName === 'TEXTAREA' || t.isContentEditable === true) return true;
  if (t.tagName !== 'INPUT') return false;
  const type = (t as HTMLInputElement).type;
  return type !== 'range' && type !== 'checkbox' && type !== 'radio';
}

const SolidEditor: React.FC<{ logic: GameLogic; design: SolidDesign | null }> = ({ logic, design }) => {
  const [start] = useState(() => startOf(design, logic.state.solidLibrary));
  const [ed] = useState(() => new SolidEdit(start.source.design, start.source.key));
  const [view] = useState(() => makeView(ed));
  const rev = useSyncExternalStore(ed.subscribe, ed.getRev, ed.getRev);
  useEffect(() => { if (start.bad) toast('error', 'That solid could not be read, so a starter is open instead.'); }, [start]);

  const dark = useGameDark();
  const themeV = useGameThemeVersion();
  const paint = useMemo<Paint>(() => {
    const fill = cmHex(CM.EGGS, dark, CM_USE.SHAPE);
    return { floor: cmHex(CM.BACKGROUND, dark, CM_USE.GENERAL), fill, line: darkenColor(fill, 0.598), ink: mapEditorInk(dark), muted: mapEditorMuted(dark) };
  }, [dark, themeV]);
  useLayoutEffect(() => { view.setPaint(paint); }, [view, paint]);
  useLayoutEffect(() => { view.changed(); }, [view, rev]);
  const canvasRef = useCallback((el: HTMLCanvasElement | null) => { view.attach(el); }, [view]);

  const [libRev, setLibRev] = useState(0);
  const lib = logic.state.solidLibrary;
  const saved = useMemo(() => savedSources(lib), [lib, libRev, logic.libraryRev]);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const k = shortcutKey(e);
      if (k !== 'z' && k !== 'y') return;
      const host = rootRef.current?.closest('[role="dialog"]');
      const t = e.target as HTMLElement | null;
      if (!host || !t || !host.contains(t)) return;
      if (typesText(t)) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) ed.redo(); else ed.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ed]);

  const discarding = useRef(false);
  const asking = useRef(false);
  const askLeave = useCallback((leave: () => void) => {
    if (asking.current) return;
    asking.current = true;
    void askChoice<'discard' | 'keep'>('Unsaved Changes', 'Your changes are not saved. Closing the editor drops them.',
      [{ label: 'Close Without Saving', value: 'discard' }, { label: 'Keep Editing', value: 'keep', primary: true }], 'keep', undefined, Box)
      .then((a) => {
        asking.current = false;
        if (a === 'discard') { discarding.current = true; leave(); }
      });
  }, []);
  const leaveGuard = useCallback((close: () => void): boolean => {
    if (discarding.current || !ed.dirty) return true;
    askLeave(close);
    return false;
  }, [ed, askLeave]);
  const requestClose = (close: () => void): void => { if (leaveGuard(close)) close(); };

  const saving = useRef(false);
  const save = async () => {
    if (saving.current) return;
    let plan = ed.planSave(logic.state.solidLibrary, Date.now());
    if (plan.kind === 'replace' && plan.asks) {
      saving.current = true;
      const ans = await askChoice<'cancel' | 'replace'>('Replace Your Solid', `You already have a solid named "${plan.item.name}". Saving replaces it with this one.`,
        [{ label: 'Cancel', value: 'cancel' }, { label: 'Replace', value: 'replace', primary: true }], 'cancel', undefined, Save);
      saving.current = false;
      if (ans !== 'replace') return;
      plan = ed.planSave(logic.state.solidLibrary, Date.now());
    }
    if (plan.kind === 'bad') { toast('error', 'This solid cannot be saved.'); return; }
    if (plan.kind === 'clash') { toast('error', `Your solid "${plan.name}" already uses a name like this one. Pick a different name.`); return; }
    if (!logic.addToLibrary(plan.item)) { toast('error', 'This solid cannot be saved.'); return; }
    ed.saved(plan.item);
    setLibRev(n => n + 1);
    toast('success', `Saved "${plan.item.name}".`);
  };

  const exporting = useRef(false);
  const exportIt = async () => {
    if (exporting.current) return;
    const plan = ed.planSave(logic.state.solidLibrary, Date.now());
    if (plan.kind === 'bad') { toast('error', 'This solid cannot be saved.'); return; }
    if (plan.kind === 'clash') { toast('error', `Your solid "${plan.name}" already uses a name like this one. Pick a different name.`); return; }
    exporting.current = true;
    try { await writeExportFile(plan.item.fileData, solidFileNameOf(plan.item.fileData.data as SolidDesign), toast, DataRegistry.saveWithPicker); }
    finally { exporting.current = false; }
  };

  const maxH = useModalMaxHeight();
  const bodyH = Math.max(BODY_MIN, Math.min(BODY_MAX, Math.round(maxH - CHROME_H)));
  return (
    <Modal title="3D Solid Editor" icon={<Box size={18} />} onClose={closeSolidEditor} beforeClose={leaveGuard} width={WIN_W} fit surface="content"
      bodyClassName="k-modal-body-flush flex flex-col"
      footer={(close) => <>
        <Button variant="secondary" icon={<Undo2 size={14} />} onClick={() => { ed.undo(); }} disabled={!ed.canUndo} title="Undo (Ctrl Z)">Undo</Button>
        <Button variant="secondary" icon={<Redo2 size={14} />} onClick={() => { ed.redo(); }} disabled={!ed.canRedo} title="Redo (Ctrl Y)">Redo</Button>
        <Button variant="secondary" icon={<Focus size={14} />} onClick={() => { view.fit(); }} title="Fit View: shows the whole solid again (the wheel zooms)">Fit View</Button>
        <span className="k-hint flex-1 min-w-0 flex items-center gap-1.5">
          <HelpTooltip text={VIEW_TIP} />
          <span className="truncate min-w-0">{VIEW_HINT}</span>
        </span>
        <Button variant="secondary" onClick={() => requestClose(close)}>Close</Button>
        <Button variant="secondary" onClick={() => { void exportIt(); }} title="Export: writes this solid to a file you can share or import again">Export</Button>
        <Button variant="primary" icon={<Save size={14} />} onClick={() => { void save(); }} title="Save it to your solids">Save</Button>
      </>}>
      <div ref={rootRef} className="flex flex-auto min-h-0" style={{ height: bodyH }}>
        <SolidList ed={ed} saved={saved} />
        <div className="k-lib-content flex-1 min-w-0 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 px-4 pt-4 pb-3">
            <canvas ref={canvasRef} className="block w-full h-full rounded-xl touch-none select-none"
              aria-label="The solid. Drag to turn it, drag a corner to move it, the wheel zooms."
              onPointerDown={view.down} onPointerMove={view.move} onPointerUp={view.up} onPointerCancel={view.up}
              onLostPointerCapture={view.up} onPointerEnter={view.enter} onPointerLeave={view.leave} onWheel={view.wheel} />
          </div>
          <div className="shrink-0 px-4 pb-4 space-y-3">
            <SizeRow ed={ed} view={view} />
            <div className="grid grid-cols-[2fr_3fr] gap-3 items-end">
              <div className="k-num">
                <label htmlFor="solid-name" className="k-num-label">Name</label>
                <TextField id="solid-name" maxLength={TEXT_LIMITS.NAME} value={ed.name} onChange={(v) => ed.setName(v)} placeholder="Solid" className="k-num-field" />
              </div>
              <CornerBoxes ed={ed} />
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export const __solidEditorHooks = { SolidEditor, CornerBoxes, SizeRow, makeView };
