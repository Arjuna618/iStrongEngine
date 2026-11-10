export interface HistoryCapture {
  tank: string;
  turrets: string[];
  turretIds: string[];
  layers: string[];
  layerIds: string[];
  ghost: string;
  pick: string;
  pickSig: string;
  libraryId?: string | null;
}

export type HistoryKind = 'start' | 'add' | 'remove' | 'edit' | 'load' | 'layer' | 'group' | 'body' | 'name';

export interface HistoryRow {
  readonly id: number;
  readonly label: string;
  readonly detail: string;
  readonly kind: HistoryKind;
  readonly at: number;
}

export interface HistoryHint { label: string; kind: HistoryKind; detail?: string }

interface Entry extends HistoryRow { cap: HistoryCapture }

const MEMORY_BUDGET = 32 * 1024 * 1024;
const MAX_ROWS = 5000;

export class DesignHistory {
  private entries: Entry[] = [];
  private nextId = 1;
  private pool = new Map<string, { s: string; n: number }>();
  private units = 0;
  private _version = 0;
  private listeners = new Set<() => void>();
  trimmed = false;

  get version(): number { return this._version; }
  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private changed(): void { this._version++; this.listeners.forEach(fn => fn()); }

  rows(): readonly HistoryRow[] { return this.entries; }
  get started(): boolean { return this.entries.length > 0; }
  canUndo(): boolean { return this.entries.length > 1; }

  private hold(s: string): string {
    const e = this.pool.get(s);
    if (e) { e.n++; return e.s; }
    this.pool.set(s, { s, n: 1 });
    this.units += s.length;
    return s;
  }
  private release(s: string): void {
    const e = this.pool.get(s);
    if (!e) return;
    if (--e.n === 0) { this.pool.delete(s); this.units -= s.length; }
  }
  private holdCap(c: HistoryCapture): HistoryCapture {
    const turrets = new Array<string>(c.turrets.length);
    for (let i = 0; i < c.turrets.length; i++) turrets[i] = this.hold(c.turrets[i]);
    const layers = new Array<string>(c.layers.length);
    for (let i = 0; i < c.layers.length; i++) layers[i] = this.hold(c.layers[i]);
    return { tank: this.hold(c.tank), turrets, turretIds: c.turretIds, layers, layerIds: c.layerIds, ghost: this.hold(c.ghost), pick: this.hold(c.pick), pickSig: c.pickSig, libraryId: c.libraryId ?? null };
  }
  private releaseCap(c: HistoryCapture): void {
    this.release(c.tank);
    for (let i = 0; i < c.turrets.length; i++) this.release(c.turrets[i]);
    for (let i = 0; i < c.layers.length; i++) this.release(c.layers[i]);
    this.release(c.ghost);
    this.release(c.pick);
  }

  start(cap: HistoryCapture, now: number): void {
    for (let i = 0; i < this.entries.length; i++) this.releaseCap(this.entries[i].cap);
    this.entries = [{ id: this.nextId++, label: 'Start of session', detail: '', kind: 'start', at: now, cap: this.holdCap(cap) }];
    this.trimmed = false;
    this.changed();
  }

  retake(cap: HistoryCapture): void {
    const top = this.entries[this.entries.length - 1];
    if (!top) return;
    const old = top.cap;
    top.cap = this.holdCap(cap);
    this.releaseCap(old);
  }

  record(cap: HistoryCapture, hint: HistoryHint | null, now: number): boolean {
    const top = this.entries[this.entries.length - 1];
    if (!top) { this.start(cap, now); return false; }
    const a = top.cap;
    const designChanged = a.tank !== cap.tank || !sameList(a.turrets, cap.turrets) || !sameList(a.layers, cap.layers);
    const ghostChanged = a.ghost !== cap.ghost;
    const modeChanged = a.pickSig !== cap.pickSig;
    if (designChanged || (ghostChanged && !modeChanged)) {
      const d = describeStep(a, cap, hint);
      this.entries.push({ id: this.nextId++, label: d.label, detail: d.detail, kind: d.kind, at: now, cap: this.holdCap(cap) });
      this.trim();
      this.changed();
      return true;
    }
    if (ghostChanged || modeChanged || a.pick !== cap.pick) this.retake(cap);
    return false;
  }

