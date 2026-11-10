import { CO_SEARCH_HOME, coEmailOk, coEncoded, coSearch, coTransferSeconds, type CoCloud, type CoMail, type CoMailMsg, type CoPage } from './comp-office-apps';
import { ck, coDef, coShuffle, type CoCheck, type CoDef, type CompOfficeState } from './comp-office-data';
import { labPick, labRandom, roundDp } from './seeded';

/**
 * The internet and e-mail lessons, safely offline: an invented web (every
 * site is made up and says so), a real search with the real operators, a
 * mailbox with a size limit and a scam, and a cloud folder.
 */

export const CO_BROWSER_PARTS = [
  { id: 'title', right: 'Title bar', hint: 'Shows the name of the page' },
  { id: 'tabs', right: 'Tabs', hint: 'One for each open page' },
  { id: 'address', right: 'Address bar', hint: 'Where the URL goes' },
  { id: 'nav', right: 'Navigation buttons', hint: 'Back, forward, refresh' },
  { id: 'marks', right: 'Bookmarks bar', hint: 'Saved pages' },
  { id: 'status', right: 'Status bar', hint: 'Shows what is loading' },
];
const TOPICS = [
  { key: 'Lassa fever', slug: 'lassa-fever', word: 'rat', how: 'contact with food or household items soiled by infected rat urine or droppings', stop: 'store food in rodent-proof containers and keep the home clean' },
  { key: 'cholera', slug: 'cholera', word: 'vaccine', how: 'drinking water or eating food contaminated with the bacterium', stop: 'drink safe water, wash hands with soap and use latrines; an oral vaccine helps in outbreaks' },
  { key: 'typhoid', slug: 'typhoid', word: 'vaccine', how: 'food or water contaminated by the faeces of an infected person', stop: 'drink safe water, wash hands and eat well-cooked food; a vaccine is available' },
];
type Topic = (typeof TOPICS)[number];
const OFFICIAL = 'nha.gov.ng';
function corpus(t: Topic, r: () => number): CoPage[] {
  const mb = labPick(r, [1.4, 2.2, 3.5]);
  const yr = 2024 + Math.floor(r() * 3);
  return [
    { url: `https://www.${OFFICIAL}/diseases/${t.slug}`, title: `${t.key}: facts and prevention`, by: 'National Health Agency', date: `${yr}`, reliable: true, text: `${t.key} prevention Nigeria. It spreads through ${t.how}. To prevent it, ${t.stop}. See a health worker early.` },
    { url: `https://www.${OFFICIAL}/advice/${t.slug}-at-school`, title: `Preventing ${t.key} at school`, by: 'National Health Agency', date: `${yr}`, reliable: true, text: `Advice on ${t.key} prevention for schools in Nigeria: clean water, clean hands and clean surroundings.` },
    { url: `https://www.${OFFICIAL}/files/${t.slug}-guide.pdf`, title: `${t.key} guidelines (PDF)`, by: 'National Health Agency', date: `${yr}`, reliable: true, text: `${t.key} prevention Nigeria guidelines for health workers and schools.`, file: { name: `${t.slug}-guide.pdf`, mb } },
    { url: `https://www.worldhealthnotes.example/${t.slug}`, title: `${t.key} fact sheet`, by: 'World Health Notes', date: `${yr - 1}`, reliable: true, text: `Key facts on ${t.key} prevention worldwide, with references. It spreads through ${t.how}.` },
    { url: `https://news.dailyreport.example/${t.slug}-outbreak`, title: `${t.key} cases reported in two states`, by: 'Daily Report', date: `${yr}`, reliable: true, text: `Health officials in Nigeria say ${t.key} cases are rising. Prevention advice was given.` },
    { url: `https://myhealthblog.example/${t.slug}`, title: `My cousin and ${t.key}`, by: 'Anonymous', date: '', reliable: false, text: `A story about ${t.key} in Nigeria. No author, no date and no sources. Says prevention is not needed.` },
    { url: `http://miracle-cures.example/${t.slug}`, title: `Miracle herb cures ${t.key} in ONE DAY!!!`, by: 'Unknown', date: '', reliable: false, text: `Forget hospitals! ${t.key} prevention secret. Download our free cure now.`, file: { name: 'FreeCure.exe', mb: 0.8 } },
    { url: `https://forum.studentchat.example/${t.slug}`, title: `Anyone know about ${t.key}?`, by: 'Forum users', date: '', reliable: false, text: `People guessing about ${t.key} in Nigeria, with no evidence.` },
    { url: 'https://www.examcouncil.example/computer-studies-syllabus', title: 'Computer Studies syllabus', by: 'Exam Council', date: `${yr}`, reliable: true, text: 'WAEC style syllabus for computer studies, with topics and practicals.', file: { name: 'Computer_Studies_Syllabus.pdf', mb: 1.8 } },
    { url: 'https://www.schoolnet.example/', title: 'SchoolNet home page', by: 'SchoolNet', date: `${yr}`, reliable: true, text: 'A simple school web portal. Library, news and links.' },
  ];
}
const HOME = 'https://www.schoolnet.example/';
const urlOf = (p: CoPage) => p.url;
const partsOk = (s: CompOfficeState) => CO_BROWSER_PARTS.every((x) => s.web.parts[x.id] === x.right);
const did = (s: CompOfficeState, f: (q: string) => boolean) => s.web.searches.some((x) => f(x.q));
const safeOnly = (s: CompOfficeState) => !s.web.risky.length;
const opened = (s: CompOfficeState, u: string) => s.web.opened.includes(u);
const PREC_WEB = { guide: 'Two correct precautions, e.g. check for https and the padlock; never download from unknown sites; scan downloads before opening; do not give personal details; sign out on shared computers; clear history on a shared computer.', kw: [['https', 'padlock', 'secure'], ['unknown', 'suspicious', 'untrusted', 'exe'], ['scan', 'antivirus'], ['personal', 'password', 'private'], ['sign out', 'log out', 'logout'], ['clear', 'history']] };

