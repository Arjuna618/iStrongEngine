const DEG = Math.PI / 180;
export const BOT_HAND = {
  TOP_DPS: 677,
  SWING_MS_A: 40,
  SWING_MS_B: 60,
  SWING_W: 3,
  SUBSTEP_S: 1 / 240,
};
const SETTLE_RAD = 1e-4, SETTLE_RATE = 2e-3;
const RELEASE_RAD = 0.5 * DEG, RELEASE_RATE = 10 * DEG;

const TWO_PI = Math.PI * 2;
function wrap(a: number): number { while (a > Math.PI) a -= TWO_PI; while (a < -Math.PI) a += TWO_PI; return a; }

export function handSwingMs(delta: number): number {
  const d = (delta < 0 ? -delta : delta) / DEG;
  if (!(d > 0)) return 0;
  const fitts = BOT_HAND.SWING_MS_A + BOT_HAND.SWING_MS_B * Math.log2(1 + d / BOT_HAND.SWING_W);
  const byTop = 2 * d / BOT_HAND.TOP_DPS * 1000;
  return fitts > byTop ? fitts : byTop;
}
function swingAccel(e: number): number {
  const t = handSwingMs(e) / 1000;
  return t > 0 ? 4 * e / (t * t) : 0;
}
let _capTop = NaN, _capA = NaN, _capB = NaN, _capW = NaN, _accMax = 0;
function accMax(): number {
  if (BOT_HAND.TOP_DPS !== _capTop || BOT_HAND.SWING_MS_A !== _capA || BOT_HAND.SWING_MS_B !== _capB || BOT_HAND.SWING_W !== _capW) {
    _capTop = BOT_HAND.TOP_DPS; _capA = BOT_HAND.SWING_MS_A; _capB = BOT_HAND.SWING_MS_B; _capW = BOT_HAND.SWING_W; _accMax = 0;
    for (let i = 1; i <= 720; i++) { const a = swingAccel(i / 720 * Math.PI); if (a > _accMax) _accMax = a; }
  }
  return _accMax;
}

export interface HandState { handAngle: number; handRate: number; handAccel: number }

export function handStep(s: HandState, target: number, targetRate: number, dt: number): void {
  if (!(dt > 0)) return;
  const top = BOT_HAND.TOP_DPS * DEG, cap = accMax();
  const ff = targetRate > top ? top : targetRate < -top ? -top : targetRate;
  let n = Math.ceil(dt / BOT_HAND.SUBSTEP_S - 1e-9); if (n < 1) n = 1;
  const h = dt / n;
  let a = s.handAngle, r = s.handRate, acc = s.handAccel;
  for (let i = 0; i < n; i++) {
    let e = wrap(target - a);
    const rel = r - ff;
    if (e !== 0 && rel !== 0 && (e > 0) !== (rel > 0) && Math.PI - (e > 0 ? e : -e) < rel * rel / (2 * cap)) e = e > 0 ? e - TWO_PI : e + TWO_PI;
    const ae = e > 0 ? e : -e;
    const toward = e > 0 ? rel : -rel;
    const at = toward > 0 ? toward : -toward;
    if (ae < SETTLE_RAD && at < SETTLE_RATE) { a = target; r = ff; acc = 0; continue; }
    if (ae < RELEASE_RAD && at < RELEASE_RATE) acc = 0;
    let need: number;
    if (toward >= 0) need = swingAccel(ae);
    else {
      need = swingAccel(ae + toward * toward / (2 * cap));
      const catchUp = at / (BOT_HAND.SWING_MS_A / 1000);
      if (catchUp > need) need = catchUp;
    }
    if (need > cap) need = cap;
    if (need > acc) acc = need;
    if (!(acc > 0)) { a = target; r = ff; continue; }
    const brake = acc * h * (Math.sqrt(0.25 + 2 * ae / (acc * h * h)) - 0.5);
    let want = ff + (e > 0 ? brake : -brake);
    if (want > top) want = top; else if (want < -top) want = -top;
    const dv = want - r, lim = acc * h;
    const r1 = dv > lim ? r + lim : dv < -lim ? r - lim : want;
    a += r1 * h;
    r = r1;
  }
  s.handAngle = wrap(a); s.handRate = r; s.handAccel = acc;
}

export function quarterFollow(hull: number, aim: number, dt: number): number {
  return wrap(hull + wrap(aim - hull) * (1 - Math.pow(0.75, dt * 30)));
}

const _reach: HandState = { handAngle: 0, handRate: 0, handAccel: 0 };
export function handReachMs(delta: number, smooth: boolean, within = 0.05): number {
  const d = delta < 0 ? -delta : delta;
  if (d <= within) return 0;
  const tgt = d > Math.PI ? Math.PI : d;
  _reach.handAngle = 0; _reach.handRate = 0; _reach.handAccel = 0;
  let hull = 0;
  const dt = 1 / 120;
  for (let k = 1; k <= 360; k++) {
    handStep(_reach, tgt, 0, dt);
    hull = smooth ? quarterFollow(hull, _reach.handAngle, dt) : _reach.handAngle;
    const left = wrap(tgt - hull);
    if ((left < 0 ? -left : left) <= within) return k * dt * 1000;
  }
  return 3000;
}
