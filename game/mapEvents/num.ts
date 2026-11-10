import type { Num, Ramp } from './doc';

export class Sfc32 {
  a = 0; b = 0; c = 0; d = 1;
  seed(a: number, b: number, c: number, d: number): this {
    this.a = a | 0; this.b = b | 0; this.c = c | 0; this.d = d | 0;
    for (let i = 0; i < 12; i++) this.next();
    return this;
  }
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  range(lo: number, hi: number): number { return lo + (hi - lo) * this.next(); }
}

export function hash32(a: number, b = 0, c = 0, d = 0, e = 0): number {
  let h = 0x9747b28c | 0;
  const mix = (k: number) => {
    k = Math.imul(k | 0, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593);
    h ^= k; h = (h << 13) | (h >>> 19); h = (Math.imul(h, 5) + 0xe6546b64) | 0;
  };
  mix(a); mix(b); mix(c); mix(d); mix(e);
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
  return h | 0;
}

export function seedStream(out: Sfc32, a: number, b = 0, c = 0, d = 0): Sfc32 {
  return out.seed(hash32(a, b, c, d, 1), hash32(a, b, c, d, 2), hash32(a, b, c, d, 3), hash32(a, b, c, d, 4));
}

const OP_END = 0, OP_PUSH = 1, OP_WAVE = 2, OP_SECONDS = 3, OP_PLAYERS = 4, OP_HUMANS = 5, OP_BOTS = 6, OP_TIER = 7,
  OP_REF = 8, OP_ADD = 9, OP_SUB = 10, OP_MUL = 11, OP_DIV = 12, OP_MOD = 13, OP_NEG = 14,
  OP_EQ = 15, OP_NE = 16, OP_LT = 17, OP_LE = 18, OP_GT = 19, OP_GE = 20, OP_NOT = 21,
  OP_MIN = 22, OP_MAX = 23, OP_FLOOR = 24, OP_CEIL = 25, OP_ROUND = 26, OP_ABS = 27, OP_RND = 28, OP_POW = 29,
  OP_JZ = 30, OP_JMP = 31, OP_CURVE = 32, OP_AND = 33, OP_OR = 34,
  OP_SIDE1 = 35, OP_SIDE2 = 36, OP_SIDE3 = 37, OP_SIDE4 = 38;
export interface NumCtx {
  wave: number; seconds: number; players: number; humans: number; bots: number; tier: number;
  rng: Sfc32;
  readRef(id: number): number;
  sideCount?(n: number): number;
}

export class NumStore {
  code: number[] = [];
  frozen: Float64Array = new Float64Array(0);
  freeze(): Float64Array { this.frozen = Float64Array.from(this.code); return this.frozen; }
}

const FORMULA_MAX_LEN = 400;
const FORMULA_MAX_DEPTH = 32;
const STACK_MAX = 64;

export interface FormulaResult { ok: boolean; err?: string; at?: number; }

type Tok = { t: 'num'; v: number; at: number } | { t: 'name'; v: string; at: number } | { t: 'ref'; v: number; at: number } | { t: 'op'; v: string; at: number };
const NAMES: Record<string, number> = { wave: OP_WAVE, seconds: OP_SECONDS, players: OP_PLAYERS, humans: OP_HUMANS, bots: OP_BOTS, tier: OP_TIER,
  side1: OP_SIDE1, side2: OP_SIDE2, side3: OP_SIDE3, side4: OP_SIDE4 };
const FUNCS: Record<string, { op: number; args: number }> = {
  min: { op: OP_MIN, args: 2 }, max: { op: OP_MAX, args: 2 }, floor: { op: OP_FLOOR, args: 1 }, ceil: { op: OP_CEIL, args: 1 },
  round: { op: OP_ROUND, args: 1 }, abs: { op: OP_ABS, args: 1 }, rnd: { op: OP_RND, args: 2 }, pow: { op: OP_POW, args: 2 },
};

