export const NAME_MAX = 80;

const SUFFIX = /^(.*\S)\s\((\d{1,6})\)$/;

export function splitNumber(name: string): { base: string; n: number | null } {
  const m = SUFFIX.exec(name);
  return m ? { base: m[1], n: Number(m[2]) } : { base: name, n: null };
}

import { SMALL_FIX } from '../smallFixSwitch';

export function cutWhole(s: string, max: number): string {
  if (s.length <= max) return s;
  const c = s.charCodeAt(max - 1);
  return s.slice(0, SMALL_FIX.R792 && c >= 0xd800 && c <= 0xdbff ? max - 1 : max);
}

export function cleanName(raw: string, max = NAME_MAX): string {
  return cutWhole(raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim(), max).trim();
}

export function nextFreeName(name: string, taken: Iterable<string>, max = NAME_MAX): string {
  const used = new Set<string>();
  for (const t of taken) used.add(t.toLowerCase());
  const clean = cleanName(name, max) || 'Untitled';
  if (!used.has(clean.toLowerCase())) return clean;
  const { base } = splitNumber(clean);
  for (let n = 1; n < 1_000_000; n++) {
    const tail = ` (${n})`;
    const b = base.length + tail.length > max ? cutWhole(base, max - tail.length).trimEnd() : base;
    const cand = b + tail;
    if (!used.has(cand.toLowerCase())) return cand;
  }
  return clean;
}

const WIN_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function safeFileName(name: string, ext: string): string {
  let n = cleanName(name, 120).replace(/[<>:"/\\|?*]/g, '_').replace(/[. ]+$/, '');
  if (!n || WIN_RESERVED.test(n)) n = (n || 'Untitled') + '_';
  return n + ext;
}
