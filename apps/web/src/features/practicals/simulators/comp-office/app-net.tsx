import { CO_BROWSER_PARTS, CO_MAIL_LIMIT, CO_SEARCH_HOME, coEncoded, coIsHttps, coMailSend, coSearch, coStrongPassword, coZipFiles, type CoBrowse, type CoCloudInfo, type CoMail, type CoMailInfo, type CoMailMsg, type CoPage } from '@aischool/shared';
import { ArrowLeft, ArrowRight, Lock, RotateCw, ShieldAlert, Star } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Office } from './actions';
import { Lbl, Modal, Note, Pri, Sec, Tb, Tools, inputCls } from './ui';

/** The offline internet: a browser over an invented web with a working search engine, a mailbox, and a cloud folder with privacy settings and a class chat. */

const SIM = 'Simulated offline web: every site here is invented for practice. Nothing leaves this computer.';
const NEW_SEARCH = (q: string) => `${CO_SEARCH_HOME}/?q=${encodeURIComponent(q)}`;

export function BrowserApp({ o }: { o: Office }) {
  const w = o.s.web;
  const ro = o.readOnly;
  const pages = o.v.pages ?? [];
  const set = (fn: (x: CoBrowse) => CoBrowse, log?: string) => o.set('web', fn, log);
  const [tabs, setTabs] = useState<string[]>(['']);
  const [tab, setTab] = useState(0);
  const [addr, setAddr] = useState('');
  const [q, setQ] = useState('');
  const [back, setBack] = useState<string[]>([]);
  const [panel, setPanel] = useState<null | 'history' | 'downloads' | 'parts' | 'quote' | 'warn'>(null);
  const [warn, setWarn] = useState<CoPage | null>(null);
  const [quote, setQuote] = useState({ text: '', url: '' });
  const url = tabs[tab] ?? '';
  const page = pages.find((p) => p.url === url);
  const isSearch = url === CO_SEARCH_HOME || url.startsWith(`${CO_SEARCH_HOME}/?q=`);
  const query = url.includes('?q=') ? decodeURIComponent(url.split('?q=')[1]!) : '';
  const results = query ? coSearch(pages, query) : [];
  const visit = (u: string, log = true) => {
    const known = pages.some((p) => p.url === u) || u === CO_SEARCH_HOME || u.startsWith(`${CO_SEARCH_HOME}/?q=`);
    setBack((b) => [...b, url]);
    setTabs((t) => t.map((x, i) => (i === tab ? u : x)));
    setAddr(u);
    if (log && known) set((x) => ({ ...x, history: [...x.history, u].slice(-100), opened: x.opened.includes(u) ? x.opened : [...x.opened, u].slice(-100) }), 'web:visit');
  };
  const go = () => {
    let u = addr.trim();
    if (!u) return;
    const bare = (x: string) => x.replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/$/, '').toLowerCase();
    if (bare(u) === bare(CO_SEARCH_HOME)) return visit(CO_SEARCH_HOME);
    // A typed address finds its page with or without www and the last slash.
    u = pages.find((p) => bare(p.url) === bare(u))?.url ?? (/^https?:\/\//i.test(u) ? u : `https://${u}`);
    visit(u);
  };
  const doSearch = () => {
    const s = q.trim();
    if (!s) return;
    const n = coSearch(pages, s).length;
    set((x) => ({ ...x, searches: [...x.searches, { q: s.slice(0, 180), n }].slice(-30) }), 'web:search');
    visit(NEW_SEARCH(s), false);
  };
  const openNewTab = (u: string) => {
    setTabs((t) => [...t, u]);
    setTab(tabs.length);
    setAddr(u);
    set((x) => ({ ...x, newTabs: [...x.newTabs.filter((y) => y !== u), u].slice(-30), history: [...x.history, u].slice(-100), opened: x.opened.includes(u) ? x.opened : [...x.opened, u].slice(-100) }), 'web:newtab');
  };
  const download = (p: CoPage, force = false) => {
    if (!p.file) return;
    if (!force && (!coIsHttps(p.url) || p.file.name.endsWith('.exe'))) {
      setWarn(p);
      return;
    }
    set((x) => ({ ...x, downloads: [...x.downloads.filter((d) => d.name !== p.file!.name), { name: p.file!.name, mb: p.file!.mb, from: p.url, scanned: false }].slice(-16), risky: force ? [...x.risky, p.file!.name].slice(-16) : x.risky }), 'web:download');
    setPanel('downloads');
  };
  const bookmarked = !!url && w.bookmarks.includes(url);
  const mark = () => url && !isSearch && set((x) => ({ ...x, bookmarks: x.bookmarks.includes(url) ? x.bookmarks.filter((b) => b !== url) : [...x.bookmarks, url].slice(-16) }), 'web:bookmark');
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white text-slate-900" onKeyDown={(e) => { e.stopPropagation(); if (e.ctrlKey && e.key.toLowerCase() === 'd') (e.preventDefault(), mark()); if (e.ctrlKey && e.key.toLowerCase() === 'h') (e.preventDefault(), set((x) => ({ ...x, historyViewed: true }), 'web:history'), setPanel('history')); }}>
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto bg-slate-300 px-1 pt-1">
        {tabs.map((t, i) => (
          <button key={i} type="button" onClick={() => (setTab(i), setAddr(t))} aria-label={`Tab ${i + 1}`} className={cn('max-w-40 shrink-0 truncate rounded-t px-2 py-1 text-[11.5px]', i === tab ? 'bg-white font-medium' : 'bg-slate-200')}>{pages.find((p) => p.url === t)?.title ?? (t ? 'Search' : 'New tab')}</button>
        ))}
        <button type="button" aria-label="New tab" onClick={() => (setTabs([...tabs, '']), setTab(tabs.length), setAddr(''))} className="shrink-0 rounded px-1.5 text-[14px]">+</button>
      </div>
      <div className="flex shrink-0 items-center gap-1 border-b border-slate-200 p-1">
        <Tb aria-label="Back" disabled={!back.length} onClick={() => { const b = back.at(-1) ?? ''; setBack(back.slice(0, -1)); setTabs((t) => t.map((x, i) => (i === tab ? b : x))); setAddr(b); }}><ArrowLeft className="size-3.5" /></Tb>
        <Tb aria-label="Forward" disabled><ArrowRight className="size-3.5" /></Tb>
        <Tb aria-label="Refresh" onClick={() => undefined}><RotateCw className="size-3.5" /></Tb>
        <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-slate-300 px-2">
          {url && (coIsHttps(url) ? <Lock aria-label="Secure: https" className="size-3.5 shrink-0 text-emerald-700" /> : <ShieldAlert aria-label="Not secure: http" className="size-3.5 shrink-0 text-red-600" />)}
          <input aria-label="Address bar" autoCapitalize="off" spellCheck={false} className="h-8 min-w-0 flex-1 bg-transparent text-[12.5px] outline-none" placeholder="Type a URL" value={addr} onChange={(e) => setAddr(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
        </div>
        <Tb aria-label="Go" onClick={go}>Go</Tb>
        <Tb aria-label="Bookmark this page" on={bookmarked} disabled={!url || isSearch || ro} onClick={mark}><Star className="size-3.5" /></Tb>
      </div>
      {!ro && (
        <Tools>
          <Tb aria-label="Parts of the window" onClick={() => setPanel('parts')}>Parts of the window</Tb>
          <Tb aria-label="Search engine" onClick={() => visit(CO_SEARCH_HOME)}>Search engine</Tb>
          <Tb aria-label="History" onClick={() => (set((x) => ({ ...x, historyViewed: true }), 'web:history'), setPanel('history'))}>History</Tb>
          <Tb aria-label="Downloads" onClick={() => setPanel('downloads')}>Downloads ({w.downloads.length})</Tb>
          <Tb aria-label="Copy a quotation" onClick={() => (setQuote({ text: w.quote.text, url: url || w.quote.url }), setPanel('quote'))}>Quotation</Tb>
          <Tb aria-label="Clear browsing data" onClick={() => set((x) => ({ ...x, history: [], cleared: true }), 'web:clear')}>Clear browsing data</Tb>
        </Tools>
      )}
      {w.bookmarks.length > 0 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 px-1 py-0.5 text-[11.5px]" aria-label="Bookmarks bar">
          {w.bookmarks.map((b) => <button key={b} type="button" onClick={() => visit(b)} className="shrink-0 truncate rounded px-1 hover:bg-slate-100">★ {pages.find((p) => p.url === b)?.title ?? b}</button>)}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain p-3 text-[13.5px]">
        {!url && <div><p className="font-semibold">New tab</p><p className="text-slate-600">{SIM}</p></div>}
        {isSearch && (
          <div className="space-y-2">
            <p className="font-display text-lg font-semibold text-blue-700">SchoolNet Search</p>
            <div className="flex gap-1">
              <input aria-label="Search box" autoCapitalize="off" spellCheck={false} className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && doSearch()} placeholder="Search" />
              <Pri aria-label="Search" onClick={doSearch}>Search</Pri>
            </div>
            {query && <p className="text-[12px] text-slate-600" aria-label="Result count">{results.length} results for {query}</p>}
            {results.map((p) => (
              <div key={p.url} className="rounded border border-slate-200 p-2">
                <button type="button" aria-label={`Open ${p.title}`} className="text-left font-medium text-blue-700 underline" onClick={(e) => (e.ctrlKey ? openNewTab(p.url) : visit(p.url))}>{p.title}</button>
                <p className="truncate text-[11.5px] text-emerald-800">{p.url}</p>
                <p className="line-clamp-2 text-[12.5px] text-slate-700">{p.text}</p>
                <button type="button" aria-label={`Open in new tab ${p.title}`} className="text-[11.5px] text-blue-700 underline" onClick={() => openNewTab(p.url)}>Open in a new tab</button>
              </div>
            ))}
          </div>
        )}
        {page && (
          <article className="max-w-prose space-y-2">
            <h3 className="font-display text-lg font-semibold">{page.title}</h3>
            <p className="text-[12px] text-slate-600">By {page.by}{page.date ? ` · ${page.date}` : ' · no date given'}</p>
            <p>{page.text}</p>
            {page.url.includes('schoolnet') && <p className="text-slate-700">Links: <button type="button" className="text-blue-700 underline" onClick={() => visit(CO_SEARCH_HOME)}>Search</button></p>}
            {page.file && <Sec aria-label={`Download ${page.file.name}`} disabled={ro} onClick={() => download(page)}>Download {page.file.name} ({page.file.mb} MB)</Sec>}
            {!ro && (
              <div className="flex flex-wrap items-center gap-1 rounded bg-slate-100 p-2 text-[12.5px]">
                <span>Author? Date? Evidence?</span>
                <Tb aria-label="Mark reliable" on={w.judged[page.url] === true} onClick={() => set((x) => ({ ...x, judged: { ...x.judged, [page.url]: true } }), 'web:judge')}>Reliable</Tb>
                <Tb aria-label="Mark not reliable" on={w.judged[page.url] === false} onClick={() => set((x) => ({ ...x, judged: { ...x.judged, [page.url]: false } }), 'web:judge')}>Not reliable</Tb>
              </div>
            )}
          </article>
        )}
        {url && !isSearch && !page && <div><p className="font-semibold">This site can't be reached</p><p className="text-slate-600">{SIM}</p></div>}
      </div>
      {panel === 'history' && (
        <Modal title="History" onClose={() => setPanel(null)}>
          {!w.history.length && <p className="text-slate-600">History is empty.</p>}
          <ul className="max-h-60 space-y-0.5 overflow-auto text-[12px]">{[...w.history].reverse().map((h, i) => <li key={i} className="truncate">{h}</li>)}</ul>
        </Modal>
      )}
      {panel === 'downloads' && (
        <Modal title="Downloads" onClose={() => setPanel(null)}>
          {!w.downloads.length && <p className="text-slate-600">Nothing downloaded yet.</p>}
          {w.downloads.map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-[12.5px]">
              <span className="min-w-0 flex-1 truncate">{d.name} ({d.mb} MB)</span>
              {d.scanned ? <span className="text-emerald-700">Scanned: clean</span> : <Tb aria-label={`Scan ${d.name}`} disabled={ro} onClick={() => set((x) => ({ ...x, downloads: x.downloads.map((y) => (y.name === d.name ? { ...y, scanned: true } : y)) }), 'web:scan')}>Scan</Tb>}
            </div>
          ))}
        </Modal>
      )}
      {panel === 'parts' && (
        <Modal title="Parts of the browser window" onClose={() => setPanel(null)} wide>
          {CO_BROWSER_PARTS.map((p) => (
            <Lbl key={p.id} text={p.hint}>
              <select aria-label={`Part: ${p.hint}`} className={inputCls} disabled={ro} value={w.parts[p.id] ?? ''} onChange={(e) => set((x) => ({ ...x, parts: { ...x.parts, [p.id]: e.target.value } }), 'web:part')}>
                <option value="">Choose…</option>
                {CO_BROWSER_PARTS.map((q2) => <option key={q2.id}>{q2.right}</option>)}
              </select>
            </Lbl>
          ))}
        </Modal>
      )}
      {panel === 'quote' && (
        <Modal title="A quotation with its source" onClose={() => setPanel(null)}>
          <Lbl text="Copy a short quotation, exactly as written"><textarea aria-label="Quotation" rows={3} className="w-full rounded border border-slate-300 p-1 text-[13px]" value={quote.text} onChange={(e) => setQuote({ ...quote, text: e.target.value })} /></Lbl>
          <Lbl text="Page URL"><input aria-label="Quotation URL" className={inputCls} value={quote.url} onChange={(e) => setQuote({ ...quote, url: e.target.value })} /></Lbl>
          <Pri aria-label="Save quotation" onClick={() => (set((x) => ({ ...x, quote: { text: quote.text.slice(0, 500), url: quote.url.slice(0, 190) } }), 'web:quote'), setPanel(null))}>Save</Pri>
        </Modal>
      )}
      {warn && (
        <Modal title="Warning" onClose={() => setWarn(null)}>
          <Note tone="bad">This site is not secure (no https) and offers a program file, {warn.file?.name}. Programs from unknown sites can carry viruses.</Note>
          <div className="flex gap-2">
            <Pri aria-label="Do not download" onClick={() => setWarn(null)}>Do not download</Pri>
            <Sec aria-label="Download anyway" onClick={() => { download(warn, true); setWarn(null); }}>Download anyway</Sec>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ mail

type Compose = { to: string; cc: string; bcc: string; subject: string; body: string; files: { name: string; mb: number }[]; kind: CoMailMsg['kind'] };
const blank = (): Compose => ({ to: '', cc: '', bcc: '', subject: '', body: '', files: [], kind: 'NEW' });
const list = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

export function MailApp({ o }: { o: Office }) {
  const m = o.s.mail;
  const ro = o.readOnly;
  const info = o.v.mailInfo as CoMailInfo | undefined;
  const set = (fn: (x: CoMail) => CoMail, log?: string) => o.set('mail', fn, log);
  const [box, setBox] = useState<'inbox' | 'sent' | 'drafts' | 'spam' | 'contacts'>('inbox');
  const [open, setOpen] = useState<string | null>(null);
  const [c, setC] = useState<Compose | null>(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState({ name: '', user: '', password: '', recovery: '' });
  const [formErr, setFormErr] = useState('');
  const [contact, setContact] = useState({ name: '', email: '' });
  const [label, setLabel] = useState('');
  const [zipSel, setZipSel] = useState<string[]>([]);
  const from = `${m.account.user}@${info?.domain ?? 'schoolmail.example'}`;
  if (!m.account.created)
    return (
      <div className="h-full overflow-auto bg-slate-50 p-3 text-slate-900" onKeyDown={(e) => e.stopPropagation()}>
        <div className="mx-auto max-w-sm space-y-2 rounded border border-slate-200 bg-white p-3">
          <p className="font-semibold">Create your practice account</p>
          <Note>Offline practice mailbox. Do not use a real password here.</Note>
          <Lbl text="Your name"><input aria-label="Your name" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Lbl>
          <Lbl text={`Username (…@${info?.domain})`}><input aria-label="Username" autoCapitalize="off" className={inputCls} value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} /></Lbl>
          <Lbl text="Password"><input aria-label="Password" type="password" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Lbl>
          <Lbl text="Recovery phone"><input aria-label="Recovery phone" inputMode="tel" className={inputCls} value={form.recovery} onChange={(e) => setForm({ ...form, recovery: e.target.value })} /></Lbl>
          {formErr && <Note tone="bad">{formErr}</Note>}
          <Pri aria-label="Create account" disabled={ro} onClick={() => {
            if (!form.name.trim() || !form.user.trim()) return setFormErr('Fill in your name and a username.');
            if (!coStrongPassword(form.password)) return setFormErr('Too weak: use 8 or more characters with capitals, small letters, a number and a symbol.');
            set((x) => ({ ...x, account: { name: form.name.trim(), user: form.user.trim().toLowerCase(), strong: true, recovery: form.recovery.trim(), created: true }, signedIn: true }), 'mail:create');
          }}>Create account</Pri>
        </div>
      </div>
    );
  if (!m.signedIn)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-50 p-3 text-slate-800">
        <p className="text-[13px]">Signed out of {from}.</p>
        <Sec aria-label="Sign in" disabled={ro} onClick={() => set((x) => ({ ...x, signedIn: true }), 'mail:signin')}>Sign in again</Sec>
      </div>
    );
  const startReply = (msg: CoMailMsg, kind: CoMailMsg['kind']) =>
    setC({
      ...blank(),
      kind,
      to: kind === 'FORWARD' ? '' : msg.from,
      cc: kind === 'REPLY_ALL' ? msg.cc.filter((x) => x !== from).join(', ') : '',
      subject: `${kind === 'FORWARD' ? 'Fw' : 'Re'}: ${msg.subject}`,
      body: kind === 'FORWARD' ? msg.body : '',
    });
  const send = () => {
    if (!c) return;
    const r = coMailSend(m, { to: list(c.to), cc: list(c.cc), bcc: list(c.bcc), subject: c.subject.trim(), body: c.body, files: c.files, kind: c.kind }, from);
    o.set('mail', () => r.mail, r.error ? 'mail:refused' : 'mail:sent');
    setErr(r.error ?? '');
    if (!r.error) (setC(null), setBox('sent'));
  };
  const msgs = box === 'inbox' ? m.inbox.filter((x) => !m.spam.includes(x.id)) : box === 'sent' ? m.sent : box === 'spam' ? m.inbox.filter((x) => m.spam.includes(x.id)) : [];
  const cur = open ? [...m.inbox, ...m.sent].find((x) => x.id === open) : null;
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white text-slate-900 sm:flex-row" onKeyDown={(e) => e.stopPropagation()}>
      <nav aria-label="Mail folders" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 p-1 sm:w-36 sm:flex-col sm:border-b-0 sm:border-r">
        <Pri className="h-8 shrink-0" aria-label="Compose" disabled={ro} onClick={() => (setC(blank()), setErr(''))}>Compose</Pri>
        {(['inbox', 'sent', 'drafts', 'spam', 'contacts'] as const).map((b) => (
          <button key={b} type="button" aria-label={b} onClick={() => (setBox(b), setOpen(null))} className={cn('shrink-0 rounded px-1.5 py-1 text-left text-[12.5px] capitalize hover:bg-slate-200', box === b && 'bg-blue-100 font-semibold')}>{b}{b === 'inbox' ? ` (${m.inbox.filter((x) => !x.read && !m.spam.includes(x.id)).length})` : ''}</button>
        ))}
        {m.labels.map((l) => <span key={l} className="shrink-0 px-1.5 text-[12px] text-slate-600">🏷 {l}</span>)}
        {!ro && (
          <div className="flex shrink-0 gap-0.5">
            <input aria-label="New label" className="h-7 w-20 rounded border border-slate-300 px-1 text-[12px] sm:w-full" placeholder="Label" value={label} onChange={(e) => setLabel(e.target.value)} />
            <Tb className="h-7" aria-label="Create label" disabled={!label.trim()} onClick={() => { const l = label.trim(); set((x) => ({ ...x, labels: [...x.labels.filter((y) => y !== l), l].slice(-8) }), 'mail:label'); setLabel(''); }}>+</Tb>
          </div>
        )}
        <Sec className="h-8 shrink-0" aria-label="Sign out" disabled={ro} onClick={() => set((x) => ({ ...x, signedIn: false, signedOut: true }), 'mail:signout')}>Sign out</Sec>
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto p-2 text-[13px]">
        {box === 'contacts' ? (
          <div className="space-y-1">
            {m.contacts.map((x) => <p key={x.email}>{x.name}: {x.email}</p>)}
            {!ro && (
              <div className="grid gap-1 sm:grid-cols-3">
                <input aria-label="Contact name" className={inputCls} placeholder="Name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} />
                <input aria-label="Contact e-mail" autoCapitalize="off" className={inputCls} placeholder="E-mail" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} />
                <Sec aria-label="Add contact" disabled={!contact.email.trim()} onClick={() => { const e = contact; set((x) => ({ ...x, contacts: [...x.contacts, { name: e.name.trim(), email: e.email.trim().toLowerCase() }].slice(-16) }), 'mail:contact'); setContact({ name: '', email: '' }); }}>Add</Sec>
              </div>
            )}
          </div>
        ) : cur ? (
          <div className="space-y-1">
            <p className="font-semibold">{cur.subject}</p>
            <p className="text-[12px] text-slate-600">From {cur.from}{cur.to.length ? ` · To ${cur.to.join(', ')}` : ''}{cur.cc.length ? ` · Cc ${cur.cc.join(', ')}` : ''}{cur.bcc.length ? ` · Bcc ${cur.bcc.join(', ')}` : ''}</p>
            <p className="whitespace-pre-wrap">{cur.body}</p>
            {cur.files.map((f) => (
              <p key={f.name} className="flex items-center gap-1 text-[12.5px]">📎 {f.name} ({f.mb} MB)
                {box === 'inbox' && <Tb aria-label={`Download ${f.name}`} disabled={ro} onClick={() => set((x) => ({ ...x, fetched: [...x.fetched.filter((y) => y !== f.name), f.name].slice(-8) }), 'mail:fetch')}>{m.fetched.includes(f.name) ? 'Downloaded' : 'Download'}</Tb>}
              </p>
            ))}
            {box === 'inbox' && !ro && (
              <div className="flex flex-wrap gap-1">
                <Tb aria-label="Reply" onClick={() => startReply(cur, 'REPLY')}>Reply</Tb>
                <Tb aria-label="Reply All" onClick={() => startReply(cur, 'REPLY_ALL')}>Reply All</Tb>
                <Tb aria-label="Forward" onClick={() => startReply(cur, 'FORWARD')}>Forward</Tb>
                {m.labels.map((l) => <Tb key={l} aria-label={`Label ${l}`} on={cur.label === l} onClick={() => set((x) => ({ ...x, inbox: x.inbox.map((y) => (y.id === cur.id ? { ...y, label: l } : y)) }), 'mail:labelled')}>🏷 {l}</Tb>)}
              </div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-slate-200">
            {msgs.map((x) => (
              <li key={x.id} className="flex items-center gap-1 py-1">
                <button type="button" aria-label={`Open ${x.subject}`} className={cn('min-w-0 flex-1 truncate text-left', box === 'inbox' && !x.read && 'font-semibold')} onClick={() => { setOpen(x.id); if (box === 'inbox' && !x.scam) set((y) => ({ ...y, inbox: y.inbox.map((z) => (z.id === x.id ? { ...z, read: true } : z)) }), 'mail:read'); }}>{x.subject}</button>
                {box === 'inbox' && !ro && <Tb aria-label={`Mark as spam ${x.subject}`} onClick={() => set((y) => ({ ...y, spam: [...y.spam, x.id].slice(-8) }), 'mail:spam')}>Spam</Tb>}
              </li>
            ))}
            {!msgs.length && <li className="py-2 text-slate-500">Nothing here.</li>}
          </ul>
        )}
      </div>
      {c && (
        <Modal title="New message" onClose={() => setC(null)} wide>
          <div className="grid gap-1 sm:grid-cols-3">
            {(['to', 'cc', 'bcc'] as const).map((k) => <Lbl key={k} text={k === 'to' ? 'To' : k === 'cc' ? 'Cc' : 'Bcc (hidden from the others)'}><input aria-label={k} autoCapitalize="off" className={inputCls} value={c[k]} onChange={(e) => setC({ ...c, [k]: e.target.value })} /></Lbl>)}
          </div>
          <Lbl text="Subject"><input aria-label="Subject" className={inputCls} value={c.subject} onChange={(e) => setC({ ...c, subject: e.target.value })} /></Lbl>
          <Lbl text="Message"><textarea aria-label="Message" rows={4} className="w-full rounded border border-slate-300 p-1 text-[13px]" value={c.body} onChange={(e) => setC({ ...c, body: e.target.value })} /></Lbl>
          <div className="space-y-1">
            <p className="text-[12px] text-slate-600">Attach (limit {CO_MAIL_LIMIT} MB after encoding, which adds about a third)</p>
            <div className="flex flex-wrap gap-1">
              {m.files.map((f) => (
                <Tb key={f.name} aria-label={`Attach ${f.name}`} on={c.files.some((x) => x.name === f.name)} onClick={() => setC({ ...c, files: c.files.some((x) => x.name === f.name) ? c.files.filter((x) => x.name !== f.name) : [...c.files, f] })}>📎 {f.name} ({f.mb} MB)</Tb>
              ))}
            </div>
            <p className="text-[12px] text-slate-600">Attached {c.files.reduce((t, f) => t + f.mb, 0).toFixed(1)} MB; encoded {coEncoded(c.files.reduce((t, f) => t + f.mb, 0)).toFixed(1)} MB</p>
            {info && info.photos.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 rounded bg-slate-100 p-1">
                {info.photos.map((p) => <label key={p} className="flex items-center gap-1 text-[12px]"><input type="checkbox" aria-label={`Select ${p}`} checked={zipSel.includes(p)} onChange={(e) => setZipSel(e.target.checked ? [...zipSel, p] : zipSel.filter((x) => x !== p))} />{p}</label>)}
                <Tb aria-label="Compress into zip" disabled={zipSel.length < info.photos.length} onClick={() => { set((x) => coZipFiles(x, zipSel, info.zipName, info.zipRatio), 'mail:zip'); setC({ ...c, files: c.files.filter((f) => !zipSel.includes(f.name)) }); }}>Compress to {info.zipName}</Tb>
              </div>
            )}
          </div>
          {err && <Note tone="bad">{err}</Note>}
          <Pri aria-label="Send" onClick={send}>Send</Pri>
        </Modal>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ cloud and chat

export function CloudApp({ o }: { o: Office }) {
  const c = o.s.cloud;
  const ro = o.readOnly;
  const i = o.v.cloudInfo as CoCloudInfo;
  const set = (fn: (x: typeof c) => typeof c, log?: string) => o.set('cloud', fn, log);
  const [to, setTo] = useState('');
  const [perm, setPerm] = useState<'VIEW' | 'EDIT'>('VIEW');
  const [pick, setPick] = useState<number | null>(null);
  return (
    <div className="h-full space-y-2 overflow-auto bg-slate-50 p-2 text-[13px] text-slate-900" onKeyDown={(e) => e.stopPropagation()}>
      <Note>{SIM}</Note>
      <section className="rounded border border-slate-200 bg-white p-2">
        <p className="font-semibold">Speed test</p>
        {c.speed.tests > 0 && <p aria-label="Speed result">Download {c.speed.down} Mbps · Upload {c.speed.up} Mbps</p>}
        <Sec aria-label="Run speed test" disabled={ro} onClick={() => set((x) => ({ ...x, speed: { down: i.down, up: i.up, tests: x.speed.tests + 1 } }), 'cloud:speed')}>Run speed test</Sec>
      </section>
      <section className="rounded border border-slate-200 bg-white p-2">
        <p className="font-semibold">My cloud folder</p>
        <p>📹 {i.video.name} ({i.video.mb} MB, on this computer){c.uploads.includes(i.video.name) ? ': uploaded' : ''}</p>
        {!c.uploads.includes(i.video.name) && <Sec aria-label="Upload video" disabled={ro} onClick={() => set((x) => ({ ...x, uploads: [...x.uploads, i.video.name] }), 'cloud:upload')}>Upload</Sec>}
        {c.uploads.includes(i.video.name) && !ro && (
          <div className="mt-1 grid gap-1 sm:grid-cols-[1fr_auto_auto]">
            <input aria-label="Share with" autoCapitalize="off" className={inputCls} placeholder="Share with (e-mail)" value={to} onChange={(e) => setTo(e.target.value)} />
            <select aria-label="Permission" className={inputCls} value={perm} onChange={(e) => setPerm(e.target.value as 'VIEW')}><option value="VIEW">View only</option><option value="EDIT">Can edit</option></select>
            <Sec aria-label="Share" disabled={!to.trim()} onClick={() => set((x) => ({ ...x, shares: [...x.shares, { file: i.video.name, to: to.trim().toLowerCase(), perm }].slice(-8) }), 'cloud:share')}>Share</Sec>
          </div>
        )}
        {c.shares.map((s, k) => <p key={k} className="text-[12.5px]">Shared with {s.to} ({s.perm === 'VIEW' ? 'view only' : 'can edit'})</p>)}
      </section>
      <section className="rounded border border-slate-200 bg-white p-2">
        <p className="font-semibold">Class folder</p>
        <p className="flex items-center gap-1">📄 {i.doc.name} ({i.doc.mb} MB)
          <Tb aria-label={`Download ${i.doc.name}`} disabled={ro} on={c.fetched.includes(i.doc.name)} onClick={() => set((x) => ({ ...x, fetched: [...x.fetched.filter((y) => y !== i.doc.name), i.doc.name] }), 'cloud:fetch')}>{c.fetched.includes(i.doc.name) ? 'In Downloads' : 'Download'}</Tb>
        </p>
      </section>
      <section className="rounded border border-slate-200 bg-white p-2">
        <p className="font-semibold">Privacy settings</p>
        <div className="grid gap-1 sm:grid-cols-3">
          {(['phone', 'photo', 'posts'] as const).map((k) => (
            <Lbl key={k} text={k === 'phone' ? 'Who can see my phone number' : k === 'photo' ? 'Who can see my profile photo' : 'Who can see my posts'}>
              <select aria-label={`Privacy ${k}`} disabled={ro} className={inputCls} value={c.privacy[k]} onChange={(e) => set((x) => ({ ...x, privacy: { ...x.privacy, [k]: e.target.value as 'NOBODY' } }), 'cloud:privacy')}>
                <option value="EVERYONE">Everyone</option><option value="CONTACTS">My contacts</option><option value="NOBODY">Nobody</option>
              </select>
            </Lbl>
          ))}
        </div>
      </section>
      <section className="rounded border border-slate-200 bg-white p-2">
        <p className="font-semibold">Class group chat</p>
        {i.chats.map((t, k) => (
          <label key={k} className="flex items-start gap-1 py-0.5"><input type="radio" name="co-chat" aria-label={`Message ${k + 1}`} disabled={ro} checked={pick === k} onChange={() => setPick(k)} /> <span>{t}</span></label>
        ))}
        <Sec aria-label="Send message" disabled={ro || pick === null} onClick={() => pick !== null && set((x) => ({ ...x, chat: i.chats[pick]! }), 'cloud:chat')}>Send</Sec>
        {c.chat && <p className="mt-1 rounded bg-emerald-100 p-1 text-[12.5px]">You: {c.chat}</p>}
      </section>
    </div>
  );
}
