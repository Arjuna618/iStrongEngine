import type { TankConfig } from '../types';
import {
  ctIconParts, CT_ICON_FACING, CT_PART_STRIDE, CT_MESH_BARREL, CT_MESH_CIRCLE, CT_MESH_POLY0,
  CT_MESH_POLY_MAX_SIDES, CT_MESH_CROSS, CT_MESH_STAR0, ctStarMeshes,
} from './classTreeIcon';
import { HEALER_CROSS_X, HEALER_CROSS_Y, roundedStarPath } from '../components/shared/tankIconRenderer';
import { hudCss, hudIconOutline } from './hudArras';

export interface HudIcon {
  parts: Float64Array;
  count: number;
  fill: string[];
  stroke: string[];
}

export function hudBuildIcon(config: TankConfig, dark: boolean, bodyOverride: string | undefined): HudIcon {
  const out: number[] = [];
  ctIconParts(config, dark, bodyOverride, out);
  const count = out.length / CT_PART_STRIDE;
  const fill: string[] = new Array(count);
  const stroke: string[] = new Array(count);
  for (let i = 0; i < count; i++) {
    const o = i * CT_PART_STRIDE;
    const rgb: [number, number, number] = [
      Math.round(out[o + 6] * 255), Math.round(out[o + 7] * 255), Math.round(out[o + 8] * 255),
    ];
    fill[i] = hudCss(rgb);
    stroke[i] = hudCss(hudIconOutline(rgb, dark));
  }
  return { parts: Float64Array.from(out), count, fill, stroke };
}

export function hudDrawIcon(ctx: CanvasRenderingContext2D, icon: HudIcon, cx: number, cy: number,
  sizePx: number, angle: number, outlinePx: number, k: number): void {
  const p = icon.parts;
  const turn = angle - CT_ICON_FACING;
  const c = Math.cos(turn), s = Math.sin(turn);
  ctx.lineJoin = 'round';
  for (let i = 0; i < icon.count; i++) {
    const o = i * CT_PART_STRIDE;
    const mesh = p[o];
    const px = p[o + 1] * sizePx, py = p[o + 2] * sizePx;
    const rot = turn + p[o + 3];
    const cr = Math.cos(rot), sr = Math.sin(rot);
    ctx.setTransform(k * cr, k * sr, -k * sr, k * cr, k * (cx + px * c - py * s), k * (cy + px * s + py * c));
    const sx = p[o + 4] * sizePx;
    let lw = 2 * outlinePx;
    ctx.beginPath();
    if (mesh === CT_MESH_BARREL) {
      const hw = p[o + 5] * sizePx / 2;
      const a = p[o + 9];
      ctx.moveTo(0, -hw);
      ctx.lineTo(sx, -hw * a);
      ctx.lineTo(sx, hw * a);
      ctx.lineTo(0, hw);
      ctx.closePath();
    } else if (mesh === CT_MESH_CIRCLE) {
      ctx.arc(0, 0, sx, 0, Math.PI * 2);
    } else if (mesh === CT_MESH_CROSS) {
      ctx.moveTo(HEALER_CROSS_X[0] * sx, HEALER_CROSS_Y[0] * sx);
      for (let v = 1; v < 12; v++) ctx.lineTo(HEALER_CROSS_X[v] * sx, HEALER_CROSS_Y[v] * sx);
      ctx.closePath();
      lw *= 0.7;
    } else if (mesh >= CT_MESH_POLY0 && mesh < CT_MESH_POLY0 + CT_MESH_POLY_MAX_SIDES - 2) {
      const n = mesh - CT_MESH_POLY0 + 3;
      ctx.moveTo(sx, 0);
      for (let v = 1; v < n; v++) {
        const a = (Math.PI * 2 * v) / n;
        ctx.lineTo(sx * Math.cos(a), sx * Math.sin(a));
      }
      ctx.closePath();
    } else {
      const st = ctStarMeshes[mesh - CT_MESH_STAR0];
      if (!st) continue;
      if (st.outline) {
        const pts = st.outline;
        ctx.moveTo(pts[0][0] * sx, pts[0][1] * sx);
        for (let v = 1; v < pts.length; v++) ctx.lineTo(pts[v][0] * sx, pts[v][1] * sx);
        ctx.closePath();
      } else if (st.line) {
        ctx.moveTo(-sx, 0);
        ctx.lineTo(sx, 0);
        ctx.lineCap = 'round';
        ctx.lineWidth = lw;
        ctx.strokeStyle = icon.stroke[i];
        ctx.stroke();
        ctx.lineCap = 'butt';
        continue;
      } else {
        roundedStarPath(ctx, st.sides, sx, sx * (1 - st.depth), 0, st.curved);
      }
    }
    ctx.lineWidth = lw;
    ctx.strokeStyle = icon.stroke[i];
    ctx.stroke();
    ctx.fillStyle = icon.fill[i];
    ctx.fill();
  }
}
