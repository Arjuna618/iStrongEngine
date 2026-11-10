import type { GameLogic } from '../../game/GameLogic';

const SETTLE_MS = 160;

let _logic: GameLogic | null = null;
let _isEngine: () => boolean = () => false;
let _timer = 0;
let _pointerDown = false;
let _away = true;

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const t = (el as HTMLInputElement).type;
  return t === 'text' || t === 'number' || t === 'search' || t === '' || t === 'email' || t === 'url';
}

function run(force: boolean): void {
  _timer = 0;
  const logic = _logic;
  if (!logic) return;
  if (!_isEngine() || logic.state.isTestMode) { _away = true; return; }
  if (!force && _pointerDown) return;
  if (!force && isTextField(document.activeElement)) return;
  const now = Date.now();
  if (_away) { _away = false; logic.rebaselineDesignHistory(now); return; }
  logic.recordDesignHistory(now);
}

export function pokeDesignHistory(): void {
  const logic = _logic;
  if (!logic) return;
  if (logic.state.isTestMode) { _away = true; return; }
  if (_timer) return;
  _timer = window.setTimeout(() => run(false), SETTLE_MS);
}

export function flushDesignHistory(): void {
  if (_timer) { window.clearTimeout(_timer); _timer = 0; }
  run(true);
}

export function installHistoryRecorder(logic: GameLogic, isEngine: () => boolean): () => void {
  _logic = logic;
  _isEngine = isEngine;
  _away = true;
  const down = () => { if (_timer && !_pointerDown) flushDesignHistory(); _pointerDown = true; };
  const up = () => { if (_pointerDown) { _pointerDown = false; pokeDesignHistory(); } };
  const lost = () => { _pointerDown = false; pokeDesignHistory(); };
  const left = () => pokeDesignHistory();
  const key = (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === 'Tab') pokeDesignHistory(); };
  window.addEventListener('pointerdown', down, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', lost, true);
  window.addEventListener('blur', lost);
  document.addEventListener('focusout', left, true);
  window.addEventListener('keyup', key, true);
  return () => {
    window.removeEventListener('pointerdown', down, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', lost, true);
    window.removeEventListener('blur', lost);
    document.removeEventListener('focusout', left, true);
    window.removeEventListener('keyup', key, true);
    if (_timer) { window.clearTimeout(_timer); _timer = 0; }
    if (_logic === logic) _logic = null;
  };
}
