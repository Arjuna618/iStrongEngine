import licenseSource from '../../LICENSE?raw';
import termsSource from '../../legal/TERMS-OF-USE.md?raw';
import privacySource from '../../legal/PRIVACY.md?raw';

export type LegalBlock =
  | { t: 'title'; text: string }
  | { t: 'h'; text: string }
  | { t: 'p'; text: string }
  | { t: 'li'; text: string }
  | { t: 'quote'; text: string };

export function legalBlocks(source: string): LegalBlock[] {
  const out: LegalBlock[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } };
  for (const raw of source.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('## ')) { flush(); out.push({ t: 'h', text: line.slice(3) }); continue; }
    if (line.startsWith('# ')) { flush(); out.push({ t: 'title', text: line.slice(2) }); continue; }
    if (line.startsWith('- ')) { flush(); out.push({ t: 'li', text: line.slice(2) }); continue; }
    if (line.startsWith('> ')) { flush(); out.push({ t: 'quote', text: line.slice(2) }); continue; }
    para.push(line);
  }
  flush();
  return out;
}

export type LegalSpan = { k: 'text' | 'bold' | 'code'; text: string } | { k: 'link'; text: string; href: string };

export function legalSpans(text: string): LegalSpan[] {
  const out: LegalSpan[] = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|`(.+?)`|\[([^\]]+)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s)>]+)/g;
  let at = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > at) out.push({ k: 'text', text: text.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ k: 'bold', text: m[1] });
    else if (m[2] !== undefined) out.push({ k: 'bold', text: m[2] });
    else if (m[3] !== undefined) out.push({ k: 'code', text: m[3] });
    else if (m[4] !== undefined) out.push(/^https?:\/\//.test(m[5]) ? { k: 'link', text: m[4], href: m[5] } : { k: 'text', text: m[4] });
    else if (m[6] !== undefined) out.push({ k: 'link', text: m[6], href: m[6] });
    else {
      const href = m[7].replace(/[.,;:]+$/, '');
      out.push({ k: 'link', text: href, href });
      if (href.length < m[7].length) out.push({ k: 'text', text: m[7].slice(href.length) });
    }
    at = re.lastIndex;
  }
  if (at < text.length) out.push({ k: 'text', text: text.slice(at) });
  return out;
}

export const LICENSE_BLOCKS: LegalBlock[] = legalBlocks(licenseSource);
export const TERMS_BLOCKS: LegalBlock[] = legalBlocks(termsSource);
export const PRIVACY_BLOCKS: LegalBlock[] = legalBlocks(privacySource);

export const TERMS_VERSION: string = (/^Version .+$/m.exec(termsSource)?.[0] ?? 'Version 1.0').trim();
