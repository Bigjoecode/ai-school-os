/** comp-office: the presentation, the file system, and the simulated (offline) web, mailbox and cloud folder. Pure operations. */

// ------------------------------------------------------------------ presentation

export const CO_TRANSITIONS = ['NONE', 'FADE', 'PUSH', 'WIPE'] as const;
export const CO_ANIMS = ['NONE', 'APPEAR', 'FADE', 'FLY_IN'] as const;
export const CO_THEMES = ['Plain', 'Ocean', 'Forest', 'Sunset'] as const;
export type CoLayout = 'TITLE' | 'CONTENT';
export interface CoSlide {
  id: string;
  layout: CoLayout;
  title: string;
  body: string;
  pic: boolean;
  chart: boolean;
  table: boolean;
  shape: boolean;
  anim: (typeof CO_ANIMS)[number];
  transition: (typeof CO_TRANSITIONS)[number];
  /** Seconds before it advances by itself; 0 = on click. */
  advance: number;
}
export interface CoDeck {
  slides: CoSlide[];
  theme: string;
  master: { titleFont: string; titleColor: string; logo: boolean; footer: string; used: boolean };
  saved: string;
  closed: boolean;
  reopened: number;
  /** Slide-show runs: slides seen in the furthest run, and whether a run ended properly with Esc. */
  shows: number;
  shownSlides: number;
  escaped: boolean;
  fromStart: boolean;
  handouts: { perPage: number; pages: number; jobs: number };
}
export const coEmptyDeck = (): CoDeck => ({ slides: [], theme: 'Plain', master: { titleFont: 'Calibri', titleColor: '#111827', logo: false, footer: '', used: false }, saved: '', closed: false, reopened: 0, shows: 0, shownSlides: 0, escaped: false, fromStart: false, handouts: { perPage: 1, pages: 0, jobs: 0 } });
export const coSlide = (id: string, layout: CoLayout, title = '', body = ''): CoSlide => ({ id, layout, title, body, pic: false, chart: false, table: false, shape: false, anim: 'NONE', transition: 'NONE', advance: 0 });
export const coAddSlide = (d: CoDeck, title = '', body = ''): CoDeck => ({ ...d, slides: [...d.slides, coSlide(`s${d.slides.length + 1}`, 'CONTENT', title, body)] });
export const coEditSlide = (d: CoDeck, i: number, patch: Partial<CoSlide>): CoDeck => ({ ...d, slides: d.slides.map((s, k) => (k === i ? { ...s, ...patch } : s)) });
export const coApplyAll = (d: CoDeck, patch: Partial<CoSlide>): CoDeck => ({ ...d, slides: d.slides.map((s) => ({ ...s, ...patch })) });
export const coRunShow = (d: CoDeck, seen: number, escaped: boolean, fromStart: boolean): CoDeck => ({ ...d, shows: d.shows + 1, shownSlides: Math.max(d.shownSlides, seen), escaped: d.escaped || escaped, fromStart: d.fromStart || fromStart });
export const coPrintHandouts = (d: CoDeck, perPage: number): CoDeck => ({ ...d, handouts: { perPage, pages: Math.ceil(d.slides.length / perPage), jobs: d.handouts.jobs + 1 } });
export const coDeckSeconds = (d: CoDeck) => d.slides.reduce((t, s) => t + s.advance, 0);

// ------------------------------------------------------------------ files

