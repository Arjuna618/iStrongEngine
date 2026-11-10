import type { GameLogic } from '../game/GameLogic';
import type { WebGLBulletRenderer } from '../game/WebGLRenderer';
import type { EnemyTank } from '../types';
import { TEAM_COLORS_DARK, TEAM_COLORS_LIGHT } from '../types';
import { tagAtlasReady, tagFontEpoch } from './nameTagGL';
import { TAG_QUAD_FLOATS, tagFontCss, tagStrokeWorld, tagEdge, tagHalfView, tagFade, tagDeathFade, TAG_SETTLE_MS } from '../utils/nameTagArras';
import type { TagAtlas, TagEntry } from '../utils/nameTagArras';
import { hudColors, hudMix, hudSlot, hudCss, HUD_SLOT } from '../utils/hudArras';
import { bodyFill } from '../utils/gameColors';
import { drawnOpacity } from '../utils/seenRule';
import {
  CHAT_BUBBLE_ALPHA, CHAT_BUBBLE_MIX, CHAT_BUBBLE_R, CHAT_FONT, CHAT_SLOT_U, CHAT_BOX_SPAN, CHAT_BOX_R, CHAT_BOX_OUTLINE_R,
  CHAT_BOX_FONT, CHAT_BOX_LINE, chatAbove, chatBubbleFade, chatGlide, chatBoxEase, CHAT_BOX_EASE_S,
} from '../game/chatRules';
import { CHAT_PLAYER_ID, type ChatLine } from '../game/chat';
import { chatInputPlace, chatInputHide } from './ChatInput';

const _quads = new Float32Array(TAG_QUAD_FLOATS * 512);

interface ChatPic {
  e: TagEntry | null;
  zMade: number; zWant: number; since: number;
  fill: string; text: string; ink: string; epoch: number;
}
const _pics = new WeakMap<object, ChatPic>();
const _barKey = {};

function zoomBucket(z: number): number { return Math.pow(2, Math.ceil(Math.log2(z) * 8 - 1e-9) / 8); }

let _scratch: OffscreenCanvas | null = null;
let _sctx: OffscreenCanvasRenderingContext2D | null = null;
function scratch(w: number, h: number): OffscreenCanvasRenderingContext2D | null {
  if (_scratch === null) {
    if (typeof OffscreenCanvas === 'undefined') return null;
    _scratch = new OffscreenCanvas(512, 64);
    _sctx = _scratch.getContext('2d', { alpha: true, willReadFrequently: true });
    if (_sctx === null) { _scratch = null; return null; }
  }
  if (w > _scratch.width || h > _scratch.height) {
    let W = _scratch.width, H = _scratch.height;
    while (W < w) W *= 2;
    while (H < h) H *= 2;
    _scratch.width = W; _scratch.height = H;
  }
  return _sctx;
}

function capsule(c: OffscreenCanvasRenderingContext2D, x0: number, x1: number, cy: number, r: number): void {
  c.beginPath();
  c.arc(x0, cy, r, Math.PI / 2, Math.PI * 1.5);
  c.arc(x1, cy, r, -Math.PI / 2, Math.PI / 2);
  c.closePath();
}

function makeBubble(atlas: TagAtlas, gl: WebGLBulletRenderer, text: string, z: number, fill: string, txt: string, ink: string, now: number): TagEntry | null {
  const font = CHAT_FONT * z, lw = tagStrokeWorld(CHAT_FONT) * z, r = CHAT_BUBBLE_R * z;
  let c = scratch(64, 64);
  if (c === null) return null;
  c.font = tagFontCss(font);
  const w = c.measureText(text).width;
  const bw = Math.ceil(w + 2 * r) + 2, bh = Math.ceil(2 * r) + 2;
  const e = atlas.place(bw, bh, now);
  if (e === null) return null;
  c = scratch(bw, bh);
  if (c === null) return null;
  c.clearRect(0, 0, bw, bh);
  const cx = bw / 2, cy = bh / 2;
  c.globalAlpha = CHAT_BUBBLE_ALPHA;
  c.fillStyle = fill;
  capsule(c, cx - w / 2, cx + w / 2, cy, r);
  c.fill();
  c.globalAlpha = 1;
  c.font = tagFontCss(font);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.lineJoin = 'round';
  c.lineWidth = lw;
  c.strokeStyle = ink;
  c.fillStyle = txt;
  c.strokeText(text, cx, cy);
  c.fillText(text, cx, cy);
  gl.uploadTagPixels(e.x, e.y, c.getImageData(0, 0, bw, bh));
  return e;
}

