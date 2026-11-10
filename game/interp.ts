import { SMALL_FIX } from './smallFixSwitch';
import { ARRAS_PARITY } from './arrasCombat';
const TAU = Math.PI * 2;
const JUMP_DIST = 400;
const CAPTURE_NEAR_OFF: boolean = (typeof location !== 'undefined' && /[?&]oldcapture(?:[=&]|$)/.test(location.search))
  || (typeof process !== 'undefined' && !!process.env && process.env.ISTRONG_OLD_CAPTURE === '1');
const JUMP_DIST_SQ = JUMP_DIST * JUMP_DIST;

const KIND_BOT = 1, KIND_ROUND = 2, KIND_SHAPE = 3;
const VIEW_MARGIN = 900;

function _roundExtra(b: any): number {
  if (SMALL_FIX.GH284 === 0) return 0;
  const r = b.size * b.growth;
  return r > VIEW_MARGIN ? r - VIEW_MARGIN : 0;
}
function _tankExtra(reachOf: ((e: any) => number) | null, e: any): number {
  if (SMALL_FIX.GH284 === 0 || reachOf === null) return 0;
  const r = reachOf(e);
  return r > VIEW_MARGIN ? r - VIEW_MARGIN : 0;
}

function isNum(x: unknown): x is number {
  return typeof x === 'number' && x - x === 0;
}

function angLerp(p: number, c: number, f: number): number {
  let d = c - p;
  if (d > Math.PI || d < -Math.PI) d -= TAU * Math.round(d / TAU);
  return p + d * f;
}

export class FixedStepInterp {
  private pv: Float64Array = new Float64Array(8192);
  private sv: Float64Array = new Float64Array(8192);
  private n = 0;
  stamp = 0;
  private captured = false;

  private pTur: any = null;
  private pTurEnd = 0;
  private pLay: any = null;
  private pLayEnd = 0;
  private pJump = false;
  private pJumpAt = -1;
  private pJumpOut = -1;
  private pEnd = 0;

  private ringT: any[] = [];
  nearOnly: boolean = !CAPTURE_NEAR_OFF;
  capSkipped = 0;
  tankReachOf: ((e: any) => number) | null = null;
  private ringN = 0;
  private ringOff = 0;

  private open = false;
  private tObj: any[] = [];
  private tKind: number[] = [];
  private tParts: boolean[] = [];
  private vx0 = 0; private vx1 = 0; private vy0 = 0; private vy1 = 0;
  private tN = 0;
  private hid: any[] = [];
  private hidN = 0;
  private f = 1;
  private stateRef: any = null;
  private ringDone = 0;
  private camHeld = false;
  private camX = 0;
  private camY = 0;

  jumpPlayer(outside = false): void { this.pJumpAt = this.stamp; if (outside) this.pJumpOut = this.stamp; this.wStamp = -1; }
  warpPlayer(wx: number, wy: number, outside = false): void {
    this.wOut = outside; this.wStamp = outside ? this.stamp + 1 : this.stamp; this.wX = wx; this.wY = wy;
    if (this.pJumpAt === this.stamp) this.pJumpAt = -1;
    if (this.pJumpOut === this.stamp) this.pJumpOut = -1;
  }
  private wStamp = -1;
  private wX = 0;
  private wY = 0;
  private wOut = false;
  jump(x: any): void { x._ipJump = this.stamp; }
  warp(x: any, wx: number, wy: number, outside = false): void { x._ipWarp = outside ? -(this.stamp + 1) : this.stamp; x._ipWX = wx; x._ipWY = wy; }
  private wk(x: any, stamp: number, f: number): number {
    const w = x._ipWarp;
    if (w === stamp) return -0.5 * f;
    if (w === stamp - 1) return -0.5 * (1 - f);
    if (w === -(stamp + 1)) return -f;
    if (w === -stamp) return 0.5 * f - 1;
    if (w === -(stamp - 1)) return -0.5 * (1 - f);
    return NaN;
  }
  private wIn(x: any, stamp: number): boolean { const w = x._ipWarp; return w === stamp || w === -(stamp + 1); }
  takePlace(from: any, to: any): void {
    if (from._ipStep !== this.stamp || from._ipLife !== from.id) return;
    to._ipStep = this.stamp; to._ipLife = to.id; to._ipOff = from._ipOff;
    if (to.size > 0 && from.size > 0) this.pv[from._ipOff + 4] *= from.size / to.size;
  }

  reset(): void {
    this.captured = false;
    this.n = 0;
    this.ringN = 0;
    if (SMALL_FIX.GH292 !== 0) {
      this.pTur = null; this.pLay = null; this.ringT.length = 0;
      this.portArr = null; this.wallArr = null; this.rockArr = null;
    }
  }

  private grow(need: number): void {
    if (need <= this.pv.length) return;
    let len = this.pv.length;
    while (len < need) len *= 2;
    const a = new Float64Array(len); a.set(this.pv); this.pv = a;
    this.sv = new Float64Array(len);
  }

  private put(x: unknown): void {
    if (this.n >= this.pv.length) this.grow(this.n + 1);
    this.pv[this.n++] = isNum(x) ? x : NaN;
  }

