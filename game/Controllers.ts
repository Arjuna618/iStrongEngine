import { Bullet, ControlIO, BulletControllerData, BehaviorType, BehaviorConfig, FloatingPolygon, EnemyTank, AIBehavior } from '../types';
import { Vector } from '../utils/MathUtils';
import { ARRAS_PARITY } from './arrasCombat';
import { BLOCK_PUSH } from './blockSwitch';
import { SMALL_FIX } from './smallFixSwitch';

type _PatientFinder = (x: number, y: number, range: number, teamId: string, ownerId: string, behavior?: AIBehavior | null, group?: number, box?: number) => { id: string } | null;
let _healRescan: _PatientFinder | null = null;
let _lockIsAlly: ((id: string) => boolean) | null = null;
function _ctlOwnerBehaviorOf(bullet: Bullet): AIBehavior | null | undefined {
  return SMALL_FIX.BH04 !== 0 && bullet.ownerBehavior !== 'Neutral' ? bullet.ownerBehavior : undefined;
}
export function setHealLockHooks(rescan: _PatientFinder | null, isAlly: ((id: string) => boolean) | null): void {
  _healRescan = rescan; _lockIsAlly = isAlly;
}
import { OFFENSE_ARRAS } from './offenseSwitch';

const IDLE_ORBIT_POWER = 0.283;

export const MINION_PUSH_TICK = 0.6;
export const MINION_PUSH = { BUFFER: 2, SOFT: 1, SHAPE: 1 };
const MINION_STILL_DAMP_LN = -0.131;
let _arrasPerWorld = 1;
export function setMinionWorldScale(arrasUnitsPerWorldUnit: number): void { _arrasPerWorld = arrasUnitsPerWorldUnit; }
let _fsK = 0;
export function setControllersFixedStep(k: number): void { _fsK = k; }
export function minionKeep(top: number, dtFactor: number, push: number = MINION_PUSH_TICK): number {
  return top > 1e-6 ? Math.pow(1 + push / (2 * top), -dtFactor / 2) : Math.exp(MINION_STILL_DAMP_LN * dtFactor);
}
export function minionPushOf(b: Bullet): number { const d = b.controllerData; return d !== null && d.minionAccel > 0 ? d.minionAccel : MINION_PUSH_TICK; }
export const DRONE_ACCEL_TICK = 0.08;
export const DRONE_NEAR_RADII = 2;
export const DRONE_FRICTION_LN = -Math.log(1.05) / 2;
export function droneKeep(a: number, power: number, dtFactor: number): number {
  const s = a * power;
  return s <= 0 ? 1 : s >= 1 ? 0 : Math.pow(1 - s, dtFactor * 0.5);
}
export const DRONE_PUSH = { KICK: 2.15 };
export const SWARM_A = 6.5;

export function swarmSteerOf(b: Bullet): number { const d = b.controllerData; return d !== null && d.swarmSteer > 0 ? d.swarmSteer : SWARM_A; }
export function roundFaceShare(dtFactor: number): number { return 1 - Math.pow(0.75, dtFactor * 0.5); }
export const BLOCK_PUSH_TICK = 1.6;
export const BLOCK_CRUISE_SHARE = 0.5;
export const BLOCK_SETTLE_DIST = 0.5;
export const BLOCK_STILL = 0.1;
export function blockCruiseOf(b: Bullet): number { return b.initialSpeed * (b.topSpeedRatio > 0 ? b.topSpeedRatio : BLOCK_CRUISE_SHARE); }
export function blockRateOf(b: Bullet): number {
  const U = blockCruiseOf(b) * 2;
  return Math.log(1 + BLOCK_PUSH_TICK / Math.max(U - BLOCK_PUSH_TICK, BLOCK_PUSH_TICK * 0.25)) * 0.5;
}
export const BLOCK_BRAKE = 1.3;
export function blockBrakeRateOf(b: Bullet): number {
  const U = blockCruiseOf(b) * 2;
  return Math.log(1 + BLOCK_BRAKE * BLOCK_PUSH_TICK / Math.max(U - BLOCK_PUSH_TICK, BLOCK_PUSH_TICK * 0.25)) * 0.5;
}
function _blockSwitch(s0: number, U: number, L: number, Lb: number, d: number, t: number): number {
  const e = Math.exp(-L * t);
  return (U + (s0 - U) * e) / Lb + U * t + (s0 - U) * (1 - e) / L - d;
}
function _blockLaw(b: Bullet, io: ControlIO, h: number): void {
  const L = blockRateOf(b), Lb = blockBrakeRateOf(b), data = b.controllerData!;
  let ux = b.velocity.x, uy = b.velocity.y, dx = 0, dy = 0, pushed = 0;
  let coast = h;
  if (io.hasGoal && data.orbitTimer >= 0 && data.blockLetGo === 0) {
    const gx = io.goalX - b.position.x, gy = io.goalY - b.position.y, d = Math.sqrt(gx * gx + gy * gy);
    const U = blockCruiseOf(b);
    if (d > 1e-6 && U > 1e-9) {
      const nx = gx / d, ny = gy / d, s0 = ux * nx + uy * ny;
      let tau: number;
      if (s0 / Lb - d >= 0) tau = 0;
      else if (_blockSwitch(s0, U, L, Lb, d, h) < 0) tau = h;
      else { let lo = 0, hi = h; for (let it = 0; it < 16; it++) { const mid = (lo + hi) * 0.5; if (_blockSwitch(s0, U, L, Lb, d, mid) < 0) lo = mid; else hi = mid; } tau = lo; }
      if (tau > 0) {
        const e = Math.exp(-L * tau), Ux = U * nx, Uy = U * ny;
        dx += Ux * tau + (ux - Ux) * (1 - e) / L;
        dy += Uy * tau + (uy - Uy) * (1 - e) / L;
        ux = Ux + (ux - Ux) * e;
        uy = Uy + (uy - Uy) * e;
        pushed = tau / h;
        coast = h - tau;
      }
    }
  }
  if (coast > 0) {
    const Lc = data.blockLetGo === 2 || (BLOCK_PUSH.ON !== 0 && data.orbitTimer < 0) ? L : Lb;
    const e = Math.exp(-Lc * coast);
    dx += ux * (1 - e) / Lc;
    dy += uy * (1 - e) / Lc;
    ux *= e; uy *= e;
  }
  b.velocity.x = ux; b.velocity.y = uy;
  b._fsDispX = dx; b._fsDispY = dy; b._fsDisp = 1;
  b._spinPush = pushed * BLOCK_PUSH_TICK * 0.5;
}

let _chaseA = 0;
function _minionSizeFactor(ownerRadiusWorld: number): number {
  const rA = ownerRadiusWorld > 0 ? ownerRadiusWorld * _arrasPerWorld : 24;
  return Math.sqrt(rA / 12);
}


function _shapeAlignOffset(sides: number): number {
    if (sides === 3) return Math.PI * 0.5;
    if (sides === 4) return Math.PI * 0.25;
    return 0;
}

const SWARM_BLEND_RATE = 25 / 60;

const REF_HZ = 165;
const REF_FRAMES_PER_DT = REF_HZ / 60;

const _tempIO: ControlIO = {
  targetX: 0, targetY: 0,
  goalX: 0, goalY: 0,
  fire: false, alt: false, power: 1,
  hasTarget: false, hasGoal: false,
};

