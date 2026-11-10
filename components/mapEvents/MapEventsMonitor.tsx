import React, { useEffect, useState } from 'react';
import type { GameLogic } from '../../game/GameLogic';
import { Modal, useModalClose } from '../kit/Modal';
import { Button, SearchField, Tabs } from '../kit/kit';
import { Fade } from '../kit/Collapse';
import { LongList } from '../kit/LongList';
import { EvEmpty } from './EvEmpty';
import { NumberBox } from '../kit/NumberBox';
import { VirtualList } from '../kit/VirtualList';
import { useModalMaxHeight, useModalMaxWidth } from '../../utils/useMenuScale';
import { isTouchScreen, isPhoneUi } from '../../utils/device';
import { MevEvents as Activity } from '../ui/icons';
import { toast } from '../ui/Toast';
import { SMALL_FIX } from '../../game/smallFixSwitch';

type Tab = 'waves' | 'events' | 'objects' | 'made' | 'log';
type MonBody = ReturnType<NonNullable<ReturnType<GameLogic['mevMonitor']>>['monitorBodies']>[number];

const BodyRow: React.FC<{ b: MonBody; logic: GameLogic; onKill: () => void; onDone: () => void; onShow: () => void }> = ({ b, logic, onKill, onDone, onShow }) => {
  const close = useModalClose();
  const what = [b.type, b.form].filter(w => w !== '').join(', ');
  return (
    <div className="k-ev-b-row k-ev-mon-rule">
      <span className="k-ev-mon-name">{b.name}</span>
      <span className="k-ev-sentence">{`${what !== '' ? what + '. ' : ''}${b.health} % health`}</span>
      <Button size="sm" variant="secondary" title="Closes this window and the camera follows it. Press any key or click to come back." onClick={() => close(() => { onShow(); logic.debugWatch(b.id, b.x, b.y); onDone(); })}>Show</Button>
      <Button size="sm" variant="secondary" onClick={onKill}>Kill</Button>
    </div>
  );
};
const ROW_H = 24;

