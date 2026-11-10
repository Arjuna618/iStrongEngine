import { useEffect, useRef } from 'react';
import { projectKeyOf } from '../shell/shortcuts';
import { saveProject, saveProjectAs } from './projectActions';
import { hubWindow } from './hubWindow';
import { dialogOpen } from './dialogs';

function commitTyping(): Promise<void> {
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) el.blur();
  return new Promise(r => requestAnimationFrame(() => r()));
}

export function useProjectKeys(enabled: boolean): void {
  const on = useRef(enabled); on.current = enabled;
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const k = projectKeyOf(e);
      if (!k) return;
      e.preventDefault();
      if (!on.current || e.repeat || dialogOpen()) return;
      if (k === 'hub') { hubWindow.toggle(); return; }
      void commitTyping().then(async () => { if (k === 'save') await saveProject(); else await saveProjectAs(); });
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
}