function tokenize(s: string): Tok[] | FormulaResult {
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if ((c >= '0' && c <= '9') || c === '.') {
      const st = i; let dots = 0;
      while (i < s.length && ((s[i] >= '0' && s[i] <= '9') || s[i] === '.')) { if (s[i] === '.') dots++; i++; }
      if (dots > 1) return { ok: false, err: 'A number has two dots', at: st };
      const v = Number(s.slice(st, i));
      if (!Number.isFinite(v)) return { ok: false, err: 'Not a number', at: st };
      out.push({ t: 'num', v, at: st });
      continue;
    }
    if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z')) {
      const st = i;
      while (i < s.length && /[a-zA-Z0-9_]/.test(s[i])) i++;
      out.push({ t: 'name', v: s.slice(st, i).toLowerCase(), at: st });
      continue;
    }
    if (c === '{') {
      const end = s.indexOf('}', i);
      if (end < 0) return { ok: false, err: 'A { with no }', at: i };
      const v = Number(s.slice(i + 1, end));
      if (!Number.isInteger(v) || v < 0) return { ok: false, err: 'A name chip that is not a thing', at: i };
      out.push({ t: 'ref', v, at: i });
      i = end + 1;
      continue;
    }
    const two = s.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') { out.push({ t: 'op', v: two, at: i }); i += 2; continue; }
    if ('+-*/%()<>?:,!'.includes(c)) { out.push({ t: 'op', v: c, at: i }); i++; continue; }
    return { ok: false, err: 'Cannot read "' + c + '"', at: i };
  }
  return out;
}

export function compileFormula(text: string, out: number[]): FormulaResult {
  if (typeof text !== 'string' || text.length === 0) return { ok: false, err: 'An empty formula', at: 0 };
  if (text.length > FORMULA_MAX_LEN) return { ok: false, err: 'Too long', at: FORMULA_MAX_LEN };
  const toks = tokenize(text);
  if (!Array.isArray(toks)) return toks;
  let p = 0, depth = 0, err: FormulaResult | null = null, sp = 0, maxSp = 0;
  const start = out.length;
  const fail = (e: string, at: number) => { if (!err) err = { ok: false, err: e, at }; };
  const peek = () => (p < toks.length ? toks[p] : null);
  const isOp = (v: string) => { const q = peek(); return !!q && q.t === 'op' && q.v === v; };
  const stack = (d: number) => { sp += d; if (sp > maxSp) maxSp = sp; };

  const ternary = (): void => {
    if (err) return;
    if (++depth > FORMULA_MAX_DEPTH) { fail('Too many brackets', peek()?.at ?? text.length); depth--; return; }
    or();
    if (isOp('?')) {
      p++;
      out.push(OP_JZ); const jz = out.length; out.push(0); stack(-1);
      ternary();
      if (!isOp(':')) fail('A ? with no :', peek()?.at ?? text.length); else p++;
      out.push(OP_JMP); const jm = out.length; out.push(0);
      out[jz] = out.length - start;
      stack(-1);
      ternary();
      out[jm] = out.length - start;
    }
    depth--;
  };
  const binary = (next: () => void, ops: Record<string, number>) => () => {
    next();
    for (;;) {
      if (err) return;
      const q = peek();
      if (!q || q.t !== 'op' || !(q.v in ops)) return;
      p++; next(); out.push(ops[q.v]); stack(-1);
    }
  };
  const unary = (): void => {
    if (err) return;
    if (isOp('-')) { p++; unary(); out.push(OP_NEG); return; }
    if (isOp('!')) { p++; unary(); out.push(OP_NOT); return; }
    if (isOp('+')) { p++; unary(); return; }
    atom();
  };
  const atom = (): void => {
    if (err) return;
    const q = peek();
    if (!q) { fail('It ends too soon', text.length); return; }
    if (q.t === 'num') { p++; out.push(OP_PUSH, q.v); stack(1); return; }
    if (q.t === 'ref') { p++; out.push(OP_REF, q.v); stack(1); return; }
    if (q.t === 'name') {
      p++;
      if (q.v in NAMES) { out.push(NAMES[q.v]); stack(1); return; }
      const fn = FUNCS[q.v];
      if (!fn) { fail('Unknown word "' + q.v + '"', q.at); return; }
      if (!isOp('(')) { fail('"' + q.v + '" needs brackets', q.at); return; }
      p++;
      for (let a = 0; a < fn.args; a++) {
        if (a > 0) { if (!isOp(',')) { fail('"' + q.v + '" needs ' + fn.args + ' values', q.at); return; } p++; }
        ternary();
        if (err) return;
      }
      if (!isOp(')')) { fail('A ( with no )', q.at); return; }
      p++;
      out.push(fn.op);
      if (fn.args === 2) stack(-1);
      return;
    }
    if (q.v === '(') {
      p++; ternary();
      if (!isOp(')')) { fail('A ( with no )', q.at); return; }
      p++;
      return;
    }
    fail('Did not expect "' + q.v + '"', q.at);
  };
  const mul = binary(unary, { '*': OP_MUL, '/': OP_DIV, '%': OP_MOD });
  const add = binary(mul, { '+': OP_ADD, '-': OP_SUB });
  const cmp = binary(add, { '<': OP_LT, '<=': OP_LE, '>': OP_GT, '>=': OP_GE });
  const eq = binary(cmp, { '==': OP_EQ, '!=': OP_NE });
  const and = binary(eq, { '&&': OP_AND });
  const or = binary(and, { '||': OP_OR });

  ternary();
  if (!err && p < toks.length) fail('Did not expect more here', toks[p].at);
  if (!err && maxSp >= STACK_MAX) fail('Too deep', 0);
  if (err) { out.length = start; return err; }
  out.push(OP_END);
  return { ok: true };
}