  private putTurrets(ts: any[]): void {
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i];
      this.put(t.autoCurrentAngle); this.put(t.animProgress); this.put(t._lateTurn);
      const subs = t.autoSubTurrets;
      if (subs) for (let j = 0; j < subs.length; j++) {
        const s = subs[j];
        this.put(s.autoCurrentAngle); this.put(s.animProgress); this.put(s._lateTurn);
      }
    }
  }

  private putLayers(ls: any[]): void {
    for (let i = 0; i < ls.length; i++) this.put(ls[i]._currentAngle);
  }

  capture(g: any): void {
    const camOld = this.pJumpOut === this.stamp;
    this.stamp++;
    this.n = 0;
    const st = g.state;
    this.put(g.tankPos.x); this.put(g.tankPos.y); this.put(g.tankAngle); this.put(g._baseBodyAngle);
    this.put(camOld ? g._cameraXOfPlayer() : g.cameraX); this.put(camOld ? g._cameraYOfPlayer() : g.cameraY);
    this.put(g.zoom); this.put(g.tankDamageOverlay);
    this.put(st.tankInvisAlpha); this.put(st.playerGrowthScale); this.put(st.tankDisplayHealth);
    this.put(st.tankDisplayShield); this.put(st.tankHpBarOpacity);
    this.pTur = st.turrets; this.putTurrets(st.turrets); this.pTurEnd = this.n;
    this.pLay = st.bodyLayers; if (st.bodyLayers) this.putLayers(st.bodyLayers); this.pLayEnd = this.n;
    this.pEnd = this.n;
    const bots = st.enemyTanks;
    for (let i = 0; i < bots.length; i++) {
      const e = bots[i];
      if (!e.active) continue;
      e._ipStep = this.stamp; e._ipLife = e.id; e._ipOff = this.n;
      this.put(e.position.x); this.put(e.position.y); this.put(e.angle); this.put(e._baseBodyAngle);
      this.put(e.size); this.put(e.growthScale); this.put(e.damageOverlay); this.put(e.invisAlpha);
      this.put(e.viewAlpha); this.put(e.displayHp); this.put(e.displayShield); this.put(e.hpBarOpacity);
      e._ipTur = e.turrets; if (e.turrets) this.putTurrets(e.turrets);
      e._ipLay = e.bodyLayers; if (e.bodyLayers) this.putLayers(e.bodyLayers);
      e._ipEnd = this.n;
    }
    const bl = g.bullets;
    const nearOnly = this.nearOnly && g.zoom > 0;
    const cx = camOld ? g._cameraXOfPlayer() : g.cameraX, cy = camOld ? g._cameraYOfPlayer() : g.cameraY;
    const chw = nearOnly ? g.width / (2 * g.zoom) * 1.25 + VIEW_MARGIN + 2 * JUMP_DIST : 0;
    const chh = nearOnly ? g.height / (2 * g.zoom) * 1.25 + VIEW_MARGIN + 2 * JUMP_DIST : 0;
    let skipped = 0;
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      if (!b.active) continue;
      if (nearOnly) {
        const ddx = b.position.x - cx, ddy = b.position.y - cy;
        const rr = _roundExtra(b);
        if (ddx > chw + rr || ddx < -chw - rr || ddy > chh + rr || ddy < -chh - rr) { b._ipStep = -this.stamp; b._ipLife = b.bulletId; skipped++; continue; }
      }
      b._ipStep = this.stamp; b._ipLife = b.bulletId; b._ipOff = this.n;
      this.put(b.position.x); this.put(b.position.y); this.put(b.facingAngle); this.put(b.visualAimAngle);
      this.put(b.size); this.put(b.growth); this.put(b.opacity); this.put(b.damageOverlay); this.put(b._fadeT);
      this.put(b.exitBaseX); this.put(b.exitBaseY); this.put(b.exitBarrelAngle); this.put(b.exitProgress);
      const subs = b.subTurrets;
      b._ipSub = subs;
      if (subs) for (let j = 0; j < subs.length; j++) {
        const s = subs[j], td = s.turretData;
        this.put(s.kick); this.put(s.animProgress);
        this.put(td ? td.autoCurrentAngle : NaN); this.put(td ? td._lateTurn : NaN);
        const inner = td ? td.autoSubTurrets : null;
        const ni = inner ? inner.length : 0;
        this.put(ni);
        for (let q = 0; q < ni; q++) { const u = inner[q]; this.put(u.autoCurrentAngle); this.put(u.animProgress); this.put(u._lateTurn); }
      }
      b._ipLay = b._bulletBodyLayers; if (b._bulletBodyLayers) this.putLayers(b._bulletBodyLayers);
      b._ipEnd = this.n;
    }
    this.capSkipped = skipped;
    this.capShapes(g.floatingPolygons);
    this.capShapes(g.shapePuffs);
    const rings = g.auraRings, rn = g.auraRingCount;
    this.ringOff = this.n; this.ringN = rn;
    for (let i = 0; i < rn; i++) {
      const r = rings[i];
      this.ringT[i] = r.turret;
      this.put(r.x); this.put(r.y); this.put(r.r); this.put(r.opacity);
    }
    if (SMALL_FIX.GH292 !== 0 && this.ringT.length > rn) this.ringT.length = rn;
    {
      const pts = g.mapState ? g.mapState.portals : null;
      this.portArr = pts; this.portOff = this.n; this.portN = pts ? pts.length : 0;
      for (let i = 0; i < this.portN; i++) {
        const pt = pts[i];
        this.put(pt.x); this.put(pt.y);
        this.put(pt._spinAngle); this.put(pt._scale); this.put(pt._opacity);
        const aP = pt._auraPos, pT = pt._particleT;
        const na = aP ? aP.length : 0, np = pT ? pT.length : 0;
        this.put(na); for (let a = 0; a < na; a++) this.put(aP[a]);
        this.put(np); for (let q = 0; q < np; q++) this.put(pT[q]);
      }
    }
    {
      const ad = g.admin;
      const n = ad && ad.mN > 0 ? ad.mN : 0;
      this.wallArr = n > 0 ? ad.mWalls : null; this.wallOff = this.n; this.wallN = n;
      for (let i = 0; i < n; i++) { this.put(ad.mX[i]); this.put(ad.mY[i]); this.put(ad.mHW[i]); this.put(ad.mHH[i]); }
    }
    {
      const ad = g.admin;
      const n = ad && ad.mRN > 0 ? ad.mRN : 0;
      this.rockArr = n > 0 ? ad.mRocks : null; this.rockOff = this.n; this.rockN = n;
      for (let i = 0; i < n; i++) { const r = ad.mRocks[i]; this.put(r.x); this.put(r.y); this.put(r.size); }
    }
    {
      const ws = g.magicWalls as any[] | undefined;
      const n = ws ? ws.length : 0;
      this.mmArr = n > 0 ? ws! : null; this.mmOff = this.n; this.mmN = n;
      for (let i = 0; i < n; i++) { this.put(ws![i].x); this.put(ws![i].y); }
    }
    this.captured = true;
  }

  private capShapes(ps: any[]): void {
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active) continue;
      p._ipStep = this.stamp; p._ipLife = p.id; p._ipOff = this.n;
      this.put(p.position.x); this.put(p.position.y); this.put(p.rotation); this.put(p.opacity);
      this.put(p.growth); this.put(p.damageOverlay); this.put(p._fadeT); this.put(p.displayHp);
      this.put(p.displayShield); this.put(p.hpBarOpacity);
    }
  }

  private o = 0;
  private portArr: any[] | null = null;
  private portOff = 0;
  private portN = 0;
  private portDone = false;
  private wallArr: any[] | null = null;
  private wallOff = 0;
  private wallN = 0;
  private wallRef: any[] | null = null;
  private wallTouched = 0;
  private wallSave: Float64Array = new Float64Array(64);
  private rockArr: any[] | null = null;
  private rockOff = 0;
  private rockN = 0;
  private rockRef: any[] | null = null;
  private rockTouched = 0;
  private rockSave: Float64Array = new Float64Array(48);
  private mmArr: any[] | null = null;
  private mmOff = 0;
  private mmN = 0;
  private mmRef: any[] | null = null;
  private mmTouched = 0;
  private mmSave: Float64Array = new Float64Array(512);

  private beginWalls(g: any): void {
    const ad = g.admin;
    const n = ad ? ad.mN : 0;
    if (!(n > 0)) return;
    const ws = ad.mWalls;
    if (this.wallSave.length < n * 4) this.wallSave = new Float64Array(n * 8);
    const sv = this.wallSave, f = this.f, same = ws === this.wallArr;
    for (let i = 0; i < n; i++) {
      const w = ws[i], o = i * 4;
      sv[o] = w.x; sv[o + 1] = w.y; sv[o + 2] = w.halfW; sv[o + 3] = w.halfH;
      let x = ad.mX[i], y = ad.mY[i], hw = ad.mHW[i], hh = ad.mHH[i];
      if (same && i < this.wallN) {
        const p = this.wallOff + i * 4;
        const px = this.pv[p], py = this.pv[p + 1], phw = this.pv[p + 2], phh = this.pv[p + 3];
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy < JUMP_DIST_SQ) { x = px + dx * f; y = py + dy * f; hw = phw + (hw - phw) * f; hh = phh + (hh - phh) * f; }
      }
      w.x = x; w.y = y; w.halfW = hw; w.halfH = hh;
    }
    this.wallRef = ws; this.wallTouched = n;
  }
  private beginRocks(g: any): void {
    const ad = g.admin;
    const n = ad ? ad.mRN : 0;
    if (!(n > 0)) return;
    const rs = ad.mRocks;
    if (this.rockSave.length < n * 3) this.rockSave = new Float64Array(n * 6);
    const sv = this.rockSave, f = this.f, same = rs === this.rockArr;
    for (let i = 0; i < n; i++) {
      const r = rs[i], o = i * 3;
      sv[o] = r.x; sv[o + 1] = r.y; sv[o + 2] = r.size;
      if (same && i < this.rockN) {
        const p = this.rockOff + i * 3;
        const px = this.pv[p], py = this.pv[p + 1], ps = this.pv[p + 2];
        const dx = r.x - px, dy = r.y - py;
        if (dx * dx + dy * dy < JUMP_DIST_SQ) { r.x = px + dx * f; r.y = py + dy * f; r.size = ps + (r.size - ps) * f; }
      }
    }
    this.rockRef = rs; this.rockTouched = n;
  }
  private endRocks(): void {
    const rs = this.rockRef, sv = this.rockSave;
    for (let i = 0; i < this.rockTouched; i++) {
      const r = rs![i], o = i * 3;
      if (!r) continue;
      r.x = sv[o]; r.y = sv[o + 1]; r.size = sv[o + 2];
    }
    this.rockRef = null; this.rockTouched = 0;
  }
  private beginMagic(g: any): void {
    const ws = g.magicWalls as any[] | undefined;
    const n = ws ? ws.length : 0;
    if (!(n > 0)) return;
    if (this.mmSave.length < n * 2) this.mmSave = new Float64Array(n * 4);
    const sv = this.mmSave, f = this.f, same = ws === this.mmArr;
    for (let i = 0; i < n; i++) {
      const w = ws![i], o = i * 2;
      sv[o] = w.x; sv[o + 1] = w.y;
      if (!same || i >= this.mmN) continue;
      const p = this.mmOff + i * 2, px = this.pv[p], py = this.pv[p + 1];
      const dx = w.x - px, dy = w.y - py;
      if ((dx !== 0 || dy !== 0) && dx * dx + dy * dy < JUMP_DIST_SQ) { w.x = px + dx * f; w.y = py + dy * f; }
    }
    this.mmRef = ws!; this.mmTouched = n;
  }
  private endMagic(): void {
    const ws = this.mmRef, sv = this.mmSave;
    for (let i = 0; i < this.mmTouched; i++) { const w = ws![i], o = i * 2; if (!w) continue; w.x = sv[o]; w.y = sv[o + 1]; }
    this.mmRef = null; this.mmTouched = 0;
  }
  private endWalls(): void {
    const ws = this.wallRef, sv = this.wallSave;
    for (let i = 0; i < this.wallTouched; i++) {
      const w = ws![i], o = i * 4;
      if (!w) continue;
      w.x = sv[o]; w.y = sv[o + 1]; w.halfW = sv[o + 2]; w.halfH = sv[o + 3];
    }
    this.wallRef = null; this.wallTouched = 0;
  }

  private lin(c: any): any {
    const o = this.o++;
    const p = this.pv[o];
    if (!isNum(c) || p !== p) { this.sv[o] = NaN; return c; }
    this.sv[o] = c;
    return p + (c - p) * this.f;
  }

  private ang(c: any): any {
    const o = this.o++;
    const p = this.pv[o];
    if (!isNum(c) || p !== p) { this.sv[o] = NaN; return c; }
    this.sv[o] = c;
    return angLerp(p, c, this.f);
  }

  private back(c: any): any {
    const v = this.sv[this.o++];
    return v === v ? v : c;
  }

  private applyTurrets(ts: any[], end: number): void {
    for (let i = 0; i < ts.length && this.o < end; i++) {
      const t = ts[i];
      t.autoCurrentAngle = this.ang(t.autoCurrentAngle); t.animProgress = this.lin(t.animProgress); t._lateTurn = this.ang(t._lateTurn);
      const subs = t.autoSubTurrets;
      if (subs) for (let j = 0; j < subs.length && this.o < end; j++) {
        const s = subs[j];
        s.autoCurrentAngle = this.ang(s.autoCurrentAngle); s.animProgress = this.lin(s.animProgress); s._lateTurn = this.ang(s._lateTurn);
      }
    }
  }

  private backTurrets(ts: any[], end: number): void {
    for (let i = 0; i < ts.length && this.o < end; i++) {
      const t = ts[i];
      t.autoCurrentAngle = this.back(t.autoCurrentAngle); t.animProgress = this.back(t.animProgress); t._lateTurn = this.back(t._lateTurn);
      const subs = t.autoSubTurrets;
      if (subs) for (let j = 0; j < subs.length && this.o < end; j++) {
        const s = subs[j];
        s.autoCurrentAngle = this.back(s.autoCurrentAngle); s.animProgress = this.back(s.animProgress); s._lateTurn = this.back(s._lateTurn);
      }
    }
  }

  private applyLayers(ls: any[], end: number): void {
    for (let i = 0; i < ls.length && this.o < end; i++) ls[i]._currentAngle = this.ang(ls[i]._currentAngle);
  }

  private unweldLayers(ls: any[], o0: number, o1: number, d: number): void {
    for (let i = 0, c = o0; i < ls.length && c < o1; i++, c++) {
      const l = ls[i];
      if (l.spinEnabled && !l.stationary) l._currentAngle -= d;
    }
  }

  private weldTurrets(ts: any[], ls: any[] | undefined, o0: number, o1: number, d: number): void {
    for (let i = 0, c = o0; i < ts.length && c < o1; i++) {
      const t = ts[i];
      c += 3;
      const subs = t.autoSubTurrets;
      if (subs) c += 3 * subs.length;
      if (t.turretType !== 'auto' || !(t.autoCircleFixed || (t.autoCircleSpin && t.autoCircleSpinMode === 'withBody'))) continue;
      let onLayer = false;
      if (ls) for (let k = 0; k < ls.length && !onLayer; k++) { const ids = ls[k].turretIds; if (ids && ids.indexOf(t.id) !== -1) onLayer = true; }
      if (!onLayer) t.autoCurrentAngle += d;
    }
  }

  private backLayers(ls: any[], end: number): void {
    for (let i = 0; i < ls.length && this.o < end; i++) ls[i]._currentAngle = this.back(ls[i]._currentAngle);
  }

  begin(g: any, f: number): void {
    if (!this.captured || this.open) return;
    this.open = true;
    this.f = f;
    this.tN = 0; this.hidN = 0; this.ringDone = 0;
    const st = g.state;
    this.stateRef = st;
    {
      const px = this.pv[0], py = this.pv[1], cx = g.tankPos.x, cy = g.tankPos.y;
      const wPend = this.wOut && this.wStamp === this.stamp + 1;
      const wNow = this.wStamp === this.stamp, wNext = this.wStamp === this.stamp - 1;
      const wIn = (wNow && !this.wOut) || wPend;
      const dx = cx - px - (wIn ? this.wX : 0), dy = cy - py - (wIn ? this.wY : 0);
      this.pJump = !(dx * dx + dy * dy < JUMP_DIST_SQ) || this.pJumpAt === this.stamp;
      if (!this.pJump) {
        this.o = 0;
        g.tankPos.x = this.lin(g.tankPos.x); g.tankPos.y = this.lin(g.tankPos.y);
        g.tankAngle = this.ang(g.tankAngle); g._baseBodyAngle = this.ang(g._baseBodyAngle);
        g.cameraX = this.lin(g.cameraX); g.cameraY = this.lin(g.cameraY); g.zoom = this.lin(g.zoom);
        if (wPend || wNow || wNext) {
          const k = wPend ? -f : this.wOut ? (wNow ? 0.5 * f - 1 : -0.5 * (1 - f)) : (wNow ? -0.5 * f : -0.5 * (1 - f));
          g.tankPos.x += this.wX * k; g.tankPos.y += this.wY * k; g.cameraX += this.wX * k; g.cameraY += this.wY * k;
        }
        g.tankDamageOverlay = this.lin(g.tankDamageOverlay);
        st.tankInvisAlpha = this.lin(st.tankInvisAlpha);
        if (st.turrets === this.pTur) st.playerGrowthScale = this.lin(st.playerGrowthScale); else this.sv[this.o++] = NaN;
        st.tankDisplayHealth = this.lin(st.tankDisplayHealth); st.tankDisplayShield = this.lin(st.tankDisplayShield);
        st.tankHpBarOpacity = this.lin(st.tankHpBarOpacity);
        const oT0 = this.o;
        if (st.turrets === this.pTur) this.applyTurrets(st.turrets, this.pTurEnd); else this.o = this.pTurEnd;
        const oT1 = this.o, tOk = st.turrets === this.pTur;
        const oL0 = this.o;
        if (st.bodyLayers && st.bodyLayers === this.pLay) this.applyLayers(st.bodyLayers, this.pLayEnd);
        const oL1 = this.o, lOk = !!st.bodyLayers && st.bodyLayers === this.pLay;
        const live = g._fsLiveAim();
        if (live === live) {
          const stepped = g.tankAngle;
          g.tankAngle = live;
          let d = live - stepped;
          d -= Math.round(d / (Math.PI * 2)) * Math.PI * 2;
          if (d !== 0 && SMALL_FIX.CH046 !== 0 && lOk && ARRAS_PARITY.RING_WORLD !== 0) this.unweldLayers(st.bodyLayers, oL0, oL1, d);
          if (d !== 0 && SMALL_FIX.CH047 !== 0 && tOk) this.weldTurrets(st.turrets, st.bodyLayers, oT0, oT1, d);
        }
      } else if (this.pJumpOut === this.stamp) {
        this.camHeld = true; this.camX = g.cameraX; this.camY = g.cameraY;
        g._cameraToPlayer();
      }
    }
    const stamp = this.stamp;
    {
      const hw = g.width / (2 * g.zoom) + VIEW_MARGIN, hh = g.height / (2 * g.zoom) + VIEW_MARGIN;
      this.vx0 = g.cameraX - hw; this.vx1 = g.cameraX + hw; this.vy0 = g.cameraY - hh; this.vy1 = g.cameraY + hh;
    }
    const bots = st.enemyTanks;
    for (let i = 0; i < bots.length; i++) {
      const e = bots[i];
      if (!e.active) continue;
      if (e._ipStep !== stamp || e._ipLife !== e.id) { this.hide(e); continue; }
      if (e._ipJump === stamp) continue;
      const off = e._ipOff;
      const ek = this.wk(e, stamp, this.f), eIn = this.wIn(e, stamp);
      const dx = e.position.x - this.pv[off] - (eIn ? e._ipWX : 0), dy = e.position.y - this.pv[off + 1] - (eIn ? e._ipWY : 0);
      if (!(dx * dx + dy * dy < JUMP_DIST_SQ)) continue;
      this.o = off;
      e.position.x = this.lin(e.position.x); e.position.y = this.lin(e.position.y);
      if (ek === ek) { e.position.x += e._ipWX * ek; e.position.y += e._ipWY * ek; }
      e.angle = this.ang(e.angle); e._baseBodyAngle = this.ang(e._baseBodyAngle);
      e.size = this.lin(e.size); e.growthScale = this.lin(e.growthScale); e.damageOverlay = this.lin(e.damageOverlay);
      e.invisAlpha = this.lin(e.invisAlpha); e.viewAlpha = this.lin(e.viewAlpha); e.displayHp = this.lin(e.displayHp);
      e.displayShield = this.lin(e.displayShield); e.hpBarOpacity = this.lin(e.hpBarOpacity);
      const near = this.nearBy(e.position.x, e.position.y, _tankExtra(this.tankReachOf, e));
      if (near) {
        if (e.turrets && e.turrets === e._ipTur) this.applyTurrets(e.turrets, e._ipEnd);
        if (e.bodyLayers && e.bodyLayers === e._ipLay && e.turrets === e._ipTur) this.applyLayers(e.bodyLayers, e._ipEnd);
      }
      this.touch(e, KIND_BOT, near);
    }
    const bl = g.bullets;
    for (let i = 0; i < bl.length; i++) {
      const b = bl[i];
      if (!b.active) continue;
      if (!this.nearBy(b.position.x, b.position.y, _roundExtra(b))) continue;
      if (b._ipStep !== stamp || b._ipLife !== b.bulletId) {
        if (b._ipStep === -stamp && b._ipLife === b.bulletId) continue;
        this.hide(b); continue;
      }
      if (b._ipJump === stamp) continue;
      const off = b._ipOff;
      const bk = this.wk(b, stamp, this.f), bIn = this.wIn(b, stamp);
      const dx = b.position.x - this.pv[off] - (bIn ? b._ipWX : 0), dy = b.position.y - this.pv[off + 1] - (bIn ? b._ipWY : 0);
      if (!(dx * dx + dy * dy < JUMP_DIST_SQ)) continue;
      this.o = off;
      b.position.x = this.lin(b.position.x); b.position.y = this.lin(b.position.y);
      if (bk === bk) { b.position.x += b._ipWX * bk; b.position.y += b._ipWY * bk; }
      b.facingAngle = this.ang(b.facingAngle); b.visualAimAngle = this.ang(b.visualAimAngle);
      b.size = this.lin(b.size); b.growth = this.lin(b.growth); b.opacity = this.lin(b.opacity);
      b.damageOverlay = this.lin(b.damageOverlay); b._fadeT = this.lin(b._fadeT);
      b.exitBaseX = this.lin(b.exitBaseX); b.exitBaseY = this.lin(b.exitBaseY); b.exitBarrelAngle = this.ang(b.exitBarrelAngle);
      b.exitProgress = this.lin(b.exitProgress);
      const subs = b.subTurrets;
      const near = true;
      if (near && subs === b._ipSub) {
        if (subs) for (let j = 0; j < subs.length && this.o < b._ipEnd; j++) {
          const s = subs[j], td = s.turretData;
          s.kick = this.lin(s.kick); s.animProgress = this.lin(s.animProgress);
          if (td) { td.autoCurrentAngle = this.ang(td.autoCurrentAngle); td._lateTurn = this.ang(td._lateTurn); }
          else { this.sv[this.o++] = NaN; this.sv[this.o++] = NaN; }
          const ci = this.pv[this.o]; this.sv[this.o++] = NaN;
          const inner = td ? td.autoSubTurrets : null;
          if (inner && inner.length === ci) {
            for (let q = 0; q < ci && this.o < b._ipEnd; q++) { const u = inner[q]; u.autoCurrentAngle = this.ang(u.autoCurrentAngle); u.animProgress = this.lin(u.animProgress); u._lateTurn = this.ang(u._lateTurn); }
          } else {
            for (let q = 0; q < ci * 3 && this.o < b._ipEnd; q++) this.sv[this.o++] = NaN;
          }
        }
        if (b._bulletBodyLayers && b._bulletBodyLayers === b._ipLay) this.applyLayers(b._bulletBodyLayers, b._ipEnd);
      }
      this.touch(b, KIND_ROUND, near);
    }
    this.beginShapes(g.floatingPolygons, stamp);
    this.beginShapes(g.shapePuffs, stamp);
    for (let k = 0; k < this.tN; k++) {
      if (this.tKind[k] !== KIND_ROUND) continue;
      const b = this.tObj[k];
      if (b.inExitPhase) g._exitPlace(b, true);
    }
    {
      const rings = g.auraRings, rn = Math.min(g.auraRingCount, this.ringN);
      this.o = this.ringOff;
      for (let i = 0; i < rn; i++) {
        const r = rings[i];
        if (r.turret !== this.ringT[i]) { this.sv[this.o++] = NaN; this.sv[this.o++] = NaN; this.sv[this.o++] = NaN; this.sv[this.o++] = NaN; continue; }
        if (SMALL_FIX.CH045 !== 0) {
          const dx = r.x - this.pv[this.o], dy = r.y - this.pv[this.o + 1];
          if (!(dx * dx + dy * dy < JUMP_DIST_SQ)) { this.sv[this.o++] = NaN; this.sv[this.o++] = NaN; this.sv[this.o++] = NaN; this.sv[this.o++] = NaN; continue; }
        }
        r.x = this.lin(r.x); r.y = this.lin(r.y); r.r = this.lin(r.r); r.opacity = this.lin(r.opacity);
      }
      this.ringDone = rn;
      if (g._auraPlaceDrawn !== undefined) g._auraPlaceDrawn(rn);
    }
    this.portDone = false;
    {
      const pts = g.mapState ? g.mapState.portals : null;
      if (pts !== null && pts === this.portArr && pts.length === this.portN) {
        this.o = this.portOff;
        for (let i = 0; i < this.portN; i++) {
          const pt = pts[i];
          {
            const px = this.pv[this.o], py = this.pv[this.o + 1], dx = pt.x - px, dy = pt.y - py;
            if (dx * dx + dy * dy < JUMP_DIST_SQ) { pt.x = this.lin(pt.x); pt.y = this.lin(pt.y); }
            else { this.sv[this.o++] = pt.x; this.sv[this.o++] = pt.y; }
          }
          pt._spinAngle = this.lin(pt._spinAngle); pt._scale = this.lin(pt._scale); pt._opacity = this.lin(pt._opacity);
          const aP = pt._auraPos;
          const na = this.pv[this.o]; this.sv[this.o++] = NaN;
          if (aP && aP.length === na) { for (let a = 0; a < na; a++) aP[a] = this.lin(aP[a]); }
          else for (let a = 0; a < na; a++) this.sv[this.o++] = NaN;
          const pT = pt._particleT;
          const np = this.pv[this.o]; this.sv[this.o++] = NaN;
          if (pT && pT.length === np) {
            for (let q = 0; q < np; q++) {
              if (pT[q] < this.pv[this.o]) this.sv[this.o++] = NaN;
              else pT[q] = this.lin(pT[q]);
            }
          } else for (let q = 0; q < np; q++) this.sv[this.o++] = NaN;
        }
        this.portDone = true;
      }
    }
    this.beginWalls(g);
    this.beginRocks(g);
    this.beginMagic(g);
  }

  private beginShapes(ps: any[], stamp: number): void {
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (!p.active) continue;
      if (!this.near(p.position.x, p.position.y)) continue;
      if (p._ipStep !== stamp || p._ipLife !== p.id) { this.hide(p); continue; }
      if (p._ipJump === stamp) continue;
      const off = p._ipOff;
      const pk = this.wk(p, stamp, this.f), pIn = this.wIn(p, stamp);
      const dx = p.position.x - this.pv[off] - (pIn ? p._ipWX : 0), dy = p.position.y - this.pv[off + 1] - (pIn ? p._ipWY : 0);
      if (!(dx * dx + dy * dy < JUMP_DIST_SQ)) continue;
      this.o = off;
      p.position.x = this.lin(p.position.x); p.position.y = this.lin(p.position.y);
      if (pk === pk) { p.position.x += p._ipWX * pk; p.position.y += p._ipWY * pk; }
      p.rotation = this.ang(p.rotation); p.opacity = this.lin(p.opacity); p.growth = this.lin(p.growth);
      p.damageOverlay = this.lin(p.damageOverlay); p._fadeT = this.lin(p._fadeT); p.displayHp = this.lin(p.displayHp);
      p.displayShield = this.lin(p.displayShield); p.hpBarOpacity = this.lin(p.hpBarOpacity);
      this.touch(p, KIND_SHAPE, false);
    }
  }

  private touch(x: any, kind: number, parts: boolean): void {
    this.tObj[this.tN] = x; this.tKind[this.tN] = kind; this.tParts[this.tN] = parts; this.tN++;
  }

  private near(x: number, y: number): boolean {
    return x >= this.vx0 && x <= this.vx1 && y >= this.vy0 && y <= this.vy1;
  }

  private nearBy(x: number, y: number, r: number): boolean {
    if (r === 0) return this.near(x, y);
    return x >= this.vx0 - r && x <= this.vx1 + r && y >= this.vy0 - r && y <= this.vy1 + r;
  }

  private hide(x: any): void {
    x.active = false;
    this.hid[this.hidN++] = x;
  }

  end(g: any): void {
    if (!this.open) return;
    this.open = false;
    if (this.mmTouched > 0) this.endMagic();
    if (this.wallTouched > 0) this.endWalls();
    if (this.rockTouched > 0) this.endRocks();
    const st = this.stateRef;
    if (!this.pJump) {
      this.o = 0;
      g.tankPos.x = this.back(g.tankPos.x); g.tankPos.y = this.back(g.tankPos.y);
      g.tankAngle = this.back(g.tankAngle); g._baseBodyAngle = this.back(g._baseBodyAngle);
      g.cameraX = this.back(g.cameraX); g.cameraY = this.back(g.cameraY); g.zoom = this.back(g.zoom);
      g.tankDamageOverlay = this.back(g.tankDamageOverlay);
      st.tankInvisAlpha = this.back(st.tankInvisAlpha); st.playerGrowthScale = this.back(st.playerGrowthScale);
      st.tankDisplayHealth = this.back(st.tankDisplayHealth); st.tankDisplayShield = this.back(st.tankDisplayShield);
      st.tankHpBarOpacity = this.back(st.tankHpBarOpacity);
      if (st.turrets === this.pTur) this.backTurrets(st.turrets, this.pTurEnd); else this.o = this.pTurEnd;
      if (st.bodyLayers && st.bodyLayers === this.pLay) this.backLayers(st.bodyLayers, this.pLayEnd);
    } else if (this.camHeld) {
      g.cameraX = this.camX; g.cameraY = this.camY;
      this.camHeld = false;
    }
    for (let k = 0; k < this.tN; k++) {
      const x = this.tObj[k], kind = this.tKind[k];
      this.o = x._ipOff;
      if (kind === KIND_BOT) {
        const e = x;
        e.position.x = this.back(e.position.x); e.position.y = this.back(e.position.y);
        e.angle = this.back(e.angle); e._baseBodyAngle = this.back(e._baseBodyAngle);
        e.size = this.back(e.size); e.growthScale = this.back(e.growthScale); e.damageOverlay = this.back(e.damageOverlay);
        e.invisAlpha = this.back(e.invisAlpha); e.viewAlpha = this.back(e.viewAlpha); e.displayHp = this.back(e.displayHp);
        e.displayShield = this.back(e.displayShield); e.hpBarOpacity = this.back(e.hpBarOpacity);
        if (this.tParts[k]) {
          if (e.turrets && e.turrets === e._ipTur) this.backTurrets(e.turrets, e._ipEnd);
          if (e.bodyLayers && e.bodyLayers === e._ipLay && e.turrets === e._ipTur) this.backLayers(e.bodyLayers, e._ipEnd);
        }
      } else if (kind === KIND_ROUND) {
        const b = x;
        b.position.x = this.back(b.position.x); b.position.y = this.back(b.position.y);
        b.facingAngle = this.back(b.facingAngle); b.visualAimAngle = this.back(b.visualAimAngle);
        b.size = this.back(b.size); b.growth = this.back(b.growth); b.opacity = this.back(b.opacity);
        b.damageOverlay = this.back(b.damageOverlay); b._fadeT = this.back(b._fadeT);
        b.exitBaseX = this.back(b.exitBaseX); b.exitBaseY = this.back(b.exitBaseY); b.exitBarrelAngle = this.back(b.exitBarrelAngle);
        b.exitProgress = this.back(b.exitProgress);
        const subs = b.subTurrets;
        if (this.tParts[k] && subs === b._ipSub) {
          if (subs) for (let j = 0; j < subs.length && this.o < b._ipEnd; j++) {
            const s = subs[j], td = s.turretData;
            s.kick = this.back(s.kick); s.animProgress = this.back(s.animProgress);
            if (td) { td.autoCurrentAngle = this.back(td.autoCurrentAngle); td._lateTurn = this.back(td._lateTurn); }
            else this.o += 2;
            const ci = this.pv[this.o++];
            const inner = td ? td.autoSubTurrets : null;
            if (inner && inner.length === ci) {
              for (let q = 0; q < ci && this.o < b._ipEnd; q++) { const u = inner[q]; u.autoCurrentAngle = this.back(u.autoCurrentAngle); u.animProgress = this.back(u.animProgress); u._lateTurn = this.back(u._lateTurn); }
            } else this.o += ci * 3;
          }
          if (b._bulletBodyLayers && b._bulletBodyLayers === b._ipLay) this.backLayers(b._bulletBodyLayers, b._ipEnd);
        }
      } else {
        const p = x;
        p.position.x = this.back(p.position.x); p.position.y = this.back(p.position.y);
        p.rotation = this.back(p.rotation); p.opacity = this.back(p.opacity); p.growth = this.back(p.growth);
        p.damageOverlay = this.back(p.damageOverlay); p._fadeT = this.back(p._fadeT); p.displayHp = this.back(p.displayHp);
        p.displayShield = this.back(p.displayShield); p.hpBarOpacity = this.back(p.hpBarOpacity);
      }
      this.tObj[k] = null;
    }
    {
      const rings = g.auraRings;
      this.o = this.ringOff;
      for (let i = 0; i < this.ringDone; i++) {
        const r = rings[i];
        r.x = this.back(r.x); r.y = this.back(r.y); r.r = this.back(r.r); r.opacity = this.back(r.opacity);
      }
    }
    if (this.portDone) {
      const pts = this.portArr!;
      this.o = this.portOff;
      for (let i = 0; i < this.portN; i++) {
        const pt = pts[i];
        pt.x = this.back(pt.x); pt.y = this.back(pt.y);
        pt._spinAngle = this.back(pt._spinAngle); pt._scale = this.back(pt._scale); pt._opacity = this.back(pt._opacity);
        const aP = pt._auraPos;
        const na = this.pv[this.o++];
        if (aP && aP.length === na) { for (let a = 0; a < na; a++) aP[a] = this.back(aP[a]); } else this.o += na;
        const pT = pt._particleT;
        const np = this.pv[this.o++];
        if (pT && pT.length === np) { for (let q = 0; q < np; q++) pT[q] = this.back(pT[q]); } else this.o += np;
      }
      this.portDone = false;
    }
    for (let k = 0; k < this.hidN; k++) { this.hid[k].active = true; this.hid[k] = null; }
    this.hidN = 0; this.tN = 0;
    this.stateRef = null;
  }
}
