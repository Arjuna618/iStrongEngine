import type { GameLogic } from '../game/GameLogic';
import type { WebGLBulletRenderer } from '../game/WebGLRenderer';
import {
  TagAtlas, runNameTags, tagFontCss, tagFillCss, tagOutlineCss, tagTextX, tagTextY,
  TAG_ATLAS_W, TAG_ATLAS_H, TAG_QUAD_FLOATS, TAG_STROKE_F,
} from '../utils/nameTagArras';
import type { TagSink, TagView, TagTank } from '../utils/nameTagArras';
import type { EnemyTank } from '../types';
import { SMALL_FIX } from '../game/smallFixSwitch';

const TAG_BUDGET_SHARE = 0.08;
const TAG_BUDGET_MIN_MS = 0.3;
const TAG_BUDGET_MAX_MS = 1.5;

const _atlas = new TagAtlas(TAG_ATLAS_W, TAG_ATLAS_H);

const _quads = new Float32Array(TAG_QUAD_FLOATS * 2048);

const _view: TagView = {
  camX: 0, camY: 0, zoom: 1, W: 0, H: 0,
  minX: 0, maxX: 0, minY: 0, maxY: 0,
  now: 0, clock: 0, deathMs: 500, dark: false, showNames: true, showScores: true,
};

let _gl: WebGLBulletRenderer | null = null;
let _begun = false;
let _prevScale = 1;
let _startLogic: GameLogic | null = null;
const _startOf = (t: TagTank): number => (_startLogic === null ? 0 : _startLogic.shownScoreStartOf(t as unknown as EnemyTank));

let _genSeen = -1;
let _fontEpoch = 0;
let _fontEpochSeen = 0;
let _fontWatched = false;

function watchFont(): void {
  if (_fontWatched) return;
  _fontWatched = true;
  const fs = typeof document !== 'undefined' ? document.fonts : undefined;
  if (!fs) return;
  try {
    fs.addEventListener('loadingdone', () => { _fontEpoch++; });
    const probe = tagFontCss(16);
    if (!fs.check(probe)) fs.load(probe).then(() => { _fontEpoch++; }, () => { });
  } catch { }
}

export function tagAtlasReady(webgl: WebGLBulletRenderer): TagAtlas | null {
  if (!webgl.ensureTagAtlas(TAG_ATLAS_W, TAG_ATLAS_H)) return null;
  watchFont();
  const gen = webgl.getTagAtlasGen();
  if (gen !== _genSeen || _fontEpoch !== _fontEpochSeen) {
    _atlas.reset();
    _genSeen = gen;
    _fontEpochSeen = _fontEpoch;
  }
  return _atlas;
}

export function tagFontEpoch(): number { return _fontEpoch; }

let _scratch: OffscreenCanvas | null = null;
let _sctx: OffscreenCanvasRenderingContext2D | null = null;
let _fontPx = -1;

function scratchCtx(needW: number, needH: number): OffscreenCanvasRenderingContext2D | null {
  if (_scratch === null) {
    if (typeof OffscreenCanvas === 'undefined') return null;
    _scratch = new OffscreenCanvas(512, 64);
    _sctx = _scratch.getContext('2d', { alpha: true, willReadFrequently: true });
    if (_sctx === null) { _scratch = null; return null; }
    _fontPx = -1;
    _applyTextState(_sctx);
  }
  const c = _sctx!;
  if (needW > _scratch.width || needH > _scratch.height) {
    let w = _scratch.width, h = _scratch.height;
    while (w < needW) w *= 2;
    while (h < needH) h *= 2;
    _scratch.width = w;
    _scratch.height = h;
    _fontPx = -1;
    _applyTextState(c);
  }
  return c;
}

function _applyTextState(c: OffscreenCanvasRenderingContext2D): void {
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
}

function _setFont(c: OffscreenCanvasRenderingContext2D, px: number): void {
  if (px !== _fontPx) { _fontPx = px; c.font = tagFontCss(px); }
}

const _sink: TagSink = {
  clock(): number { return performance.now(); },
  measure(text: string, fontPx: number): number {
    const c = scratchCtx(0, 0);
    if (c === null) return 0;
    _setFont(c, fontPx);
    return c.measureText(text).width;
  },
  raster(text: string, fontPx: number, lwPx: number, w: number, bw: number, bh: number,
         x: number, y: number, dark: boolean): void {
    const c = scratchCtx(bw, bh);
    if (c === null || _gl === null) return;
    c.clearRect(0, 0, bw, bh);
    _setFont(c, fontPx);
    c.lineWidth = lwPx;
    c.strokeStyle = tagOutlineCss(dark);
    c.fillStyle = tagFillCss(dark);
    const tx = tagTextX(w, lwPx), ty = tagTextY(fontPx, lwPx);
    c.strokeText(text, tx, ty);
    c.fillText(text, tx, ty);
    _gl.uploadTagPixels(x, y, c.getImageData(0, 0, bw, bh));
  },
};

