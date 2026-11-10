export const Tok = { Plain: 0, Comment: 1, Keyword: 2, String: 3, Number: 4, Func: 5, Type: 6, Prop: 7, Punct: 8, Tag: 9, Attr: 10, Head: 11 } as const;
export type Tok = number;

export interface Tokens { starts: Uint32Array; kinds: Uint8Array; count: number }

class Out {
  starts = new Uint32Array(4096);
  kinds = new Uint8Array(4096);
  count = 0;
  last = -1;
  mark(at: number, k: Tok): void {
    if (k === this.last) return;
    if (this.count > 0 && this.starts[this.count - 1] === at) {
      this.kinds[this.count - 1] = k;
      this.last = k;
      if (this.count > 1 && this.kinds[this.count - 2] === k) { this.count--; }
      return;
    }
    if (this.count === this.starts.length) {
      const s = new Uint32Array(this.count * 2); s.set(this.starts); this.starts = s;
      const d = new Uint8Array(this.count * 2); d.set(this.kinds); this.kinds = d;
    }
    this.starts[this.count] = at;
    this.kinds[this.count] = k;
    this.count++;
    this.last = k;
  }
  done(): Tokens { return { starts: this.starts, kinds: this.kinds, count: this.count }; }
}

const JS_KEYWORDS = new Set((
  'abstract as async await break case catch class const continue debugger declare default delete do else enum export ' +
  'extends false finally for from function get if implements import in infer instanceof interface is keyof let module ' +
  'namespace new null of package private protected public readonly return satisfies set static super switch this throw ' +
  'true try type typeof undefined unique var void while with yield'
).split(' '));
const JS_TYPES = new Set('any bigint boolean never number object string symbol unknown'.split(' '));
const EXPR_WORDS = new Set('return typeof case do else in of new delete void throw yield await instanceof'.split(' '));

const isIdStart = (c: number) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95 || c === 36 || c > 127;
const isIdPart = (c: number) => isIdStart(c) || (c >= 48 && c <= 57);
const isDigit = (c: number) => c >= 48 && c <= 57;
const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13 || c === 12 || c === 11;