  undo(): HistoryCapture | null {
    if (this.entries.length <= 1) return null;
    const last = this.entries.pop()!;
    this.releaseCap(last.cap);
    this.changed();
    return this.entries[this.entries.length - 1].cap;
  }

  rewindTo(id: number): HistoryCapture | null {
    let i = -1;
    for (let k = 0; k < this.entries.length; k++) if (this.entries[k].id === id) { i = k; break; }
    if (i < 0 || i === this.entries.length - 1) return null;
    for (let k = this.entries.length - 1; k > i; k--) this.releaseCap(this.entries[k].cap);
    this.entries.length = i + 1;
    this.changed();
    return this.entries[i].cap;
  }

  private trim(): void {
    while (this.entries.length > 2 && (this.entries.length > MAX_ROWS || this.units > MEMORY_BUDGET)) {
      const old = this.entries.shift()!;
      this.releaseCap(old.cap);
      this.trimmed = true;
    }
  }

  poolStats(): { units: number; pieces: number } { return { units: this.units, pieces: this.pool.size }; }
}

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

const FIELD_NAMES: Record<string, string> = {
  tankSides: 'Body Sides', tankShapeDepth: 'Shape Depth', tankShapeCurved: 'Curved Edges', tankSize: 'Body Size',
  tankColor: 'Body Color', tankColorMap: 'Body Color', tankColorFree: 'Body Color', keepOwnColor: 'Keep Own Color',
  tankHP: 'Health', tankBodyDamage: 'Body Damage', tankMovementSpeed: 'Movement Speed', tankShieldRegen: 'Shield Regen',
  tankShieldCapacity: 'Shield', fovMultiplier: 'Field of View', maxSkillPoints: 'Max Skill Points', maxPointsPerSkill: 'Points per Skill',
  bonusSkillPoints: 'Bonus Skill Points', skillCaps: 'Skill Caps', preDefinedSkills: 'Starting Skills', canEarnSkillPoints: 'Earns Skill Points',
  baseSpinEnabled: 'Body Spin', baseSpinSpeed: 'Body Spin Speed', baseSpinDirection: 'Body Spin Direction',
  isHealer: 'Healer', healerAI: 'Healer AI', chargeAI: 'Charge AI', arenaCloserAI: 'Arena Closer AI', ignoresWalls: 'Ignores Walls', showHealthBar: 'Health Bar',
  invisibleEnabled: 'Invisibility', invisibleFadeInRate: 'Fade In Speed', invisibleFadeOutRate: 'Fade Out Speed', invisibleAlways: 'Always Invisible',
  tankPushability: 'Pushability', tankResistBase: 'Body Resist', tankPenetrationBase: 'Body Penetration', tankTouchScale: 'Touch Size',
  tankPushShare: 'Push Share', globalMaxAliveEnabled: 'Projectile Cap', globalMaxAlive: 'Projectile Cap', _hasNecroGlobalCap: '',
  primaryTurretId: 'Primary Turret', useCustomAimDirection: 'Direct Aim', customAimAngle: 'Aim Angle',
  cameraZoomEnabled: 'Sniper Zoom', cameraZoomDistance: 'Sniper Zoom Distance', statNamesType: 'Skill Labels', turretGroups: 'Groups',
  editorTankLabel: '', currentTankFileName: '', canvasIsProjectile: '',
  length: 'Length', width: 'Width', aspect: 'Aspect', xOffset: 'Position', yOffset: 'Position', _origXOffset: 'Position', _origYOffset: 'Position',
  _origLength: 'Length', _origWidth: 'Width', angle: 'Orientation', bps: 'Reload', speed: 'Bullet Speed', delay: 'Delay',
  knockback: 'Recoil', spread: 'Spread', shudder: 'Shudder', bulletDamage: 'Bullet Damage', bulletHealthBase: 'Bullet Health',
  bulletPenetration: 'Bullet Penetration', bulletLifetime: 'Bullet Lifetime', turretType: 'Turret Type', projectileType: 'Projectile',
  projectileBehaviors: 'Projectile Behaviors', color: 'Color', colorMap: 'Color', colorFree: 'Color', autoSubTurrets: 'Parts on the Base',
  primarySubTurretId: 'Aiming Part', aboveTankBody: 'Above Tank Body', aboveBase: 'Above Base', renderLayer: 'Render Layer',
  name: 'Name', tag: 'Tag', groupId: 'Group', look: 'Look', explode: 'Explode', autoCircleSize: 'Base Size', fov: 'Field of View',
  fovSize: 'Sight Range', maxTurnSpeed: 'Turn Speed', independent: 'Independent', altFire: 'Right Click Fire', syncsSkills: 'Syncs Skills',
  alwaysShoot: 'Always Shoot', healer: 'Healer', necro: 'Necro', gunStatScale: 'Stat Scale', shootResist: 'Bullet Weight', fightResist: 'Toughness Against Rounds',
  _bakeScale: '', _bakeSnap: '', _bakeShiftX: '', _bakeShiftY: '', comboFaceAngle: '',
  label: 'Name', sides: 'Sides', sizeRatio: 'Size', spinEnabled: 'Spin', spinSpeed: 'Spin Speed', spinDirection: 'Spin Direction',
  copies: 'Copies', initialAngle: 'Angle', starDepth: 'Star Depth', starCurved: 'Curved Star', intangible: 'Intangible',
  stationary: 'Stationary', renderOrder: 'Draw Order', turretIds: 'Turrets', maxAliveEnabled: 'Projectile Cap', maxAlive: 'Projectile Cap',
  useInheritColor: 'Color', teamColour: 'Team Color', showHealerCross: 'Healer Cross',
};