interface BrowseData {
  topic: Topic;
  pages: CoPage[];
  pdf: CoPage;
  big: number;
  mbps: number;
  bundle: number;
  n: number;
  each: number;
}
function browseData(seed: number, salt: string, topicIx?: number): BrowseData {
  const r = labRandom(seed, salt);
  const topic = topicIx !== undefined ? TOPICS[topicIx]! : labPick(r, TOPICS);
  const pages = corpus(topic, r);
  return { topic, pages, pdf: pages.find((p) => p.file?.name.endsWith('.pdf') && p.url.includes(OFFICIAL))!, big: labPick(r, [150, 300, 450, 600]), mbps: labPick(r, [2, 4, 5, 10]), bundle: labPick(r, [1, 1.5, 2]), n: labPick(r, [12, 15, 20, 40]), each: labPick(r, [2, 2.5, 3]) };
}
const webStart = (_: BrowseData, s: CompOfficeState): CompOfficeState => s;
const modelVisit = (web: CompOfficeState['web'], urls: string[]) => ({ ...web, history: [...web.history, ...urls], opened: [...web.opened, ...urls] });
const search = (web: CompOfficeState['web'], pages: CoPage[], q: string) => ({ ...web, searches: [...web.searches, { q, n: coSearch(pages, q).length }] });
const allParts = Object.fromEntries(CO_BROWSER_PARTS.map((x) => [x.id, x.right]));

const CST_BROWSE = coDef<BrowseData>({
  task: 'CST_BROWSE',
  family: 'NET',
  title: 'A web browser and a search engine',
  apps: ['browser'],
  make: (seed) => browseData(seed, 'cst-browse'),
  brief: () => [
    'This browser is offline: every site in it is made up for practice. Open it and label the parts of the window (Parts of the window).',
    `Type ${HOME} in the address bar and press Enter. Note the padlock.`,
    `Go to ${CO_SEARCH_HOME} and search for: computer studies syllabus`,
    'Open the result in a new tab (Ctrl+click, or the New tab link).',
    'Bookmark the page (Ctrl+D), then open History (Ctrl+H).',
    'Download the syllabus PDF and find it in Downloads.',
  ],
  answers: (d) => [
    { id: 'time', label: `Download time for a ${d.big} MB file at ${d.mbps} Mbps (s)`, value: coTransferSeconds(d.big, d.mbps), tol: 0.5 },
    { id: 'data', label: `Data for ${d.n} pages averaging ${d.each} MB (MB)`, value: d.n * d.each, tol: 0.06 },
    { id: 'lock', label: 'What does the padlock and https mean?', value: 'secure', alt: ['encrypted', 'secure connection', 'the connection is secure', 'safe connection', 'the connection is encrypted'] },
  ],
  extra: (d) => ({ pages: d.pages }),
  start: webStart,
  checks: (d, st) => {
    const w = st.web;
    const page = d.pages.find((p) => p.url.includes('syllabus'))!;
    return [
      ck('procedure', 'parts', 'Label the parts of the browser window', partsOk(st), 'browser'),
      ck('procedure', 'url', 'Type a URL in the address bar', opened(st, HOME), 'browser'),
      ck('procedure', 'search', 'Search with precise keywords', did(st, (q) => /syllabus/i.test(q) && /computer/i.test(q)), 'browser'),
      ck('procedure', 'tab', 'Open the result in a new tab', w.newTabs.includes(page.url), 'browser'),
      ck('procedure', 'history', 'Open History', w.historyViewed, 'browser'),
      ck('product', 'mark', 'The page is bookmarked', w.bookmarks.includes(page.url), 'browser'),
      ck('product', 'down', 'The PDF is in Downloads', w.downloads.some((x) => x.name === page.file!.name), 'browser'),
      ck('product', 'safe', 'Nothing risky was downloaded', safeOnly(st), 'browser', 'A .exe from an unknown http site can carry a virus.'),
    ];
  },
  model: (d, st) => {
    const page = d.pages.find((p) => p.url.includes('syllabus'))!;
    let w = modelVisit(st.web, [HOME]);
    w = search(w, d.pages, 'computer studies syllabus');
    w = { ...modelVisit(w, [page.url]), newTabs: [page.url], bookmarks: [page.url], historyViewed: true, parts: allParts, downloads: [{ name: page.file!.name, mb: page.file!.mb, from: page.url, scanned: false }] };
    return { ...st, web: w };
  },
  prec: PREC_WEB,
  explain: {
    q: 'What is a URL, and how do precise keywords help a search?',
    guide: '2 marks: (1) a URL is the address of a page on the web; (1) precise keywords reduce the number of results and bring the most relevant ones up.',
    kw: [['address', 'location'], ['fewer', 'narrow', 'reduce', 'relevant', 'focus', 'exact']],
    need: 2,
  },
});

