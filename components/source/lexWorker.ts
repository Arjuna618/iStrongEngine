import { lexCode } from './codeLexer';

self.onmessage = (e: MessageEvent<{ id: number; text: string; lang: string }>) => {
  const { id, text, lang } = e.data;
  const t = lexCode(text, lang);
  const starts = t.starts.slice(0, t.count);
  const kinds = t.kinds.slice(0, t.count);
  (self as unknown as Worker).postMessage({ id, starts, kinds, count: t.count }, [starts.buffer, kinds.buffer]);
};
