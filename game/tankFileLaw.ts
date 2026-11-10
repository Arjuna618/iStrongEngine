export const DRIVE_LAW_SINCE_MS = Date.UTC(2026, 9, 5, 12, 9, 25);

export const DRIVE_LAW_EARLIEST_MS = Date.UTC(2025, 0, 1);

export const DRIVE_LAW_MARK = 1;

const _REF_R = (24 + (9 - 1) / 9 * 24) / 2;
const _K = 155.3 * (2560 / (275 * Math.sqrt(_REF_R))) / (60 * 3);
export const DRIVE_LAW_SCALE = _K / (0.11 * 0.93 / (1 - 0.93));

function stampMs(t: unknown): number {
  if (typeof t === 'number') return t;
  if (typeof t === 'string') return Date.parse(t);
  return NaN;
}

export function tankFileOfOldDriveLaw(json: unknown): boolean {
  if (!json || typeof json !== 'object') return false;
  const f = json as { type?: unknown; source?: unknown; timestamp?: unknown; data?: unknown };
  if (f.type !== 'Tank' || f.source === 'arras-migration') return false;
  const d = f.data as { _driveLaw?: unknown } | undefined;
  if (!d || typeof d !== 'object' || d._driveLaw === DRIVE_LAW_MARK) return false;
  const ms = stampMs(f.timestamp);
  return Number.isFinite(ms) && ms >= DRIVE_LAW_EARLIEST_MS && ms < DRIVE_LAW_SINCE_MS;
}

export function convertOldDriveLaw(data: { tankMovementSpeed?: unknown; _driveLaw?: unknown }): void {
  if (typeof data.tankMovementSpeed === 'number' && Number.isFinite(data.tankMovementSpeed)) {
    data.tankMovementSpeed = data.tankMovementSpeed / DRIVE_LAW_SCALE;
  }
  data._driveLaw = DRIVE_LAW_MARK;
}