const DPR_BROWSE = coDef<BrowseData>({
  task: 'DPR_BROWSE',
  family: 'NET',
  title: 'Browsing, searching and downloading safely',
  apps: ['browser'],
  make: (seed) => browseData(seed, 'dpr-browse', 0),
  brief: (d) => [
    'This browser is offline: every site in it is made up for practice. Label the parts of the browser window.',
    `Type ${HOME} in the address bar, and check for https and the padlock.`,
    `Search: ${d.topic.key} symptoms   Note the number of results.`,
    `Refine: "${d.topic.key}" site:${OFFICIAL}   then exclude a word: ${d.topic.key} -${d.topic.word}`,
    'Open a result in a new tab, bookmark a useful page and view your history.',
    `Download the official PDF, ${d.pdf.file!.name}. Scan it before you open it. Do not download anything from an http site.`,
    'Clear the browsing data at the end.',
  ],
  answers: (d) => {
    const cap = d.bundle * 1024;
    return [
      { id: 'n', label: `Results for "${d.topic.key}" site:${OFFICIAL}`, value: coSearch(d.pages, `"${d.topic.key}" site:${OFFICIAL}`).length },
      { id: 'time', label: `Download time for a ${d.big} MB file at ${d.mbps} Mbps (s)`, value: coTransferSeconds(d.big, d.mbps), tol: 0.5 },
      { id: 'left', label: `Data left on a ${d.bundle} GB bundle after it (MB)`, value: cap - d.big, tol: 0.5 },
    ];
  },
  extra: (d) => ({ pages: d.pages }),
  start: webStart,
  checks: (d, st) => {
    const w = st.web;
    const site = did(st, (q) => q.includes(`"`) && /site:/i.test(q));
    return [
      ck('procedure', 'parts', 'Label the parts of the window', partsOk(st), 'browser'),
      ck('procedure', 'url', 'Type a URL and check the padlock', opened(st, HOME), 'browser'),
      ck('procedure', 'phrase', 'Refine with "quotation marks" and site:', site, 'browser', 'Quotes keep the words together; site: searches one site.'),
      ck('procedure', 'minus', 'Exclude a word with a minus sign', did(st, (q) => new RegExp(`-${d.topic.word}\\b`, 'i').test(q)), 'browser'),
      ck('procedure', 'tab', 'Open a result in a new tab', w.newTabs.length > 0, 'browser'),
      ck('procedure', 'history', 'View your history', w.historyViewed, 'browser'),
      ck('product', 'mark', 'A useful page is bookmarked', w.bookmarks.some((u) => d.pages.find((p) => p.url === u)?.reliable), 'browser'),
      ck('product', 'pdf', 'The official PDF is in Downloads', w.downloads.some((x) => x.name === d.pdf.file!.name), 'browser'),
      ck('product', 'scan', 'It was scanned', w.downloads.some((x) => x.name === d.pdf.file!.name && x.scanned), 'browser', 'Scan a download before opening it.'),
      ck('product', 'safe', 'Nothing was downloaded from an unsafe site', safeOnly(st), 'browser'),
      ck('product', 'clear', 'Browsing data cleared', w.cleared && !w.history.length, 'browser'),
    ];
  },
  model: (d, st) => {
    const first = d.pages[0]!;
    let w = modelVisit(st.web, [HOME]);
    w = search(w, d.pages, `${d.topic.key} symptoms`);
    w = search(w, d.pages, `"${d.topic.key}" site:${OFFICIAL}`);
    w = search(w, d.pages, `${d.topic.key} -${d.topic.word}`);
    w = { ...modelVisit(w, [first.url, d.pdf.url]), newTabs: [first.url], bookmarks: [first.url], historyViewed: true, parts: allParts, downloads: [{ name: d.pdf.file!.name, mb: d.pdf.file!.mb, from: d.pdf.url, scanned: true }] };
    w = { ...w, history: [], cleared: true };
    return { ...st, web: w };
  },
  prec: PREC_WEB,
  explain: {
    q: 'How do you judge whether a site is secure, and why is it safer to scan a download?',
    guide: '2 marks: (1) https and a padlock show an encrypted connection; check the address too; (1) a download can carry malware, so scanning finds it before the file is opened.',
    kw: [['https', 'padlock'], ['virus', 'malware', 'malicious', 'infect']],
    need: 2,
  },
});

