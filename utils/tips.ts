export type TipTrigger =
  | 'bodyLayerAdded'
  | 'turretPlaced'
  | 'projectileLibOpened'
  | 'teamModeSelected'
  | 'enemyToolOpened'
  | 'enemyConfigOpened'
  | 'enemySaved'
  | 'seedRandomized'
  | 'mazeTypeChanged'
  | 'portalsEnabled'
  | 'customEditorOpened'
  | 'importExportOpened'
  | 'turretExportSelected'
  | 'settingsOpened'
  | 'debugEnabled'
  | 'autoQualityLowered'
  | 'projectsIntroduced';

export interface Tip {
  id: string;
  trigger: TipTrigger;
  text: string;
}

export const TIPS: Tip[] = [
  { id: 'tank-layer-edit',     trigger: 'bodyLayerAdded',     text: 'Click a layer in the list to edit its shape and spin on its own.' },
  { id: 'canvas-shift-snap',   trigger: 'turretPlaced',       text: 'Hold Shift while placing a turret to snap its angle.' },
  { id: 'canvas-select-edit',  trigger: 'turretPlaced',       text: 'Click a turret in the list to select it and edit its settings.' },
  { id: 'canvas-compass',      trigger: 'turretPlaced',       text: 'Compass Placement places several turrets evenly around the body.' },
  { id: 'canvas-undo',         trigger: 'turretPlaced',       text: 'Press Ctrl and Z to undo the last turret you placed.' },
  { id: 'canvas-delete-key',   trigger: 'turretPlaced',       text: 'With a turret selected, press Delete to remove it.' },
  { id: 'canvas-proj-as-tank', trigger: 'projectileLibOpened', text: 'Load any projectile here to edit it on the canvas as a tank.' },
  { id: 'mode-team-bots',      trigger: 'teamModeSelected',   text: 'You can add bots to this mode from the Enemy Tool.' },
  { id: 'enemy-import-own',    trigger: 'enemyToolOpened',    text: 'Import a tank file to use your own design as an enemy.' },
  { id: 'enemy-behavior',      trigger: 'enemyConfigOpened',  text: 'Behavior decides who the enemy attacks and when it flees.' },
  { id: 'enemy-power-toggle',  trigger: 'enemySaved',         text: 'Use the power button to disable an enemy without deleting it.' },
  { id: 'map-seed-share',      trigger: 'seedRandomized',     text: 'Copy the seed to recreate the exact same map later.' },
  { id: 'map-library-save',    trigger: 'mazeTypeChanged',    text: 'Save your setup to the Map Library to reuse it anytime.' },
  { id: 'map-portal-timing',   trigger: 'portalsEnabled',     text: 'Portal Timing lets portals appear and disappear on a schedule.' },
  { id: 'map-custom-editor',   trigger: 'customEditorOpened', text: 'Pick a tool in the Custom Editor section, then click the map to build.' },
  { id: 'ie-projectile',       trigger: 'importExportOpened', text: 'Export your tank as a projectile and fire it from another tank.' },
  { id: 'ie-turret-hidden',    trigger: 'turretExportSelected', text: 'The tank body hides while exporting turrets and returns after.' },
  { id: 'settings-sandbox',    trigger: 'settingsOpened',     text: 'Shape spawn settings live in the Map Designer under Sandbox Settings.' },
  { id: 'quality-auto-drop',   trigger: 'autoQualityLowered', text: 'Quality was lowered to keep the game smooth. Change this in App Settings under Performance.' },
  { id: 'settings-arrows',     trigger: 'settingsOpened',     text: 'Use the Up and Down arrow keys to switch between tools.' },
  { id: 'settings-docs',       trigger: 'settingsOpened',     text: 'The book icon at the top of the screen opens guides for every tool.' },
  { id: 'settings-debug',      trigger: 'debugEnabled',       text: 'Debug Mode adds extra tools to the pause menu during a test.' },
  { id: 'projects-kept',       trigger: 'projectsIntroduced', text: 'Your work is now kept automatically. Press Ctrl and S to save it as a project.' },
];

export const TIP_DISPLAY_MS = 5200;
export const TIP_COOLDOWN_MS = 18_000;
const MAX_SHOWS_PER_BURST = 2;
const TIP_REST_MS = 600_000;

const TIPS_ENABLED_KEY = 'istrong_tips_enabled';

let _enabled = true;
try {
  _enabled = localStorage.getItem(TIPS_ENABLED_KEY) !== '0';
} catch { }

export function getTipsEnabled(): boolean {
  return _enabled;
}

export function setTipsEnabled(v: boolean): void {
  _enabled = v;
  try { localStorage.setItem(TIPS_ENABLED_KEY, v ? '1' : '0'); } catch { }
  if (!v && _onHide) _onHide();
}

let _lastShownAt = -TIP_COOLDOWN_MS;
const _dismissed = new Set<string>();
const _rotation = new Map<TipTrigger, number>();
interface TipPacing { burstCount: number; lastShownAt: number; restUntil: number; }
const _pacing = new Map<string, TipPacing>();

let _onShow: ((tip: Tip) => void) | null = null;
let _onHide: (() => void) | null = null;

export function registerTipToastHost(onShow: (tip: Tip) => void, onHide: () => void): () => void {
  _onShow = onShow;
  _onHide = onHide;
  return () => {
    if (_onShow === onShow) { _onShow = null; _onHide = null; }
  };
}

export function fireTip(trigger: TipTrigger): void {
  if (!_enabled || !_onShow) return;
  const now = performance.now();
  if (now - _lastShownAt < TIP_COOLDOWN_MS) return;

  const candidates: Tip[] = [];
  for (let i = 0; i < TIPS.length; i++) {
    const t = TIPS[i];
    if (t.trigger !== trigger || _dismissed.has(t.id)) continue;
    const p = _pacing.get(t.id);
    if (p && now < p.restUntil) continue;
    candidates.push(t);
  }
  if (candidates.length === 0) return;

  const cursor = _rotation.get(trigger) ?? 0;
  const tip = candidates[cursor % candidates.length];
  _rotation.set(trigger, cursor + 1);

  let p = _pacing.get(tip.id);
  if (!p) { p = { burstCount: 0, lastShownAt: 0, restUntil: 0 }; _pacing.set(tip.id, p); }
  p.burstCount = now - p.lastShownAt > TIP_REST_MS ? 1 : p.burstCount + 1;
  p.lastShownAt = now;
  if (p.burstCount >= MAX_SHOWS_PER_BURST) {
    p.restUntil = now + TIP_REST_MS;
    p.burstCount = 0;
  }

  _lastShownAt = now;
  _onShow(tip);
}

export function dismissTip(id: string): void {
  _dismissed.add(id);
}
