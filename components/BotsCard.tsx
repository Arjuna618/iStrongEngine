import React, { useState } from 'react';
import { TEXT_LIMITS } from './kit/textLimits';
import type { GameModeConfig } from '../types';
import type { GameLogic } from '../game/GameLogic';
import { Group, ToggleRow, SliderRow, Button, Switch, SearchField, EmptyState, emptyArt, headerIcon } from './kit/kit';
import { Modal } from './kit/Modal';
import { Reveal } from './kit/Collapse';
import { HelpTooltip } from './shared/HelpTooltip';
import { HdAiBrain01, SearchX } from './ui/icons';
import { FEEL_ROWS } from '../game/humanFeel';

type Feel = GameModeConfig['botFeel'];
const rowOn = (bf: Feel, key: string): boolean => { const e = bf?.rows?.[key]; return !e || e.on !== false; };

export const BotsCard: React.FC<{ logic: GameLogic; config: GameModeConfig; onUpdate: () => void }> = ({ logic, config, onUpdate }) => {
  const bf = config.botFeel;
  const [open, setOpen] = useState(false);
  const onCount = FEEL_ROWS.reduce((n, r) => n + (rowOn(bf, r.key) ? 1 : 0), 0);
  return (
    <Group title="Bots" icon={headerIcon(HdAiBrain01)} collapsible defaultOpen={false}>
      <ToggleRow label="Match Mood"
        help="Every match gets its own mood. How much the bots do each thing below is rolled when the match starts and rolled again every 3 to 15 minutes, so no two matches feel the same. Off: every behaviour stays at its strength for the whole match."
        checked={!bf || bf.mood !== false} onChange={v => { logic.setBotFeelMood(v); onUpdate(); }} />
      <p className="k-hint tabular-nums">{onCount} of {FEEL_ROWS.length} behaviours on</p>
      <Button block onClick={() => setOpen(true)} title="Every behaviour of this mode's bots, its switch and its strength">Bot Behaviours</Button>
      {open ? <BotBehavioursPopup logic={logic} config={config} onUpdate={onUpdate} onClose={() => setOpen(false)} /> : null} { }
    </Group>
  );
};

const BotBehavioursPopup: React.FC<{ logic: GameLogic; config: GameModeConfig; onUpdate: () => void; onClose: () => void }> = ({ logic, config, onUpdate, onClose }) => {
  const bf = config.botFeel;
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const rows = q === '' ? FEEL_ROWS : FEEL_ROWS.filter(r => r.title.toLowerCase().includes(q) || r.tip.toLowerCase().includes(q));
  const onCount = FEEL_ROWS.reduce((n, r) => n + (rowOn(bf, r.key) ? 1 : 0), 0);
  return (
    <Modal title="Bot Behaviours" icon={<HdAiBrain01 size={18} />} onClose={onClose} width={900} fit surface="content" phoneFull
      footer={close => <>
        <span className="k-hint tabular-nums flex-1 min-w-0 truncate">{onCount} of {FEEL_ROWS.length} on</span>
        <Button variant="primary" onClick={() => close()}>Done</Button>
      </>}>
      <div className="space-y-3">
        <SearchField value={query} onChange={setQuery} placeholder="Search behaviours" maxLength={TEXT_LIMITS.SEARCH_SMALL} />
        {rows.length === 0
          ? <EmptyState icon={emptyArt(SearchX)} title="No matches" hint={`No behaviour is named or described with "${query.trim()}".`} />
          : (
            <div className="k-dv-grid k-bf-grid">
              {rows.map(r => {
                const e = bf?.rows?.[r.key];
                const on = rowOn(bf, r.key);
                return (
                  <div key={r.key} className={on ? 'k-dv-tile k-bf-tile k-dv-tile-on' : 'k-dv-tile k-bf-tile'}>
                    <label className="k-bf-head">
                      <span className="k-dv-tile-text">
                        <span className="k-row-lead"><HelpTooltip text={r.tip} /></span>
                        <span className="k-dv-tile-label">{r.title}</span>
                      </span>
                      <Switch checked={on} onChange={v => { logic.setBotFeel(r.key, { on: v }); onUpdate(); }} label={r.title} />
                    </label>
                    {r.strength ? (
                      <Reveal when={on}>
                        <SliderRow label="Strength" help="How often the bots of this mode do it. 100 is as often as real players do. The match mood moves it up and down below this."
                          value={e?.strength ?? 100} onChange={v => { logic.setBotFeel(r.key, { strength: v }); onUpdate(); }} min={0} max={100} step={1} unit="%" />
                      </Reveal>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
      </div>
    </Modal>
  );
};