export function executeControllers(
  bullet: Bullet,
  data: BulletControllerData,
  dtFactor: number,
  mouseWorldX: number,
  mouseWorldY: number,
  mousePressed: boolean,
  mouseRightPressed: boolean,
  playerX: number,
  playerY: number,
  findNearestEnemy: (x: number, y: number, range: number, teamId: string, ownerId: string, behavior?: AIBehavior | null, group?: number, box?: number) => { x: number, y: number, vx: number, vy: number, id: string } | null,
  findNearestShape: (x: number, y: number, range: number, box?: number) => { x: number, y: number, id: string } | null,
  findEnemyById: (id: string) => { x: number, y: number, vx: number, vy: number, id: string } | null,
  findShapeById: (id: string) => { x: number, y: number, id: string } | null,
  autoOverride: boolean,
  gameNow: number,
  checkLOS: (x0: number, y0: number, x1: number, y1: number) => boolean,
  borderLoX: number,
  borderHiX: number,
  borderLoY: number,
  borderHiY: number,
  restReach: number = 0,
  ownerRadiusLive: number = 0,
  firingClock: number = NaN,
): void {
  _tempIO.targetX = 0;
  _tempIO.targetY = 0;
  _tempIO.goalX = 0;
  _tempIO.goalY = 0;
  _tempIO.fire = false;
  _tempIO.alt = false;
  _tempIO.power = 1;
  _tempIO.hasTarget = false;
  _tempIO.hasGoal = false;

  _tempIO.alt = mouseRightPressed;

  bullet.ownerX = playerX;
  bullet.ownerY = playerY;

  let _isIndependent = false;
  let _rests = false;
  for (let _ii = 0; _ii < data.behaviors.length; _ii++) {
    const _bt = data.behaviors[_ii];
    if (_bt === 'independentProjectile') _isIndependent = true;
    else if (_bt === 'hangNearOwner' || _bt === 'hangNearOwnerV2' || _bt === 'minionControl') _rests = true;
  }
  const _ownerReach = restReach > 0 && (bullet.motionType === 'minion' ? ARRAS_PARITY.MINION_REACH !== 0 : (_rests && ARRAS_PARITY.DRONE_REACH !== 0))
    ? restReach : 0;
  const _free = _isIndependent && ARRAS_PARITY.MARKER_FREES !== 0;
  if (_free) _tempIO.alt = false;
  _chaseA = 0;

  for (let i = 0; i < data.behaviors.length; i++) {
    const type = data.behaviors[i];
    const settings = data.settings[i];

    if (!settings.acceptsFromTop) {
      _tempIO.targetX = 0;
      _tempIO.targetY = 0;
      _tempIO.goalX = 0;
      _tempIO.goalY = 0;
      _tempIO.fire = false;
      _tempIO.alt = false;
      _tempIO.power = 1;
      _tempIO.hasTarget = false;
      _tempIO.hasGoal = false;
    }

    switch (type) {
      case 'followMouse':
        if (!_isIndependent) {
          controllerFollowMouse(bullet, data, settings, _tempIO, mouseWorldX, mouseWorldY, mousePressed);
        }
        break;
      case 'autoTargetEnemy':
        controllerAutoTargetEnemy(bullet, data, settings, _tempIO, dtFactor, findNearestEnemy, findNearestShape, findEnemyById, findShapeById,
          _isIndependent ? false : mousePressed, _isIndependent ? false : mouseRightPressed,
          (_isIndependent && ARRAS_PARITY.OVERRIDE_MARKED === 0) ? false : autoOverride, checkLOS, _ownerReach);
        break;
      case 'independentProjectile':
        break;
      case 'invisible':
        break;
      case 'alwaysInvisible':
        break;
      case 'reverseSpinOnAlt':
        break;
      case 'hangNearOwner':
        controllerHangNearOwner(bullet, data, settings, _tempIO, dtFactor, ownerRadiusLive);
        break;
      case 'motionChase':
        if (settings.chaseAccel !== undefined && settings.chaseAccel > 0) _chaseA = settings.chaseAccel;
        break;
      case 'hangNearOwnerV2':
        controllerHangNearOwnerV2(bullet, data, settings, _tempIO, dtFactor);
        break;
      case 'returnToOwner':
        controllerReturnToOwner(bullet, data, settings, _tempIO, dtFactor);
        break;
      case 'goToTarget':
        controllerGoToTarget(bullet, data, settings, _tempIO, mouseWorldX, mouseWorldY, borderLoX, borderHiX, borderLoY, borderHiY);
        break;
      case 'swarmAI':
        controllerSwarmAI(bullet, data, settings, _tempIO, dtFactor, findNearestEnemy, mousePressed);
        break;
      case 'patrolCircle':
        controllerPatrolCircle(bullet, data, settings, _tempIO, dtFactor);
        break;
      case 'fleeWhenDamaged':
        controllerFleeWhenDamaged(bullet, data, settings, _tempIO);
        break;
      case 'alwaysFire':
        controllerAlwaysFire(_tempIO);
        break;
      case 'spinContinuous':
        controllerSpinContinuous(bullet, data, settings, _tempIO, dtFactor);
        break;
      case 'minionControl':
        controllerMinionControl(bullet, data, settings, _tempIO, mouseWorldX, mouseWorldY, _free ? false : mousePressed, _free ? false : mouseRightPressed, dtFactor, ownerRadiusLive);
        break;
      case 'canRepel':
        break;
      case 'onlyAcceptInArc':
        controllerOnlyAcceptInArc(bullet, data, _tempIO);
        break;
      case 'targetSelf':
        controllerTargetSelf(bullet, _tempIO);
        break;
      case 'snake':
        controllerSnake(bullet, data, settings, dtFactor);
        break;
      case 'disableOnOverride':
        controllerDisableOnOverride(bullet, data, _tempIO, autoOverride);
        break;
      case 'scaleWithMaster':
        controllerScaleWithMaster(bullet, data, ownerRadiusLive);
        break;
      case 'stackGuns':
        controllerStackGuns(bullet, _tempIO, (SMALL_FIX.CC050 !== 0 && firingClock === firingClock) ? firingClock : gameNow);
        break;
      case 'mapAltToFire':
        controllerMapAltToFire(_tempIO);
        break;
      case 'accelerate':
        controllerAccelerate(bullet, data, settings, dtFactor);
        break;
    }
  }

  for (let _pi = 0; _pi < data.behaviors.length; _pi++) {
    if (data.behaviors[_pi] === 'canRepel') {
      controllerCanRepel(bullet, _tempIO);
      break;
    }
  }

  applyControllerOutput(bullet, _tempIO, dtFactor, borderLoX, borderHiX, borderLoY, borderHiY);
}

