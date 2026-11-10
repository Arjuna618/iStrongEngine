import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookText, ChevronDown, ChevronRight, X, Lightbulb, Info, TriangleAlert } from '../ui/icons';
import { usePortalMenuScale, useFitScale } from '../../utils/useMenuScale';
import { useBackdropClose } from '../shared/useBackdropClose';
import { useEscapeOwner } from '../shared/escapeStack';
import { useClosing, useSwapStage } from '../kit/motion';
import type { DocBlock } from './docsTypes';
import { DOCS_CATEGORIES, DOC_ENTRIES, DOC_ENTRY_BY_ID, searchDocs, DocGuideEntry } from './docsRegistry';
import { ThemeSwitch } from '../kit/ThemeSwitch';
import { Collapse, SwapInPlace } from '../kit/Collapse';
import { Button, IconButton, SearchField, Skeleton } from '../kit/kit';
import { Deferred, useAfterFirstPaint, useCameLate } from '../kit/Deferred';
import { SnapshotSkeleton, useSkeletonCapture } from '../kit/SkeletonSnapshot';
import { useWindowFrame } from '../kit/focusScope';

let _lastGuideId: string | null = null;

function renderInline(text: string): React.ReactNode {
  const parts = text.split('**');
  if (parts.length === 1) return text;
  return parts.map((p, i) =>
    i % 2 === 1
      ? <strong key={i} className="font-medium text-[var(--text-primary)]">{p}</strong>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
}

const Callout: React.FC<{ kind: 'tip' | 'note' | 'warn'; text: string }> = ({ kind, text }) => {
  const Icon = kind === 'tip' ? Lightbulb : kind === 'note' ? Info : TriangleAlert;
  return (
    <div className="k-info-card k-docs-callout">
      <Icon size={14} />
      <span className="min-w-0">{renderInline(text)}</span>
    </div>
  );
};

function keyChips(combo: string): string[][] {
  return combo.split(' + ').map(part => {
    const t = part.split(' ');
    return t.length > 1 && t.every(s => s.length === 1) ? t : [part];
  });
}

const DocBlockView: React.FC<{ block: DocBlock; onNavigate: (id: string) => void }> = ({ block, onNavigate }) => {
  switch (block.t) {
    case 'h':
      return <h3 className="k-docs-h">{renderInline(block.text)}</h3>;
    case 'p':
      return <p className="k-docs-p">{renderInline(block.text)}</p>;
    case 'list':
      return (
        <ul className="flex flex-col gap-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="k-docs-p flex items-start gap-2.5">
              <span className="mt-[9px] h-1 w-1 rounded-full bg-[var(--text-tertiary)] shrink-0" />
              <span className="min-w-0">{renderInline(item)}</span>
            </li>
          ))}
        </ul>
      );
    case 'steps':
      return (
        <ol className="k-info-card k-docs-steps">
          {block.items.map((item, i) => (
            <li key={i} className="k-docs-step">
              <span className="k-docs-step-num">{i + 1}</span>
              <span className="k-docs-step-text">{renderInline(item)}</span>
            </li>
          ))}
        </ol>
      );
    case 'tip': case 'note': case 'warn':
      return <Callout kind={block.t} text={block.text} />;
    case 'kv':
      return (
        <div className="k-info-card overflow-hidden">
          {block.title && <div className="k-docs-card-title">{block.title}</div>}
          {block.rows.map(([term, desc], i) => (
            <div key={i} className="k-docs-row">
              <div className="k-docs-term">{term}</div>
              <div className="k-docs-desc">{renderInline(desc)}</div>
            </div>
          ))}
        </div>
      );
    case 'keys':
      return (
        <div className="k-info-card k-docs-keys overflow-hidden">
          {block.rows.map(([keys, desc], i) => (
            <div key={i} className="k-docs-row">
              <span className="k-docs-combo">
                {keyChips(keys).map((group, gi) => (
                  <React.Fragment key={gi}>
                    {gi > 0 && <span className="k-docs-plus">+</span>}
                    {group.map((k, ki) => <kbd key={ki} className="k-kbd">{k}</kbd>)}
                  </React.Fragment>
                ))}
              </span>
              <span className="k-docs-desc">{renderInline(desc)}</span>
            </div>
          ))}
        </div>
      );
    case 'chips':
      return (
        <div>
          {block.label && <div className="k-docs-label">{block.label}</div>}
          <div className="flex flex-wrap gap-1.5">
            {block.items.map((c, i) => (
              <span key={i} className="k-badge">{c}</span>
            ))}
          </div>
        </div>
      );
    case 'links': {
      const targets = block.ids.map(id => DOC_ENTRY_BY_ID.get(id)).filter((e): e is DocGuideEntry => !!e);
      if (targets.length === 0) return null;
      return (
        <div className="k-info-card k-docs-links">
          <div className="k-docs-card-title">Related guides</div>
          <div className="k-docs-links-row">
            {targets.map(e => {
              const SubIcon = e.sub.icon;
              return (
                <Button key={e.guide.id} size="sm" icon={<SubIcon size={13} />} onClick={() => onNavigate(e.guide.id)} className="max-w-full">
                  {e.guide.title}
                </Button>
              );
            })}
          </div>
        </div>
      );
    }
  }
};

