import type { GameLogic } from '../../game/GameLogic';
import { mobileActive, subscribeMobile, mobHud } from '../../utils/mobileMode';
import {
  mobSticksAt, mobStickR, mobKnob, mobMoveBits, MOB_KEY_CODES, mobAim, mobAimAlt, mobManualZone,
  MOB_RC_NEVER, MOB_RC_MANUAL, MOB_RC_WORDS, MOB_DOUBLE_TAP_MS, MOB_KNOB_R, MOB_RING_ALPHA, MOB_KNOB_ALPHA, MOB_STICK_SLOT,
  MOB_CROSS_IN, MOB_CROSS_OUT, MOB_CROSS_R, MOB_CROSS_ALPHA, MOB_BRACKET, MOB_BRACKET_ARM, MOB_ARROW_ALPHA, mobMoveAngle, mobArrow,
  mobArrowTip, type MobXY, type MobSticks,
} from '../../utils/mobileArras';
import { hudSlot, hudCss, HUD_SLOT } from '../../utils/hudArras';
import { getEffectiveDPR } from '../../utils/zoomCompensation';
import { safeInsets } from '../../utils/safeArea';
import { MOBILE_ALT_SPLIT } from '../../game/mobileSwitch';
import { armBack, setMatchBack } from '../../utils/leaveGuard';

const _pt: MobXY = { x: 0, y: 0 };
const _kn: MobXY = { x: 0, y: 0 };
const _arw: number[] = [0, 0, 0, 0, 0, 0];
const _sk: MobSticks = { lx: 0, rx: 0, y: 0, R: 0 };

export function ringsAt(W: number, H: number, dpr: number, out: MobSticks): MobSticks {
  const l = safeInsets.l * dpr, t = safeInsets.t * dpr, r = safeInsets.r * dpr, b = safeInsets.b * dpr;
  mobSticksAt(W - l - r, H - t - b, mobHud.stickK, out);
  out.lx += l; out.rx += l; out.y += t;
  return out;
}

export function firesTwoWays(logic: GameLogic): boolean {
  if (MOBILE_ALT_SPLIT === 0) return false;
  const ts = logic.state.turrets;
  if (!ts) return false;
  for (let i = 0; i < ts.length; i++) {
    const t = ts[i];
    if (t.altFire === true && t.turretType !== 'auto' && t.turretType !== 'decorative') return true;
  }
  return false;
}

export class TouchControls {
  moveId = -1; aimId = -1; manualId = -1;
  moveX = 0; moveY = 0; aimX = 0; aimY = 0;
  bits = 0;
  rcMode = MOB_RC_NEVER;
  aimAlt = false;
  aimPX = 0; aimPY = 0;
  twoWay = false;
  private _right = false;
  private _left = false;
  private _doubleTapped = false;
  private _lastAimStart = -1e9;
  private _canvas: HTMLCanvasElement | null = null;
  private _getLogic: () => GameLogic | null = () => null;
  private _unsub: (() => void) | null = null;
  everTouched = false;
  touchesDown = 0;
  aimSet = false;
  version = 0;
  private _subs = new Set<() => void>();

  subscribe(f: () => void): () => void { this._subs.add(f); return () => { this._subs.delete(f); }; }
  private _bump(): void { this.version++; for (const f of this._subs) f(); }

  anyDown(): boolean { return this.moveId !== -1 || this.aimId !== -1 || this.manualId !== -1; }

  rcWord(): string { return MOB_RC_WORDS[this.rcMode]; }
  stepRcMode(): void {
    this.rcMode = (this.rcMode + 1) % MOB_RC_WORDS.length;
    const logic = this._getLogic();
    if (logic && this.aimId !== -1) this._aim(logic); else if (logic) this._sync(logic);
    this._bump();
  }

  attach(canvas: HTMLCanvasElement, getLogic: () => GameLogic | null): void {
    this._canvas = canvas; this._getLogic = getLogic;
    window.addEventListener('touchstart', this._onStart, { capture: true, passive: false });
    window.addEventListener('touchmove', this._onMove, { capture: true, passive: false });
    window.addEventListener('touchend', this._onEnd, { capture: true, passive: false });
    window.addEventListener('touchcancel', this._onEnd, { capture: true, passive: false });
    setMatchBack(this._onBack);
    this._unsub = subscribeMobile(() => { if (!mobileActive()) this.releaseAll(); });
  }

  detach(): void {
    window.removeEventListener('touchstart', this._onStart, { capture: true });
    window.removeEventListener('touchmove', this._onMove, { capture: true });
    window.removeEventListener('touchend', this._onEnd, { capture: true });
    window.removeEventListener('touchcancel', this._onEnd, { capture: true });
    setMatchBack(null);
    if (this._unsub) { this._unsub(); this._unsub = null; }
    this.releaseAll();
    this._canvas = null;
  }

