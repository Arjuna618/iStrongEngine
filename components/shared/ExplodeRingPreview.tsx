import React, { useRef, useEffect, useState } from 'react';
import type { ExplodeRing } from '../../types';
import { tileBackingScale } from './ShapePreviewComponents';
import { explodeCount, explodeAngleDeg, EXPLODE_MAX_RINGS } from '../../game/explode';

const MARKS = 4;

function drawMark(ctx: CanvasRenderingContext2D, kind: number, x: number, y: number, s: number, rad: number) {
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
}

function cssVar(el: Element, name: string): string {
  const cs = getComputedStyle(el);
  return cs.getPropertyValue(name).trim() || cs.color;
}

export const ExplodeRingPreview: React.FC<{
  rings: readonly ExplodeRing[];
  size?: number;
}> = ({ rings, size = 64 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const inkPiece = cssVar(canvas, '--text-primary');
    const inkBomb = cssVar(canvas, '--text-tertiary');
    const c = size / 2;
    const bombR = size * 0.08;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = inkBomb;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(c + bombR, c);
    ctx.lineTo(c + bombR + size * 0.09, c);
    ctx.stroke();
    ctx.fillStyle = inkBomb;
    ctx.beginPath();
    ctx.arc(c, c, bombR, 0, Math.PI * 2);
    ctx.fill();

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
        drawMark(ctx, kind, c + Math.cos(rad) * rk, c + Math.sin(rad) * rk, mark, rad);
      }
    }
  }, [geomKey, nr, size, isDark]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} className="shrink-0" />;
};