function makeBar(atlas: TagAtlas, gl: WebGLBulletRenderer, z: number, fill: string, ink: string, now: number): TagEntry | null {
  const span = CHAT_BOX_SPAN * z, r = CHAT_BOX_R * z, ro = CHAT_BOX_OUTLINE_R * z;
  const bw = Math.ceil(span + 2 * ro) + 2, bh = Math.ceil(2 * ro) + 2;
  const e = atlas.place(bw, bh, now);
  if (e === null) return null;
  const c = scratch(bw, bh);
  if (c === null) return null;
  c.clearRect(0, 0, bw, bh);
  const cx = bw / 2, cy = bh / 2;
  c.globalAlpha = 1;
  c.fillStyle = ink;
  capsule(c, cx - span / 2, cx + span / 2, cy, ro);
  c.fill();
  c.fillStyle = fill;
  capsule(c, cx - span / 2, cx + span / 2, cy, r);
  c.fill();
  gl.uploadTagPixels(e.x, e.y, c.getImageData(0, 0, bw, bh));
  return e;
}

function picFor(key: object, atlas: TagAtlas, z: number, now: number, fill: string, txt: string, ink: string,
  make: (zz: number) => TagEntry | null): ChatPic | null {
  let p = _pics.get(key);
  if (p === undefined) {
    p = { e: null, zMade: 0, zWant: z, since: now - TAG_SETTLE_MS, fill: '', text: '', ink: '', epoch: -1 };
    _pics.set(key, p);
  }
  const ep = tagFontEpoch();
  if (p.fill !== fill || p.text !== txt || p.ink !== ink || p.epoch !== ep) { p.e = null; p.fill = fill; p.text = txt; p.ink = ink; p.epoch = ep; }
  if (Math.abs(z - p.zWant) > 1e-6) { p.zWant = z; p.since = now; }
  if (p.e !== null && !atlas.owns(p.e)) p.e = null;
  const rest = now - p.since >= TAG_SETTLE_MS;
  const want = rest ? z : (p.e !== null && p.zMade >= z && p.zMade * 0.917 <= z ? p.zMade : zoomBucket(z));
  if (p.e === null || Math.abs(p.zMade - want) > 1e-6) {
    if (atlas.budgetOpen()) {
      const t0 = performance.now();
      const e = make(want);
      atlas.charge(performance.now() - t0);
      if (e !== null) { p.e = e; p.zMade = want; }
    }
  }
  if (p.e === null) return null;
  p.e.lastUse = now;
  return p;
}

const _fillCache: Record<string, string> = {};
function bubbleFill(hex: string, dark: boolean): string {
  const k = dark ? 'd' + hex : 'l' + hex;
  let v = _fillCache[k];
  if (v === undefined) {
    const n = parseInt(hex.charCodeAt(0) === 35 ? hex.slice(1, 7) : hex.slice(0, 6), 16) || 0;
    v = hudCss(hudMix([(n >> 16) & 255, (n >> 8) & 255, n & 255], hudSlot(HUD_SLOT.INK, dark), CHAT_BUBBLE_MIX));
    _fillCache[k] = v;
  }
  return v;
}
function playerHex(logic: GameLogic, dark: boolean): string {
  const s = logic.state;
  if (logic.admin.colorsOn && logic.admin.playerSlot() >= 0) return bodyFill('', logic.admin.playerSlot());
  const pci = logic.playerColorTeamIndex();
  if (pci >= 0) return dark ? TEAM_COLORS_DARK[pci] : TEAM_COLORS_LIGHT[pci];
  return bodyFill(s.tankColor, s.tankColorMap);
}
function botHex(logic: GameLogic, e: EnemyTank, dark: boolean): string {
  const mci = logic.enemyColorTeamIndex(e);
  if (mci >= 0) return dark ? TEAM_COLORS_DARK[mci] : TEAM_COLORS_LIGHT[mci];
  return bodyFill(e.color, e.colorMap);
}