function lexJs(src: string, from: number, to: number, out: Out, jsx: boolean): void {
  const kind: number[] = [0];
  const depth: number[] = [0];
  let i = from;
  let after = 0;
  let prevDot = false;
  while (i < to) {
    const top = kind.length - 1;
    const mode = kind[top];
    const c = src.charCodeAt(i);
    if (mode === 1) {
      out.mark(i, Tok.String);
      while (i < to) {
        const d = src.charCodeAt(i);
        if (d === 92) { i += 2; continue; }
        if (d === 96) { i++; kind.pop(); depth.pop(); after = 1; break; }
        if (d === 36 && src.charCodeAt(i + 1) === 123) {
          out.mark(i, Tok.Punct); i += 2; kind.push(0); depth.push(1); after = 0; break;
        }
        i++;
      }
      continue;
    }
    if (mode === 3) {
      if (c === 123) { out.mark(i, Tok.Punct); i++; kind.push(0); depth.push(1); after = 0; continue; }
      if (c === 60) {
        const closing = src.charCodeAt(i + 1) === 47;
        out.mark(i, Tok.Punct); i += closing ? 2 : 1;
        if (closing) depth[top]--; else depth[top]++;
        kind.push(2); depth.push(closing ? -1 : 0);
        const s = i;
        while (i < to && (isIdPart(src.charCodeAt(i)) || src.charCodeAt(i) === 46 || src.charCodeAt(i) === 45 || src.charCodeAt(i) === 58)) i++;
        if (i > s) out.mark(s, Tok.Tag);
        continue;
      }
      out.mark(i, Tok.Plain);
      while (i < to) { const d = src.charCodeAt(i); if (d === 60 || d === 123) break; i++; }
      continue;
    }
    if (mode === 2) {
      if (isSpace(c)) { out.mark(i, Tok.Plain); i++; continue; }
      if (c === 47 && src.charCodeAt(i + 1) === 42) {
        out.mark(i, Tok.Comment);
        const end = src.indexOf('*/', i + 2);
        i = end < 0 || end >= to ? to : end + 2;
        continue;
      }
      if (c === 47 && src.charCodeAt(i + 1) === 47) { out.mark(i, Tok.Comment); while (i < to && src.charCodeAt(i) !== 10) i++; continue; }
      if (c === 62 || (c === 47 && src.charCodeAt(i + 1) === 62)) {
        const selfClose = c === 47;
        out.mark(i, Tok.Punct); i += selfClose ? 2 : 1;
        const closingTag = depth[top] === -1;
        kind.pop(); depth.pop();
        const pt = kind.length - 1;
        if (kind[pt] === 3) {
          if (selfClose) depth[pt]--;
          if (depth[pt] <= 0) { kind.pop(); depth.pop(); after = 1; }
        } else if (!selfClose && !closingTag) {
          kind.push(3); depth.push(1);
        } else after = 1;
        continue;
      }
      if (c === 123) { out.mark(i, Tok.Punct); i++; kind.push(0); depth.push(1); after = 0; continue; }
      if (c === 34 || c === 39) {
        out.mark(i, Tok.String); i++;
        while (i < to && src.charCodeAt(i) !== c) i++;
        i++; continue;
      }
      if (isIdStart(c)) {
        out.mark(i, Tok.Attr);
        while (i < to && (isIdPart(src.charCodeAt(i)) || src.charCodeAt(i) === 45 || src.charCodeAt(i) === 58)) i++;
        continue;
      }
      out.mark(i, Tok.Punct); i++; continue;
    }

    if (isSpace(c)) { out.mark(i, Tok.Plain); i++; continue; }
    if (c === 47 && src.charCodeAt(i + 1) === 47) {
      out.mark(i, Tok.Comment);
      while (i < to && src.charCodeAt(i) !== 10) i++;
      continue;
    }
    if (c === 47 && src.charCodeAt(i + 1) === 42) {
      out.mark(i, Tok.Comment);
      const end = src.indexOf('*/', i + 2);
      i = end < 0 || end >= to ? to : end + 2;
      continue;
    }
    if (c === 34 || c === 39) {
      out.mark(i, Tok.String); i++;
      while (i < to) {
        const d = src.charCodeAt(i);
        if (d === 92) { i += 2; continue; }
        if (d === c) { i++; break; }
        if (d === 10) break;
        i++;
      }
      after = 1; prevDot = false; continue;
    }
    if (c === 96) { out.mark(i, Tok.String); i++; kind.push(1); depth.push(0); continue; }
    if (isDigit(c) || (c === 46 && isDigit(src.charCodeAt(i + 1)))) {
      out.mark(i, Tok.Number); i++;
      while (i < to) {
        const d = src.charCodeAt(i);
        if (isIdPart(d) || d === 46) { i++; continue; }
        if ((d === 43 || d === 45) && (src.charCodeAt(i - 1) | 32) === 101 && !/^0[xX]/.test(src.slice(i - 3, i))) { i++; continue; }
        break;
      }
      after = 1; prevDot = false; continue;
    }
    if (isIdStart(c)) {
      const s = i;
      while (i < to && isIdPart(src.charCodeAt(i))) i++;
      const word = src.slice(s, i);
      let k: Tok = Tok.Plain;
      if (prevDot) {
        let j = i; while (j < to && (src.charCodeAt(j) === 32 || src.charCodeAt(j) === 9)) j++;
        k = src.charCodeAt(j) === 40 ? Tok.Func : Tok.Prop;
      } else if (JS_KEYWORDS.has(word)) k = word === 'true' || word === 'false' || word === 'null' || word === 'undefined' ? Tok.Number : Tok.Keyword;
      else if (JS_TYPES.has(word)) k = Tok.Type;
      else {
        let j = i; while (j < to && (src.charCodeAt(j) === 32 || src.charCodeAt(j) === 9)) j++;
        const n = src.charCodeAt(j);
        if (n === 40) k = Tok.Func;
        else if (word.charCodeAt(0) >= 65 && word.charCodeAt(0) <= 90) k = Tok.Type;
      }
      out.mark(s, k);
      after = EXPR_WORDS.has(word) ? 0 : 1;
      prevDot = false;
      continue;
    }
    if (c === 47) {
      if (after === 0) {
        let j = i + 1, inClass = false, ok = false;
        while (j < to) {
          const d = src.charCodeAt(j);
          if (d === 10) break;
          if (d === 92) { j += 2; continue; }
          if (d === 91) inClass = true;
          else if (d === 93) inClass = false;
          else if (d === 47 && !inClass) { ok = true; break; }
          j++;
        }
        if (ok) {
          out.mark(i, Tok.String); i = j + 1;
          while (i < to && isIdPart(src.charCodeAt(i))) i++;
          after = 1; continue;
        }
      }
      out.mark(i, Tok.Punct); i++; after = 0; prevDot = false; continue;
    }
    if (jsx && c === 60 && after === 0) {
      const n = src.charCodeAt(i + 1);
      if (isIdStart(n) || n === 62) {
        let j = i + 1;
        while (j < to && (isIdPart(src.charCodeAt(j)) || src.charCodeAt(j) === 46 || src.charCodeAt(j) === 45)) j++;
        let q = j; while (q < to && isSpace(src.charCodeAt(q))) q++;
        const nq = src.charCodeAt(q);
        const generic = nq === 44 || src.startsWith('extends ', q);
        if (!generic) {
          out.mark(i, Tok.Punct); i++;
          if (j > i) out.mark(i, Tok.Tag);
          i = j;
          kind.push(2); depth.push(0);
          continue;
        }
      }
    }
    if (c === 123) { depth[top]++; out.mark(i, Tok.Punct); i++; after = 0; prevDot = false; continue; }
    if (c === 125) {
      depth[top]--;
      out.mark(i, Tok.Punct); i++;
      if (depth[top] <= 0 && kind.length > 1) { kind.pop(); depth.pop(); }
      after = 1; prevDot = false; continue;
    }
    if (c === 41 || c === 93) { out.mark(i, Tok.Punct); i++; after = 1; prevDot = false; continue; }
    if (c === 46 && src.charCodeAt(i + 1) !== 46) { out.mark(i, Tok.Punct); i++; prevDot = true; after = 0; continue; }
    if (c === 63 && src.charCodeAt(i + 1) === 46 && !isDigit(src.charCodeAt(i + 2))) { out.mark(i, Tok.Punct); i += 2; prevDot = true; after = 0; continue; }
    out.mark(i, Tok.Punct); i++; after = 0; prevDot = false;
  }
}