function applyControllerOutput(bullet: Bullet, io: ControlIO, dtFactor: number, borderLoX: number, borderHiX: number, borderLoY: number, borderHiY: number): void {
  const dtSeconds = dtFactor / 60;

  if (bullet.softCollisionTrap && bullet.motionType === 'motor' && ARRAS_PARITY.BLOCK_MOTION !== 0) {
    _blockLaw(bullet, io, dtFactor);
  } else if (bullet.motionType === 'minion' && ARRAS_PARITY.MINION_MOTION !== 0) {
    const top = bullet.initialSpeed * bullet.topSpeedRatio;
    const keep = minionKeep(top, dtFactor, minionPushOf(bullet));
    let tvx = 0, tvy = 0;
    if (io.hasGoal) {
      const gx = io.goalX - bullet.position.x, gy = io.goalY - bullet.position.y;
      const gd = Math.sqrt(gx * gx + gy * gy);
      if (gd > 0) { const s = top * io.power / gd; tvx = gx * s; tvy = gy * s; }
    }
    bullet.velocity.x = tvx + (bullet.velocity.x - tvx) * keep;
    bullet.velocity.y = tvy + (bullet.velocity.y - tvy) * keep;
    bullet._chaseMaxSpeed = 0;
  } else if (bullet.motionType === 'swarm' && ARRAS_PARITY.SWARM_MOTION !== 0) {
    const top = bullet.initialSpeed * bullet.topSpeedRatio;
    const keep = droneKeep(1 / (bullet._swarmTurning > 5 ? bullet._swarmTurning : 5), io.hasGoal ? io.power : 1, dtFactor);
    let ux = 0, uy = 0, have = false;
    if (io.hasGoal) {
      const gx = io.goalX - bullet.position.x, gy = io.goalY - bullet.position.y, gd = Math.sqrt(gx * gx + gy * gy);
      if (gd > bullet.size * 0.5) { ux = gx / gd; uy = gy / gd; have = true; }
    }
    if (!have) {
      const sp = Math.sqrt(bullet.velocity.x * bullet.velocity.x + bullet.velocity.y * bullet.velocity.y);
      if (sp > 1e-6 && sp < top) { ux = bullet.velocity.x / sp; uy = bullet.velocity.y / sp; have = true; }
    }
    if (have) {
      bullet.velocity.x = top * ux + (bullet.velocity.x - top * ux) * keep;
      bullet.velocity.y = top * uy + (bullet.velocity.y - top * uy) * keep;
    }
  } else if (bullet.motionType === 'chase' && ARRAS_PARITY.DRONE_MOTION !== 0) {
    let maxS = 0;
    if (io.hasGoal) {
      const gx = io.goalX - bullet.position.x, gy = io.goalY - bullet.position.y;
      const gd = Math.sqrt(gx * gx + gy * gy);
      if (gd > bullet.size * 0.5 * DRONE_NEAR_RADII) {
        const top = bullet.initialSpeed * bullet.topSpeedRatio;
        const keep = droneKeep(_chaseA > 0 ? _chaseA : DRONE_ACCEL_TICK, io.power, dtFactor);
        const s = top / gd, tvx = gx * s, tvy = gy * s;
        bullet.velocity.x = tvx + (bullet.velocity.x - tvx) * keep;
        bullet.velocity.y = tvy + (bullet.velocity.y - tvy) * keep;
        maxS = top;
      }
    }
    bullet._chaseMaxSpeed = SMALL_FIX.R766B !== 0 && maxS < 0 ? -maxS : maxS;
  } else if (io.hasGoal) {
    const dx = io.goalX - bullet.position.x;
    const dy = io.goalY - bullet.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 1) {
      if (bullet.softCollisionTrap) {
        const _bR = bullet.size * 0.5;
        const _pastBorder =
          bullet.position.x < borderLoX + _bR || bullet.position.x > borderHiX - _bR ||
          bullet.position.y < borderLoY + _bR || bullet.position.y > borderHiY - _bR;
        if (_pastBorder) {
          bullet._borderTouched = true;
        } else if (bullet._borderTouched) {
          bullet.controllerData!.orbitTimer = -1;
          bullet._borderTouched = false;
        } else {
          const speed = Math.sqrt(bullet.velocity.x * bullet.velocity.x + bullet.velocity.y * bullet.velocity.y);
          if (speed > 0.01) {
            const goalAngle = Math.atan2(dy, dx);
            const curAngle = Math.atan2(bullet.velocity.y, bullet.velocity.x);
            let diff = goalAngle - curAngle;
            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;
            const maxTurn = 8 * dtFactor / 60;
            const turn = diff > 0 ? Math.min(diff, maxTurn) : Math.max(diff, -maxTurn);
            const newAngle = curAngle + turn;
            bullet.velocity.x = Math.cos(newAngle) * speed * io.power;
            bullet.velocity.y = Math.sin(newAngle) * speed * io.power;
          }
        }
      } else if (bullet.motionType === 'chase') {
        const deadZone = bullet.size * 0.5;
        if (dist > deadZone) {
          const topSpeed = bullet.initialSpeed * bullet.topSpeedRatio * io.power;
          bullet._chaseMaxSpeed = SMALL_FIX.R766B !== 0 && topSpeed < 0 ? -topSpeed : topSpeed;
          const invDist = 1 / dist;
          const desiredVx = topSpeed * dx * invDist;
          const desiredVy = topSpeed * dy * invDist;
          const accelFactor = _fsK > 0 ? 1 - Math.pow(1 - 0.053 * (60 / 200), _fsK) : 0.053 * dtFactor;
          bullet.velocity.x += (desiredVx - bullet.velocity.x) * accelFactor;
          bullet.velocity.y += (desiredVy - bullet.velocity.y) * accelFactor;
        } else {
          bullet._chaseMaxSpeed = 0;
        }
      } else if (bullet.motionType === 'minion') {
        const accel = bullet.initialSpeed * bullet.topSpeedRatio * 0.140 * dtFactor;
        bullet._chaseMaxSpeed = 0;
        if (dist > 0.01) {
          const invDist = 1 / dist;
          bullet.velocity.x += accel * dx * invDist * io.power;
          bullet.velocity.y += accel * dy * invDist * io.power;
        }
      } else if (bullet.motionType === 'swarm') {
        const topSpeed = bullet.initialSpeed * bullet.topSpeedRatio * io.power;
        const invDist = 1 / dist;
        const desiredVx = topSpeed * dx * invDist;
        const desiredVy = topSpeed * dy * invDist;
        const turning = bullet._swarmTurning > 0 ? bullet._swarmTurning : 5;
        const blend = _fsK > 0
          ? 1 - Math.pow(1 - Math.min(1, SWARM_BLEND_RATE / turning * (60 / 200)), _fsK)
          : SWARM_BLEND_RATE / turning * dtFactor;
        bullet.velocity.x += (desiredVx - bullet.velocity.x) * blend;
        bullet.velocity.y += (desiredVy - bullet.velocity.y) * blend;
      } else if (bullet._chaseMaxSpeed < 0) {
        const tsr = bullet.topSpeedRatio > 0 ? bullet.topSpeedRatio : 1.0;
        const damp = bullet._motorDampLn;
        const accelFactor = damp < -0.001 ? Math.exp(-damp) - 1 : 0.140;
        let accel = bullet.initialSpeed * tsr * accelFactor * dtFactor;
        if (_fsK > 0 && damp < -0.001) {
          const q = Math.exp(damp * (60 / 200)), qk = Math.exp(damp * dtFactor);
          let px = 0, py = 0;
          if (dist > 0.01) { const s = bullet.initialSpeed * tsr * accelFactor * (60 / 200) * io.power / dist; px = dx * s; py = dy * s; }
          const k = dtFactor / (60 / 200), g = (1 - qk) / (1 - q), vsx = q * px / (1 - q), vsy = q * py / (1 - q);
          bullet._fsDispX = (60 / 200) * (k * (vsx + px) + (bullet.velocity.x - vsx) * g);
          bullet._fsDispY = (60 / 200) * (k * (vsy + py) + (bullet.velocity.y - vsy) * g);
          bullet._fsDisp = 1;
          accel = bullet.initialSpeed * tsr * accelFactor * (60 / 200) * q * (1 - qk) / ((1 - q) * qk);
        }
        if (dist > 0.01) {
          const invDist = 1 / dist;
          bullet.velocity.x += accel * dx * invDist * io.power;
          bullet.velocity.y += accel * dy * invDist * io.power;
        }
        bullet._spinPush = damp < -0.001 ? bullet.initialSpeed * tsr * (1 - Math.exp(2 * damp)) * io.power : 0;
      } else {
        const speed = bullet.velocity.mag();
        const desiredSpeed = Math.max(speed, 2) * io.power;
        const goalAngle = Math.atan2(dy, dx);

        const currentAngle = Math.atan2(bullet.velocity.y, bullet.velocity.x);
        let angleDiff = goalAngle - currentAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

        const maxTurn = 6 * dtSeconds;
        const turnAmount = Math.max(-maxTurn, Math.min(maxTurn, angleDiff));
        const newAngle = currentAngle + turnAmount;

        bullet.velocity.x = Math.cos(newAngle) * desiredSpeed;
        bullet.velocity.y = Math.sin(newAngle) * desiredSpeed;
      }
    }
  }

  if (!io.hasGoal && (bullet.motionType === 'chase' || bullet.motionType === 'minion')) {
    bullet._chaseMaxSpeed = 0;
  }

  if (!io.hasGoal && bullet.motionType === 'swarm' && ARRAS_PARITY.SWARM_MOTION === 0) {
    const spd = Math.sqrt(bullet.velocity.x * bullet.velocity.x + bullet.velocity.y * bullet.velocity.y);
    if (spd > 0.01) {
      const boost = 0.0025 * dtFactor;
      bullet.velocity.x += bullet.velocity.x * boost;
      bullet.velocity.y += bullet.velocity.y * boost;
    }
  }

  if (io.hasTarget) {
    if ((bullet.shapeSides === 3 || bullet.shapeSides === 4) && !bullet.hasExitedMuzzle) {
    } else {
      const targetFacing = Math.atan2(
        io.targetY - bullet.position.y,
        io.targetX - bullet.position.x
      );
      const adjustedFacing = targetFacing + _shapeAlignOffset(bullet.shapeSides);

      if (bullet.facingType === 'smoothToTarget') {
        let diff = adjustedFacing - bullet.facingAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (ARRAS_PARITY.ROUND_FACE !== 0) bullet.facingAngle += diff * roundFaceShare(dtFactor);
        else { const blend = bullet.motionType === 'minion' ? 0.06 : 0.156; bullet.facingAngle += diff * blend * dtFactor; }
      } else if (bullet.facingType === 'locksFacing') {
      } else {
        bullet.facingAngle = adjustedFacing;
      }
    }
  }

  if (!io.hasTarget && (bullet.motionType === 'chase' || bullet.motionType === 'minion')) {
    const vSq = bullet.velocity.x * bullet.velocity.x + bullet.velocity.y * bullet.velocity.y;
    if (vSq > 0.01) {
      const velAngle = Math.atan2(bullet.velocity.y, bullet.velocity.x);
      const targetFacing = velAngle + _shapeAlignOffset(bullet.shapeSides);
      let diff = targetFacing - bullet.facingAngle;
      if (diff > Math.PI) diff -= Math.PI * 2;
      else if (diff < -Math.PI) diff += Math.PI * 2;
      if (ARRAS_PARITY.ROUND_FACE !== 0) bullet.facingAngle += diff * roundFaceShare(dtFactor);
      else { const fallbackBlend = bullet.motionType === 'minion' ? 0.06 : 0.156; bullet.facingAngle += diff * fallbackBlend * dtFactor; }
    }
  }

  bullet.controllerFire = io.fire;
  bullet.controllerHasTarget = io.hasTarget;
  if (io.hasTarget) {
    bullet.controllerTargetX = io.targetX;
    bullet.controllerTargetY = io.targetY;
  }

  if (bullet.motionType === 'minion') {
    const aimTarget = io.hasTarget
      ? Math.atan2(io.targetY - bullet.position.y, io.targetX - bullet.position.x)
      : Math.atan2(bullet.velocity.y, bullet.velocity.x);
    let aimDiff = aimTarget - bullet.visualAimAngle;
    while (aimDiff > Math.PI) aimDiff -= Math.PI * 2;
    while (aimDiff < -Math.PI) aimDiff += Math.PI * 2;
    bullet.visualAimAngle += aimDiff * (ARRAS_PARITY.ROUND_FACE !== 0 ? roundFaceShare(dtFactor) : 0.15 * dtFactor);
  }
}