let _begun = false;
let _prevScale = 1;
let _nq = 0;

function pushQuad(e: TagEntry, cx: number, cy: number, scale: number, alpha: number, W: number, H: number): void {
  if (_nq * TAG_QUAD_FLOATS >= _quads.length) return;
  const qw = e.bw * scale, qh = e.bh * scale;
  if (cx + qw / 2 <= 0 || cx - qw / 2 >= W || cy + qh / 2 <= 0 || cy - qh / 2 >= H) return;
  if (Math.abs(scale - 1) < 1e-6) { cx = Math.floor(cx - qw / 2) + qw / 2; cy = Math.floor(cy - qh / 2) + qh / 2; }
  const o = _nq * TAG_QUAD_FLOATS;
  _quads[o] = cx; _quads[o + 1] = cy; _quads[o + 2] = qw; _quads[o + 3] = qh; _quads[o + 4] = alpha;
  _quads[o + 5] = e.u0; _quads[o + 6] = e.v0; _quads[o + 7] = e.uw; _quads[o + 8] = e.vh;
  _nq++;
}

function drawSpeaker(atlas: TagAtlas, gl: WebGLBulletRenderer, logic: GameLogic, lines: readonly ChatLine[], wx: number, wy: number,
  r: number, lift: number, g: number, fill: string, txt: string, ink: string, now: number, clock: number, W: number, H: number): void {
  const z = logic.zoom;
  const n = lines.length;
  if (n === 0) return;
  const newest = lines[n - 1];
  const glide = chatGlide(now - newest.born);
  const sx = (wx - logic.cameraX) * z + W * 0.5;
  for (let k = n - 1; k >= 0; k--) {
    const line = lines[k];
    const a = chatBubbleFade(now - line.born) * g;
    if (!(a > 0)) continue;
    const idx = n - 1 - k;
    const slot = (idx === 0 ? 0 : idx - 1 + glide) + lift;
    const wyC = wy - chatAbove(r) - slot * CHAT_SLOT_U;
    const p = picFor(line, atlas, z, clock, fill, txt, ink, (zz) => makeBubble(atlas, gl, line.text, zz, fill, txt, ink, clock));
    if (p === null || p.e === null) continue;
    pushQuad(p.e, sx, (wyC - logic.cameraY) * z + H * 0.5, z / p.zMade, a, W, H);
  }
}

interface ChatBounds { minX: number; maxX: number; minY: number; maxY: number; }