interface TagBounds { minX: number; maxX: number; minY: number; maxY: number; }

export function nameTagsDraw(
  webgl: WebGLBulletRenderer, logic: GameLogic, width: number, height: number,
  bounds: TagBounds, dark: boolean, deathMs: number, dtMs: number,
): boolean {
  const st = logic.state;
  const allNames = SMALL_FIX.R665 !== 0 && st.debugMode && st.debugShowAllNames === true;
  if (!st.showPlayerNames && !st.showPlayerScores && !allNames) return false;
  const tanks = st.enemyTanks;
  if (tanks.length === 0) return false;
  if (tagAtlasReady(webgl) === null) return false;
  if (scratchCtx(0, 0) === null) return false;

  const v = _view;
  v.camX = logic.cameraX; v.camY = logic.cameraY; v.zoom = logic.zoom;
  v.W = width; v.H = height;
  v.minX = bounds.minX; v.maxX = bounds.maxX; v.minY = bounds.minY; v.maxY = bounds.maxY;
  v.now = logic.gameNow();
  v.clock = performance.now();
  v.deathMs = deathMs;
  v.dark = dark;
  v.showNames = st.showPlayerNames || allNames;
  v.showScores = st.showPlayerScores;
  v.allNames = allNames;
  _startLogic = logic; v.startOf = _startOf;

  _gl = webgl;
  _begun = false;
  const share = dtMs * TAG_BUDGET_SHARE;
  _atlas.beginFrame(share < TAG_BUDGET_MIN_MS ? TAG_BUDGET_MIN_MS : share > TAG_BUDGET_MAX_MS ? TAG_BUDGET_MAX_MS : share);
  const quads = runNameTags(tanks, tanks.length, v, _atlas, _sink, _quads);
  if (quads === 0) return false;

  _prevScale = webgl.getRenderScale();
  webgl.setRenderScale(1);
  webgl.setCamera(width / 2, height / 2, 1, width, height);
  webgl.beginFrame();
  _begun = true;
  webgl.pushTagQuads(_quads, quads);

  webgl.setSampleAlphaToCoverage(false);
  webgl.setDepthMask(false);
  webgl.flushTags();
  webgl.setDepthMask(true);
  webgl.setSampleAlphaToCoverage(true);
  return true;
}

export function nameTagsDone(
  webgl: WebGLBulletRenderer, camX: number, camY: number, zoom: number, width: number, height: number,
): void {
  if (!_begun) return;
  _begun = false;
  webgl.setCamera(camX, camY, zoom, width, height);
  webgl.setRenderScale(_prevScale);
}

const _lblQuads = new Float32Array(TAG_QUAD_FLOATS * 8);

export function editorLabelsDraw(
  webgl: WebGLBulletRenderer, width: number, height: number, dark: boolean, dtMs: number,
  n: number, texts: readonly string[], xs: readonly number[], ys: readonly number[], fontPx: number,
): boolean {
  if (n <= 0 || tagAtlasReady(webgl) === null || scratchCtx(0, 0) === null) return false;
  _gl = webgl;
  _begun = false;
  const share = dtMs * TAG_BUDGET_SHARE;
  _atlas.beginFrame(share < TAG_BUDGET_MIN_MS ? TAG_BUDGET_MIN_MS : share > TAG_BUDGET_MAX_MS ? TAG_BUDGET_MAX_MS : share);
  const f10 = Math.round(fontPx * 10), l10 = Math.round(fontPx * TAG_STROKE_F * 10);
  const now = performance.now();
  let quads = 0, o = 0;
  for (let i = 0; i < n && quads < 8; i++) {
    const e = _atlas.get(texts[i], f10, l10, dark, now, _sink);
    if (e === null) continue;
    e.lastUse = now;
    _lblQuads[o] = xs[i]; _lblQuads[o + 1] = ys[i]; _lblQuads[o + 2] = e.bw; _lblQuads[o + 3] = e.bh; _lblQuads[o + 4] = 1;
    _lblQuads[o + 5] = e.u0; _lblQuads[o + 6] = e.v0; _lblQuads[o + 7] = e.uw; _lblQuads[o + 8] = e.vh;
    o += TAG_QUAD_FLOATS; quads++;
  }
  if (quads === 0) return false;
  _prevScale = webgl.getRenderScale();
  webgl.setRenderScale(1);
  webgl.setCamera(width / 2, height / 2, 1, width, height);
  webgl.beginFrame();
  _begun = true;
  webgl.pushTagQuads(_lblQuads, quads);
  webgl.setSampleAlphaToCoverage(false);
  webgl.setDepthMask(false);
  webgl.flushTags();
  webgl.setDepthMask(true);
  webgl.setSampleAlphaToCoverage(true);
  return true;
}
