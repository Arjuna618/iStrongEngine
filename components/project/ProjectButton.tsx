import React, { useEffect } from 'react';
import { HdFileBox } from '../ui/icons';
import { useProjectUi } from './projectSystem';
import { hubWindow } from './hubWindow';
import { shortcutKeys } from '../shell/shortcuts';
import { InlineMotion } from '../kit/TagLine';

export const ProjectButton: React.FC<{ active: boolean }> = ({ active }) => {
  const ui = useProjectUi();
  const v = ui.view;
  useEffect(() => {
    document.title = active ? `${v.dirty ? '● ' : ''}${v.name} - iStrongEngine` : 'iStrongEngine';
  }, [active, v.dirty, v.name]);
  const state = v.readOnly ? 'Read only' : v.saving ? 'Saving' : v.dirty ? 'Unsaved changes' : 'Saved';
  const why = v.readOnly ? 'Read only: made with a newer version. ' : v.dirty ? `Unsaved changes, ${shortcutKeys('save')} saves them. ` : '';
  return (
    <button type="button" className="k-pb" onClick={() => hubWindow.set(true)} disabled={!active}
      data-tip={`${why}Open the Project Hub (${shortcutKeys('hub')})`} aria-label={`${v.name}, ${state}. Open the Project Hub`}>
      <HdFileBox size={15} className="shrink-0" />
      <span className="k-pb-main">
        <span className="k-pb-name" dir="auto">{v.name}</span>
        <InlineMotion side="l" items={v.readOnly ? [{ key: 'ro', node: <span className="k-pb-tag">Read only</span> }]
          : v.saving ? [{ key: 'saving', node: <span className="k-pb-state">Saving</span> }]
          : v.dirty ? [{ key: 'dirty', node: <span className="k-pb-dot" aria-hidden /> }] : []} />
      </span>
    </button>
  );
};
