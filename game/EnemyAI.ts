import { EnemyTank, FloatingPolygon, AIState, AI_CONSTANTS, UpgradeStat, TeamId, MovementPersonality, MapState, Bullet, campsClash } from '../types';
import { BASE_PROTECTOR_FEATURE } from './BaseProtector';
import { Vector } from '../utils/MathUtils';
import { seenBy, tankOwnShowing } from '../utils/seenRule';
import { DARK_HOOK } from './darkness';
import { growthFactor, growthRulesOf } from './growthRules';
import { ARRAS_PARITY, ARRAS_SKILL_POINTS_BAR, arrasEngineMult, bodyDriveMult, bodyPushShareOf } from './arrasCombat';
import { defenseOnBody, defenseShieldMult, defenseBrst, defenseAtkVsRounds } from './defenseSwitch';
import type { AreaBounds } from './MapSystem';
import {
  checkLineOfSight, isWalkable, isPathClear, bodyFitsAt,
  queryDistanceStep, queryDistanceStepSmooth, queryDeadEndMap,
  NAV_UNREACHABLE, NavigationState, selfFieldCells, sameNavComponent,
  _edgeRockClear, LOS_ROCK_BUFFER, exactFieldView, heldWallsReach,
} from './Navigation';
import { SMALL_FIX } from './smallFixSwitch';
import { shouldSkipTeamCollision } from './teamCollision';
import { HEALTH_BASIS } from './healthBasisSwitch';
import { btNoFear, btStandsStill } from './botTactics';
const ROAM_EXPLORE_CHANCE = 0.50;
const _BACKWARD_DOT = -0.5;
const _rayDist = new Float64Array(8);
const _rayDirX = new Float64Array(8);
const _rayDirY = new Float64Array(8);
const _rayEndCode = new Float64Array(8);

export interface RoamAvoid {
  code: Uint16Array;
  limit: number;
}

export const UPGRADE_ORDER: UpgradeStat[] = [
  'bodyDamage',
  'maxHealth',
  'bulletSpeed',
  'bulletPenetration',
  'bulletHealth',
  'bulletDamage',
  'reload',
  'movementSpeed',
  'shieldRegen',
  'shieldCapacity'
];

const UPGRADE_WEIGHTS: number[] = [0, 0, 2, 5, 5, 5, 5, 1, 0, 0];

export function calculateFOV(tankSize: number, fovMultiplier: number = 1.0): number {
  const baseVisible = AI_CONSTANTS.FOV_BASE_VISIBLE;
  const delta = tankSize - 1;
  const totalVisible = baseVisible + AI_CONSTANTS.FOV_GROWTH * delta;
  const GRID_SPACING = 50;
  return totalVisible * GRID_SPACING * fovMultiplier;
}

export function isInFOV(
  enemyPos: Vector,
  targetPos: Vector,
  fovRadius: number,
  isCurrentTarget: boolean
): boolean {
  const dist = Vector.dist(enemyPos, targetPos);
  const radius = isCurrentTarget ? fovRadius * AI_CONSTANTS.FOV_HYSTERESIS : fovRadius;
  return dist <= radius;
}

export function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

export function smoothRotateTowards(
  currentAngle: number,
  targetAngle: number,
  maxTurnSpeed: number,
  dtFactor: number
): number {
  let diff = normalizeAngle(targetAngle - currentAngle);
  const maxTurn = maxTurnSpeed * (dtFactor / 60);

  if (Math.abs(diff) < maxTurn) {
    return normalizeAngle(targetAngle);
  }

  return normalizeAngle(currentAngle + Math.sign(diff) * maxTurn);
}

export function smoothPositionEMAInto(out: Vector, current: Vector | null, target: Vector, alpha: number = 0.25): void {
  if (!current) {
    out.x = target.x;
    out.y = target.y;
  } else {
    out.x = current.x + (target.x - current.x) * alpha;
    out.y = current.y + (target.y - current.y) * alpha;
  }
}

export function aimSharpenAlpha(aimbotStrength: number): number {
  if (AI_CONSTANTS.AIM_SHARPEN === 0) return 0.25;
  const s = aimbotStrength > 100 ? 100 : (aimbotStrength > 0 ? aimbotStrength : 0);
  if (s === 0) return 0.25;
  return 0.25 + (AI_CONSTANTS.AIM_SHARPEN_MAX - 0.25) * (s / 100);
}

export function calculateSmoothedAimAngleInto(
  outSmoothed: Vector,
  turretBasePos: Vector,
  rawTargetPos: Vector,
  currentSmoothedPos: Vector | null,
  turretOffset: number = 0,
  alpha: number = 0.25,
): number {
  smoothPositionEMAInto(outSmoothed, currentSmoothedPos, rawTargetPos, alpha);
  const dx = outSmoothed.x - turretBasePos.x;
  const dy = outSmoothed.y - turretBasePos.y;
  return normalizeAngle(Math.atan2(dy, dx) - turretOffset);
}

export interface MountAimResult { angle: number; solvable: boolean; }

export function solveMountAimInto(
  out: MountAimResult,
  aimX: number, aimY: number,
  posX: number, posY: number,
  mountR: number,
  mountBearing: number,
  c: number,
): void {
  const dx = aimX - posX, dy = aimY - posY;
  const d = Math.sqrt(dx * dx + dy * dy);
  const delta = Math.atan2(dy, dx);
  if (!(mountR > 1e-6)) { out.angle = normalizeAngle(delta - c); out.solvable = true; return; }
  if (!(d > 1e-6)) { out.angle = normalizeAngle(delta - c); out.solvable = false; return; }
  const off = c - mountBearing;
  let q = (mountR / d) * Math.sin(off);
  let solvable = true;
  if (q > 1) { q = 1; solvable = false; } else if (q < -1) { q = -1; solvable = false; }
  out.angle = normalizeAngle(delta - c + Math.asin(q));
  out.solvable = solvable && (d * Math.sqrt(1 - q * q) - mountR * Math.cos(off)) > 0;
}

export function solveMountAimHullAngle(
  aimX: number, aimY: number,
  posX: number, posY: number,
  mountR: number,
  mountBearing: number,
  c: number,
): number {
  const out: MountAimResult = { angle: 0, solvable: true };
  solveMountAimInto(out, aimX, aimY, posX, posY, mountR, mountBearing, c);
  return out.angle;
}

export const TURRET_TRACKING = {
  SMOOTHING: 0.18,
  MAX_SPEED: 5.0,
  DEADZONE: 0.008,
  SNAP_THRESHOLD: 0.02,
};

export function springDampedTurretAimInto(
  out: { angle: number; angularVelocity: number },
  currentAngle: number,
  targetAngle: number,
  _angularVelocity: number,
  dtFactor: number
): void {
  const diff = normalizeAngle(targetAngle - currentAngle);
  const absDiff = Math.abs(diff);
  if (absDiff < TURRET_TRACKING.DEADZONE) {
    out.angle = currentAngle; out.angularVelocity = 0; return;
  }
  if (absDiff < TURRET_TRACKING.SNAP_THRESHOLD) {
    out.angle = normalizeAngle(targetAngle); out.angularVelocity = 0; return;
  }
  const alpha = 1 - Math.pow(1 - TURRET_TRACKING.SMOOTHING, dtFactor);
  const rawDelta = diff * alpha;
  const dt = dtFactor / 60;
  const maxDelta = TURRET_TRACKING.MAX_SPEED * dt;
  const clampedDelta = Math.max(-maxDelta, Math.min(maxDelta, rawDelta));
  out.angle = normalizeAngle(currentAngle + clampedDelta);
  out.angularVelocity = dt > 0 ? clampedDelta / dt : 0;
}

export const GLIDE_DAMP_OLD = 0.9798;
export const GLIDE_DAMP_ARRAS = Math.pow(1 / 1.05, 30 / 60);
export function glideDampPerFrame(): number { return ARRAS_PARITY.GLIDE_DECAY !== 0 ? GLIDE_DAMP_ARRAS : GLIDE_DAMP_OLD; }
const AIM_DECEL_STEPS = 4;
export const AIM_DECEL_PROBE = { ran: false, gain: 0 };

export function calculateInterceptPositionInto(
  out: Vector,
  shooterPos: Vector,
  targetPos: Vector,
  targetVel: Vector,
  bulletSpeed: number,
  aimbotStrength: number = 100,
  topSpeedRatio: number = 1,
  glideDamp: number = glideDampPerFrame()
): void {
  AIM_DECEL_PROBE.ran = false;
  const dx = targetPos.x - shooterPos.x;
  const dy = targetPos.y - shooterPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 50 || bulletSpeed <= 0 || aimbotStrength <= 0) {
    out.x = targetPos.x;
    out.y = targetPos.y;
    return;
  }

  const targetSpeedSq = targetVel.x * targetVel.x + targetVel.y * targetVel.y;
  if (targetSpeedSq < 0.0001) {
    out.x = targetPos.x;
    out.y = targetPos.y;
    return;
  }

  const bulletSpeedSq = bulletSpeed * bulletSpeed;
  const a = targetSpeedSq - bulletSpeedSq;
  const b = 2 * (dx * targetVel.x + dy * targetVel.y);
  const c = dx * dx + dy * dy;

  let interceptTime = dist / bulletSpeed;

  if (Math.abs(a) > 0.0001) {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const sqrtD = Math.sqrt(discriminant);
      const t1 = (-b + sqrtD) / (2 * a);
      const t2 = (-b - sqrtD) / (2 * a);
      if (t1 > 0 && t2 > 0) {
        interceptTime = Math.min(t1, t2);
      } else if (t1 > 0) {
        interceptTime = t1;
      } else if (t2 > 0) {
        interceptTime = t2;
      }
    }
  } else if (Math.abs(b) > 0.0001) {
    const t = -c / b;
    if (t > 0) interceptTime = t;
  }

  if (topSpeedRatio < 1) {
    const preFix = interceptTime;
    const sEq = bulletSpeed * topSpeedRatio;
    const sExcess = bulletSpeed - sEq;
    const _oneMinusK = 1 - glideDamp;
    const _kNoDecay = _oneMinusK <= 1e-9;
    let bailed = false;
    let lastStep = Infinity;
    for (let i = 0; i < AIM_DECEL_STEPS; i++) {
      const rx = dx + targetVel.x * interceptTime;
      const ry = dy + targetVel.y * interceptTime;
      const r = Math.sqrt(rx * rx + ry * ry);
      if (r < 1e-9) { bailed = true; break; }
      const e = Math.pow(glideDamp, interceptTime);
      const F = r - (sEq * interceptTime + (_kNoDecay ? sExcess * interceptTime : sExcess * (1 - e) / _oneMinusK));
      const dF = (rx * targetVel.x + ry * targetVel.y) / r - (sEq + sExcess * e);
      if (dF > -1e-6) { bailed = true; break; }
      const next = interceptTime - F / dF;
      if (!(next > 0) || !isFinite(next)) { bailed = true; break; }
      if (next > 720) { bailed = true; break; }
      lastStep = next > interceptTime ? next - interceptTime : interceptTime - next;
      interceptTime = next;
    }
    if (!bailed) {
      const rx = dx + targetVel.x * interceptTime;
      const ry = dy + targetVel.y * interceptTime;
      const r = Math.sqrt(rx * rx + ry * ry);
      const e = Math.pow(glideDamp, interceptTime);
      const F = r - (sEq * interceptTime + (_kNoDecay ? sExcess * interceptTime : sExcess * (1 - e) / _oneMinusK));
      const absF = F < 0 ? -F : F;
      if (!(absF <= r * 0.02) || !(lastStep <= interceptTime * 0.02)) bailed = true;
    }
    if (bailed) {
      interceptTime = preFix;
    } else if (interceptTime !== preFix && preFix > 1e-6) {
      AIM_DECEL_PROBE.ran = true;
      AIM_DECEL_PROBE.gain = Math.min(interceptTime, 180) / Math.min(preFix, 180) - 1;
    }
  }

  interceptTime = Math.min(interceptTime, 180);

  const perfectX = targetPos.x + targetVel.x * interceptTime;
  const perfectY = targetPos.y + targetVel.y * interceptTime;

  const strengthFactor = aimbotStrength / 100;
  out.x = targetPos.x + (perfectX - targetPos.x) * strengthFactor;
  out.y = targetPos.y + (perfectY - targetPos.y) * strengthFactor;
}

export function applySelfMotionAim(
  out: Vector,
  originX: number, originY: number,
  aimX: number, aimY: number,
  bulletSpeed: number,
  selfVelX: number, selfVelY: number,
): boolean {
  const wSq = selfVelX * selfVelX + selfVelY * selfVelY;
  if (wSq < 1e-8 || bulletSpeed <= 0) return false;
  const dx = aimX - originX;
  const dy = aimY - originY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-6) return false;
  const ex = dx / dist, ey = dy / dist;
  const eDotW = ex * selfVelX + ey * selfVelY;
  const disc = eDotW * eDotW + bulletSpeed * bulletSpeed - wSq;
  if (disc <= 0) return false;
  const c = eDotW + Math.sqrt(disc);
  const ux = (c * ex - selfVelX) / bulletSpeed;
  const uy = (c * ey - selfVelY) / bulletSpeed;
  const um = Math.sqrt(ux * ux + uy * uy);
  if (um < 1e-6) return false;
  out.x = originX + (ux / um) * dist;
  out.y = originY + (uy / um) * dist;
  return true;
}

export function calculateRoamTarget(
  mapLimit: number,
  areaBounds?: AreaBounds | null,
  mapState?: MapState | null,
  offX?: number,
  offY?: number,
  fromX?: number,
  fromY?: number,
  out?: Vector | null,
  travelDirX?: number,
  travelDirY?: number,
  bodyRadius: number = 0,
  avoid: RoamAvoid | null = null,
): Vector {
  const margin = 200;
  const ox = offX || 0;
  const oy = offY || 0;
  const mapLimitY = mapState ? mapLimit + (mapState.mapHalfY - mapState.mapHalf) : mapLimit;

  if (mapState && fromX !== undefined && fromY !== undefined) {
    const cs = mapState.cellSize;
    const step = cs * 0.5;
    const mh = mapState.mapHalf;
    const mhY = mapState.mapHalfY;
    const gc = mapState.gridCells;
    const gcY = mapState.gridCellsY;
    const wg = mapState.wallGrid;
    const rg = mapState.rockGrid;
    const tdx = travelDirX || 0;
    const tdy = travelDirY || 0;
    const hasTravelDir = tdx !== 0 || tdy !== 0;
    let rayCount = 0;
    const _av = avoid !== null && avoid.code.length === gc * gcY ? avoid : null;
    let _avOrigin = 0xFFFE;
    if (_av) {
      const _ogx = Math.floor((fromX - ox + mh) / cs);
      const _ogy = Math.floor((fromY - oy + mhY) / cs);
      if (_ogx >= 0 && _ogx < gc && _ogy >= 0 && _ogy < gcY) _avOrigin = _av.code[_ogx * gcY + _ogy];
    }
    const _avInside = _av !== null && _avOrigin < _av.limit;

    const baseAngle = Math.random() * Math.PI * 2;
    for (let pass = 0; pass < 2 && rayCount === 0; pass++) {
      const pr = pass === 0 ? bodyRadius : 0;
      if (pass === 1 && bodyRadius <= 0) break;
      for (let attempt = 0; attempt < 8; attempt++) {
        const angle = baseAngle + (attempt * 0.7853981633974483);
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        let maxDist = 0;
        let prevGX = Math.floor((fromX - ox + mh) / cs);
        let prevGY = Math.floor((fromY - oy + mhY) / cs);
        let _avEnd = _avOrigin;

        for (let d = step; d <= 500; d += step) {
          const cx = fromX + dx * d;
          const cy = fromY + dy * d;
          if (areaBounds) {
            if (cx < areaBounds.minX + margin || cx > areaBounds.maxX - margin ||
                cy < areaBounds.minY + margin || cy > areaBounds.maxY - margin) break;
          } else {
            if (Math.abs(cx) > mapLimit - margin || Math.abs(cy) > mapLimitY - margin) break;
          }
          if (!isWalkable(mapState, cx - ox, cy - oy, ox, oy, pr)) break;
          const curGX = Math.floor((cx - ox + mh) / cs);
          const curGY = Math.floor((cy - oy + mhY) / cs);
          if (curGX !== prevGX && curGY !== prevGY) {
            const adjA = prevGX * gcY + curGY;
            const adjB = curGX * gcY + prevGY;
            if ((adjA >= 0 && adjA < gc * gcY && (wg[adjA] >= 0 || rg[adjA] >= 0)) ||
                (adjB >= 0 && adjB < gc * gcY && (wg[adjB] >= 0 || rg[adjB] >= 0))) break;
          }
          if (_av) {
            const _c = (curGX >= 0 && curGX < gc && curGY >= 0 && curGY < gcY)
              ? _av.code[curGX * gcY + curGY] : 0xFFFE;
            if (_c !== 0xFFFF) {
              if (!_avInside && _c < _av.limit) break;
              _avEnd = _c;
            }
            if (!_avInside && curGX !== prevGX && curGY !== prevGY) {
              const _inA = prevGX >= 0 && prevGX < gc && curGY >= 0 && curGY < gcY;
              const _inB = curGX >= 0 && curGX < gc && prevGY >= 0 && prevGY < gcY;
              if ((_inA && _av.code[prevGX * gcY + curGY] < _av.limit) ||
                  (_inB && _av.code[curGX * gcY + prevGY] < _av.limit)) break;
            }
          }
          prevGX = curGX;
          prevGY = curGY;
          maxDist = d;
        }

        if (maxDist > 0) {
          _rayDist[rayCount] = maxDist;
          _rayDirX[rayCount] = dx;
          _rayDirY[rayCount] = dy;
          _rayEndCode[rayCount] = _avEnd;
          rayCount++;
        }
      }
    }

    if (rayCount > 0 && _avInside) {
      let _bi = -1;
      let _bc = _avOrigin;
      for (let i = 0; i < rayCount; i++) {
        const c = _rayEndCode[i];
        if (c > _bc || (c === _bc && _bi >= 0 && _rayDist[i] > _rayDist[_bi])) { _bc = c; _bi = i; }
      }
      if (_bi >= 0) {
        const rx = fromX + _rayDirX[_bi] * _rayDist[_bi];
        const ry = fromY + _rayDirY[_bi] * _rayDist[_bi];
        if (out) { out.x = rx; out.y = ry; return out; }
        return new Vector(rx, ry);
      }
    }

    if (rayCount > 0) {
      let chosenIdx = 0;
      const minQualDist = cs * 0.5;

      if (hasTravelDir) {
        let qualCount = 0;
        let bestDot = -2;
        let bestDotIdx = 0;
        for (let i = 0; i < rayCount; i++) {
          const dot = _rayDirX[i] * tdx + _rayDirY[i] * tdy;
          if (dot >= _BACKWARD_DOT && _rayDist[i] >= minQualDist) {
            qualCount++;
            if (dot > bestDot) { bestDot = dot; bestDotIdx = i; }
          }
        }

        if (qualCount > 0) {
          if (Math.random() < ROAM_EXPLORE_CHANCE) {
            let sampCount = 0;
            for (let i = 0; i < rayCount; i++) {
              const dot = _rayDirX[i] * tdx + _rayDirY[i] * tdy;
              if (dot >= _BACKWARD_DOT && _rayDist[i] >= minQualDist) {
                sampCount++;
                if (Math.random() < 1.0 / sampCount) chosenIdx = i;
              }
            }
          } else {
            chosenIdx = bestDotIdx;
          }
        } else {
          let bestDist = 0;
          for (let i = 0; i < rayCount; i++) {
            if (_rayDist[i] > bestDist) { bestDist = _rayDist[i]; chosenIdx = i; }
          }
        }
      } else {
        let bestDist = 0;
        for (let i = 0; i < rayCount; i++) {
          if (_rayDist[i] > bestDist) { bestDist = _rayDist[i]; chosenIdx = i; }
        }
      }

      const chosenDist = _rayDist[chosenIdx];
      const targetDist = chosenDist < 150 ? chosenDist : (0.4 + Math.random() * 0.6) * chosenDist;
      const rx = fromX + _rayDirX[chosenIdx] * targetDist;
      const ry = fromY + _rayDirY[chosenIdx] * targetDist;
      if (out) { out.x = rx; out.y = ry; return out; }
      return new Vector(rx, ry);
    }

    for (let ci = 0; ci < 4; ci++) {
      const cdx = ci === 0 ? cs : ci === 2 ? -cs : 0;
      const cdy = ci === 1 ? cs : ci === 3 ? -cs : 0;
      if (isWalkable(mapState, fromX + cdx - ox, fromY + cdy - oy, ox, oy)) {
        const rx = fromX + cdx;
        const ry = fromY + cdy;
        if (out) { out.x = rx; out.y = ry; return out; }
        return new Vector(rx, ry);
      }
    }

    for (let qi = 0; qi < 8; qi++) {
      const qa = qi * 0.7853981633974483;
      const qx = fromX + Math.cos(qa) * cs * 0.25;
      const qy = fromY + Math.sin(qa) * cs * 0.25;
      if (isWalkable(mapState, qx - ox, qy - oy, ox, oy)) {
        if (out) { out.x = qx; out.y = qy; return out; }
        return new Vector(qx, qy);
      }
    }
  }

  let lastX = 0, lastY = 0;
  for (let attempt = 0; attempt < 10; attempt++) {
    if (areaBounds) {
      lastX = areaBounds.minX + margin + Math.random() * (areaBounds.maxX - areaBounds.minX - margin * 2);
      lastY = areaBounds.minY + margin + Math.random() * (areaBounds.maxY - areaBounds.minY - margin * 2);
    } else {
      lastX = (Math.random() * 2 - 1) * (mapLimit - margin);
      lastY = (Math.random() * 2 - 1) * (mapLimitY - margin);
    }
    if (!mapState || isWalkable(mapState, lastX - ox, lastY - oy, ox, oy)) {
      if (out) { out.x = lastX; out.y = lastY; return out; }
      return new Vector(lastX, lastY);
    }
  }
  if (fromX !== undefined && fromY !== undefined) {
    if (out) { out.x = fromX; out.y = fromY; return out; }
    return new Vector(fromX, fromY);
  }
  if (out) { out.x = lastX; out.y = lastY; return out; }
  return new Vector(lastX, lastY);
}

