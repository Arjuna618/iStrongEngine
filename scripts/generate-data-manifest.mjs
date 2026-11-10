import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildPacks, packListText, PACK_DIR, PACK_LIST_NAME, PACK_NAME_RE, PACK_MAX_BYTES, PACK_FORMAT } from './dataPacks.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = process.env.DATA_MANIFEST_ROOT ? path.resolve(process.env.DATA_MANIFEST_ROOT) : path.resolve(__dirname, '..');
const DATA_DIR = path.join(PROJECT_ROOT, 'Data');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'data');
const MANIFEST_PATH = path.join(PUBLIC_DIR, 'data-manifest.json');
const PACKS_DIR = path.join(PUBLIC_DIR, PACK_DIR);
const PACK_LIST_PATH = path.join(PUBLIC_DIR, PACK_LIST_NAME);
const EMPTY_PACK_LIST = packListText({ format: PACK_FORMAT, count: 0, packs: [], order: [] });

let scanIncomplete = false;

function collectJsonFiles(dir, basePath = '') {
  const results = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    scanIncomplete = true;
    console.warn(`  [WARN] Could not read ${dir}: ${err.message}`);
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectJsonFiles(fullPath, relPath));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      results.push({ fullPath, relPath });
    }
  }
  return results;
}

function extractMetadata(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const json = JSON.parse(raw);
    return {
      type: json.type || 'Unknown',
      name: json.name || path.basename(filePath, '.json'),
      version: json.version || '1.0.0',
      raw,
    };
  } catch (err) {
    console.warn(`  [WARN] Skipping ${filePath}: ${err.message}`);
    return null;
  }
}

const _destListCache = new Map();
function removeCaseMismatchedDest(destPath) {
  const dir = path.dirname(destPath);
  const base = path.basename(destPath);
  let names = _destListCache.get(dir);
  if (!names) {
    try { names = fs.readdirSync(dir); } catch { names = []; }
    _destListCache.set(dir, names);
  }
  const lower = base.toLowerCase();
  for (const name of names) {
    if (name !== base && name.toLowerCase() === lower) {
      try { fs.unlinkSync(path.join(dir, name)); } catch { }
    }
  }
}

console.log('[data-manifest] Scanning Data/ directory...');

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

if (!fs.existsSync(DATA_DIR)) {
  console.log('[data-manifest] Data/ directory not found. Writing empty manifest.');
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ generatedAt: Date.now(), files: [] }, null, 2));
  fs.writeFileSync(PACK_LIST_PATH, EMPTY_PACK_LIST);
  process.exit(0);
}

const jsonFiles = collectJsonFiles(DATA_DIR);

const _oldFix = (process.env.ISTRONG_OLD_FIX || '').split(',').map((s) => s.trim());
if (scanIncomplete && !_oldFix.includes('CC016') && !_oldFix.includes('all')) {
  console.error('[data-manifest] ABORT: a folder under Data/ could not be read (see the warning above). Nothing was written;');
  console.error('  the last good manifest, packs and list stay. Close what holds the folder and build again.');
  process.exit(1);
}

if (jsonFiles.length === 0) {
  console.log('[data-manifest] No .json files found in Data/. Writing empty manifest.');
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify({ generatedAt: Date.now(), files: [] }, null, 2));
  fs.writeFileSync(PACK_LIST_PATH, EMPTY_PACK_LIST);
  process.exit(0);
}

const manifestEntries = [];
const packInput = [];
let skipped = 0;
const typeCounts = { Tank: 0, TurretPreset: 0, CustomTurret: 0, CustomProjectile: 0, Map: 0, MultiAreaMap: 0, FoodShape: 0, Other: 0, Unknown: 0 };

for (const { fullPath, relPath } of jsonFiles) {
  const meta = extractMetadata(fullPath);
  if (!meta) {
    skipped++;
    continue;
  }

  const destPath = path.join(OUTPUT_DIR, relPath);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  removeCaseMismatchedDest(destPath);
  fs.copyFileSync(fullPath, destPath);

  const stat = fs.statSync(fullPath);
  const entry = {
    path: `data/${relPath}`,
    name: meta.name,
    type: meta.type,
    size: stat.size,
  };
  manifestEntries.push(entry);
  packInput.push({ path: entry.path, text: meta.raw });

  const typeKey = meta.type in typeCounts ? meta.type : 'Unknown';
  typeCounts[typeKey]++;
}

const sourceRelPaths = new Set(jsonFiles.map((f) => f.relPath));
let prunedCount = 0;
let prunedBytes = 0;
const foreignFiles = [];

function pruneDir(dir, basePath = '') {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  let kept = 0;
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      kept += pruneDir(fullPath, relPath);
      continue;
    }
    if (!entry.name.endsWith('.json')) {
      foreignFiles.push(relPath);
      kept++;
      continue;
    }
    if (sourceRelPaths.has(relPath)) {
      kept++;
      continue;
    }
    try {
      prunedBytes += fs.statSync(fullPath).size;
      fs.unlinkSync(fullPath);
      prunedCount++;
    } catch (err) {
      console.warn(`  [WARN] Could not remove ${relPath}: ${err.message}`);
      kept++;
    }
  }
  if (kept === 0 && basePath) {
    try { fs.rmdirSync(dir); } catch { }
  }
  return kept;
}

