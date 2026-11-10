import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GameLogic } from '../game/GameLogic';
import { TankPreview, computeCircumcircle } from './TankPreview';
import { teamOverrideColor } from '../types';
import { useGameDark } from '../utils/useGameTheme';
import { anyForcedTeamLayer } from '../game/teamColourSwitch';
import { useHudScale } from '../utils/useGuiScale';
import { getEffectiveViewportWidth, getEffectiveViewportHeight } from '../utils/zoomCompensation';
import { mobileActive } from '../utils/mobileMode';
import { safeInsets } from '../utils/safeArea';
import { hudColors, hudSlot, hudMix, hudCss, HUD_SLOT, HUD_K_BAND, HUD_K_HOVER, HUD_K_PRESSED, HUD_FONT_FAMILY } from '../utils/hudArras';
import { useLeave } from './kit/presence';
import {
  DEATH_EASE, DEATH_DIM_FROM, DEATH_DIM_TO, DEATH_DIM_SEC, DEATH_DIM_LIGHT, DEATH_DIM_DARK, DEATH_DROP, DEATH_DROP_SEC,
  DEATH_LINE_START, DEATH_LINE_STEP, DEATH_FADE_SEC, DEATH_BLOCK_START, DEATH_SCORE_SEC, deathScoreShown, deathY, DEATH_FONT,
  DEATH_STROKE_F, DEATH_MID, DEATH_LINE_PITCH, DEATH_X_LEFT, DEATH_X_WORDS, DEATH_X_TANK, DEATH_BTN_W, DEATH_BTN_H, DEATH_BTN_DX,
  DEATH_BTN_TOP, DEATH_BTN_EDGE, DEATH_BTN_BAND, DEATH_BTN_TOP_ALONE, DEATH_MID_END_TITLE, DEATH_TANK_CIRCLE, DEATH_TANK_TURN,
  deathTankCircle, deathCommas, deathDuration, deathSecondsOf, DEATH_ICON, deathKillIcon, deathKillWords, DEATH_TIP,
  deathKillerLine, deathScoreTitle, deathRespawnIn, deathCannotRespawn, deathStamp, deathPhonePlace,
} from '../utils/deathArras';

interface Props {
  logic: GameLogic;
  onRespawn: () => void;
  onExit: () => void;
  fromPlayMenu: boolean;
  leaving?: boolean;
}

const FIT_MARGIN = 12;
const _measure: { ctx: CanvasRenderingContext2D | null } = { ctx: null };
function textW(words: string, size: number): number {
  if (_measure.ctx === null) { const c = document.createElement('canvas'); _measure.ctx = c.getContext('2d'); }
  const ctx = _measure.ctx;
  if (ctx === null) return words.length * size * 0.55;
  ctx.font = `bold ${size}px ${HUD_FONT_FAMILY}`;
  return ctx.measureText(words).width;
}

const Words: React.FC<{ x: number; y: number; size: number; anchor?: 'start' | 'middle'; fill: string; ink: string; children: React.ReactNode; tref?: React.Ref<SVGTextElement> }> = ({ x, y, size, anchor = 'start', fill, ink, children, tref }) => (
  <text ref={tref} x={x} y={y} textAnchor={anchor} dominantBaseline="central" fontFamily={HUD_FONT_FAMILY} fontWeight="bold" fontSize={size}
    fill={fill} stroke={ink} strokeWidth={DEATH_STROKE_F * size} paintOrder="stroke" strokeLinejoin="round" style={{ pointerEvents: 'none', whiteSpace: 'pre' }}>
    {children}
  </text>
);