export function calculateFleeDirectionInto(out: Vector, enemyPos: Vector, threatPos: Vector): void {
  out.x = enemyPos.x - threatPos.x;
  out.y = enemyPos.y - threatPos.y;
  const m = Math.sqrt(out.x * out.x + out.y * out.y);
  if (m > 0) { out.x /= m; out.y /= m; }
}

const _fearResult = { trigger: false, reason: null as 'level_gap' | 'damage_ratio' | 'burst_damage' | 'heat' | null };

function shouldTriggerFearInto(
  enemy: EnemyTank,
  playerLevel: number,
  playerMaxTurretDamage: number,
  enemyMaxTurretDamage: number,
  now: number = NaN,
): void {
  if (enemy.totalPlayerDamage <= 0) {
    _fearResult.trigger = false; _fearResult.reason = null; return;
  }
  if (playerLevel >= AI_CONSTANTS.FEAR_LEVEL_THRESHOLD &&
      enemy.level <= AI_CONSTANTS.FEAR_ENEMY_LEVEL_THRESHOLD) {
    _fearResult.trigger = true; _fearResult.reason = 'level_gap'; return;
  }
  if (enemyMaxTurretDamage > 0 && playerMaxTurretDamage >= enemyMaxTurretDamage * AI_CONSTANTS.FEAR_DAMAGE_RATIO) {
    _fearResult.trigger = true; _fearResult.reason = 'damage_ratio'; return;
  }
  let _burst = enemy.recentDamageIn3s;
  if (SMALL_FIX.CC037 !== 0 && now === now) {
    _burst = 0;
    const ts = enemy.damageTimestamps;
    for (let i = 0; i < ts.length; i++) if (now - ts[i].time <= AI_CONSTANTS.FEAR_DAMAGE_WINDOW) _burst += ts[i].amount;
  }
  if (_burst >= aiHealthMax(enemy, HEALTH_BASIS.FEAR) * AI_CONSTANTS.FEAR_HP_THRESHOLD) {
    _fearResult.trigger = true; _fearResult.reason = 'burst_damage'; return;
  }
  _fearResult.trigger = false; _fearResult.reason = null;
}

const _dmgStampFree: Array<{ time: number; amount: number }> = [];

export function updateDamageTracking(
  enemy: EnemyTank,
  damageAmount: number,
  currentTime: number
): void {
  const _stamp = _dmgStampFree.pop();
  if (_stamp !== undefined) { _stamp.time = currentTime; _stamp.amount = damageAmount; enemy.damageTimestamps.push(_stamp); }
  else enemy.damageTimestamps.push({ time: currentTime, amount: damageAmount });

  let writeIndex = 0;
  let totalDamage = 0;
  for (let i = 0; i < enemy.damageTimestamps.length; i++) {
    const d = enemy.damageTimestamps[i];
    if (currentTime - d.time <= AI_CONSTANTS.FEAR_DAMAGE_WINDOW) {
      enemy.damageTimestamps[writeIndex++] = d;
      totalDamage += d.amount;
    } else {
      _dmgStampFree.push(d);
    }
  }
  enemy.damageTimestamps.length = writeIndex;
  enemy.recentDamageIn3s = totalDamage;
}

function getWeightedUpgradeStat(enemy: EnemyTank): UpgradeStat | null {
  let totalWeight = 0;
  for (let i = 0; i < UPGRADE_ORDER.length; i++) {
    const stat = UPGRADE_ORDER[i];
    const cap = enemy.skillCaps ? enemy.skillCaps[stat] : enemy.maxPointsPerSkill;
    if (enemy.upgrades[stat] < cap) {
      totalWeight += UPGRADE_WEIGHTS[i];
    }
  }
  if (totalWeight === 0) return null;

  let roll = Math.random() * totalWeight;
  for (let i = 0; i < UPGRADE_ORDER.length; i++) {
    const stat = UPGRADE_ORDER[i];
    const cap = enemy.skillCaps ? enemy.skillCaps[stat] : enemy.maxPointsPerSkill;
    if (enemy.upgrades[stat] < cap) {
      if (roll < UPGRADE_WEIGHTS[i]) return stat;
      roll -= UPGRADE_WEIGHTS[i];
    }
  }
  return null;
}

function getRandomUpgradeStat(enemy: EnemyTank): UpgradeStat | null {
  const availableStats: UpgradeStat[] = [];
  for (const stat of UPGRADE_ORDER) {
    const cap = enemy.skillCaps ? enemy.skillCaps[stat] : enemy.maxPointsPerSkill;
    if (enemy.upgrades[stat] < cap) {
      availableStats.push(stat);
    }
  }

  if (availableStats.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * availableStats.length);
  return availableStats[randomIndex];
}

export function getNextUpgradeStat(enemy: EnemyTank): UpgradeStat | null {
  if (enemy.skillPoints <= 0) return null;

  for (let i = 0; i < UPGRADE_ORDER.length; i++) {
    const index = (enemy.nextUpgradeIndex + i) % UPGRADE_ORDER.length;
    const stat = UPGRADE_ORDER[index];
    const cap = enemy.skillCaps ? enemy.skillCaps[stat] : enemy.maxPointsPerSkill;
    if (enemy.upgrades[stat] < cap) {
      return stat;
    }
  }

  return null;
}

function getCustomUpgradeStat(enemy: EnemyTank): UpgradeStat | null {
  const priorities = enemy.customUpgradePriorities;
  if (!priorities) return null;

  let bestPriority = Infinity;
  for (let i = 0; i < UPGRADE_ORDER.length; i++) {
    const stat = UPGRADE_ORDER[i];
    const p = priorities[stat];
    if (p <= 0) continue;
    const cap = enemy.skillCaps ? enemy.skillCaps[stat] : enemy.maxPointsPerSkill;
    if (enemy.upgrades[stat] >= cap) continue;
    if (p < bestPriority) bestPriority = p;
  }

  if (bestPriority === Infinity) {
    if (enemy.customUpgradeFillRandom) {
      return getRandomUnlistedUpgradeStat(enemy, priorities);
    }
    return null;
  }

  const tierStats: UpgradeStat[] = [];
  for (let i = 0; i < UPGRADE_ORDER.length; i++) {
    const stat = UPGRADE_ORDER[i];
    if (priorities[stat] !== bestPriority) continue;
    const cap = enemy.skillCaps ? enemy.skillCaps[stat] : enemy.maxPointsPerSkill;
    if (enemy.upgrades[stat] >= cap) continue;
    tierStats.push(stat);
  }
  if (tierStats.length === 0) return null;
  return tierStats[Math.floor(Math.random() * tierStats.length)];
}