const ICT_SEARCH = coDef<BrowseData>({
  task: 'ICT_SEARCH',
  family: 'NET',
  title: 'Search engines and reliable sources',
  apps: ['browser'],
  make: (seed) => browseData(seed, 'ict-search', 1),
  brief: (d) => [
    'This browser is offline: every site in it is made up for practice. Label the parts of the browser window.',
    `Search: ${d.topic.key} prevention Nigeria`,
    `Refine: "${d.topic.key}" prevention site:${OFFICIAL}   then ${d.topic.key} -${d.topic.word}   then filetype:pdf ${d.topic.key} Nigeria`,
    'Open two sources in new tabs. Using the checklist (author, date, evidence), mark each as reliable or not reliable.',
    'Bookmark the most reliable page, and copy a short quotation with its URL.',
    'Work out the data used, then clear the browsing data.',
  ],
  answers: (d) => [
    { id: 'n', label: `Results for filetype:pdf ${d.topic.key} Nigeria`, value: coSearch(d.pages, `filetype:pdf ${d.topic.key} Nigeria`).length },
    { id: 'data', label: `Data for ${d.n} pages averaging ${d.each} MB (MB)`, value: d.n * d.each, tol: 0.06 },
    { id: 'pct', label: `That as a percentage of a 1 GB (1 024 MB) bundle (%)`, value: roundDp(((d.n * d.each) / 1024) * 100, 1), tol: 0.06 },
  ],
  extra: (d) => ({ pages: d.pages }),
  start: webStart,
  checks: (d, st) => {
    const w = st.web;
    const judged = Object.entries(w.judged);
    const byUrl = (u: string) => d.pages.find((p) => p.url === u);
    return [
      ck('procedure', 'parts', 'Label the parts of the window', partsOk(st), 'browser'),
      ck('procedure', 'site', 'Refine with quotes and site:', did(st, (q) => q.includes('"') && /site:/i.test(q)), 'browser'),
      ck('procedure', 'minus', 'Exclude a word with -', did(st, (q) => new RegExp(`-${d.topic.word}\\b`, 'i').test(q)), 'browser'),
      ck('procedure', 'type', 'Refine with filetype:pdf', did(st, (q) => /filetype:pdf/i.test(q)), 'browser'),
      ck('procedure', 'tabs', 'Open two sources in new tabs', new Set(w.newTabs).size >= 2, 'browser'),
      ck('product', 'judge', 'Two sources judged, one of each kind, both correctly', judged.length >= 2 && judged.every(([u, v]) => byUrl(u)?.reliable === v) && judged.some(([, v]) => v) && judged.some(([, v]) => !v), 'browser'),
      ck('product', 'mark', 'The most reliable page is bookmarked', w.bookmarks.some((u) => byUrl(u)?.url.includes(OFFICIAL)), 'browser'),
      ck('product', 'quote', 'A short quotation with its URL', w.quote.text.trim().length >= 12 && (byUrl(w.quote.url)?.text.toLowerCase().includes(w.quote.text.trim().toLowerCase()) ?? false), 'browser', 'The quotation must really be on that page.'),
      ck('product', 'clear', 'Browsing data cleared', w.cleared && !w.history.length, 'browser'),
    ];
  },
  model: (d, st) => {
    const good = d.pages[0]!;
    const bad = d.pages.find((p) => !p.reliable && p.url.startsWith('https'))!;
    let w = modelVisit(st.web, []);
    w = search(w, d.pages, `${d.topic.key} prevention Nigeria`);
    w = search(w, d.pages, `"${d.topic.key}" prevention site:${OFFICIAL}`);
    w = search(w, d.pages, `${d.topic.key} -${d.topic.word}`);
    w = search(w, d.pages, `filetype:pdf ${d.topic.key} Nigeria`);
    w = { ...modelVisit(w, [good.url, bad.url]), newTabs: [good.url, bad.url], judged: { [good.url]: true, [bad.url]: false }, bookmarks: [good.url], parts: allParts, quote: { text: good.text.split('. ')[1]!.slice(0, 60), url: good.url } };
    w = { ...w, history: [], cleared: true };
    return { ...st, web: w };
  },
  prec: PREC_WEB,
  explain: {
    q: 'Which three things do you check to decide that a web source is reliable, and why is an official site better than an anonymous blog?',
    guide: '2 marks: (1) the author or organisation, the date, and the evidence or sources; (1) an official site is accountable and checks its facts; an anonymous blog may be opinion or false.',
    kw: [['author', 'organisation', 'organization', 'who wrote'], ['date', 'recent', 'current'], ['evidence', 'source', 'reference'], ['accountable', 'official', 'false', 'opinion', 'anonymous', 'checked']],
    need: 3,
  },
});

