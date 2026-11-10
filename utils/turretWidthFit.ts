import type { Turret } from '../types';
import { getSideNorm } from './p5Utils';

export type FormationKind = 'single' | 'side-by-side' | 'uniform';

export interface WidthFitInput {
  pieces: readonly Pick<Turret, 'width' | 'yOffset' | 'xOffset' | 'aspect' | 'turretType'>[];
  activeSides: number;
  snapEnabled: boolean;
  barrelSizePx: number;
  isEditingTurretAuto?: boolean;
}

export interface WidthFitResult {
  applied: true;
  kind: FormationKind;
  kWidth: number;
  newWidths: readonly number[];
  newYOffsets: readonly number[];
}

const _scratchWidths: number[] = [];
const _scratchYOffsets: number[] = [];
const _result: { applied: true; kind: FormationKind; kWidth: number; newWidths: readonly number[]; newYOffsets: readonly number[] } = {
  applied: true, kind: 'single', kWidth: 1, newWidths: _scratchWidths, newYOffsets: _scratchYOffsets,
};
const _sortIdx: number[] = [];
const _sortCenterPx: number[] = [];
const _sortLowPx: number[] = [];
const _sortHighPx: number[] = [];
const _sortPxWidth: number[] = [];

function _mapWidthToPx(width: number, sizePx: number): number {
  return width / 50 * sizePx * 0.96;
}

function _pxToStoredWidth(pxWidth: number, sizePx: number): number {
  return pxWidth * 50 / (sizePx * 0.96);
}

