export class ProjectDataError extends Error {}

const HOSTILE = new Set(['__proto__', 'constructor', 'prototype']);
const NUM_TAG = '$n';

function isPlainObject(v: object): boolean {
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

export function canonicalStringify(value: unknown): string {
  const out: string[] = [];
  write(value, out, '$', 0);
  return out.join('');
}

function write(v: unknown, out: string[], path: string, depth: number): void {
  if (depth > 400) throw new ProjectDataError(`Too deep at ${path}`);
  if (v === null) { out.push('null'); return; }
  switch (typeof v) {
    case 'boolean': out.push(v ? 'true' : 'false'); return;
    case 'string': out.push(JSON.stringify(v)); return;
    case 'number':
      if (Number.isNaN(v)) { out.push('{"$n":"NaN"}'); return; }
      if (v === Infinity) { out.push('{"$n":"Infinity"}'); return; }
      if (v === -Infinity) { out.push('{"$n":"-Infinity"}'); return; }
      out.push(Object.is(v, -0) ? '0' : JSON.stringify(v));
      return;
    case 'undefined': out.push('null'); return;
    case 'object': break;
    default: throw new ProjectDataError(`A ${typeof v} at ${path} cannot be saved`);
  }
  const o = v as object;
  if (Array.isArray(o)) {
    out.push('[');
    for (let i = 0; i < o.length; i++) {
      if (i > 0) out.push(',');
      write(o[i], out, `${path}[${i}]`, depth + 1);
    }
    out.push(']');
    return;
  }
  if (!isPlainObject(o)) {
    const kind = o instanceof Map ? 'Map' : o instanceof Set ? 'Set' : ArrayBuffer.isView(o) ? 'typed array' : (o.constructor?.name || 'object');
    throw new ProjectDataError(`A ${kind} at ${path} cannot be saved as it is`);
  }
  const keys = Object.keys(o).sort();
  out.push('{');
  let first = true;
  for (const k of keys) {
    const x = (o as Record<string, unknown>)[k];
    if (x === undefined) continue;
    if (typeof x === 'function') throw new ProjectDataError(`A function at ${path}.${k} cannot be saved`);
    if (!first) out.push(',');
    first = false;
    out.push(JSON.stringify(k), ':');
    write(x, out, `${path}.${k}`, depth + 1);
  }
  out.push('}');
}

export interface ParseLimits {
  maxDepth: number;
  maxString: number;
  maxList: number;
}

export const DEFAULT_PARSE_LIMITS: ParseLimits = { maxDepth: 200, maxString: 1_000_000, maxList: 200_000 };

export function safeParse(text: string, limits: ParseLimits = DEFAULT_PARSE_LIMITS): unknown {
  let root: unknown;
  try {
    root = JSON.parse(text, (k, val) => (HOSTILE.has(k) ? undefined : val));
  } catch (e) {
    throw new ProjectDataError('Not readable JSON');
  }
  const stack: { v: unknown; d: number; parent: any; key: string | number | null }[] = [{ v: root, d: 0, parent: null, key: null }];
  while (stack.length > 0) {
    const { v, d, parent, key } = stack.pop()!;
    if (d > limits.maxDepth) throw new ProjectDataError('Nested too deeply');
    if (typeof v === 'string') {
      if (v.length > limits.maxString) throw new ProjectDataError('A text is too long');
      continue;
    }
    if (v === null || typeof v !== 'object') continue;
    if (Array.isArray(v)) {
      if (v.length > limits.maxList) throw new ProjectDataError('A list is too long');
      for (let i = 0; i < v.length; i++) stack.push({ v: v[i], d: d + 1, parent: v, key: i });
      continue;
    }
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === NUM_TAG) {
      const t = (v as Record<string, unknown>)[NUM_TAG];
      const n = t === 'NaN' ? NaN : t === 'Infinity' ? Infinity : t === '-Infinity' ? -Infinity : undefined;
      if (n !== undefined) {
        if (parent === null) root = n; else parent[key as any] = n;
        continue;
      }
    }
    if (keys.length > limits.maxList) throw new ProjectDataError('An object has too many keys');
    for (const k of keys) stack.push({ v: (v as Record<string, unknown>)[k], d: d + 1, parent: v, key: k });
  }
  return root;
}

const _enc = new TextEncoder();
const _dec = new TextDecoder('utf-8', { fatal: true });

export function canonicalBytes(value: unknown): Uint8Array {
  return _enc.encode(canonicalStringify(value));
}

export function textOf(bytes: Uint8Array): string {
  try { return _dec.decode(bytes); } catch { throw new ProjectDataError('Not readable text'); }
}

export function bytesOf(text: string): Uint8Array {
  return _enc.encode(text);
}