function fieldName(k: string): string {
  const n = FIELD_NAMES[k];
  if (n !== undefined) return n;
  const words = k.replace(/^_+/, '').replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(' ');
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function changedFields(a: any, b: any): string[] {
  const out: string[] = [];
  const keys = new Set<string>([...Object.keys(a || {}), ...Object.keys(b || {})]);
  keys.forEach(k => {
    if (JSON.stringify(a?.[k]) === JSON.stringify(b?.[k])) return;
    const n = fieldName(k);
    if (n !== '' && out.indexOf(n) < 0) out.push(n);
  });
  return out;
}

function changedLabel(names: string[]): string {
  if (names.length === 0) return 'Changed the tank';
  if (names.length === 1) return `Changed ${names[0]}`;
  if (names.length === 2) return `Changed ${names[0]} and ${names[1]}`;
  return `Changed ${names.length} settings`;
}

const TYPE_WORD: Record<string, string> = { auto: 'Auto Turret', decorative: 'Decorative', regular: 'Standard Turret' };

export function turretShownName(t: { name?: string; turretType?: string; look?: { name?: string } } | null | undefined, index: number): string {
  if (!t) return 'A turret';
  if (t.name) return t.name;
  if (t.look && t.look.name) return t.look.name;
  return `${TYPE_WORD[t.turretType ?? 'regular'] ?? 'Turret'} ${index + 1}`;
}

function plural(n: number, one: string, many: string): string { return n === 1 ? one : `${n} ${many}`; }

function describeStep(a: HistoryCapture, b: HistoryCapture, hint: HistoryHint | null): { label: string; detail: string; kind: HistoryKind } {
  let ta: any = {}, tb: any = {};
  try { ta = JSON.parse(a.tank); tb = JSON.parse(b.tank); } catch { }
  const loaded = ta.editorTankLabel !== tb.editorTankLabel || ta.currentTankFileName !== tb.currentTankFileName
    || ta.canvasIsProjectile !== tb.canvasIsProjectile || (hint !== null && hint.kind === 'load');
  if (loaded) {
    const nm = tb.editorTankLabel || tb.currentTankFileName || '';
    return { label: nm ? `Loaded ${nm}` : (tb.canvasIsProjectile ? 'Loaded a projectile' : 'Loaded a tank'), detail: hint?.detail ?? '', kind: 'load' };
  }
  if (hint) return { label: hint.label, detail: hint.detail ?? '', kind: hint.kind };

  const oldIds = new Set(a.turretIds), newIds = new Set(b.turretIds);
  let added = 0, removed = 0;
  for (let i = 0; i < b.turretIds.length; i++) if (!oldIds.has(b.turretIds[i])) added++;
  for (let i = 0; i < a.turretIds.length; i++) if (!newIds.has(a.turretIds[i])) removed++;
  if (added > 0 && removed === 0) return { label: added === 1 ? 'Placed a turret' : `Placed ${added} turrets`, detail: '', kind: 'add' };
  if (removed > 0 && added === 0) return { label: removed === 1 ? 'Deleted a turret' : `Deleted ${removed} turrets`, detail: '', kind: 'remove' };
  if (added > 0 && removed > 0) return { label: 'Changed turrets', detail: `${plural(added, 'one placed', 'placed')}, ${plural(removed, 'one deleted', 'deleted')}`, kind: 'edit' };

  const oldL = new Set(a.layerIds), newL = new Set(b.layerIds);
  let lAdd = 0, lRem = 0;
  for (let i = 0; i < b.layerIds.length; i++) if (!oldL.has(b.layerIds[i])) lAdd++;
  for (let i = 0; i < a.layerIds.length; i++) if (!newL.has(a.layerIds[i])) lRem++;
  if (lAdd > 0 && lRem === 0) return { label: lAdd === 1 ? 'Added a body layer' : `Added ${lAdd} body layers`, detail: '', kind: 'layer' };
  if (lRem > 0 && lAdd === 0) return { label: lRem === 1 ? 'Removed a body layer' : `Removed ${lRem} body layers`, detail: '', kind: 'layer' };

  const changedIdx: number[] = [];
  if (a.turrets.length === b.turrets.length) {
    for (let i = 0; i < b.turrets.length; i++) if (a.turrets[i] !== b.turrets[i]) changedIdx.push(i);
    if (changedIdx.length === 0 && a.turretIds.join() !== b.turretIds.join()) return { label: 'Reordered turrets', detail: '', kind: 'edit' };
  }
  const tankNames = changedFields(ta, tb);
  if (changedIdx.length > 0) {
    if (changedIdx.length === 1) {
      const i = changedIdx[0];
      let pa: any = null, pb: any = null;
      try { pa = JSON.parse(a.turrets[i]); pb = JSON.parse(b.turrets[i]); } catch { }
      const names = changedFields(pa, pb);
      const kind: HistoryKind = names.length === 1 && (names[0] === 'Name' || names[0] === 'Tag') ? 'name' : names.length === 1 && names[0] === 'Group' ? 'group' : 'edit';
      return { label: changedLabel(names), detail: turretShownName(pb, i), kind };
    }
    return { label: `Changed ${changedIdx.length} turrets`, detail: tankNames.length ? changedLabel(tankNames) : '', kind: 'edit' };
  }

  if (a.layers.length === b.layers.length) {
    for (let i = 0; i < b.layers.length; i++) {
      if (a.layers[i] === b.layers[i]) continue;
      let la: any = null, lb: any = null;
      try { la = JSON.parse(a.layers[i]); lb = JSON.parse(b.layers[i]); } catch { }
      return { label: changedLabel(changedFields(la, lb)), detail: (lb && lb.label) || 'Body layer', kind: 'layer' };
    }
  }

  if (tankNames.length > 0) {
    const grp = tankNames.length === 1 && tankNames[0] === 'Groups';
    return { label: grp ? 'Changed groups' : changedLabel(tankNames), detail: grp ? '' : 'Tank', kind: grp ? 'group' : 'body' };
  }

  let ga: any = null, gb: any = null;
  try { ga = JSON.parse(a.ghost); gb = JSON.parse(b.ghost); } catch { }
  const gNames = changedFields(ga?.m, gb?.m);
  const sNames = gNames.length ? gNames : changedFields(ga?.s, gb?.s);
  return { label: changedLabel(sNames), detail: 'Turret to place', kind: 'edit' };
}
