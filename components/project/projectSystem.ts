import { useSyncExternalStore } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import { projectsEnabled } from '../../game/project/switch';
import { showNotice } from './dialogs';
import { ProjectStore, StoreBlockedError } from '../../game/project/projectStore';
import { ProjectSession, type SessionView, type PanelsPort } from '../../game/project/session';
import { ProjectHub } from '../../game/project/hub';
import { startTabLock, type TabLock } from '../../game/project/tabs';
import { checkStorage, needsWarning, warningDismissed, type StorageFacts } from '../../game/project/storageCheck';
import { loadPersonPrefs, savePersonPrefs } from '../../game/project/personPrefs';
import { panelMemory } from '../kit/panelMemory';
import { projectMarks, applyProjectMarks, setLibraryStoreOnChange } from '../library/libraryStore';

const LIBRARY_MARKS = 'library.marks';
import { toolStore } from '../shell/toolStore';
import { TOOL_ORDER, type Tool } from '../shell/engineTools';
import type { ApplyReport } from '../../game/project/snapshot';

export interface BootNotice {
  problems: { part: string; why: string }[];
  missing: string[];
  lost: boolean;
}

export interface ProjectUi {
  view: SessionView;
  writer: boolean;
  facts: StorageFacts | null;
  warn: boolean;
  boot: BootNotice | null;
  version: number;
}

let _pointerDown = false;
function handBusy(): boolean {
  if (_pointerDown) return true;
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable || el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const t = (el as HTMLInputElement).type;
  return t === 'text' || t === 'number' || t === 'search' || t === '' || t === 'email' || t === 'url';
}

class ProjectSystem {
  readonly session: ProjectSession;
  hub: ProjectHub | null = null;
  tabs: TabLock | null = null;
  private listeners = new Set<() => void>();
  private ui: ProjectUi;

  constructor(readonly logic: GameLogic, private store: ProjectStore | null, readonly appVersion: string) {
    const port: PanelsPort = {
      capture: () => {
        const p = panelMemory.capture(toolStore.get());
        p.values = { ...p.values, [LIBRARY_MARKS]: projectMarks() };
        return p;
      },
      apply: (p) => {
        applyProjectMarks(p.values[LIBRARY_MARKS]);
        panelMemory.apply(p);
        if ((TOOL_ORDER as readonly string[]).includes(p.tool)) this.onTool?.(p.tool as Tool);
      },
      busy: handBusy,
    };
    this.session = new ProjectSession(logic, store, port, appVersion);
    this.ui = { view: { ...this.session.view }, writer: true, facts: null, warn: false, boot: null, version: 0 };
    this.session.subscribe(() => this.refresh());
    if (store) {
      this.hub = new ProjectHub(store, this.session, appVersion);
      this.hub.subscribe(() => this.refresh());
      this.session.onPruned = ({ versions, deleted }) => {
        void this.hub?.reload();
        const parts = [
          ...(versions > 0 ? [`${versions} older saved ${versions === 1 ? 'version' : 'versions'}`] : []),
          ...(deleted > 0 ? [`${deleted} ${deleted === 1 ? 'item' : 'items'} in Recently Deleted`] : []),
        ];
        void showNotice('The browser storage was full', `To keep saving your work, this was removed for good: ${parts.join(' and ')}. Your open work and the newest version of every project are safe.`);
      };
      store.onNewerElsewhere = () => { this.session.view.storage = 'newer'; this.refresh(); };
    }
  }

  onTool: ((t: Tool) => void) | null = null;

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  get snapshot(): ProjectUi { return this.ui; }
  private refresh(): void {
    this.ui = {
      view: { ...this.session.view }, writer: this.tabs ? this.tabs.isWriter() : true, facts: this.ui.facts,
      warn: this.ui.warn, boot: this.ui.boot, version: this.ui.version + 1,
    };
    this.listeners.forEach(f => f());
    _uiListeners.forEach(f => f());
  }

