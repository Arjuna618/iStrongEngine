import type { DocBlock, DocCategory, DocGuide, DocSubCategory } from './docsTypes';
import { DOCS_BASICS } from './docsBasics';
import { DOCS_TOOLS } from './docsTools';
import { DOCS_GAMEPLAY } from './docsGameplay';

export const DOCS_CATEGORIES: DocCategory[] = [DOCS_BASICS, DOCS_TOOLS, DOCS_GAMEPLAY];

export interface DocGuideEntry {
  guide: DocGuide;
  category: DocCategory;
  sub: DocSubCategory;
  path: string;
  searchTitle: string;
  searchKeywords: string;
  searchBody: string;
}

function blockText(b: DocBlock): string {
  switch (b.t) {
    case 'p': case 'h': case 'tip': case 'note': case 'warn':
      return b.text;
    case 'list': case 'steps':
      return b.items.join(' ');
    case 'kv':
      return (b.title ? b.title + ' ' : '') + b.rows.map(r => r[0] + ' ' + r[1]).join(' ');
    case 'keys':
      return b.rows.map(r => r[0] + ' ' + r[1]).join(' ');
    case 'chips':
      return (b.label ? b.label + ' ' : '') + b.items.join(' ');
    case 'links':
      return '';
  }
}

export const DOC_ENTRIES: DocGuideEntry[] = [];
export const DOC_ENTRY_BY_ID = new Map<string, DocGuideEntry>();

for (const category of DOCS_CATEGORIES) {
  for (const sub of category.subs) {
    for (const guide of sub.guides) {
      const entry: DocGuideEntry = {
        guide,
        category,
        sub,
        path: `${category.title} / ${sub.title}`,
        searchTitle: guide.title.toLowerCase(),
        searchKeywords: guide.keywords.join(' ').toLowerCase(),
        searchBody: guide.blocks.map(blockText).join(' ').replace(/\*\*/g, '').toLowerCase(),
      };
      DOC_ENTRIES.push(entry);
      DOC_ENTRY_BY_ID.set(guide.id, entry);
    }
  }
}

export function searchDocs(query: string): DocGuideEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const titleHits: DocGuideEntry[] = [];
  const keywordHits: DocGuideEntry[] = [];
  const bodyHits: DocGuideEntry[] = [];
  for (const e of DOC_ENTRIES) {
    if (e.searchTitle.includes(q)) titleHits.push(e);
    else if (e.searchKeywords.includes(q)) keywordHits.push(e);
    else if (e.searchBody.includes(q)) bodyHits.push(e);
  }
  return [...titleHits, ...keywordHits, ...bodyHits];
}
