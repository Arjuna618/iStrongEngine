export class Vector {
  constructor(public x: number, public y: number) {}

  add(v: Vector | {x: number, y: number}): Vector {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v: Vector | {x: number, y: number}): Vector {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  mult(n: number): Vector {
    this.x *= n;
    this.y *= n;
    return this;
  }

  div(n: number): Vector {
    this.x /= n;
    this.y /= n;
    return this;
  }

  mag(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): Vector {
    const m = this.mag();
    if (m !== 0) {
      this.div(m);
    }
    return this;
  }

  set(x: number | Vector, y?: number): Vector {
    if (x instanceof Vector) {
      this.x = x.x;
      this.y = x.y;
    } else if (typeof x === 'number' && typeof y === 'number') {
      this.x = x;
      this.y = y;
    }
    return this;
  }

  copy(): Vector {
    return new Vector(this.x, this.y);
  }

  rotate(angle: number): Vector {
    const newX = this.x * Math.cos(angle) - this.y * Math.sin(angle);
    const newY = this.x * Math.sin(angle) + this.y * Math.cos(angle);
    this.x = newX;
    this.y = newY;
    return this;
  }

  static fromAngle(angle: number, length: number = 1): Vector {
    return new Vector(length * Math.cos(angle), length * Math.sin(angle));
  }

  static dist(v1: Vector, v2: Vector): number {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  static distSq(v1: Vector, v2: Vector): number {
    const dx = v1.x - v2.x;
    const dy = v1.y - v2.y;
    return dx * dx + dy * dy;
  }

  static sub(v1: Vector, v2: Vector): Vector {
    return new Vector(v1.x - v2.x, v1.y - v2.y);
  }

  static add(v1: Vector, v2: Vector): Vector {
    return new Vector(v1.x + v2.x, v1.y + v2.y);
  }

  setFromAngle(angle: number, length: number = 1): Vector {
    this.x = length * Math.cos(angle);
    this.y = length * Math.sin(angle);
    return this;
  }

  setMag(newMag: number): Vector {
    const m = this.mag();
    if (m > 0.000001) {
      const scale = newMag / m;
      this.x *= scale;
      this.y *= scale;
    }
    return this;
  }

  magSq(): number {
    return this.x * this.x + this.y * this.y;
  }
}

export function ccdCircleCircle(
  ax: number, ay: number, avx: number, avy: number, ar: number,
  bx: number, by: number, bvx: number, bvy: number, br: number,
): number {
  const px = ax - bx;
  const py = ay - by;
  const dvx = avx - bvx;
  const dvy = avy - bvy;

  const combinedR = ar + br;
  const combinedRSq = combinedR * combinedR;

  const distSq = px * px + py * py;
  if (distSq <= combinedRSq) return 0;
  const A = dvx * dvx + dvy * dvy;
  if (A < 0.000001) return -1;

  const B = 2 * (px * dvx + py * dvy);
  const C = distSq - combinedRSq;

  const det = B * B - 4 * A * C;
  if (det < 0) return -1;

  const sqrtDet = Math.sqrt(det);
  const t1 = (-B - sqrtDet) / (2 * A);

  if (t1 >= 0 && t1 <= 1) return t1;

  const t2 = (-B + sqrtDet) / (2 * A);
  if (t2 >= 0 && t2 <= 1 && t1 < 0) return 0;

  return -1;
}
