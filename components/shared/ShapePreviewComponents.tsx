import React, { useRef, useEffect } from 'react';
import { getRealSizeFactor } from '../../utils/p5Utils';
import { getEffectiveDPR } from '../../utils/zoomCompensation';
import {
  labyDownscale,
  updateAnimatedColors, getAnimatedColor,
} from '../../game/ShapeRegistry';
import { solidOf, solidPath, SOLID_STROKE_OF_BORDER, SOLID_STILL_X, SOLID_STILL_Y } from '../../utils/solidArras';
import { isGameDark } from '../../utils/gameColors';
import { makeTileLoop, type AnimTile } from '../../utils/animTileLoop';

export function tileBackingScale(): number { return Math.max(2, getEffectiveDPR() * 1.5); }

export function polyAngleOffset(sides: number): number {
  if (sides <= 2) return 0;
  return sides % 2 === 0 ? -Math.PI / sides : -Math.PI / 2;
}

export function drawSimplePolygon(ctx: CanvasRenderingContext2D, sides: number, radius: number, angleOffset: number) {
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides + angleOffset;
    const x = radius * Math.cos(a);
    const y = radius * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

const _DARKEN_HEX_CACHE_MAX = 4096;
let _darkenHexCache: Record<string, string> = Object.create(null);
let _darkenHexCount = 0;

export function darkenHexSimple(color: string): string {
  if (!color.startsWith('#') || color.length < 7) return '#888';
  const cached = _darkenHexCache[color];
  if (cached !== undefined) return cached;
  const num = parseInt(color.slice(1), 16);
  const r = Math.max(0, Math.floor(((num >> 16) & 0xff) * 0.65));
  const g = Math.max(0, Math.floor(((num >> 8) & 0xff) * 0.65));
  const b = Math.max(0, Math.floor((num & 0xff) * 0.65));
  const result = `rgb(${r},${g},${b})`;
  if (_darkenHexCount >= _DARKEN_HEX_CACHE_MAX) {
    _darkenHexCache = Object.create(null);
    _darkenHexCount = 0;
  }
  _darkenHexCache[color] = result;
  _darkenHexCount++;
  return result;
}

export function drawShapePreview(
  ctx: CanvasRenderingContext2D,
  previewSize: number,
  sides: number,
  color: string,
  options?: {
    labyLevel?: number;
    isPolyhedron?: boolean;
    polyhedronType?: string;
  }
) {
  const cx = previewSize / 2;
  const cy = previewSize / 2;
  const r = (previewSize / 2) * 0.7;
  const maxR = (previewSize / 2) - 1;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.5;

  const strokeCol = darkenHexSimple(color);

  if (options?.isPolyhedron && options.polyhedronType) {
    const solid = solidOf(options.polyhedronType);
    if (solid) {
      ctx.beginPath();
      solidPath(ctx, solid, SOLID_STILL_X, SOLID_STILL_Y, 0, 0, Math.min(r, maxR / solid.circumradius));
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = strokeCol;
      ctx.lineWidth = 1.5 * SOLID_STROKE_OF_BORDER;
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = strokeCol;
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    if (sides === 0) {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    } else {
      const visualR = Math.min(r * getRealSizeFactor(sides), maxR);
      drawSimplePolygon(ctx, sides, visualR, polyAngleOffset(sides));
    }
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = strokeCol;
    ctx.stroke();

    if (options?.labyLevel && options.labyLevel > 0) {
      if (sides === 0) {
        const ds = labyDownscale(0);
        for (let li = 1; li <= options.labyLevel; li++) {
          const layerR = r * Math.pow(ds, li);
          ctx.beginPath();
          ctx.arc(0, 0, layerR, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = strokeCol;
          ctx.stroke();
        }
      } else {
        const ds = labyDownscale(sides);
        const outerR = Math.min(r * getRealSizeFactor(sides), maxR);
        for (let li = 1; li <= options.labyLevel; li++) {
          const layerR = outerR * Math.pow(ds, li);
          const layerAngle = (li % 2 === 0)
            ? polyAngleOffset(sides)
            : polyAngleOffset(sides) + Math.PI / sides;
          ctx.beginPath();
          drawSimplePolygon(ctx, sides, layerR, layerAngle);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = strokeCol;
          ctx.stroke();
        }
      }
    }
  }

  ctx.restore();
}

export const ShapePreview: React.FC<{
  sides: number;
  color: string;
  size?: number;
  labyLevel?: number;
  isPolyhedron?: boolean;
  polyhedronType?: string;
}> = ({ sides, color, size = 28, labyLevel, isPolyhedron, polyhedronType }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
    drawShapePreview(ctx, size, sides, color, {
      labyLevel, isPolyhedron, polyhedronType,
    });
  }, [sides, color, size, labyLevel, isPolyhedron, polyhedronType]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} className="shrink-0" />;
};

const _tileLoop = makeTileLoop(
  cb => requestAnimationFrame(cb),
  id => cancelAnimationFrame(id),
  () => updateAnimatedColors(performance.now() / 16.67),
);
export function wakeAnimatedTiles(): void { _tileLoop.wake(); }

const _tileOfCanvas = new WeakMap<Element, AnimTile>();
const _tileObserver: IntersectionObserver | null = typeof IntersectionObserver !== 'undefined'
  ? new IntersectionObserver(entries => {
      let cameIn = false;
      for (let i = 0; i < entries.length; i++) {
        const tile = _tileOfCanvas.get(entries[i].target);
        if (tile === undefined) continue;
        tile.onScreen = entries[i].isIntersecting;
        if (tile.onScreen) cameIn = true;
      }
      if (cameIn) _tileLoop.wake();
    })
  : null;

export const AnimatedShapePreview: React.FC<{
  sides: number;
  animationType: string;
  size?: number;
  labyLevel?: number;
  live?: { current: boolean };
}> = ({ sides, animationType, size = 28, labyLevel, live }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = tileBackingScale();
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const opts = { labyLevel };
    const draw = (): void => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      drawShapePreview(ctx, size, sides, getAnimatedColor(animationType, isGameDark()), opts);
    };
    updateAnimatedColors(performance.now() / 16.67);
    draw();
    const tile: AnimTile = { onScreen: _tileObserver === null, live: live ?? null, draw };
    if (_tileObserver !== null) { _tileOfCanvas.set(canvas, tile); _tileObserver.observe(canvas); }
    _tileLoop.add(tile);
    return () => {
      _tileLoop.remove(tile);
      if (_tileObserver !== null) { _tileObserver.unobserve(canvas); _tileOfCanvas.delete(canvas); }
    };
  }, [sides, animationType, size, labyLevel, live]);

  return <canvas ref={canvasRef} width={size} height={size} style={{ width: size, height: size }} className="shrink-0" />;
};