function getRandomUnlistedUpgradeStat(enemy: EnemyTank, priorities: Record<UpgradeStat, number>): UpgradeStat | null {
  const available: UpgradeStat[] = [];
  for (let i = 0; i < UPGRADE_ORDER.length; i++) {
    const stat = UPGRADE_ORDER[i];
    if (priorities[stat] > 0) continue;
    const cap = enemy.skillCaps ? enemy.skillCaps[stat] : enemy.maxPointsPerSkill;
    if (enemy.upgrades[stat] >= cap) continue;
    available.push(stat);
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

export function applyUpgrade(enemy: EnemyTank): boolean {
  if (enemy.skillPoints <= 0) return false;

  let stat: UpgradeStat | null;

  if (enemy.customUpgradePriorities !== undefined) {
    stat = getCustomUpgradeStat(enemy);
  } else if (enemy.upgradeLogic === 'Random') {
    stat = getRandomUpgradeStat(enemy);
  } else if (enemy.upgradeLogic === 'OffensiveWeighted') {
    stat = getWeightedUpgradeStat(enemy);
  } else {
    stat = getNextUpgradeStat(enemy);
  }

  if (!stat) return false;

  enemy.upgrades[stat]++;
  enemy.skillPoints--;

  enemy.nextUpgradeIndex = (UPGRADE_ORDER.indexOf(stat) + 1) % UPGRADE_ORDER.length;
  return true;
}

const _enemyCurveCache: number[] = [];
const _enemyCurveCachePast: number[] = [];
function enemySkillCurve(raw: number, max: number): number {
  if (raw <= 0) return 0;
  const key = raw * 100 + max;
  const past = ARRAS_PARITY.SKILL_PAST_CAP !== 0;
  const cache = past ? _enemyCurveCachePast : _enemyCurveCache;
  let cached = cache[key];
  if (cached === undefined) {
    cached = Math.log(4 * (past ? raw / ARRAS_SKILL_POINTS_BAR : raw / max) + 1) / 1.6;
    cache[key] = cached;
  }
  return cached;
}

export function getEnemyStatMultiplier(enemy: EnemyTank, stat: UpgradeStat): number {
  const gr = growthRulesOf(enemy);
  return gr === undefined ? _enemyStatMult(enemy, stat) : _enemyStatMult(enemy, stat) * growthFactor(gr, stat, enemy.level);
}
function _enemyStatMult(enemy: EnemyTank, stat: UpgradeStat): number {
  const statCap = enemy.skillCaps ? enemy.skillCaps[stat] : enemy.maxPointsPerSkill;
  const a = enemySkillCurve(enemy.upgrades[stat], statCap || 10);
  switch (stat) {
    case 'reload':           return Math.pow(2, a);
    case 'bulletDamage':     return 3.0 * a + 1;
    case 'bulletPenetration': return 2.5 * a + 1;
    case 'bulletHealth':     return 2.0 * a + 1;
    case 'bulletSpeed':      return 1.0 * a + 1;
    case 'bodyDamage':       return 0.021 * a + 1;
    case 'maxHealth':        { const hk = enemy.healthK; return (0.3 * a + 1) * (hk === undefined ? 1 : hk); }
    case 'movementSpeed':    return 0.8 * a + 1;
    case 'shieldCapacity':   return defenseOnBody(enemy.resistBase) ? defenseShieldMult(a) : 0.5 * a + 1;
    case 'shieldRegen':      return 25.0 * a + 1;
    default:                 return 1;
  }
}

export function getEnemyDerivedBrst(enemy: EnemyTank): number {
  const sc = enemy.skillCaps;
  const mp = enemy.maxPointsPerSkill;
  const aBd = enemySkillCurve(enemy.upgrades['bodyDamage'], (sc ? sc.bodyDamage : mp) || 10);
  const aHp = enemySkillCurve(enemy.upgrades['maxHealth'], (sc ? sc.maxHealth : mp) || 10);
  const aRgn = enemySkillCurve(enemy.upgrades['shieldRegen'], (sc ? sc.shieldRegen : mp) || 10);
  if (defenseOnBody(enemy.resistBase)) return defenseBrst(aBd, aHp, aRgn);
  return 0.3 * (0.5 * aBd + 0.5 * aHp + aRgn);
}

export function getEnemyDerivedBrstOfBefore(enemy: EnemyTank): number {
  const sc = enemy.skillCaps;
  const mp = enemy.maxPointsPerSkill;
  const aBd = enemySkillCurve(enemy.upgrades['bodyDamage'], (sc ? sc.bodyDamage : mp) || 10);
  const aHp = enemySkillCurve(enemy.upgrades['maxHealth'], (sc ? sc.maxHealth : mp) || 10);
  const aRgn = enemySkillCurve(enemy.upgrades['shieldRegen'], (sc ? sc.shieldRegen : mp) || 10);
  return 0.3 * (0.5 * aBd + 0.5 * aHp + aRgn);
}
export function enemyAtkVsRounds(enemy: EnemyTank): number {
  if (!defenseOnBody(enemy.resistBase)) return getEnemyStatMultiplier(enemy, 'bodyDamage');
  const sc = enemy.skillCaps;
  const k = defenseAtkVsRounds(enemySkillCurve(enemy.upgrades['bodyDamage'], (sc ? sc.bodyDamage : enemy.maxPointsPerSkill) || 10));
  const gr = growthRulesOf(enemy);
  return gr === undefined ? k : k * growthFactor(gr, 'bodyDamage', enemy.level);
}
export function enemyRegenCurve(enemy: EnemyTank): number {
  const sc = enemy.skillCaps;
  return enemySkillCurve(enemy.upgrades['shieldRegen'], (sc ? sc.shieldRegen : enemy.maxPointsPerSkill) || 10);
}

export function getEnemyDerivedRst(enemy: EnemyTank): number {
  const sc = enemy.skillCaps;
  const mp = enemy.maxPointsPerSkill;
  const aStr = enemySkillCurve(enemy.upgrades['bulletHealth'], (sc ? sc.bulletHealth : mp) || 10);
  const aPen = enemySkillCurve(enemy.upgrades['bulletPenetration'], (sc ? sc.bulletPenetration : mp) || 10);
  return 0.5 * aStr + 2.5 * aPen;
}

export function getEnemyMoveSpeed(enemy: EnemyTank): number {
  if (ARRAS_PARITY.BODY_DRIVE !== 0) return enemy.movementSpeed * enemyDriveMult(enemy) * enemy._mevSpeedK;
  return enemy.movementSpeed * getEnemyStatMultiplier(enemy, 'movementSpeed') * enemy._mevSpeedK;
}

export function enemyEngineMult(enemy: EnemyTank): number {
  if (!enemy.isSmasher) return 1;
  const statCap = enemy.skillCaps ? enemy.skillCaps.reload : enemy.maxPointsPerSkill;
  const e = arrasEngineMult(enemy.upgrades.reload, statCap || 10);
  const gr = growthRulesOf(enemy);
  return gr === undefined ? e : e * growthFactor(gr, 'reload', enemy.level);
}

export function enemyDriveMult(enemy: EnemyTank): number {
  return bodyDriveMult(bodyPushShareOf(enemy.pushShare), getEnemyStatMultiplier(enemy, 'movementSpeed'), enemyEngineMult(enemy));
}

export function getEnemyMaxHealth(enemy: EnemyTank): number {
  return enemy.maxHealth * getEnemyStatMultiplier(enemy, 'maxHealth');
}

export function aiHealthMax(enemy: EnemyTank, on: number): number {
  return on !== 0 ? enemy.maxHealth * getEnemyStatMultiplier(enemy, 'maxHealth') : enemy.maxHealth;
}

export function fearShotDamage(t: EnemyTank['turrets'][number], mult: number, autoSub: boolean): number {
  if (SMALL_FIX.GH187 && ((t.pushOnly === true && ARRAS_PARITY.PUSH_ONLY !== 0) || (autoSub && t.bps <= 0))) return 0;
  return (SMALL_FIX.GH186 ? Math.abs(t.bulletDamage) : t.bulletDamage) * mult;
}

export function getEnemyMaxTurretDamage(enemy: EnemyTank): number {
  const mult = getEnemyStatMultiplier(enemy, 'bulletDamage');
  let maxDamage = 0;
  const turrets = enemy.turrets;
  for (let i = 0; i < turrets.length; i++) {
    const t = turrets[i];
    if (t.turretType === 'decorative') continue;
    if (t.turretType === 'auto') {
      const subs = t.autoSubTurrets;
      if (subs) {
        for (let s = 0; s < subs.length; s++) {
          const sub = subs[s];
          if (sub.turretType === 'decorative') continue;
          const subDamage = fearShotDamage(sub, mult, true);
          if (subDamage > maxDamage) maxDamage = subDamage;
        }
      }
      continue;
    }
    const damage = fearShotDamage(t, mult, false);
    if (damage > maxDamage) maxDamage = damage;
  }
  return maxDamage;
}

export function findNearestShape(
  enemy: EnemyTank,
  shapes: FloatingPolygon[],
  rangeLimit?: number,
  nowMs: number = 0
): FloatingPolygon | null {
  let nearestCrasher: FloatingPolygon | null = null;
  let nearestCrasherDistSq = Infinity;
  let nearestFood: FloatingPolygon | null = null;
  let nearestFoodDistSq = Infinity;

  const maxDist = rangeLimit !== undefined
    ? rangeLimit
    : Math.min(enemy.fovRadius, AI_CONSTANTS.SHAPE_TARGET_MAX_DIST);
  const maxDistSq = maxDist * maxDist;

  const ex = enemy.position.x;
  const ey = enemy.position.y;
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    if (!shape.active || shape.fadingOut) continue;
    if (nowMs > 0 && !shape.isCrasher &&
        shape.id === enemy.unreachTargetId && nowMs < enemy.unreachUntil) continue;

    const dx = shape.position.x - ex;
    const dy = shape.position.y - ey;
    const distSq = dx * dx + dy * dy;
    if (distSq > maxDistSq) continue;

    if (shape.isCrasher) {
      if (distSq < nearestCrasherDistSq) {
        nearestCrasher = shape;
        nearestCrasherDistSq = distSq;
      }
    } else {
      if (distSq < nearestFoodDistSq) {
        nearestFood = shape;
        nearestFoodDistSq = distSq;
      }
    }
  }

  return nearestCrasher ?? nearestFood;
}

export function checkAndResetNeutralDamage(enemy: EnemyTank): void {
  if (enemy.aiBehavior !== 'Neutral') return;

  if (enemy.currentHealth >= aiHealthMax(enemy, HEALTH_BASIS.AGGRO)) {
    enemy.totalPlayerDamage = 0;
    enemy.isAggro = false;
    enemy.damageFromTanks.clear();
    enemy.aggroTowards.clear();
  }
}

export function checkAndResetFriendlyAggro(enemy: EnemyTank): void {
  if (enemy.aiBehavior !== 'Friendly') return;

  if (enemy.currentHealth >= aiHealthMax(enemy, HEALTH_BASIS.AGGRO)) {
    enemy.damageFromTanks.clear();
    enemy.aggroTowards.clear();
  }
}

export function shouldFriendlyAttack(friendly: EnemyTank, target: EnemyTank): boolean {
  if (friendly.aiBehavior !== 'Friendly') return false;

  if (target.aiBehavior === 'Enemy') return true;

  if (target.aiBehavior === 'Neutral') {
    if (friendly.aggroTowards.has(target.id)) return true;

    const damageFromThisNeutral = friendly.damageFromTanks.get(target.id) || 0;
    const threshold = aiHealthMax(friendly, HEALTH_BASIS.AGGRO) * AI_CONSTANTS.FRIENDLY_AGGRO_THRESHOLD;
    if (damageFromThisNeutral >= threshold) {
      friendly.aggroTowards.add(target.id);
      return true;
    }
  }

  return false;
}

export function shouldNeutralAttackTarget(neutral: EnemyTank, targetId: string): boolean {
  if (neutral.aiBehavior !== 'Neutral') return true;

  if (neutral.aggroTowards.has(targetId)) return true;

  if (targetId === 'player-main') {
    const threshold = aiHealthMax(neutral, HEALTH_BASIS.AGGRO) * AI_CONSTANTS.NEUTRAL_AGGRO_THRESHOLD;
    if (neutral.totalPlayerDamage >= threshold) {
      neutral.aggroTowards.add(targetId);
      return true;
    }
  } else {
    const damageFromTarget = neutral.damageFromTanks.get(targetId) || 0;
    const threshold = aiHealthMax(neutral, HEALTH_BASIS.AGGRO) * AI_CONSTANTS.NEUTRAL_AGGRO_THRESHOLD;
    if (damageFromTarget >= threshold) {
      neutral.aggroTowards.add(targetId);
      return true;
    }
  }

  return false;
}

let _lastBestSentry: EnemyTank | null = null;
let _lastBestSentryDistSq = Infinity;

export function getLastBestSentry(): EnemyTank | null { return _lastBestSentry; }

const _knownScan = {
  bestKnown: null as EnemyTank | null,
  known1: null as EnemyTank | null,
  known2: null as EnemyTank | null,
  bestKnownScoreSq: Infinity,
  known1ScoreSq: Infinity,
  known2ScoreSq: Infinity,
  bestKnownDistSq: 0,
  known1DistSq: 0,
  known2DistSq: 0,
  threatId: '',
  threatGap: 0,
  threatDx: 0,
  threatDy: 0,
  threatDistSq: Infinity,
  distressedMate: null as EnemyTank | null,
};
export function getKnownScan(): typeof _knownScan { return _knownScan; }
function _resetKnownScan(): void {
  _knownScan.bestKnown = null;
  _knownScan.known1 = null;
  _knownScan.known2 = null;
  _knownScan.bestKnownScoreSq = Infinity;
  _knownScan.known1ScoreSq = Infinity;
  _knownScan.known2ScoreSq = Infinity;
  _knownScan.bestKnownDistSq = 0;
  _knownScan.known1DistSq = 0;
  _knownScan.known2DistSq = 0;
  _knownScan.threatId = '';
  _knownScan.threatGap = 0;
  _knownScan.threatDx = 0;
  _knownScan.threatDy = 0;
  _knownScan.threatDistSq = Infinity;
  _knownScan.distressedMate = null;
}

export type MuzzleLosFn = ((enemy: EnemyTank, tx: number, ty: number, tr: number) => boolean) | null;

export type SafeGroundFn = ((attacker: EnemyTank, tx: number, ty: number, isCurrent: boolean) => boolean) | null;

export type AreaApartFn = ((attacker: EnemyTank, tx: number, ty: number) => boolean) | null;

export function findBestEnemyTankTarget(
  enemy: EnemyTank,
  allTanks: EnemyTank[],
  playerId: string,
  losMapState: MapState | null = null,
  losOffX: number = 0,
  losOffY: number = 0,
  nowMs: number = 0,
  losHysteresisMs: number = 0,
  myTier: number = -1,
  powerCeiling: number = 0,
  courage: number = 0.5,
  muzzleLos: MuzzleLosFn = null,
  engagedTankId: string = '',
  engagedPlayerVisible: boolean = false,
  safeGround: SafeGroundFn = null,
  apart: AreaApartFn = null,
): EnemyTank | null {
  let bestTarget: EnemyTank | null = null;
  let bestScoreSq = Infinity;
  let mateDistSq = Infinity;
  _lastBestSentry = null;
  _lastBestSentryDistSq = Infinity;
  _resetKnownScan();
  const isTeamBehavior = isTeamBehaviorOf(enemy);
  const _swMs = AI_CONSTANTS.SWITCH_SIGHT_MS;
  const _swOn = _swMs > 0 && nowMs > 0 && (engagedTankId !== '' || engagedPlayerVisible);
  const _swAtkId = nowMs - enemy.fearSourceAt < AI_CONSTANTS.PRIORITY_PROVOKED_MS ? enemy.fearSourceId : '';
  let _swHoldVisible = engagedPlayerVisible;
  let _swAllowed: EnemyTank | null = null;
  let _swAllowedScoreSq = Infinity;
  let _swNewcomer: EnemyTank | null = null;
  let _swNewcomerScoreSq = Infinity;
  let _swWatchedSeen = false;
  if (isGhostTank(enemy)) return null;
  for (let _ti = 0; _ti < allTanks.length; _ti++) {
    const target = allTanks[_ti];
    if (target.id === enemy.id || !target.active || target.isDying || target.isSpawning || target.graceActive || (isUnseeableTank(target) && target.id !== enemy._intTargetId)) continue;
    if (campsClash(enemy.camp, target.camp)) continue;

    const isCurrentTarget = enemy.currentTargetId === target.id;
    if (!isInFOV(enemy.position, target.position, enemy.fovRadius, isCurrentTarget)) continue;
    if (target.invisEnabled && tankHiddenAt(enemy.position.x, enemy.position.y, enemy.size * 0.5, target, isCurrentTarget)) continue;
    if (DARK_HOOK.botHides !== null && DARK_HOOK.botHides(enemy, target, isCurrentTarget)) continue;

    const isMate = isTankMate(enemy, target, isTeamBehavior);
    if (isMate) {
      if (!(enemy._btBits > 0 && btStandsStill(target)) && (target.fearHeat >= AI_CONSTANTS.ASSIST_DISTRESS_HEAT ||
           target.currentHealth < aiHealthMax(target, HEALTH_BASIS.DISTRESS) * AI_CONSTANTS.ASSIST_DISTRESS_HP_FRAC) &&
          !(apart !== null && apart(enemy, target.position.x, target.position.y))) {
        const _mdx = target.position.x - enemy.position.x;
        const _mdy = target.position.y - enemy.position.y;
        const _mSq = _mdx * _mdx + _mdy * _mdy;
        if (_mSq < mateDistSq) {
          mateDistSq = _mSq;
          _knownScan.distressedMate = target;
        }
      }
      continue;
    }

    const _tdx = target.position.x - enemy.position.x;
    const _tdy = target.position.y - enemy.position.y;
    const distSq = _tdx * _tdx + _tdy * _tdy;

    let gap = 0;
    if (myTier >= 0) {
      const tTier = target.isBossTier ? 3 : tierOfLevel(target.level, powerCeiling);
      gap = tTier - myTier;
      const _ownSide = gap > 0 && SMALL_FIX.CC053 !== 0 &&
        (shouldSkipTeamCollision(enemy.team, enemy.aiBehavior, enemy.groupId, target.team, target.aiBehavior, target.groupId) ||
         tapFamilyIdOf(target) === tapFamilyIdOf(enemy));
      if (gap > 0 && !_ownSide && (gap > _knownScan.threatGap ||
          (gap === _knownScan.threatGap && distSq < _knownScan.threatDistSq))) {
        _knownScan.threatId = target.id;
        _knownScan.threatGap = gap;
        _knownScan.threatDx = _tdx;
        _knownScan.threatDy = _tdy;
        _knownScan.threatDistSq = distSq;
      }
    }

    if (!mayAttackTank(enemy, target, isTeamBehavior)) continue;

    if (safeGround !== null && safeGround(enemy, target.position.x, target.position.y, isCurrentTarget)) continue;
    if (apart !== null && apart(enemy, target.position.x, target.position.y)) continue;
    if (!canEngageTarget(enemy, losMapState, target.position.x, target.position.y, losOffX, losOffY, target.id)) continue;

    if (tapFamilyIdOf(target) === tapFamilyIdOf(enemy)) continue;

    let scoreSq = distSq;
    if (enemy._zMind) {
      const m = Math.max(0.25, 1 - gap * AI_CONSTANTS.TIER_TARGET_PENALTY);
      scoreSq = distSq * m * m;
    } else if (gap > 0) {
      const m = 1 + gap * AI_CONSTANTS.TIER_TARGET_PENALTY * (1.5 - courage);
      scoreSq = distSq * m * m;
    }
    if (enemy._packTargetId !== '' && target.id === enemy._packTargetId) scoreSq *= PACK_TARGET_PULL;
    if (enemy._intTargetId !== '' && target.id === enemy._intTargetId) scoreSq *= PACK_TARGET_PULL;
    let canSee = true;
    let eyeClear = true;
    if (losMapState) {
      canSee = checkLineOfSight(
        losMapState,
        enemy.position.x - losOffX, enemy.position.y - losOffY,
        target.position.x - losOffX, target.position.y - losOffY,
        losOffX, losOffY
      );
      eyeClear = canSee;
      if (!canSee && muzzleLos && muzzleLos(enemy, target.position.x, target.position.y, target.size / 2)) {
        canSee = true;
      }
      if (canSee) {
        if (isCurrentTarget && nowMs > 0) enemy.lastSawTargetTime = nowMs;
      } else if (isCurrentTarget && losHysteresisMs > 0 &&
          nowMs - enemy.lastSawTargetTime <= losHysteresisMs) {
        canSee = true;
      }
    }
    if (!canSee) {
      if (!target.isSentryEnemy) {
        if (scoreSq < _knownScan.bestKnownScoreSq) {
          _knownScan.known2 = _knownScan.known1;
          _knownScan.known2ScoreSq = _knownScan.known1ScoreSq;
          _knownScan.known2DistSq = _knownScan.known1DistSq;
          _knownScan.known1 = _knownScan.bestKnown;
          _knownScan.known1ScoreSq = _knownScan.bestKnownScoreSq;
          _knownScan.known1DistSq = _knownScan.bestKnownDistSq;
          _knownScan.bestKnown = target;
          _knownScan.bestKnownScoreSq = scoreSq;
          _knownScan.bestKnownDistSq = distSq;
        } else if (scoreSq < _knownScan.known1ScoreSq) {
          _knownScan.known2 = _knownScan.known1;
          _knownScan.known2ScoreSq = _knownScan.known1ScoreSq;
          _knownScan.known2DistSq = _knownScan.known1DistSq;
          _knownScan.known1 = target;
          _knownScan.known1ScoreSq = scoreSq;
          _knownScan.known1DistSq = distSq;
        } else if (scoreSq < _knownScan.known2ScoreSq) {
          _knownScan.known2 = target;
          _knownScan.known2ScoreSq = scoreSq;
          _knownScan.known2DistSq = distSq;
        }
      }
      continue;
    }

    if (target.isSentryEnemy) {
      if (distSq < _lastBestSentryDistSq) {
        _lastBestSentryDistSq = distSq;
        _lastBestSentry = target;
      }
    } else {
      if (scoreSq < bestScoreSq) {
        bestScoreSq = scoreSq;
        bestTarget = target;
      }
      if (_swOn) {
        if (target.id === engagedTankId) {
          _swHoldVisible = true;
          if (scoreSq < _swAllowedScoreSq) { _swAllowedScoreSq = scoreSq; _swAllowed = target; }
        } else if (eyeClear) {
          if (target.id === enemy.switchCandidateId) _swWatchedSeen = true;
          if (scoreSq < _swNewcomerScoreSq) { _swNewcomerScoreSq = scoreSq; _swNewcomer = target; }
          if (target.id === _swAtkId || target.id === enemy._packTargetId || target.id === enemy._intTargetId ||
              (target.id === enemy.switchCandidateId && nowMs - enemy.switchCandidateSince >= _swMs)) {
            if (scoreSq < _swAllowedScoreSq) { _swAllowedScoreSq = scoreSq; _swAllowed = target; }
          }
        }
      }
    }
  }

  if (_swOn) {
    if (!_swWatchedSeen) {
      if (_swNewcomer !== null) {
        enemy.switchCandidateId = _swNewcomer.id;
        enemy.switchCandidateSince = nowMs;
      } else if (enemy.switchCandidateId !== '') {
        enemy.switchCandidateId = '';
        enemy.switchCandidateSince = 0;
      }
    }
    if (_swHoldVisible) return _swAllowed;
  }

  return bestTarget;
}

export interface AIStateResult {
  state: AIState;
  targetType: 'player' | 'enemy' | 'shape' | null;
  targetId: string | null;
  targetPosition: Vector | null;
  trapped: boolean;
  heldStrong: boolean;
  stood: boolean;
  rearmHeld: boolean;
  legacyHeld: boolean;
}

const _aiTargetPos = new Vector(0, 0);
const _aiStateResult: AIStateResult = { state: 'roaming', targetType: null, targetId: null, targetPosition: null, trapped: false, heldStrong: false, stood: false, rearmHeld: false, legacyHeld: false };

function _fillNoTarget(state: AIState): void {
  _aiStateResult.state = state;
  _aiStateResult.targetType = null;
  _aiStateResult.targetId = null;
  _aiStateResult.targetPosition = null;
  _aiStateResult.trapped = false;
  _aiStateResult.heldStrong = false;
  _aiStateResult.stood = false;
}

function _fillAttack(targetType: 'player' | 'enemy', targetId: string, pos: Vector): void {
  _aiStateResult.state = 'attacking';
  _aiStateResult.targetType = targetType;
  _aiStateResult.targetId = targetId;
  _aiTargetPos.x = pos.x;
  _aiTargetPos.y = pos.y;
  _aiStateResult.targetPosition = _aiTargetPos;
  _aiStateResult.trapped = false;
  _aiStateResult.heldStrong = false;
  _aiStateResult.stood = false;
}

let _corneredBestTank: EnemyTank | null = null;
let _corneredBestDistSq = Infinity;
let _corneredPlayerValid = false;
let _corneredPlayerDistSq = Infinity;
let _corneredTrapped = false;
let _corneredTrappedPlayer = false;
let _corneredHeldStrong = false;

function _fleeStandAllowed(myPower: number, myPriced: boolean,
                           tPower: number, tPriced: boolean): boolean {
  if (AI_CONSTANTS.FLEE_STAND_POWER === 0) return true;
  if (!myPriced || !tPriced) return true;
  if (myPower < 0 || tPower < 0) return true;
  return tPower <= myPower * AI_CONSTANTS.FLEE_STAND_POWER_MAX;
}

function _srcTowardExit(
  enemy: EnemyTank, sx: number, sy: number, exX: number, exY: number,
): boolean {
  const dx = sx - enemy.position.x;
  const dy = sy - enemy.position.y;
  const m = Math.sqrt(dx * dx + dy * dy);
  if (m < 0.001) return true;
  return (dx / m) * exX + (dy / m) * exY > 0;
}

function _findCorneredTargets(
  enemy: EnemyTank,
  allTanks: EnemyTank[],
  fleeSourceId: string | null,
  playerPos: Vector | null,
  playerId: string,
  losMapState: MapState | null,
  losOffX: number,
  losOffY: number,
  playerTeam: string = 'player',
  playerGroupId: number = 0,
  muzzleLos: MuzzleLosFn = null,
  playerPower: number = -1,
  safeGround: SafeGroundFn = null,
  playerSafeFromMe: boolean = false,
  apart: AreaApartFn = null,
): void {
  const _cr = enemy.fovRadius * AI_CONSTANTS.FEAR_CORNERED_RANGE_MULT;
  const rangeSq = _cr * _cr;
  _corneredBestTank = null;
  _corneredBestDistSq = Infinity;
  _corneredPlayerValid = false;
  _corneredPlayerDistSq = Infinity;
  _corneredHeldStrong = false;
  const _myPower = enemy.rolePower;
  const _myPriced = enemy.rolePowerCeilRef !== 0;
  const _crPrevId = (enemy.fleeRerouteFromId !== '' &&
    enemy.fear.fleeStartTime > 0 && enemy.fleeRerouteAt >= enemy.fear.fleeStartTime)
    ? enemy.fleeRerouteFromId : '';

  _corneredTrapped = false;
  _corneredTrappedPlayer = false;
  let _deTrapped = false, _deTrapX = 0, _deTrapY = 0;
  if (AI_CONSTANTS.FLEE_DEADEND_TRAPPED !== 0 && fleeSourceId && losMapState) {
    const _deT = queryDeadEndMap(losMapState.navigation,
      enemy.position.x - losOffX, enemy.position.y - losOffY);
    if (_deT.depth >= AI_CONSTANTS.DEAD_END_ESCAPE_DEPTH &&
        (_deT.exitDirX !== 0 || _deT.exitDirY !== 0)) {
      _deTrapped = true; _deTrapX = _deT.exitDirX; _deTrapY = _deT.exitDirY;
    }
  }

  for (let i = 0; i < allTanks.length; i++) {
    const t = allTanks[i];
    if (t.id === enemy.id || !t.active || t.isDying || t.isSpawning || t.graceActive || isUnseeableTank(t)) continue;
    if (t.invisEnabled && tankHiddenAt(enemy.position.x, enemy.position.y, enemy.size * 0.5, t,
        t.id === fleeSourceId || t.id === enemy.currentTargetId)) continue;
    if (DARK_HOOK.botHides !== null && DARK_HOOK.botHides(enemy, t, t.id === fleeSourceId || t.id === enemy.currentTargetId)) continue;
    if (campsClash(enemy.camp, t.camp)) continue;
    if (safeGround !== null && safeGround(enemy, t.position.x, t.position.y, false)) continue;
    if (apart !== null && apart(enemy, t.position.x, t.position.y)) continue;
    let _tIsTrappedSrc = false;
    if (t.id === fleeSourceId) {
      if (!(_deTrapped && _srcTowardExit(enemy, t.position.x, t.position.y, _deTrapX, _deTrapY))) continue;
      _tIsTrappedSrc = true;
    }
    if (_crPrevId !== '' && t.id === _crPrevId) continue;
    if (enemy.groupId !== 0 && t.groupId === enemy.groupId) continue;
    const dx = t.position.x - enemy.position.x;
    const dy = t.position.y - enemy.position.y;
    const dSq = dx * dx + dy * dy;
    if (dSq > rangeSq) continue;

    let shouldAttack = false;
    if (enemy.aiBehavior === 'FFA') {
      shouldAttack = true;
    } else if (enemy.aiBehavior === 'Team1' || enemy.aiBehavior === 'Team2' ||
               enemy.aiBehavior === 'Team3' || enemy.aiBehavior === 'Team4' || enemy.aiBehavior === 'Team5') {
      shouldAttack = t.team !== enemy.team;
    } else if (enemy.aiBehavior === 'Friendly') {
      shouldAttack = shouldFriendlyAttack(enemy, t);
    } else if (enemy.aiBehavior === 'Enemy') {
      shouldAttack = t.aiBehavior !== 'Enemy' || t.isSentryEnemy;
    } else if (enemy.aiBehavior === 'Neutral') {
      shouldAttack = shouldNeutralAttackTarget(enemy, t.id) || t.isSentryEnemy;
    }
    if (!shouldAttack) continue;

    if (losMapState) {
      if (!checkLineOfSight(losMapState,
            enemy.position.x - losOffX, enemy.position.y - losOffY,
            t.position.x - losOffX, t.position.y - losOffY,
            losOffX, losOffY)
          && !(muzzleLos && muzzleLos(enemy, t.position.x, t.position.y, t.size / 2))) continue;
    }

    if (!_tIsTrappedSrc &&
        !_fleeStandAllowed(_myPower, _myPriced, t.rolePower, t.rolePowerCeilRef !== 0)) {
      _corneredHeldStrong = true;
      continue;
    }

    if (dSq < _corneredBestDistSq) {
      _corneredBestDistSq = dSq;
      _corneredBestTank = t;
      _corneredTrapped = _tIsTrappedSrc;
    }
  }

  const _plSrcAdmit = playerPos !== null && (fleeSourceId !== playerId ||
    (_deTrapped && _srcTowardExit(enemy, playerPos.x, playerPos.y, _deTrapX, _deTrapY)));
  if (playerPos && _plSrcAdmit && _crPrevId !== playerId && !playerSafeFromMe &&
      !(enemy.groupId !== 0 && enemy.groupId === playerGroupId)) {
    const pdx = playerPos.x - enemy.position.x;
    const pdy = playerPos.y - enemy.position.y;
    const pdSq = pdx * pdx + pdy * pdy;
    if (pdSq <= rangeSq) {
      let shouldAttackPlayer = false;
      if (enemy.aiBehavior === 'Enemy' || enemy.aiBehavior === 'FFA') {
        shouldAttackPlayer = true;
      } else if (enemy.aiBehavior === 'Team1' || enemy.aiBehavior === 'Team2' ||
                 enemy.aiBehavior === 'Team3' || enemy.aiBehavior === 'Team4' || enemy.aiBehavior === 'Team5') {
        shouldAttackPlayer = enemy.team !== playerTeam;
      } else if (enemy.aiBehavior === 'Neutral') {
        shouldAttackPlayer = shouldNeutralAttackTarget(enemy, playerId);
      }
      if (shouldAttackPlayer) {
        const _plTrapped = fleeSourceId === playerId;
        if (!_plTrapped &&
            !_fleeStandAllowed(_myPower, _myPriced, playerPower, playerPower >= 0)) {
          _corneredHeldStrong = true;
        } else {
          _corneredPlayerValid = true;
          _corneredPlayerDistSq = pdSq;
          _corneredTrappedPlayer = _plTrapped;
        }
      }
    }
  }
}

export function chaseFutileVerdict(
  reachablePerSec: number, anchorGap: number, gapNow: number,
  stalledMs: number, stallBarMs: number, progressFrac: number,
): boolean {
  if (!(reachablePerSec > 0) || !isFinite(reachablePerSec)) return false;
  if (!isFinite(anchorGap) || !isFinite(gapNow)) return false;
  if (stalledMs < stallBarMs) return false;
  return (anchorGap - gapNow) < chaseFutileProgressBar(reachablePerSec, stallBarMs, progressFrac);
}

export function chaseFutileProgressBar(
  reachablePerSec: number, stallBarMs: number, progressFrac: number,
): number {
  return reachablePerSec * (stallBarMs / 1000) * progressFrac;
}

export function huntDecision(
  aggression: number, myTier: number, targetTier: number, hidden: boolean,
): boolean {
  if (myTier < 0 || targetTier < 0) return true;
  const gap = myTier - targetTier;
  let bar = (hidden ? AI_CONSTANTS.PRIORITY_ENGAGE_BAR_HIDDEN : AI_CONSTANTS.PRIORITY_ENGAGE_BAR_VISIBLE)
    - gap * AI_CONSTANTS.PRIORITY_ENGAGE_GAP_BONUS;
  if (targetTier < BOSS_TIER && bar > AI_CONSTANTS.PRIORITY_ENGAGE_BAR_MAX) {
    bar = AI_CONSTANTS.PRIORITY_ENGAGE_BAR_MAX;
  }
  return aggression >= bar;
}

export function detourPenalty(routeCells: number, cellSize: number, euclid: number): number {
  if (routeCells >= NAV_UNREACHABLE || euclid <= 0.001) return 1;
  const detour = (routeCells * cellSize) / euclid;
  const free = AI_CONSTANTS.PATH_DETOUR_FREE;
  if (detour <= free) return 1;
  const p = detour / free;
  return p > AI_CONSTANTS.PATH_DETOUR_CAP ? AI_CONSTANTS.PATH_DETOUR_CAP : p;
}

export function pathRescorePick(
  nav: NavigationState, ms: MapState, fld: Uint16Array,
  xs: Float64Array, ys: Float64Array, scoreSq: Float64Array, distSq: Float64Array,
  n: number, offX: number, offY: number,
): number {
  const cellSize = ms.cellSize;
  const leadCells = selfFieldCells(nav, ms, fld, xs[0] - offX, ys[0] - offY);
  if (leadCells >= NAV_UNREACHABLE) return -1;
  const leadScore = Math.sqrt(scoreSq[0]) * detourPenalty(leadCells, cellSize, Math.sqrt(distSq[0]));
  let best = 0;
  let bestScore = leadScore * AI_CONSTANTS.PATH_SWITCH_FRAC;
  for (let i = 1; i < n; i++) {
    const c = selfFieldCells(nav, ms, fld, xs[i] - offX, ys[i] - offY);
    if (c >= NAV_UNREACHABLE) continue;
    const s = Math.sqrt(scoreSq[i]) * detourPenalty(c, cellSize, Math.sqrt(distSq[i]));
    if (s < bestScore) { bestScore = s; best = i; }
  }
  return best === 0 ? -1 : best;
}

export function botCanReach(
  enemy: EnemyTank, ms: MapState | null,
  worldX: number, worldY: number, offX: number, offY: number,
): boolean {
  if (enemy.ignoresWalls) return true;
  const nav = ms?.navigation;
  if (!nav) return true;
  return sameNavComponent(nav,
    enemy.position.x - offX, enemy.position.y - offY,
    worldX - offX, worldY - offY);
}

export function canEngageTarget(
  enemy: EnemyTank, ms: MapState | null,
  worldX: number, worldY: number, offX: number, offY: number,
  targetId: string | null = null,
): boolean {
  if (enemy.ignoresWalls) return true;
  const nav = ms?.navigation;
  if (!nav) return true;
  const ax = enemy.position.x - offX, ay = enemy.position.y - offY;
  const bx = worldX - offX, by = worldY - offY;
  const bodyR = enemy.navBodyR ?? 0;

  if (sameNavComponent(nav, ax, ay, bx, by, bodyR)) {
    const verdict = targetId !== null ? _residentFieldVerdict(enemy, nav, ax, ay, bodyR, targetId, false, bx, by) : 0;
    if (verdict === -1) return _canShootThrough(enemy, ms!, nav, ax, ay, bx, by, offX, offY);
    return true;
  }

  if ((enemy.navBulletR ?? 0) <= 0) return false;
  if (targetId !== null) {
    const verdict = _residentFieldVerdict(enemy, nav, ax, ay, bodyR, targetId, true, bx, by);
    if (verdict === 1) return true;
    if (verdict === -1) return false;
    if (_canShootThrough(enemy, ms!, nav, ax, ay, bx, by, offX, offY)) return true;
    return true;
  }
  return _canShootThrough(enemy, ms!, nav, ax, ay, bx, by, offX, offY);
}

function _residentFieldVerdict(
  enemy: EnemyTank, nav: NavigationState,
  ax: number, ay: number, bodyR: number, targetId: string, sightedOnly: boolean,
  bx: number = NaN, by: number = NaN,
): number {
  if (bodyR <= 0) return 0;
  const fv = exactFieldView(nav, bodyR);
  if (!fv) return 0;
  const sizeClass = bodyR <= 34 ? 0 : bodyR <= 49 ? 1 : bodyR <= 64 ? 2
    : bodyR <= 79 ? 3 : bodyR <= 94 ? 4 : 5;
  const gc = fv.gridCells;
  const gcY = fv.gridCellsY;
  const gx = Math.floor((ax + fv.mapHalf) / fv.cellSize);
  const gy = Math.floor((ay + fv.mapHalfY) / fv.cellSize);
  if (gx < 0 || gx >= gc || gy < 0 || gy >= gcY) return 0;
  const slots = fv.auxFields;
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s.ownerId !== targetId || s.sizeClass !== sizeClass || s.srcCellX < 0) continue;
    if (sightedOnly && !s.sightSeeded) continue;
    if (SMALL_FIX.NH014 !== 0 && bx === bx && by === by) {
      const K = fv.isExactView ? fv.isExactView.K : 1;
      const tx = (Math.floor((bx + fv.mapHalf) / fv.cellSize) / K) | 0, ty = (Math.floor((by + fv.mapHalfY) / fv.cellSize) / K) | 0;
      if (Math.abs(s.srcCellX - tx) > 1 || Math.abs(s.srcCellY - ty) > 1) return 0;
    }
    const d0 = s.dist[gx * gcY + gy];
    if (d0 !== NAV_UNREACHABLE && d0 * fv.cellSize <= enemy.fovRadius * 1.5) return 1;
    return -1;
  }
  return 0;
}