// ------------------------------------------------------------------ e-mail

export interface CoMailInfo {
  domain: string;
  fullName: string;
  user: string;
  teacher: string;
  friend: string;
  parent: string;
  /** The file to attach first. */
  attach: string;
  photos: string[];
  zipName: string;
  zipRatio: number;
}
interface MailData extends CoMailInfo {
  files: { name: string; mb: number }[];
  subject: string;
  limit: number;
}
const DOMAIN = 'schoolmail.example';
const inboxMsg = (id: string, from: string, subject: string, body: string, p: Partial<CoMailMsg> = {}): CoMailMsg => ({ id, from, to: [], cc: [], bcc: [], subject, body, files: [], kind: 'NEW', ...p });
const mailBase = (seed: number, salt: string, files: { name: string; mb: number }[], photos: string[]): MailData => {
  const r = labRandom(seed, salt);
  const first = labPick(r, ['amina', 'tunde', 'ngozi', 'musa', 'bisi', 'emeka']);
  const last = labPick(r, ['yusuf', 'bello', 'okafor', 'ade', 'eze']);
  const user = `${first}.${last}`;
  return { domain: DOMAIN, fullName: `${first[0]!.toUpperCase()}${first.slice(1)} ${last[0]!.toUpperCase()}${last.slice(1)}`, user, teacher: `mrs.ojo@${DOMAIN}`, friend: `${labPick(r, ['chidi', 'halima', 'kemi'])}@${DOMAIN}`, parent: `${last}.home@${DOMAIN}`, attach: files[0]!.name, photos, zipName: 'Photos.zip', zipRatio: 0.5, files, subject: labPick(r, ['Science project report', 'Class project report', 'End-of-term report']), limit: 25 };
};
const addr = (d: MailData) => `${d.user}@${d.domain}`;
const seededInbox = (d: MailData): CoMailMsg[] => [
  inboxMsg('m1', d.teacher, 'Reading list for next term', 'Dear student, please read chapters 1 to 3 before we resume. Mrs Ojo', { to: [addr(d)], cc: [d.friend], files: [{ name: 'Reading_list.pdf', mb: 0.4 }] }),
  inboxMsg('m2', 'prize-office@win-big-now.example', 'YOU HAVE WON N5,000,000!!!', 'Click here and send your password and bank details to claim your prize today.', { scam: true }),
];
const sent = (m: CoMail) => m.sent;
const has = (xs: string[], a: string) => xs.some((x) => x.toLowerCase() === a.toLowerCase());
const msg = (p: Partial<CoMailMsg>): Omit<CoMailMsg, 'id' | 'from'> => ({ to: [], cc: [], bcc: [], subject: '', body: '', files: [], kind: 'NEW', ...p });
const PREC_MAIL = { guide: 'Two correct precautions, e.g. use a strong password and keep it private; sign out on a shared computer; check the attachment size; never open links or attachments from strangers; check the address before sending; use a clear subject.', kw: [['password', 'strong'], ['sign out', 'log out', 'logout'], ['size', 'large', 'compress', 'zip'], ['strangers', 'unknown', 'scam', 'phishing', 'suspicious', 'spam'], ['check the address', 'recipient', 'correct address'], ['subject', 'polite']] };

