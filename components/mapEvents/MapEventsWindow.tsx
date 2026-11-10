import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lintEvents } from '../../game/mapEvents/problems';
import { TileType } from '../../types';
import type { GameLogic } from '../../game/GameLogic';
import { buildPresetWorld } from '../../game/mapEvents/presets';
import { Modal } from '../kit/Modal';
import { Button, IconButton, SearchField } from '../kit/kit';
import { Fade, PageSwap, Reveal } from '../kit/Collapse';
import { usePanelMemory, isOneOf } from '../kit/panelMemory';
import { toast } from '../ui/Toast';
import { markOfLastEdit, undoMarkedEdit } from '../shared/markedUndo';
import { useModalMaxHeight } from '../../utils/useMenuScale';
import { problemsOf, useEvCtx } from './evCtx';
import { EvSelect } from './EvSelect';
import { ZONES_KEY } from './fields';
import { TankGroupsPage } from './tankGroups';
import { AreasPage, EntitiesPage, EventsPage, MatchPage, MessagesPage, NamesPage, OverviewPage, ProblemsPage, SequencesPage, StatusesPage, TimersPage, TypesPage, VarsPage, WavesPage } from './pages';
import { TemplatesWindow } from './templates';
import { windowSize } from '../library/ContentLibrary';
import { closeMapEvents, useMapEventsOpen } from './mapEventsStore';
import { MevEvents, MevProblems, Redo2, Undo2 } from '../ui/icons';

const PAGES = ['overview', 'events', 'waves', 'types', 'entities', 'areas', 'messages', 'vars', 'timers', 'names', 'statuses', 'sequences', 'groups', 'match', 'problems'] as const;
type Page = typeof PAGES[number];
const TITLE: Record<Page, string> = {
  overview: 'Overview', events: 'Map Events', waves: 'Wave Plans', types: 'Entity Types', entities: 'Map Entities', areas: 'Custom Areas', messages: 'Messages',
  vars: 'Variables', timers: 'Timers', names: 'Signals And Tags', statuses: 'Statuses', sequences: 'Sequences', groups: 'Tank Groups', match: 'Match Rules', problems: 'Problems',
};