function _canShootThrough(
  enemy: EnemyTank, ms: MapState, nav: NavigationState,
  ax: number, ay: number, bx: number, by: number, offX: number, offY: number,
): boolean {
  const bR = enemy.navBulletR ?? 0;
  if (bR <= 0) return false;
  if (!checkLineOfSight(ms, ax, ay, bx, by, offX, offY)) return false;
  if (bR > LOS_ROCK_BUFFER && !_edgeRockClear(nav, ms, ax, ay, bx, by, bR)) return false;
  return true;
}

export function isProvoked(enemy: EnemyTank, nowMs: number): boolean {
  return nowMs - enemy.lastTankDamageAt < AI_CONSTANTS.PRIORITY_PROVOKED_MS;
}

export function tapFamilyIdOf(e: EnemyTank): string {
  return e._tapRootId !== '' ? e._tapRootId : e.id;
}

let _ghostFamilyRoot = '';
export function setGhostFamilyRoot(id: string): void { _ghostFamilyRoot = id; }

export function tankHiddenAt(vx: number, vy: number, vr: number, t: EnemyTank, held: boolean): boolean {
  if (!t.invisEnabled || AI_CONSTANTS.SEEN_RULE === 0) return false;
  const dx = t.position.x - vx, dy = t.position.y - vy;
  return !seenBy(t.invisAlways ? 0 : tankOwnShowing(t.invisAlpha), dx * dx + dy * dy, vr + t.size * 0.5, held);
}

export function isUnseeableTank(e: EnemyTank): boolean {
  if (BASE_PROTECTOR_FEATURE !== 0 && e.isBaseProtector === true) return true;
  if (((e as { _mevF?: number })._mevF ?? 0) & (8 | 33554432)) return true;
  return isGhostTank(e);
}

export function isGhostTank(e: EnemyTank): boolean {
  if (AI_CONSTANTS.GHOST_BOT !== 0 && e.ghostMode === true) return true;
  return _ghostFamilyRoot !== '' && e._tapRootId === _ghostFamilyRoot;
}

export function bulletFamilyIdOf(b: Bullet): string {
  return b._tapRootId !== '' ? b._tapRootId : b.ownerId;
}

export function isTeamBehaviorOf(enemy: EnemyTank): boolean {
  const b = enemy.aiBehavior;
  return b === 'Team1' || b === 'Team2' || b === 'Team3' || b === 'Team4' || b === 'Team5';
}

export function isTankMate(enemy: EnemyTank, target: EnemyTank, isTeamBehavior: boolean): boolean {
  return (enemy.groupId !== 0 && target.groupId === enemy.groupId) ||
    (isTeamBehavior && target.team === enemy.team);
}

export function mayAttackTank(enemy: EnemyTank, target: EnemyTank, isTeamBehavior: boolean): boolean {
  if (campsClash(enemy.camp, target.camp)) return false;
  if (enemy.aiBehavior === 'FFA') {
    return true;
  } else if (isTeamBehavior) {
    return true;
  } else if (enemy.aiBehavior === 'Friendly') {
    return shouldFriendlyAttack(enemy, target);
  } else if (enemy.aiBehavior === 'Enemy') {
    return target.aiBehavior !== 'Enemy' || target.isSentryEnemy;
  } else if (enemy.aiBehavior === 'Neutral') {
    return shouldNeutralAttackTarget(enemy, target.id) || target.isSentryEnemy;
  }
  return false;
}

export function mayAttackPlayer(
  enemy: EnemyTank, playerId: string, playerTeam: string, playerGroupId: number
): boolean {
  if (enemy.groupId !== 0 && enemy.groupId === playerGroupId) return false;
  if (enemy.aiBehavior === 'Enemy' || enemy.aiBehavior === 'FFA') return true;
  if (isTeamBehaviorOf(enemy)) return enemy.team !== playerTeam;
  if (enemy.aiBehavior === 'Neutral') return shouldNeutralAttackTarget(enemy, playerId);
  return false;
}

export function determineAIStateInto(
  enemy: EnemyTank,
  playerPos: Vector | null,
  playerId: string,
  playerLevel: number,
  playerMaxTurretDamage: number,
  hasShapesInFOV: boolean,
  allTanks: EnemyTank[],
  gameNow: number,
  losMapState: MapState | null = null,
  losOffX: number = 0,
  losOffY: number = 0,
  playerTeam: string = 'player',
  playerGroupId: number = 0,
  losHysteresisMs: number = 0,
  myTier: number = -1,
  powerCeiling: number = 0,
  courage: number = 0.5,
  muzzleLos: MuzzleLosFn = null,
  playerPower: number = -1,
  safeGround: SafeGroundFn = null,
  playerSafeFromMe: boolean = false,
  apart: AreaApartFn = null,
): AIStateResult {
  if (SMALL_FIX.CC027 !== 0) _resetKnownScan();
  const isPlayerCurrentTarget = enemy.currentTargetType === 'player';
  _aiStateResult.rearmHeld = false;
  _aiStateResult.legacyHeld = false;
  if ((BASE_PROTECTOR_FEATURE !== 0 && enemy.isBaseProtector === true) || (enemy._mevF & 2) !== 0) {
    const bpTarget = findBestEnemyTankTarget(
      enemy, allTanks, playerId, losMapState, losOffX, losOffY, gameNow,
      losHysteresisMs, myTier, powerCeiling, courage, muzzleLos, '', false, null, apart);

    let bpBestId: string | null = null;
    let bpBestPos: Vector | null = null;
    let bpBestType: 'player' | 'enemy' | null = null;
    let bpBestD2 = Infinity;
    if (bpTarget && bpTarget.position) {
      const _bx = bpTarget.position.x - enemy.position.x;
      const _by = bpTarget.position.y - enemy.position.y;
      bpBestD2 = _bx * _bx + _by * _by;
      bpBestId = bpTarget.id; bpBestPos = bpTarget.position; bpBestType = 'enemy';
    }
    if (playerPos && isInFOV(enemy.position, playerPos, enemy.fovRadius, true) &&
        mayAttackPlayer(enemy, playerId, playerTeam, playerGroupId) && !playerSafeFromMe) {
      const _px = playerPos.x - enemy.position.x;
      const _py = playerPos.y - enemy.position.y;
      const _pd2 = _px * _px + _py * _py;
      if (_pd2 < bpBestD2) {
        bpBestD2 = _pd2;
        bpBestId = playerId; bpBestPos = playerPos; bpBestType = 'player';
      }
    }

    if (bpBestPos && bpBestType) {
      _aiStateResult.state = 'protecting_base';
      _aiStateResult.targetType = bpBestType;
      _aiStateResult.targetId = bpBestId;
      _aiStateResult.targetPosition = bpBestPos;
      _aiStateResult.trapped = false;
      _aiStateResult.heldStrong = false;
      _aiStateResult.stood = false;
    } else {
      _fillNoTarget('protecting_base');
    }
    return _aiStateResult;
  }

  const playerInFOV = playerPos ? isInFOV(enemy.position, playerPos, enemy.fovRadius, isPlayerCurrentTarget) : false;
  const isPlayerTeammate = enemy.groupId !== 0 && enemy.groupId === playerGroupId;
  let _frRefusedPlayer = false;

  if (enemy.fear.isFleeing) {
    if (enemy.fear.fearReason === 'heat') {
      if (enemy.fearHeat >= AI_CONSTANTS.FEAR_HEAT_FLEE_THRESHOLD * 0.5) {
        _findCorneredTargets(enemy, allTanks, enemy.fear.fleeSourceId, playerPos, playerId, losMapState, losOffX, losOffY, playerTeam, playerGroupId, muzzleLos, playerPower, safeGround, playerSafeFromMe, apart);
        if (_corneredBestTank || _corneredPlayerValid) {
          const tankCloser = _corneredBestTank && (!_corneredPlayerValid || _corneredBestDistSq <= _corneredPlayerDistSq);
          enemy.fear.isFleeing = false;
          enemy.fear.fleeTarget = null;
          enemy.fear.fearReason = null;
          enemy.fear.fleeSourceId = null;
          enemy.fearFleeCooldownUntil = gameNow + 2000;
          if (tankCloser) {
            _fillAttack('enemy', _corneredBestTank!.id, _corneredBestTank!.position);
            _aiStateResult.trapped = _corneredTrapped;
            _aiStateResult.heldStrong = _corneredHeldStrong;
            _aiStateResult.stood = true;
          } else {
            _fillAttack('player', playerId, playerPos!);
            _aiStateResult.trapped = _corneredTrappedPlayer;
            _aiStateResult.heldStrong = _corneredHeldStrong;
            _aiStateResult.stood = true;
          }
          return _aiStateResult;
        }
        _fillNoTarget('fleeing');
        _aiStateResult.heldStrong = _corneredHeldStrong;
        return _aiStateResult;
      } else {
        enemy.fear.isFleeing = false;
        enemy.fear.fleeTarget = null;
        enemy.fear.fearReason = null;
        enemy.fear.fleeSourceId = null;
      }
    } else if (enemy.fear.fearReason === 'hunted') {
      _findCorneredTargets(enemy, allTanks, enemy.fear.fleeSourceId, playerPos, playerId, losMapState, losOffX, losOffY, playerTeam, playerGroupId, muzzleLos, playerPower, safeGround, playerSafeFromMe, apart);
      if (_corneredBestTank || _corneredPlayerValid) {
        const tankCloser = _corneredBestTank && (!_corneredPlayerValid || _corneredBestDistSq <= _corneredPlayerDistSq);
        enemy.fear.isFleeing = false;
        enemy.fear.fleeTarget = null;
        enemy.fear.fearReason = null;
        enemy.fear.fleeSourceId = null;
        enemy.fearFleeCooldownUntil = gameNow + 2000;
        if (tankCloser) {
          _fillAttack('enemy', _corneredBestTank!.id, _corneredBestTank!.position);
          _aiStateResult.trapped = _corneredTrapped;
          _aiStateResult.heldStrong = _corneredHeldStrong;
          _aiStateResult.stood = true;
        } else {
          _fillAttack('player', playerId, playerPos!);
          _aiStateResult.trapped = _corneredTrappedPlayer;
          _aiStateResult.heldStrong = _corneredHeldStrong;
          _aiStateResult.stood = true;
        }
        return _aiStateResult;
      }
      _fillNoTarget('fleeing');
      _aiStateResult.heldStrong = _corneredHeldStrong;
      return _aiStateResult;
    } else {
      const _lgCommit = AI_CONSTANTS.FLEE_LEGACY_COMMIT !== 0;
      const _lgSeen = !!playerPos && playerInFOV;
      if (_lgSeen) enemy.fleeLegacySeenMs = gameNow;
      const _lgHold = _lgSeen || (_lgCommit &&
        gameNow - enemy.fleeLegacySeenMs < AI_CONSTANTS.FLEE_LEGACY_LINGER_MS);
      if (_lgHold) {
        _findCorneredTargets(enemy, allTanks, enemy.fear.fleeSourceId, playerPos, playerId, losMapState, losOffX, losOffY, playerTeam, playerGroupId, muzzleLos, playerPower, safeGround, playerSafeFromMe, apart);
        if (_corneredBestTank || _corneredPlayerValid) {
          const tankCloser = _corneredBestTank && (!_corneredPlayerValid || _corneredBestDistSq <= _corneredPlayerDistSq);
          enemy.fear.isFleeing = false;
          enemy.fear.fleeTarget = null;
          enemy.fear.fearReason = null;
          enemy.fear.fleeSourceId = null;
          enemy.fearFleeCooldownUntil = gameNow + 2000;
          if (tankCloser) {
            _fillAttack('enemy', _corneredBestTank!.id, _corneredBestTank!.position);
            _aiStateResult.trapped = _corneredTrapped;
            _aiStateResult.heldStrong = _corneredHeldStrong;
            _aiStateResult.stood = true;
          } else {
            _fillAttack('player', playerId, playerPos!);
            _aiStateResult.trapped = _corneredTrappedPlayer;
            _aiStateResult.heldStrong = _corneredHeldStrong;
            _aiStateResult.stood = true;
          }
          return _aiStateResult;
        }
        _fillNoTarget('fleeing');
        _aiStateResult.heldStrong = _corneredHeldStrong;
        if (!_lgSeen) _aiStateResult.legacyHeld = true;
        return _aiStateResult;
      } else if (_lgCommit) {
        enemy.fear.isFleeing = false;
        enemy.fear.fleeTarget = null;
        enemy.fear.fearReason = null;
        enemy.fear.fleeSourceId = null;
        if (gameNow + 2000 > enemy.fearFleeCooldownUntil) {
          enemy.fearFleeCooldownUntil = gameNow + 2000;
        }
      } else if (playerPos) {
        enemy.fear.isFleeing = false;
        enemy.fear.fleeTarget = null;
        enemy.fear.fearReason = null;
        enemy.fear.fleeSourceId = null;
      }
    }
  }

  if (playerInFOV && !isPlayerTeammate && (enemy.aiBehavior === 'Enemy' || enemy.aiBehavior === 'FFA' ||
      enemy.aiBehavior === 'Team1' || enemy.aiBehavior === 'Team2' ||
      enemy.aiBehavior === 'Team3' || enemy.aiBehavior === 'Team4' || enemy.aiBehavior === 'Team5')) {
    shouldTriggerFearInto(
      enemy, playerLevel, playerMaxTurretDamage, getEnemyMaxTurretDamage(enemy), gameNow
    );
    const _frCd = AI_CONSTANTS.FEAR_REARM_COOLDOWN !== 0 && gameNow < enemy.fearFleeCooldownUntil;
    if (_fearResult.trigger && _frCd) {
      _aiStateResult.rearmHeld = true;
      _frRefusedPlayer = true;
    } else if (_fearResult.trigger && !(enemy.chargeAI === true && AI_CONSTANTS.CHARGE_AI !== 0) && !btNoFear(enemy)) {
      enemy.fear.isFleeing = true;
      enemy.fear.fleeTarget = playerPos!.copy();
      enemy.fear.fleeStartTime = gameNow;
      enemy.fear.fearReason = _fearResult.reason;
      enemy.fear.fleeSourceId = playerId;
      enemy.fleeLegacySeenMs = gameNow;
      _fillNoTarget('fleeing');
      return _aiStateResult;
    }
  }

  let shouldAttackPlayer = false;
  if (playerInFOV && playerPos && !isPlayerTeammate && !_frRefusedPlayer) {
    if (enemy.aiBehavior === 'Enemy') {
      shouldAttackPlayer = true;
    } else if (enemy.aiBehavior === 'FFA') {
      shouldAttackPlayer = true;
    } else if (enemy.aiBehavior === 'Team1' || enemy.aiBehavior === 'Team2' ||
               enemy.aiBehavior === 'Team3' || enemy.aiBehavior === 'Team4' || enemy.aiBehavior === 'Team5') {
      shouldAttackPlayer = enemy.team !== playerTeam;
    } else if (enemy.aiBehavior === 'Neutral') {
      shouldAttackPlayer = shouldNeutralAttackTarget(enemy, playerId);
    }
  }

  if (shouldAttackPlayer && playerPos &&
      !canEngageTarget(enemy, losMapState, playerPos.x, playerPos.y, losOffX, losOffY, playerId)) {
    shouldAttackPlayer = false;
  }
  if (shouldAttackPlayer && playerSafeFromMe) shouldAttackPlayer = false;

  const _swEngaged = enemy.aiState === 'attacking' || enemy.aiState === 'following';
  const _swTankId = _swEngaged && enemy.currentTargetType === 'enemy' && enemy.currentTargetId
    ? enemy.currentTargetId : '';
  const _swPlayerHeld = _swEngaged && enemy.currentTargetType === 'player' && shouldAttackPlayer;
  let tankTarget = findBestEnemyTankTarget(enemy, allTanks, playerId, losMapState, losOffX, losOffY, gameNow, losHysteresisMs, myTier, powerCeiling, courage, muzzleLos, _swTankId, _swPlayerHeld, safeGround, apart);

  const _ffGateBehavior = enemy.aiBehavior === 'Enemy' || enemy.aiBehavior === 'FFA' ||
    enemy.aiBehavior === 'Team1' || enemy.aiBehavior === 'Team2' ||
    enemy.aiBehavior === 'Team3' || enemy.aiBehavior === 'Team4' || enemy.aiBehavior === 'Team5';
  if (hasShapesInFOV && _ffGateBehavior && !isProvoked(enemy, gameNow)) {
    const _ffEngaged = enemy.aiState === 'attacking' || enemy.aiState === 'following';
    if (shouldAttackPlayer &&
        !(_ffEngaged && enemy.currentTargetType === 'player')) {
      const _ffPTier = powerCeiling > 0 ? tierOfLevel(playerLevel, powerCeiling) : -1;
      if (!huntDecision(enemy.dnaAggression, myTier, _ffPTier, false)) {
        shouldAttackPlayer = false;
      }
    }
    if (tankTarget &&
        !(_ffEngaged && enemy.currentTargetId === tankTarget.id)) {
      const _ffTTier = tankTarget.isBossTier ? 3 :
        (powerCeiling > 0 ? tierOfLevel(tankTarget.level, powerCeiling) : -1);
      if (!huntDecision(enemy.dnaAggression, myTier, _ffTTier, false)) {
        tankTarget = null;
      }
    }
  }

  if (shouldAttackPlayer && tankTarget) {
    const playerDist = Vector.dist(enemy.position, playerPos!);
    const tankDist = Vector.dist(enemy.position, tankTarget.position);
    const _packTank = enemy._packTargetId !== '' && tankTarget.id === enemy._packTargetId;
    if (enemy._packTargetPlayer || (!_packTank && playerDist <= tankDist)) {
      _fillAttack('player', playerId, playerPos!);
    } else {
      _fillAttack('enemy', tankTarget.id, tankTarget.position);
    }
    return _aiStateResult;
  } else if (shouldAttackPlayer && playerPos) {
    _fillAttack('player', playerId, playerPos);
    return _aiStateResult;
  } else if (tankTarget) {
    _fillAttack('enemy', tankTarget.id, tankTarget.position);
    return _aiStateResult;
  }

  const sentryTarget = getLastBestSentry();
  if (sentryTarget) {
    _fillAttack('enemy', sentryTarget.id, sentryTarget.position);
    return _aiStateResult;
  }

  if (hasShapesInFOV) {
    _fillNoTarget('targeting_shapes');
    return _aiStateResult;
  }

  _fillNoTarget('roaming');
  return _aiStateResult;
}