  releaseAll(): void {
    const logic = this._getLogic();
    if (logic) {
      for (let b = 0; b < 4; b++) if (this.bits & (1 << b)) logic.handleInput('keyup', MOB_KEY_CODES[b]);
      if (this._left) logic.handleMouseUp();
      if (this._right) logic.handleMouseRightUp();
    }
    this.bits = 0; this.moveId = -1; this.aimId = -1; this.manualId = -1; this.aimAlt = false; this._right = false; this._left = false;
  }

  private _px(clientX: number, clientY: number, out: MobXY): MobXY {
    const c = this._canvas!; const r = c.getBoundingClientRect(); const dpr = getEffectiveDPR();
    out.x = (clientX - r.left) * dpr; out.y = (clientY - r.top) * dpr;
    return out;
  }

  private _live(logic: GameLogic | null): logic is GameLogic {
    if (!logic || !mobileActive() || !this._canvas) return false;
    const s = logic.state;
    return s.isTestMode && !s.paused && !s.playerDead && !s.classTreeOpen;
  }

  private _move(logic: GameLogic): void {
    const c = this._canvas!;
    ringsAt(c.width, c.height, getEffectiveDPR(), _sk);
    const nb = mobMoveBits(this.moveX - _sk.lx, this.moveY - _sk.y);
    const ch = nb ^ this.bits;
    if (ch === 0) return;
    for (let b = 0; b < 4; b++) {
      const m = 1 << b; if (!(ch & m)) continue;
      logic.handleInput(nb & m ? 'keydown' : 'keyup', MOB_KEY_CODES[b]);
    }
    this.bits = nb;
  }

  private _sync(logic: GameLogic): void {
    const two = firesTwoWays(logic);
    this.twoWay = two;
    const wantLeft = two ? (this.moveId !== -1 && this.bits !== 0) : this.aimId !== -1;
    if (wantLeft !== this._left) {
      this._left = wantLeft;
      if (wantLeft) logic.handleMouseDown(); else logic.handleMouseUp(true);
    }
    this._setRight(logic);
  }

  private _setRight(logic: GameLogic): void {
    const want = this.aimAlt || this.manualId !== -1;
    if (want === this._right) return;
    this._right = want;
    if (want) logic.handleMouseRightDown(); else logic.handleMouseRightUp(true);
  }

  private _aim(logic: GameLogic): void {
    const c = this._canvas!; const W = c.width, H = c.height;
    ringsAt(W, H, getEffectiveDPR(), _sk);
    const boxed = mobAim(this.aimX - _sk.rx, this.aimY - _sk.y, W, H, _pt);
    this.aimAlt = firesTwoWays(logic) ? this.aimId !== -1 : mobAimAlt(this.rcMode, boxed, this._doubleTapped, _pt);
    this.aimPX = _pt.x; this.aimPY = _pt.y; this.aimSet = true;
    logic.handleMouseMove(W / 2 + _pt.x, H / 2 + _pt.y);
    this._sync(logic);
  }

  private _onBack = (): boolean => {
    const logic = this._getLogic();
    if (!logic || !logic.state.isTestMode) return false;
    logic.handleInput('keydown', 'Escape'); logic.handleInput('keyup', 'Escape');
    this.releaseAll();
    return true;
  };

  private _onStart = (e: TouchEvent): void => {
    this.touchesDown = e.touches.length;
    if (mobHud.hudDrag > 0 && e.cancelable) e.preventDefault();
    const logic = this._getLogic();
    if (!logic || !mobileActive()) return;
    if (logic.state.isTestMode) { armBack(); this.everTouched = true; }
    if (!this._live(logic)) return;
    const c = this._canvas!; const W = c.width, H = c.height;
    let took = false;
    const ts = e.changedTouches;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      if (t.target !== c) continue;
      took = true;
      this._px(t.clientX, t.clientY, _kn);
      if (this.rcMode === MOB_RC_MANUAL && this.manualId === -1 && mobManualZone(_kn.x, _kn.y, W, H)) {
        this.manualId = t.identifier; this._sync(logic); continue;
      }
      if (_kn.x < W / 2) {
        if (this.moveId !== -1) continue;
        this.moveId = t.identifier; this.moveX = _kn.x; this.moveY = _kn.y; this._move(logic); this._sync(logic);
      } else {
        if (this.aimId !== -1) continue;
        const now = performance.now();
        this._doubleTapped = now - this._lastAimStart < MOB_DOUBLE_TAP_MS;
        this._lastAimStart = now;
        this.aimId = t.identifier; this.aimX = _kn.x; this.aimY = _kn.y;
        this._aim(logic);
      }
    }
    if (took && e.cancelable) e.preventDefault();
  };

  private _onMove = (e: TouchEvent): void => {
    this.touchesDown = e.touches.length;
    if (mobHud.hudDrag > 0 && e.cancelable) e.preventDefault();
    if (!this.anyDown()) return;
    const logic = this._getLogic();
    if (!logic) return;
    let took = false;
    const ts = e.changedTouches;
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      if (t.identifier === this.moveId) { this._px(t.clientX, t.clientY, _kn); this.moveX = _kn.x; this.moveY = _kn.y; this._move(logic); this._sync(logic); took = true; }
      else if (t.identifier === this.aimId) { this._px(t.clientX, t.clientY, _kn); this.aimX = _kn.x; this.aimY = _kn.y; this._aim(logic); took = true; }
      else if (t.identifier === this.manualId) took = true;
    }
    if (took && e.cancelable) e.preventDefault();
  };

  private _onEnd = (e: TouchEvent): void => {
    this.touchesDown = e.touches.length;
    if (!this.anyDown()) return;
    const logic = this._getLogic();
    if (!logic) return;
    let took = false;
    const ts = e.changedTouches;
    for (let i = 0; i < ts.length; i++) {
      const id = ts[i].identifier;
      if (id === this.moveId) {
        for (let b = 0; b < 4; b++) if (this.bits & (1 << b)) logic.handleInput('keyup', MOB_KEY_CODES[b]);
        this.bits = 0; this.moveId = -1; this._sync(logic); took = true;
      } else if (id === this.aimId) {
        this.aimId = -1; this.aimAlt = false; this._sync(logic); took = true;
      } else if (id === this.manualId) {
        this.manualId = -1; this._sync(logic); took = true;
      }
    }
    if (took && e.cancelable) e.preventDefault();
  };
}