export const ArrasDeathScreen: React.FC<Props> = ({ logic, onRespawn, onExit, fromPlayMenu, leaving = false }) => {
  const s = logic.state;
  const dark = useGameDark();
  const col = hudColors(dark);
  const hudS = useHudScale();

  const [facts] = useState(() => {
    const now = logic.gameNow();
    const t0 = Math.max(0, (now - s.deathMenuOpenedAt) / 1000);
    const bosses = Math.max(0, Math.min(s.deathKills, s.bossKills ?? 0));
    const cause = deathKillerLine(s.deathCauseKind, logic.deathKillerName(), s.deathCauseName);
    const lines: { icon: string; words: string }[] = [
      { icon: DEATH_ICON.survived, words: 'Survived for ' + deathDuration(deathSecondsOf(s.deathSurvivalMs)) },
      { icon: deathKillIcon(s.deathKills - bosses, bosses), words: deathKillWords(s.deathKills - bosses, 0, bosses, s.deathFoodKills) },
      { icon: DEATH_ICON.tip, words: DEATH_TIP },
      cause,
    ];
    const wave = logic.mevWaveReached();
    if (wave > 0) lines.push({ icon: DEATH_ICON.wave, words: `Reached wave ${deathCommas(wave)}` });
    return {
      t0,
      stamp: deathStamp(Date.now() - Math.max(0, now - logic.tankDeathStartTime)),
      score: Math.max(0, Math.floor(s.currentXp)) + logic.shownScoreStartOf(null),
      title: deathScoreTitle(logic.playerShownName()),
      level: `Level ${s.deathLevel}`,
      tank: logic.playerTankDisplayName() ?? logic.resolveTankDisplayName(null),
      lines,
    };
  });

  const [, tick] = useState(0);
  const mountMs = useRef(performance.now());
  const elapsed = () => facts.t0 + (performance.now() - mountMs.current) / 1000;
  const gameT = () => (logic.gameNow() - s.deathMenuOpenedAt) / 1000;
  const blockOn = gameT() >= DEATH_BLOCK_START - 0.001;
  const closedForGood = logic.matchClosedForGood();
  const endTitle = logic.matchEndTitle();
  const refused = closedForGood ? 'the arena is closed' : logic.respawnRefusedWhy();
  const waitMs = logic.respawnCooldownRemainingMs();
  const canRespawn = blockOn && refused === '' && waitMs <= 0;
  const rulesRun = logic.mapEventsRunning() && !closedForGood;
  useEffect(() => {
    let ms = -1;
    if (!blockOn) ms = (DEATH_BLOCK_START - gameT()) * 1000 + 5;
    else if (refused === '' && waitMs > 0) ms = (waitMs % 1000 || 1000) + 5;
    else if (rulesRun) ms = 1000;
    if (ms < 0) return;
    const id = window.setTimeout(() => tick((n) => n + 1), Math.max(0, ms));
    return () => window.clearTimeout(id);
  });

  const respawnRef = useRef(onRespawn); respawnRef.current = onRespawn;
  const canRef = useRef(canRespawn); canRef.current = canRespawn && !leaving;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.code !== 'Enter' && e.code !== 'NumpadEnter') || !canRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault(); e.stopPropagation();
      respawnRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);

  const scoreRef = useRef<SVGTextElement | null>(null);
  useEffect(() => {
    let raf = 0; let shown = -1;
    const step = () => {
      const t = elapsed();
      const v = deathScoreShown(facts.score, t);
      const el = scoreRef.current;
      if (v !== shown && el) { const n = el.firstChild; if (n) n.nodeValue = deathCommas(v); else el.textContent = deathCommas(v); shown = v; }
      if (t < DEATH_SCORE_SEC) raf = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(raf);
  }, []);

  const [box, setBox] = useState(() => ({ w: getEffectiveViewportWidth(), h: getEffectiveViewportHeight() }));
  useEffect(() => {
    const on = () => setBox((b) => { const w = getEffectiveViewportWidth(), h = getEffectiveViewportHeight(); return b.w === w && b.h === h ? b : { w, h }; });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const mob = mobileActive();
  const inL = mob ? safeInsets.l : 0, inT = mob ? safeInsets.t : 0;
  const bw = box.w - (mob ? safeInsets.l + safeInsets.r : 0), bh = box.h - (mob ? safeInsets.t + safeInsets.b : 0);

  const deadTank = useMemo(() => logic.getTankExportData(),
    [logic, s.currentTankFileName, s.playerDead]);
  const circ = useMemo(() => {
    const c = computeCircumcircle(deadTank.turrets, 2, deadTank.tankSides, deadTank.bodyLayers);
    const axis = Math.max(1e-3, c.radius * 2);
    return { axis, mx: c.centerX, my: c.centerY };
  }, [deadTank]);
  const deathColor = teamOverrideColor(s.deathColorTeamIndex, dark);
  const layerTeam = deathColor === undefined && anyForcedTeamLayer(deadTank.bodyLayers) ? teamOverrideColor(logic.playerLayerTeamIndex(), dark) : undefined;

  const canNow = canRespawn;
  const lay = useMemo(() => {
    const lineRight = Math.max(...facts.lines.map((l) => DEATH_X_WORDS + textW(l.words, DEATH_FONT.line)));
    const right = Math.max(lineRight, DEATH_X_LEFT + textW(facts.title, DEATH_FONT.scoreTitle), DEATH_X_LEFT + textW(deathCommas(facts.score), DEATH_FONT.score),
      endTitle !== '' ? DEATH_X_LEFT + textW(endTitle, DEATH_FONT.scoreTitle) : 0, DEATH_BTN_DX + DEATH_BTN_W / 2,
      textW(facts.stamp, DEATH_FONT.stamp) / 2, refused !== '' ? textW(deathCannotRespawn(refused), DEATH_FONT.respawn) / 2 : 0);
    const left = Math.min(DEATH_X_TANK - Math.max(DEATH_TANK_CIRCLE / 2 + 20, textW(facts.tank, DEATH_FONT.tank) / 2), DEATH_X_LEFT,
      -textW(facts.stamp, DEATH_FONT.stamp) / 2, -(DEATH_BTN_DX + DEATH_BTN_W / 2), refused !== '' ? -textW(deathCannotRespawn(refused), DEATH_FONT.respawn) / 2 : 0);
    const top = Math.min(DEATH_MID.stamp - DEATH_FONT.stamp, endTitle !== '' ? DEATH_MID_END_TITLE - DEATH_FONT.scoreTitle : 0);
    const bottom = refused !== '' ? DEATH_BTN_TOP_ALONE + DEATH_BTN_H + 4 : DEATH_BTN_TOP + DEATH_BTN_H + 4;

    if (!mob) {
      const half = Math.max(-left, right);
      let k = 1, wv = bw / hudS, hv = bh / hudS, y = deathY(hv);
      for (let i = 0; i < 80; i++) {
        const u = hudS * k; wv = bw / u; hv = bh / u; y = deathY(hv);
        const m = FIT_MARGIN / u;
        if (half + m <= wv / 2 && y + top >= m && y + bottom <= hv - m) break;
        k *= 0.97;
      }
      return { u: hudS * k, wv, hv, y, xs: 0 };
    }

    const p = deathPhonePlace(bw, bh, hudS, left, right, top, bottom, FIT_MARGIN);
    return { u: p.u, wv: bw / p.u, hv: bh / p.u, y: p.y, xs: p.xs };
  }, [facts, endTitle, refused, bw, bh, hudS, mob]);
  const u = lay.u;

  const tankAt = useMemo(() => { const o = { x: 0, y: 0 }; deathTankCircle(circ.axis, circ.mx, circ.my, lay.wv, lay.y, o); o.x += lay.xs; return o; }, [circ, lay]);

  const btn = useMemo(() => {
    const g = hudSlot(HUD_SLOT.GREY, dark), ink = hudSlot(HUD_SLOT.INK, dark), white = hudSlot(HUD_SLOT.TEXT, dark);
    const bottom = hudMix(g, ink, HUD_K_BAND);
    return {
      top: hudCss(g), bottom: hudCss(bottom),
      topHover: hudCss(hudMix(g, white, HUD_K_HOVER)), bottomHover: hudCss(hudMix(bottom, white, HUD_K_HOVER)),
      topPressed: hudCss(hudMix(g, ink, HUD_K_PRESSED)),
    };
  }, [dark]);
  const [hover, setHover] = useState<'' | 'back' | 'respawn'>('');
  const [press, setPress] = useState<'' | 'back' | 'respawn'>('');

  const rootRef = useRef<HTMLDivElement | null>(null);
  useLeave(rootRef, leaving, 'fade');

  const t0 = facts.t0;
  const anim = (name: string, sec: number, startSec: number) => `${name} ${sec * 1000}ms ${DEATH_EASE} ${(startSec - t0) * 1000}ms both`;
  const leaveWords = fromPlayMenu ? 'Play Menu' : 'Game Engine';

  const vb = `${-lay.wv / 2 - lay.xs} ${-lay.y} ${lay.wv} ${lay.hv}`;
  const svgStyle: React.CSSProperties = { position: 'absolute', left: 0, top: 0, width: bw, height: bh, overflow: 'visible', pointerEvents: 'none' };

  const button = (key: 'back' | 'respawn', cx: number, top: number, words: string, onClick: () => void) => {
    const x = cx - DEATH_BTN_W / 2;
    const on = hover === key, down = on && press === key;
    return (
      <g key={key}>
        <rect x={x} y={top} width={DEATH_BTN_W} height={DEATH_BTN_H * DEATH_BTN_BAND} fill={down ? btn.topPressed : on ? btn.topHover : btn.top} />
        <rect x={x} y={top + DEATH_BTN_H * DEATH_BTN_BAND} width={DEATH_BTN_W} height={DEATH_BTN_H * (1 - DEATH_BTN_BAND)} fill={on ? btn.bottomHover : btn.bottom} />
        <rect x={x} y={top} width={DEATH_BTN_W} height={DEATH_BTN_H} rx={DEATH_BTN_EDGE / 2} fill="none" stroke={col.ink} strokeWidth={DEATH_BTN_EDGE} />
        <Words x={cx} y={top + DEATH_BTN_H / 2} size={DEATH_FONT.button} anchor="middle" fill={col.text} ink={col.ink}>{words}</Words>
        <rect x={x} y={top} width={DEATH_BTN_W} height={DEATH_BTN_H} fill="transparent" style={{ pointerEvents: 'all', cursor: 'var(--cur-pointer)', touchAction: 'none' }}
          onPointerEnter={() => setHover(key)} onPointerLeave={() => { setHover(''); setPress(''); }}
          onPointerDown={() => { setHover(key); setPress(key); }} onPointerUp={() => setPress('')} onClick={onClick} />
      </g>
    );
  };

  return (
    <div ref={rootRef} className="absolute inset-0 z-50" style={{ overflow: 'hidden', pointerEvents: leaving ? 'none' : 'auto' }} data-death-arras="">
      <div className="absolute inset-0" style={{ background: dark ? DEATH_DIM_DARK : DEATH_DIM_LIGHT, opacity: DEATH_DIM_TO,
        animation: anim('k-dz-dim', DEATH_DIM_SEC, 0), ['--k-dz-from' as string]: String(DEATH_DIM_FROM), ['--k-dz-to' as string]: String(DEATH_DIM_TO) } as React.CSSProperties} />
      <div style={{ position: 'absolute', left: inL, top: inT, width: bw, height: bh, animation: anim('k-dz-drop', DEATH_DROP_SEC, 0),
        ['--k-dz-drop' as string]: `${-DEATH_DROP * u}px` } as React.CSSProperties}>
        <svg viewBox={vb} style={svgStyle}>
          <Words x={0} y={DEATH_MID.stamp} size={DEATH_FONT.stamp} anchor="middle" fill={col.text} ink={col.ink}>{facts.stamp}</Words>
          {endTitle !== '' && <Words x={DEATH_X_LEFT} y={DEATH_MID_END_TITLE} size={DEATH_FONT.scoreTitle} fill={col.text} ink={col.ink}>{endTitle}</Words>}
          <Words x={DEATH_X_LEFT} y={DEATH_MID.scoreTitle} size={DEATH_FONT.scoreTitle} fill={col.text} ink={col.ink}>{facts.title}</Words>
          <Words x={DEATH_X_LEFT} y={DEATH_MID.score} size={DEATH_FONT.score} fill={col.text} ink={col.ink} tref={scoreRef}>{deathCommas(deathScoreShown(facts.score, elapsed()))}</Words>
          <Words x={DEATH_X_TANK} y={DEATH_MID.level} size={DEATH_FONT.level} anchor="middle" fill={col.text} ink={col.ink}>{facts.level}</Words>
          <Words x={DEATH_X_TANK} y={DEATH_MID.tank} size={DEATH_FONT.tank} anchor="middle" fill={col.text} ink={col.ink}>{facts.tank}</Words>
        </svg>
        <div style={{ position: 'absolute', left: bw / 2 + tankAt.x * u - 75 * u, top: lay.y * u + tankAt.y * u - 75 * u, width: 150 * u, height: 150 * u, pointerEvents: 'none' }}>
          <TankPreview tankConfig={deadTank} size={150 * u} animate={false} boundsFit={DEATH_TANK_CIRCLE / 150} turn={DEATH_TANK_TURN}
            colorOverride={deathColor} layerTeamColor={layerTeam} />
        </div>
        {facts.lines.map((l, k) => (
          <svg key={k} viewBox={vb} style={{ ...svgStyle, animation: anim('k-dz-in', DEATH_FADE_SEC, DEATH_LINE_START + DEATH_LINE_STEP * k) }}>
            <Words x={DEATH_X_LEFT} y={DEATH_MID.line0 + DEATH_LINE_PITCH * k} size={DEATH_FONT.line} fill={col.text} ink={col.ink}>{l.icon}</Words>
            <Words x={DEATH_X_WORDS} y={DEATH_MID.line0 + DEATH_LINE_PITCH * k} size={DEATH_FONT.line} fill={col.text} ink={col.ink}>{l.words}</Words>
          </svg>
        ))}
        <svg viewBox={vb} style={{ ...svgStyle, animation: anim('k-dz-in', DEATH_FADE_SEC, DEATH_BLOCK_START) }}>
          {blockOn && (refused !== ''
              ? <>
                  <Words x={0} y={DEATH_MID.respawn} size={DEATH_FONT.respawn} anchor="middle" fill={col.text} ink={col.ink}>{deathCannotRespawn(refused)}</Words>
                  {button('back', 0, DEATH_BTN_TOP_ALONE, leaveWords, onExit)}
                </>
              : !canNow
                ? <Words x={0} y={DEATH_MID.respawn} size={DEATH_FONT.respawn} anchor="middle" fill={col.text} ink={col.ink}>{deathRespawnIn(waitMs)}</Words>
                : <>
                    {button('back', -DEATH_BTN_DX, DEATH_BTN_TOP, leaveWords, onExit)}
                    {button('respawn', DEATH_BTN_DX, DEATH_BTN_TOP, 'Respawn', onRespawn)}
                  </>)}
        </svg>
      </div>
    </div>
  );
};

export default ArrasDeathScreen;