export function getRandomOrbitDistance(): number {
  const range = AI_CONSTANTS.PREFERRED_DISTANCE_MAX - AI_CONSTANTS.PREFERRED_DISTANCE_MIN;
  return AI_CONSTANTS.PREFERRED_DISTANCE_MIN + Math.random() * range;
}

export function getRandomOrbitDirection(): 1 | -1 {
  return Math.random() > 0.5 ? 1 : -1;
}

const SLOT_COUNT = AI_CONSTANTS.STEERING_SLOTS;
const SLOT_ANGLE = (Math.PI * 2) / SLOT_COUNT;

const SLOT_DIRECTIONS: Vector[] = [];
for (let i = 0; i < SLOT_COUNT; i++) {
  const angle = i * SLOT_ANGLE;
  SLOT_DIRECTIONS.push(new Vector(Math.cos(angle), Math.sin(angle)));
}

const dangerMap: number[] = new Array(SLOT_COUNT).fill(0);
const interestMap: number[] = new Array(SLOT_COUNT).fill(0);

const _resultVec = new Vector(0, 0);

function resetSteeringMaps(): void {
  for (let i = 0; i < SLOT_COUNT; i++) {
    dangerMap[i] = 0;
    interestMap[i] = 0;
  }
}

function getSlotForAngle(angle: number): number {
  let normalized = angle;
  while (normalized < 0) normalized += Math.PI * 2;
  while (normalized >= Math.PI * 2) normalized -= Math.PI * 2;
  return Math.floor(normalized / SLOT_ANGLE) % SLOT_COUNT;
}

function addDangerFromObstacle(
  enemyPos: Vector,
  obstaclePos: Vector,
  obstacleRadius: number,
  avoidanceRadius: number,
  strength: number
): void {
  const dx = obstaclePos.x - enemyPos.x;
  const dy = obstaclePos.y - enemyPos.y;
  const distSq = dx * dx + dy * dy;
  const dist = Math.sqrt(distSq);

  if (dist > avoidanceRadius + obstacleRadius) return;

  const effectiveDist = Math.max(0, dist - obstacleRadius);
  const normalizedDist = effectiveDist / avoidanceRadius;
  const intensity = strength * Math.pow(1 - Math.min(normalizedDist, 1), AI_CONSTANTS.AVOIDANCE_FALLOFF);

  if (intensity < 0.01) return;

  const angleToObstacle = Math.atan2(dy, dx);
  const primarySlot = getSlotForAngle(angleToObstacle);

  const spreadFactor = Math.min(1, (avoidanceRadius - effectiveDist) / avoidanceRadius);
  const slotsToAffect = Math.ceil(1 + spreadFactor * 2);

  for (let offset = -slotsToAffect; offset <= slotsToAffect; offset++) {
    const slotIdx = (primarySlot + offset + SLOT_COUNT) % SLOT_COUNT;
    const falloff = 1 - Math.abs(offset) / (slotsToAffect + 1);
    dangerMap[slotIdx] = Math.min(1, dangerMap[slotIdx] + intensity * falloff);
  }
}

export function calculateShapeDanger(
  enemy: EnemyTank,
  nearbyShapes: FloatingPolygon[],
  avoidanceRadius: number
): void {
  const strength = AI_CONSTANTS.AVOIDANCE_STRENGTH;

  for (let i = 0; i < nearbyShapes.length; i++) {
    const shape = nearbyShapes[i];
    if (!shape.active || shape.fadingOut) continue;

    const shapeRadius = (shape.size * shape.growth) / 2;

    addDangerFromObstacle(
      enemy.position,
      shape.position,
      shapeRadius,
      avoidanceRadius + enemy.size / 2,
      strength
    );
  }
}

export function calculateTankBodyDanger(
  enemy: EnemyTank,
  allTanks: EnemyTank[],
  playerPos: Vector,
  playerSize: number,
  isPlayerGhost: boolean,
  avoidanceRadius: number,
  playerGroupId: number = 0
): void {
  const strength = AI_CONSTANTS.AVOIDANCE_STRENGTH * 1.2;
  if (!isPlayerGhost && !(enemy.groupId !== 0 && enemy.groupId === playerGroupId)) {
    const shouldAvoidPlayer = shouldAvoidTankBody(enemy.aiBehavior, 'player');
    if (shouldAvoidPlayer) {
      addDangerFromObstacle(
        enemy.position,
        playerPos,
        playerSize / 2,
        avoidanceRadius + enemy.size / 2,
        strength
      );
    }
  }

  for (let i = 0; i < allTanks.length; i++) {
    const other = allTanks[i];

    if (other.id === enemy.id || !other.active || other.isDying || other.isSpawning) continue;

    if (enemy.groupId !== 0 && other.groupId === enemy.groupId) continue;

    const shouldAvoid = shouldAvoidOtherTank(enemy.aiBehavior, other.aiBehavior);
    if (!shouldAvoid) continue;

    addDangerFromObstacle(
      enemy.position,
      other.position,
      other.size / 2,
      avoidanceRadius + enemy.size / 2,
      strength
    );
  }
}

function shouldAvoidTankBody(myBehavior: string, targetType: 'player'): boolean {

  if (myBehavior === 'Friendly') return false;
  if (myBehavior === 'Enemy') return true;
  if (myBehavior === 'Neutral') return true;
  return false;
}

function shouldAvoidOtherTank(myBehavior: string, otherBehavior: string): boolean {
  if (myBehavior === 'Neutral' || otherBehavior === 'Neutral') return true;

  if (myBehavior === 'Friendly' && otherBehavior === 'Friendly') return false;

  if (myBehavior === 'Enemy' && otherBehavior === 'Enemy') return false;

  return true;
}

export function calculateTargetInterest(
  enemyPos: Vector,
  targetPos: Vector
): void {
  const dx = targetPos.x - enemyPos.x;
  const dy = targetPos.y - enemyPos.y;
  const angleToTarget = Math.atan2(dy, dx);
  const primarySlot = getSlotForAngle(angleToTarget);

  for (let i = 0; i < SLOT_COUNT; i++) {
    const slotAngle = i * SLOT_ANGLE;
    let angleDiff = Math.abs(normalizeAngle(slotAngle - angleToTarget));

    const interest = Math.max(0, 1 - angleDiff / Math.PI);
    interestMap[i] = interest;
  }
}

export function resolveContextSteering(): Vector {
  const dangerWeight = AI_CONSTANTS.DANGER_WEIGHT;
  const interestWeight = AI_CONSTANTS.INTEREST_WEIGHT;

  let bestScore = -Infinity;
  let bestSlot = 0;

  for (let i = 0; i < SLOT_COUNT; i++) {
    const score = interestMap[i] * interestWeight - dangerMap[i] * dangerWeight;
    if (score > bestScore) {
      bestScore = score;
      bestSlot = i;
    }
  }

  if (bestScore < -0.5) {
    let lowestDanger = Infinity;
    for (let i = 0; i < SLOT_COUNT; i++) {
      if (dangerMap[i] < lowestDanger) {
        lowestDanger = dangerMap[i];
        bestSlot = i;
      }
    }
  }

  const prevSlot = (bestSlot - 1 + SLOT_COUNT) % SLOT_COUNT;
  const nextSlot = (bestSlot + 1) % SLOT_COUNT;
  const prevScore = interestMap[prevSlot] * interestWeight - dangerMap[prevSlot] * dangerWeight;
  const nextScore = interestMap[nextSlot] * interestWeight - dangerMap[nextSlot] * dangerWeight;

  let wx = SLOT_DIRECTIONS[bestSlot].x;
  let wy = SLOT_DIRECTIONS[bestSlot].y;
  const scoreDenom = Math.abs(bestScore) + 0.01;

  if (prevScore > 0) {
    const w = (prevScore / scoreDenom) * 0.35;
    wx += SLOT_DIRECTIONS[prevSlot].x * w;
    wy += SLOT_DIRECTIONS[prevSlot].y * w;
  }
  if (nextScore > 0) {
    const w = (nextScore / scoreDenom) * 0.35;
    wx += SLOT_DIRECTIONS[nextSlot].x * w;
    wy += SLOT_DIRECTIONS[nextSlot].y * w;
  }

  const wm = Math.sqrt(wx * wx + wy * wy);
  if (wm > 0.001) { wx /= wm; wy /= wm; }
  _resultVec.x = wx;
  _resultVec.y = wy;
  return _resultVec;
}

export function createMovementPersonality(gameNow: number): MovementPersonality {
  const baseDistance = (AI_CONSTANTS.PREFERRED_DISTANCE_MIN + AI_CONSTANTS.PREFERRED_DISTANCE_MAX) / 2;
  const variance = AI_CONSTANTS.DISTANCE_VARIANCE;

  return {
    preferredDistance: baseDistance + (Math.random() - 0.5) * variance * 2,
    aggressiveness: Math.random(),
    circlePreference: (Math.random() - 0.5) * 2,
    unpredictability: AI_CONSTANTS.UNPREDICTABILITY_MIN +
      Math.random() * (AI_CONSTANTS.UNPREDICTABILITY_MAX - AI_CONSTANTS.UNPREDICTABILITY_MIN),
    nextBehaviorChange: gameNow +
      AI_CONSTANTS.BEHAVIOR_CHANGE_INTERVAL_MIN +
      Math.random() * (AI_CONSTANTS.BEHAVIOR_CHANGE_INTERVAL_MAX - AI_CONSTANTS.BEHAVIOR_CHANGE_INTERVAL_MIN),
    currentMovementBias: (Math.random() - 0.5) * AI_CONSTANTS.MOVEMENT_BIAS_RANGE,
    navigationAccuracy: 0.85 + Math.random() * 0.15,
    holdCommitment: 0.3 + Math.random() * 0.5,
  };
}

export function updateStuckDetection(enemy: EnemyTank, now: number): boolean {
  if (now - enemy.navStuckCheckTime < AI_CONSTANTS.NAV_STUCK_CHECK_MS) {
    return enemy.navStuckFrames >= 3;
  }
  enemy.navStuckCheckTime = now;

  if (enemy.aiState === 'idle') {
    enemy.navStuckFrames = 0;
    return false;
  }

  const dx = enemy.position.x - enemy.navLastX;
  const dy = enemy.position.y - enemy.navLastY;
  const movedSq = dx * dx + dy * dy;

  const _stuckSpeedRatio = getEnemyMoveSpeed(enemy) / AI_CONSTANTS.NAV_STUCK_REF_SPEED;
  const _stuckThresh = AI_CONSTANTS.NAV_STUCK_THRESHOLD * _stuckSpeedRatio;
  const threshSq = _stuckThresh * _stuckThresh;

  if (movedSq < threshSq) {
    enemy.navStuckFrames++;
  } else {
    enemy.navStuckFrames = 0;
  }

  enemy.navLastX = enemy.position.x;
  enemy.navLastY = enemy.position.y;

  const nowLong = now - enemy.navStuckLongAt;
  if (nowLong >= AI_CONSTANTS.NAV_STUCK_LONG_MS) {
    const ldx = enemy.position.x - enemy.navStuckLongX;
    const ldy = enemy.position.y - enemy.navStuckLongY;
    if (ldx * ldx + ldy * ldy <
        AI_CONSTANTS.NAV_STUCK_LONG_DIST * AI_CONSTANTS.NAV_STUCK_LONG_DIST && !(SMALL_FIX.GH486 !== 0 && _stuckSpeedRatio <= 0)) {
      enemy.navStuckFrames = 3;
    }
    enemy.navStuckLongX = enemy.position.x;
    enemy.navStuckLongY = enemy.position.y;
    enemy.navStuckLongAt = now;
  }

  return enemy.navStuckFrames >= 3;
}

export function updateMovementPersonality(personality: MovementPersonality, gameNow: number): void {
  const now = gameNow;

  if (now >= personality.nextBehaviorChange) {
    personality.currentMovementBias = (Math.random() - 0.5) * AI_CONSTANTS.MOVEMENT_BIAS_RANGE;

    if (Math.random() < 0.3) {
      personality.circlePreference = -personality.circlePreference;
    }

    personality.aggressiveness = Math.max(0, Math.min(1,
      personality.aggressiveness + (Math.random() - 0.5) * 0.2
    ));

    personality.nextBehaviorChange = now +
      AI_CONSTANTS.BEHAVIOR_CHANGE_INTERVAL_MIN +
      Math.random() * (AI_CONSTANTS.BEHAVIOR_CHANGE_INTERVAL_MAX - AI_CONSTANTS.BEHAVIOR_CHANGE_INTERVAL_MIN);
  }
}

export function getPersonalizedOrbitDirection(personality: MovementPersonality): 1 | -1 {
  const threshold = 0.5 + personality.circlePreference * 0.3;
  return Math.random() < threshold ? 1 : -1;
}

const _INV_SQRT2 = Math.SQRT1_2;
const _SNAP_X = [1, _INV_SQRT2, 0, -_INV_SQRT2, -1, -_INV_SQRT2, 0, _INV_SQRT2];
const _SNAP_Y = [0, _INV_SQRT2, 1, _INV_SQRT2, 0, -_INV_SQRT2, -1, -_INV_SQRT2];
const _TWO_PI = Math.PI * 2;
const _PI_4 = Math.PI / 4;

