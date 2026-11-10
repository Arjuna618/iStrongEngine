import React, { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import type { UpgradeStat } from '../../types';
import { getStatLabel } from '../../types';
import {
  hudColors, hudSlot, hudMix, hudCss, HUD_SLOT, HUD_K_BAND, HUD_SKILL_SLOTS, hudSlideStep, HUD_FONT_FAMILY, HUD_STROKE_F, HUD_STROKE_F_BIG,
  HUD_RING, HUD_UP_BAND_ALPHA, HUD_UP_ORIGIN, HUD_UP_PITCH, type HudRgb,
} from '../../utils/hudArras';
import {
  MOB_SK_W, MOB_SK_H, MOB_SK_BAND, MOB_SK_STRIP, MOB_SK_FONT, MOB_SK_TEXT_MID, MOB_SK_TEXT_GAP, MOB_SK_HIDE, MOB_SK_COL_H, MOB_SK_LEVEL_DY,
  mobColumnLevel, MOB_SK_HOLD_MS,
  MOB_MM_X, MOB_PLUS_GAP, MOB_BTN_GAP, MOB_BTN_H, MOB_FULL_W, MOB_BTN_FONT, MOB_MENU_PITCH, MOB_MENU_ROWS, MOB_MENU_WORDS, MOB_MENU_KEYS,
  MOB_RC_MARK, MOB_KEYBOARD, mobLayout, mobSkillLines, type MobLayout, type MobMenuAction, type MobKey,
  mobSkillReach, mobMenuPlace, MOB_FIT_W, MOB_FIT_GAP, MOB_MENU_MAX, MOB_KEYS_MAX, MOB_BOTTOM_NAMED, MOB_BOTTOM_BARS, type MobPlace,
} from '../../utils/mobileArras';
import { mobHud, subscribeMobTiles, subscribeMobSticks, mobY3Changed, mobHudDragDown, mobHudDragUp, setMobKeysOpen } from '../../utils/mobileMode';
import type { TouchControls } from './touchControls';
import { chatInputOpenNow } from '../ChatInput';
import { CMD_NO_ACCESS } from '../../game/chatCommands';
import { enterFullscreen, isFullscreen, subscribeFullscreen } from '../../utils/fullscreen';
import { hudSlideLayer } from '../../utils/hudLayer';

const STATS: readonly UpgradeStat[] = [
  'bodyDamage', 'maxHealth', 'bulletSpeed', 'bulletHealth', 'bulletPenetration', 'bulletDamage', 'reload', 'movementSpeed', 'shieldRegen', 'shieldCapacity',
];
const DIGIT: readonly string[] = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];

const _bands = new Map<string, { top: string; bottom: string; flat: string }>();
function bandsOf(slot: number, dark: boolean): { top: string; bottom: string; flat: string } {
  const key = slot + (dark ? 'd' : 'l');
  let b = _bands.get(key);
  if (!b) { const c: HudRgb = hudSlot(slot, dark); b = { top: hudCss(c), bottom: hudCss(hudMix(c, hudSlot(HUD_SLOT.INK, dark), HUD_K_BAND)), flat: hudCss(c) }; _bands.set(key, b); }
  return b;
}

const _L: MobLayout = { ySkill: HUD_UP_ORIGIN, y3: HUD_UP_ORIGIN };
const _MP: MobPlace = { x: 0, y: 0, s: 1 };
const MENU_W = MOB_MENU_ROWS[0].reduce((t, b) => t + b.w, 0) + (MOB_MENU_ROWS[0].length - 1) * MOB_BTN_GAP;
const MENU_H = MOB_MENU_PITCH * (MOB_MENU_ROWS.length - 1) + MOB_BTN_H;
const KEYS_W = MOB_MENU_PITCH * 12 + MOB_BTN_H;
const KEYS_H = MOB_MENU_PITCH * (MOB_KEYBOARD.length - 1) + MOB_BTN_H;

function pressKey(logic: GameLogic, code: string): void { logic.handleInput('keydown', code); logic.handleInput('keyup', code); }

