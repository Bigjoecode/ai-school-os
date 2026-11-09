/**
 * HTML for the web-page practical: a small tolerant parser (a single linear
 * pass, no regular expressions over the student's page), the facts a marker
 * checks, and the sanitiser behind the live preview.
 *
 * The preview never shows the student's own markup. It rebuilds a page from an
 * allow-list of tags and attributes, with no scripts, no event handlers, no
 * forms and no outside addresses, under a Content-Security-Policy that forbids
 * every network request, inside an iframe with an empty `sandbox` attribute.
 * Hyperlinks look like links but go nowhere: a click cannot leave the frame.
 */

export const HTML_LIMITS = { nodes: 1500, depth: 48 } as const;

export interface HtmlEl {
  tag: string;
  attrs: Record<string, string>;
  kids: (HtmlEl | string)[];
}
export interface HtmlParsed {
  root: HtmlEl;
  /** Unclosed, stray or wrongly nested tags, in plain words. */
  problems: string[];
}

const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW = new Set(['script', 'style', 'textarea', 'title']);
const OPTIONAL_END = new Set(['p', 'li', 'td', 'th', 'tr', 'dt', 'dd', 'option', 'thead', 'tbody', 'tfoot']);
const isSpace = (c: string | undefined) => c === ' ' || c === '\n' || c === '\t' || c === '\r' || c === '\f';
const isNameChar = (c: string | undefined) => c !== undefined && ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '-' || c === ':' || c === '_');

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©' };
export function htmlDecode(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '&') {
      out += s[i];
      continue;
    }
    const end = s.indexOf(';', i);
    if (end < 0 || end - i > 10) {
      out += '&';
      continue;
    }
    const name = s.slice(i + 1, end);
    const num = name[0] === '#' ? Number(name[1] === 'x' ? `0x${name.slice(2)}` : name.slice(1)) : NaN;
    if (Number.isInteger(num) && num > 0 && num < 0x10000) out += String.fromCharCode(num);
    else if (ENT[name] !== undefined) out += ENT[name];
    else {
      out += '&';
      continue;
    }
    i = end;
  }
  return out;
}

/** Parses a page. Always returns a tree; what is wrong with it is in `problems`. */
export function parseHtml(src: string): HtmlParsed {
  const root: HtmlEl = { tag: '#root', attrs: {}, kids: [] };
  const stack: HtmlEl[] = [root];
  const problems: string[] = [];
  let count = 0;
  let i = 0;
  const top = () => stack[stack.length - 1]!;
  const text = (t: string) => {
    if (t) top().kids.push(htmlDecode(t));
  };
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      text(src.slice(i));
      break;
    }
    text(src.slice(i, lt));
    i = lt;
    if (src.startsWith('<!--', i)) {
      const e = src.indexOf('-->', i + 4);
      i = e < 0 ? src.length : e + 3;
      continue;
    }
    if (src[i + 1] === '!' || src[i + 1] === '?') {
      const e = src.indexOf('>', i);
      i = e < 0 ? src.length : e + 1;
      continue;
    }
    const closing = src[i + 1] === '/';
    let j = i + (closing ? 2 : 1);
    const nameStart = j;
    while (isNameChar(src[j])) j++;
    const tag = src.slice(nameStart, j).toLowerCase();
    if (!tag) {
      text('<');
      i++;
      continue;
    }
    const attrs: Record<string, string> = {};
    let selfClose = false;
    for (;;) {
      while (isSpace(src[j])) j++;
      if (j >= src.length) break;
      if (src[j] === '>') {
        j++;
        break;
      }
      if (src[j] === '/') {
        selfClose = src[j + 1] === '>';
        j++;
        continue;
      }
      const a0 = j;
      while (j < src.length && !isSpace(src[j]) && src[j] !== '=' && src[j] !== '>' && src[j] !== '/') j++;
      if (j === a0) {
        j++;
        continue;
      }
      const name = src.slice(a0, j).toLowerCase();
      while (isSpace(src[j])) j++;
      let value = '';
      if (src[j] === '=') {
        j++;
        while (isSpace(src[j])) j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const e = src.indexOf(q, j + 1);
          value = src.slice(j + 1, e < 0 ? src.length : e);
          j = e < 0 ? src.length : e + 1;
        } else {
          const v0 = j;
          while (j < src.length && !isSpace(src[j]) && src[j] !== '>') j++;
          value = src.slice(v0, j);
        }
      }
      if (Object.keys(attrs).length < 24 && !(name in attrs)) attrs[name] = htmlDecode(value);
    }
    i = j;
    if (closing) {
      if (VOID.has(tag)) continue;
      let k = stack.length - 1;
      while (k > 0 && stack[k]!.tag !== tag) k--;
      if (k === 0) {
        problems.push(`</${tag}> has no opening tag.`);
        continue;
      }
      for (let m = stack.length - 1; m > k; m--) if (!OPTIONAL_END.has(stack[m]!.tag)) problems.push(`<${stack[m]!.tag}> is not closed before </${tag}>.`);
      stack.length = k;
      continue;
    }
    if (++count > HTML_LIMITS.nodes) {
      problems.push('The page is too long.');
      break;
    }
    const el: HtmlEl = { tag, attrs, kids: [] };
    if (OPTIONAL_END.has(tag) && top().tag === tag) stack.pop();
    top().kids.push(el);
    if (VOID.has(tag) || selfClose) continue;
    if (RAW.has(tag)) {
      const close = indexOfClose(src, tag, i);
      if (close < 0) {
        problems.push(`<${tag}> is not closed.`);
        el.kids.push(src.slice(i));
        i = src.length;
      } else {
        el.kids.push(tag === 'title' ? htmlDecode(src.slice(i, close)) : src.slice(i, close));
        const gt = src.indexOf('>', close);
        i = gt < 0 ? src.length : gt + 1;
      }
      continue;
    }
    if (stack.length >= HTML_LIMITS.depth) {
      problems.push('The tags are nested too deeply.');
      continue;
    }
    stack.push(el);
  }
  for (let m = stack.length - 1; m > 0; m--) if (!OPTIONAL_END.has(stack[m]!.tag)) problems.push(`<${stack[m]!.tag}> is not closed.`);
  return { root, problems };
}