function controllerFollowMouse(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO, mouseWorldX: number, mouseWorldY: number, mousePressed: boolean
): void {
  if (bullet.motionType === 'chase' && !io.hasTarget) {
    io.targetX = mouseWorldX;
    io.targetY = mouseWorldY;
    io.hasTarget = true;
  }

  if (mousePressed || io.alt) {
    if (settings.responseLag <= 0) {
      io.goalX = mouseWorldX;
      io.goalY = mouseWorldY;
    } else {
      let lag = 1 - Math.min(settings.responseLag * 10, 0.95);
      if (_fsK > 0) lag = 1 - Math.pow(1 - lag, _fsK);
      if (SMALL_FIX.CC017 !== 0) {
        if (data.lagX !== data.lagX) { data.lagX = data.lastMouseX; data.lagY = data.lastMouseY; }
        data.lagX += (mouseWorldX - data.lagX) * lag;
        data.lagY += (mouseWorldY - data.lagY) * lag;
        io.goalX = data.lagX;
        io.goalY = data.lagY;
      } else {
        data.lastMouseX += (mouseWorldX - data.lastMouseX) * lag;
        data.lastMouseY += (mouseWorldY - data.lastMouseY) * lag;
        io.goalX = data.lastMouseX;
        io.goalY = data.lastMouseY;
      }
    }
    io.hasGoal = true;
    io.power = 1;

    io.targetX = io.goalX;
    io.targetY = io.goalY;
    io.hasTarget = true;

    if (io.alt) {
      io.goalX = bullet.position.x - (io.goalX - bullet.position.x);
      io.goalY = bullet.position.y - (io.goalY - bullet.position.y);
    }
  }
}

function _onOwnerGround(tx: number, ty: number, ox: number, oy: number, range: number, box: number): boolean {
  const dx = tx - ox, dy = ty - oy;
  if (box > 0) return Math.abs(dx) < box && Math.abs(dy) < box;
  return dx * dx + dy * dy < range * range;
}

