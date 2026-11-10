import React, { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Megaphone, ChevronDown, X, ArrowUp, Archive, EMPTY_LINE } from '../ui/icons';
import { usePortalMenuScale, useFitScale, useModalMaxHeight, useModalMaxWidth } from '../../utils/useMenuScale';
import { isTouchScreen } from '../../utils/device';

const UL_W = 900;
const UL_H = 640;
const UL_NARROW_BELOW = 640;
import { useBackdropClose } from '../shared/useBackdropClose';
import { useEscapeOwner } from '../shared/escapeStack';
import { useClosing } from '../kit/motion';
import type { UpdateEntry, UpdateMonth } from './updatesTypes';
import {
  loadUpdates, getYears, getLatest, searchUpdates, formatEntryDate,
  getSeenDate, markSeen, type UpdateSearchHit,
} from './updatesRegistry';
import { CURRENT_VERSION_DATE } from './version';
import { VersionChip } from './VersionChip';
import { ThemeSwitch } from '../kit/ThemeSwitch';
import { Collapse, SwapInPlace, Fade } from '../kit/Collapse';
import { scrollGlide, stopScrollGlide } from '../kit/presence';
import { IconButton, SearchField } from '../kit/kit';
import { useWindowFrame } from '../kit/focusScope';

interface Props {
  onClose: () => void;
}

const SEARCH_RESULT_CAP = 40;
const SEARCH_BULLETS_PER_RESULT = 6;