function indexOfClose(src: string, tag: string, from: number): number {
  const needle = `</${tag}`;
  const lower = src.toLowerCase();
  let i = from;
  for (;;) {
    const at = lower.indexOf(needle, i);
    if (at < 0) return -1;
    if (!isNameChar(src[at + needle.length])) return at;
    i = at + 1;
  }
}

export function htmlText(n: HtmlEl | string): string {
  if (typeof n === 'string') return n;
  if (n.tag === 'script' || n.tag === 'style') return '';
  return n.kids.map(htmlText).join('');
}
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
export function htmlFind(n: HtmlEl, tag: string, out: HtmlEl[] = []): HtmlEl[] {
  for (const k of n.kids)
    if (typeof k !== 'string') {
      if (k.tag === tag) out.push(k);
      htmlFind(k, tag, out);
    }
  return out;
}

export interface HtmlFacts {
  html: boolean;
  head: boolean;
  body: boolean;
  headBeforeBody: boolean;
  titleInHead: boolean;
  title: string;
  headings: string[];
  paragraphs: string[];
  listItems: string[];
  listTag: 'ul' | 'ol' | null;
  links: { href: string; text: string }[];
  problems: string[];
  scripts: number;
}

/** What the marker reads off a page. */
export function htmlFacts(src: string): HtmlFacts {
  const { root, problems } = parseHtml(src);
  const html = root.kids.find((k): k is HtmlEl => typeof k !== 'string' && k.tag === 'html') ?? null;
  const within = html ?? root;
  const kids = within.kids.filter((k): k is HtmlEl => typeof k !== 'string');
  const head = kids.find((k) => k.tag === 'head') ?? null;
  const body = kids.find((k) => k.tag === 'body') ?? null;
  const main = body ?? within;
  const titleEl = (head ? htmlFind(head, 'title') : htmlFind(root, 'title'))[0];
  const ul = htmlFind(main, 'ul')[0];
  const ol = htmlFind(main, 'ol')[0];
  const list = ul ?? ol ?? null;
  return {
    html: !!html,
    head: !!head,
    body: !!body,
    headBeforeBody: !!head && !!body && kids.indexOf(head) < kids.indexOf(body),
    titleInHead: !!head && htmlFind(head, 'title').length > 0,
    title: titleEl ? squash(htmlText(titleEl)) : '',
    headings: htmlFind(main, 'h1').map((h) => squash(htmlText(h))),
    paragraphs: htmlFind(main, 'p').map((p) => squash(htmlText(p))),
    listItems: list ? htmlFind(list, 'li').map((l) => squash(htmlText(l))) : [],
    listTag: ul ? 'ul' : ol ? 'ol' : null,
    links: htmlFind(main, 'a').map((a) => ({ href: (a.attrs.href ?? '').trim(), text: squash(htmlText(a)) })),
    problems,
    scripts: htmlFind(root, 'script').length,
  };
}