interface Props {
  onClose: () => void;
}

let _ruler: CanvasRenderingContext2D | null = null;
let _family = '';
function textWidth(text: string, font: string): number {
  if (!_ruler) { try { _ruler = document.createElement('canvas').getContext('2d'); } catch { _ruler = null; } }
  if (!_ruler) return text.length * 6.4;
  _ruler.font = font + ' ' + (_family || 'sans-serif');
  return _ruler.measureText(text.split('**').join('')).width;
}
function useInnerWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    if (!_family) _family = cs.fontFamily;
    setW(el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0));
  }, []);
  return [ref, w];
}
const SkelLines: React.FC<{ text: string; font: string; avail: number; className?: string; style?: React.CSSProperties }> = ({ text, font, avail, className, style }) => {
  const a = Math.max(40, avail);
  const w = textWidth(text, font) * 1.03;
  const lines = Math.max(1, Math.ceil(w / a));
  const last = Math.min(1, Math.max(0.1, (w - (lines - 1) * a) / a));
  return <div className={className ? 'k-skel-lines ' + className : 'k-skel-lines'} style={{ height: lines + 'lh', ['--k-last' as string]: Math.round(last * 1000) / 10 + '%', ...style } as React.CSSProperties} />;
};
const SkelLabel: React.FC<{ text: string; font: string; max: number }> = ({ text, font, max }) => (
  <span className="k-skel-label" style={{ width: Math.min(max, Math.ceil(textWidth(text, font))) }} />
);
const F_P = '400 13px', F_H = '600 14.5px', F_TITLE = '600 20px', F_PATH = '400 12px', F_CARD = '400 12.5px', F_TERM = '500 12.5px';

const BlockShape: React.FC<{ block: DocBlock; W: number }> = ({ block, W }) => {
  switch (block.t) {
    case 'h': return <div className="k-docs-h"><SkelLines text={block.text} font={F_H} avail={W} /></div>;
    case 'p': return <SkelLines className="k-docs-p" text={block.text} font={F_P} avail={W} />;
    case 'list':
      return (
        <div className="flex flex-col gap-1.5">
          {block.items.map((it, i) => (
            <div key={i} className="k-docs-p flex items-start gap-2.5">
              <span className="mt-[9px] h-1 w-1 rounded-full k-skel shrink-0" />
              <SkelLines className="min-w-0 flex-1" text={it} font={F_P} avail={W - 14} />
            </div>
          ))}
        </div>
      );
    case 'steps':
      return (
        <div className="k-info-card k-docs-steps">
          {block.items.map((it, i) => (
            <div key={i} className="k-docs-step">
              <span className="k-docs-step-num" />
              <SkelLines className="k-docs-step-text flex-1" text={it} font={F_P} avail={W - 32 - 33} />
            </div>
          ))}
        </div>
      );
    case 'tip': case 'note': case 'warn':
      return (
        <div className="k-info-card k-docs-callout">
          <span className="k-skel rounded-full shrink-0" style={{ width: 14, height: 14, marginTop: 3 }} />
          <SkelLines className="min-w-0 flex-1" text={block.text} font={F_CARD} avail={W - 32 - 24} />
        </div>
      );
    case 'kv':
      return (
        <div className="k-info-card overflow-hidden">
          {block.title && <div className="k-docs-card-title"><SkelLines text={block.title} font={F_TERM} avail={W - 32} /></div>}
          {block.rows.map(([term, desc], i) => (
            <div key={i} className="k-docs-row">
              <div className="k-docs-term"><SkelLines text={term} font={F_TERM} avail={W - 32} /></div>
              <div className="k-docs-desc"><SkelLines text={desc} font={F_CARD} avail={W - 32} /></div>
            </div>
          ))}
        </div>
      );
    case 'keys':
      return (
        <div className="k-info-card overflow-hidden">
          {block.rows.map(([keys, desc], i) => (
            <div key={i} className="k-docs-row flex items-start gap-4">
              <span className="k-kbd k-skel-fill shrink-0">{keys}</span>
              <SkelLines className="k-docs-desc flex-1" style={{ marginTop: 0 }} text={desc} font={F_CARD} avail={W - 32 - 16 - Math.ceil(textWidth(keys, '500 11px')) - 16} />
            </div>
          ))}
        </div>
      );
    case 'chips':
      return (
        <div>
          {block.label && <div className="k-docs-label"><SkelLabel text={block.label} font="500 12px" max={W} /></div>}
          <div className="flex flex-wrap gap-1.5">{block.items.map((c, i) => <span key={i} className="k-badge k-skel-fill">{c}</span>)}</div>
        </div>
      );
    case 'links': {
      const targets = block.ids.map(id => DOC_ENTRY_BY_ID.get(id)).filter((e): e is DocGuideEntry => !!e);
      if (targets.length === 0) return null;
      return (
        <div className="k-info-card k-docs-links">
          <div className="k-docs-card-title"><SkelLabel text="Related guides" font={F_TERM} max={W} /></div>
          <div className="k-docs-links-row">
            {targets.map(e => <span key={e.guide.id} className="k-btn k-btn-secondary k-btn-sm k-skel-fill max-w-full"><span className="w-[13px] shrink-0" />{e.guide.title}</span>)}
          </div>
        </div>
      );
    }
  }
  return null;
};

