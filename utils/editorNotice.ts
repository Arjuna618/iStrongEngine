type NoticeHost = (message: string) => void;

let _host: NoticeHost | null = null;
let _last = '';

export function registerEditorNoticeHost(host: NoticeHost): () => void {
  _host = host;
  return () => { if (_host === host) _host = null; };
}

export function editorNotice(message: string): void {
  _last = message;
  if (_host) _host(message);
}

export function lastEditorNotice(): string {
  return _last;
}