function renderInline(text: string): React.ReactNode {
  if (text.indexOf('`') === -1) return text;
  const parts = text.split('`');
  return parts.map((p, i) =>
    i % 2 === 1
      ? (
        <code key={i} className="k-ul-code">
          {p}
        </code>
      )
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

const heightMemo = new Map<string, number>();

const CHARS_PER_LINE = 82;
const LINE_H = 21;

function estimateHeight(e: UpdateEntry): number {
  const lines = (s: string) => Math.max(1, Math.ceil(s.length / CHARS_PER_LINE));
  let h = 40 + 20 + 10 + 20;
  h += 12;
  for (const b of e.bullets) h += lines(b) * LINE_H + 8;
  return Math.round(h);
}

const EntrySkeleton = React.memo<{ height: number }>(({ height }) => (
  <div
    style={{ height, contentVisibility: 'auto' }}
    aria-hidden
    className="k-info-card k-ul-entry k-ul-skel k-skel-sweep"
  />
));
EntrySkeleton.displayName = 'EntrySkeleton';

const EntryCard = React.memo<{ entry: UpdateEntry; isNew: boolean; onlyBullets?: number[] }>(
  ({ entry, isNew, onlyBullets }) => {
    const bullets = onlyBullets
      ? onlyBullets.map(i => entry.bullets[i]).filter(Boolean)
      : entry.bullets;
    return (
      <article className="k-info-card k-ul-entry">
        <header className="k-ul-entry-head">
          <h3 className="k-ul-date">{formatEntryDate(entry.date)}</h3>
          <span className="k-badge k-ul-ver">{entry.version}</span>
          {isNew && (
            <span className="k-badge"><span className="k-ul-new-dot" />New</span>
          )}
        </header>

        <p className="k-ul-title">{entry.title}</p>

        {bullets.length > 0 && (
          <ul className="k-ul-list">
            {bullets.map((b, i) => (
              <li key={i} className="k-ul-change">
                <span className="mt-[8.5px] h-1 w-1 rounded-full bg-[var(--text-tertiary)] shrink-0" />
                <span className="min-w-0">{renderInline(b)}</span>
              </li>
            ))}
          </ul>
        )}

        {onlyBullets && onlyBullets.length < entry.bullets.length && (
          <p className="k-ul-more mt-3">
            {entry.bullets.length - onlyBullets.length}
            {bullets.length ? ' more change' : ' change'}
            {entry.bullets.length - onlyBullets.length === 1 ? '' : 's'} on this day
          </p>
        )}
      </article>
    );
  }
);
EntryCard.displayName = 'EntryCard';

const LazyEntry = React.memo<{
  entry: UpdateEntry;
  isNew: boolean;
  rootRef: React.RefObject<HTMLDivElement | null>;
  onMeasured: () => void;
  eager?: boolean;
}>(({ entry, isNew, rootRef, onMeasured, eager }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(!!eager);
  const [height, setHeight] = useState(() => heightMemo.get(entry.date) ?? estimateHeight(entry));

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setNear(true); return; }
    const io = new IntersectionObserver(
      entries => { for (const e of entries) setNear(e.isIntersecting); },
      { root: rootRef.current, rootMargin: '1200px 0px 1200px 0px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [rootRef]);

  useLayoutEffect(() => {
    if (!near) return;
    const el = wrapRef.current;
    if (!el) return;
    const real = el.offsetHeight;
    if (real > 0 && Math.abs(real - height) > 1) {
      heightMemo.set(entry.date, real);
      setHeight(real);
      onMeasured();
    } else if (real > 0) {
      heightMemo.set(entry.date, real);
    }
  }, [near, entry.date, height, onMeasured]);

  return (
    <div ref={wrapRef} data-entry-date={entry.date} style={near ? undefined : { height }}>
      {near ? <EntryCard entry={entry} isNew={isNew} /> : <EntrySkeleton height={height} />}
    </div>
  );
});
LazyEntry.displayName = 'LazyEntry';

const ArchivePage: React.FC<{ firstDate: string; onGoFirst: () => void }> = ({
  firstDate, onGoFirst,
}) => (
  <div className="flex-1 flex items-center justify-center px-7 pb-2">
    <div className="flex flex-col items-center text-center max-w-[420px]">
      <Archive size={84} strokeWidth={EMPTY_LINE} className="text-[var(--text-quaternary)]" />

      <h1 className="k-rd-title mt-7">
        Earlier updates
      </h1>

      <p className="k-ul-text mt-3">
        The public log starts on {formatEntryDate(firstDate)}. Work carried on before that
        date, but those changes were never written up as public update notes, so there is
        nothing to show for them here.
      </p>

      <button
        type="button"
        onClick={onGoFirst}
        className="k-btn k-btn-secondary k-btn-md mt-7"
      >
        Go to the first update
      </button>
    </div>
  </div>
);

type View = 'month' | 'archive';

const FEED_FADE_MS = 350;

export const UpdateLogPopup: React.FC<Props> = ({ onClose }) => {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [view, setView] = useState<View>('month');
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(() => new Set());
  const [query, setQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);

  const feedRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const seenAtOpenRef = useRef<string | null>(null);
  if (seenAtOpenRef.current === null) seenAtOpenRef.current = getSeenDate() ?? '';

  const loadedOkRef = useRef(false);

  const { closing, close: fadeClose } = useClosing(onClose);
  const scrimRef = useRef<HTMLDivElement>(null);
  useWindowFrame({ scrim: scrimRef, card: cardRef, closing });
  const handleClose = useCallback(() => {
    if (loadedOkRef.current) markSeen(getLatest()?.date ?? CURRENT_VERSION_DATE);
    fadeClose();
  }, [fadeClose]);

  useEscapeOwner(handleClose);
  const backdropProps = useBackdropClose(handleClose);
  const menuScale = usePortalMenuScale();
  const fitScale = useFitScale(cardRef, menuScale * 1.3, true);
  const touch = isTouchScreen();
  const maxW = useModalMaxWidth();
  const maxH = useModalMaxHeight();
  const cardW = Math.min(UL_W, maxW), cardH = Math.min(UL_H, maxH);
  const narrowUl = touch && cardW < UL_NARROW_BELOW;
  const monthsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    loadUpdates().then(list => {
      if (!alive) return;
      const first = list[0];
      if (first) {
        const key = first.date.slice(0, 7);
        setMonthKey(key);
        setActiveDate(first.date);
        setExpandedMonths(new Set([key]));
      }
      loadedOkRef.current = true;
      setReady(true);
    }).catch(() => { if (alive) { setFailed(true); setReady(true); } });
    return () => { alive = false; };
  }, []);

  const years = ready && !failed ? getYears() : [];
  const deferredQuery = useDeferredValue(query);
  const searching = deferredQuery.trim().length > 0;

  const monthsByKey = useMemo(() => {
    const m = new Map<string, UpdateMonth>();
    for (const y of years) for (const mo of y.months) m.set(mo.key, mo);
    return m;
  }, [years]);

  const hits: UpdateSearchHit[] = useMemo(
    () => (searching && ready ? searchUpdates(deferredQuery) : []),
    [searching, deferredQuery, ready]
  );
  useLayoutEffect(() => {
    if (searching && feedRef.current) scrollGlide(feedRef.current, 0);
  }, [hits]);

  const totalCount = useMemo(() => years.reduce((a, y) => a + y.count, 0), [years]);
  const oldestMonthKey = useMemo(() => {
    const ys = years;
    if (!ys.length) return null;
    const lastYear = ys[ys.length - 1];
    const m = lastYear.months[lastYear.months.length - 1];
    return m ? m.key : null;
  }, [years]);
  const firstEntryDate = useMemo(() => {
    const mo = oldestMonthKey ? monthsByKey.get(oldestMonthKey) : null;
    return mo && mo.entries.length ? mo.entries[mo.entries.length - 1].date : null;
  }, [oldestMonthKey, monthsByKey]);

  const isNew = useCallback((entry: UpdateEntry) => {
    const seen = seenAtOpenRef.current;
    if (!seen) return false;
    return entry.date > seen;
  }, []);

  const stopGlide = useCallback(() => { const feed = feedRef.current; if (feed) stopScrollGlide(feed); }, []);
  useEffect(() => stopGlide, [stopGlide]);

  const glideTo = useCallback((aim: () => number | null) => {
    const feed = feedRef.current;
    if (feed) scrollGlide(feed, aim, { follow: 30 });
  }, []);

  const dayTop = useCallback((date: string) => () => {
    const el = feedRef.current?.querySelector<HTMLElement>(`[data-entry-date="${date}"]`);
    return el ? el.offsetTop - 12 : null;
  }, []);
  const scrollToDate = useCallback((date: string) => glideTo(dayTop(date)), [glideTo, dayTop]);

  const [shownKey, setShownKey] = useState<string | null>(null);
  const [feedOut, setFeedOut] = useState(false);
  const shownMonth = shownKey ? monthsByKey.get(shownKey) ?? null : null;
  const landRef = useRef<string | null>(null);
  useEffect(() => {
    if (monthKey === shownKey) {
      if (feedOut) {
        setFeedOut(false);
        const land = landRef.current;
        landRef.current = null;
        if (land) glideTo(dayTop(land)); else if (land === '') glideTo(() => 0);
      }
      return;
    }
    if (shownKey === null || monthKey === null) { setShownKey(monthKey); return; }
    stopGlide();
    setFeedOut(true);
    const t = window.setTimeout(() => setShownKey(monthKey), FEED_FADE_MS);
    return () => window.clearTimeout(t);
  }, [monthKey, shownKey, feedOut, stopGlide, glideTo, dayTop]);
  useLayoutEffect(() => {
    if (!feedOut) return;
    const land = landRef.current;
    landRef.current = null;
    const feed = feedRef.current;
    if (feed) {
      const at = land ? dayTop(land)() : null;
      feed.scrollTop = at == null ? 0 : Math.max(0, at);
    }
    setFeedOut(false);
    if (land) scrollToDate(land);
  }, [shownKey]);

  const goToDate = useCallback((date: string) => {
    const key = date.slice(0, 7);
    setQuery('');
    setView('month');
    setActiveDate(date);
    if (key !== monthKey) {
      landRef.current = date;
      setMonthKey(key);
      setExpandedMonths(prev => new Set(prev).add(key));
    } else if (key !== shownKey) {
      landRef.current = date;
    } else {
      scrollToDate(date);
    }
  }, [monthKey, shownKey, scrollToDate]);

  const foldBusy = useRef(new Set<string>());
  const selectMonth = useCallback((key: string) => {
    if (foldBusy.current.has(key)) return;
    const mo = monthsByKey.get(key);
    setQuery('');
    setView('month');
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
    if (mo && mo.entries.length) setActiveDate(mo.entries[0].date);
    if (key !== monthKey || key !== shownKey) { landRef.current = ''; setMonthKey(key); }
    else glideTo(() => 0);
  }, [monthsByKey, monthKey, shownKey, glideTo]);

  const [measureTick, setMeasureTick] = useState(0);
  const onMeasured = useCallback(() => setMeasureTick(t => (t + 1) & 0xffff), []);

  useLayoutEffect(() => {
    const feed = feedRef.current;
    if (!feed || searching || view !== 'month') return;
    let raf = 0;
    const recompute = () => {
      raf = 0;
      const cards = feed.querySelectorAll<HTMLElement>('[data-entry-date]');
      let best: string | null = null;
      for (let i = 0; i < cards.length; i++) {
        if (cards[i].offsetTop - feed.scrollTop <= 24) best = cards[i].dataset.entryDate ?? null;
        else break;
      }
      const canScroll = feed.scrollHeight > feed.clientHeight + 2;
      const atBottom = feed.scrollTop + feed.clientHeight >= feed.scrollHeight - 2;
      if (cards.length && canScroll && atBottom) {
        best = cards[cards.length - 1].dataset.entryDate ?? best;
      }
      if (best) setActiveDate(prev => (prev === best ? prev : best));
      setScrolled(prev => {
        const next = feed.scrollTop > 240;
        return prev === next ? prev : next;
      });
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(recompute); };
    feed.addEventListener('scroll', onScroll, { passive: true });
    recompute();
    return () => { feed.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [searching, monthKey, view, measureTick]);

  const latest = ready && !failed ? getLatest() : null;
  const showArchiveRow = !searching && !!firstEntryDate;

  return createPortal(
    <div ref={scrimRef} className={`modal-scrim z-50 animate-fadeIn ${closing ? 'pointer-events-none' : ''}`} {...backdropProps}>
      <div
        style={touch ? { zoom: menuScale } : { transform: `scale(${fitScale})`, transformOrigin: 'center center', willChange: 'transform' }}
        onClick={e => e.stopPropagation()}
      >
        <div ref={cardRef} role="dialog" aria-modal="true" aria-label="Update Log"
          className={touch ? `modal-card k-rd-card flex flex-col overflow-hidden animate-scaleUp${narrowUl ? ' k-ul-narrow' : ''}` : `modal-card k-rd-card w-[900px] h-[640px] flex flex-col overflow-hidden animate-scaleUp`}
          style={touch ? { width: cardW, height: cardH } : undefined}>

          <header className="k-modal-head">
            <span className="k-modal-icon"><Megaphone size={18} strokeWidth={1.5} absoluteStrokeWidth /></span>
            <div className="min-w-0 flex-1 flex items-center gap-2.5">
              <h2 className="k-modal-title truncate">Update Log</h2>
              {latest && <VersionChip version={latest.version} />}
            </div>
            <ThemeSwitch />
            <IconButton label="Close" onClick={handleClose}><X size={18} /></IconButton>
          </header>

          <div className={narrowUl ? 'flex flex-col flex-1 min-h-0' : 'flex flex-1 min-h-0'}>

            {narrowUl ? (
              <div className="k-ul-top">
                <SearchField value={query} onChange={setQuery} placeholder="Search all updates..." />
                <SwapInPlace swapKey={searching} hold={false}>
                {searching ? (
                  <div className="k-ul-top-note">
                    {hits.length === 0
                      ? 'Nothing matched. Try a single word, like turret, maze or minimap.'
                      : `${hits.length} update${hits.length === 1 ? '' : 's'} matched`}
                  </div>
                ) : (
                  <div ref={monthsRef} className="k-ul-months" role="tablist" aria-label="Months">
                    {years.flatMap(y => y.months.map(mo => {
                      const on = view === 'month' && mo.key === monthKey;
                      return (
                        <button key={mo.key} type="button" role="tab" aria-selected={on} onClick={() => { if (!on) selectMonth(mo.key); }}
                          className={on ? 'k-ul-month k-ul-month-on' : 'k-ul-month'}>
                          {mo.label}<span className="k-ul-month-n">{mo.entries.length}</span>
                        </button>
                      );
                    }))}
                    {showArchiveRow ? (
                      <button type="button" role="tab" aria-selected={view === 'archive'} onClick={() => { setView('archive'); setQuery(''); }}
                        className={view === 'archive' ? 'k-ul-month k-ul-month-on' : 'k-ul-month'}>Previous updates</button>
                    ) : null}
                  </div>
                )}
                </SwapInPlace>
              </div>
            ) : (
            <nav className="k-rd-side k-ul-side" aria-label="Update index">
              <div className="k-rd-search">
                <SearchField value={query} onChange={setQuery} placeholder="Search all updates..." />
              </div>

              <div className="k-rd-list popup-scrollbar">
                <SwapInPlace swapKey={searching} hold={false}>
                {searching ? (
                  <div className="k-rd-note">
                    {hits.length === 0
                      ? 'Nothing matched. Try a single word, like turret, maze or minimap.'
                      : `${hits.length} update${hits.length === 1 ? '' : 's'} matched`}
                  </div>
                ) : (
                  <>
                    {years.map(y => (
                      <div key={y.year} className="mb-1">
                        <div className="k-rd-group-label">
                          <span>{y.year}</span>
                          <span className="k-rd-item-meta">
                            {y.count} update{y.count === 1 ? '' : 's'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {y.months.map(mo => {
                            const open = expandedMonths.has(mo.key);
                            const current = view === 'month' && mo.key === monthKey;
                            const monthClass = current ? (open ? 'k-rd-item-head' : 'k-rd-item-on') : '';
                            return (
                              <div key={mo.key}>
                                <button
                                  type="button"
                                  onClick={() => selectMonth(mo.key)}
                                  aria-expanded={open}
                                  className={`k-rd-item ${monthClass}`}
                                >
                                  <span className="k-rd-item-text truncate">{mo.shortLabel}</span>
                                  <span className="k-rd-item-meta">{mo.entries.length}</span>
                                  <ChevronDown
                                    size={12}
                                    className={`k-chevron shrink-0 ${open ? 'k-chevron-open' : ''}`}
                                  />
                                </button>
                                <Collapse open={open} onBusyChange={b => { if (b) foldBusy.current.add(mo.key); else foldBusy.current.delete(mo.key); }}>
                                  <div className="k-rd-sub">
                                    {mo.entries.map(e => (
                                      <button
                                        key={e.date}
                                        type="button"
                                        onClick={() => goToDate(e.date)}
                                        className={`k-rd-item k-rd-item-sm ${e.date === activeDate && current ? 'k-rd-item-on' : ''}`}
                                      >
                                        <span className="k-rd-item-text truncate">{formatEntryDate(e.date)}</span>
                                        <span className="k-rd-item-meta">{e.version}</span>
                                      </button>
                                    ))}
                                  </div>
                                </Collapse>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {showArchiveRow && (
                      <div className="k-rd-sep">
                        <button
                          type="button"
                          onClick={() => { setView('archive'); setQuery(''); }}
                          className={`k-rd-item ${view === 'archive' ? 'k-rd-item-on' : 'k-rd-item-quiet'}`}
                        >
                          <span className="k-rd-item-text truncate">Previous updates</span>
                        </button>
                      </div>
                    )}
                  </>
                )}
                </SwapInPlace>
              </div>

              {!searching && totalCount > 0 && (
                <div className="k-rd-foot">{totalCount} updates in total</div>
              )}
            </nav>
            )}

            <div className={narrowUl ? 'flex-1 min-h-0 relative' : 'flex-1 min-w-0 relative'}>
              <div
                ref={feedRef}
                tabIndex={0}
                role="region"
                aria-label={
                  searching ? 'Search results'
                  : view === 'archive' ? 'Earlier updates'
                  : shownMonth ? `Updates for ${shownMonth.label}`
                  : 'Update log'
                }
                className="absolute inset-0 overflow-y-auto popup-scrollbar"
              >
                <SwapInPlace swapKey={!ready ? 'wait' : failed ? 'fail' : searching ? 'search' : view === 'archive' && firstEntryDate ? 'archive' : shownMonth ? 'month' : 'none'} hold={false}
                  className="min-h-full flex flex-col">
                {!ready ? (
                  <div className="px-7 py-6 flex flex-col gap-4">
                    <div>
                      <div className="skeleton-shimmer h-3 w-20 rounded" />
                      <div className="skeleton-shimmer h-6 w-48 rounded mt-1.5" />
                    </div>
                    <EntrySkeleton height={300} />
                    <EntrySkeleton height={240} />
                  </div>
                ) : failed ? (
                  <div className="px-7 py-8">
                    <div className="k-empty-title">The update log could not be loaded</div>
                    <div className="k-ul-more mt-1">Close this window and open it again.</div>
                  </div>
                ) : searching ? (
                  <div className="px-7 py-6 flex flex-col gap-4">
                    <div>
                      <div className="k-rd-path">Search</div>
                      <h1 className="k-rd-title">
                        {hits.length} result{hits.length === 1 ? '' : 's'} for {query.trim()}
                      </h1>
                      {hits.length > SEARCH_RESULT_CAP && (
                        <p className="k-ul-more mt-2">
                          Showing the {SEARCH_RESULT_CAP} closest matches. Add another word to narrow it down.
                        </p>
                      )}
                    </div>
                    {hits.slice(0, SEARCH_RESULT_CAP).map(h => (
                      <EntryCard
                        key={h.entry.date}
                        entry={h.entry}
                        isNew={isNew(h.entry)}
                        onlyBullets={h.matchedBullets.slice(0, SEARCH_BULLETS_PER_RESULT)}
                      />
                    ))}
                  </div>
                ) : view === 'archive' && firstEntryDate ? (
                  <ArchivePage
                    firstDate={firstEntryDate}
                    onGoFirst={() => goToDate(firstEntryDate)}
                  />
                ) : shownMonth ? (
                  <div className={`px-7 py-6 flex flex-col gap-4 k-ul-swap${feedOut ? ' k-ul-swap-out' : ''}`}>
                    <div>
                      <div className="k-rd-path">{shownMonth.entries.length} update{shownMonth.entries.length === 1 ? '' : 's'}</div>
                      <h1 className="k-rd-title">{shownMonth.label}</h1>
                    </div>
                    {shownMonth.entries.map((e, i) => (
                      <LazyEntry
                        key={e.date}
                        entry={e}
                        isNew={isNew(e)}
                        rootRef={feedRef}
                        onMeasured={onMeasured}
                        eager={i < 2}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="px-7 py-8 k-ul-more">No updates yet.</div>
                )}
                </SwapInPlace>
              </div>

              <Fade when={scrolled && !searching && view === 'month'}>
                <button
                  type="button"
                  onClick={() => glideTo(() => 0)}
                  title="Back to the newest update"
                  className="k-ico k-rd-fab"
                >
                  <ArrowUp size={15} />
                </button>
              </Fade>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
