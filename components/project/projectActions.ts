import { SMALL_FIX } from '../../game/smallFixSwitch';
import { projectSystem } from './projectSystem';
import { askChoice, askName, showNotice } from './dialogs';
import { FileNew, Save, SaveAs, Pencil, RotateCcw, BackupAll, TriangleAlert } from '../ui/icons';
import { toast } from '../ui/Toast';
import { cleanName, safeFileName, NAME_MAX, nextFreeName } from '../../game/project/hubNaming';
import { PROJECT_EXT } from '../../game/project/format';
import { askToKeep } from '../../game/project/storageCheck';
import { UNTITLED } from '../../game/project/session';
import type { HubItem } from '../../game/project/projectStore';
import type { Prepared } from '../../game/project/hub';
import type { ExportFile } from '../../types';
import type { PickedFile } from '../library/libraryImport';

export function downloadBytes(bytes: Uint8Array, fileName: string, mime = 'application/octet-stream'): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function sys() {
  const s = projectSystem();
  if (!s) throw new Error('The project system is not ready yet.');
  return s;
}

function errText(e: unknown): string { return e instanceof Error ? e.message : 'Something went wrong.'; }

function validateProjectName(except: string | null) {
  return (raw: string): string | null => {
    const n = cleanName(raw, NAME_MAX);
    if (!n) return 'A name cannot be empty.';
    const hub = projectSystem()?.hub;
    if (hub && hub.list().some(i => i.kind === 'project' && i.deletedAt === null && i.id !== except && i.name.toLowerCase() === n.toLowerCase())) return 'That name is taken.';
    return null;
  };
}

async function leaveCurrent(next: { open: string } | { newProject: true }): Promise<boolean> {
  const s = sys();
  await s.session.settle();
  const v = s.session.view;
  if (!v.dirty) return true;
  const current = v.projectId === null ? 'Your current work is not saved as a project yet' : `Your changes to "${v.name}" are not saved`;
  const ans = 'open' in next
    ? await askChoice(`Open "${next.open}"?`,
      `${current}. Opening "${next.open}" replaces what is on screen now. Save it first?`,
      [{ label: 'Cancel', value: 'cancel' }, { label: 'Open Without Saving', value: 'discard' }, { label: 'Save, Then Open', value: 'save', primary: true }], 'cancel')
    : await askChoice('New Project',
      `${current}. A new project replaces what is on screen now. Save it first?`,
      [{ label: 'Cancel', value: 'cancel' }, { label: "Don't Save", value: 'discard' }, { label: 'Save, Then Start', value: 'save', primary: true }], 'cancel', undefined, FileNew);
  if (ans === 'cancel') return false;
  if (ans === 'save') return saveProject();
  return true;
}

export async function newProject(): Promise<boolean> {
  const s = sys();
  await s.session.settle();
  if (s.session.view.dirty) {
    if (!(await leaveCurrent({ newProject: true }))) return false;
  } else {
    const ans = await askChoice('New Project', 'Start a new project? Everything goes back to a fresh start. Your saved projects stay in the Project Hub.',
      [{ label: 'Cancel', value: 'cancel' }, { label: 'New Project', value: 'new', primary: true }], 'cancel', undefined, FileNew);
    if (ans !== 'new') return false;
  }
  try {
    await s.session.newProject();
    toast('success', 'New project started.');
    return true;
  } catch (e) { toast('error', errText(e)); return false; }
}

export async function saveProject(): Promise<boolean> {
  const s = sys();
  const v = s.session.view;
  if (!s.hub) { await showNotice('Projects are not kept here', 'This browser window cannot keep projects (its storage is off, for example in a private window). Use Download Project File to keep your work as a file.'); return false; }
  if (v.readOnly) { await showNotice('Made with a newer version', 'This project was made with a newer version of iStrongEngine, so this version can only show it. Update the app to save it, or use Save As to keep a copy.'); return false; }
  let name = v.name;
  if (v.projectId === null) {
    const n = await askName('Save Project', 'Project name', v.name === UNTITLED ? 'My Project' : v.name, 'Save', validateProjectName(null), Save);
    if (n === null) return false;
    name = cleanName(n);
  }
  try {
    const first = !s.hub.list().some(i => i.kind === 'project');
    const item = await s.session.save({ name });
    s.hub.noteSaved(item);
    if (first) void askToKeep();
    await writeLinkedDisk(item);
    toast('success', `Saved "${item.name}"`);
    return true;
  } catch (e) {
    toast('error', errText(e));
    return false;
  }
}