if (scanIncomplete) {
  console.warn('[data-manifest] Source scan was incomplete, SKIPPING the prune this run.');
} else {
  pruneDir(OUTPUT_DIR);
}

const missingOnDisk = [];
for (const entry of manifestEntries) {
  if (!fs.existsSync(path.join(PUBLIC_DIR, entry.path))) missingOnDisk.push(entry.path);
}
if (missingOnDisk.length > 0) {
  console.error(`[data-manifest] ABORT: ${missingOnDisk.length} manifest entr(ies) are not on disk.`);
  console.error(`  e.g. ${missingOnDisk.slice(0, 5).join(', ')}`);
  process.exit(1);
}

const manifest = {
  generatedAt: Date.now(),
  files: manifestEntries,
};
fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));

const { packs, list: packList } = buildPacks(packInput);
fs.mkdirSync(PACKS_DIR, { recursive: true });
let packsWritten = 0;
let packBytes = 0;
for (const pack of packs) {
  packBytes += pack.bytes;
  if (pack.bytes > PACK_MAX_BYTES) {
    console.error(`[data-packs] ABORT: the pack ${pack.name} is ${(pack.bytes / 1048576).toFixed(1)} MB; a host takes at most 25 MB a file.`);
    console.error('  Raise PACK_COUNT in scripts/dataPacks.mjs (every pack gets a new name once).');
    process.exit(1);
  }
  const dest = path.join(PACKS_DIR, pack.name);
  let have = false;
  try { have = fs.statSync(dest).size === pack.bytes; } catch { }
  if (have) continue;
  const parsed = JSON.parse(pack.text);
  if (parsed.format !== PACK_FORMAT || !Array.isArray(parsed.files) || parsed.files.length !== pack.files) {
    console.error(`[data-packs] ABORT: the pack ${pack.name} does not read back as written.`);
    process.exit(1);
  }
  const tmp = dest + '.tmp';
  fs.writeFileSync(tmp, pack.text);
  fs.renameSync(tmp, dest);
  packsWritten++;
}
fs.writeFileSync(PACK_LIST_PATH, packListText(packList));

const livePacks = new Set(packs.map((p) => p.name));
let packsRetired = 0;
const foreignInPacks = [];
for (const name of fs.readdirSync(PACKS_DIR)) {
  if (livePacks.has(name)) continue;
  if (PACK_NAME_RE.test(name) || name.endsWith('.json.tmp')) {
    try { fs.unlinkSync(path.join(PACKS_DIR, name)); packsRetired++; } catch (err) { console.warn(`  [WARN] Could not remove ${name}: ${err.message}`); }
  } else {
    foreignInPacks.push(name);
  }
}
for (const pack of packs) {
  let size = -1;
  try { size = fs.statSync(path.join(PACKS_DIR, pack.name)).size; } catch { }
  if (size !== pack.bytes) {
    console.error(`[data-packs] ABORT: the pack ${pack.name} is not on the disk as listed (${size} bytes, ${pack.bytes} expected).`);
    process.exit(1);
  }
}

console.log(`[data-manifest] Generated manifest with ${manifestEntries.length} files:`);
const turretTotal = typeCounts.TurretPreset + typeCounts.CustomTurret;
console.log(`  Tanks: ${typeCounts.Tank}, Turrets: ${turretTotal}${typeCounts.TurretPreset ? ` (${typeCounts.TurretPreset} presets, ${typeCounts.CustomTurret} legacy)` : ''}, Projectiles: ${typeCounts.CustomProjectile}, Maps: ${typeCounts.Map + typeCounts.MultiAreaMap}${typeCounts.MultiAreaMap ? ` (${typeCounts.MultiAreaMap} multi-area)` : ''}, Food Shapes: ${typeCounts.FoodShape}${typeCounts.Other ? `, Others: ${typeCounts.Other}` : ''}${typeCounts.Unknown ? `, Unknown: ${typeCounts.Unknown}` : ''}`);
if (skipped > 0) console.log(`  Skipped: ${skipped} (parse errors)`);
if (prunedCount > 0) console.log(`  Pruned: ${prunedCount} retired file(s), ${prunedBytes} bytes`);
if (foreignFiles.length > 0) console.log(`  [WARN] ${foreignFiles.length} non-JSON file(s) in ${OUTPUT_DIR} left untouched: ${foreignFiles.slice(0, 5).join(', ')}`);
console.log(`[data-manifest] Output: ${MANIFEST_PATH}`);
console.log(`[data-packs] ${packs.length} packs, ${(packBytes / 1048576).toFixed(1)} MB: ${packsWritten} new, ${packs.length - packsWritten} unchanged, ${packsRetired} retired`);
if (foreignInPacks.length > 0) console.log(`  [WARN] ${foreignInPacks.length} other file(s) in ${PACKS_DIR} left untouched: ${foreignInPacks.slice(0, 5).join(', ')}`);