const DocsPageShape: React.FC<{ entry: DocGuideEntry | undefined }> = ({ entry }) => {
  const [ref, W] = useInnerWidth();
  return (
    <div ref={ref} className="px-7 py-6 flex flex-col gap-4 k-skel-sweep" aria-hidden>
      {W > 0 && entry && (
        <>
          <div>
            <div className="k-rd-path"><SkelLabel text={entry.category.title + ' > ' + entry.sub.title} font={F_PATH} max={W} /></div>
            <SkelLines className="k-rd-title" text={entry.guide.title} font={F_TITLE} avail={W} />
          </div>
          {entry.guide.blocks.map((b, i) => <BlockShape key={i} block={b} W={W} />)}
        </>
      )}
    </div>
  );
};

const DocsShape: React.FC<{ entry: DocGuideEntry | undefined; expanded: Set<string> }> = ({ entry, expanded }) => {
  const rowMax = 260 - 16 - 16 - 22;
  return (
    <>
      <div className="k-rd-side" aria-hidden>
        <div className="k-rd-search"><Skeleton h={32} r={8} /></div>
        <div className="k-rd-list k-skel-sweep">
          <div className="flex flex-col gap-0.5">
            {DOCS_CATEGORIES.map(cat => (
              <div key={cat.id}>
                <div className="k-rd-item k-rd-item-head"><span className="k-skel rounded shrink-0" style={{ width: 14, height: 14 }} /><SkelLabel text={cat.title} font="500 12.5px" max={rowMax} /></div>
                {expanded.has('cat:' + cat.id) && cat.subs.map(sub => (
                  <div key={sub.id} className="k-rd-nest">
                    <div className="k-rd-item"><span className="k-skel rounded shrink-0" style={{ width: 13, height: 13 }} /><SkelLabel text={sub.title} font="400 12.5px" max={rowMax - 12} /></div>
                    {expanded.has('sub:' + sub.id) && (
                      <div className="k-rd-sub">
                        {sub.guides.map(g => (
                          <div key={g.id} className={'k-rd-item k-rd-item-sm' + (entry && g.id === entry.guide.id ? ' k-rd-item-on' : '')}>
                            <SkelLines className="flex-1 min-w-0" text={g.title} font="400 12px" avail={rowMax - 12 - 23} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0 overflow-hidden"><DocsPageShape entry={entry} /></div>
    </>
  );
};

const CategoryNode = React.memo(function CategoryNode({ cat, open, subsOpen, selId, onToggle, onSelect, busyCb }: {
  cat: (typeof DOCS_CATEGORIES)[number]; open: boolean; subsOpen: string; selId: string;
  onToggle: (key: string) => void; onSelect: (id: string) => void; busyCb: (key: string) => (b: boolean) => void;
}) {
  const subsOpenList = subsOpen ? subsOpen.split(',') : [];
  const subsOpenHas = { includes: (id: string) => subsOpenList.includes(id) };
                      const catOpen = open;
                      const CatIcon = cat.icon;
                      return (
                        <div key={cat.id}>
                          <button
                            type="button"
                            onClick={() => onToggle(`cat:${cat.id}`)}
                            aria-expanded={catOpen}
                            className="k-rd-item k-rd-item-head"
                          >
                            <span className="k-rd-item-icon"><CatIcon size={14} /></span>
                            <span className="k-rd-item-text truncate">{cat.title}</span>
                            <ChevronDown size={12} className={`k-chevron shrink-0 ${catOpen ? 'k-chevron-open' : ''}`} />
                          </button>
                          <Collapse open={catOpen} onBusyChange={busyCb(`cat:${cat.id}`)}>{cat.subs.map(sub => {
                            const subOpen = subsOpenHas.includes(sub.id);
                            const SubIcon = sub.icon;
                            return (
                              <div key={sub.id} className="k-rd-nest">
                                <button
                                  type="button"
                                  onClick={() => onToggle(`sub:${sub.id}`)}
                                  aria-expanded={subOpen}
                                  className="k-rd-item"
                                >
                                  <span className="k-rd-item-icon"><SubIcon size={13} /></span>
                                  <span className="k-rd-item-text truncate">{sub.title}</span>
                                  <ChevronDown size={11} className={`k-chevron shrink-0 ${subOpen ? 'k-chevron-open' : ''}`} />
                                </button>
                                <Collapse open={subOpen} onBusyChange={busyCb(`sub:${sub.id}`)}>
                                  <div className="k-rd-sub">
                                    {sub.guides.map(g => (
                                      <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => onSelect(g.id)}
                                        aria-current={g.id === selId ? 'page' : undefined}
                                        className={`k-rd-item k-rd-item-sm ${g.id === selId ? 'k-rd-item-on' : ''}`}
                                      >
                                        <span className="k-rd-item-text">{g.title}</span>
                                      </button>
                                    ))}
                                  </div>
                                </Collapse>
                              </div>
                            );
                          })}</Collapse>
                        </div>
                      );
});

const GuidePage = React.memo(function GuidePage({ entry, onNavigate, paneRef }: {
  entry: DocGuideEntry; onNavigate: (id: string) => void; paneRef: React.RefObject<HTMLDivElement | null>;
}) {
  const ready = useAfterFirstPaint();
  const boxRef = useRef<HTMLDivElement>(null);
  const id = 'docs:page:' + entry.guide.id;
  const paneH = useCallback(() => paneRef.current?.clientHeight ?? 600, [paneRef]);
  useSkeletonCapture(id, boxRef, ready, paneH);
  const late = useCameLate(ready);
  if (!ready) return <div className="k-skel-delay"><SnapshotSkeleton id={id} fallback={<DocsPageShape entry={entry} />} /></div>;
  return (
    <div ref={boxRef} className={`px-7 py-6 flex flex-col gap-4${late ? ' k-fade-in' : ''}`}>
      <div>
        <div className="k-rd-path">
          <span>{entry.category.title}</span>
          <ChevronRight size={11} className="k-rd-path-sep" />
          <span>{entry.sub.title}</span>
        </div>
        <h1 className="k-rd-title">{entry.guide.title}</h1>
      </div>
      {entry.guide.blocks.map((block, i) => (
        <DocBlockView key={i} block={block} onNavigate={onNavigate} />
      ))}
    </div>
  );
});

export const DocsPopup: React.FC<Props> = ({ onClose: onCloseNow }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const { closing, close: onClose } = useClosing(onCloseNow, cardRef);
  const scrimRef = useRef<HTMLDivElement>(null);
  useWindowFrame({ scrim: scrimRef, card: cardRef, closing });
  const firstId = DOC_ENTRIES[0]?.guide.id ?? '';
  const [selectedId, setSelectedId] = useState<string>(() =>
    _lastGuideId && DOC_ENTRY_BY_ID.has(_lastGuideId) ? _lastGuideId : firstId
  );
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const e = DOC_ENTRY_BY_ID.get(_lastGuideId ?? firstId) ?? DOC_ENTRIES[0];
    return new Set(e ? [`cat:${e.category.id}`, `sub:${e.sub.id}`] : []);
  });

  const page = useSwapStage(selectedId);
  const selected = DOC_ENTRY_BY_ID.get(page.shown) ?? DOC_ENTRIES[0];
  const results = useMemo(() => searchDocs(query), [query]);
  const selectedEntry = DOC_ENTRY_BY_ID.get(selectedId);
  const pageRef = useRef<HTMLDivElement>(null);
  const searching = query.trim().length > 0;

  const selectGuide = useCallback((id: string) => {
    const entry = DOC_ENTRY_BY_ID.get(id);
    if (!entry) return;
    _lastGuideId = id;
    setSelectedId(id);
    setQuery('');
    setExpanded(prev => {
      const next = new Set(prev);
      next.add(`cat:${entry.category.id}`);
      next.add(`sub:${entry.sub.id}`);
      return next;
    });
  }, []);

  const foldBusy = useRef(new Set<string>());
  const foldBusyCb = useCallback((key: string) => (b: boolean) => { if (b) foldBusy.current.add(key); else foldBusy.current.delete(key); }, []);
  const toggleNode = useCallback((key: string) => {
    if (foldBusy.current.has(key)) return;
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }, []);

  useEscapeOwner(onClose);

  const backdropProps = useBackdropClose(onClose);
  const menuScale = usePortalMenuScale();
  const fitScale = useFitScale(cardRef, menuScale * 1.4, true);

  return createPortal(
    <div ref={scrimRef} className={`modal-scrim z-50 animate-fadeIn ${closing ? 'pointer-events-none' : ''}`} {...backdropProps}>
      <div style={{ transform: `scale(${fitScale})`, transformOrigin: 'center center', willChange: 'transform' }} onClick={e => e.stopPropagation()}>
        <div ref={cardRef} role="dialog" aria-modal="true" aria-label="Documentation" className={`modal-card k-rd-card w-[880px] h-[620px] flex flex-col overflow-hidden animate-scaleUp`}>

          <header className="k-modal-head">
            <span className="k-modal-icon"><BookText size={18} strokeWidth={1.5} absoluteStrokeWidth /></span>
            <div className="min-w-0 flex-1">
              <h2 className="k-modal-title truncate">Documentation</h2>
            </div>
            <ThemeSwitch />
            <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
          </header>

          <Deferred className="flex flex-1 min-h-0" estimate={0} skeleton={<DocsShape entry={selectedEntry} expanded={expanded} />} skeletonClassName="flex flex-1 min-h-0 w-full" snapshot="docs:window">

            <nav className="k-rd-side" aria-label="Guides">
              <div className="k-rd-search">
                <SearchField value={query} onChange={setQuery} placeholder="Search guides..." autoFocus />
              </div>

              <div className="k-rd-list custom-scrollbar">
                <SwapInPlace swapKey={searching ? 'search' : 'tree'} hold={false}>
                {searching ? (
                  results.length === 0 ? (
                    <div className="k-empty">
                      <span className="k-empty-title">No guides found</span>
                      <span className="k-empty-hint">Try a different word, like turret, portal or shield.</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {results.map(e => (
                        <button
                          key={e.guide.id}
                          type="button"
                          onClick={() => selectGuide(e.guide.id)}
                          className={`k-rd-item k-rd-item-stack ${e.guide.id === selectedId ? 'k-rd-item-on' : ''}`}
                        >
                          <span className="k-rd-item-text">{e.guide.title}</span>
                          <span className="k-rd-item-meta">{e.path}</span>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="flex flex-col gap-0.5">
                    {DOCS_CATEGORIES.map(cat => (
                      <CategoryNode key={cat.id} cat={cat} open={expanded.has(`cat:${cat.id}`)}
                        subsOpen={cat.subs.filter(sb => expanded.has(`sub:${sb.id}`)).map(sb => sb.id).join(',')}
                        selId={selectedEntry?.category.id === cat.id ? selectedId : ''}
                        onToggle={toggleNode} onSelect={selectGuide} busyCb={foldBusyCb} />
                    ))}
                  </div>
                )}
                </SwapInPlace>
              </div>
            </nav>

            {selected && (
              <div key={selected.guide.id} ref={pageRef} className={`flex-1 min-w-0 overflow-y-auto custom-scrollbar ${page.swapClass}`}>
                <GuidePage entry={selected} onNavigate={selectGuide} paneRef={pageRef} />
              </div>
            )}
          </Deferred>
        </div>
      </div>
    </div>,
    document.body
  );
};