function controllerAutoTargetEnemy(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO, dtFactor: number,
  findEnemy: (x: number, y: number, range: number, teamId: string, ownerId: string, behavior?: AIBehavior | null, group?: number, box?: number) => { x: number, y: number, vx: number, vy: number, id: string } | null,
  findShape: (x: number, y: number, range: number, box?: number) => { x: number, y: number, id: string } | null,
  findEnemyById: (id: string) => { x: number, y: number, vx: number, vy: number, id: string } | null,
  findShapeById: (id: string) => { x: number, y: number, id: string } | null,
  mousePressed: boolean, mouseRightPressed: boolean,
  autoOverride: boolean,
  checkLOS: (x0: number, y0: number, x1: number, y1: number) => boolean,
  ownerReach: number = 0,
): void {
  if (mousePressed || mouseRightPressed || autoOverride) {
    data.targetEntityId = null;
    return;
  }

  const owned = ownerReach > 0;
  const range = settings.targetRange > 0 ? settings.targetRange : (owned ? ownerReach : 600);
  const box = owned && !(settings.targetRange > 0) ? range : 0;
  const queryRange = box > 0 ? range * Math.SQRT2 : range;
  const rangeSq = range * range;
  const hysteresisRangeSq = rangeSq * 1.44;

  const isMinion = bullet.motionType === 'minion';
  const searchX = (isMinion || owned) ? bullet.ownerX : bullet.position.x;
  const searchY = (isMinion || owned) ? bullet.ownerY : bullet.position.y;

  if (data.targetEntityId && !data.lastTargetIsShape) {
    const current = findEnemyById(data.targetEntityId);
    if (current && SMALL_FIX.CC048 !== 0 && bullet.healer === true && _healRescan !== null && _lockIsAlly !== null && !_lockIsAlly(current.id)) {
      data.targetLockTick += dtFactor * REF_FRAMES_PER_DT;
      if (data.targetLockTick > 30) {
        data.targetLockTick = 0;
        if (_healRescan(searchX, searchY, queryRange, bullet.team, bullet.ownerId, undefined, bullet.groupId, box) !== null) data.targetEntityId = null;
      }
    }
    if (current && data.targetEntityId !== null) {
      const cdx = current.x - bullet.position.x;
      const cdy = current.y - bullet.position.y;
      const cdistSq = cdx * cdx + cdy * cdy;
      if ((owned ? _onOwnerGround(current.x, current.y, bullet.ownerX, bullet.ownerY, range, box) : cdistSq < hysteresisRangeSq)
          && checkLOS(bullet.position.x, bullet.position.y, current.x, current.y)) {
        data.lastTargetX = current.x;
        data.lastTargetY = current.y;
        data.lastTargetVX = current.vx;
        data.lastTargetVY = current.vy;

        const predFactor = settings.predictionStrength / 100;
        const dist = Math.sqrt(cdistSq);
        const bulletSpeed = data.configuredBulletSpeed > 0 ? data.configuredBulletSpeed : 5;
        const timeToImpact = dist / bulletSpeed;
        const leadTime = timeToImpact * predFactor;

        io.targetX = current.x + current.vx * leadTime;
        io.targetY = current.y + current.vy * leadTime;
        io.hasTarget = true;
        io.fire = true;
        io.goalX = io.targetX;
        io.goalY = io.targetY;
        io.hasGoal = true;
        return;
      }
    }
    data.targetEntityId = null;
  }

  if (data.targetEntityId && data.lastTargetIsShape) {
    const currentShape = findShapeById(data.targetEntityId);
    if (!currentShape) {
      data.targetEntityId = null;
    } else {
      const sdx = currentShape.x - bullet.position.x;
      const sdy = currentShape.y - bullet.position.y;
      const sdistSq = sdx * sdx + sdy * sdy;
      if ((owned ? !_onOwnerGround(currentShape.x, currentShape.y, bullet.ownerX, bullet.ownerY, range, box) : sdistSq >= hysteresisRangeSq)
          || !checkLOS(bullet.position.x, bullet.position.y, currentShape.x, currentShape.y)) {
        data.targetEntityId = null;
      } else {
        data.lastTargetX = currentShape.x;
        data.lastTargetY = currentShape.y;

        data.targetLockTick += dtFactor * REF_FRAMES_PER_DT;
        if (data.targetLockTick > 30) {
          data.targetLockTick = 0;
          const enemy = findEnemy(searchX, searchY, queryRange, bullet.team, bullet.ownerId, _ctlOwnerBehaviorOf(bullet), bullet.groupId, box);
          if (enemy) {
            data.targetEntityId = enemy.id;
            data.lastTargetX = enemy.x;
            data.lastTargetY = enemy.y;
            data.lastTargetVX = enemy.vx;
            data.lastTargetVY = enemy.vy;
            data.lastTargetIsShape = false;

            const predFactor = settings.predictionStrength / 100;
            const dx = enemy.x - bullet.position.x;
            const dy = enemy.y - bullet.position.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const bulletSpeed = data.configuredBulletSpeed > 0 ? data.configuredBulletSpeed : (bullet.velocity.mag() || 5);
            const timeToImpact = dist / bulletSpeed;
            const leadTime = timeToImpact * predFactor;

            io.targetX = enemy.x + enemy.vx * leadTime;
            io.targetY = enemy.y + enemy.vy * leadTime;
            io.hasTarget = true;
            io.fire = true;
            io.goalX = io.targetX;
            io.goalY = io.targetY;
            io.hasGoal = true;
            return;
          }
        }

        io.targetX = currentShape.x;
        io.targetY = currentShape.y;
        io.hasTarget = true;
        io.fire = true;
        io.goalX = currentShape.x;
        io.goalY = currentShape.y;
        io.hasGoal = true;
        return;
      }
    }
  }

  data.targetLockTick += dtFactor * REF_FRAMES_PER_DT;
  if (data.targetLockTick > 15 || !data.targetEntityId) {
    data.targetLockTick = 0;

    const enemy = findEnemy(searchX, searchY, queryRange, bullet.team, bullet.ownerId, _ctlOwnerBehaviorOf(bullet), bullet.groupId, box);
    if (enemy) {
      if (OFFENSE_ARRAS.ROUND_ARC_ALL === 0 && data.firingArc > 0 && data.firingArc < 360) {
        const targetAngle = Math.atan2(enemy.y - bullet.position.y, enemy.x - bullet.position.x);
        let angleDiff = targetAngle - bullet.facingAngle;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        const arcHalf = (data.firingArc * Math.PI / 180) / 2;
        if (Math.abs(angleDiff) > arcHalf) {
          data.targetEntityId = null;
          return;
        }
      }

      data.targetEntityId = enemy.id;
      data.lastTargetX = enemy.x;
      data.lastTargetY = enemy.y;
      data.lastTargetVX = enemy.vx;
      data.lastTargetVY = enemy.vy;
      data.lastTargetIsShape = false;

      const predFactor = settings.predictionStrength / 100;
      const dx = enemy.x - bullet.position.x;
      const dy = enemy.y - bullet.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const bulletSpeed = data.configuredBulletSpeed > 0 ? data.configuredBulletSpeed : (bullet.velocity.mag() || 5);
      const timeToImpact = dist / bulletSpeed;
      const leadTime = timeToImpact * predFactor;

      io.targetX = enemy.x + enemy.vx * leadTime;
      io.targetY = enemy.y + enemy.vy * leadTime;
      io.hasTarget = true;
      io.fire = true;
      io.goalX = io.targetX;
      io.goalY = io.targetY;
      io.hasGoal = true;
    } else {
      const shape = findShape(searchX, searchY, queryRange, box);
      if (shape) {
        data.targetEntityId = shape.id;
        data.lastTargetX = shape.x;
        data.lastTargetY = shape.y;
        data.lastTargetVX = 0;
        data.lastTargetVY = 0;
        data.lastTargetIsShape = true;

        io.targetX = shape.x;
        io.targetY = shape.y;
        io.hasTarget = true;
        io.fire = true;
        io.goalX = shape.x;
        io.goalY = shape.y;
        io.hasGoal = true;
      } else {
        data.targetEntityId = null;
      }
    }
  }
}