  async boot(): Promise<void> {
    const prefs = loadPersonPrefs(this.logic.state);
    if (Object.keys(prefs).length > 0) this.logic.updateState(prefs);
    this.logic.projectMarkBuiltIns();
    if (this.store) {
      const tabs = startTabLock();
      this.tabs = tabs;
      tabs.setBeforeRelease(() => this.session.flush());
      tabs.subscribe(() => {
        const was = this.session.writer;
        this.session.writer = tabs.isWriter();
        if (!was && this.session.writer && this.session.view.ready) void this.reloadFromStore();
        this.refresh();
      });
      await new Promise(r => setTimeout(r, 60));
      this.session.writer = tabs.isWriter();
    }
    let notice: BootNotice = { problems: [], missing: [], lost: false };
    try {
      const r = await this.session.boot();
      notice = { problems: r.problems, missing: r.report?.missing ?? [], lost: r.lost };
    } catch (e) {
      console.error('[project] the boot restore failed', e);
    }
    if (this.hub) { try { await this.hub.reload(); } catch (e) { console.error('[project] the Hub could not be read', e); } }
    let facts: StorageFacts | null = null;
    try { facts = await checkStorage(this.store); } catch { facts = null; }
    this.ui = { ...this.ui, facts, warn: !!facts && needsWarning(facts) && !warningDismissed(), boot: notice };
    this.refresh();
    if (this.store) {
      const st = this.store;
      const idle = typeof requestIdleCallback === 'function' ? requestIdleCallback : (cb: () => void) => setTimeout(cb, 2000);
      idle(() => { void st.collect(Date.now()).then(() => this.session.forgetStored()).catch(() => { }); });
    }
  }

  private async reloadFromStore(): Promise<void> {
    try { await this.session.reloadFromStore(); } catch (e) { console.error('[project] the work could not be read again', e); }
  }

  poke(): void {
    if (this.logic.state.isTestMode) return;
    savePersonPrefs(this.logic.state);
    this.session.poke();
  }

  clearBootNotice(): void { this.ui = { ...this.ui, boot: null }; this.refresh(); }
  hideWarning(): void { this.ui = { ...this.ui, warn: false }; this.refresh(); }

  installPageHooks(): () => void {
    const down = () => { _pointerDown = true; };
    const quiet = () => { if (toolStore.get() === 'map-designer') this.poke(); };
    const up = () => { _pointerDown = false; quiet(); };
    const hide = () => { if (document.visibilityState === 'hidden') void this.session.flush(); };
    const leave = () => { void this.session.flush(); };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    window.addEventListener('blur', up);
    window.addEventListener('wheel', quiet, { capture: true, passive: true });
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', leave);
    return () => {
      window.removeEventListener('wheel', quiet, true);
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      window.removeEventListener('blur', up);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', leave);
    };
  }
}

let _sys: ProjectSystem | null = null;
let _starting: Promise<ProjectSystem> | null = null;
const _uiListeners = new Set<() => void>();

export function startProjectSystem(logic: GameLogic, appVersion: string): Promise<ProjectSystem> {
  if (_sys) return Promise.resolve(_sys);
  if (_starting) return _starting;
  _starting = (async () => {
    let store: ProjectStore | null = null;
    if (projectsEnabled()) {
      try { store = await ProjectStore.open(); }
      catch (e) { console.error(e instanceof StoreBlockedError ? e.message : '[project] storage is not available', e); store = null; }
    }
    _sys = new ProjectSystem(logic, store, appVersion);
    panelMemory.setOnChange(() => _sys?.poke());
    setLibraryStoreOnChange(() => _sys?.poke());
    toolStore.subscribe(() => _sys?.poke());
    _uiListeners.forEach(f => f());
    return _sys;
  })();
  return _starting;
}

export function projectSystem(): ProjectSystem | null { return _sys; }

const EMPTY_UI: ProjectUi = {
  view: { projectId: null, name: 'Untitled Project', dirty: false, saving: false, readOnly: false, storage: 'memory', ready: false, lastSavedAt: 0, full: false },
  writer: true, facts: null, warn: false, boot: null, version: 0,
};
const subscribeUi = (f: () => void) => { _uiListeners.add(f); return () => { _uiListeners.delete(f); }; };
const uiNow = () => (_sys ? _sys.snapshot : EMPTY_UI);

export function useProjectUi(): ProjectUi {
  return useSyncExternalStore(subscribeUi, uiNow, () => EMPTY_UI);
}

export type { ApplyReport };