export function snapDirectionTo8Way(out: { dirX: number; dirY: number }, preferDiagonal: boolean): void {
  const angle = Math.atan2(out.dirY, out.dirX);
  const norm = ((angle % _TWO_PI) + _TWO_PI) % _TWO_PI;
  const slot = norm / _PI_4;
  let idx = Math.round(slot) % 8;

  if (preferDiagonal && (idx & 1) === 0) {
    if (Math.random() < 0.7) {
      const cardinalAngle = idx * _PI_4;
      let diff = norm - cardinalAngle;
      if (diff > Math.PI) diff -= _TWO_PI;
      if (diff < -Math.PI) diff += _TWO_PI;
      idx = diff >= 0 ? (idx + 1) % 8 : (idx + 7) % 8;
    }
  }

  out.dirX = _SNAP_X[idx];
  out.dirY = _SNAP_Y[idx];
}

export function calculateCombatHoldDirectionInto(
  out: { dirX: number; dirY: number; speed: number; holdMs: number; isOrbit: boolean },
  towardX: number, towardY: number,
  dist: number,
  personality: MovementPersonality,
  hardMinDist: number, softMinDist: number, maxDist: number,
  orbitAngle: number, orbitDirection: 1 | -1,
  fearHeat: number = 0
): void {
  let dirX = 0;
  let dirY = 0;
  let speed: number;
  let holdMs: number;
  let isOrbit = false;
  const holdScale = 0.6 + personality.holdCommitment * 0.8;

  const impulseRoll = Math.random();

  const rushChance = 0.05 + personality.aggressiveness * 0.05;
  if (fearHeat < AI_CONSTANTS.FEAR_HEAT_SUPPRESS_RUSH && impulseRoll < rushChance && dist > hardMinDist * 1.2) {
    const biasAngle = (Math.random() - 0.5) * 0.5;
    const cosB = Math.cos(biasAngle);
    const sinB = Math.sin(biasAngle);
    out.dirX = towardX * cosB - towardY * sinB;
    out.dirY = towardX * sinB + towardY * cosB;
    const rushMag = Math.sqrt(out.dirX * out.dirX + out.dirY * out.dirY);
    if (rushMag > 0.001) { out.dirX /= rushMag; out.dirY /= rushMag; }
    out.speed = 0.11;
    out.holdMs = (400 + Math.random() * 200) * holdScale;
    out.isOrbit = false;
    return;
  }

  const disengageChance = 0.05 + personality.unpredictability * 0.05;
  if (impulseRoll < rushChance + disengageChance && dist < maxDist * 1.5) {
    const retreatAngle = Math.atan2(-towardY, -towardX) + (Math.random() - 0.5) * (Math.PI / 4);
    out.dirX = Math.cos(retreatAngle);
    out.dirY = Math.sin(retreatAngle);
    out.speed = 0.11;
    out.holdMs = (800 + Math.random() * 400) * holdScale;
    out.isOrbit = false;
    return;
  }

  if (dist < hardMinDist) {
    const retreatAngle = Math.atan2(-towardY, -towardX) + (Math.random() - 0.5) * (Math.PI / 3);
    dirX = Math.cos(retreatAngle);
    dirY = Math.sin(retreatAngle);
    speed = AI_CONSTANTS.RETREAT_SPEED_MULT;
    holdMs = AI_CONSTANTS.COMBAT_HOLD_RETREAT_MIN_MS +
      Math.random() * (AI_CONSTANTS.COMBAT_HOLD_RETREAT_MAX_MS - AI_CONSTANTS.COMBAT_HOLD_RETREAT_MIN_MS);
  } else if (dist < softMinDist) {
    const backoffStrength = 1 - (dist - hardMinDist) / (softMinDist - hardMinDist);
    const tangentX = -Math.sin(orbitAngle) * orbitDirection;
    const tangentY = Math.cos(orbitAngle) * orbitDirection;
    dirX = -towardX * backoffStrength + tangentX * (1 - backoffStrength);
    dirY = -towardY * backoffStrength + tangentY * (1 - backoffStrength);
    const biasAngle = personality.currentMovementBias * 0.4;
    const cosB = Math.cos(biasAngle);
    const sinB = Math.sin(biasAngle);
    const bx = dirX * cosB - dirY * sinB;
    const by = dirX * sinB + dirY * cosB;
    dirX = bx;
    dirY = by;
    speed = 0.11;
    holdMs = AI_CONSTANTS.COMBAT_HOLD_MIN_MS * 0.7 +
      Math.random() * (AI_CONSTANTS.COMBAT_HOLD_MAX_MS - AI_CONSTANTS.COMBAT_HOLD_MIN_MS) * 0.7;
  } else if (dist > maxDist) {
    const biasAngle = personality.currentMovementBias * personality.unpredictability;
    const cosB = Math.cos(biasAngle);
    const sinB = Math.sin(biasAngle);
    dirX = towardX * cosB - towardY * sinB;
    dirY = towardX * sinB + towardY * cosB;
    speed = 0.11;
    holdMs = AI_CONSTANTS.COMBAT_HOLD_MIN_MS +
      Math.random() * (AI_CONSTANTS.COMBAT_HOLD_MAX_MS - AI_CONSTANTS.COMBAT_HOLD_MIN_MS);
  } else {
    isOrbit = true;
    const tangentX = -Math.sin(orbitAngle) * orbitDirection;
    const tangentY = Math.cos(orbitAngle) * orbitDirection;
    const rangeT = (dist - softMinDist) / (maxDist - softMinDist);
    const approachBlend = rangeT * 0.3 * personality.aggressiveness;
    dirX = tangentX * (1 - approachBlend) + towardX * approachBlend;
    dirY = tangentY * (1 - approachBlend) + towardY * approachBlend;
    const biasAngle = personality.currentMovementBias * 0.5;
    const cosB = Math.cos(biasAngle);
    const sinB = Math.sin(biasAngle);
    const bx = dirX * cosB - dirY * sinB;
    const by = dirX * sinB + dirY * cosB;
    dirX = bx;
    dirY = by;
    speed = 0.11;
    holdMs = AI_CONSTANTS.COMBAT_HOLD_MIN_MS +
      Math.random() * (AI_CONSTANTS.COMBAT_HOLD_MAX_MS - AI_CONSTANTS.COMBAT_HOLD_MIN_MS);
  }

  const mag = Math.sqrt(dirX * dirX + dirY * dirY);
  if (mag > 0.001) { dirX /= mag; dirY /= mag; }

  out.dirX = dirX;
  out.dirY = dirY;
  out.speed = speed;
  out.holdMs = holdMs * holdScale;
  out.isOrbit = isOrbit;
}

const _wallCandidateOffsets = [Math.PI / 2, -Math.PI / 2, Math.PI / 4, -Math.PI / 4];

export function validateCombatDirectionWalls(
  out: { dirX: number; dirY: number },
  localX: number,
  localY: number,
  ms: MapState,
  fallbackDirX: number = 0,
  fallbackDirY: number = 0,
  escapeDirX: number = 0,
  escapeDirY: number = 0,
  rockOffX: number = 0,
  rockOffY: number = 0,
  bodyRadius: number = 0
): void {
  const cs = ms.cellSize;
  const origDirX = out.dirX;
  const origDirY = out.dirY;
  const origAngle = Math.atan2(origDirY, origDirX);

  const passes = bodyRadius > 0 ? 4 : 1;
  for (let pass = 0; pass < passes; pass++) {
    const strict = bodyRadius > 0 && pass < 3;
    const pr = strict ? bodyRadius : 0;
    const probeDist = strict ? (pass === 0 ? cs : pass === 1 ? cs * 0.5 : cs * 0.25) : cs;

    const checkX = localX + origDirX * probeDist;
    const checkY = localY + origDirY * probeDist;
    if (isPathClear(ms, localX, localY, checkX, checkY, rockOffX, rockOffY, pr)) {
      out.dirX = origDirX;
      out.dirY = origDirY;
      return;
    }

    for (let i = 0; i < 4; i++) {
      const candAngle = origAngle + _wallCandidateOffsets[i];
      const candX = Math.cos(candAngle);
      const candY = Math.sin(candAngle);
      if (isPathClear(ms, localX, localY, localX + candX * probeDist, localY + candY * probeDist, rockOffX, rockOffY, pr)) {
        out.dirX = candX;
        out.dirY = candY;
        return;
      }
    }

    if (fallbackDirX !== 0 || fallbackDirY !== 0) {
      if (isPathClear(ms, localX, localY, localX + fallbackDirX * probeDist, localY + fallbackDirY * probeDist, rockOffX, rockOffY, pr)) {
        out.dirX = fallbackDirX;
        out.dirY = fallbackDirY;
        return;
      }
    }
    if (escapeDirX !== 0 || escapeDirY !== 0) {
      if (isPathClear(ms, localX, localY, localX + escapeDirX * probeDist, localY + escapeDirY * probeDist, rockOffX, rockOffY, pr)) {
        out.dirX = escapeDirX;
        out.dirY = escapeDirY;
        return;
      }
    }
  }
  out.dirX = origDirX;
  out.dirY = origDirY;
}

export const PURSUIT_KIND_FIELD = 1;
export const PURSUIT_KIND_DEADEND = 2;
export const PURSUIT_KIND_VAL = 3;
export const PURSUIT_KIND_ESCAPE = 4;
export const PURSUIT_KIND_REGRAPH = 5;
export const PURSUIT_KIND_WEAVE = 6;
export const PURSUIT_KIND_ALIGN = 7;
export const PURSUIT_KIND_DOOR = 8;

const _pursuitWp = { ok: false, x: 0, y: 0, dirX: 0, dirY: 0, kind: 0 };
const _pwDir = { x: 0, y: 0 };
const _pwVal = { dirX: 0, dirY: 0 };

const _WEAVE_DIRS = 16;
const _weaveProgL = new Float64Array(_WEAVE_DIRS);
const _weavePxL = new Float64Array(_WEAVE_DIRS);
const _weavePyL = new Float64Array(_WEAVE_DIRS);
const _weaveProgS = new Float64Array(_WEAVE_DIRS);
const _weavePxS = new Float64Array(_WEAVE_DIRS);
const _weavePyS = new Float64Array(_WEAVE_DIRS);
const _weaveCos = new Float64Array(_WEAVE_DIRS);
const _weaveSin = new Float64Array(_WEAVE_DIRS);
for (let _wk = 0; _wk < _WEAVE_DIRS; _wk++) {
  _weaveCos[_wk] = Math.cos((_wk / _WEAVE_DIRS) * Math.PI * 2);
  _weaveSin[_wk] = Math.sin((_wk / _WEAVE_DIRS) * Math.PI * 2);
}
const _WEAVE_DOORS_MAX = 4;
const _weaveDoorX = new Float64Array(_WEAVE_DOORS_MAX);
const _weaveDoorY = new Float64Array(_WEAVE_DOORS_MAX);

function _pursuitMarch(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, dirX: number, dirY: number,
  offX: number, offY: number, R: number, requireOnField: boolean,
): number {
  if (R > 0) {
    const wide = _pursuitMarchAt(nav, ms, dist, lx, ly, dirX, dirY, offX, offY,
      R + AI_CONSTANTS.PURSUIT_PATH_CLEAR_MARGIN, requireOnField);
    if (wide > 0) return wide;
  }
  return _pursuitMarchAt(nav, ms, dist, lx, ly, dirX, dirY, offX, offY, R, requireOnField);
}

function _pursuitMarchAt(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, dirX: number, dirY: number,
  offX: number, offY: number, R: number, requireOnField: boolean,
): number {
  const csG = nav.cellSize;
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const mhG = nav.mapHalf;
  const mhGY = nav.mapHalfY;
  const probe = (csG < ms.cellSize ? csG : ms.cellSize) * 0.25;
  const maxDist = ms.cellSize * AI_CONSTANTS.PURSUIT_WP_MARCH_CELLS;
  let best = 0;
  for (let d = probe; d <= maxDist + 0.001; d += probe) {
    const px = lx + dirX * d;
    const py = ly + dirY * d;
    if (!bodyFitsAt(ms, px, py, offX, offY, R)) break;
    if (!isPathClear(ms, lx, ly, px, py, offX, offY, R)) break;
    if (requireOnField) {
      const pgx = Math.floor((px + mhG) / csG);
      const pgy = Math.floor((py + mhGY) / csG);
      if (pgx < 0 || pgx >= gc || pgy < 0 || pgy >= gcY) break;
      if (dist[pgx * gcY + pgy] === NAV_UNREACHABLE) break;
    }
    best = d;
  }
  return best;
}

function _pursuitDeriveCore(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, offX: number, offY: number, R: number,
  ascend: boolean, prefDx: number, prefDy: number,
  dangerDirX: Float64Array | null = null, dangerDirY: Float64Array | null = null,
  dangerW: Float64Array | null = null, dangerN: number = 0,
  dangerPX: Float64Array | null = null, dangerPY: Float64Array | null = null,
  deAvoid: number = 0,
): number {
  const cs = nav.cellSize;
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const gx = Math.floor((lx + mh) / cs);
  const gy = Math.floor((ly + mhY) / cs);
  if (gx < 0 || gx >= gc || gy < 0 || gy >= gcY) return 0;
  const d0 = dist[gx * gcY + gy];

  if (d0 === NAV_UNREACHABLE) {
    let bestD = -1, bx = 0, by = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const nx2 = gx + ox, ny2 = gy + oy;
        if (nx2 < 0 || nx2 >= gc || ny2 < 0 || ny2 >= gcY) continue;
        const nd = dist[nx2 * gcY + ny2];
        if (nd === NAV_UNREACHABLE) continue;
        if (bestD < 0 || (ascend ? nd > bestD : nd < bestD)) {
          const cx2 = -mh + nx2 * cs + cs * 0.5;
          const cy2 = -mhY + ny2 * cs + cs * 0.5;
          if (!bodyFitsAt(ms, cx2, cy2, offX, offY, R)) continue;
          if (!bodyFitsAt(ms, (lx + cx2) * 0.5, (ly + cy2) * 0.5, offX, offY, R)) continue;
          if (!isPathClear(ms, lx, ly, cx2, cy2, offX, offY, R)) continue;
          bestD = nd; bx = cx2; by = cy2;
        }
      }
    }
    if (bestD < 0) return 0;
    _pursuitWp.x = bx; _pursuitWp.y = by;
    const rm = Math.sqrt((bx - lx) * (bx - lx) + (by - ly) * (by - ly));
    _pwDir.x = rm > 0.001 ? (bx - lx) / rm : 0;
    _pwDir.y = rm > 0.001 ? (by - ly) / rm : 0;
    return PURSUIT_KIND_REGRAPH;
  }

  const step = queryDistanceStep(nav, dist, lx, ly, ascend, R,
    dangerDirX, dangerDirY, dangerW, dangerN, dangerPX, dangerPY, deAvoid);
  if (!step.ok) return 0;
  const stepDx = step.dirX, stepDy = step.dirY;

  if ((prefDx !== 0 || prefDy !== 0) && prefDx * stepDx + prefDy * stepDy > 0) {
    const best = _pursuitMarch(nav, ms, dist, lx, ly, prefDx, prefDy, offX, offY, R, true);
    if (best > 0) {
      const wx = lx + prefDx * best, wy = ly + prefDy * best;
      const wgx = Math.floor((wx + mh) / cs), wgy = Math.floor((wy + mhY) / cs);
      const dw = dist[wgx * gcY + wgy];
      if (ascend ? dw > d0 : dw < d0) {
        _pursuitWp.x = wx; _pursuitWp.y = wy;
        _pwDir.x = prefDx; _pwDir.y = prefDy;
        return PURSUIT_KIND_FIELD;
      }
    }
  }

  const best = _pursuitMarch(nav, ms, dist, lx, ly, stepDx, stepDy, offX, offY, R, true);
  if (best > 0) {
    const wx = lx + stepDx * best, wy = ly + stepDy * best;
    const wgx = Math.floor((wx + mh) / cs), wgy = Math.floor((wy + mhY) / cs);
    const dw = dist[wgx * gcY + wgy];
    if (ascend ? dw > d0 : dw < d0) {
      _pursuitWp.x = wx; _pursuitWp.y = wy;
      _pwDir.x = stepDx; _pwDir.y = stepDy;
      return PURSUIT_KIND_FIELD;
    }
  }

  const nx = gx + stepDx, ny = gy + stepDy;
  if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) return 0;
  const cxw = -mh + nx * cs + cs * 0.5;
  const cyw = -mhY + ny * cs + cs * 0.5;
  if (!bodyFitsAt(ms, cxw, cyw, offX, offY, R)) return 0;
  if (!bodyFitsAt(ms, (lx + cxw) * 0.5, (ly + cyw) * 0.5, offX, offY, R)) return 0;
  if (!isPathClear(ms, lx, ly, cxw, cyw, offX, offY, R)) return 0;
  _pursuitWp.x = cxw; _pursuitWp.y = cyw;
  _pwDir.x = stepDx; _pwDir.y = stepDy;
  return PURSUIT_KIND_FIELD;
}

function _pursuitDeriveOverride(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, offX: number, offY: number, R: number,
  odx: number, ody: number,
): boolean {
  const best = _pursuitMarch(nav, ms, dist, lx, ly, odx, ody, offX, offY, R, true);
  if (best <= 0) return false;
  _pursuitWp.x = lx + odx * best;
  _pursuitWp.y = ly + ody * best;
  _pwDir.x = odx; _pwDir.y = ody;
  return true;
}

function _pursuitCommitOrKeep(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, offX: number, offY: number, R: number,
  ascend: boolean, prevDirX: number, prevDirY: number, k: number,
  deAvoid: number = 0,
  dangerPX: Float64Array | null = null,
  dangerPY: Float64Array | null = null,
  dangerW: Float64Array | null = null,
  dangerN: number = 0,
): number {
  if (prevDirX === 0 && prevDirY === 0) return k;
  if (_pwDir.x * prevDirX + _pwDir.y * prevDirY >= AI_CONSTANTS.PURSUIT_WP_COMMIT_DOT) return k;
  const fx = _pursuitWp.x, fy = _pursuitWp.y, fdx = _pwDir.x, fdy = _pwDir.y;
  const best = _pursuitMarch(nav, ms, dist, lx, ly, prevDirX, prevDirY, offX, offY, R, true);
  if (best > 0) {
    const cs = nav.cellSize;
    const gc = nav.gridCells;
    const gcY = nav.gridCellsY;
    const mh = nav.mapHalf;
    const mhY = nav.mapHalfY;
    const gx = Math.floor((lx + mh) / cs), gy = Math.floor((ly + mhY) / cs);
    const wx = lx + prevDirX * best, wy = ly + prevDirY * best;
    const wgx = Math.floor((wx + mh) / cs), wgy = Math.floor((wy + mhY) / cs);
    if (gx >= 0 && gx < gc && gy >= 0 && gy < gcY && wgx >= 0 && wgx < gc && wgy >= 0 && wgy < gcY) {
      const d0 = dist[gx * gcY + gy];
      const dw = dist[wgx * gcY + wgy];
      let _deKeepOk = true;
      if (deAvoid > 0 && nav.deadEndDepth.length === gc * gcY) {
        const fgx = Math.floor((fx + mh) / cs), fgy = Math.floor((fy + mhY) / cs);
        if (fgx >= 0 && fgx < gc && fgy >= 0 && fgy < gcY) {
          _deKeepOk = nav.deadEndDepth[wgx * gcY + wgy] <= nav.deadEndDepth[fgx * gcY + fgy];
        }
      }
      let _pbKeepOk = true;
      if (dangerN > 0 && dangerPX !== null && dangerPY !== null && dangerW !== null) {
        const infl = ms.cellSize * AI_CONSTANTS.FLEE_LOOKAHEAD_INFL_CELLS;
        const inflSq = infl * infl;
        let sKeep = 0, sFresh = 0;
        for (let i = 0; i < dangerN; i++) {
          const kx = dangerPX[i] - wx, ky = dangerPY[i] - wy;
          const kd = kx * kx + ky * ky;
          if (kd < inflSq) sKeep += dangerW[i] * (1 - Math.sqrt(kd) / infl);
          const nx = dangerPX[i] - fx, ny = dangerPY[i] - fy;
          const nd = nx * nx + ny * ny;
          if (nd < inflSq) sFresh += dangerW[i] * (1 - Math.sqrt(nd) / infl);
        }
        _pbKeepOk = sKeep <= sFresh;
      }
      if (_deKeepOk && _pbKeepOk && d0 !== NAV_UNREACHABLE && dw !== NAV_UNREACHABLE && (ascend ? dw > d0 : dw < d0)) {
        _pursuitWp.x = wx; _pursuitWp.y = wy;
        _pwDir.x = prevDirX; _pwDir.y = prevDirY;
        return k;
      }
    }
  }
  _pursuitWp.x = fx; _pursuitWp.y = fy; _pwDir.x = fdx; _pwDir.y = fdy;
  return k;
}