const CST_MAIL = coDef<MailData>({
  task: 'CST_MAIL',
  family: 'NET',
  title: 'An e-mail account: send and receive',
  apps: ['mail'],
  make: (seed) => mailBase(seed, 'cst-mail', [{ name: 'Report.pdf', mb: 1.8 }, { name: 'Part1.pdf', mb: roundDp(8.4 + Math.floor(labRandom(seed, 'cst-mail-a')() * 4) / 10, 1) }, { name: 'Part2.pdf', mb: roundDp(10.2 + Math.floor(labRandom(seed, 'cst-mail-b')() * 3) / 10, 1) }, { name: 'Part3.pdf', mb: 7.1 }], []),
  brief: (d) => [
    'This mailbox is offline, for practice. Never use your real password here.',
    `Create account: name ${d.fullName}, username ${d.user}, a strong password (8 or more characters with capitals, small letters, a number and a symbol), and a recovery phone.`,
    `Compose: To ${d.friend}, Cc your teacher ${d.teacher}, Bcc your parent ${d.parent}. Subject: ${d.subject}. Write a short message.`,
    `Attach ${d.attach}, check its size, then Send.`,
    'Open the Inbox. Read the message from Mrs Ojo and Reply with a short answer.',
    `Forward her message to ${d.friend}.`,
    'One message is a scam: do not click it. Mark it as Spam.',
    'Sign out at the end.',
  ],
  answers: (d) => {
    const parts = d.files.slice(1).map((f) => f.mb);
    const t = roundDp(parts.reduce((a, b) => a + b, 0), 1);
    return [
      { id: 'user', label: `The username in ${d.user}@${d.domain}`, value: d.user },
      { id: 'domain', label: `The domain name in that address`, value: d.domain },
      { id: 'total', label: `Files of ${parts.join(', ')} MB: total (MB)`, value: t, tol: 0.06 },
      { id: 'over', label: `By how much is that over or under the ${d.limit} MB limit? (MB; negative if under)`, value: roundDp(t - d.limit, 1), tol: 0.06 },
    ];
  },
  start: (d, s) => ({ ...s, mail: { ...s.mail, inbox: seededInbox(d), files: d.files } }),
  extra: (d) => ({ mailInfo: d }),
  checks: (d, st) => {
    const m = st.mail;
    const s = sent(m);
    const main = s.find((x) => x.kind === 'NEW' && has(x.to, d.friend));
    return [
      ck('procedure', 'acct', 'Create the account with a strong password', m.account.created && m.account.strong && m.account.user.toLowerCase() === d.user && !!m.account.recovery.trim(), 'mail'),
      ck('procedure', 'read', 'Read the message from your teacher', m.inbox.find((x) => x.id === 'm1')?.read === true, 'mail'),
      ck('procedure', 'spam', 'Mark the scam as Spam, without clicking', m.spam.includes('m2'), 'mail', 'No real prize asks for your password.'),
      ck('procedure', 'out', 'Sign out', m.signedOut, 'mail', 'On a shared computer the next person could read your mail.'),
      ck('product', 'addr', 'To, Cc and Bcc all correct', !!main && has(main.cc, d.teacher) && has(main.bcc, d.parent), 'mail'),
      ck('product', 'subject', 'A clear Subject and a message', !!main && /report/i.test(main.subject) && main.body.trim().length >= 10, 'mail'),
      ck('product', 'attach', 'The report attached', !!main?.files.some((f) => f.name === d.attach), 'mail'),
      ck('product', 'reply', 'A reply to your teacher', s.some((x) => x.kind === 'REPLY' && has(x.to, d.teacher) && x.body.trim().length >= 5), 'mail'),
      ck('product', 'forward', 'The message forwarded', s.some((x) => x.kind === 'FORWARD' && has(x.to, d.friend)), 'mail'),
    ];
  },
  model: (d, st) => {
    const from = addr(d);
    const m: CoMail = {
      ...st.mail,
      account: { name: d.fullName, user: d.user, strong: true, recovery: '08012345678', created: true },
      signedIn: false,
      signedOut: true,
      inbox: st.mail.inbox.map((x) => (x.id === 'm1' ? { ...x, read: true } : x)),
      spam: ['m2'],
      sent: [
        { ...msg({ to: [d.friend], cc: [d.teacher], bcc: [d.parent], subject: d.subject, body: 'Please find my report attached. Thank you.', files: [{ name: d.attach, mb: d.files[0]!.mb }] }), id: 'sent1', from },
        { ...msg({ to: [d.teacher], subject: 'Re: Reading list for next term', body: 'Thank you, Ma. I will read them.', kind: 'REPLY' }), id: 'sent2', from },
        { ...msg({ to: [d.friend], subject: 'Fw: Reading list for next term', body: 'Dear student, please read chapters 1 to 3 before we resume.', kind: 'FORWARD' }), id: 'sent3', from },
      ],
    };
    return { ...st, mail: m };
  },
  prec: PREC_MAIL,
  explain: {
    q: 'What is the difference between Cc and Bcc, and what do the parts of an e-mail address mean?',
    guide: '2 marks: (1) everyone can see Cc addresses; Bcc addresses are hidden from the other recipients; (1) username, @, domain name (the mail provider).',
    kw: [['hidden', 'cannot see', 'not see', 'blind', 'secret'], ['username', 'user name', 'domain', 'provider']],
    need: 2,
  },
});

