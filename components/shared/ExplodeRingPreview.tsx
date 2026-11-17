import React, { useRef, useEffect, useState } from 'react';
import type { ExplodeRing, Turret, CustomProjectileDesign } from '../../types';
import type { GameLogic } from '../../game/GameLogic';
import { cmMapOf } from '../../utils/colorMap';
import { bodyFill } from '../../utils/gameColors';
import { tileBackingScale } from './ShapePreviewComponents';
import { useClassicUi } from './useClassicUi';
import { explodeCount, explodeAngleDeg, EXPLODE_MAX_RINGS } from '../../game/explode';
import { cmHex, CM, CM_USE } from '../../utils/colorMap';
import { darkenColor } from '../../utils/p5Utils';
import { useGameDark } from '../../utils/useGameTheme';
import { gameGridLine } from './GameFloor';

const MARKS = 4;

function drawMark(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number, rad: number, edge = '') {
  ctx.beginPath();
  if (kind === 0) {
    ctx.arc(x, y, s, 0, Math.PI * 2);
  } else if (kind === 1) {
    for (let v = 0; v < 3; v++) {
      const a = rad + (Math.PI * 2 * v) / 3;
      const px = x + Math.cos(a) * s * 1.25;
      const py = y + Math.sin(a) * s * 1.25;
      if (v === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (kind === 2) {
    ctx.rect(x - s * 0.9, y - s * 0.9, s * 1.8, s * 1.8);
  } else {
    ctx.moveTo(x + s * 1.2, y);
    ctx.lineTo(x, y + s * 1.2);
    ctx.lineTo(x - s * 1.2, y);
    ctx.lineTo(x, y - s * 1.2);
    ctx.closePath();
  }
  ctx.fill();
  if (edge && s >= 1.6) { ctx.strokeStyle = edge; ctx.lineWidth = 1; ctx.stroke(); }
}

interface Barrel { a: number; l: number; w: number; asp: number }
export interface RoundLook { sides: number; depth: number; curved: boolean; fill: string; line: string; barrels: Barrel[] }
const mapVal = (v: number, a: number, b: number, c: number, d: number): number => c + ((v - a) * (d - c)) / (b - a);
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const barrelLen = (b: Barrel, r: number): number => Math.min(r * 2.6, mapVal(clamp(b.l, 1, 100), 1, 100, r * 0.01, r / 2 + r * 10));
const barrelWid = (b: Barrel, r: number): number => Math.min(r * 1.6, mapVal(clamp(b.w, 0, 50), 0, 50, 0, r * 0.96));

export function roundLookOf(t: Turret | undefined, inheritFill: string, designs: readonly CustomProjectileDesign[] | undefined): RoundLook {
  const pt = t?.projectileType;
  const named = pt?.customProjectileDesignName;
  const design = pt?.customProjectileDesign ?? (named && designs ? designs.find(d => d.name === named) ?? null : null);
  const visual = design?.visual ?? pt?.visual ?? 'bullet';
  const written = Number(design?.shape ?? pt?.shape);
  let sides = Number.isFinite(written) ? Math.round(written) : 0;
  if (sides > 0 && sides < 3) sides = 0;
  if (sides > -3 && sides < 0) sides = 0;
  if (!Number.isFinite(written) && (visual === 'drone' || visual === 'swarm')) sides = 3;
  else if (!Number.isFinite(written) && visual === 'trap') sides = 4;
  const depthRaw = Number(design?.trapDepth ?? pt?.trapDepth ?? 0);
  const depth = sides >= 3 && depthRaw > 0 ? Math.min(1, depthRaw) : 0;
  const curved = depth > 0 && !!(design?.trapCurved ?? pt?.trapCurved);
  const own = design
    ? (design.useTankColor || !design.color || design.color === 'inherit' ? '' : design.color)
    : (pt && pt.color && pt.color !== 'inherit' ? pt.color : '');
  const fill = own ? bodyFill(own, design ? null : cmMapOf(pt?.colorMap)) : inheritFill;
  const barrels: Barrel[] = [];
  for (const g of design?.turrets ?? []) {
    if (!g || g.turretType === 'auto') continue;
    barrels.push({ a: Number(g.angle) || 0, l: Number(g.length) || 0, w: Number(g.width) || 0, asp: Number(g.aspect) || 1 });
  }
  if (!design && visual === 'minion') barrels.push({ a: 0, l: 18, w: 30, asp: 1 });
  return { sides, depth, curved, fill, line: darkenColor(fill, 0.598), barrels };
}
export function burstLooksOf(bomb: Turret | undefined, rings: readonly ExplodeRing[], nr: number, tankFill: string,
  designs: readonly CustomProjectileDesign[] | undefined, ancestors: readonly Turret[] | undefined): { bomb: RoundLook; pieces: RoundLook[] } {
  let inherits = tankFill;
  if (ancestors) for (const a of ancestors) inherits = roundLookOf(a, inherits, designs).fill;
  const b = roundLookOf(bomb, inherits, designs);
  const pieces: RoundLook[] = [];
  for (let k = 0; k < nr; k++) pieces.push(roundLookOf(rings[k]?.fragment, b.fill, designs));
  return { bomb: b, pieces };
}
function reachOf(look: RoundLook): number {
  let k = 1;
  for (const b of look.barrels) k = Math.max(k, barrelLen(b, 1));
  return k;
}
const lookKey = (l: RoundLook): string => `${l.sides}|${l.depth}|${l.curved ? 1 : 0}|${l.fill}|${l.barrels.map(b => `${b.a},${b.l},${b.w},${b.asp}`).join(';')}`;

function drawRound(ctx: CanvasRenderingContext2D, look: RoundLook, x: number, y: number, r: number, facing: number, barrel: string, barrelLine: string): void {
  const edge = r >= 1.2;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(facing);
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(0.75, Math.min(1.6, r * 0.3));
  for (const b of look.barrels) {
    const L = barrelLen(b, r), W = barrelWid(b, r);
    if (!(L > 0) || !(W > 0)) continue;
    ctx.save();
    ctx.rotate(b.a);
    ctx.beginPath();
    ctx.moveTo(0, W / 2); ctx.lineTo(L, (W / 2) * b.asp); ctx.lineTo(L, -(W / 2) * b.asp); ctx.lineTo(0, -W / 2); ctx.closePath();
    ctx.fillStyle = barrel; ctx.fill();
    if (edge) { ctx.strokeStyle = barrelLine; ctx.stroke(); }
    ctx.restore();
  }
  ctx.beginPath();
  const n = Math.abs(look.sides);
  if (look.sides === 0) {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  } else if (look.sides > 0) {
    const off = n % 2 === 1 ? 0 : Math.PI / n;
    if (look.depth > 0) {
      const ri = r * (1 - look.depth);
      for (let i = 0; i < n; i++) {
        const a = off + (Math.PI * 2 * i) / n, h = off + (Math.PI * 2 * (i + 0.5)) / n, a2 = off + (Math.PI * 2 * (i + 1)) / n;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        if (look.curved) ctx.quadraticCurveTo(Math.cos(h) * ri, Math.sin(h) * ri, Math.cos(a2) * r, Math.sin(a2) * r);
        else { ctx.lineTo(Math.cos(h) * ri, Math.sin(h) * ri); ctx.lineTo(Math.cos(a2) * r, Math.sin(a2) * r); }
      }
    } else {
      for (let i = 0; i < n; i++) { const a = off + (Math.PI * 2 * i) / n; if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    }
    ctx.closePath();
  } else {
    for (let i = 0; i < n * 2; i++) { const a = (Math.PI * i) / n, rr = i % 2 === 0 ? r : r * 0.5; if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath();
  }
  ctx.fillStyle = look.fill;
  ctx.fill();
  if (edge) { ctx.strokeStyle = look.line; ctx.stroke(); }
  ctx.restore();
}

function drawClassic(ctx: CanvasRenderingContext2D, rings: readonly ExplodeRing[], nr: number, size: number, dark: boolean, barrel: string,
  bomb: RoundLook, pieces: readonly RoundLook[]): void {
  const G = CM_USE.GENERAL;
  ctx.fillStyle = cmHex(CM.BACKGROUND, dark, G);
  ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = gameGridLine(dark);
  ctx.lineWidth = 1;
  ctx.beginPath();
  const cell = size / 6;
  for (let i = 1; i < 6; i++) {
    const p = Math.round(i * cell) + 0.5;
    ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.moveTo(0, p); ctx.lineTo(size, p);
  }
  ctx.stroke();
  const barrelLine = darkenColor(barrel, 0.598);
  const c = size / 2;
  const rMax = size / 2 - 8;
  const rMin = nr > 4 ? size * 0.24 : size * 0.3;
  const bombR = Math.max(2, Math.min(size * 0.11, (rMin - 4) / (reachOf(bomb) + 0.4)));
  drawRound(ctx, bomb, c, c, bombR, 0, barrel, barrelLine);
  const base = nr <= 2 ? size * 0.05 : (nr <= 4 ? size * 0.042 : size * 0.034);
  const ringGap = nr > 1 ? (rMax - rMin) / (nr - 1) : Infinity;
  for (let k = 0; k < nr; k++) {
    const ring = rings[k];
    const look = pieces[k];
    if (!ring || !look) continue;
    const n = explodeCount(ring.count);
    const start = typeof ring.startDeg === 'number' && isFinite(ring.startDeg) ? ring.startDeg : 0;
    const arc = typeof ring.arcDeg === 'number' && isFinite(ring.arcDeg) ? ring.arcDeg : 360;
    const rk = nr === 1 ? (rMin + rMax) / 2 + 2 : rMin + ((rMax - rMin) * k) / (nr - 1);
    const alongGap = n <= 1 ? Infinity
      : (arc >= 360 ? (2 * Math.PI * rk) / n : (rk * (arc * Math.PI / 180)) / (n - 1));
    const room = Math.min(base * 1.25, ringGap * 0.5, alongGap * 0.5);
    const r = Math.max(0.9, room / reachOf(look));
    for (let i = 0; i < n; i++) {
      const rad = (explodeAngleDeg(n, start, arc, i) * Math.PI) / 180;
      drawRound(ctx, look, c + Math.cos(rad) * rk, c + Math.sin(rad) * rk, r, rad, barrel, barrelLine);
    }
  }
}

function cssVar(el: Element, name: string): string {
  const cs = getComputedStyle(el);
  return cs.getPropertyValue(name).trim() || cs.color;
}

export const ExplodeRingPreview: React.FC<{
  rings: readonly ExplodeRing[];
  size?: number;
  bomb?: Turret;
  logic?: GameLogic | null;
  bombAncestors?: readonly Turret[];
}> = ({ rings, size = 64, bomb, logic, bombAncestors }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const classic = useClassicUi();
  const gameDark = useGameDark();

  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const obs = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  const nr = rings.length < EXPLODE_MAX_RINGS ? rings.length : EXPLODE_MAX_RINGS;
  let geomKey = '';
  for (let k = 0; k < nr; k++) {
    const r = rings[k];
    geomKey += `${explodeCount(r?.count)},${r?.startDeg},${r?.arcDeg};`;
  }
  const st = logic?.state;
  const tankFill = st ? bodyFill(st.tankColor, cmMapOf(st.tankColorMap)) : cmHex(CM.BLUE, gameDark, CM_USE.TANK);
  const designs = st?.projectileDesigns;
  const looks = classic ? burstLooksOf(bomb, rings, nr, tankFill, designs, bombAncestors) : null;
  const bombLook = looks ? looks.bomb : null;
  const pieceLooks: RoundLook[] = looks ? looks.pieces : [];
  const lookKeyAll = bombLook ? lookKey(bombLook) + '/' + pieceLooks.map(lookKey).join('/') : '';

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = tileBackingScale();
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);
    if (classic && bombLook) { drawClassic(ctx, rings, nr, size, gameDark, cssVar(canvas, '--kc-grey'), bombLook, pieceLooks); return; }

    const inkPiece = cssVar(canvas, classic ? '--kc-white' : '--text-primary');
    const inkBomb = cssVar(canvas, classic ? '--kc-grey' : '--text-tertiary');
    const edge = classic ? cssVar(canvas, '--kc-ink') : '';
    const c = size / 2;
    const bombR = size * 0.08;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = edge || inkBomb;
    ctx.lineWidth = edge ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.moveTo(c + bombR, c);
    ctx.lineTo(c + bombR + size * 0.09, c);
    ctx.stroke();
    ctx.fillStyle = inkBomb;
    ctx.beginPath();
    ctx.arc(c, c, bombR, 0, Math.PI * 2);
    ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1.5; ctx.stroke(); }

    const rMax = size / 2 - 4;
    const rMin = nr > 4 ? size * 0.2 : size * 0.26;
    const base = nr <= 2 ? size * 0.04 : (nr <= 4 ? size * 0.034 : size * 0.028);
    const ringGap = nr > 1 ? (rMax - rMin) / (nr - 1) : Infinity;
    ctx.fillStyle = inkPiece;
    for (let k = 0; k < nr; k++) {
      const ring = rings[k];
      if (!ring) continue;
      const n = explodeCount(ring.count);
      const start = typeof ring.startDeg === 'number' && isFinite(ring.startDeg) ? ring.startDeg : 0;
      const arc = typeof ring.arcDeg === 'number' && isFinite(ring.arcDeg) ? ring.arcDeg : 360;
      const rk = nr === 1 ? (rMin + rMax) / 2 + 2 : rMin + ((rMax - rMin) * k) / (nr - 1);
      const alongGap = n <= 1 ? Infinity
        : (arc >= 360 ? (2 * Math.PI * rk) / n : (rk * (arc * Math.PI / 180)) / (n - 1));
      const mark = Math.max(0.7, Math.min(base, ringGap * 0.4, alongGap * 0.4));
      const kind = k % MARKS;
      for (let i = 0; i < n; i++) {
        const rad = (explodeAngleDeg(n, start, arc, i) * Math.PI) / 180;
        drawMark(ctx, kind, c + Math.cos(rad) * rk, c + Math.sin(rad) * rk, mark, rad, edge);
      }
    }
  }, [geomKey, lookKeyAll, nr, size, isDark, classic, gameDark]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} className="shrink-0 k-explode-pic" />;
};
