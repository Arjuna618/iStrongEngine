import type { GameMessage } from '../types';
import { getEffectiveDPR } from './zoomCompensation';
import { mobileActive, mobHud } from './mobileMode';
import { MOB_BTN_H } from './mobileArras';
import { SMALL_FIX } from '../game/smallFixSwitch';
const MOB_MSG_UNDER = 8;
import {
  HUD_MSG_TOP, HUD_MSG_BOX, HUD_MSG_PITCH, HUD_MSG_PILL_R, HUD_MSG_FONT, HUD_MSG_ROWS_MAX, HUD_STROKE_F_BIG,
  HUD_MSG_WAKE_LEAD_MS, hudMsgPlan, hudMsgWindow, hudMsgWeight, hudMsgTrackAlpha, hudMsgTrackPlace, HudMsgTrack, HudMsgWindow,
} from './hudArras';

export interface HudMsgSource {
  state: { messages: GameMessage[] };
  gameNow(): number;
}

interface Row {
  text: string;
  lines: number;
  weight: number;
  birth: number;
  life: number;
  el: HTMLDivElement | null;
  ao: Animation | null;
  at: Animation | null;
  op: number;
  ty: number;
}

export const HUD_MSG_CSS = `
.hud-msgs { position: absolute; left: 50%; top: 0; width: 0; height: 0; z-index: 20; contain: layout style; }
.hud-msg { position: absolute; left: 0; top: 0; width: 0; display: flex; justify-content: center; opacity: 0; will-change: transform, opacity; }
.hud-msg-pill {
    flex: none; box-sizing: border-box; white-space: pre;
    height: calc(${HUD_MSG_BOX}px * var(--hud-s, 1));
    line-height: calc(${HUD_MSG_BOX}px * var(--hud-s, 1));
    padding: 0 calc(${HUD_MSG_PILL_R}px * var(--hud-s, 1));
    border-radius: calc(${HUD_MSG_PILL_R}px * var(--hud-s, 1));
    background: var(--ig-pill-bg);
    color: var(--ig-text);
    font-family: Ubuntu, 'Inter', sans-serif;
    font-weight: bold;
    letter-spacing: normal;
    font-size: calc(${HUD_MSG_FONT}px * var(--hud-s, 1));
    -webkit-text-stroke: calc(${HUD_STROKE_F_BIG * HUD_MSG_FONT}px * var(--hud-s, 1)) var(--ig-stroke);
    paint-order: stroke fill;
}
`;

const X1 = '0.333333333', X2 = '0.666666667';

export class HudMsgView {
  private rows: Row[] = [];
  private root: HTMLDivElement | null = null;
  private rootY = NaN;
  private model: GameMessage[] | null = null;
  private lastId = -1;
  private scale = 1;
  private hidden = false;
  private queued = false;
  private wake: ReturnType<typeof setTimeout> | null = null;
  private births: number[] = [];
  private lives: number[] = [];
  private weights: number[] = [];
  private win: HudMsgWindow = { until: 0, next: Infinity };

  constructor(private readonly src: HudMsgSource) {}

  readonly poke = (): void => {
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(this.flush);
  };

  attach(root: HTMLDivElement | null): void {
    if (root === this.root) return;
    this.clear();
    this.model = null;
    this.root = root;
    this.rootY = NaN;
    if (root) { this.placeRoot(); this.poke(); }
  }

  setScale(s: number): void {
    if (s === this.scale) return;
    this.scale = s;
    this.placeRoot();
    this.poke();
  }

  setHidden(hidden: boolean): void {
    if (hidden === this.hidden) return;
    this.hidden = hidden;
    if (this.root) this.root.style.display = hidden ? 'none' : '';
    if (hidden) {
      this.sleep();
      for (let i = 0; i < this.rows.length; i++) this.still(this.rows[i]);
    } else this.poke();
  }

  get count(): number { return this.rows.length; }
  get waking(): boolean { return this.wake !== null; }

  private readonly flush = (): void => {
    this.queued = false;
    this.sync();
  };