function lexJson(src: string, from: number, to: number, out: Out): void {
  let i = from;
  while (i < to) {
    const c = src.charCodeAt(i);
    if (c === 34) {
      const s = i; i++;
      while (i < to) { const d = src.charCodeAt(i); if (d === 92) { i += 2; continue; } i++; if (d === 34) break; }
      let j = i; while (j < to && isSpace(src.charCodeAt(j))) j++;
      out.mark(s, src.charCodeAt(j) === 58 ? Tok.Prop : Tok.String);
      continue;
    }
    if (isDigit(c) || c === 45) {
      out.mark(i, Tok.Number); i++;
      while (i < to) { const d = src.charCodeAt(i); if (isDigit(d) || d === 101 || d === 69 || d === 43 || d === 45 || d === 46) i++; else break; }
      continue;
    }
    if (c === 116 || c === 102 || c === 110) { out.mark(i, Tok.Number); while (i < to && isIdPart(src.charCodeAt(i))) i++; continue; }
    if (isSpace(c)) { out.mark(i, Tok.Plain); i++; continue; }
    out.mark(i, Tok.Punct); i++;
  }
}

function lexCss(src: string, from: number, to: number, out: Out): void {
  let i = from;
  let inDecl = false;
  while (i < to) {
    const c = src.charCodeAt(i);
    if (c === 47 && src.charCodeAt(i + 1) === 42) {
      out.mark(i, Tok.Comment);
      const end = src.indexOf('*/', i + 2);
      i = end < 0 || end >= to ? to : end + 2;
      continue;
    }
    if (isSpace(c)) { out.mark(i, Tok.Plain); i++; continue; }
    if (c === 34 || c === 39) {
      out.mark(i, Tok.String); i++;
      while (i < to) { const d = src.charCodeAt(i); if (d === 92) { i += 2; continue; } i++; if (d === c || d === 10) break; }
      continue;
    }
    if (c === 123 || c === 59) { out.mark(i, Tok.Punct); i++; inDecl = false; continue; }
    if (c === 125) { out.mark(i, Tok.Punct); i++; inDecl = false; continue; }
    if (inDecl) {
      if (isDigit(c) || (c === 46 && isDigit(src.charCodeAt(i + 1))) || (c === 45 && isDigit(src.charCodeAt(i + 1)))) {
        out.mark(i, Tok.Number); i++;
        while (i < to && (isIdPart(src.charCodeAt(i)) || src.charCodeAt(i) === 46 || src.charCodeAt(i) === 37)) i++;
        continue;
      }
      if (c === 35) { out.mark(i, Tok.Number); i++; while (i < to && isIdPart(src.charCodeAt(i))) i++; continue; }
      if (isIdStart(c) || c === 45) {
        const s = i;
        while (i < to && (isIdPart(src.charCodeAt(i)) || src.charCodeAt(i) === 45)) i++;
        out.mark(s, src.charCodeAt(i) === 40 ? Tok.Func : src.startsWith('--', s) ? Tok.Prop : Tok.Plain);
        continue;
      }
      if (c === 33) { out.mark(i, Tok.Keyword); i++; while (i < to && isIdPart(src.charCodeAt(i))) i++; continue; }
      out.mark(i, Tok.Punct); i++; continue;
    }
    if (c === 64) { out.mark(i, Tok.Keyword); i++; while (i < to && (isIdPart(src.charCodeAt(i)) || src.charCodeAt(i) === 45)) i++; continue; }
    let j = i, sel = false;
    while (j < to) {
      const d = src.charCodeAt(j);
      if (d === 123) { sel = true; break; }
      if (d === 59 || d === 125) break;
      if (d === 47 && src.charCodeAt(j + 1) === 42) { const e = src.indexOf('*/', j + 2); j = e < 0 ? to : e + 2; continue; }
      j++;
    }
    if (sel) {
      out.mark(i, Tok.Type);
      while (i < j && !(src.charCodeAt(i) === 47 && src.charCodeAt(i + 1) === 42)) i++;
      continue;
    }
    const s = i;
    while (i < to && src.charCodeAt(i) !== 58 && src.charCodeAt(i) !== 59 && src.charCodeAt(i) !== 125 && src.charCodeAt(i) !== 10) i++;
    out.mark(s, Tok.Prop);
    if (src.charCodeAt(i) === 58) { out.mark(i, Tok.Punct); i++; inDecl = true; }
  }
}