function emitRamp(r: Ramp, out: number[]): void {
  out.push(OP_PUSH, finiteOr(r.base, 0), OP_PUSH, finiteOr(r.per, 0), OP_WAVE);
  const pow = finiteOr(r.pow, 1);
  if (pow !== 1) out.push(OP_PUSH, pow, OP_POW);
  out.push(OP_MUL, OP_ADD);
  if (typeof r.min === 'number' && Number.isFinite(r.min)) out.push(OP_PUSH, r.min, OP_MAX);
  if (typeof r.max === 'number' && Number.isFinite(r.max)) out.push(OP_PUSH, r.max, OP_MIN);
  if (Array.isArray(r.every)) {
    for (const e of r.every.slice(0, 8)) {
      if (!e || !(e.n > 0) || !Number.isFinite(e.mult)) continue;
      out.push(OP_WAVE, OP_PUSH, e.n, OP_MOD, OP_PUSH, finiteOr(e.rem, 0), OP_EQ, OP_PUSH, e.mult, OP_PUSH, 1);
      out.push( OP_CURVE, -1);
      out.push(OP_MUL);
    }
  }
  out.push(OP_END);
}
function finiteOr(v: unknown, d: number): number { return typeof v === 'number' && Number.isFinite(v) ? v : d; }

export interface NumProblem { err: string; }