  private readonly onWake = (): void => {
    this.wake = null;
    this.poke();
  };

  private readonly onFinish = (ev: { target: unknown }): void => {
    for (let i = 0; i < this.rows.length; i++) {
      if (this.rows[i].ao !== ev.target) continue;
      const r = this.rows[i];
      if (SMALL_FIX.G730 !== 0 && this.src.gameNow() < r.birth + r.life) { r.ao = null; this.sync(); return; }
      this.drop(i); return;
    }
  };

  private sleep(): void {
    if (this.wake !== null) { clearTimeout(this.wake); this.wake = null; }
  }

  private placeRoot(): void {
    if (!this.root) return;
    const dpr = getEffectiveDPR() || 1;
    if (!mobileActive()) {
      if (this.rootY === this.rootY) { this.rootY = NaN; this.root.style.transform = ''; }
      this.root.style.top = `${Math.round(HUD_MSG_TOP * this.scale * dpr) / dpr}px`;
      return;
    }
    let top = mobHud.y3 + MOB_BTN_H + MOB_MSG_UNDER;
    if (mobHud.menuBottom > 0 && mobHud.menuBottom + MOB_MSG_UNDER > top) top = mobHud.menuBottom + MOB_MSG_UNDER;
    const y = Math.round(top * this.scale * dpr) / dpr;
    if (this.root.style.top !== '') this.root.style.top = '';
    if (y !== this.rootY) { this.rootY = y; this.root.style.transform = `translateY(${y}px)`; }
  }

  replace(): void { this.placeRoot(); }

  private still(row: Row): void {
    if (row.ao) { row.ao.onfinish = null; row.ao.cancel(); row.ao = null; }
    if (row.at) { row.at.cancel(); row.at = null; }
  }

  private drop(i: number): void {
    const row = this.rows[i];
    this.still(row);
    if (row.el) { row.el.remove(); row.el = null; }
    this.rows.splice(i, 1);
  }

  private clear(): void {
    this.sleep();
    for (let i = this.rows.length - 1; i >= 0; i--) this.drop(i);
    this.lastId = -1;
  }

  private play(el: HTMLDivElement, frames: Keyframe[], ms: number, startAt: number): Animation | null {
    if (typeof el.animate !== 'function') return null;
    try {
      const a = el.animate(frames, { duration: ms, fill: 'both' });
      a.startTime = startAt;
      return a;
    } catch (err) {
      console.error('HudMsgView: the browser refused an animation', err);
      return null;
    }
  }