function lexHtml(src: string, from: number, to: number, out: Out): void {
  let i = from;
  while (i < to) {
    const c = src.charCodeAt(i);
    if (c === 60 && src.startsWith('<!--', i)) {
      out.mark(i, Tok.Comment);
      const end = src.indexOf('-->', i + 4);
      i = end < 0 || end >= to ? to : end + 3;
      continue;
    }
    if (c === 60 && (isIdStart(src.charCodeAt(i + 1)) || src.charCodeAt(i + 1) === 47 || src.charCodeAt(i + 1) === 33)) {
      out.mark(i, Tok.Punct); i++;
      if (src.charCodeAt(i) === 47 || src.charCodeAt(i) === 33) i++;
      const s = i;
      while (i < to && (isIdPart(src.charCodeAt(i)) || src.charCodeAt(i) === 45)) i++;
      const name = src.slice(s, i).toLowerCase();
      const closing = src.charCodeAt(s - 1) === 47;
      out.mark(s, Tok.Tag);
      while (i < to && src.charCodeAt(i) !== 62) {
        const d = src.charCodeAt(i);
        if (isSpace(d)) { out.mark(i, Tok.Plain); i++; continue; }
        if (d === 34 || d === 39) {
          out.mark(i, Tok.String); i++;
          while (i < to && src.charCodeAt(i) !== d) i++;
          i++; continue;
        }
        if (isIdStart(d)) { out.mark(i, Tok.Attr); while (i < to && (isIdPart(src.charCodeAt(i)) || src.charCodeAt(i) === 45 || src.charCodeAt(i) === 58)) i++; continue; }
        out.mark(i, Tok.Punct); i++;
      }
      if (i < to) { out.mark(i, Tok.Punct); i++; }
      if (!closing && (name === 'style' || name === 'script')) {
        const end = src.toLowerCase().indexOf('</' + name, i);
        const stop = end < 0 || end > to ? to : end;
        if (name === 'style') lexCss(src, i, stop, out); else lexJs(src, i, stop, out, false);
        i = stop;
      }
      continue;
    }
    if (c === 38) {
      const semi = src.indexOf(';', i);
      if (semi > i && semi - i < 10) { out.mark(i, Tok.Number); i = semi + 1; continue; }
    }
    out.mark(i, Tok.Plain); i++;
  }
}