export function emitNum(store: NumStore, n: unknown, onProblem?: (p: NumProblem) => void): number {
  const out = store.code;
  const at = out.length;
  const bad = (err: string) => { if (onProblem) onProblem({ err }); out.length = at; out.push(OP_PUSH, NaN, OP_END); return at; };
  if (typeof n === 'number') {
    if (!Number.isFinite(n)) return bad('Not a number');
    out.push(OP_PUSH, n, OP_END);
    return at;
  }
  if (n && typeof n === 'object') {
    const o = n as { r?: unknown; ramp?: unknown; curve?: unknown; f?: unknown };
    if (Array.isArray(o.r) && o.r.length === 2 && Number.isFinite(o.r[0]) && Number.isFinite(o.r[1])) {
      out.push(OP_PUSH, o.r[0] as number, OP_PUSH, o.r[1] as number, OP_RND, OP_END);
      return at;
    }
    if (o.ramp && typeof o.ramp === 'object') { emitRamp(o.ramp as Ramp, out); return at; }
    if (Array.isArray(o.curve)) {
      const pts = (o.curve as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (pts.length === 0) return bad('A curve with no points');
      pts.sort((a, b) => a[0] - b[0]);
      out.push(OP_CURVE, Math.min(pts.length, 64));
      for (let i = 0; i < Math.min(pts.length, 64); i++) out.push(pts[i][0], pts[i][1]);
      out.push(OP_END);
      return at;
    }
    if (typeof o.f === 'string') {
      const r = compileFormula(o.f, out);
      if (!r.ok) return bad(r.err ?? 'Cannot read this formula');
      return at;
    }
  }
  return bad('Not a number');
}

const _st = new Float64Array(STACK_MAX + 4);

export function runNum(code: Float64Array | number[], at: number, ctx: NumCtx): number {
  let ip = at, sp = 0;
  for (let guard = 0; guard < 4096; guard++) {
    const op = code[ip++];
    switch (op) {
      case OP_END: return sp > 0 ? _st[sp - 1] : NaN;
      case OP_PUSH: _st[sp++] = code[ip++]; break;
      case OP_WAVE: _st[sp++] = ctx.wave; break;
      case OP_SECONDS: _st[sp++] = ctx.seconds; break;
      case OP_PLAYERS: _st[sp++] = ctx.players; break;
      case OP_HUMANS: _st[sp++] = ctx.humans; break;
      case OP_BOTS: _st[sp++] = ctx.bots; break;
      case OP_SIDE1: case OP_SIDE2: case OP_SIDE3: case OP_SIDE4: _st[sp++] = ctx.sideCount ? ctx.sideCount(op - OP_SIDE1 + 1) : 0; break;
      case OP_TIER: _st[sp++] = ctx.tier; break;
      case OP_REF: _st[sp++] = ctx.readRef(code[ip++]); break;
      case OP_ADD: sp--; _st[sp - 1] += _st[sp]; break;
      case OP_SUB: sp--; _st[sp - 1] -= _st[sp]; break;
      case OP_MUL: sp--; _st[sp - 1] *= _st[sp]; break;
      case OP_DIV: sp--; _st[sp - 1] /= _st[sp]; break;
      case OP_MOD: sp--; _st[sp - 1] %= _st[sp]; break;
      case OP_POW: sp--; _st[sp - 1] = Math.pow(_st[sp - 1], _st[sp]); break;
      case OP_NEG: _st[sp - 1] = -_st[sp - 1]; break;
      case OP_NOT: _st[sp - 1] = _st[sp - 1] ? 0 : 1; break;
      case OP_EQ: sp--; _st[sp - 1] = _st[sp - 1] === _st[sp] ? 1 : 0; break;
      case OP_NE: sp--; _st[sp - 1] = _st[sp - 1] !== _st[sp] ? 1 : 0; break;
      case OP_LT: sp--; _st[sp - 1] = _st[sp - 1] < _st[sp] ? 1 : 0; break;
      case OP_LE: sp--; _st[sp - 1] = _st[sp - 1] <= _st[sp] ? 1 : 0; break;
      case OP_GT: sp--; _st[sp - 1] = _st[sp - 1] > _st[sp] ? 1 : 0; break;
      case OP_GE: sp--; _st[sp - 1] = _st[sp - 1] >= _st[sp] ? 1 : 0; break;
      case OP_AND: sp--; _st[sp - 1] = _st[sp - 1] && _st[sp] ? 1 : 0; break;
      case OP_OR: sp--; _st[sp - 1] = _st[sp - 1] || _st[sp] ? 1 : 0; break;
      case OP_MIN: sp--; _st[sp - 1] = Math.min(_st[sp - 1], _st[sp]); break;
      case OP_MAX: sp--; _st[sp - 1] = Math.max(_st[sp - 1], _st[sp]); break;
      case OP_FLOOR: _st[sp - 1] = Math.floor(_st[sp - 1]); break;
      case OP_CEIL: _st[sp - 1] = Math.ceil(_st[sp - 1]); break;
      case OP_ROUND: _st[sp - 1] = Math.round(_st[sp - 1]); break;
      case OP_ABS: _st[sp - 1] = Math.abs(_st[sp - 1]); break;
      case OP_RND: { sp--; const hi = _st[sp], lo = _st[sp - 1]; _st[sp - 1] = lo + (hi - lo) * ctx.rng.next(); break; }
      case OP_JZ: { const t = code[ip++]; sp--; if (!_st[sp]) ip = at + t; break; }
      case OP_JMP: ip = at + code[ip]; break;
      case OP_CURVE: {
        const n = code[ip++];
        if (n === -1) {
          sp -= 2; _st[sp - 1] = _st[sp - 1] ? _st[sp] : _st[sp + 1];
          break;
        }
        const x = ctx.wave;
        let y: number;
        if (n === 1 || x <= code[ip]) y = code[ip + 1];
        else {
          let i = 1;
          while (i < n - 1 && x > code[ip + i * 2]) i++;
          const x0 = code[ip + (i - 1) * 2], y0 = code[ip + (i - 1) * 2 + 1], x1 = code[ip + i * 2], y1 = code[ip + i * 2 + 1];
          y = x1 === x0 ? y1 : y0 + (y1 - y0) * (x - x0) / (x1 - x0);
        }
        ip += n * 2;
        _st[sp++] = y;
        break;
      }
      default: return NaN;
    }
    if (sp > STACK_MAX) return NaN;
  }
  return NaN;
}

const _plainRng = new Sfc32().seed(1, 2, 3, 4);
export function evalNum(n: unknown, wave: number, rng: Sfc32 = _plainRng, seconds = 0, readRef?: (id: number) => number): number {
  const s = new NumStore();
  const at = emitNum(s, n);
  return runNum(s.code, at, { wave, seconds, players: 1, humans: 1, bots: 0, tier: 1, rng, readRef: readRef ?? (() => NaN) });
}

export function plainNumber(n: Num | undefined | null): number | null { return typeof n === 'number' && Number.isFinite(n) ? n : null; }
