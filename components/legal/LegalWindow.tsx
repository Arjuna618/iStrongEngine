import React, { useState } from 'react';
import { Modal } from '../kit/Modal';
import { PageSwap } from '../kit/Collapse';
import { LegalTerms } from '../ui/icons';
import { useModalMaxHeight, useModalMaxWidth } from '../../utils/useMenuScale';
import { isTouchScreen } from '../../utils/device';
import { Segmented } from '../kit/kit';

const LEGAL_NARROW_BELOW = 560;
const LEGAL_TOUCH_MIN_H = 120;
import { LICENSE_BLOCKS, TERMS_BLOCKS, PRIVACY_BLOCKS, legalBlocks, legalSpans, type LegalBlock } from './legalText';
import noticesSource from '../../public/THIRD-PARTY-NOTICES.txt?raw';

export type LegalPage = 'terms' | 'privacy' | 'license' | 'notices';
const PAGES: { id: LegalPage; label: string }[] = [
  { id: 'terms', label: 'Terms of Use' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'license', label: 'License' },
  { id: 'notices', label: 'Notices' },
];
export const LEGAL_HASH: Record<LegalPage, string> = { terms: '#terms', privacy: '#privacy', license: '#license', notices: '#notices' };
export function legalPageOfHash(hash: string): LegalPage | null {
  const h = hash.toLowerCase();
  for (const p of PAGES) if (LEGAL_HASH[p.id] === h) return p.id;
  return null;
}

interface NoticePart { name: string; license: string; link: string; blocks: LegalBlock[] }
function noticeParts(src: string): { intro: LegalBlock[]; parts: NoticePart[] } {
  const chunks = src.replace(/\r\n/g, '\n').split(/^={20,}$/m);
  const intro = legalBlocks(chunks[0] ?? '');
  const parts: NoticePart[] = [];
  for (let i = 1; i + 1 < chunks.length; i += 2) {
    const head = chunks[i].trim().split('\n');
    const m = /^(.*) \(([^()]+)\)$/.exec((head[0] ?? '').trim());
    parts.push({ name: m ? m[1] : (head[0] ?? ''), license: m ? m[2] : '', link: (head[1] ?? '').trim(), blocks: legalBlocks(chunks[i + 1]) });
  }
  return { intro, parts };
}
const NOTICES = noticeParts(noticesSource);

function Spans({ text }: { text: string }) {
  return <>{legalSpans(text).map((s, i) => {
    if (s.k === 'bold') return <strong key={i} className="k-legal-strong">{s.text}</strong>;
    if (s.k === 'code') return <code key={i} className="k-legal-code">{s.text}</code>;
    if (s.k === 'link') return <a key={i} href={s.href} target="_blank" rel="noopener noreferrer" className="k-legal-link">{s.text}</a>;
    return <React.Fragment key={i}>{s.text}</React.Fragment>;
  })}</>;
}

function Blocks({ blocks, inCard }: { blocks: LegalBlock[]; inCard?: boolean }) {
  return <>{blocks.map((b, i) => {
    switch (b.t) {
      case 'title': return <h3 key={i} className={inCard ? 'k-legal-card-title' : 'k-legal-title'}>{b.text}</h3>;
      case 'h': return <h4 key={i} className={inCard ? 'k-legal-card-h' : 'k-docs-h'}>{b.text}</h4>;
      case 'li': return <p key={i} className="k-docs-p k-legal-li"><span className="k-legal-dot" aria-hidden />{<Spans text={b.text} />}</p>;
      case 'quote': return <p key={i} className="k-docs-p k-legal-quote"><Spans text={b.text} /></p>;
      default:
        if (/^(Version |Required Notice:)/.test(b.text)) return <p key={i} className="k-legal-meta"><Spans text={b.text} /></p>;
        return <p key={i} className="k-docs-p"><Spans text={b.text} /></p>;
    }
  })}</>;
}

function NoticesPage() {
  return (
    <>
      <h3 className="k-legal-title">Notices</h3>
      <Blocks blocks={NOTICES.intro} />
      {NOTICES.parts.map((p, i) => (
        <section key={i} className="k-info-card k-legal-notice">
          <header className="k-legal-notice-head">
            <div className="k-legal-notice-name">{p.name}</div>
            {p.license && <span className="k-badge k-legal-notice-tag">{p.license}</span>}
            {p.link && <div className="k-legal-notice-link"><Spans text={p.link} /></div>}
          </header>
          <div className="k-legal-notice-body"><Blocks blocks={p.blocks} inCard /></div>
        </section>
      ))}
    </>
  );
}

export const LegalWindow: React.FC<{
  page: LegalPage;
  ask: boolean;
  onAgree: () => void;
  onClose: () => void;
  onPage?: (page: LegalPage) => void;
}> = ({ page: firstPage, ask, onAgree, onClose, onPage }) => {
  const [page, setPageRaw] = useState<LegalPage>(firstPage);
  const setPage = (p: LegalPage) => { setPageRaw(p); onPage?.(p); };
  const maxH = useModalMaxHeight();
  const maxW = useModalMaxWidth();
  const touch = isTouchScreen();
  const narrow = touch && Math.min(860, maxW) < LEGAL_NARROW_BELOW;
  const bodyH = touch
    ? Math.max(LEGAL_TOUCH_MIN_H, Math.min(640, maxH - (ask ? 120 : 58)))
    : Math.max(320, Math.min(640, maxH - (ask ? 120 : 58)));
  const askNote = 'By clicking I Agree, you accept the Terms of Use and the License, and you confirm you have read the Privacy Notice.';
  return (
    <Modal title="Terms and License" icon={<LegalTerms size={18} absoluteStrokeWidth />} width={860} onClose={onClose} fit
      bodyClassName="k-modal-body-flush" waitHeight={bodyH} surface="content"
      footer={ask ? (close => <>
        <button type="button" className="k-btn k-btn-secondary k-btn-md flex-1" onClick={() => close()}>Not Now</button>
        <button type="button" className="k-btn k-btn-primary k-btn-md flex-1" onClick={() => close(onAgree)}>I Agree</button>
      </>) : undefined}>
      <div className={narrow ? 'flex flex-col min-h-0 k-legal-narrow' : 'flex min-h-0'} style={{ height: bodyH }}>
        {narrow ? (
          <div className="k-legal-tabs">
            <Segmented<LegalPage> value={page} onChange={setPage} options={PAGES.map(p => ({ value: p.id, label: p.label }))} />
          </div>
        ) : (
          <nav className="k-rd-side k-legal-side" aria-label="Pages">
            <div className="k-rd-list">
              {PAGES.map(p => (
                <button key={p.id} type="button" className={page === p.id ? 'k-rd-item k-rd-item-on' : 'k-rd-item'} onClick={() => setPage(p.id)}>
                  <span className="k-rd-item-text">{p.label}</span>
                </button>
              ))}
              {ask && <p className="k-legal-side-note">{askNote}</p>}
            </div>
          </nav>
        )}
        <PageSwap>
          <div key={page} className={narrow ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar' : 'flex-1 min-w-0 overflow-y-auto custom-scrollbar'}>
            <div className="k-legal-page">
              {narrow && ask ? <p className="k-legal-meta">{askNote}</p> : null}
              {page === 'notices' ? <NoticesPage /> : <Blocks blocks={page === 'terms' ? TERMS_BLOCKS : page === 'privacy' ? PRIVACY_BLOCKS : LICENSE_BLOCKS} />}
            </div>
          </div>
        </PageSwap>
      </div>
    </Modal>
  );
};
