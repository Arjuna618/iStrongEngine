import React, { useRef, useState } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import { Upload, FolderOpen, ChevronDown, FileJson } from '../ui/icons';
import { useToast } from '../ui/Toast';
import { useDropMenu, DropMenu, menuOpen } from '../kit/DropMenu';
import { SwapText } from '../kit/Collapse';
import { importFiles, filesOfInput, KIND_WORD, type ImportSummary } from '../library/libraryImport';
import { routeProjectFiles } from '../project/projectActions';

interface Props {
  logic: GameLogic;
  onImportFile: () => void;
  onFolderImported?: (sum: ImportSummary) => void;
  label?: string;
  look?: 'button' | 'icon';
  block?: boolean;
  compact?: boolean;
  disabled?: boolean;
}

export function importSummaryLine(sum: ImportSummary): { kind: 'success' | 'info' | 'error'; text: string } {
  let added = 0;
  const parts: string[] = [];
  for (const k of Object.keys(sum.added)) { added += sum.added[k]; parts.push(`${sum.added[k]} ${KIND_WORD[k] ?? k}`); }
  const refused = sum.refused.length + sum.skipped.length;
  if (added === 0) {
    if (sum.duplicates.length > 0 && refused === 0) return { kind: 'info', text: 'Already loaded. Nothing new was added.' };
    return { kind: 'error', text: 'Invalid format. Nothing was imported.' };
  }
  let head = `Imported ${parts.join(', ')}.`;
  const changed = sum.changed.length, trimmed = sum.trimmed.length;
  if (changed > 0) head += ` ${changed} ${changed === 1 ? 'file was' : 'files were'} changed to fit the game.`;
  if (trimmed > 0) head += ` ${trimmed} ${trimmed === 1 ? 'file lost its' : 'files lost their'} projectile layers past the limit.`;
  if (refused > 0) return { kind: 'info', text: `${head} ${refused} ${refused === 1 ? 'file was' : 'files were'} not in the app's format.` };
  return { kind: changed > 0 || trimmed > 0 ? 'info' : 'success', text: head };
}

export const ImportButton: React.FC<Props> = ({ logic, onImportFile, onFolderImported, label = 'Import', look = 'button', block, compact, disabled }) => {
  const menu = useDropMenu({ align: 'end', estimatedHeight: 112 });
  const open = menuOpen(menu);
  const [busy, setBusy] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const { showToast } = useToast();
  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => menu.toggle(e.currentTarget.getBoundingClientRect());

  const runFolder = async (files: FileList | null) => {
    const all = filesOfInput(files);
    const picked = routeProjectFiles(all);
    if (picked.length === 0) return;
    setBusy(true);
    try {
      const sum = await importFiles(logic, picked);
      const line = importSummaryLine(sum);
      showToast(line.kind, line.text);
      if (onFolderImported) onFolderImported(sum);
    } catch (err) {
      console.error('[ImportButton] folder import failed', err);
      showToast('error', 'The import stopped: a file could not be read.');
    } finally { setBusy(false); }
  };

  return (
    <div className={`relative ${block ? 'w-full' : 'inline-flex'}`}>
      {look === 'icon' ? (
        <button type="button" ref={menu.triggerRef as React.RefObject<HTMLButtonElement>} className={`k-icon-btn k-icon-btn-md${open ? ' k-icon-btn-active' : ''}`} aria-label={label} title={label}
          aria-haspopup="menu" aria-expanded={open} disabled={disabled || busy} onClick={toggle}>
          <Upload size={16} />
        </button>
      ) : (
        <button type="button" ref={menu.triggerRef as React.RefObject<HTMLButtonElement>} className={`k-btn k-btn-secondary k-btn-md${block ? ' w-full' : ''}${compact ? ' k-btn-compact' : ''}`}
          aria-haspopup="menu" aria-expanded={open} disabled={disabled || busy} onClick={toggle}>
          <span className="k-btn-icon"><Upload size={compact ? 14 : 16} /></span>
          <SwapText className="truncate">{busy ? 'Importing' : label}</SwapText>
          {!compact && <span className="k-btn-icon"><ChevronDown size={14} className="text-[var(--text-tertiary)]" /></span>}
        </button>
      )}
      <DropMenu menu={menu} className="k-menu">
          <button type="button" role="menuitem" className="k-menu-item" onClick={() => { menu.close(); onImportFile(); }}>
            <FileJson size={16} />
            <span className="k-menu-text"><span className="k-menu-title">Import a file</span><span className="k-menu-sub">One file of the app, or a project</span></span>
          </button>
          <button type="button" role="menuitem" className="k-menu-item" onClick={() => { menu.close(); folderRef.current?.click(); }}>
            <FolderOpen size={16} />
            <span className="k-menu-text"><span className="k-menu-title">Import a folder</span><span className="k-menu-sub">Every app file inside, sub folders too</span></span>
          </button>
      </DropMenu>
      <input ref={folderRef} type="file" multiple className="hidden" {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        onChange={e => { const f = e.target.files; void runFolder(f); e.target.value = ''; }} />
    </div>
  );
};
