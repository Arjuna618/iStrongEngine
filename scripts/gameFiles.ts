export const GAME_FOLDERS: readonly string[] = ['components', 'game', 'utils', 'scripts', 'public', 'legal', 'Data'];

export const GAME_FILES: readonly string[] = [
  'App.tsx', 'index.tsx', 'index.html', 'types.ts', 'vite-env.d.ts', 'vite.config.ts', 'tsconfig.json',
  'tailwind.config.js', 'tailwind.css', 'postcss.config.js', 'package.json', 'package-lock.json', 'README.md', 'LICENSE',
];

export const MADE_BY_BUILD: readonly string[] = ['public/data', 'public/data-manifest.json', 'public/data-packs', 'public/data-packs.json'];

export const SYSTEM_FILES: readonly string[] = ['desktop.ini', 'thumbs.db', '.ds_store'];

export interface GameFile {
  path: string;
  abs: string;
}

export function listGameFiles(root: string, fs: typeof import('fs'), path: typeof import('path')): GameFile[] {
  const out: GameFile[] = [];
  const made = new Set(MADE_BY_BUILD.map(p => p.toLowerCase()));
  const system = new Set(SYSTEM_FILES);
  const walk = (abs: string, rel: string) => {
    for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
      const r = rel + '/' + e.name;
      if (made.has(r.toLowerCase()) || system.has(e.name.toLowerCase())) continue;
      const a = path.join(abs, e.name);
      if (e.isDirectory()) walk(a, r);
      else if (e.isFile()) out.push({ path: r, abs: a });
    }
  };
  for (const f of GAME_FOLDERS) {
    const abs = path.join(root, f);
    if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) walk(abs, f);
  }
  for (const f of GAME_FILES) {
    const abs = path.join(root, f);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) out.push({ path: f, abs });
  }
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}