function _weaveDerive(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, offX: number, offY: number, R: number,
  prevDirX: number, prevDirY: number,
  maxDoors: number = _WEAVE_DOORS_MAX,
): number {
  const cs = nav.cellSize;
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const gx = Math.floor((lx + mh) / cs);
  const gy = Math.floor((ly + mhY) / cs);
  if (gx < 0 || gx >= gc || gy < 0 || gy >= gcY) return 0;
  const d0 = dist[gx * gcY + gy];

  let nDoors = 0;
  let d1nx = -1, d1ny = -1, d1nd = NAV_UNREACHABLE;
  for (let d = 0; d < 4; d++) {
    const nx = gx + (d === 0 ? 1 : d === 1 ? -1 : 0);
    const ny = gy + (d === 2 ? 1 : d === 3 ? -1 : 0);
    if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
    const nd = dist[nx * gcY + ny];
    if (nd === NAV_UNREACHABLE) continue;
    if (d0 !== NAV_UNREACHABLE && nd >= d0) continue;
    if (nd < d1nd) { d1nd = nd; d1nx = nx; d1ny = ny; }
  }
  if (d1nx >= 0) {
    _weaveDoorX[nDoors] = -mh + d1nx * cs + cs * 0.5;
    _weaveDoorY[nDoors] = -mhY + d1ny * cs + cs * 0.5;
    nDoors++;
    let d2nx = -1, d2ny = -1, d2nd = NAV_UNREACHABLE;
    for (let d = 0; d < 4; d++) {
      const nx = d1nx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = d1ny + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
      if (nx === gx && ny === gy) continue;
      const nd = dist[nx * gcY + ny];
      if (nd === NAV_UNREACHABLE || nd >= d1nd) continue;
      if (nd < d2nd) { d2nd = nd; d2nx = nx; d2ny = ny; }
    }
    if (d2nx >= 0) {
      _weaveDoorX[nDoors] = -mh + d2nx * cs + cs * 0.5;
      _weaveDoorY[nDoors] = -mhY + d2ny * cs + cs * 0.5;
      nDoors++;
    }
  }
  if (d0 !== NAV_UNREACHABLE) {
    for (let d = 0; d < 4 && nDoors < _WEAVE_DOORS_MAX; d++) {
      const nx = gx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = gy + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
      if (dist[nx * gcY + ny] !== d0) continue;
      let hasDescent = false;
      for (let dd = 0; dd < 4; dd++) {
        const mx2 = nx + (dd === 0 ? 1 : dd === 1 ? -1 : 0);
        const my2 = ny + (dd === 2 ? 1 : dd === 3 ? -1 : 0);
        if (mx2 < 0 || mx2 >= gc || my2 < 0 || my2 >= gcY) continue;
        if (mx2 === gx && my2 === gy) continue;
        const md = dist[mx2 * gcY + my2];
        if (md !== NAV_UNREACHABLE && md < d0) { hasDescent = true; break; }
      }
      if (!hasDescent) continue;
      _weaveDoorX[nDoors] = -mh + nx * cs + cs * 0.5;
      _weaveDoorY[nDoors] = -mhY + ny * cs + cs * 0.5;
      nDoors++;
    }
  }
  if (nDoors === 0) return 0;
  if (nDoors > maxDoors) nDoors = maxDoors;

  const csP = ms.cellSize;
  const probe = csP * 0.25;
  const maxHop = csP * AI_CONSTANTS.PURSUIT_WP_MARCH_CELLS;
  const longHop = csP * (AI_CONSTANTS.PURSUIT_WP_ARRIVE_FRAC + 0.1);
  const prevBonus = csP * AI_CONSTANTS.PURSUIT_WEAVE_PREV_BONUS;
  const minProg = csP * AI_CONSTANTS.PURSUIT_WEAVE_MIN_PROGRESS;
  for (let dr = 0; dr < nDoors; dr++) {
    const doorX = _weaveDoorX[dr], doorY = _weaveDoorY[dr];
    const curDoorDx = doorX - lx, curDoorDy = doorY - ly;
    const curDoorDist = Math.sqrt(curDoorDx * curDoorDx + curDoorDy * curDoorDy);
    for (let k = 0; k < _WEAVE_DIRS; k++) {
      _weaveProgL[k] = -Infinity;
      _weaveProgS[k] = -Infinity;
      const cx = _weaveCos[k], cy = _weaveSin[k];
      const bonus = (prevDirX !== 0 || prevDirY !== 0)
        ? prevBonus * (cx * prevDirX + cy * prevDirY) : 0;
      for (let s = probe; s <= maxHop + 0.001; s += probe) {
        const px = lx + cx * s;
        const py = ly + cy * s;
        if (!bodyFitsAt(ms, px, py, offX, offY, R)) break;
        const ddx = doorX - px, ddy = doorY - py;
        const scored = curDoorDist - Math.sqrt(ddx * ddx + ddy * ddy) + bonus;
        if (s >= longHop - 0.001) {
          if (scored > _weaveProgL[k]) {
            _weaveProgL[k] = scored;
            _weavePxL[k] = px;
            _weavePyL[k] = py;
          }
        } else if (scored > _weaveProgS[k]) {
          _weaveProgS[k] = scored;
          _weavePxS[k] = px;
          _weavePyS[k] = py;
        }
      }
    }

    for (let tier = 0; tier < 4; tier++) {
      const longT = tier === 0 || tier === 2;
      const revT = tier >= 2;
      const prog = longT ? _weaveProgL : _weaveProgS;
      const pxA = longT ? _weavePxL : _weavePxS;
      const pyA = longT ? _weavePyL : _weavePyS;
      for (let pick = 0; pick < _WEAVE_DIRS; pick++) {
        let k = -1;
        let best = minProg;
        for (let j = 0; j < _WEAVE_DIRS; j++) {
          if ((prevDirX !== 0 || prevDirY !== 0) &&
              (_weaveCos[j] * prevDirX + _weaveSin[j] * prevDirY < -0.35) !== revT) continue;
          if (prog[j] > best) { best = prog[j]; k = j; }
        }
        if (k < 0) break;
        prog[k] = -Infinity;
        const wx = pxA[k], wy = pyA[k];
        if (!isPathClear(ms, lx, ly, wx, wy, offX, offY, R)) continue;
        const hm = Math.sqrt((wx - lx) * (wx - lx) + (wy - ly) * (wy - ly));
        if (hm < probe * 0.5) continue;
        _pursuitWp.x = wx;
        _pursuitWp.y = wy;
        _pwDir.x = (wx - lx) / hm;
        _pwDir.y = (wy - ly) / hm;
        return PURSUIT_KIND_WEAVE;
      }
    }
  }
  return 0;
}

export const FLEE_DE_SHALLOW = 0;
export const FLEE_DE_NOEXIT  = 1;
export const FLEE_DE_OUTWARD = 2;
export const FLEE_DE_PERP    = 3;
export const FLEE_DE_OPPOSED = 4;
export const FLEE_DE_NOASC   = 5;
export const FLEE_DE_FIRED   = 6;
export const FLEE_DE_FIRED_PERP = 7;
export const FLEE_DE_MARCHFAIL = 8;
export const FLEE_DE_ESCAPE  = 9;
export const FLEE_DE_SLOTS   = 10;

export function fleeDeadEndVerdict(
  depth: number, exitDirX: number, exitDirY: number,
  ascDirX: number, ascDirY: number, bar: number,
): number {
  if (depth < bar) return FLEE_DE_SHALLOW;
  if (exitDirX === 0 && exitDirY === 0) return FLEE_DE_NOEXIT;
  const dot = ascDirX * exitDirX + ascDirY * exitDirY;
  if (dot > 0) return FLEE_DE_OUTWARD;
  if (dot < 0) return FLEE_DE_OPPOSED;
  return FLEE_DE_PERP;
}

export const FLEE_DE_CALLER_FLEE = 0;
export const FLEE_DE_CALLER_WITHDRAW = 1;
export const FLEE_DE_CALLERS = 2;

export const fleeDeadEndDecline = new Float64Array(FLEE_DE_CALLERS * FLEE_DE_SLOTS);
export function resetFleeDeadEndDecline(): void { fleeDeadEndDecline.fill(0); }

export function deriveFleeWaypoint(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, srcLx: number, srcLy: number,
  offX: number, offY: number, R: number,
  prevDirX: number, prevDirY: number, escActive: boolean,
  mistakeAngle: number,
  dangerDirX: Float64Array | null = null,
  dangerDirY: Float64Array | null = null,
  dangerW: Float64Array | null = null,
  dangerN: number = 0,
  dangerPX: Float64Array | null = null,
  dangerPY: Float64Array | null = null,
  deCommit: boolean = false,
  callerTag: number = FLEE_DE_CALLER_FLEE,
): typeof _pursuitWp {
  _pursuitWp.ok = false;
  _pursuitWp.kind = 0;
  const _deAv = AI_CONSTANTS.FLEE_DEADEND_AVOID !== 0
    ? AI_CONSTANTS.FLEE_DEADEND_AVOID_WEIGHT : 0;
  const cs = nav.cellSize;
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const gx = Math.floor((lx + mh) / cs);
  const gy = Math.floor((ly + mhY) / cs);
  const d0 = (gx >= 0 && gx < gc && gy >= 0 && gy < gcY) ? dist[gx * gcY + gy] : NAV_UNREACHABLE;

  const _deSlot = callerTag * FLEE_DE_SLOTS;

  if (escActive) {
    if (!(d0 !== NAV_UNREACHABLE && d0 <= 1)) {
      if (_pursuitDeriveCore(nav, ms, dist, lx, ly, offX, offY, R, false, 0, 0) > 0) {
        fleeDeadEndDecline[_deSlot + FLEE_DE_ESCAPE]++;
        _pursuitWp.ok = true;
        _pursuitWp.kind = PURSUIT_KIND_ESCAPE;
        _pursuitWp.dirX = _pwDir.x; _pursuitWp.dirY = _pwDir.y;
        return _pursuitWp;
      }
    }
  }

  const asc = queryDistanceStep(nav, dist, lx, ly, true, R,
    dangerDirX, dangerDirY, dangerW, dangerN, dangerPX, dangerPY, _deAv);
  if (!asc.ok) fleeDeadEndDecline[_deSlot + FLEE_DE_NOASC]++;
  if (asc.ok) {
    const de = queryDeadEndMap(nav, lx, ly);
    const _deBar = (deCommit && AI_CONSTANTS.FLEE_DEADEND_COMMIT_MS > 0)
      ? 1 : AI_CONSTANTS.DEAD_END_ESCAPE_DEPTH;
    const _deV = fleeDeadEndVerdict(de.depth, de.exitDirX, de.exitDirY,
      asc.dirX, asc.dirY, _deBar);
    fleeDeadEndDecline[_deSlot + _deV]++;
    if (_deV === FLEE_DE_OPPOSED ||
        (_deV === FLEE_DE_PERP && AI_CONSTANTS.FLEE_DEADEND_PERP !== 0)) {
      const m = Math.sqrt(de.exitDirX * de.exitDirX + de.exitDirY * de.exitDirY);
      if (m > 0.001 &&
          _pursuitDeriveOverride(nav, ms, dist, lx, ly, offX, offY, R, de.exitDirX / m, de.exitDirY / m)) {
        fleeDeadEndDecline[_deSlot + (_deV === FLEE_DE_PERP ? FLEE_DE_FIRED_PERP : FLEE_DE_FIRED)]++;
        _pursuitWp.ok = true;
        _pursuitWp.kind = PURSUIT_KIND_DEADEND;
        _pursuitWp.dirX = _pwDir.x; _pursuitWp.dirY = _pwDir.y;
        return _pursuitWp;
      }
      fleeDeadEndDecline[_deSlot + FLEE_DE_MARCHFAIL]++;
    }
    let ax = lx - srcLx, ay = ly - srcLy;
    const am = Math.sqrt(ax * ax + ay * ay);
    if (am > 0.001) { ax /= am; ay /= am; } else { ax = asc.dirX; ay = asc.dirY; }
    const b = AI_CONSTANTS.NAV_FLOW_FIELD_BLEND;
    let px = ax * (1 - b) + asc.dirX * b;
    let py = ay * (1 - b) + asc.dirY * b;
    if (mistakeAngle !== 0) {
      const cosR = Math.cos(mistakeAngle);
      const sinR = Math.sin(mistakeAngle);
      const mx = px * cosR - py * sinR;
      const my = px * sinR + py * cosR;
      px = mx; py = my;
    }
    const pm = Math.sqrt(px * px + py * py);
    if (pm > 0.001) { px /= pm; py /= pm; } else { px = 0; py = 0; }
    let k = _pursuitDeriveCore(nav, ms, dist, lx, ly, offX, offY, R, true, px, py,
      dangerDirX, dangerDirY, dangerW, dangerN, dangerPX, dangerPY, _deAv);
    if (k > 0) {
      k = _pursuitCommitOrKeep(nav, ms, dist, lx, ly, offX, offY, R, true, prevDirX, prevDirY, k, _deAv);
      _pursuitWp.ok = true;
      _pursuitWp.kind = k;
      _pursuitWp.dirX = _pwDir.x; _pursuitWp.dirY = _pwDir.y;
      return _pursuitWp;
    }
  }

  {
    let ax = lx - srcLx, ay = ly - srcLy;
    const am = Math.sqrt(ax * ax + ay * ay);
    if (am > 0.001) { ax /= am; ay /= am; } else { ax = 1; ay = 0; }
    const des = queryDistanceStep(nav, dist, lx, ly, false, R);
    _pwVal.dirX = ax; _pwVal.dirY = ay;
    validateCombatDirectionWalls(_pwVal, lx, ly, ms, 0, 0,
      des.ok ? des.dirX : 0, des.ok ? des.dirY : 0, offX, offY, R);
    const vBest = _pursuitMarch(nav, ms, dist, lx, ly, _pwVal.dirX, _pwVal.dirY, offX, offY, R, false);
    if (vBest > 0) {
      _pursuitWp.ok = true;
      _pursuitWp.kind = PURSUIT_KIND_VAL;
      _pursuitWp.x = lx + _pwVal.dirX * vBest;
      _pursuitWp.y = ly + _pwVal.dirY * vBest;
      _pursuitWp.dirX = _pwVal.dirX; _pursuitWp.dirY = _pwVal.dirY;
      return _pursuitWp;
    }
    const q = cs * 0.25;
    if (bodyFitsAt(ms, lx + _pwVal.dirX * q, ly + _pwVal.dirY * q, offX, offY, R) &&
        isPathClear(ms, lx, ly, lx + _pwVal.dirX * q, ly + _pwVal.dirY * q, offX, offY, R)) {
      _pursuitWp.ok = true;
      _pursuitWp.kind = PURSUIT_KIND_VAL;
      _pursuitWp.x = lx + _pwVal.dirX * q;
      _pursuitWp.y = ly + _pwVal.dirY * q;
      _pursuitWp.dirX = _pwVal.dirX; _pursuitWp.dirY = _pwVal.dirY;
      return _pursuitWp;
    }
  }

  if (_pursuitDeriveCore(nav, ms, dist, lx, ly, offX, offY, R, false, 0, 0) > 0) {
    _pursuitWp.ok = true;
    _pursuitWp.kind = PURSUIT_KIND_ESCAPE;
    _pursuitWp.dirX = _pwDir.x; _pursuitWp.dirY = _pwDir.y;
    return _pursuitWp;
  }
  return _pursuitWp;
}

const _ALIGN_MAX_FRAC = 0.5;
const _ALIGN_MAX_BLOCK = 24;
const _alignBlkLo = new Float64Array(_ALIGN_MAX_BLOCK);
const _alignBlkHi = new Float64Array(_ALIGN_MAX_BLOCK);
const _ALIGN_EPS = 0.01;
const _ALIGN_MIN_MOVE = 0.5;

function _alignDerive(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, offX: number, offY: number, R: number,
): number {
  const cs = nav.cellSize;
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const gx = Math.floor((lx + mh) / cs);
  const gy = Math.floor((ly + mhY) / cs);
  if (gx < 0 || gx >= gc || gy < 0 || gy >= gcY) return 0;
  const d0 = dist[gx * gcY + gy];
  if (d0 === NAV_UNREACHABLE) return 0;

  let bnx = -1, bny = -1, bnd = NAV_UNREACHABLE;
  for (let d = 0; d < 4; d++) {
    const nx = gx + (d === 0 ? 1 : d === 1 ? -1 : 0);
    const ny = gy + (d === 2 ? 1 : d === 3 ? -1 : 0);
    if (nx < 0 || nx >= gc || ny < 0 || ny >= gcY) continue;
    const nd = dist[nx * gcY + ny];
    if (nd === NAV_UNREACHABLE || nd >= d0) continue;
    if (nd < bnd) { bnd = nd; bnx = nx; bny = ny; }
  }
  if (bnx < 0) return 0;

  const stepX = bnx - gx, stepY = bny - gy;
  const horiz = stepX !== 0;
  const bAt = horiz ? -mh + (stepX > 0 ? gx + 1 : gx) * cs
                    : -mhY + (stepY > 0 ? gy + 1 : gy) * cs;
  const cLo = horiz ? -mhY + gy * cs : -mh + gx * cs;
  const cHi = cLo + cs;
  const myC = horiz ? ly : lx;

  const perpW = (horiz ? bAt + offX : bAt + offY);
  const crossOff = horiz ? offY : offX;
  const rocks = ms.rocks;
  let nBlk = 0;
  for (let i = 0; i < rocks.length; i++) {
    const r = rocks[i];
    if (!r.active) continue;
    const eff = r.size + R;
    const dPerp = (horiz ? r.x : r.y) - perpW;
    const hSq = eff * eff - dPerp * dPerp;
    if (hSq <= 0) continue;
    const h = Math.sqrt(hSq);
    const rc = (horiz ? r.y : r.x) - crossOff;
    const lo = rc - h, hi = rc + h;
    if (hi < cLo || lo > cHi) continue;
    if (nBlk >= _ALIGN_MAX_BLOCK) return 0;
    _alignBlkLo[nBlk] = lo; _alignBlkHi[nBlk] = hi; nBlk++;
  }
  for (let i = 1; i < nBlk; i++) {
    const kl = _alignBlkLo[i], kh = _alignBlkHi[i];
    let j = i - 1;
    while (j >= 0 && _alignBlkLo[j] > kl) {
      _alignBlkLo[j + 1] = _alignBlkLo[j]; _alignBlkHi[j + 1] = _alignBlkHi[j]; j--;
    }
    _alignBlkLo[j + 1] = kl; _alignBlkHi[j + 1] = kh;
  }
  const maxOff = cs * _ALIGN_MAX_FRAC;
  let foundC = NaN, bestOff = Infinity;
  let cursor = cLo;
  for (let i = 0; i <= nBlk; i++) {
    const lo = i < nBlk ? _alignBlkLo[i] : cHi;
    const hi = i < nBlk ? _alignBlkHi[i] : cHi;
    if (lo > cursor - _ALIGN_EPS) {
      const fLo = cursor, fHi = lo < cursor ? cursor : lo;
      const c = myC < fLo ? fLo : myC > fHi ? fHi : myC;
      const off = c < myC ? myC - c : c - myC;
      if (off < bestOff && off <= maxOff) { bestOff = off; foundC = c; }
    }
    if (hi > cursor) cursor = hi;
    if (cursor > cHi) break;
  }
  if (foundC !== foundC) return 0;
  const delta = foundC - myC;
  if (delta < _ALIGN_MIN_MOVE && delta > -_ALIGN_MIN_MOVE) return 0;

  const ax = horiz ? lx : foundC;
  const ay = horiz ? foundC : ly;
  if (!bodyFitsAt(ms, ax, ay, offX, offY, R)) return 0;
  if (!segBodyClearAt(ms, lx, ly, ax, ay, offX, offY, R)) return 0;
  const tx = horiz ? bAt + stepX * cs * 0.5 : ax;
  const ty = horiz ? ay : bAt + stepY * cs * 0.5;
  if (!segBodyClearAt(ms, ax, ay, tx, ty, offX, offY, R)) return 0;

  const hm = Math.sqrt((ax - lx) * (ax - lx) + (ay - ly) * (ay - ly));
  if (hm < 0.001) return 0;
  _pursuitWp.x = ax;
  _pursuitWp.y = ay;
  _pwDir.x = (ax - lx) / hm;
  _pwDir.y = (ay - ly) / hm;
  return PURSUIT_KIND_ALIGN;
}