export async function saveProjectAs(): Promise<boolean> {
  const s = sys();
  if (!s.hub) return saveProject();
  const v = s.session.view;
  const base = v.name === UNTITLED ? 'My Project' : `${v.name} copy`;
  const n = await askName('Save As', 'New project name', base, 'Save', validateProjectName(null), SaveAs);
  if (n === null) return false;
  try {
    const item = await s.session.save({ name: cleanName(n), asNew: true });
    s.hub.noteSaved(item);
    toast('success', `Saved "${item.name}"`);
    return true;
  } catch (e) { toast('error', errText(e)); return false; }
}

export async function askBeforeModeSwitch(modeName: string): Promise<boolean> {
  const ans = await askChoice('This Map Holds Work',
    `${modeName} comes with its own map and its own Map Events, so your work on this map is not kept. Save it as a project first to keep it.`,
    [{ label: 'Cancel', value: 'cancel' }, { label: 'Switch', value: 'switch' }, { label: 'Save As Project', value: 'save', primary: true }], 'cancel');
  if (ans === 'cancel') return false;
  if (ans === 'switch') return true;
  try { return await saveProjectAs(); } catch (e) { toast('error', errText(e)); return false; }
}

export async function renameCurrent(): Promise<void> {
  const s = sys();
  const v = s.session.view;
  const n = await askName('Rename Project', 'Project name', v.name === UNTITLED ? 'My Project' : v.name, 'Rename', validateProjectName(v.projectId), Pencil);
  if (n === null) return;
  const name = cleanName(n);
  if (v.projectId && s.hub) {
    let err: string | null | undefined;
    if (SMALL_FIX.R829) { try { err = await s.hub.rename(v.projectId, name); } catch (e) { toast('error', errText(e)); return; } }
    else err = await s.hub.rename(v.projectId, name);
    if (err) toast('error', err);
  } else {
    s.session.renamed(name);
  }
}

export async function openHubItem(item: HubItem, versionIndex?: number): Promise<boolean> {
  const s = sys();
  if (!s.hub) return false;
  const same = s.session.view.projectId === item.id && versionIndex === undefined;
  if (same) await s.session.settle();
  if (!same && !(await leaveCurrent({ open: item.name }))) return false;
  if (same && s.session.view.dirty) {
    const ans = await askChoice(`Open "${item.name}" again?`, 'It is already open. Opening its saved version drops your unsaved changes.',
      [{ label: 'Cancel', value: 'cancel' }, { label: 'Open Saved Version', value: 'open', primary: true }], 'cancel');
    if (ans !== 'open') return false;
  } else if (same) {
    return true;
  }
  try {
    const bytes = await s.hub.projectBytes(item, versionIndex);
    const r = await s.session.readBytes(bytes.slice());
    let as = { projectId: item.id as string | null, name: item.name, savedHash: item.contentHash as string | null, readOnly: !!item.readOnly };
    if (r.read.problems.length > 0 && !r.read.readOnly) {
      const ans = await askChoice('Some parts could not be read', `Parts of "${item.name}" could not be read. Open the rest as a separate copy? The original stays as it is.`,
        [{ label: 'Cancel', value: 'cancel' }, { label: 'Open the Rest', value: 'rest', primary: true }], 'cancel', r.read.problems.map(p => `${p.part}: ${p.why}`), TriangleAlert);
      if (ans !== 'rest') return false;
      as = { projectId: null, name: cleanName(`${item.name} (Recovered)`), savedHash: null, readOnly: false };
    }
    const res = await s.session.openRead(r, as);
    if (as.projectId) await s.hub.markOpened(item.id);
    if (res.report.missing.length > 0) {
      void showNotice('Some built in content is missing', 'This version of the app does not have everything the project uses. The project opened, and the missing parts are kept, so they come back with an update that has them.', { list: res.report.missing });
    }
    if (res.readOnly) toast('info', `"${item.name}" was made with a newer version. It opened read only.`);
    else toast('success', `Opened "${as.name}"`);
    return true;
  } catch (e) { toast('error', errText(e)); return false; }
}