let _inkKey = '';
let _ink = '#000000';

export function drawTouchControls(ctx: CanvasRenderingContext2D, tc: TouchControls, W: number, H: number, dark: boolean,
  tankX: number = NaN, tankY: number = NaN, tankR: number = 0): void {
  if (!tc.everTouched) return;
  const key = dark ? 'd' : 'l';
  if (key !== _inkKey) { _inkKey = key; _ink = MOB_STICK_SLOT === 19 ? hudCss(hudSlot(HUD_SLOT.GUIBLACK, dark)) : '#000000'; }
  const dpr = getEffectiveDPR();
  ringsAt(W, H, dpr, _sk);
  const R = _sk.R, lx = _sk.lx, rx = _sk.rx, y = _sk.y;
  const R0 = mobStickR(W - (safeInsets.l + safeInsets.r) * dpr, H - (safeInsets.t + safeInsets.b) * dpr);
  ctx.save();
  ctx.fillStyle = _ink;
  ctx.globalAlpha = MOB_RING_ALPHA;
  ctx.beginPath(); ctx.arc(lx, y, R, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(rx, y, R, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = MOB_KNOB_ALPHA;
  if (tc.moveId !== -1) mobKnob(tc.moveX - lx, tc.moveY - y, R, _kn); else { _kn.x = 0; _kn.y = 0; }
  ctx.beginPath(); ctx.arc(lx + _kn.x, y + _kn.y, R * MOB_KNOB_R, 0, Math.PI * 2); ctx.fill();
  if (tc.aimId !== -1) mobKnob(tc.aimX - rx, tc.aimY - y, R, _kn); else { _kn.x = 0; _kn.y = 0; }
  ctx.beginPath(); ctx.arc(rx + _kn.x, y + _kn.y, R * MOB_KNOB_R, 0, Math.PI * 2); ctx.fill();
  const ang = tc.moveId !== -1 ? mobMoveAngle(tc.bits) : NaN;
  if (ang === ang) {
    const has = tankX === tankX && tankY === tankY;
    const ox = has ? tankX : W / 2, oy = has ? tankY : H / 2;
    mobArrow(ang, R0, _arw, mobArrowTip(R0, has && tankR > 0 ? tankR : 0));
    ctx.globalAlpha = MOB_ARROW_ALPHA;
    ctx.beginPath(); ctx.moveTo(ox + _arw[0], oy + _arw[1]); ctx.lineTo(ox + _arw[2], oy + _arw[3]); ctx.lineTo(ox + _arw[4], oy + _arw[5]); ctx.closePath(); ctx.fill();
  }
  if (tc.aimSet && tc.touchesDown > 0) {
    const ax = W / 2 + tc.aimPX, ay = H / 2 + tc.aimPY;
    const a = MOB_CROSS_IN * R0, b = MOB_CROSS_OUT * R0;
    ctx.globalAlpha = MOB_CROSS_ALPHA;
    ctx.strokeStyle = _ink; ctx.lineWidth = 2 * MOB_CROSS_R * R0; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ax, ay - a); ctx.lineTo(ax, ay - b);
    ctx.moveTo(ax, ay + a); ctx.lineTo(ax, ay + b);
    ctx.moveTo(ax - a, ay); ctx.lineTo(ax - b, ay);
    ctx.moveTo(ax + a, ay); ctx.lineTo(ax + b, ay);
    if (tc.aimAlt || tc.manualId !== -1) {
      const k = MOB_BRACKET * R0, m = (MOB_BRACKET - MOB_BRACKET_ARM) * R0;
      for (let sx = -1; sx <= 1; sx += 2) for (let sy = -1; sy <= 1; sy += 2) {
        ctx.moveTo(ax + sx * k, ay + sy * m); ctx.lineTo(ax + sx * k, ay + sy * k); ctx.lineTo(ax + sx * m, ay + sy * k);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}