export function chatDraw(webgl: WebGLBulletRenderer, logic: GameLogic, width: number, height: number, bounds: ChatBounds,
  dark: boolean, dpr: number, deathMs: number, playerSize: number): boolean {
  const rec = logic.chat;
  const clock = performance.now();
  const boxA = chatBoxEase(rec.boxOpen, clock - rec.boxSince);
  const boxOn = rec.boxOpen || clock - rec.boxSince < CHAT_BOX_EASE_S * 1000;
  if (rec.boxOpen && !logic.chatCanOpen()) logic.chatClose(clock);
  if (!boxOn) chatInputHide();
  if (rec.speakers.size === 0 && !boxOn) return false;
  const atlas = tagAtlasReady(webgl);
  if (atlas === null) { chatInputHide(); return false; }
  const now = logic.gameNow();
  const col = hudColors(dark);
  const z = logic.zoom;
  _nq = 0;
  atlas.beginFrame(1.5);

  const halfView = tagHalfView(width, height, z);
  if (rec.speakers.size !== 0) {
    const et = logic.state.enemyTanks;
    for (let i = 0; i < et.length; i++) {
      const e = et[i];
      if (!e.active) continue;
      const sp = rec.speakers.get(e.id);
      if (sp === undefined) continue;
      rec.prune(sp, now);
      if (sp.lines.length === 0) { rec.drop(e.id); continue; }
      const px = e.position.x, py = e.position.y, reach = e.size * 4 + 200;
      if (px + reach < bounds.minX || px - reach > bounds.maxX || py + reach < bounds.minY || py - reach > bounds.maxY) continue;
      const r = e.size * 0.5;
      const E = tagEdge(px - logic.cameraX, r, halfView);
      if (E <= 0) continue;
      const c = e.isDying ? tagDeathFade(now - e.deathStartTime, deathMs) : 1;
      const g = tagFade(E, c, drawnOpacity(e, now));
      if (!(g > 0)) continue;
      drawSpeaker(atlas, webgl, logic, sp.lines, px, py, r, 0, g, bubbleFill(botHex(logic, e, dark), dark), col.text, col.ink, now, clock, width, height);
    }
  }

  const rP = playerSize * 0.5;
  const psp = rec.speakers.get(CHAT_PLAYER_ID);
  if (psp !== undefined) {
    rec.prune(psp, now);
    if (psp.lines.length === 0) rec.drop(CHAT_PLAYER_ID);
    else if (!logic.tankDying) drawSpeaker(atlas, webgl, logic, psp.lines, logic.tankPos.x, logic.tankPos.y, rP, boxOn ? boxA : 0, 1,
      bubbleFill(playerHex(logic, dark), dark), col.text, col.ink, now, clock, width, height);
  }
  if (boxOn && boxA > 0) {
    const bar = picFor(_barKey, atlas, z, clock, col.text, '', col.ink, (zz) => makeBar(atlas, webgl, zz, col.text, col.ink, clock));
    const wyC = logic.tankPos.y - chatAbove(rP);
    const sx = (logic.tankPos.x - logic.cameraX) * z + width * 0.5, sy = (wyC - logic.cameraY) * z + height * 0.5;
    if (bar !== null && bar.e !== null) pushQuad(bar.e, sx, sy, z / bar.zMade, boxA, width, height);
    const k = z / dpr;
    chatInputPlace((sx - CHAT_BOX_SPAN * 0.5 * z) / dpr, sy / dpr - CHAT_BOX_LINE * 0.5 * k, CHAT_BOX_SPAN * k, CHAT_BOX_LINE * k,
      CHAT_BOX_FONT * k, col.ink, boxA, !rec.boxOpen);
  } else chatInputHide();

  if (_nq === 0) return false;
  _prevScale = webgl.getRenderScale();
  webgl.setRenderScale(1);
  webgl.setCamera(width / 2, height / 2, 1, width, height);
  webgl.beginFrame();
  _begun = true;
  webgl.pushTagQuads(_quads, _nq);
  webgl.setSampleAlphaToCoverage(false);
  webgl.setDepthMask(false);
  webgl.flushTags();
  webgl.setDepthMask(true);
  webgl.setSampleAlphaToCoverage(true);
  return true;
}

export function chatDone(webgl: WebGLBulletRenderer, camX: number, camY: number, zoom: number, width: number, height: number): void {
  if (!_begun) return;
  _begun = false;
  webgl.setCamera(camX, camY, zoom, width, height);
  webgl.setRenderScale(_prevScale);
}

export function chatWanted(logic: GameLogic): boolean {
  const rec = logic.chat;
  return rec.speakers.size !== 0 || rec.boxOpen || (rec.boxSince > 0 && performance.now() - rec.boxSince < CHAT_BOX_EASE_S * 1000);
}