export function computeWidthFitAdjustment(input: WidthFitInput): WidthFitResult | null {
  if (!input.snapEnabled) return null;
  if (input.activeSides < 3) return null;
  if (input.pieces.length === 0) return null;
  if (input.isEditingTurretAuto) return null;
  if (input.barrelSizePx <= 0) return null;

  const pieces = input.pieces;
  const sizePx = input.barrelSizePx;
  const flatSidePx = sizePx * getSideNorm(input.activeSides);
  if (flatSidePx <= 0) return null;
  const targetPx = flatSidePx * 0.9;

  _scratchWidths.length = 0;
  _scratchYOffsets.length = 0;
  for (let i = 0; i < pieces.length; i++) {
    _scratchWidths.push(pieces[i].width);
    _scratchYOffsets.push(pieces[i].yOffset);
  }

  _sortIdx.length = 0;
  _sortPxWidth.length = 0;
  _sortCenterPx.length = 0;
  _sortLowPx.length = 0;
  _sortHighPx.length = 0;
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (p.turretType === 'auto') continue;
    const pxW = _mapWidthToPx(p.width, sizePx);
    const pxC = p.yOffset * sizePx / 2;
    _sortIdx.push(i);
    _sortPxWidth.push(pxW);
    _sortCenterPx.push(pxC);
    _sortLowPx.push(pxC - pxW / 2);
    _sortHighPx.push(pxC + pxW / 2);
  }

  const nonAutoCount = _sortIdx.length;
  if (nonAutoCount === 0) return null;
  let minLow = Infinity;
  let maxHigh = -Infinity;
  let sumWidths = 0;
  for (let j = 0; j < nonAutoCount; j++) {
    if (_sortLowPx[j] < minLow) minLow = _sortLowPx[j];
    if (_sortHighPx[j] > maxHigh) maxHigh = _sortHighPx[j];
    sumWidths += _sortPxWidth[j];
  }
  const spanPx = maxHigh - minLow;
  if (spanPx <= targetPx) return null;
  let kind: FormationKind = 'uniform';
  if (nonAutoCount === 1) {
    kind = 'single';
  } else {
    let xOffMin = Infinity;
    let xOffMax = -Infinity;
    let yOffMin = Infinity;
    let yOffMax = -Infinity;
    for (let j = 0; j < nonAutoCount; j++) {
      const p = pieces[_sortIdx[j]];
      if (p.xOffset < xOffMin) xOffMin = p.xOffset;
      if (p.xOffset > xOffMax) xOffMax = p.xOffset;
      if (p.yOffset < yOffMin) yOffMin = p.yOffset;
      if (p.yOffset > yOffMax) yOffMax = p.yOffset;
    }
    const xSpread = xOffMax - xOffMin;
    const ySpread = yOffMax - yOffMin;
    if (xSpread <= 0.1 && ySpread > 0.1) {
      kind = 'side-by-side';
    }
  }

  for (let a = 1; a < nonAutoCount; a++) {
    const idx = _sortIdx[a];
    const pxW = _sortPxWidth[a];
    const pxC = _sortCenterPx[a];
    const pxL = _sortLowPx[a];
    const pxH = _sortHighPx[a];
    let b = a - 1;
    while (b >= 0 && _sortCenterPx[b] > pxC) {
      _sortIdx[b + 1] = _sortIdx[b];
      _sortPxWidth[b + 1] = _sortPxWidth[b];
      _sortCenterPx[b + 1] = _sortCenterPx[b];
      _sortLowPx[b + 1] = _sortLowPx[b];
      _sortHighPx[b + 1] = _sortHighPx[b];
      b--;
    }
    _sortIdx[b + 1] = idx;
    _sortPxWidth[b + 1] = pxW;
    _sortCenterPx[b + 1] = pxC;
    _sortLowPx[b + 1] = pxL;
    _sortHighPx[b + 1] = pxH;
  }

  let useB = kind === 'side-by-side';
  const sumGapsPx = spanPx - sumWidths;
  const newSumWidthsB = targetPx - sumGapsPx;
  if (useB && (sumGapsPx <= 0 || newSumWidthsB <= 0)) useB = false;

  if (useB) {
    for (let j = 1; j < nonAutoCount; j++) {
      const gap = _sortLowPx[j] - _sortHighPx[j - 1];
      if (gap < 0) { useB = false; break; }
    }
  }

  if (!useB) {
    const kWidth = targetPx / spanPx;
    for (let j = 0; j < nonAutoCount; j++) {
      const origIdx = _sortIdx[j];
      const orig = pieces[origIdx];
      _scratchWidths[origIdx] = orig.width * kWidth;
      if (kind !== 'single') {
        _scratchYOffsets[origIdx] = orig.yOffset * kWidth;
      }
    }
    _result.kind = kind; _result.kWidth = kWidth;
    return _result;
  }

  const kWidth = newSumWidthsB / sumWidths;

  for (let j = 0; j < nonAutoCount; j++) _sortPxWidth[j] *= kWidth;

  _sortCenterPx[0] = 0;
  for (let j = 1; j < nonAutoCount; j++) {
    const oldGapPx = _sortLowPx[j] - _sortHighPx[j - 1];
    _sortCenterPx[j] =
      _sortCenterPx[j - 1] + _sortPxWidth[j - 1] / 2 + oldGapPx + _sortPxWidth[j] / 2;
  }

  const oldCentroidPx = (minLow + maxHigh) / 2;
  let newMinLow = Infinity;
  let newMaxHigh = -Infinity;
  for (let j = 0; j < nonAutoCount; j++) {
    const lo = _sortCenterPx[j] - _sortPxWidth[j] / 2;
    const hi = _sortCenterPx[j] + _sortPxWidth[j] / 2;
    if (lo < newMinLow) newMinLow = lo;
    if (hi > newMaxHigh) newMaxHigh = hi;
  }
  const newCentroidPx = (newMinLow + newMaxHigh) / 2;
  const shiftPx = oldCentroidPx - newCentroidPx;

  for (let j = 0; j < nonAutoCount; j++) {
    const origIdx = _sortIdx[j];
    const newCenterPx = _sortCenterPx[j] + shiftPx;
    _scratchWidths[origIdx] = _pxToStoredWidth(_sortPxWidth[j], sizePx);
    _scratchYOffsets[origIdx] = newCenterPx * 2 / sizePx;
  }

  _result.kind = 'side-by-side'; _result.kWidth = kWidth;
  return _result;
}

export function readAdjustedWidth(
  piece: Pick<Turret, 'width'>,
  idx: number,
  adj: WidthFitResult | null,
): number {
  if (!adj) return piece.width;
  return adj.newWidths[idx];
}

export function readAdjustedYOffset(
  piece: Pick<Turret, 'yOffset'>,
  idx: number,
  adj: WidthFitResult | null,
): number {
  if (!adj) return piece.yOffset;
  return adj.newYOffsets[idx];
}