const ICT_MAIL = coDef<MailData>({
  task: 'ICT_MAIL',
  family: 'NET',
  title: 'E-mail with attachments',
  apps: ['mail'],
  make: (seed) => {
    const r = labRandom(seed, 'ict-mail-sz');
    const photo = labPick(r, [4.2, 4.4, 4.6, 4.8]);
    const pdf = labPick(r, [9.5, 10.2, 11]);
    const photos = ['Photo1.jpg', 'Photo2.jpg', 'Photo3.jpg'];
    return mailBase(seed, 'ict-mail', [{ name: 'Report.pdf', mb: pdf }, ...photos.map((name) => ({ name, mb: photo }))], photos);
  },
  brief: (d) => [
    'You are signed in to an offline practice mailbox. Find Inbox, Sent, Drafts and Spam.',
    `Compose: To your teacher ${d.teacher}, Cc ${d.friend}, Bcc ${d.parent}. Subject: ${d.subject}. Write a polite greeting, a short message and your name.`,
    `Attach ${d.attach}, and all three photos as well, then press Send: read the size warning.`,
    `Compress the three photos into ${d.zipName}, attach that instead of the photos, and Send.`,
    'Open the message from Mrs Ojo. Reply All, then Forward it, and download its attachment.',
    `Add ${d.teacher} to Contacts. Make a label School and put her message under it.`,
  ],
  answers: (d) => {
    const t = roundDp(d.files.reduce((a, f) => a + f.mb, 0), 1);
    return [
      { id: 'total', label: 'Total size of the four files (MB)', value: t, tol: 0.06 },
      { id: 'enc', label: 'Size after encoding (× 4/3) (MB)', value: roundDp(coEncoded(t), 1), tol: 0.11 },
      { id: 'over', label: `How far over the ${d.limit} MB limit? (MB)`, value: roundDp(coEncoded(t) - d.limit, 1), tol: 0.11 },
    ];
  },
  start: (d, s) => ({ ...s, mail: { ...s.mail, account: { name: d.fullName, user: d.user, strong: true, recovery: '', created: true }, signedIn: true, inbox: seededInbox(d), files: d.files } }),
  extra: (d) => ({ mailInfo: d }),
  checks: (d, st) => {
    const m = st.mail;
    const main = sent(m).find((x) => x.kind === 'NEW' && has(x.to, d.teacher));
    return [
      ck('procedure', 'refused', 'Try all the files and read the size warning', m.refused > 0, 'mail', 'E-mail encoding adds about a third.'),
      ck('procedure', 'zip', `Compress the photos into ${d.zipName}`, m.files.some((f) => f.name === d.zipName), 'mail'),
      ck('procedure', 'fetch', 'Download the attachment from a received message', m.fetched.length > 0, 'mail'),
      ck('procedure', 'contact', 'Add your teacher to Contacts', m.contacts.some((c) => c.email.toLowerCase() === d.teacher), 'mail'),
      ck('procedure', 'label', 'Put her message under the label School', m.inbox.some((x) => x.id === 'm1' && /school/i.test(x.label ?? '')), 'mail'),
      ck('product', 'addr', 'To, Cc and Bcc correct', !!main && has(main.cc, d.friend) && has(main.bcc, d.parent), 'mail'),
      ck('product', 'net', 'A clear Subject, a polite greeting and a name', !!main && /report/i.test(main.subject) && /^(dear|hello|good)/i.test(main.body.trim()) && main.body.toLowerCase().includes(d.fullName.split(' ')[0]!.toLowerCase()), 'mail'),
      ck('product', 'files', 'The PDF and the zip sent, within the limit', !!main && main.files.some((f) => f.name === d.attach) && main.files.some((f) => f.name === d.zipName) && coEncoded(main.files.reduce((t, f) => t + f.mb, 0)) <= d.limit, 'mail'),
      ck('product', 'all', 'A Reply All and a Forward', sent(m).some((x) => x.kind === 'REPLY_ALL') && sent(m).some((x) => x.kind === 'FORWARD'), 'mail'),
    ];
  },
  model: (d, st) => {
    const from = addr(d);
    const pdf = d.files[0]!;
    const zip = { name: d.zipName, mb: roundDp(d.files.slice(1).reduce((t, f) => t + f.mb, 0) * d.zipRatio, 1) };
    const m: CoMail = {
      ...st.mail,
      refused: 1,
      files: [...st.mail.files, zip],
      fetched: ['Reading_list.pdf'],
      contacts: [{ name: 'Mrs Ojo', email: d.teacher }],
      labels: ['School'],
      inbox: st.mail.inbox.map((x) => (x.id === 'm1' ? { ...x, read: true, label: 'School' } : x)),
      sent: [
        { ...msg({ to: [d.teacher], cc: [d.friend], bcc: [d.parent], subject: d.subject, body: `Dear Ma, please find my report and photos attached. ${d.fullName}`, files: [pdf, zip] }), id: 'sent1', from },
        { ...msg({ to: [d.teacher], cc: [d.friend], subject: 'Re: Reading list for next term', body: 'Thank you, Ma.', kind: 'REPLY_ALL' }), id: 'sent2', from },
        { ...msg({ to: [d.friend], subject: 'Fw: Reading list for next term', body: 'For you.', kind: 'FORWARD' }), id: 'sent3', from },
      ],
    };
    return { ...st, mail: m };
  },
  prec: PREC_MAIL,
  explain: {
    q: 'Why was the large message refused, and what are two ways of sending the photos instead?',
    guide: '2 marks: (1) encoding enlarges attachments by about a third, taking the message over the limit; (1) compress them into a zip, or upload them and send a shared link, or send several e-mails.',
    kw: [['limit', 'too large', 'too big', 'exceeds', 'encod'], ['zip', 'compress', 'link', 'cloud', 'separate', 'several']],
    need: 2,
  },
});