  private sync(): void {
    const root = this.root;
    if (!root) return;
    const msgs = this.src.state.messages;
    if (msgs !== this.model) { this.clear(); this.model = msgs; }
    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.id <= this.lastId) continue;
      this.lastId = m.id;
      let lines = 1;
      for (let c = m.text.indexOf('\n'); c >= 0; c = m.text.indexOf('\n', c + 1)) lines++;
      this.rows.unshift({ text: m.text, lines, weight: hudMsgWeight(lines), birth: m.createdAt, life: m.duration, el: null, ao: null, at: null, op: NaN, ty: 0 });
    }
    if (this.hidden) return;
    this.sleep();
    while (this.rows.length > HUD_MSG_ROWS_MAX) this.drop(this.rows.length - 1);
    const n = this.rows.length;
    if (n === 0) return;
    const g = this.src.gameNow();
    const real = performance.now();
    const births = this.births, lives = this.lives, weights = this.weights;
    let tall = false;
    for (let i = 0; i < n; i++) { births[i] = this.rows[i].birth; lives[i] = this.rows[i].life; weights[i] = this.rows[i].weight; if (this.rows[i].lines > 1) tall = true; }
    const plan = hudMsgPlan(births, lives, n, g, tall ? weights : undefined);
    const win = this.win;
    hudMsgWindow(plan, win);
    let wakeIn = win.next - HUD_MSG_WAKE_LEAD_MS;
    const dpr = getEffectiveDPR() || 1;
    const pitch = HUD_MSG_PITCH * this.scale;
    for (let i = n - 1; i >= 0; i--) {
      const row = this.rows[i], tr = plan[i];
      if (!(tr.end > 0)) { this.drop(i); continue; }
      let el = row.el;
      if (el === null) {
        el = document.createElement('div');
        el.className = 'hud-msg';
        const pill = document.createElement('div');
        pill.className = 'hud-msg-pill';
        pill.textContent = row.text;
        if (row.lines > 1) pill.style.height = `calc(${row.lines * HUD_MSG_BOX}px * var(--hud-s, 1))`;
        el.appendChild(pill);
        root.insertBefore(el, root.firstChild);
        row.el = el;
      }
      const leaving = tr.end <= win.until;
      const T = leaving ? tr.end : win.until;
      const carried = this.fade(row, el, tr, T, real, leaving);
      this.place(row, el, tr, T, real, pitch, dpr);
      if (leaving && !carried && T + 1 < wakeIn) wakeIn = T + 1;
    }
    if (wakeIn !== Infinity) this.wake = setTimeout(this.onWake, wakeIn > 0 ? wakeIn : 0);
  }

  private fade(row: Row, el: HTMLDivElement, tr: HudMsgTrack, T: number, real: number, leaving: boolean): boolean {
    const old = row.ao;
    let next: Animation | null = null;
    let rest = tr.av[0];
    if (T > 0) {
      const frames: Keyframe[] = [];
      let moving = false;
      for (let k = 0; k < tr.at.length && tr.at[k] < T - 1e-6; k++) {
        frames.push({ offset: tr.at[k] / T, opacity: tr.av[k] });
        if (tr.av[k] !== tr.av[0]) moving = true;
      }
      const last = hudMsgTrackAlpha(tr, T);
      frames.push({ offset: 1, opacity: last });
      if (last !== tr.av[0]) moving = true;
      if (moving) {
        next = this.play(el, frames, T, real);
        if (next && leaving) next.onfinish = this.onFinish;
        if (!next && !leaving) rest = last;
      }
    }
    if (next === null && rest !== row.op) { el.style.opacity = String(rest); row.op = rest; }
    row.ao = next;
    if (old) { old.onfinish = null; old.cancel(); }
    return next !== null;
  }

  private place(row: Row, el: HTMLDivElement, tr: HudMsgTrack, T: number, real: number, pitch: number, dpr: number): void {
    const px = (y: number): number => {
      const k = Math.round(y);
      return Math.abs(y - k) < 1e-9 ? Math.round(k * pitch * dpr) / dpr : Math.round(y * pitch * 1000) / 1000;
    };
    const old = row.at;
    let next: Animation | null = null;
    let rest = px(tr.yv[0]);
    if (T > 0) {
      const frames: Keyframe[] = [];
      let moving = false;
      for (let k = 0; k < tr.yt.length - 1 && tr.yt[k] < T - 1e-6; k++) {
        const f: Keyframe = { offset: tr.yt[k] / T, transform: `translateY(${px(tr.yv[k])}px)` };
        if (tr.yt[k + 1] <= T + 1e-6 && !Number.isNaN(tr.c1[k])) f.easing = `cubic-bezier(${X1},${tr.c1[k].toFixed(6)},${X2},${tr.c2[k].toFixed(6)})`;
        frames.push(f);
        if (tr.yv[k] !== tr.yv[0] || !Number.isNaN(tr.c1[k])) moving = true;
      }
      const last = px(hudMsgTrackPlace(tr, T));
      frames.push({ offset: 1, transform: `translateY(${last}px)` });
      if (last !== rest) moving = true;
      if (moving) {
        next = this.play(el, frames, T, real);
        if (!next) rest = last;
      }
    }
    if (next === null && rest !== row.ty) { el.style.transform = rest === 0 ? '' : `translateY(${rest}px)`; row.ty = rest; }
    row.at = next;
    if (old) old.cancel();
  }
}
