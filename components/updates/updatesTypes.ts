export interface UpdateEntry {
  date: string;
  version: string;
  title: string;
  bullets: string[];
}

export interface UpdateMonth {
  key: string;
  year: number;
  month: number;
  label: string;
  shortLabel: string;
  entries: UpdateEntry[];
}

export interface UpdateYear {
  year: number;
  months: UpdateMonth[];
  count: number;
}
