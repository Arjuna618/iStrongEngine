import { fireTip } from './tips';

const STORAGE_KEY = 'istrong_render_quality';

export const RENDER_QUALITY_LEVELS: readonly number[] = [1, 0.85, 0.7, 0.5];

export type RenderQualitySetting = 'auto' | number;

const MIN_LEVEL = RENDER_QUALITY_LEVELS[RENDER_QUALITY_LEVELS.length - 1];

function isValidLevel(v: number): boolean {
  for (let i = 0; i < RENDER_QUALITY_LEVELS.length; i++) if (RENDER_QUALITY_LEVELS[i] === v) return true;
  return false;
}

let _setting: RenderQualitySetting = 'auto';

try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === 'auto') _setting = 'auto';
  else if (raw !== null) {
    const n = parseFloat(raw);
    if (Number.isFinite(n) && isValidLevel(n)) _setting = n;
  }
} catch { }

const _listeners = new Set<() => void>();

function _notify(): void {
  for (const fn of _listeners) fn();
}

export function subscribeRenderQuality(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

export function getRenderQualitySetting(): RenderQualitySetting {
  return _setting;
}

export function setRenderQualitySetting(v: RenderQualitySetting): void {
  const next: RenderQualitySetting = v === 'auto' ? 'auto' : (isValidLevel(v) ? v : 1);
  if (next === _setting) return;
  _setting = next;
  if (next === 'auto') _autoReset();
  try { localStorage.setItem(STORAGE_KEY, String(next)); } catch { }
  _notify();
}

const AUTO_DOWN_RATIO = 1.30;
const AUTO_UP_RATIO = 1.05;
const AUTO_DOWN_DWELL_MS = 600;
const AUTO_SEVERE_RATIO = 2.0;
const AUTO_DOWN_DWELL_SEVERE_MS = 250;
const AUTO_UP_DWELL_MS_BASE = 4000;
const AUTO_UP_DWELL_MS_MAX = 30000;
const AUTO_COOLDOWN_MS = 1500;
const VERIFY_SETTLE_MS = 300;
const VERIFY_WINDOW_MS = 700;
const VERIFY_MIN_GAIN = 0.06;
const NOT_FILL_BOUND_LOCKOUT_MS = 45000;
const WARMUP_MS = 3000;
const AUTO_MIN_SAMPLES = 5;
const AUTO_OUTLIER_MS = 250;
const AUTO_EMA_ALPHA = 0.08;
const REFRESH_MIN_MS = 4;
const REFRESH_MAX_MS = 34;
const REFRESH_CORROBORATE = 8;
const REFRESH_CANDIDATE_TOL = 1.15;

let _autoIndex = 0;
let _emaMs = 0;
let _refreshMs = 16.67;
let _badMs = 0;
let _goodMs = 0;
let _cooldownMs = 0;
let _upDwellMs = AUTO_UP_DWELL_MS_BASE;
let _msSinceUp = Infinity;
let _refreshCand = 0;
let _refreshCandHits = 0;

let _phase = 0;
let _phaseMs = 0;
let _preStepMs = 0;
let _bSum = 0;
let _bCount = 0;
let _bUpdSum = 0;
let _skippedTrials = 0;
export function getSkippedQualityTrials(): number { return _skippedTrials; }

function _trialCanPay(index: number): boolean {
  if (_bUpdSum <= 0 || _bSum <= 0) return true;
  const now = RENDER_QUALITY_LEVELS[index], next = RENDER_QUALITY_LEVELS[index + 1];
  const saving = 1 - (next * next) / (now * now);
  const updShare = _bUpdSum / _bSum > 1 ? 1 : _bUpdSum / _bSum;
  return (1 - updShare) * saving >= VERIFY_MIN_GAIN;
}
let _vSum = 0;
let _vCount = 0;
let _revertIndex = 0;
let _noFillBoundMs = 0;
let _wasAdapting = false;
let _warmupMs = 0;

function _autoReset(): void {
  _autoIndex = 0;
  _emaMs = 0;
  _badMs = 0; _bSum = 0; _bCount = 0; _bUpdSum = 0;
  _goodMs = 0;
  _cooldownMs = 0;
  _upDwellMs = AUTO_UP_DWELL_MS_BASE;
  _msSinceUp = Infinity;
  _phase = 0;
  _phaseMs = 0;
  _preStepMs = 0;
  _vSum = 0;
  _vCount = 0;
  _revertIndex = 0;
  _noFillBoundMs = 0;
  _wasAdapting = false;
  _warmupMs = 0;
  _refreshMs = 16.67;
  _refreshCand = 0;
  _refreshCandHits = 0;
}

export function noteFrameInterval(intervalMs: number, adapting: boolean, updateMs: number = 0): void {
  if (!(intervalMs > 0) || intervalMs > AUTO_OUTLIER_MS) return;

  if (intervalMs < _refreshMs * 0.98) {
    if (_refreshCandHits > 0 && intervalMs <= _refreshCand * REFRESH_CANDIDATE_TOL) {
      if (intervalMs < _refreshCand) _refreshCand = intervalMs;
      if (++_refreshCandHits >= REFRESH_CORROBORATE) {
        _refreshMs = _refreshCand < REFRESH_MIN_MS ? REFRESH_MIN_MS : _refreshCand;
        _refreshCand = 0;
        _refreshCandHits = 0;
      }
    } else {
      _refreshCand = intervalMs;
      _refreshCandHits = 1;
    }
  } else {
    _refreshCand = 0;
    _refreshCandHits = 0;
  }

  if (_setting !== 'auto' || !adapting) { _wasAdapting = false; return; }

  if (!_wasAdapting) {
    _wasAdapting = true;
    _warmupMs = WARMUP_MS;
    if (_phase !== 0 && _autoIndex !== _revertIndex) { _autoIndex = _revertIndex; _notify(); }
    _phase = 0; _phaseMs = 0;
    _badMs = 0; _goodMs = 0; _bSum = 0; _bCount = 0; _bUpdSum = 0;
  }
  if (_warmupMs > 0) {
    _warmupMs -= intervalMs;
    if (_warmupMs <= 0) _emaMs = 0;
    return;
  }

  _emaMs = _emaMs === 0 ? intervalMs : _emaMs + (intervalMs - _emaMs) * AUTO_EMA_ALPHA;

  if (_msSinceUp < AUTO_UP_DWELL_MS_MAX) _msSinceUp += intervalMs;
  if (_noFillBoundMs > 0) _noFillBoundMs -= intervalMs;

  if (_phase === 1) {
    _phaseMs += intervalMs;
    if (_phaseMs >= VERIFY_SETTLE_MS) { _phase = 2; _phaseMs = 0; _vSum = 0; _vCount = 0; }
    return;
  }
  if (_phase === 2) {
    _phaseMs += intervalMs;
    _vSum += intervalMs;
    _vCount++;
    if (_phaseMs < VERIFY_WINDOW_MS) return;

    const after = _vSum / _vCount;
    const gain = (_preStepMs - after) / _preStepMs;
    _phase = 0;
    _phaseMs = 0;
    _badMs = 0; _bSum = 0; _bCount = 0; _bUpdSum = 0;
    _goodMs = 0;

    if (gain < VERIFY_MIN_GAIN) {
      _autoIndex = _revertIndex;
      _noFillBoundMs = NOT_FILL_BOUND_LOCKOUT_MS;
      _notify();
    } else {
      _cooldownMs = 0;
      fireTip('autoQualityLowered');
    }
    return;
  }

  if (_cooldownMs > 0) { _cooldownMs -= intervalMs; _badMs = 0; _bSum = 0; _bCount = 0; _bUpdSum = 0; _goodMs = 0; return; }

  const downAt = _refreshMs * AUTO_DOWN_RATIO;
  const upAt = _refreshMs * AUTO_UP_RATIO;

  if (_emaMs > downAt) {
    _goodMs = 0;
    _badMs += intervalMs;
    _bSum += intervalMs;
    _bUpdSum += updateMs > 0 ? updateMs : 0;
    _bCount++;
    const dwell = _emaMs > _refreshMs * AUTO_SEVERE_RATIO
      ? AUTO_DOWN_DWELL_SEVERE_MS : AUTO_DOWN_DWELL_MS;
    if (_badMs >= dwell && _bCount >= AUTO_MIN_SAMPLES &&
        _autoIndex < RENDER_QUALITY_LEVELS.length - 1 && _noFillBoundMs <= 0 && !_trialCanPay(_autoIndex)) {
      _skippedTrials++;
      _badMs = 0; _bSum = 0; _bCount = 0; _bUpdSum = 0;
    } else if (_badMs >= dwell && _bCount >= AUTO_MIN_SAMPLES &&
        _autoIndex < RENDER_QUALITY_LEVELS.length - 1 && _noFillBoundMs <= 0) {
      _revertIndex = _autoIndex;
      _preStepMs = _bCount > 0 ? _bSum / _bCount : _emaMs;
      _autoIndex++;
      _badMs = 0; _bSum = 0; _bCount = 0; _bUpdSum = 0;
      _phase = 1;
      _phaseMs = 0;
      if (_msSinceUp < AUTO_UP_DWELL_MS_BASE * 2) {
        _upDwellMs = Math.min(_upDwellMs * 2, AUTO_UP_DWELL_MS_MAX);
      }
      _notify();
    }
  } else if (_emaMs < upAt) {
    _badMs = 0; _bSum = 0; _bCount = 0; _bUpdSum = 0;
    _goodMs += intervalMs;
    if (_goodMs >= _upDwellMs && _autoIndex > 0) {
      _autoIndex--;
      _goodMs = 0;
      _cooldownMs = AUTO_COOLDOWN_MS;
      _msSinceUp = 0;
      _notify();
    }
  } else {
    _badMs = 0; _bSum = 0; _bCount = 0; _bUpdSum = 0;
    _goodMs = 0;
  }
}

export function getEffectiveRenderScale(): number {
  if (_setting === 'auto') return RENDER_QUALITY_LEVELS[_autoIndex];
  return _setting;
}

export function getAutoChosenScale(): number {
  return RENDER_QUALITY_LEVELS[_autoIndex];
}

export function getMinRenderLevel(): number {
  return MIN_LEVEL;
}
