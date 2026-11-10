import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WORKS = [
  {
    title: 'Open Source Arras 2.1.2 (MIT)',
    link: 'https://github.com/open-source-arras/open-source-arras',
    note: 'Parts of iStrongEngine (game rules, and some tank designs and their numbers) were made from Open Source Arras.\n'
      + 'Open Source Arras is not affiliated with iStrongEngine and does not endorse it.',
    file: 'legal/third-party/open-source-arras-2.1.2-LICENSE.txt',
  },
  {
    title: 'Open Source Arras 2.0.10 rev3 (PolyForm Noncommercial 1.0.0)',
    link: 'https://polyformproject.org/licenses/noncommercial/1.0.0',
    note: 'Parts of iStrongEngine were made from this older version of Open Source Arras, which may be used for\n'
      + 'noncommercial purposes only. Its terms follow.',
    file: 'legal/third-party/open-source-arras-2.0.10-rev3-LICENSE.txt',
  },
  {
    title: 'Fonts: Inter, JetBrains Mono, Ubuntu (open font licenses)',
    link: 'https://fonts.google.com',
    note: 'The app shows its text in these fonts, which it loads from Google Fonts while it runs; no font file comes with\n'
      + 'iStrongEngine. Inter and JetBrains Mono are under the SIL Open Font License 1.1, Ubuntu under the Ubuntu Font Licence 1.0.',
    text: '',
  },
];
const SHIPPED = [
  'react', 'react-dom', 'scheduler', 'uuid',
  '@hugeicons/react', '@hugeicons/core-free-icons',
  'tailwindcss',
];
const NAMES = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'license', 'LICENCE', 'LICENSE-MIT'];
const bar = '='.repeat(78);

const parts = [];
for (const w of WORKS) {
  let text = '';
  if (w.file) {
    const file = path.join(ROOT, w.file);
    if (!fs.existsSync(file)) { console.error(`thirdPartyNotices: no licence file ${w.file}`); process.exit(1); }
    text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
  }
  parts.push(`${bar}\n${w.title}\n${w.link}\n${bar}\n\n${w.note}\n${text ? '\n' + text + '\n' : ''}`);
}
for (const name of SHIPPED) {
  const dir = path.join(ROOT, 'node_modules', ...name.split('/'));
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const file = NAMES.map(n => path.join(dir, n)).find(f => fs.existsSync(f));
  if (!file) { console.error(`thirdPartyNotices: no licence file for ${name}`); process.exit(1); }
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
  parts.push(`${bar}\n${name} ${pkg.version} (${pkg.license || 'see below'})\n${pkg.homepage || (pkg.repository && (pkg.repository.url || pkg.repository)) || ''}\n${bar}\n\n${text}\n`);
}
const head = 'iStrongEngine includes work by others: the works and open source packages below. Their licences follow.\n'
  + 'iStrongEngine itself is under the iStrongEngine Noncommercial License 1.0.0 (the file LICENSE), which covers only its creator\'s own work.\n\n';
const out = path.join(ROOT, 'public', 'THIRD-PARTY-NOTICES.txt');
const body = head + parts.join('\n');
if (!fs.existsSync(out) || fs.readFileSync(out, 'utf8') !== body) fs.writeFileSync(out, body);
console.log(`thirdPartyNotices: ${WORKS.length} works and ${SHIPPED.length} packages -> public/THIRD-PARTY-NOTICES.txt`);