export async function revertToSaved(): Promise<void> {
  const s = sys();
  const v = s.session.view;
  const item = v.projectId && s.hub ? s.hub.get(v.projectId) : undefined;
  if (!item) { toast('info', 'This project has no saved version yet.'); return; }
  const ans = await askChoice('Revert to Saved', `Go back to the last saved version of "${v.name}"? Your unsaved changes are dropped.`,
    [{ label: 'Cancel', value: 'cancel' }, { label: 'Revert', value: 'revert', primary: true }], 'cancel', undefined, RotateCcw);
  if (ans !== 'revert') return;
  try {
    const bytes = await s.hub!.projectBytes(item);
    const r = await s.session.readBytes(bytes.slice());
    let as = { projectId: item.id as string | null, name: item.name, savedHash: item.contentHash as string | null, readOnly: !!item.readOnly };
    if (SMALL_FIX.R832 && r.read.problems.length > 0 && !r.read.readOnly) {
      const rest = await askChoice('Some parts could not be read', `Parts of "${item.name}" could not be read. Open the rest as a separate copy? The original stays as it is.`,
        [{ label: 'Cancel', value: 'cancel' }, { label: 'Open the Rest', value: 'rest', primary: true }], 'cancel', r.read.problems.map(p => `${p.part}: ${p.why}`), TriangleAlert);
      if (rest !== 'rest') return;
      as = { projectId: null, name: cleanName(`${item.name} (Recovered)`), savedHash: null, readOnly: false };
    }
    const res = await s.session.openRead(r, as);
    if (SMALL_FIX.R832 && res.report.missing.length > 0) {
      void showNotice('Some built in content is missing', 'This version of the app does not have everything the project uses. The project opened, and the missing parts are kept, so they come back with an update that has them.', { list: res.report.missing });
    }
    toast('success', as.projectId ? 'Reverted to the saved version.' : `Opened "${as.name}"`);
  } catch (e) { toast('error', errText(e)); }
}

export async function downloadCurrent(): Promise<void> {
  const s = sys();
  try {
    const packed = await s.session.packCurrent();
    const fileName = safeFileName(s.session.view.name, PROJECT_EXT);
    downloadBytes(packed.bytes, fileName);
    if (s.session.view.projectId && s.hub) await s.hub.markDownloaded(s.session.view.projectId);
    toast('success', `Downloaded "${fileName}"`);
  } catch (e) { toast('error', errText(e)); }
}

type FileHandleLike = {
  queryPermission?: (o: { mode: 'readwrite' }) => Promise<string>;
  requestPermission?: (o: { mode: 'readwrite' }) => Promise<string>;
  createWritable: () => Promise<{ write: (d: Blob) => Promise<void>; close: () => Promise<void> }>;
  name: string;
};

export function canSaveToDisk(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker === 'function';
}

async function writeHandle(h: FileHandleLike, bytes: Uint8Array): Promise<void> {
  let perm = h.queryPermission ? await h.queryPermission({ mode: 'readwrite' }) : 'granted';
  if (perm !== 'granted' && h.requestPermission) perm = await h.requestPermission({ mode: 'readwrite' });
  if (perm !== 'granted') throw new Error('The browser did not allow writing the file.');
  const w = await h.createWritable();
  await w.write(new Blob([bytes as BlobPart]));
  await w.close();
}

async function writeLinkedDisk(item: HubItem): Promise<void> {
  const s = sys();
  const store = s.session.storeOrNull;
  if (!store || !canSaveToDisk() || !s.hub) return;
  const h = await store.getMeta<FileHandleLike>('disk:' + item.id).catch(() => undefined);
  if (!h) return;
  try { await writeHandle(h, await s.hub.projectBytes(item)); }
  catch { toast('info', 'The project file on disk could not be written. Use Save to Disk again.'); }
}

export async function saveToDisk(): Promise<void> {
  const s = sys();
  if (!canSaveToDisk()) return;
  if (!(await saveProject())) return;
  const id = s.session.view.projectId;
  const item = id && s.hub ? s.hub.get(id) : undefined;
  if (!item || !s.hub) return;
  try {
    const picker = (window as unknown as { showSaveFilePicker: (o: unknown) => Promise<FileHandleLike> }).showSaveFilePicker;
    const h = await picker({ suggestedName: safeFileName(item.name, PROJECT_EXT), types: [{ description: 'iStrongEngine Project', accept: { 'application/octet-stream': [PROJECT_EXT] } }] });
    await writeHandle(h, await s.hub.projectBytes(item));
    await s.session.storeOrNull?.setMeta('disk:' + item.id, h);
    toast('success', `Saved to "${h.name}"`);
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return;
    toast('error', errText(e));
  }
}

export function keepExportCopy(file: ExportFile): void {
  const hub = projectSystem()?.hub;
  if (!hub) return;
  void hub.addExportedFile(file).then(r => {
    if (!r.existed && r.renamed) toast('info', `Kept in the Project Hub as "${r.item.name}"`);
  }).catch(e => console.error('[project] the exported file could not be kept', e));
}

export async function backupAll(): Promise<boolean> {
  const s = sys();
  if (!s.hub) { toast('error', 'This browser window cannot keep projects, so there is nothing to back up.'); return false; }
  if (!s.hub.hasBackupContent()) {
    await showNotice('Nothing to back up yet', 'Back Up Everything keeps your saved projects and your Custom User Files in one file, and the Project Hub has none yet. Save your work as a project first (Ctrl S).', { icon: BackupAll });
    return false;
  }
  try {
    const { bytes, fileName } = await s.hub.backupAll();
    downloadBytes(bytes, fileName);
    toast('success', `Downloaded "${fileName}"`);
    return true;
  } catch (e) { toast('error', errText(e)); return false; }
}