// ------------------------------------------------------------------ the preview

const ALLOWED = new Set('html head title body h1 h2 h3 h4 h5 h6 p br hr b i u em strong small sub sup mark center font ul ol li dl dt dd table caption thead tbody tfoot tr th td a img div span pre code blockquote style'.split(' '));
/** Dropped with everything inside them. */
const DROP = new Set(['script', 'iframe', 'object', 'embed', 'applet', 'noscript', 'template', 'svg', 'math', 'frameset', 'frame', 'form', 'audio', 'video', 'canvas', 'base', 'link', 'meta']);
const ATTRS = new Set('align valign bgcolor color size face width height border cellpadding cellspacing colspan rowspan alt title type start id class'.split(' '));
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** CSS that could reach outside: url(), @import, old expression(). */
const safeCss = (s: string) => (/url\s*\(|@import|expression\s*\(|behavior\s*:|-moz-binding|javascript:/i.test(s.replace(/\\/g, '')) ? '' : s);

function emit(n: HtmlEl | string): string {
  if (typeof n === 'string') return esc(n);
  if (DROP.has(n.tag)) return '';
  const inner = n.tag === 'style' ? safeCss(n.kids.join('')).replace(/<\/?style/gi, '') : n.kids.map(emit).join('');
  if (!ALLOWED.has(n.tag)) return inner;
  if (n.tag === 'style') return `<style>${inner}</style>`;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(n.attrs)) {
    if (k === 'href' && n.tag === 'a') parts.push(` data-href="${esc(v)}" class="cc-link"`);
    else if (k === 'src' && n.tag === 'img') {
      if (/^data:image\/(png|gif|jpeg|webp);base64,[A-Za-z0-9+/=]*$/.test(v.slice(0, 6000))) parts.push(` src="${esc(v)}"`);
    } else if (k === 'style') {
      const css = safeCss(v);
      if (css) parts.push(` style="${esc(css)}"`);
    } else if (ATTRS.has(k)) parts.push(` ${k}="${esc(v)}"`);
  }
  return VOID.has(n.tag) ? `<${n.tag}${parts.join('')}>` : `<${n.tag}${parts.join('')}>${inner}</${n.tag}>`;
}

/** No request can leave this page: the only images allowed are ones written into it. */
export const HTML_PREVIEW_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'";

/** The student's page rebuilt for the preview: put it in `<iframe sandbox="" srcDoc={…}>`. The CSP meta comes first in the head. */
export function htmlPreviewDoc(src: string): string {
  const { root } = parseHtml(src);
  const html = root.kids.find((k): k is HtmlEl => typeof k !== 'string' && k.tag === 'html');
  const kids = (html ?? root).kids;
  const head = kids.find((k): k is HtmlEl => typeof k !== 'string' && k.tag === 'head');
  const body = kids.find((k): k is HtmlEl => typeof k !== 'string' && k.tag === 'body');
  const headInner = head ? head.kids.map(emit).join('') : '';
  const bodyInner = body ? body.kids.map(emit).join('') : kids.filter((k) => k !== head).map(emit).join('');
  const bodyAttrs = body ? emit({ ...body, kids: [] }).replace(/^<body/, '').replace(/><\/body>$/, '') : '';
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${esc(HTML_PREVIEW_CSP)}"><style>body{font-family:'Times New Roman',serif;margin:8px;color:#000;background:#fff}.cc-link{color:#00e;text-decoration:underline}</style>${headInner}</head><body${bodyAttrs}>${bodyInner}</body></html>`;
}
