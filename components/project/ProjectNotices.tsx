import React, { useEffect, useRef } from 'react';
import { useProjectUi, projectSystem } from './projectSystem';
import { showNotice } from './dialogs';
import { dismissWarning, type StorageFacts } from '../../game/project/storageCheck';
import { downloadBytes } from './projectActions';
import { writeZip } from '../../game/project/zip';
import { canonicalBytes } from '../../game/project/canonical';
import { HdFileBox, ShieldQuestion } from '../ui/icons';
import { useMenuStage } from '../kit/motion';
import { useLeave } from '../kit/presence';
import { useFocusScope } from '../kit/focusScope';
import { letPageGo } from '../../utils/leaveGuard';

function warningText(f: StorageFacts): string {
  if (!f.storage) return 'This browser window cannot keep your work (its storage is off, for example in a private window). Your work is lost when the tab closes. Use Download Project File to keep it as a file.';
  if (f.wiped) return 'Your browser cleared the work this app had kept since your last visit. To be safe from this, download your projects now and then (File, Back Up Everything).';
  if (f.risky) return 'This browser may clear the work this app keeps if you do not visit for a while. Your projects stay safe if you download them now and then (File, Back Up Everything). Bookmarking this page can help the browser keep them.';
  if (f.protected) return 'Your browser promised to keep your work, so it never clears it by itself. Clearing the browsing data of this site still deletes it, so download your projects now and then (File, Back Up Everything).';
  return 'Your work is kept in this browser, but the browser does not promise to keep it: it may clear it when your disk is almost full, and clearing the browsing data of this site deletes it. To be safe, download your projects now and then (File, Back Up Everything). Bookmarking this page can help the browser keep them.';
}

export function showStorageWarning(f: StorageFacts, asked: boolean): Promise<boolean> {
  const title = asked ? 'Is my work safe?' : f.wiped ? 'Your browser cleared your work' : 'Your work may not be kept';
  return showNotice(title, warningText(f), { dontShow: !asked && !f.wiped, icon: ShieldQuestion });
}

async function recoveryFile(): Promise<void> {
  const s = projectSystem();
  const store = s?.session.storeOrNull;
  if (!store) return;
  const rec = await store.getMeta<{ at: number; heads: { refs: string[] }[] }>('recovery');
  if (!rec) return;
  const shas = [...new Set(rec.heads.flatMap(h => h.refs))];
  const blobs = await store.getBlobs(shas);
  const entries = [{ name: 'heads.json', data: canonicalBytes(rec) }];
  for (const [sha, b] of blobs) entries.push({ name: `blobs/${sha}.${b.enc === 'raw' ? 'zip' : 'bin'}`, data: b.bytes });
  downloadBytes(await writeZip(entries, { maxFile: Infinity, maxUnpacked: Infinity, maxEntries: Infinity }), 'iStrongEngine Recovery.zip', 'application/zip');
}

export const ProjectNotices: React.FC<{ active: boolean }> = ({ active }) => {
  const ui = useProjectUi();
  const shownBoot = useRef(false);
  const shownWarn = useRef(false);
  useEffect(() => {
    if (!active || shownBoot.current || !ui.boot) return;
    const b = ui.boot;
    shownBoot.current = true;
    projectSystem()?.clearBootNotice();
    if (b.lost) {
      void showNotice('Your last work could not be restored', 'It is kept aside and nothing was thrown away. The engine started fresh. You can download what is kept, so it can be repaired later.',
        { extra: { label: 'Download It', run: () => { void recoveryFile(); } } });
    } else if (b.problems.length > 0) {
      void showNotice('Some parts could not be restored', 'Your work came back, except these parts, which started fresh:', { list: b.problems.map(p => `${p.part}: ${p.why}`) });
    }
    if (b.missing.length > 0) {
      void showNotice('Some built in content is missing', 'This version of the app does not have everything your work uses. The missing parts are kept, so they come back with an update that has them.', { list: b.missing });
    }
  }, [active, ui.boot]);
  useEffect(() => {
    if (!active || shownWarn.current || !ui.warn || !ui.facts) return;
    shownWarn.current = true;
    void showStorageWarning(ui.facts, false).then(dontShow => { if (dontShow) dismissWarning(); projectSystem()?.hideWarning(); });
  }, [active, ui.warn, ui.facts]);
  const want: 'newer' | 'tab' | null = ui.view.storage === 'newer' ? 'newer' : (!ui.writer && active) ? 'tab' : null;
  const stage = useMenuStage(want);
  const coverRef = useRef<HTMLDivElement>(null);
  useLeave(coverRef, stage.leaving, 'fade');
  useFocusScope(coverRef);
  if (stage.shown === 'newer') {
    return (
      <div ref={coverRef} className={`k-backdrop k-pn-cover animate-fadeIn${stage.leaving ? ' pointer-events-none' : ''}`} role="alertdialog" aria-modal="true" tabIndex={-1} aria-label="A newer version is open">
        <div className="k-pn-card">
          <HdFileBox size={28} strokeWidth={1.5} absoluteStrokeWidth />
          <div className="k-pn-title">A newer version of iStrongEngine is open</div>
          <p className="k-modal-text">Your work was saved by a newer version in another tab. Reload this page to use it, so nothing is overwritten.</p>
          <button type="button" className="k-btn k-btn-primary k-btn-md" onClick={() => (letPageGo(), window.location.reload())}>Reload</button>
        </div>
      </div>
    );
  }
  if (stage.shown === 'tab') {
    return (
      <div ref={coverRef} className={`k-backdrop k-pn-cover animate-fadeIn${stage.leaving ? ' pointer-events-none' : ''}`} role="alertdialog" aria-modal="true" tabIndex={-1} aria-label="Open in another tab">
        <div className="k-pn-card">
          <HdFileBox size={28} strokeWidth={1.5} absoluteStrokeWidth />
          <div className="k-pn-title">iStrongEngine is open in another tab</div>
          <p className="k-modal-text">Only one tab can work on your projects at a time, so nothing is overwritten. Use it here to move your work to this tab.</p>
          <button type="button" className="k-btn k-btn-primary k-btn-md" onClick={() => { void projectSystem()?.tabs?.takeOver(); }}>Use Here</button>
        </div>
      </div>
    );
  }
  return null;
};