export const APP_FILE_ACCEPT = '.json,.istrong,.istrongbackup,application/json';

export function isProjectFileName(name: string): boolean { return /\.(istrong|istrongbackup)$/i.test(name); }

let _hubImporting: Promise<unknown> = Promise.resolve();

export interface HubImportOpts {
  onStart?: () => void;
  onProgress?: (done: number, total: number) => void;
  stopped?: () => boolean;
  onAdded?: (added: HubItem[]) => void;
  open?: (item: HubItem) => void;
}

export function importToHub(picked: readonly PickedFile[], opts: HubImportOpts = {}): Promise<HubItem[]> {
  const run = async (): Promise<HubItem[]> => {
    const s = sys();
    const hub = s.hub;
    if (!hub) {
      await showNotice('Projects are not kept here', 'This browser window cannot keep projects (its storage is off, for example in a private window), so project files cannot be added.');
      return [];
    }
    if (picked.length === 0) return [];
    opts.onStart?.();
    const res = await hub.prepare(
      picked.map(p => ({ name: p.file.name, path: p.path, read: async () => new Uint8Array(await p.file.arrayBuffer()) })),
      opts.onProgress, opts.stopped,
    );
    let addCopies = false;
    if (res.duplicates.length === 1) {
      const d = res.duplicates[0];
      const taken = hub.list().filter(i => i.kind === d.kind && i.deletedAt === null).map(i => i.name);
      const as = nextFreeName(d.name, taken);
      const msg = d.kind === 'project' && d.dup === 'version'
        ? `A different version of "${d.name}" is already in your Project Hub. Add this one as "${as}"?`
        : `"${d.name}" is already in your Project Hub. Add it again as "${as}"?`;
      addCopies = (await askChoice('Already in your Project Hub', msg, [{ label: 'Cancel', value: 'no' }, { label: 'Add Copy', value: 'yes', primary: true }], 'no')) === 'yes';
    } else if (res.duplicates.length > 1) {
      addCopies = (await askChoice('Already in your Project Hub', `${res.duplicates.length} of these are already in your Project Hub. Add them again as copies with a number?`,
        [{ label: 'Skip Them', value: 'no' }, { label: 'Add Copies', value: 'yes', primary: true }], 'no', res.duplicates.map(d => d.name))) === 'yes';
    }
    const added = await hub.commit([...res.ready, ...(addCopies ? res.duplicates : [])] as Prepared[], addCopies);
    const projects = added.filter(a => a.kind === 'project'), files = added.filter(a => a.kind === 'file');
    const parts: string[] = [];
    if (projects.length) parts.push(`${projects.length} project${projects.length === 1 ? '' : 's'}`);
    if (files.length) parts.push(`${files.length} file${files.length === 1 ? '' : 's'}`);
    if (added.length > 0) {
      const one = projects.length === 1 && files.length === 0 ? projects[0] : null;
      const open = opts.open ?? ((it: HubItem) => { void openHubItem(it); });
      toast('success', one ? `Added "${one.name}" to your Project Hub.` : `Added ${parts.join(' and ')} to your Project Hub.`, one ? { label: 'Open', run: () => open(one) } : undefined);
      opts.onAdded?.(added);
    }
    const bad = [
      ...res.refused.map(r => `${r.file}: ${r.why}`),
      ...res.skipped.map(x => `${x}: not a file of the app (only projects, backups and the app's own files can be added)`),
      ...res.emptyBackups.map(b => `${b}: an empty backup. It was made while the Project Hub had no projects and no files, so it holds nothing to add.`),
    ];
    if (bad.length > 0) {
      void showNotice(added.length > 0 ? 'Some files were not added' : 'Nothing was added', 'Each file below is listed with the reason it was left out.', { list: bad });
    } else if (added.length === 0 && res.duplicates.length === 0) {
      toast('info', opts.stopped?.() ? 'The import was stopped before anything was added.' : 'Nothing new was added: these files were already in this drop.');
    }
    return added;
  };
  const p = _hubImporting.then(run, run).catch((e): HubItem[] => { toast('error', e instanceof Error ? e.message : 'The import stopped.'); return []; });
  _hubImporting = p;
  return p;
}

export function routeProjectFiles(picked: readonly PickedFile[]): PickedFile[] {
  const toHub = picked.filter(p => isProjectFileName(p.file.name));
  if (toHub.length > 0) void importToHub(toHub);
  return picked.filter(p => !isProjectFileName(p.file.name));
}