function controllerHangNearOwner(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO, dtFactor: number, ownerRadiusLive: number = 0
): void {
  if (io.hasGoal) return;
  if (bullet._invisEnabled) { io.power = 0; return; }

  const ownerX = bullet.ownerX;
  const ownerY = bullet.ownerY;
  if (ARRAS_PARITY.DRONE_MOTION !== 0 && bullet.motionType === 'chase') {
    const aw = _arrasPerWorld > 0 ? _arrasPerWorld : 1;
    const R0 = ownerRadiusLive > 0 ? ownerRadiusLive : data.ownerSize * 0.5;
    const b1 = 24 / aw + R0 + bullet.size * 0.5;
    const b2 = 45 / aw + R0 + bullet.size * 0.5;
    const ddx = bullet.position.x - ownerX, ddy = bullet.position.y - ownerY;
    const dist = Math.sqrt(ddx * ddx + ddy * ddy) + (Math.PI / 8) / aw;
    if ((data.currentGoalX === 0 && data.currentGoalY === 0) || dist > b2 || data.orbitTimer > 30) {
      data.orbitTimer = 0;
      const dir = ddx * ddx + ddy * ddy > 0.01 ? Math.atan2(-ddy, -ddx) : Math.random() * Math.PI * 2;
      const ang = dir + Math.random() * 0.5 * Math.PI;
      const len = b1 + Math.random() * (b2 - b1);
      data.currentGoalX = ownerX - len * Math.cos(ang);
      data.currentGoalY = ownerY - len * Math.sin(ang);
    }
    io.goalX = data.currentGoalX;
    io.goalY = data.currentGoalY;
    io.hasGoal = true;
    if (dist < b2) {
      io.power = 0.15;
      if (Math.random() < 0.3 * dtFactor * 0.5) data.orbitTimer++;
    }
    io.targetX = bullet.position.x + bullet.velocity.x;
    io.targetY = bullet.position.y + bullet.velocity.y;
    io.hasTarget = true;
    return;
  }
  const orbitDist = 30;
  const ownerRadius = data.ownerSize * 0.5;
  const bound1 = orbitDist * 0.8 + ownerRadius + bullet.size;
  const bound2 = orbitDist * 1.5 + ownerRadius + bullet.size;

  const dx = bullet.position.x - ownerX;
  const dy = bullet.position.y - ownerY;
  const dist = Math.sqrt(dx * dx + dy * dy) + 0.3927;
  if ((ARRAS_PARITY.DRONE_MOTION !== 0 && data.currentGoalX === 0 && data.currentGoalY === 0) || dist > bound2 || data.orbitTimer > 30) {
    data.orbitTimer = 0;
    const dir = dx * dx + dy * dy > 0.01 ? Math.atan2(-dy, -dx) : Math.random() * Math.PI * 2;
    const offsetAngle = dir + Math.random() * 0.5 * Math.PI;
    const len = bound1 + Math.random() * (bound2 - bound1);
    data.currentGoalX = ownerX - len * Math.cos(offsetAngle);
    data.currentGoalY = ownerY - len * Math.sin(offsetAngle);
  }

  io.goalX = data.currentGoalX;
  io.goalY = data.currentGoalY;
  io.hasGoal = true;

  if (dist < bound2) {
    io.power = ARRAS_PARITY.DRONE_SPEED !== 0 ? IDLE_ORBIT_POWER : 0.7;
    if (Math.random() < 0.3 * dtFactor * REF_FRAMES_PER_DT) {
      data.orbitTimer++;
    }
  }
  io.targetX = bullet.position.x + bullet.velocity.x;
  io.targetY = bullet.position.y + bullet.velocity.y;
  io.hasTarget = true;
}

function controllerHangNearOwnerV2(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO, dtFactor: number
): void {
  if (io.hasGoal) return;
  if (bullet._invisEnabled) { io.power = 0; return; }

  const ownerX = bullet.ownerX;
  const ownerY = bullet.ownerY;
  const orbitDist = settings.orbitRadius;
  const ownerRadius = data.ownerSize * 0.5;
  const bound1 = orbitDist * 0.8 + ownerRadius + bullet.size;
  const bound2 = orbitDist * 1.5 + ownerRadius + bullet.size;

  const dx = bullet.position.x - ownerX;
  const dy = bullet.position.y - ownerY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const gdx = data.currentGoalX - bullet.position.x;
  const gdy = data.currentGoalY - bullet.position.y;
  const goalDistSq = gdx * gdx + gdy * gdy;
  const needNewGoal = goalDistSq < 400 || (data.currentGoalX === 0 && data.currentGoalY === 0);

  if (needNewGoal || dist > bound2 * 1.5) {
    const baseAngle = dist > 0.01 ? Math.atan2(dy, dx) : Math.random() * Math.PI * 2;
    const offsetAngle = baseAngle + (Math.random() - 0.5) * Math.PI * 1.2;
    const len = bound1 + Math.random() * (bound2 - bound1);
    data.currentGoalX = ownerX + len * Math.cos(offsetAngle);
    data.currentGoalY = ownerY + len * Math.sin(offsetAngle);
  }

  io.goalX = data.currentGoalX;
  io.goalY = data.currentGoalY;
  io.hasGoal = true;

  const goalDist = Math.sqrt(goalDistSq);
  const halfBound = bound1 * 0.5;
  io.power = goalDist < halfBound ? Math.max(0.15, goalDist / halfBound) : 1.0;

  io.targetX = bullet.position.x + bullet.velocity.x;
  io.targetY = bullet.position.y + bullet.velocity.y;
  io.hasTarget = true;
}


function controllerReturnToOwner(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO, dtFactor: number
): void {
  if (!data.isReturning) {
    if (bullet.maxAge > 0 && bullet.currentAge >= bullet.maxAge * 0.5) {
      data.isReturning = true;
    }
  }

  if (data.isReturning) {
    io.goalX = bullet.ownerX;
    io.goalY = bullet.ownerY;
    io.hasGoal = true;
    io.power = 1;
    if (ARRAS_PARITY.BOOMERANG_RIDE === 0) {
      const dx = bullet.position.x - bullet.ownerX;
      const dy = bullet.position.y - bullet.ownerY;
      if (dx * dx + dy * dy < 900) {
        bullet.isFading = true;
      }
    }
  } else {
    io.goalX = data.throwGoalX;
    io.goalY = data.throwGoalY;
    io.hasGoal = true;
    io.power = 1;
  }
}

const GO_TO_TARGET_MIN_DIST = 75;

function controllerGoToTarget(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO, mouseWorldX: number, mouseWorldY: number,
  borderLoX: number, borderHiX: number, borderLoY: number, borderHiY: number
): void {
  if (data.currentGoalX === 0 && data.currentGoalY === 0) {
    data.currentGoalX = mouseWorldX;
    data.currentGoalY = mouseWorldY;
  }

  if (data.orbitTimer < 0) return;
  if (bullet.softCollisionTrap && bullet.motionType === 'motor' && ARRAS_PARITY.BLOCK_MOTION !== 0) {
    io.goalX = data.currentGoalX;
    io.goalY = data.currentGoalY;
    io.hasGoal = true;
    if (BLOCK_PUSH.ON !== 0 && data.blockLetGo === 0 && bullet.currentAge >= BLOCK_PUSH.HOLD_S) data.blockLetGo = 2;
    const sx = bullet.velocity.x, sy = bullet.velocity.y;
    if (sx * sx + sy * sy < BLOCK_STILL * BLOCK_STILL) {
      const ex = data.currentGoalX - bullet.position.x, ey = data.currentGoalY - bullet.position.y;
      if (data.blockLetGo !== 0 || (ex * ex + ey * ey < BLOCK_SETTLE_DIST * BLOCK_SETTLE_DIST && (BLOCK_PUSH.ON === 0 || data.blockTouch === 0))) data.orbitTimer = -1;
    }
    data.blockTouch = 0;
    return;
  }

  if (bullet.softCollisionTrap && bullet.distanceTraveled < GO_TO_TARGET_MIN_DIST) {
    return;
  }

  const dx = data.currentGoalX - bullet.position.x;
  const dy = data.currentGoalY - bullet.position.y;
  const distSq = dx * dx + dy * dy;
  const dist = Math.sqrt(distSq);

  if (bullet.softCollisionTrap && data.initialGoalDist === 0) {
    data.initialGoalDist = dist;

    const speed = Math.sqrt(
      bullet.velocity.x * bullet.velocity.x +
      bullet.velocity.y * bullet.velocity.y
    );

    if (speed > 0.01) {
      const goalDirX = dx / dist;
      const goalDirY = dy / dist;

      const alignment = (bullet.velocity.x * goalDirX + bullet.velocity.y * goalDirY) / speed;

      const projectedSpeed = speed * Math.max(0, alignment);
      const minSpeed = Math.min(dist * 0.15, speed * 0.35);
      const redirectSpeed = Math.max(projectedSpeed, minSpeed);

      bullet.velocity.x = goalDirX * redirectSpeed;
      bullet.velocity.y = goalDirY * redirectSpeed;
    }
  }

  if (dist < 3) {
    data.orbitTimer = -1;
    bullet.position.x = data.currentGoalX;
    bullet.position.y = data.currentGoalY;
    bullet.velocity.x = 0;
    bullet.velocity.y = 0;
    return;
  }

  io.goalX = data.currentGoalX;
  io.goalY = data.currentGoalY;
  io.hasGoal = true;

  const speed = Math.sqrt(bullet.velocity.x * bullet.velocity.x + bullet.velocity.y * bullet.velocity.y);
  const maxSpeed = dist * 0.15;
  if (speed > maxSpeed && speed > 0.1) {
    const scale = maxSpeed / speed;
    bullet.velocity.x *= scale;
    bullet.velocity.y *= scale;
  }

  if (bullet.softCollisionTrap && dist > 5) {
    const _fR = bullet.size * 0.5;
    const _floorPastBorder =
      bullet.position.x < borderLoX + _fR || bullet.position.x > borderHiX - _fR ||
      bullet.position.y < borderLoY + _fR || bullet.position.y > borderHiY - _fR;
    if (!_floorPastBorder && !bullet._borderTouched) {
      const minSpeed = Math.min(dist * 0.03, bullet.initialSpeed);
      const postCapSpeedSq = bullet.velocity.x * bullet.velocity.x + bullet.velocity.y * bullet.velocity.y;
      if (postCapSpeedSq < minSpeed * minSpeed) {
        if (postCapSpeedSq > 0.0001) {
          const restore = minSpeed / Math.sqrt(postCapSpeedSq);
          bullet.velocity.x *= restore;
          bullet.velocity.y *= restore;
        } else {
          const invDist = 1 / dist;
          bullet.velocity.x = dx * invDist * minSpeed;
          bullet.velocity.y = dy * invDist * minSpeed;
        }
      }
    }
  }
}