export const MapEventsMonitor: React.FC<{ logic: GameLogic; onClose: () => void; onShow?: () => void }> = ({ logic, onClose, onShow }) => {
  const [tab, setTab] = useState<Tab>('waves');
  const [, tick] = useState(0);
  const [setTo, setSetTo] = useState(10);
  const [q, setQ] = useState('');
  const vm = logic.mevMonitor();
  const phone = isPhoneUi();
  const maxH = useModalMaxHeight(phone ? 0 : undefined);
  const maxW = useModalMaxWidth(phone ? 0 : undefined);
  const touch = isTouchScreen();
  const narrowMon = touch && Math.min(880, maxW) < 600;
  const bodyH = touch ? Math.max(140, Math.min(620, maxH - 90)) : Math.max(280, Math.min(620, maxH - 90));
  useEffect(() => {
    logic.mevMonitorOpen(true);
    const t = window.setInterval(() => tick(n => n + 1), 250);
    return () => { window.clearInterval(t); logic.mevMonitorOpen(false); };
  }, [logic]);
  if (!vm) return (
    <Modal title="Map Events Monitor" icon={<Activity size={18} />} size="md" onClose={onClose}>
      <EvEmpty icon={Activity} name="Nothing to watch" hints={[{ label: 'This Match Has No Map Events' }]} />
    </Modal>
  );
  const plans = vm.monitorPlans();
  const rules = vm.monitorRules();
  const bodies = vm.monitorBodies();
  const needle = q.trim().toLowerCase();
  const log = tab === 'log' ? vm.monitorLog() : [];
  const shown = needle ? log.filter(l => l.text.toLowerCase().includes(needle)) : log;
  const shownRules = needle ? rules.filter(r => r.name.toLowerCase().includes(needle)) : rules;
  const placed = bodies.filter(b => b.placed), made = bodies.filter(b => !b.placed);
  const shownBodies = (tab === 'made' ? made : placed).filter(b => !needle || b.name.toLowerCase().includes(needle));
  return (
    <Modal title="Map Events Monitor" icon={<Activity size={18} />} size="lg" onClose={onClose} fit surface="content" waitHeight={bodyH} phoneFull
      bodyClassName={phone ? 'k-modal-body-flush flex flex-col' : undefined}
      headerRight={narrowMon ? undefined : <div className="k-ev-search"><SearchField value={q} onChange={setQ} placeholder="Search" /></div>}>
      <div className={phone ? 'k-ev-mon k-ev-mon-narrow k-ev-mon-phone' : narrowMon ? 'k-ev-mon k-ev-mon-narrow' : 'k-ev-mon'} style={phone ? undefined : { height: bodyH }}>
        {narrowMon ? <div className="k-ev-mon-search"><SearchField value={q} onChange={setQ} placeholder="Search" /></div> : null}
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'waves', label: 'Waves', count: plans.length }, { value: 'events', label: 'Map Events', count: rules.length }, { value: 'objects', label: 'Map Entities', count: placed.length }, { value: 'made', label: 'Made In The Match', count: made.length }, { value: 'log', label: 'Log' }]} />
        <div className="k-ev-mon-body popup-scrollbar">
          {tab === 'waves' ? (
            <LongList gap={6} estimate={84} empty={<div className="k-ev-note">This match has no Wave Plan.</div>} count={plans.length} rowKey={i => String(plans[i].index)} renderRow={i => { const p = plans[i]; return (
                <div className="k-ev-mon-rule">
                  <div className="k-ev-mon-head"><span className="k-ev-mon-name">{p.name}</span><span className="k-ev-sentence">{`Wave ${p.wave}, ${p.phase}${p.seconds !== null ? `, ${p.seconds} s` : ''}. ${p.holders} holding it, ${p.toBorn} to come.`}</span></div>
                  <div className="k-ev-inline k-ev-mon-actions">
                    <Button size="sm" variant="secondary" onClick={() => vm.waveNext(p.index)}>Skip To Next</Button>
                    <Button size="sm" variant="secondary" onClick={() => vm.skipBreak(p.index)}>Skip This Wait</Button>
                    <Button size="sm" variant="secondary" onClick={() => (p.paused ? vm.waveResume(p.index) : vm.wavePause(p.index))}>{p.paused ? 'Resume' : 'Pause'}</Button>
                    <NumberBox className="k-field k-ev-num" value={setTo} min={1} aria-label="Wave" onChange={e => setSetTo(Math.max(1, Number(e.target.value) || 1))} />
                    <Button size="sm" variant="secondary" onClick={() => vm.waveSet(p.index, setTo)}>Set Wave</Button>
                  </div>
                  <Fade when={p.specials.length > 0}>{() => (
                    <div className="k-ev-chips k-ev-mon-actions">
                      {p.specials.map(s => <button key={s.id} type="button" className={p.forced === s.id ? 'k-segbtn k-segbtn-on' : 'k-segbtn'} title="The next wave is this one" onClick={() => vm.forceSpecial(p.index, p.forced === s.id ? -1 : s.id)}>{s.name}</button>)}
                    </div>
                  )}</Fade>
                </div>
              ); }} />
          ) : tab === 'events' ? (
            <LongList gap={4} estimate={40} empty={<div className="k-ev-note">{SMALL_FIX.R876 !== 0 && needle && rules.length > 0 ? 'No Map Event matches the search.' : 'This match has no Map Events.'}</div>} count={shownRules.length} rowKey={i => String(shownRules[i].index)} renderRow={i => { const r = shownRules[i]; return (
                <div className="k-ev-b-row k-ev-mon-rule">
                  <span className="k-ev-mon-name">{r.name}</span>
                  <span className="k-ev-sentence">{`Started ${r.fired}, stopped by its test ${r.failed}, ran ${r.ran}, running ${r.live}`}</span>
                  <Button size="sm" variant="secondary" onClick={() => vm.runNow(r.index, null)}>Run Now</Button>
                  <Button size="sm" variant="ghost" title="Says what its test would answer now, from the numbers it reads" onClick={() => { const said = `${r.name}: ${vm.testRule(r.index) ? 'its test holds now' : 'its test does not hold now'}`; if (SMALL_FIX.R876 !== 0) toast('info', said); else setQ(said); }}>Test Now</Button>
                  <Button size="sm" variant="ghost" onClick={() => vm.skipWaitsOf(r.index)}>Skip Waits</Button>
                </div>
              ); }} />
          ) : tab === 'objects' || tab === 'made' ? (
            <LongList gap={4} estimate={40} empty={<div className="k-ev-note">{tab === 'made' ? 'Nothing a Map Event or a wave made stands now.' : 'No Map Entity of this map stands now.'}</div>} count={shownBodies.length} rowKey={i => String(shownBodies[i].id)} renderRow={i => { const b = shownBodies[i]; return <BodyRow b={b} logic={logic} onKill={() => vm.debugKill(b.row)} onDone={onClose} onShow={() => onShow?.()} />; }} />
          ) : narrowMon ? (
            <LongList gap={0} estimate={ROW_H} className="k-ev-mon-log" empty={<div className="k-ev-note">Nothing yet.</div>} count={shown.length} rowKey={i => String(shown[i].key)} renderRow={i => <div className="k-ev-mon-line k-ev-mon-line-wrap">{shown[i].text}</div>} />
          ) : (
            <VirtualList count={shown.length} rowHeight={ROW_H} maxHeight={bodyH - 70} className="k-ev-mon-log" rowKey={i => String(shown[i].key)} empty={<div className="k-ev-note">Nothing yet.</div>} renderRow={i => <div className="k-ev-mon-line">{shown[i].text}</div>} />
          )}
        </div>
      </div>
    </Modal>
  );
};