interface SkillAnim { p: number; target: number; raf: number; lastMs: number; }

interface Drag { id: number; idx: number; top: number; y: number; open: boolean; timer: number; }

export const MobileHud: React.FC<{ logic: GameLogic; scale: number; dark: boolean; tc: TouchControls }> = ({ logic, scale, dark, tc }) => {
  const s = logic.state;
  const col = hudColors(dark);
  const [open, setOpen] = useState<'none' | 'menu' | 'keys'>('none');
  const subscribeTc = useCallback((cb: () => void) => tc.subscribe(cb), [tc]);
  useSyncExternalStore(subscribeTc, () => tc.version);

  const watched = logic.spectatedTank();
  const caps = s.skillCaps;
  const rows: { id: UpgradeStat; code: string; label: string; M: number; L: number }[] = [];
  for (let i = 0; i < STATS.length; i++) {
    const id = STATS[i];
    const M = caps ? caps[id] : s.maxPointsPerSkill;
    if (!(M > 0)) continue;
    rows.push({ id, code: DIGIT[i], label: getStatLabel(id, s.statNamesType ?? 'generic'), M, L: Math.min(M, s.upgrades[id] ?? 0) });
  }
  const points = s.skillPoints;
  const showSkills = watched === null && points > 0 && !logic.areSkillsMaxed() && rows.length > 0 && s.playerDead !== true;

  const animRef = useRef<SkillAnim | null>(null);
  if (animRef.current === null) animRef.current = { p: showSkills ? 1 : 0, target: showSkills ? 1 : 0, raf: 0, lastMs: 0 };
  const a = animRef.current;
  a.target = showSkills ? 1 : 0;
  mobHud.skillTarget = a.target;
  mobHud.skillReach = mobSkillReach(rows.length, MOB_FIT_W);
  const rowEl = useRef<HTMLDivElement | null>(null);
  const blockEl = useRef<HTMLDivElement | null>(null);
  const scaleRef = useRef(scale); scaleRef.current = scale;

  const layers = useRef({ row: false, block: false, menu: false, rowEl: null as HTMLDivElement | null, blockEl: null as HTMLDivElement | null,
    menuEl: null as HTMLDivElement | null });
  const menuEl = useRef<HTMLDivElement | null>(null);
  const openRef = useRef<'none' | 'menu' | 'keys'>('none'); openRef.current = open;
  const namedRef = useRef(false);
  namedRef.current = (watched !== null ? (watched.displayName || '') : logic.playerShownName()) !== '';
  const place = useCallback(() => {
    const k = scaleRef.current;
    mobLayout(mobHud.tileRows, a.p, _L);
    mobHud.skillShown = a.p; mobHud.ySkill = _L.ySkill;
    const moved = _L.y3 !== mobHud.y3;
    mobHud.y3 = _L.y3;
    const sliding = a.p !== a.target || mobHud.tileRows !== mobHud.tileRowsTarget;
    const L = layers.current;
    const r = rowEl.current;
    if (r) {
      if (r !== L.rowEl) { L.rowEl = r; L.row = false; }
      r.style.transform = `translate(${-(1 - a.p) * MOB_SK_HIDE * k}px, ${_L.ySkill * k}px)`;
      L.row = hudSlideLayer(r, sliding, L.row);
    }
    const b = blockEl.current;
    if (b) {
      if (b !== L.blockEl) { L.blockEl = b; L.block = false; }
      b.style.transform = `translate(${(MOB_MM_X + mobHud.mmW + MOB_PLUS_GAP) * k}px, ${_L.y3 * k}px)`;
      L.block = hudSlideLayer(b, sliding, L.block);
    }
    let menuBottom = 0;
    const me = menuEl.current, o = openRef.current;
    if (me && o !== 'none' && mobHud.viewW > 0 && k > 0) {
      const W = mobHud.viewW / k, H = mobHud.viewH / k;
      const bw = o === 'menu' ? MENU_W : KEYS_W, bh = o === 'menu' ? MENU_H : KEYS_H;
      mobMenuPlace(W, H, mobHud.stickK, _L.y3, H - (namedRef.current ? MOB_BOTTOM_NAMED : MOB_BOTTOM_BARS), bw, bh,
        o === 'menu' ? MOB_MENU_MAX : MOB_KEYS_MAX, MOB_FIT_GAP, _MP);
      if (me !== L.menuEl) { L.menuEl = me; L.menu = false; }
      me.style.transform = `translate(${_MP.x * k}px, ${_MP.y * k}px) scale(${_MP.s})`;
      L.menu = hudSlideLayer(me, sliding, L.menu);
      menuBottom = _MP.y + bh * _MP.s;
    }
    const menuMoved = menuBottom !== mobHud.menuBottom;
    mobHud.menuBottom = menuBottom;
    if (moved || menuMoved) mobY3Changed();
  }, [a]);

  const frame = useCallback((now: number) => {
    a.raf = 0;
    const dt = now > a.lastMs ? (now - a.lastMs) / 1000 : 0;
    a.lastMs = now;
    a.p = hudSlideStep(a.p, a.target, dt);
    place();
    if (a.p !== a.target) a.raf = requestAnimationFrame(frame);
  }, [a, place]);

  useLayoutEffect(() => {
    place();
    if (a.raf === 0 && a.p !== a.target) { a.lastMs = performance.now(); a.raf = requestAnimationFrame(frame); }
  });
  useEffect(() => subscribeMobTiles(place), [place]);
  useEffect(() => subscribeMobSticks(place), [place]);
  useEffect(() => () => {
    if (a.raf !== 0) { cancelAnimationFrame(a.raf); a.raf = 0; }
    mobHud.skillShown = 0; mobHud.skillTarget = 0; mobHud.y3 = HUD_UP_ORIGIN; mobHud.menuBottom = 0; mobY3Changed();
  }, [a]);

  const dragRef = useRef<Drag>({ id: -1, idx: -1, top: 0, y: 0, open: false, timer: 0 });
  const d = dragRef.current;
  const [colIdx, setColIdx] = useState(-1);
  const spendTo = (yRow: number) => {
    const r = rows[d.idx];
    if (!r) return;
    const st = logic.state;
    const want = mobColumnLevel(yRow, r.M);
    const now = st.upgrades[r.id] ?? 0;
    if (want > now && st.skillPoints > 0 && !st.paused) logic.upgradeStat(r.id, want - now);
  };
  const endHold = () => {
    if (d.timer !== 0) { clearTimeout(d.timer); d.timer = 0; }
    if (d.id !== -1) mobHudDragUp();
    d.id = -1; d.idx = -1;
    if (d.open) { d.open = false; setColIdx(-1); }
  };
  const skillDown = (e: React.PointerEvent, i: number, code: string) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (d.id !== -1) return;
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { }
    pressKey(logic, code);
    mobHudDragDown();
    d.id = e.pointerId; d.idx = i; d.top = (e.currentTarget as Element).getBoundingClientRect().top; d.open = false;
    d.y = (e.clientY - d.top) / (scaleRef.current || 1);
    const id = d.id;
    d.timer = window.setTimeout(() => {
      d.timer = 0;
      if (d.id !== id) return;
      d.open = true; setColIdx(d.idx);
      spendTo(d.y);
    }, MOB_SK_HOLD_MS);
  };
  const skillMove = (e: React.PointerEvent) => {
    if (e.pointerId !== d.id) return;
    d.y = (e.clientY - d.top) / (scaleRef.current || 1);
    if (d.open) spendTo(d.y);
  };
  const skillUp = (e: React.PointerEvent) => {
    if (e.pointerId !== d.id) return;
    endHold();
  };
  useEffect(() => {
    if (!showSkills && d.id !== -1) endHold();
  });
  useEffect(() => () => { if (d.timer !== 0) clearTimeout(d.timer); if (d.id !== -1) { mobHudDragUp(); d.id = -1; } }, [d]);

  const isFull = useSyncExternalStore(subscribeFullscreen, isFullscreen, isFullscreen);

  const keysHeld = useRef(new Map<number, string>()).current;
  const keyDown = (e: React.PointerEvent, code: string) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault();
    if (!logic.admin.allowed()) { const st = logic.state; if (!st.paused && !st.playerDead) logic.pushMessage(CMD_NO_ACCESS); return; }
    try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { }
    if (keysHeld.size === 0) logic.handleInput('keydown', 'Backquote');
    keysHeld.set(e.pointerId, code);
    logic.handleInput('keydown', code);
  };
  const keyUp = (e: React.PointerEvent) => {
    const code = keysHeld.get(e.pointerId);
    if (code === undefined) return;
    keysHeld.delete(e.pointerId);
    logic.handleInput('keyup', code);
    if (keysHeld.size === 0) logic.handleInput('keyup', 'Backquote');
  };
  const releaseKeys = useCallback(() => {
    for (const code of keysHeld.values()) logic.handleInput('keyup', code);
    if (keysHeld.size > 0) logic.handleInput('keyup', 'Backquote');
    keysHeld.clear();
  }, [keysHeld, logic]);
  useEffect(() => releaseKeys, [releaseKeys]);
  useEffect(() => { if (open !== 'keys') releaseKeys(); }, [open, releaseKeys]);
  useEffect(() => { setMobKeysOpen(open === 'keys'); }, [open]);
  useEffect(() => () => setMobKeysOpen(false), []);

  const act = (what: MobMenuAction) => {
    if (what === 'close') { setOpen('none'); return; }
    if (what === 'rcMode') { tc.stepRcMode(); return; }
    if (what === 'pause') { if (!s.playerDead) { tc.releaseAll(); logic.setPaused(true); } return; }
    if (what === 'chat') { if (logic.chatOpen(performance.now())) chatInputOpenNow(); return; }
    const code = MOB_MENU_KEYS[what];
    if (code) pressKey(logic, code);
  };
  const fullscreen = (): void => { void enterFullscreen(); };

  const ink = col.ink, text = col.text;
  const greyBands = bandsOf(HUD_SLOT.GREY, dark);
  const label = (x: number, y: number, words: string, font: number, anchor: 'middle' | 'start' = 'middle', fill: string = text) => (
    <text x={x} y={y} textAnchor={anchor} dominantBaseline="central" fontFamily={HUD_FONT_FAMILY} fontWeight="bold" fontSize={font}
      fill={fill} stroke={ink} strokeWidth={(font >= 20 ? HUD_STROKE_F_BIG : HUD_STROKE_F) * font} paintOrder="stroke" strokeLinejoin="round"
      style={{ pointerEvents: 'none' }}>{words}</text>
  );
  const button = (key: string, x: number, y: number, w: number, words: string, onClick: () => void) => (
    <g key={key}>
      <g opacity={HUD_UP_BAND_ALPHA}>
        <rect x={x} y={y} width={w} height={MOB_BTN_H * MOB_SK_BAND} fill={greyBands.top} />
        <rect x={x} y={y + MOB_BTN_H * MOB_SK_BAND} width={w} height={MOB_BTN_H * (1 - MOB_SK_BAND)} fill={greyBands.bottom} />
      </g>
      <rect x={x} y={y} width={w} height={MOB_BTN_H} rx={HUD_RING / 2} fill="none" stroke={ink} strokeWidth={HUD_RING} />
      {label(x + w / 2, y + MOB_BTN_H / 2, words, MOB_BTN_FONT)}
      <rect x={x} y={y} width={w} height={MOB_BTN_H} fill="transparent" style={{ pointerEvents: 'all', touchAction: 'none', cursor: 'var(--cur-pointer)' }}
        onClick={onClick} />
    </g>
  );

  const n = rows.length;
  const rowW = HUD_UP_ORIGIN + n * HUD_UP_PITCH + 80;
  const rowH = MOB_SK_H + MOB_SK_STRIP + 4;
  const blockW = 2 * (MOB_BTN_H + MOB_BTN_GAP) + MOB_FULL_W;
  const blockH = MOB_BTN_H;
  const boxW = open === 'menu' ? MENU_W : KEYS_W;
  const boxH = open === 'menu' ? MENU_H : KEYS_H;
  const keyButton = (k: MobKey, x: number, y: number) => (
    <g key={k.code}>
      <g opacity={HUD_UP_BAND_ALPHA}>
        <rect x={x} y={y} width={MOB_BTN_H} height={MOB_BTN_H * MOB_SK_BAND} fill={greyBands.top} />
        <rect x={x} y={y + MOB_BTN_H * MOB_SK_BAND} width={MOB_BTN_H} height={MOB_BTN_H * (1 - MOB_SK_BAND)} fill={greyBands.bottom} />
      </g>
      <rect x={x} y={y} width={MOB_BTN_H} height={MOB_BTN_H} rx={HUD_RING / 2} fill="none" stroke={ink} strokeWidth={HUD_RING} />
      {label(x + MOB_BTN_H / 2, y + MOB_BTN_H / 2, k.word, MOB_BTN_FONT)}
      {k.code === 'Backquote'
        ? <rect x={x} y={y} width={MOB_BTN_H} height={MOB_BTN_H} fill="transparent" style={{ pointerEvents: 'all', touchAction: 'none' }} onClick={() => setOpen('none')} />
        : <rect x={x} y={y} width={MOB_BTN_H} height={MOB_BTN_H} fill="transparent" style={{ pointerEvents: 'all', touchAction: 'none' }}
            onPointerDown={(e) => keyDown(e, k.code)} onPointerUp={keyUp} onPointerCancel={keyUp} />}
    </g>
  );
  const pad = HUD_RING;

  return (
    <>
      <div ref={blockEl} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', touchAction: 'none' }}>
        <svg width={(blockW + 2 * pad) * scale} height={(blockH + 2 * pad) * scale} viewBox={`${-pad} ${-pad} ${blockW + 2 * pad} ${blockH + 2 * pad}`}
          style={{ position: 'absolute', left: -pad * scale, top: -pad * scale, overflow: 'visible', touchAction: 'none' }}>
          {open === 'none' && button('plus', 0, 0, MOB_BTN_H, '+', () => setOpen('menu'))}
          {open === 'none' && button('tick', MOB_BTN_H + MOB_BTN_GAP, 0, MOB_BTN_H, '`', () => setOpen('keys'))}
          {open === 'none' && !isFull && button('full', 2 * (MOB_BTN_H + MOB_BTN_GAP), 0, MOB_FULL_W, 'Fullscreen', fullscreen)}
        </svg>
      </div>
      {open !== 'none' ? (
        <div ref={menuEl} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, transformOrigin: '0 0', pointerEvents: 'none', touchAction: 'none' }}>
          <svg width={(boxW + 2 * pad) * scale} height={(boxH + 2 * pad) * scale} viewBox={`${-pad} ${-pad} ${boxW + 2 * pad} ${boxH + 2 * pad}`}
            style={{ position: 'absolute', left: -pad * scale, top: -pad * scale, overflow: 'visible', touchAction: 'none' }}>
            {open === 'keys' && MOB_KEYBOARD.map((row, ri) => row.keys.map((k, ki) => keyButton(k, (row.col + ki) * MOB_MENU_PITCH, ri * MOB_MENU_PITCH)))}
            {open === 'menu' && MOB_MENU_ROWS.map((row, ri) => {
              let x = 0;
              return row.map((bt) => {
                const bx = x; x += bt.w + MOB_BTN_GAP;
                const words = bt.act === 'rcMode' ? `${MOB_RC_MARK} ${tc.rcWord()}` : MOB_MENU_WORDS[bt.act];
                return button(bt.act, bx, ri * MOB_MENU_PITCH, bt.w, words, () => act(bt.act));
              });
            })}
          </svg>
        </div>
      ) : null}
      {showSkills || a.p > 0 ? (
        <div ref={rowEl} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0, pointerEvents: 'none', touchAction: 'none' }}>
          <svg width={(rowW + 2 * pad) * scale} height={(rowH + 2 * pad) * scale} viewBox={`${-pad} ${-pad} ${rowW + 2 * pad} ${rowH + 2 * pad}`}
            style={{ position: 'absolute', left: -pad * scale, top: -pad * scale, overflow: 'visible', touchAction: 'none' }}>
            {rows.map((r, i) => {
              const x = HUD_UP_ORIGIN + i * HUD_UP_PITCH;
              const b = bandsOf(HUD_SKILL_SLOTS[r.id], dark);
              const c = b.flat;
              const lines = mobSkillLines(r.label);
              const tall = colIdx === i;
              const sy0 = MOB_SK_H, sy1 = MOB_SK_H + (tall ? MOB_SK_COL_H : MOB_SK_STRIP);
              const seg = (tall ? MOB_SK_COL_H : MOB_SK_W) / r.M;
              const seps: React.ReactNode[] = [];
              for (let k = 1; k < r.M; k++) {
                seps.push(tall
                  ? <line key={k} x1={x} y1={sy0 + k * seg} x2={x + MOB_SK_W} y2={sy0 + k * seg} stroke={ink} strokeWidth={HUD_RING / 2} strokeLinecap="round" />
                  : <line key={k} x1={x + k * seg} y1={sy0} x2={x + k * seg} y2={sy1} stroke={ink} strokeWidth={HUD_RING / 2} strokeLinecap="round" />);
              }
              return (
                <g key={r.id}>
                  <g opacity={HUD_UP_BAND_ALPHA}>
                    <rect x={x} y={0} width={MOB_SK_W} height={MOB_SK_H * MOB_SK_BAND} fill={b.top} />
                    <rect x={x} y={MOB_SK_H * MOB_SK_BAND} width={MOB_SK_W} height={MOB_SK_H * (1 - MOB_SK_BAND)} fill={b.bottom} />
                  </g>
                  <rect x={x} y={0} width={MOB_SK_W} height={MOB_SK_H} rx={HUD_RING / 2} fill="none" stroke={ink} strokeWidth={HUD_RING} />
                  <rect x={x} y={sy0} width={MOB_SK_W} height={sy1 - sy0} fill={text} />
                  <rect x={x} y={sy0} width={tall ? MOB_SK_W : r.L * seg} height={tall ? r.L * seg : MOB_SK_STRIP} fill={c} />
                  {seps}
                  <path d={`M${x} ${sy0} L${x} ${sy1} L${x + MOB_SK_W} ${sy1} L${x + MOB_SK_W} ${sy0}`} fill="none" stroke={ink} strokeWidth={HUD_RING} strokeLinecap="round" strokeLinejoin="round" />
                  {lines.length === 1
                    ? label(x + MOB_SK_W / 2, MOB_SK_TEXT_MID, lines[0], MOB_SK_FONT)
                    : <>{label(x + MOB_SK_W / 2, MOB_SK_TEXT_MID - MOB_SK_TEXT_GAP / 2, lines[0], MOB_SK_FONT)}{label(x + MOB_SK_W / 2, MOB_SK_TEXT_MID + MOB_SK_TEXT_GAP / 2, lines[1], MOB_SK_FONT)}</>}
                  {r.L > 0 ? label(x + MOB_SK_W / 2, sy1 + MOB_SK_LEVEL_DY, `+${r.L}`, MOB_SK_FONT, 'middle', c) : null}
                  <rect x={x} y={0} width={MOB_SK_W} height={MOB_SK_H + MOB_SK_STRIP} fill="transparent" style={{ pointerEvents: 'all', touchAction: 'none' }}
                    onPointerDown={(e) => skillDown(e, i, r.code)} onPointerMove={skillMove} onPointerUp={skillUp} onPointerCancel={skillUp} onLostPointerCapture={skillUp} />
                </g>
              );
            })}
            {points > 0 && label(HUD_UP_ORIGIN + n * HUD_UP_PITCH, 10, `x${points}`, 20, 'start')}
          </svg>
        </div>
      ) : null}
    </>
  );
};
