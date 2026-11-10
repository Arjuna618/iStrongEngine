export const FIXED_STEP = {
  ON: 1 as 0 | 1,
  HZ: 60,
};

export const FIXED_STEP_OLD_LOOP: boolean = typeof location !== 'undefined' && /[?&]oldloop(?:[=&]|$)/.test(location.search);

export function fixedStepEnabled(): boolean {
  return FIXED_STEP.ON !== 0 && !FIXED_STEP_OLD_LOOP;
}

export class StepAccumulator {
  acc = 0;
  lastDt = 0;
  steps = 0;

  constructor(public stepSec: number = 1 / FIXED_STEP.HZ) {}

  take(frameDt: number): number {
    this.acc += frameDt;
    const n = Math.floor(this.acc / this.stepSec + 1e-9);
    if (n <= 0) return 0;
    this.acc -= n * this.stepSec;
    if (this.acc < 0) this.acc = 0;
    const dt = n * this.stepSec;
    this.lastDt = dt;
    this.steps++;
    return dt;
  }

  frac(): number {
    const d = this.lastDt;
    if (d <= 0) return 1;
    const f = (d - this.stepSec + this.acc) / d;
    return f < 0 ? 0 : f > 1 ? 1 : f;
  }

  ahead(): number {
    return this.acc;
  }

  reset(): void {
    this.acc = 0;
    this.lastDt = 0;
  }
}

export interface FixedStepHost {
  readonly state: { readonly isTestMode: boolean; readonly paused: boolean };
  _fsActive: boolean;
  fixedStepBegin(): void;
  fixedStepEnd(): void;
  fixedStepUpdate(dt: number, steps: number): void;
  fixedStepFramePump(frameDt: number): void;
  fixedStepSetAhead(ms: number): void;
  update(dt: number): void;
}

export function runFixedStepFrame(host: FixedStepHost, acc: StepAccumulator, frameDt: number): boolean {
  const on = fixedStepEnabled() && host.state.isTestMode;
  if (on !== host._fsActive) {
    if (on) { host.fixedStepBegin(); acc.reset(); }
    else host.fixedStepEnd();
  }
  if (!on) {
    host.update(frameDt);
    return false;
  }
  if (host.state.paused) {
    host.update(frameDt);
  } else {
    const dt = acc.take(frameDt);
    if (dt > 0) host.fixedStepUpdate(dt, Math.round(dt / acc.stepSec));
    host.fixedStepFramePump(frameDt);
  }
  host.fixedStepSetAhead(acc.ahead() * 1000);
  return true;
}