function controllerSwarmAI(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO, dtFactor: number,
  findEnemy: (x: number, y: number, range: number, teamId: string, ownerId: string, behavior?: AIBehavior | null, group?: number) => { x: number, y: number, vx: number, vy: number, id: string } | null,
  mousePressed: boolean,
): void {
  if (mousePressed) return;
  if (io.hasGoal) return;
}

function controllerPatrolCircle(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO, dtFactor: number
): void {
  data.pathTimer -= _fsK > 0 ? _fsK : 1;
  while (data.pathTimer <= 0) {
    data.pathTimer += 5;
    data.currentGoalX = bullet.position.x + 10 * Math.cos(data.pathAngle);
    data.currentGoalY = bullet.position.y + 10 * Math.sin(data.pathAngle);

    const speed = bullet.velocity.mag();
    data.pathAngle -= (speed / 90) * Math.PI / 60;
  }

  io.goalX = data.currentGoalX;
  io.goalY = data.currentGoalY;
  io.hasGoal = true;
  io.power = 0.2;
}

function controllerFleeWhenDamaged(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO
): void {
  if (bullet.health < bullet.maxHealth * 0.7 && io.hasTarget) {
    io.goalX = bullet.position.x - (io.targetX - bullet.position.x);
    io.goalY = bullet.position.y - (io.targetY - bullet.position.y);
    io.hasGoal = true;
  }
}

function controllerAlwaysFire(io: ControlIO): void {
  io.fire = true;
}

function controllerSpinContinuous(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO, dtFactor: number
): void {
  const dtSeconds = dtFactor / 60;
  data.spinAngle += (settings.spinSpeed || 3) * bullet._spinSign * dtSeconds;

  io.targetX = bullet.position.x + Math.cos(data.spinAngle);
  io.targetY = bullet.position.y + Math.sin(data.spinAngle);
  io.hasTarget = true;
  io.fire = true;
}

function controllerMinionControl(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig,
  io: ControlIO, mouseWorldX: number, mouseWorldY: number,
  mousePressed: boolean, mouseRightPressed: boolean, dtFactor: number,
  ownerRadiusLive: number = 0,
): void {
  const targetDx = mouseWorldX - bullet.position.x;
  const targetDy = mouseWorldY - bullet.position.y;
  const targetDist = Math.sqrt(targetDx * targetDx + targetDy * targetDy);

  const _law = ARRAS_PARITY.MINION_MOTION !== 0;
  const _ownerR = _law ? (ownerRadiusLive > 0 ? ownerRadiusLive : data.ownerSize * 0.5) : 0;
  const sizeFactor = _law ? _minionSizeFactor(_ownerR) : (data.ownerSize > 0 ? Math.sqrt(data.ownerSize / 95) : 1);
  const toWorld = _law ? 1 / _arrasPerWorld : 1;
  const band = _law ? bullet.size : bullet.size * 2;

  if (mouseRightPressed) {
    const leashRange = 82 * sizeFactor * toWorld;
    const repelRange = 142 * sizeFactor * toWorld;

    if (targetDist < leashRange) {
      io.goalX = bullet.position.x + targetDx;
      io.goalY = bullet.position.y + targetDy;
    } else if (targetDist < repelRange) {
      const dir = -data.turnwise * Math.atan2(targetDy, targetDx) + Math.PI / 5;
      io.goalX = bullet.position.x + Math.cos(dir);
      io.goalY = bullet.position.y + Math.sin(dir);
    } else {
      io.goalX = bullet.position.x - targetDx;
      io.goalY = bullet.position.y - targetDy;
    }
    io.hasGoal = true;
    io.fire = true;
  } else if (mousePressed) {
    const orbitRadius = (settings.orbitRadius ?? 140) * sizeFactor * toWorld;
    const dir = data.turnwise * Math.atan2(targetDy, targetDx) + 0.01;
    io.goalX = mouseWorldX - orbitRadius * Math.cos(dir);
    io.goalY = mouseWorldY - orbitRadius * Math.sin(dir);
    io.hasGoal = true;
    io.fire = true;
    if (Math.abs(targetDist - orbitRadius) < band) {
      io.power = 0.7;
    }
  } else if (io.hasGoal && io.fire) {
    const orbitRadius = (settings.orbitRadius ?? 140) * sizeFactor * toWorld;
    const enemyCenterX = io.goalX;
    const enemyCenterY = io.goalY;
    const enemyDx = enemyCenterX - bullet.position.x;
    const enemyDy = enemyCenterY - bullet.position.y;
    const enemyDist = Math.sqrt(enemyDx * enemyDx + enemyDy * enemyDy);
    const dir = data.turnwise * Math.atan2(enemyDy, enemyDx) + 0.01;
    io.goalX = enemyCenterX - orbitRadius * Math.cos(dir);
    io.goalY = enemyCenterY - orbitRadius * Math.sin(dir);
    if (Math.abs(enemyDist - orbitRadius) < band) {
      io.power = 0.7;
    }
  } else {
    if (bullet._invisEnabled && bullet.opacity < 128) { io.power = 0; return; }
    const ownerX = bullet.ownerX;
    const ownerY = bullet.ownerY;
    const orbitDist = _law ? 30 * toWorld : 30 * sizeFactor;
    const ownerRad = _law ? _ownerR : data.ownerSize * 0.5;
    const minionRad = _law ? bullet.size * 0.5 : bullet.size;
    const bound1 = orbitDist * 0.8 + ownerRad + minionRad;
    const bound2 = orbitDist * 1.5 + ownerRad + minionRad;

    const dx = bullet.position.x - ownerX;
    const dy = bullet.position.y - ownerY;
    const dist = Math.sqrt(dx * dx + dy * dy) + (_law ? Math.PI / 8 : 0);

    const gdx = data.currentGoalX - bullet.position.x;
    const gdy = data.currentGoalY - bullet.position.y;
    const goalDistSq = gdx * gdx + gdy * gdy;
    let needNewGoal = (!_law && goalDistSq < 400) || (data.currentGoalX === 0 && data.currentGoalY === 0);

    if (dist > bound2) {
      needNewGoal = true;
    } else if (Math.random() < 0.005 * dtFactor) {
      needNewGoal = true;
    }

    if (needNewGoal) {
      const dirToOwner = Math.atan2(ownerY - bullet.position.y, ownerX - bullet.position.x);
      const offsetAngle = dirToOwner + Math.PI * (Math.random() * 0.5);
      const len = bound1 + Math.random() * (bound2 - bound1);
      data.currentGoalX = ownerX - len * Math.cos(offsetAngle);
      data.currentGoalY = ownerY - len * Math.sin(offsetAngle);
    }

    io.goalX = data.currentGoalX;
    io.goalY = data.currentGoalY;
    io.hasGoal = true;

    if (dist < bound2) {
      io.power = 0.15;
    }
  }

  if (mousePressed || mouseRightPressed) {
    io.targetX = mouseWorldX;
    io.targetY = mouseWorldY;
    io.hasTarget = true;
  }
}