function _doorDerive(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, offX: number, offY: number, R: number,
): number {
  const eg = nav.isExactView;
  if (!eg || eg.doors === 0) return 0;
  const F = nav.gridCells;
  const FY = nav.gridCellsY;
  const cs = nav.cellSize;
  const mh = nav.mapHalf;
  const mhY = nav.mapHalfY;
  const gx = Math.floor((lx + mh) / cs);
  const gy = Math.floor((ly + mhY) / cs);
  if (gx < 0 || gx >= F || gy < 0 || gy >= FY) return 0;
  const here = gx * FY + gy;
  const d0 = dist[here];
  if (d0 !== NAV_UNREACHABLE) {
    if (gx + 1 < F && dist[here + FY] < d0) return 0;
    if (gx - 1 >= 0 && dist[here - FY] < d0) return 0;
    if (gy + 1 < FY && dist[here + 1] < d0) return 0;
    if (gy - 1 >= 0 && dist[here - 1] < d0) return 0;
  }

  for (let c = 0; c < 5; c++) {
    const cell = c === 0 ? here
      : c === 1 ? (gx + 1 < F ? here + FY : -1)
      : c === 2 ? (gx - 1 >= 0 ? here - FY : -1)
      : c === 3 ? (gy + 1 < FY ? here + 1 : -1)
      : (gy - 1 >= 0 ? here - 1 : -1);
    if (cell < 0) continue;
    const doors = eg.portalByCell.get(cell);
    if (!doors) continue;
    const dCell = dist[cell] !== NAV_UNREACHABLE ? dist[cell] : d0;
    for (let di = 0; di < doors.length; di++) {
      const d = doors[di];
      const nearIsA = eg.portalA[d] === cell;
      const far = nearIsA ? eg.portalB[d] : eg.portalA[d];
      const dFar = dist[far];
      if (dFar === NAV_UNREACHABLE) continue;
      if (dCell !== NAV_UNREACHABLE && dFar >= dCell) continue;
      const p0 = eg.portalPathStart[d];
      const p1 = eg.portalPathStart[d + 1];
      const stepDir = nearIsA ? 2 : -2;
      const pStart = nearIsA ? p0 : p1 - 2;
      const pEnd = nearIsA ? p1 : p0 - 2;
      let nearP = -1, nearD2 = Infinity;
      for (let p = pStart; p !== pEnd; p += stepDir) {
        const dx2 = eg.portalPath[p] - lx, dy2 = eg.portalPath[p + 1] - ly;
        const d2 = dx2 * dx2 + dy2 * dy2;
        if (d2 < nearD2) { nearD2 = d2; nearP = p; }
      }
      if (nearP < 0) continue;
      if (nearD2 > (cs * 2) * (cs * 2)) continue;
      let bestX = NaN, bestY = NaN;
      for (let p = nearP + stepDir; p !== pEnd; p += stepDir) {
        const px = eg.portalPath[p], py = eg.portalPath[p + 1];
        if (segBodyClearAt(ms, lx, ly, px, py, offX, offY, R)) { bestX = px; bestY = py; }
        else if (!Number.isNaN(bestX)) break;
      }
      if (Number.isNaN(bestX)) {
        const px = eg.portalPath[nearP], py = eg.portalPath[nearP + 1];
        if (segBodyClearAt(ms, lx, ly, px, py, offX, offY, R)) { bestX = px; bestY = py; }
      }
      if (Number.isNaN(bestX)) continue;
      const hm = Math.sqrt((bestX - lx) * (bestX - lx) + (bestY - ly) * (bestY - ly));
      if (hm < 1) continue;
      _pursuitWp.x = bestX;
      _pursuitWp.y = bestY;
      _pwDir.x = (bestX - lx) / hm;
      _pwDir.y = (bestY - ly) / hm;
      return PURSUIT_KIND_DOOR;
    }
  }
  return 0;
}

export function deriveFollowWaypoint(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, offX: number, offY: number, R: number,
  prevDirX: number, prevDirY: number,
  allowFullLadder: boolean = true,
  dangerDirX: Float64Array | null = null,
  dangerDirY: Float64Array | null = null,
  dangerW: Float64Array | null = null,
  dangerN: number = 0,
  dangerPX: Float64Array | null = null,
  dangerPY: Float64Array | null = null,
): typeof _pursuitWp {
  _pursuitWp.ok = false;
  _pursuitWp.kind = 0;
  const dk = _doorDerive(nav, ms, dist, lx, ly, offX, offY, R);
  if (dk > 0) {
    _pursuitWp.ok = true;
    _pursuitWp.kind = dk;
    _pursuitWp.dirX = _pwDir.x; _pursuitWp.dirY = _pwDir.y;
    return _pursuitWp;
  }
  const _dgLive = dangerN > 0;
  const sm = _dgLive ? null : queryDistanceStepSmooth(nav, dist, lx, ly, R);
  let k = _pursuitDeriveCore(nav, ms, dist, lx, ly, offX, offY, R, false,
    sm && sm.ok ? sm.dirX : 0, sm && sm.ok ? sm.dirY : 0,
    dangerDirX, dangerDirY, dangerW, dangerN, dangerPX, dangerPY);
  if (k > 0) {
    k = _pursuitCommitOrKeep(nav, ms, dist, lx, ly, offX, offY, R, false, prevDirX, prevDirY, k,
      0, dangerPX, dangerPY, dangerW, dangerN);
    _pursuitWp.ok = true;
    _pursuitWp.kind = k;
    _pursuitWp.dirX = _pwDir.x; _pursuitWp.dirY = _pwDir.y;
    return _pursuitWp;
  }
  const w = _weaveDerive(nav, ms, dist, lx, ly, offX, offY, R, prevDirX, prevDirY,
    allowFullLadder ? _WEAVE_DOORS_MAX : 1);
  if (w > 0) {
    _pursuitWp.ok = true;
    _pursuitWp.kind = w;
    _pursuitWp.dirX = _pwDir.x; _pursuitWp.dirY = _pwDir.y;
    return _pursuitWp;
  }
  if (allowFullLadder) {
    const a = _alignDerive(nav, ms, dist, lx, ly, offX, offY, R);
    if (a > 0) {
      _pursuitWp.ok = true;
      _pursuitWp.kind = a;
      _pursuitWp.dirX = _pwDir.x; _pursuitWp.dirY = _pwDir.y;
      return _pursuitWp;
    }
  }
  return _pursuitWp;
}

export function segBodyClearAt(
  ms: MapState, x0: number, y0: number, x1: number, y1: number,
  offX: number, offY: number, R: number,
): boolean {
  if (!isPathClear(ms, x0, y0, x1, y1, offX, offY, R)) return false;
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return true;
  const step = ms.cellSize * 0.25;
  const ux = dx / len, uy = dy / len;
  for (let d = step; d < len; d += step) {
    if (!bodyFitsAt(ms, x0 + ux * d, y0 + uy * d, offX, offY, R)) return false;
  }
  return bodyFitsAt(ms, x1, y1, offX, offY, R);
}

const _EPDX4 = [1, -1, 0, 0];
const _EPDY4 = [0, 0, 1, -1];

const _nodeClampOut = { ok: false, x: 0, y: 0 };
const _clampBand = { xLo: 0, xHi: 0, yLo: 0, yHi: 0 };

function clampNodeForBody(
  ms: MapState, gx: number, gy: number, offX: number, offY: number, R: number,
): { ok: boolean; x: number; y: number } {
  const pad = R + AI_CONSTANTS.PURSUIT_PATH_CLEAR_MARGIN + 2;
  if (_clampWithPad(ms, gx, gy, pad)) {
    _nodeClampOut.ok = bodyFitsAt(ms, _nodeClampOut.x, _nodeClampOut.y, offX, offY, R);
    if (_nodeClampOut.ok) return _nodeClampOut;
  }
  if (_clampWithPad(ms, gx, gy, R)) {
    _nodeClampOut.ok = bodyFitsAt(ms, _nodeClampOut.x, _nodeClampOut.y, offX, offY, R);
    return _nodeClampOut;
  }
  _nodeClampOut.ok = false;
  return _nodeClampOut;
}

function _clampWithPad(ms: MapState, gx: number, gy: number, pad: number): boolean {
  const cs = ms.cellSize;
  const mh = ms.mapHalf;
  const mhY = ms.mapHalfY;
  const gc = ms.gridCells;
  const gcY = ms.gridCellsY;
  const wg = ms.wallGrid;
  const K = AI_CONSTANTS.PURSUIT_NODE_CLAMP_CELLS;
  const cx = -mh + gx * cs + cs * 0.5;
  const cy = -mhY + gy * cs + cs * 0.5;
  let xLo = cx - K * cs, xHi = cx + K * cs;
  let yLo = cy - K * cs, yHi = cy + K * cs;
  for (let d = 1; d <= K; d++) {
    const e = gx + d, w = gx - d;
    if (xHi === cx + K * cs && (e >= gc || wg[e * gcY + gy] >= 0)) xHi = -mh + e * cs - pad;
    if (xLo === cx - K * cs && (w < 0 || wg[w * gcY + gy] >= 0)) xLo = -mh + (w + 1) * cs + pad;
    const s = gy + d, n = gy - d;
    if (yHi === cy + K * cs && (s >= gcY || wg[gx * gcY + s] >= 0)) yHi = -mhY + s * cs - pad;
    if (yLo === cy - K * cs && (n < 0 || wg[gx * gcY + n] >= 0)) yLo = -mhY + (n + 1) * cs + pad;
  }
  for (let L = 0; L < 2; L++) {
    if (SMALL_FIX.R656 === 0) break;
    const ex = L === 0 ? ms.extraWalls : (heldWallsReach(ms, xLo + (ms.extraOffX ?? 0) - pad, yLo + (ms.extraOffY ?? 0) - pad, xHi + (ms.extraOffX ?? 0) + pad, yHi + (ms.extraOffY ?? 0) + pad) ? ms.outWalls : undefined);
    if (ex === undefined || ex.length === 0) continue;
    const walls = ms.walls, eox = ms.extraOffX ?? 0, eoy = ms.extraOffY ?? 0;
    for (let i = 0; i < ex.length; i++) {
      const w = walls[ex[i]];
      if (w === undefined || !w.active) continue;
      const bx0 = w.x - eox - w.halfW - pad, bx1 = w.x - eox + w.halfW + pad;
      const by0 = w.y - eoy - w.halfH - pad, by1 = w.y - eoy + w.halfH + pad;
      if (bx1 <= xLo || bx0 >= xHi || by1 <= yLo || by0 >= yHi) continue;
      const nx = cx < xLo ? xLo : cx > xHi ? xHi : cx, ny = cy < yLo ? yLo : cy > yHi ? yHi : cy;
      const mL = bx0 >= xLo ? (nx > bx0 ? nx - bx0 : 0) : Infinity;
      const mR = bx1 <= xHi ? (nx < bx1 ? bx1 - nx : 0) : Infinity;
      const mU = by0 >= yLo ? (ny > by0 ? ny - by0 : 0) : Infinity;
      const mD = by1 <= yHi ? (ny < by1 ? by1 - ny : 0) : Infinity;
      const m = Math.min(mL, mR, mU, mD);
      if (m === Infinity) return false;
      if (m === mL) xHi = bx0; else if (m === mR) xLo = bx1; else if (m === mU) yHi = by0; else yLo = by1;
    }
  }
  if (xLo > xHi || yLo > yHi) return false;
  _clampBand.xLo = xLo; _clampBand.xHi = xHi;
  _clampBand.yLo = yLo; _clampBand.yHi = yHi;
  _nodeClampOut.x = cx < xLo ? xLo : cx > xHi ? xHi : cx;
  _nodeClampOut.y = cy < yLo ? yLo : cy > yHi ? yHi : cy;
  return true;
}

export function extractFollowPath(
  nav: NavigationState, ms: MapState, dist: Uint16Array,
  lx: number, ly: number, offX: number, offY: number, R: number,
  outPts: Float32Array, maxCells: number,
  dangerPX: Float64Array | null = null,
  dangerPY: Float64Array | null = null,
  dangerW: Float64Array | null = null,
  dangerN: number = 0,
): number {
  const cs = ms.cellSize;
  const gc = nav.gridCells;
  const gcY = nav.gridCellsY;
  const mh = ms.mapHalf;
  const mhY = ms.mapHalfY;
  let gx = Math.floor((lx + mh) / cs);
  let gy = Math.floor((ly + mhY) / cs);
  if (gx < 0 || gx >= gc || gy < 0 || gy >= gcY) return 0;
  if (dist[gx * gcY + gy] === NAV_UNREACHABLE) {
    let bestD = -1, bx = -1, by = -1;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const nx2 = gx + ox, ny2 = gy + oy;
        if (nx2 < 0 || nx2 >= gc || ny2 < 0 || ny2 >= gcY) continue;
        const nd = dist[nx2 * gcY + ny2];
        if (nd === NAV_UNREACHABLE) continue;
        if (bestD >= 0 && nd >= bestD) continue;
        const cx2 = -mh + nx2 * cs + cs * 0.5;
        const cy2 = -mhY + ny2 * cs + cs * 0.5;
        if (!bodyFitsAt(ms, cx2, cy2, offX, offY, R)) continue;
        if (!isPathClear(ms, lx, ly, cx2, cy2, offX, offY, R)) continue;
        bestD = nd; bx = nx2; by = ny2;
      }
    }
    if (bestD < 0) return 0;
    gx = bx; gy = by;
  }
  let n = 0;
  let prevDx = 0, prevDy = 0;
  let pXLo = -1e9, pXHi = 1e9, pYLo = -1e9, pYHi = 1e9;
  let pAx: number, pAy: number;
  {
    const c0 = clampNodeForBody(ms, gx, gy, offX, offY, R);
    if (c0.ok) {
      outPts[0] = c0.x; outPts[1] = c0.y;
      pXLo = _clampBand.xLo; pXHi = _clampBand.xHi;
      pYLo = _clampBand.yLo; pYHi = _clampBand.yHi;
    } else { outPts[0] = lx; outPts[1] = ly; }
    pAx = outPts[0]; pAy = outPts[1];
  }
  n++;
  let d = dist[gx * gcY + gy];
  while (d > 0 && n < maxCells) {
    let found = false, bdx = 0, bdy = 0;
    let bestDg = Infinity;
    const _dgOn = dangerN > 0 && dangerPX !== null && dangerPY !== null && dangerW !== null;
    const _dgInfl = _dgOn ? cs * AI_CONSTANTS.FLEE_LOOKAHEAD_INFL_CELLS : 0;
    const _dgCells = AI_CONSTANTS.FLEE_LOOKAHEAD_CELLS;
    for (let k = 0; k < 4; k++) {
      const ddx = _EPDX4[k], ddy = _EPDY4[k];
      const nx2 = gx + ddx, ny2 = gy + ddy;
      if (nx2 < 0 || nx2 >= gc || ny2 < 0 || ny2 >= gcY) continue;
      if (dist[nx2 * gcY + ny2] !== d - 1) continue;
      if (_dgOn) {
        let sc = 0;
        for (let step = 1; step <= _dgCells; step++) {
          const px2 = gx + ddx * step, py2 = gy + ddy * step;
          if (px2 < 0 || px2 >= gc || py2 < 0 || py2 >= gcY) break;
          if (dist[px2 * gcY + py2] === NAV_UNREACHABLE) break;
          const ccx = -mh + px2 * cs + cs * 0.5;
          const ccy = -mhY + py2 * cs + cs * 0.5;
          for (let i = 0; i < dangerN; i++) {
            const ex = dangerPX![i] - ccx, ey = dangerPY![i] - ccy;
            const dd = ex * ex + ey * ey;
            if (dd >= _dgInfl * _dgInfl) continue;
            sc += dangerW![i] * (1 - Math.sqrt(dd) / _dgInfl);
          }
        }
        if (!found || sc < bestDg - 1e-9) { found = true; bestDg = sc; bdx = ddx; bdy = ddy; }
        else if (sc <= bestDg + 1e-9 && ddx === prevDx && ddy === prevDy) { bestDg = sc; bdx = ddx; bdy = ddy; }
        continue;
      }
      if (!found) { found = true; bdx = ddx; bdy = ddy; }
      else if (ddx === prevDx && ddy === prevDy) { bdx = ddx; bdy = ddy; }
    }
    if (!found) break;
    const nc = clampNodeForBody(ms, gx + bdx, gy + bdy, offX, offY, R);
    if (!nc.ok) break;
    let ax = nc.x, ay = nc.y;
    if (bdx !== 0) {
      const lo = _clampBand.yLo > pYLo ? _clampBand.yLo : pYLo;
      const hi = _clampBand.yHi < pYHi ? _clampBand.yHi : pYHi;
      if (lo > hi) break;
      ay = ay < lo ? lo : ay > hi ? hi : ay;
    } else {
      const lo = _clampBand.xLo > pXLo ? _clampBand.xLo : pXLo;
      const hi = _clampBand.xHi < pXHi ? _clampBand.xHi : pXHi;
      if (lo > hi) break;
      ax = ax < lo ? lo : ax > hi ? hi : ax;
    }
    if (!bodyFitsAt(ms, ax, ay, offX, offY, R)) break;
    if (bdx !== 0 && ay !== pAy) {
      if (n + 2 > maxCells) break;
      const doorX = -mh + (gx + (bdx > 0 ? 1 : 0)) * cs;
      if (!bodyFitsAt(ms, doorX, ay, offX, offY, R)) break;
      outPts[n * 2] = doorX; outPts[n * 2 + 1] = ay; n++;
    } else if (bdy !== 0 && ax !== pAx) {
      if (n + 2 > maxCells) break;
      const doorY = -mhY + (gy + (bdy > 0 ? 1 : 0)) * cs;
      if (!bodyFitsAt(ms, ax, doorY, offX, offY, R)) break;
      outPts[n * 2] = ax; outPts[n * 2 + 1] = doorY; n++;
    }
    gx += bdx; gy += bdy;
    prevDx = bdx; prevDy = bdy;
    d = dist[gx * gcY + gy];
    outPts[n * 2] = ax;
    outPts[n * 2 + 1] = ay;
    n++;
    pXLo = _clampBand.xLo; pXHi = _clampBand.xHi;
    pYLo = _clampBand.yLo; pYHi = _clampBand.yHi;
    pAx = ax; pAy = ay;
  }
  return n;
}

export const BOSS_TIER = 3;

export const PACK_TARGET_PULL = 0.01;

export function tierOfLevel(level: number, powerCeiling: number): number {
  if (powerCeiling <= 0) return 0;
  if (level >= powerCeiling * (2 / 3)) return 2;
  if (level >= powerCeiling * (1 / 3)) return 1;
  return 0;
}

export function dreadTargetFor(gap: number, proximity01: number, courage: number): number {
  if (gap <= 0) return 0;
  const p = proximity01 < 0 ? 0 : proximity01 > 1 ? 1 : proximity01;
  const c = courage < 0 ? 0 : courage > 1 ? 1 : courage;
  const t = AI_CONSTANTS.DREAD_TARGET_PER_GAP * gap * (0.5 + 0.5 * p) * (1.5 - c);
  return t > 100 ? 100 : t;
}