function lexMarkdown(src: string, out: Out): void {
  let i = 0;
  const n = src.length;
  let fenced = false;
  while (i < n) {
    let e = src.indexOf('\n', i);
    if (e < 0) e = n;
    const line = src.slice(i, e);
    if (/^\s*(```|~~~)/.test(line)) { out.mark(i, Tok.String); fenced = !fenced; i = e + 1; continue; }
    if (fenced) { out.mark(i, Tok.String); i = e + 1; continue; }
    if (/^#{1,6}\s/.test(line)) { out.mark(i, Tok.Head); i = e + 1; continue; }
    const list = /^(\s*)([-*+]|\d+\.)\s/.exec(line);
    let j = i;
    if (list) { out.mark(i, Tok.Plain); out.mark(i + list[1].length, Tok.Punct); j = i + list[0].length; }
    else if (line.startsWith('>')) { out.mark(i, Tok.Comment); i = e + 1; continue; }
    out.mark(j, Tok.Plain);
    while (j < e) {
      const c = src.charCodeAt(j);
      if (c === 96) { const k = src.indexOf('`', j + 1); if (k > j && k < e) { out.mark(j, Tok.String); j = k + 1; out.mark(j, Tok.Plain); continue; } }
      if (c === 42 && src.charCodeAt(j + 1) === 42) { const k = src.indexOf('**', j + 2); if (k > j && k < e) { out.mark(j, Tok.Type); j = k + 2; out.mark(j, Tok.Plain); continue; } }
      if (c === 91) { const k = src.indexOf('](', j); const m = k > 0 ? src.indexOf(')', k) : -1; if (k > j && m > k && m < e) { out.mark(j, Tok.Func); j = m + 1; out.mark(j, Tok.Plain); continue; } }
      j++;
    }
    i = e + 1;
  }
}

export function lexCode(src: string, lang: string): Tokens {
  const out = new Out();
  out.mark(0, Tok.Plain);
  try {
    if (lang === 'ts' || lang === 'js') lexJs(src, 0, src.length, out, false);
    else if (lang === 'tsx') lexJs(src, 0, src.length, out, true);
    else if (lang === 'json') lexJson(src, 0, src.length, out);
    else if (lang === 'css') lexCss(src, 0, src.length, out);
    else if (lang === 'html') lexHtml(src, 0, src.length, out);
    else if (lang === 'md') lexMarkdown(src, out);
  } catch {
    const plain = new Out();
    plain.mark(0, Tok.Plain);
    return plain.done();
  }
  return out.done();
}