export interface CoNode {
  id: string;
  name: string;
  /** Parent node id; null for a drive. */
  parent: string | null;
  kind: 'DRIVE' | 'FOLDER' | 'FILE';
  /** KB (files). */
  size: number;
  /** In the Recycle Bin: where it came from. */
  bin?: string;
}
export interface CoFs {
  nodes: CoNode[];
  next: number;
  /** Cut or copied items. */
  clip: { ids: string[]; cut: boolean } | null;
  flash: 'OUT' | 'IN' | 'EJECTED';
  view: 'ICONS' | 'DETAILS';
  /** Commands typed at the Command Prompt. */
  cmds: string[];
  /** Node ids whose Properties were opened. */
  props: string[];
  /** Files the antivirus scanned. */
  scanned: string[];
  /** Kinds of actions done with the keyboard or menus: copy, cut, paste, rename, restore, delete. */
  did: string[];
  permanentlyDeleted: string[];
}
export const coEmptyFs = (): CoFs => ({ nodes: [], next: 1, clip: null, flash: 'OUT', view: 'ICONS', cmds: [], props: [], scanned: [], did: [], permanentlyDeleted: [] });
const dupName = (fs: CoFs, parent: string, name: string) => fs.nodes.some((n) => n.parent === parent && !n.bin && n.name.toLowerCase() === name.toLowerCase());
const did = (fs: CoFs, k: string): CoFs => (fs.did.includes(k) ? fs : { ...fs, did: [...fs.did, k] });
export const coFsKids = (fs: CoFs, parent: string | null) => fs.nodes.filter((n) => n.parent === parent && !n.bin);
export const coFsBin = (fs: CoFs) => fs.nodes.filter((n) => n.bin);
const BAD_NAME = /[\\/:*?"<>|]/;
export function coFsMkdir(fs: CoFs, parent: string, name: string): { fs: CoFs; error: string | null } {
  const n = name.trim();
  if (!n) return { fs, error: 'Give the folder a name.' };
  if (BAD_NAME.test(n)) return { fs, error: 'A name cannot contain \\ / : * ? " < > |' };
  if (dupName(fs, parent, n)) return { fs, error: 'That name is already used here.' };
  return { fs: { ...fs, next: fs.next + 1, nodes: [...fs.nodes, { id: `n${fs.next}`, name: n, parent, kind: 'FOLDER', size: 0 }] }, error: null };
}
export function coFsRename(fs: CoFs, id: string, name: string): { fs: CoFs; error: string | null } {
  const node = fs.nodes.find((x) => x.id === id);
  const n = name.trim();
  if (!node) return { fs, error: 'Nothing selected.' };
  if (!n || BAD_NAME.test(n)) return { fs, error: 'A name cannot be empty or contain \\ / : * ? " < > |' };
  if (node.parent && dupName(fs, node.parent, n) && n.toLowerCase() !== node.name.toLowerCase()) return { fs, error: 'That name is already used here.' };
  return { fs: did({ ...fs, nodes: fs.nodes.map((x) => (x.id === id ? { ...x, name: n } : x)) }, 'rename'), error: null };
}
export const coFsCopy = (fs: CoFs, ids: string[], cut: boolean): CoFs => did({ ...fs, clip: { ids, cut } }, cut ? 'cut' : 'copy');
function cloneInto(fs: CoFs, id: string, parent: string): CoFs {
  const src = fs.nodes.find((x) => x.id === id)!;
  let name = src.name;
  if (dupName(fs, parent, name)) {
    const m = /^(.*?)(\.[^.]*)?$/.exec(src.name)!;
    name = `${m[1]} - Copy${m[2] ?? ''}`;
  }
  const nid = `n${fs.next}`;
  let out: CoFs = { ...fs, next: fs.next + 1, nodes: [...fs.nodes, { ...src, id: nid, name, parent, bin: undefined }] };
  for (const k of fs.nodes.filter((x) => x.parent === id && !x.bin)) out = cloneInto(out, k.id, nid);
  return out;
}
const isInside = (fs: CoFs, id: string, anc: string): boolean => {
  for (let n = fs.nodes.find((x) => x.id === id); n; n = fs.nodes.find((x) => x.id === n!.parent)) if (n.id === anc) return true;
  return false;
};
export function coFsPaste(fs: CoFs, parent: string): { fs: CoFs; error: string | null } {
  if (!fs.clip?.ids.length) return { fs, error: 'Nothing to paste: copy or cut something first.' };
  let out = fs;
  for (const id of fs.clip.ids) {
    const src = out.nodes.find((x) => x.id === id);
    if (!src) continue;
    if (isInside(out, parent, id)) return { fs, error: 'A folder cannot be put inside itself.' };
    if (fs.clip.cut) {
      if (src.parent === parent) continue;
      if (dupName(out, parent, src.name)) return { fs, error: `${src.name} already exists here.` };
      out = { ...out, nodes: out.nodes.map((x) => (x.id === id ? { ...x, parent } : x)) };
    } else out = cloneInto(out, id, parent);
  }
  return { fs: did({ ...out, clip: fs.clip.cut ? null : fs.clip }, 'paste'), error: null };
}
const driveOf = (fs: CoFs, id: string): CoNode | undefined => {
  let n = fs.nodes.find((x) => x.id === id);
  while (n?.parent) n = fs.nodes.find((x) => x.id === n!.parent);
  return n;
};
const descendants = (fs: CoFs, id: string): string[] => fs.nodes.filter((x) => x.parent === id).flatMap((x) => [x.id, ...descendants(fs, x.id)]);
/** Deleting from a hard disk goes to the Recycle Bin; from a flash drive it is gone for good. */
export function coFsDelete(fs: CoFs, id: string): CoFs {
  const n = fs.nodes.find((x) => x.id === id);
  if (!n || n.kind === 'DRIVE') return fs;
  if (driveOf(fs, id)?.name.startsWith('E:')) {
    const gone = [id, ...descendants(fs, id)];
    return did({ ...fs, nodes: fs.nodes.filter((x) => !gone.includes(x.id)), permanentlyDeleted: [...fs.permanentlyDeleted, n.name].slice(-20) }, 'delete');
  }
  return did({ ...fs, nodes: fs.nodes.map((x) => (x.id === id ? { ...x, bin: x.parent!, parent: 'BIN' } : x)) }, 'delete');
}
export function coFsRestore(fs: CoFs, id: string): CoFs {
  const n = fs.nodes.find((x) => x.id === id);
  if (!n?.bin) return fs;
  return did({ ...fs, nodes: fs.nodes.map((x) => (x.id === id ? { ...x, parent: x.bin!, bin: undefined } : x)) }, 'restore');
}
export const coFsPath = (fs: CoFs, id: string): string => {
  const parts: string[] = [];
  for (let n = fs.nodes.find((x) => x.id === id); n; n = fs.nodes.find((x) => x.id === n!.parent)) parts.unshift(n.kind === 'DRIVE' ? n.name.slice(0, 2) : n.name);
  return parts.join('\\');
};
export const coFsByPath = (fs: CoFs, path: string): CoNode | undefined => {
  const want = path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  return fs.nodes.find((n) => !n.bin && n.parent !== 'BIN' && coFsPath(fs, n.id).toLowerCase() === want);
};
export const coFsSize = (fs: CoFs, id: string): number => {
  const n = fs.nodes.find((x) => x.id === id);
  return !n ? 0 : (n.kind === 'FILE' ? n.size : 0) + fs.nodes.filter((x) => x.parent === id && !x.bin).reduce((t, k) => t + coFsSize(fs, k.id), 0);
};
export const coFsInsertFlash = (fs: CoFs): CoFs => {
  if (fs.flash === 'IN') return fs;
  const has = fs.nodes.some((n) => n.kind === 'DRIVE' && n.name.startsWith('E:'));
  return { ...fs, flash: 'IN', nodes: has ? fs.nodes : [...fs.nodes, { id: 'flash', name: 'E: (Flash drive)', parent: null, kind: 'DRIVE', size: 0 }] };
};
export const coFsEject = (fs: CoFs): CoFs => (fs.flash === 'IN' ? { ...fs, flash: 'EJECTED' } : fs);
/** The Command Prompt's `dir`: a listing of a folder, as text. */
export function coFsDir(fs: CoFs, path: string): string {
  const n = coFsByPath(fs, path);
  if (!n) return 'The system cannot find the path specified.';
  const kids = coFsKids(fs, n.id);
  const rows = kids.map((k) => `${k.kind === 'FOLDER' ? '<DIR>   ' : `${String(Math.round(k.size)).padStart(6)} KB`}  ${k.name}`);
  return [` Directory of ${coFsPath(fs, n.id)}`, '', ...rows, '', `   ${kids.filter((k) => k.kind === 'FILE').length} File(s)  ${Math.round(kids.reduce((t, k) => t + (k.kind === 'FILE' ? k.size : 0), 0))} KB`].join('\n');
}

// ------------------------------------------------------------------ the simulated web

export interface CoPage {
  url: string;
  title: string;
  /** Who published it. */
  by: string;
  date: string;
  /** Reference for the reliability check: official or evidence-based, or not. */
  reliable: boolean;
  text: string;
  /** A downloadable file on the page, MB. */
  file?: { name: string; mb: number };
}
export const coIsHttps = (url: string) => url.startsWith('https://');
const SEARCH_ENGINE = 'https://search.schoolnet.example';
export const CO_SEARCH_HOME = SEARCH_ENGINE;
const norm = (s: string) => s.toLowerCase();
const hostOf = (url: string) => url.replace(/^https?:\/\//, '').split('/')[0]!;
/** Search with the real operators: "exact phrase", site:domain, filetype:pdf, -exclude. */
export function coSearch(pages: CoPage[], query: string): CoPage[] {
  const phrases = [...query.matchAll(/"([^"]+)"/g)].map((m) => norm(m[1]!));
  const rest = query.replace(/"[^"]+"/g, ' ').split(/\s+/).filter(Boolean);
  const site = rest.find((w) => /^site:/i.test(w))?.slice(5).toLowerCase();
  const type = rest.find((w) => /^filetype:/i.test(w))?.slice(9).toLowerCase();
  const not = rest.filter((w) => w.startsWith('-') && w.length > 1).map((w) => norm(w.slice(1)));
  const words = rest.filter((w) => !/^(site|filetype):/i.test(w) && !w.startsWith('-')).map(norm);
  if (!phrases.length && !words.length && !site && !type) return [];
  return pages.filter((p) => {
    const hay = norm(`${p.title} ${p.text} ${p.by}`);
    const ext = (p.file?.name ?? p.url).split('.').pop()?.toLowerCase() ?? '';
    if (site && !hostOf(p.url).toLowerCase().endsWith(site)) return false;
    if (type && ext !== type) return false;
    if (not.some((w) => hay.includes(w))) return false;
    return phrases.every((w) => hay.includes(w)) && words.every((w) => hay.includes(w));
  });
}
export interface CoDownload {
  name: string;
  mb: number;
  from: string;
  scanned: boolean;
}
export interface CoBrowse {
  /** The address history (cleared by Clear browsing data). */
  history: string[];
  /** Every page ever opened in this attempt (not cleared): what the checks read. */
  opened: string[];
  /** Pages opened in a new tab. */
  newTabs: string[];
  searches: { q: string; n: number }[];
  bookmarks: string[];
  historyViewed: boolean;
  downloads: CoDownload[];
  /** Risky downloads the student went on with. */
  risky: string[];
  cleared: boolean;
  /** Labelled parts of the browser window (id → part). */
  parts: Record<string, string>;
  /** Source judged: url → reliable? */
  judged: Record<string, boolean>;
  quote: { text: string; url: string };
}
export const coEmptyBrowse = (): CoBrowse => ({ history: [], opened: [], newTabs: [], searches: [], bookmarks: [], historyViewed: false, downloads: [], risky: [], cleared: false, parts: {}, judged: {}, quote: { text: '', url: '' } });

export interface CoMailMsg {
  id: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  files: { name: string; mb: number }[];
  kind: 'NEW' | 'REPLY' | 'REPLY_ALL' | 'FORWARD';
  read?: boolean;
  /** Phishing bait in the seeded inbox. */
  scam?: boolean;
  label?: string;
}
export interface CoMail {
  /** The password itself is never kept: only whether it met the rules. */
  account: { name: string; user: string; strong: boolean; recovery: string; created: boolean };
  signedIn: boolean;
  signedOut: boolean;
  inbox: CoMailMsg[];
  sent: CoMailMsg[];
  drafts: CoMailMsg[];
  spam: string[];
  contacts: { name: string; email: string }[];
  labels: string[];
  /** Sends the server refused, for the size limit. */
  refused: number;
  /** Attachments downloaded from received mail. */
  fetched: string[];
  /** Files available to attach (name, MB); `zipped` is added by Compress. */
  files: { name: string; mb: number }[];
}
export const coEmptyMail = (): CoMail => ({ account: { name: '', user: '', strong: false, recovery: '', created: false }, signedIn: false, signedOut: false, inbox: [], sent: [], drafts: [], spam: [], contacts: [], labels: [], refused: 0, fetched: [], files: [] });
/** Attachments are enlarged by about a third when encoded for e-mail. */
export const coEncoded = (mb: number) => (mb * 4) / 3;
export const CO_MAIL_LIMIT = 25;
export function coStrongPassword(p: string): boolean {
  return p.length >= 8 && /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p) && /[^A-Za-z0-9]/.test(p);
}
export const coEmailOk = (s: string) => /^[A-Za-z0-9._-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(s.trim());
/** Sending: addresses checked, and the encoded size against the limit (the sender's own server refuses it). */
export function coMailSend(m: CoMail, msg: Omit<CoMailMsg, 'id' | 'from'>, from: string): { mail: CoMail; error: string | null } {
  const all = [...msg.to, ...msg.cc, ...msg.bcc];
  if (!msg.to.length) return { mail: m, error: 'Add at least one address in To.' };
  const bad = all.find((a) => !coEmailOk(a));
  if (bad) return { mail: m, error: `${bad} is not a valid e-mail address: username@domain.` };
  const mb = msg.files.reduce((t, f) => t + f.mb, 0);
  if (coEncoded(mb) > CO_MAIL_LIMIT) return { mail: { ...m, refused: m.refused + 1 }, error: `Too large: ${coEncoded(mb).toFixed(1)} MB once encoded, and the limit is ${CO_MAIL_LIMIT} MB. Compress the files or share a link.` };
  return { mail: { ...m, sent: [...m.sent, { ...msg, id: `sent${m.sent.length + 1}`, from }] }, error: null };
}
export function coZipFiles(m: CoMail, names: string[], zipName: string, ratio: number): CoMail {
  const list = m.files.filter((f) => names.includes(f.name));
  if (!list.length) return m;
  const mb = Math.round(list.reduce((t, f) => t + f.mb, 0) * ratio * 10) / 10;
  return { ...m, files: [...m.files.filter((f) => f.name !== zipName), { name: zipName, mb }] };
}

export interface CoCloud {
  speed: { down: number; up: number; tests: number };
  uploads: string[];
  shares: { file: string; to: string; perm: 'VIEW' | 'EDIT' }[];
  fetched: string[];
  privacy: Record<string, 'EVERYONE' | 'CONTACTS' | 'NOBODY'>;
  /** The group-chat message picked or written. */
  chat: string;
}
export const coEmptyCloud = (): CoCloud => ({ speed: { down: 0, up: 0, tests: 0 }, uploads: [], shares: [], fetched: [], privacy: { photo: 'EVERYONE', phone: 'EVERYONE', posts: 'EVERYONE' }, chat: '' });
export const coTransferSeconds = (mb: number, mbps: number) => (mb * 8) / mbps;
