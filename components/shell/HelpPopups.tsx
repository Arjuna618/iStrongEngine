import React from 'react';
import { Modal } from '../kit/Modal';
import { Keyboard, BadgeInfo } from '../ui/icons';
import { SHORTCUTS } from './shortcuts';
import { CURRENT_VERSION } from '../updates/version';
import { useProjectUi, projectSystem } from '../project/projectSystem';
import appLogo from '../ui/media/logo5.webp';
import type { LegalPage } from '../legal/LegalWindow';

function Keys({ keys }: { keys: string }) {
  return <span className="k-hp-keys">{keys.split(' ').map((k, i) => <span key={i} className="kbd-chip">{k}</span>)}</span>;
}

export const KeyboardShortcutsPopup: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Modal title="Keyboard Shortcuts" icon={<Keyboard size={18} />} size="md" onClose={onClose}>
    <div className="k-hp-table" role="table" aria-label="Keyboard shortcuts">
      {SHORTCUTS.map(s => (
        <div key={s.id} className="k-hp-row" role="row">
          <div className="k-hp-what" role="cell">
            <span className="k-hp-title">{s.what}</span>
            <span className="k-hp-where">{s.where}</span>
          </div>
          <div role="cell"><Keys keys={s.keys} /></div>
        </div>
      ))}
    </div>
  </Modal>
);

function mb(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export const AboutPopup: React.FC<{ onClose: () => void; onOpenLegal: (page: LegalPage) => void }> = ({ onClose, onOpenLegal }) => {
  const ui = useProjectUi();
  const f = ui.facts;
  const hub = projectSystem()?.hub ?? null;
  const kept = ui.view.storage !== 'memory' && !!f?.storage && !!hub;
  const bytes = hub ? hub.keptBytes() : 0;
  return (
    <Modal title="About iStrongEngine" icon={<BadgeInfo size={18} />} size="sm" onClose={onClose}>
      <div className="k-about">
        <img src={appLogo} alt="" className="k-about-logo" />
        <div className="k-about-name">iStrongEngine</div>
        <div className="k-about-version">Beta {CURRENT_VERSION}</div>
        <p className="k-modal-text">A free tank designer, sandbox and game engine, made for learning. It is not for sale, and it may never be used to make money.</p>
        {kept ? (
          <dl className="k-about-facts k-info-card">
            <dt>Your projects and files</dt><dd>{bytes === 0 ? 'Nothing yet' : mb(bytes)}</dd>
            <dt>Protected from automatic cleanup</dt><dd>{f?.protected ? 'Yes' : 'No'}</dd>
          </dl>
        ) : (
          <p className="k-about-small">Your work is not kept in this browser window (its storage is off). Use Download Project File to keep it.</p>
        )}
        <div className="k-about-legal">
          <button type="button" className="k-btn k-btn-secondary k-btn-sm" onClick={() => onOpenLegal('terms')}>Terms of Use</button>
          <button type="button" className="k-btn k-btn-secondary k-btn-sm" onClick={() => onOpenLegal('license')}>License</button>
          <button type="button" className="k-btn k-btn-secondary k-btn-sm" onClick={() => onOpenLegal('notices')}>Notices</button>
        </div>
        <p className="k-about-small">An independent project, not affiliated with or endorsed by the makers of any other game. Copyright 2026 Arjuna.</p>
      </div>
    </Modal>
  );
};