function controllerCanRepel(
  bullet: Bullet, io: ControlIO
): void {
  if (io.alt && io.hasTarget) {
    io.targetX = bullet.position.x - (io.targetX - bullet.position.x);
    io.targetY = bullet.position.y - (io.targetY - bullet.position.y);
    io.fire = true;
  }
}

function controllerOnlyAcceptInArc(
  bullet: Bullet, data: BulletControllerData, io: ControlIO
): void {
  if (!io.hasTarget || data.firingArc <= 0 || data.firingArc >= 360) return;

  const targetAngle = Math.atan2(io.targetY - bullet.position.y, io.targetX - bullet.position.x);
  let angleDiff = targetAngle - bullet.facingAngle;
  while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
  while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

  const arcHalf = (data.firingArc * Math.PI / 180) / 2;
  if (Math.abs(angleDiff) >= arcHalf) {
    io.fire = false;
    io.alt = false;
  }
}

function controllerTargetSelf(
  bullet: Bullet, io: ControlIO
): void {
  io.targetX = bullet.position.x;
  io.targetY = bullet.position.y;
  io.hasTarget = true;
  io.fire = true;
}


const SNAKE_DELAY_S = 0.475;
const SNAKE_SWING_DEG = 48.4;
const SNAKE_RATE_DEG_S = 44.9;
const SNAKE_FIRST_TURN = 30.8 / 44.9;
const DEG_TO_RAD = Math.PI / 180;

export function snakeHeadingAt(age: number, settings: BehaviorConfig): number {
  const swing = (settings.snakeSwing ?? SNAKE_SWING_DEG) * DEG_TO_RAD;
  const rate = (settings.snakeRate ?? SNAKE_RATE_DEG_S) * DEG_TO_RAD;
  if (!(swing > 0) || !(rate > 0)) return 0;
  const delay = settings.snakeDelay ?? SNAKE_DELAY_S;
  const u = age - (delay > 0 ? delay : 0);
  if (!(u > 0)) return 0;
  const sign = settings.snakeInvert ? -1 : 1;
  const first = rate * SNAKE_FIRST_TURN;
  const firstTime = swing / first;
  if (u <= firstTime) return -first * u * sign;
  const m = ((u - firstTime) * rate) % (4 * swing);
  return (m <= 2 * swing ? m - swing : 3 * swing - m) * sign;
}

function controllerSnake(
  bullet: Bullet, data: BulletControllerData, settings: BehaviorConfig, dtFactor: number
): void {
  const d = snakeHeadingAt(bullet.currentAge + dtFactor / 120, settings) - data.snakeTurn;
  if (d === 0) return;
  const c = Math.cos(d), s = Math.sin(d);
  const vx = bullet.velocity.x, vy = bullet.velocity.y;
  bullet.velocity.x = vx * c - vy * s;
  bullet.velocity.y = vx * s + vy * c;
  bullet.currentAngle += d;
  data.snakeTurn += d;
}

function controllerDisableOnOverride(
  bullet: Bullet, data: BulletControllerData, io: ControlIO, autoOverride: boolean
): void {
  const shouldDisable = autoOverride;

  if (shouldDisable && data.disabledByOverride && bullet.damage !== 0) {
    data.savedDamage = bullet.damage;
    bullet.damage = 0;
  } else if (shouldDisable && !data.disabledByOverride) {
    data.disabledByOverride = true;
    data.savedDamage = bullet.damage;
    bullet.damage = 0;
  } else if (!shouldDisable && data.disabledByOverride) {
    data.disabledByOverride = false;
    bullet.damage = data.savedDamage;
  }

  if (data.disabledByOverride) {
    bullet.opacity = Math.max(30, bullet.opacity - 5 * (_fsK > 0 ? _fsK : 1));
    io.fire = false;
    io.power = 0;
  } else if (bullet.opacity < 255) {
    bullet.opacity = Math.min(255, bullet.opacity + 5 * (_fsK > 0 ? _fsK : 1));
  }
}

function controllerScaleWithMaster(
  bullet: Bullet, data: BulletControllerData, ownerRadiusLive: number = 0
): void {
  const liveSize = ownerRadiusLive > 0 ? ownerRadiusLive * 2 : (data.ownerSize > 0 ? data.ownerSize : 30);
  if (data.masterSizeRatio === 0) data.masterSizeRatio = bullet.size / liveSize;
  const targetSize = liveSize * data.masterSizeRatio;
  if (Math.abs(bullet.size - targetSize) > 0.1) {
    bullet.size = targetSize;
  }
}

function controllerStackGuns(
  bullet: Bullet, io: ControlIO, gameNow: number
): void {
  if (!io.hasTarget || !bullet.subTurrets || bullet.subTurrets.length === 0) return;

  const now = gameNow;
  let readiestIdx = -1;
  let lowestTimeToFire = Infinity;

  for (let i = 0; i < bullet.subTurrets.length; i++) {
    const st = bullet.subTurrets[i];
    const timeToFire = st.nextFireTime - now;
    if (timeToFire < lowestTimeToFire) {
      lowestTimeToFire = timeToFire;
      readiestIdx = i;
    }
  }

  if (readiestIdx < 0 || lowestTimeToFire > 200) return;

  const _sg = bullet.subTurrets[readiestIdx];
  const gunAngle = _sg.turretData ? _sg.turretData.angle : _sg.config.angle * Math.PI / 180;
  const dx = io.targetX - bullet.position.x;
  const dy = io.targetY - bullet.position.y;
  const targetAngle = Math.atan2(dy, dx) - gunAngle;
  const targetLen = Math.sqrt(dx * dx + dy * dy);

  io.targetX = bullet.position.x + targetLen * Math.cos(targetAngle);
  io.targetY = bullet.position.y + targetLen * Math.sin(targetAngle);
}

function controllerMapAltToFire(io: ControlIO): void {
  if (io.alt) {
    io.fire = true;
  }
}

function controllerAccelerate(
  bullet: Bullet,
  data: BulletControllerData,
  settings: BehaviorConfig,
  dtFactor: number,
): void {
  const currentSpeedSq = bullet.velocity.x * bullet.velocity.x + bullet.velocity.y * bullet.velocity.y;
  if (currentSpeedSq < 0.000001) return;

  const topSpeedWorld = data.accelTopSpeedWorld;
  if (topSpeedWorld <= 0) return;

  const topSpeedSq = topSpeedWorld * topSpeedWorld;
  if (currentSpeedSq >= topSpeedSq) return;

  const currentSpeed = Math.sqrt(currentSpeedSq);

  const ratio = bullet.initialSpeed / (data.configuredBulletSpeed || 1);
  const worldAccelPerFrame = settings.accelRate * ratio * dtFactor / 60;

  const newSpeed = Math.min(currentSpeed + worldAccelPerFrame, topSpeedWorld);
  const scale = newSpeed / currentSpeed;
  bullet.velocity.x *= scale;
  bullet.velocity.y *= scale;
}
