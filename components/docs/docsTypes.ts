import type { LucideIcon } from '../ui/icons';

export type DocBlock =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'steps'; items: string[] }
  | { t: 'tip'; text: string }
  | { t: 'note'; text: string }
  | { t: 'warn'; text: string }
  | { t: 'kv'; title?: string; rows: [string, string][] }
  | { t: 'keys'; rows: [string, string][] }
  | { t: 'chips'; label?: string; items: string[] }
  | { t: 'links'; ids: string[] };

export interface DocGuide {
  id: string;
  title: string;
  keywords: string[];
  blocks: DocBlock[];
}

export interface DocSubCategory {
  id: string;
  title: string;
  icon: LucideIcon;
  guides: DocGuide[];
}

export interface DocCategory {
  id: string;
  title: string;
  icon: LucideIcon;
  subs: DocSubCategory[];
}