export interface CoCloudInfo {
  down: number;
  up: number;
  video: { name: string; mb: number };
  doc: { name: string; mb: number };
  teacher: string;
  chats: string[];
  good: number;
}
const ICT_SHARE = coDef<CoCloudInfo>({
  task: 'ICT_SHARE',
  family: 'NET',
  title: 'Download, upload and responsible use',
  apps: ['cloud'],
  make: (seed) => {
    const r = labRandom(seed, 'ict-share');
    const good = 'Good evening everyone. Please, could someone share the homework for Thursday? Thank you.';
    const chats = coShuffle(r, [good, 'WHY HAS NOBODY SENT THE HOMEWORK??? YOU ARE ALL USELESS', 'Forward this to 20 people or you will fail your exams!!', "Here is Tunde's phone number and his embarrassing photo, lol"]);
    return { down: labPick(r, [6, 8, 10, 12]), up: labPick(r, [1, 2, 3]), video: { name: 'Class_Project.mp4', mb: labPick(r, [90, 120, 180, 240]) }, doc: { name: 'Timetable.pdf', mb: 0.6 }, teacher: `mrs.ojo@${DOMAIN}`, chats, good: chats.indexOf(good) };
  },
  brief: (d) => [
    'This cloud folder and chat are offline, for practice.',
    'Run the speed test and note the download and upload speeds.',
    `Upload ${d.video.name} (${d.video.mb} MB) to the cloud folder.`,
    `Share it with ${d.teacher} with View only permission.`,
    `Download ${d.doc.name} from the class folder.`,
    'Privacy: change who can see your phone number and your profile photo and posts, so that strangers cannot.',
    'Choose the respectful message for the class group chat and send it.',
  ],
  answers: (d) => [
    { id: 'up', label: `Upload time for ${d.video.mb} MB at the upload speed (s)`, value: coTransferSeconds(d.video.mb, d.up), tol: 0.5 },
    { id: 'down', label: 'Download time for the same file (s)', value: coTransferSeconds(d.video.mb, d.down), tol: 0.5 },
    { id: 'ratio', label: 'How many times longer is the upload?', value: roundDp(d.down / d.up, 2), tol: 0.02 },
  ],
  extra: (d) => ({ cloudInfo: d }),
  start: (_, s) => s,
  checks: (d, st) => {
    const c: CoCloud = st.cloud;
    return [
      ck('procedure', 'speed', 'Run the speed test', c.speed.tests > 0, 'cloud'),
      ck('procedure', 'up', 'Upload the video', c.uploads.includes(d.video.name), 'cloud'),
      ck('procedure', 'down', `Download ${d.doc.name}`, c.fetched.includes(d.doc.name), 'cloud'),
      ck('product', 'share', 'Shared with your teacher, View only', c.shares.some((x) => x.file === d.video.name && x.to.toLowerCase() === d.teacher && x.perm === 'VIEW'), 'cloud', 'View only: nobody can change or delete your file.'),
      ck('product', 'phone', 'Your phone number is hidden from strangers', c.privacy.phone !== 'EVERYONE', 'cloud'),
      ck('product', 'photo', 'Photo and posts are hidden from strangers', c.privacy.photo !== 'EVERYONE' && c.privacy.posts !== 'EVERYONE', 'cloud'),
      ck('product', 'chat', 'A respectful message to the group', c.chat === d.chats[d.good], 'cloud'),
    ];
  },
  model: (d, st) => ({ ...st, cloud: { ...st.cloud, speed: { down: d.down, up: d.up, tests: 1 }, uploads: [d.video.name], shares: [{ file: d.video.name, to: d.teacher, perm: 'VIEW' }], fetched: [d.doc.name], privacy: { phone: 'NOBODY', photo: 'CONTACTS', posts: 'CONTACTS' }, chat: d.chats[d.good]! } }),
  prec: { guide: 'Two correct precautions, e.g. share with view-only permission; keep your phone number and address private; think before posting; do not share other people\'s pictures without permission; check who a link goes to.', kw: [['view only', 'permission'], ['private', 'personal', 'phone number'], ['think', 'respect', 'polite', 'netiquette'], ['without permission', 'others'], ['scan', 'unknown', 'strangers']] },
  explain: {
    q: 'Why does an upload usually take longer than a download, and why choose View only when sharing?',
    guide: '2 marks: (1) home and mobile links give a lower upload speed than download speed; (1) view only lets the person open the file but not change or delete it.',
    kw: [['speed', 'slower', 'lower', 'less'], ['change', 'edit', 'delete', 'cannot alter', 'modify']],
    need: 2,
  },
});

export const CO_NET_DEFS: CoDef[] = [CST_MAIL, ICT_MAIL, CST_BROWSE, DPR_BROWSE, ICT_SEARCH, ICT_SHARE];
export { coEmailOk, urlOf };
export type { CoCheck };
void coShuffle;
