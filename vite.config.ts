import path from 'path';
import fs from 'fs';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { buildCatalogFacts, type CatalogRecord } from './components/library/catalogCore';
import { MENU_SCENES } from './components/menuScene/menuSceneSwitch';
import { buildSourceCode } from './scripts/sourceCode.ts';

function sourceCodePlugin(): Plugin {
  const off = process.env.VITE_SOURCE_CODE === 'off';
  const EMPTY = '\0source-code-off';
  return {
    name: 'source-code',
    apply: 'build',
    enforce: 'pre',
    resolveId(source) { return off && /(^|[\\/])source[\\/]SourceCodeWindow(\.tsx)?$/.test(source) ? EMPTY : null; },
    load(id) { return id === EMPTY ? 'export default function SourceCodeWindow() { return null; }' : null; },
    generateBundle() {
      if (off) return;
      for (const a of buildSourceCode(__dirname)) this.emitFile({ type: 'asset', fileName: a.fileName, source: a.source });
    },
  };
}

function menuScenesSwitchPlugin(): Plugin {
  return {
    name: 'menu-scenes-switch',
    transformIndexHtml(html) { return html.replace('data-menu-scenes="1"', `data-menu-scenes="${MENU_SCENES.ON ? 1 : 0}"`); },
  };
}

function contentCatalogPlugin(): Plugin {
  const VID = 'virtual:content-catalog';
  const RID = '\0' + VID;
  return {
    name: 'content-catalog',
    resolveId(id) { return id === VID ? RID : null; },
    load(id) {
      if (id !== RID) return null;
      const pub = path.resolve(__dirname, 'public');
      const listPath = path.join(pub, 'data-packs.json');
      const records: CatalogRecord[] = [];
      if (fs.existsSync(listPath)) {
        this.addWatchFile(listPath);
        const list = JSON.parse(fs.readFileSync(listPath, 'utf8'));
        const byPath = new Map<string, any>();
        for (const p of list.packs || []) {
          const pack = JSON.parse(fs.readFileSync(path.join(pub, p.file), 'utf8'));
          for (const r of pack.files || []) byPath.set(r.path, r.file);
        }
        for (const p of list.order || []) {
          const f = byPath.get(p);
          if (!f || !f.data || f.type === 'FoodShape') continue;
          records.push({ id: 'data-' + p, type: f.type, category: f.category, name: f.name, data: f.data });
        }
      }
      return 'export default ' + JSON.stringify(buildCatalogFacts(records)) + ';';
    },
  };
}

export default defineConfig(() => {
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [
        react(),
        { name: 'tailwind-css-verbatim', config: () => ({ build: { cssMinify: false } }) },
        contentCatalogPlugin(),
        menuScenesSwitchPlugin(),
        sourceCodePlugin(),
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