export const MapEventsWindow: React.FC<{ logic: GameLogic; areaId: string; page: string; focus: number | null; onClose: () => void }> = ({ logic, areaId: firstArea, page: firstPage, focus: firstFocus, onClose }) => {
  const [areaId, setAreaId] = useState(firstArea);
  const ctx = useEvCtx(logic, areaId);
  const [remembered, setRemembered] = usePanelMemory<string>('mapEvents.page', 'overview', isOneOf(PAGES));
  const [page, setPageRaw] = useState<Page>(((firstPage === 'overview' ? remembered : firstPage) as Page));
  const [focus, setFocus] = useState<number | null>(firstFocus);
  const [search, setSearch] = useState('');
  const [templates, setTemplates] = useState(false);
  const searchBox = useRef<HTMLDivElement>(null);
  const go = useCallback((p: string, f?: number) => { setPageRaw(p as Page); setRemembered(p); setFocus(f ?? null); setSearch(''); }, [setRemembered]);
  const readOnly = logic.state.isTestMode;
  const [seen, setSeen] = useState({ doc: ctx.doc, zones: ctx.zones });
  useEffect(() => {
    if (seen.doc === ctx.doc && seen.zones === ctx.zones) return;
    const t = window.setTimeout(() => setSeen({ doc: ctx.doc, zones: ctx.zones }), 300);
    return () => window.clearTimeout(t);
  }, [ctx.doc, ctx.zones]);
  const seenDoc = seen.doc, seenZones = seen.zones;
  const problems = useMemo(() => {
    const view = logic.mapEventsView(areaId);
    const st = logic.selectionStateOf(areaId);
    const lints = lintEvents(seenDoc, seenZones, {
      modeTeams: logic.state.gameModeConfig.teams, room: logic.state.gameModeConfig.maxTanksAlive,
      gridCells: st?.gridCells, gridCellsY: st?.gridCellsY, cell: st?.cellSize,
      isWall: st ? (cx, cy) => st.tileGrid[Math.floor(cx) * st.gridCellsY + Math.floor(cy)] === TileType.WALL : undefined,
    });
    void view;
    return [...problemsOf(logic), ...lints];
  }, [logic, areaId, seenDoc, seenZones]);
  const maxH = useModalMaxHeight();
  const bodyH = Math.max(320, Math.min(860, maxH - 58));
  const undo = () => { logic.undoMapEdit(); ctx.refresh(); };
  const redo = () => { logic.redoMapEdit(); ctx.refresh(); };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); searchBox.current?.querySelector('input')?.focus(); return; }
      if (typing || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || readOnly) return;
      e.preventDefault();
      if (e.shiftKey) { logic.redoMapEdit(); } else { logic.undoMapEdit(); }
      ctx.refresh();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [logic, readOnly, ctx.refresh]);

  const areas = logic.state.multiAreaConfig.enableMultiArea ? logic.state.multiAreaConfig.areas : [];
  const shipped = ctx.doc?.meta?.shipped;
  const restore = () => {
    const world = buildPresetWorld(shipped!, logic.state.gameModeConfig);
    if (!world) return;
    ctx.commit(d => ({ ...world.events, [ZONES_KEY]: world.mapAreas.zones, nextId: Math.max(world.events.nextId, d?.nextId ?? 1) }));
    const mark = markOfLastEdit(logic);
    toast('info', 'Restored as it was shipped.', { label: 'Undo', run: () => { undoMarkedEdit(logic, mark); ctx.refresh(); } });
  };
  const count = (p: Page): number | undefined => {
    const d = ctx.doc;
    switch (p) {
      case 'events': return d?.rules?.length ?? 0;
      case 'waves': return d?.plans?.length ?? 0;
      case 'types': return d?.types?.length ?? 0;
      case 'entities': return d?.placed?.length ?? 0;
      case 'areas': return ctx.zones.length;
      case 'vars': return d?.vars?.length ?? 0;
      case 'timers': return d?.timers?.length ?? 0;
      case 'statuses': return d?.statuses?.length ?? 0;
      case 'sequences': return d?.sequences?.length ?? 0;
      case 'groups': return d?.tankGroups?.length ?? 0;
      case 'problems': return problems.length;
      default: return undefined;
    }
  };
  const body = (): React.ReactElement => {
    switch (page) {
      case 'events': return <EventsPage ctx={ctx} search={search} focus={focus} onTemplates={() => setTemplates(true)} />;
      case 'waves': return <WavesPage ctx={ctx} focus={focus} search={search} />;
      case 'types': return <TypesPage ctx={ctx} search={search} focus={focus} />;
      case 'entities': return <EntitiesPage ctx={ctx} search={search} focus={focus} />;
      case 'areas': return <AreasPage ctx={ctx} search={search} focus={focus} />;
      case 'messages': return <MessagesPage ctx={ctx} search={search} go={go} />;
      case 'vars': return <VarsPage ctx={ctx} />;
      case 'timers': return <TimersPage ctx={ctx} />;
      case 'names': return <NamesPage ctx={ctx} />;
      case 'statuses': return <StatusesPage ctx={ctx} />;
      case 'sequences': return <SequencesPage ctx={ctx} />;
      case 'groups': return <TankGroupsPage ctx={ctx} focus={focus} />;
      case 'match': return <MatchPage ctx={ctx} />;
      case 'problems': return <ProblemsPage ctx={ctx} problems={problems} go={go} stale={seen.doc !== ctx.doc || seen.zones !== ctx.zones} />;
      default: return <OverviewPage ctx={ctx} problems={problems} go={go} onTemplates={() => setTemplates(true)} onRestore={shipped ? restore : undefined} />;
    }
  };
  return (
    <>
      <Modal title="Map Events" icon={<MevEvents size={18} absoluteStrokeWidth />} width={windowSize().w} onClose={onClose} fit bodyClassName="k-modal-body-flush" waitHeight={bodyH} surface="content"
        headerRight={<>
          <div ref={searchBox} className="k-ev-search"><SearchField value={search} onChange={setSearch} placeholder="Search" /></div>
          <IconButton aria-label="Undo" title="Undo" disabled={readOnly || !logic.canUndoMapEdit()} onClick={undo}><Undo2 size={15} /></IconButton>
          <IconButton aria-label="Redo" title="Redo" disabled={readOnly || !logic.canRedoMapEdit()} onClick={redo}><Redo2 size={15} /></IconButton>
        </>}>
        <div className="flex min-h-0" style={{ height: bodyH }}>
          <aside className="k-gm-side k-ev-side popup-scrollbar">
            <Reveal when={areas.length > 1}><div className="k-ev-area-pick"><EvSelect value={areaId} options={areas.map(a => ({ value: a.id, label: a.name }))} onChange={setAreaId} /></div></Reveal>
            {PAGES.map(p => {
              const n = count(p);
              return (
                <button key={p} type="button" className={page === p ? 'k-rd-item k-rd-item-on' : 'k-rd-item'} onClick={() => go(p)}>
                  <span className="k-rd-item-text">{TITLE[p]}</span>
                  <Fade when={n !== undefined} className="k-rd-item-meta">{() => (p === 'problems' && n ? <span className="k-ev-warn-count"><MevProblems size={13} /> {n}</span> : <span>{n}</span>)}</Fade> { }
                </button>
              );
            })}
          </aside>
          <div className="flex-1 min-w-0 min-h-0 flex flex-col">
            <Reveal when={readOnly}><div className="k-ev-readonly">A match is running. This window only shows.</div></Reveal>
            <PageSwap>
              <div key={`${page}|${areaId}`} inert={readOnly || undefined} className="k-ev-whole">{body()}</div>
            </PageSwap>
          </div>
        </div>
      </Modal>
      {templates ? <TemplatesWindow ctx={ctx} onClose={() => setTemplates(false)} onDone={() => go('overview')} /> : null}
    </>
  );
};

export const MapEventsSlot: React.FC<{ logic: GameLogic }> = React.memo(({ logic }) => {
  const open = useMapEventsOpen();
  if (!open) return null;
  return <MapEventsWindow key={open.areaId + open.page + (open.focus ?? '')} logic={logic} areaId={open.areaId} page={open.page} focus={open.focus} onClose={closeMapEvents} />;
});
void Button;
