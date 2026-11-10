import { coEmptyFs, coFsByPath, coFsCopy, coFsDelete, coFsEject, coFsInsertFlash, coFsKids, coFsMkdir, coFsPaste, coFsPath, coFsRename, coFsRestore, coFsSize, coAddSlide, coApplyAll, coDeckSeconds, coEditSlide, coPrintHandouts, coRunShow, coSlide, type CoDeck, type CoFs, type CoNode } from './comp-office-apps';
import { ck, coDef, coSameText, type CoDef, type CompOfficeState } from './comp-office-data';
import { labPick, labRandom, roundDp } from './seeded';

/** The presentation and file-management lessons. */

const PREC_DECK = { guide: 'Two correct precautions, e.g. use a few bullet points, not whole paragraphs; use one design theme; do not overuse animation; rehearse the timing; save before running the show; check it from the beginning.', kw: [['few', 'bullet', 'paragraph', 'short'], ['theme', 'one design', 'consistent'], ['animation', 'overuse', 'transition'], ['rehearse', 'timing', 'practise'], ['save'], ['master']] };
const savedDeck = (d: CoDeck, name: string) => coSameText(d.saved.replace(/\.pptx?$/i, ''), name.replace(/\.pptx$/i, ''));
const allTransition = (d: CoDeck) => d.slides.length > 1 && d.slides.every((s) => s.transition !== 'NONE');
const ranShow = (d: CoDeck) => d.shows > 0 && d.fromStart && d.escaped && d.shownSlides >= d.slides.length;
const outlineDeck = (d: CoDeck, o: { title: string; body: string }[]) => o.reduce((x, s) => coAddSlide(x, s.title, s.body), d);
const titleSlide = (title: string, name: string) => ({ ...coSlide('s1', 'TITLE', title, name) });

interface DeckData {
  topic: string;
  outline: { title: string; body: string }[];
  mins: number;
  plan: number;
  perPage: number;
}
const MALARIA = [
  { title: 'What malaria is', body: 'A disease spread by female Anopheles mosquitoes\nCaused by the Plasmodium parasite\nCommon in the rainy season' },
  { title: 'Sleep under a net', body: 'Use insecticide-treated nets\nTuck the net under the mattress\nRepair any holes' },
  { title: 'Clean the surroundings', body: 'Clear stagnant water\nCover water containers\nCut tall grass near the house' },
  { title: 'Cases per month', body: 'Cases rise in the rainy months' },
];
const CST_DECK = coDef<DeckData>({
  task: 'CST_DECK',
  family: 'DECK',
  title: 'A slide show on malaria prevention',
  apps: ['deck'],
  make: (seed) => {
    const r = labRandom(seed, 'cst-deck');
    return { topic: 'Malaria Prevention', outline: MALARIA, mins: labPick(r, [8, 10, 12, 15]), plan: labPick(r, [10, 12, 15, 16]), perPage: 3 };
  },
  brief: (d) => [
    `Slide 1 (Title): type ${d.topic} and your name.`,
    'New Slide (Title and Content) four times: use Paste from outline for each.',
    'Insert the net picture on the slide "Sleep under a net"; Insert a chart on "Cases per month".',
    'Apply one design theme. Apply a transition to all slides.',
    'Add an entrance animation to the bullet points of "Clean the surroundings".',
    'Save as Malaria.pptx.',
    'Slide Show from the beginning (F5): go through every slide, then press Esc.',
    `Print Handouts, ${d.perPage} slides per page.`,
  ],
  answers: (d) => [
    { id: 'each', label: `Seconds for each of ${d.plan} slides in a ${d.mins}-minute talk`, value: roundDp((d.mins * 60) / d.plan, 2), tol: 0.06 },
    { id: 'three', label: `Handout pages for ${d.plan} slides at 3 a page`, value: Math.ceil(d.plan / 3) },
    { id: 'six', label: `Handout pages for ${d.plan} slides at 6 a page`, value: Math.ceil(d.plan / 6) },
  ],
  extra: (d) => ({ outline: d.outline }),
  start: (_, s) => ({ ...s, deck: { ...s.deck, slides: [coSlide('s1', 'TITLE', '', '')] } }),
  checks: (d, st) => {
    const x = st.deck;
    const by = (t: string) => x.slides.find((s) => s.title.toLowerCase() === t.toLowerCase());
    return [
      ck('procedure', 'theme', 'Apply one design theme', x.theme !== 'Plain', 'deck'),
      ck('procedure', 'trans', 'A transition on all slides', allTransition(x), 'deck'),
      ck('procedure', 'save', 'Save as Malaria.pptx', savedDeck(x, 'Malaria'), 'deck'),
      ck('procedure', 'show', 'Run the show from the beginning and end it with Esc', ranShow(x), 'deck', 'A rehearsal finds mistakes before the audience does.'),
      ck('procedure', 'hand', `Print handouts, ${d.perPage} per page`, x.handouts.jobs > 0 && x.handouts.perPage === d.perPage, 'deck'),
      ck('product', 'title', 'A title slide with the topic and a name', x.slides[0]?.layout === 'TITLE' && /malaria/i.test(x.slides[0]?.title ?? '') && (x.slides[0]?.body.trim().length ?? 0) > 1, 'deck'),
      ck('product', 'slides', 'All the slides of the outline', d.outline.every((o) => !!by(o.title)?.body.trim()), 'deck'),
      ck('product', 'pic', 'The picture on the right slide', !!by(d.outline[1]!.title)?.pic, 'deck'),
      ck('product', 'chart', 'The chart on the right slide', !!by(d.outline[3]!.title)?.chart, 'deck'),
      ck('product', 'anim', 'Animated bullet points', (by(d.outline[2]!.title)?.anim ?? 'NONE') !== 'NONE', 'deck'),
    ];
  },
  model: (d, st) => {
    let x = st.deck;
    x = { ...x, slides: [titleSlide(d.topic, 'Student')] };
    x = outlineDeck(x, d.outline);
    x = coEditSlide(x, 2, { pic: true });
    x = coEditSlide(x, 4, { chart: true });
    x = coEditSlide(x, 3, { anim: 'APPEAR' });
    x = coApplyAll({ ...x, theme: 'Ocean' }, { transition: 'FADE' });
    x = { ...x, saved: 'Malaria.pptx' };
    x = coRunShow(x, x.slides.length, true, true);
    x = coPrintHandouts(x, d.perPage);
    return { ...st, deck: x };
  },
  prec: PREC_DECK,
  explain: {
    q: 'What is the difference between a transition and an animation, and why are handouts useful?',
    guide: '2 marks: (1) a transition is the effect between slides, an animation is the effect on an object within a slide; (1) handouts let the audience follow and keep the content; they print several slides on a page.',
    kw: [['between', 'next slide', 'change of slide', 'slide to slide'], ['object', 'within', 'on a slide', 'text or picture', 'bullet'], ['audience', 'keep', 'follow', 'notes', 'several slides']],
    need: 2,
  },
});

interface Deck2Data {
  outline: { title: string; body: string }[];
  advance: number;
  mins: number;
  yes: number;
  of: number;
}
const CLEAN = [
  { title: 'Why it matters', body: 'Clean schools stop disease\nStudents learn better' },
  { title: 'What we found', body: 'Toilets, drains and classrooms were checked' },
  { title: 'Rubbish', body: 'Use the bins\nEmpty them daily' },
  { title: 'Survey results', body: 'What students told us' },
  { title: 'What we will do', body: 'A cleaning rota\nA clean-class prize' },
];
const DPR_DECK = coDef<Deck2Data>({
  task: 'DPR_DECK',
  family: 'DECK',
  title: 'A timed slide presentation',
  apps: ['deck'],
  make: (seed) => {
    const r = labRandom(seed, 'dpr-deck');
    const of = labPick(r, [40, 50, 60]);
    return { outline: CLEAN, advance: labPick(r, [20, 30, 40]), mins: labPick(r, [5, 6, 8]), yes: Math.round(of * labPick(r, [0.4, 0.6, 0.7])), of };
  },
  brief: (d) => [
    'Slide 1 (Title): Clean School and your name.',
    'Add slides 2 to 6 with New Slide (Ctrl+M) and Paste from outline.',
    'Insert a picture on slide 3 and a column chart on slide 5.',
    'Apply one theme to all slides.',
    'Apply a transition and Apply To All; add an entrance animation to the chart on slide 5.',
    `Transitions: set After ${d.advance} seconds, Apply To All.`,
    'Save as Clean_School.pptx, close it and open it again.',
    'Run the show from the beginning; press Esc to end.',
  ],
  answers: (d) => [
    { id: 'total', label: 'Length of the show as set (seconds)', value: 6 * d.advance },
    { id: 'need', label: `Seconds a slide for a ${d.mins}-minute talk on these 6 slides`, value: roundDp((d.mins * 60) / 6, 2), tol: 0.06 },
    { id: 'pct', label: `Survey: ${d.yes} of ${d.of} students said yes (%)`, value: roundDp((d.yes / d.of) * 100, 1), tol: 0.06 },
  ],
  extra: (d) => ({ outline: d.outline }),
  start: (_, s) => ({ ...s, deck: { ...s.deck, slides: [coSlide('s1', 'TITLE', '', '')] } }),
  checks: (d, st) => {
    const x = st.deck;
    return [
      ck('procedure', 'theme', 'One theme for all slides', x.theme !== 'Plain', 'deck'),
      ck('procedure', 'trans', 'A transition applied to all', allTransition(x), 'deck'),
      ck('procedure', 'save', 'Save as Clean_School.pptx', savedDeck(x, 'Clean_School'), 'deck'),
      ck('procedure', 'reopen', 'Close it and open it again', x.reopened > 0 && !x.closed, 'deck'),
      ck('procedure', 'show', 'Run the show from the beginning and press Esc', ranShow(x), 'deck'),
      ck('product', 'n', 'Six slides, title first', x.slides.length === 6 && x.slides[0]?.layout === 'TITLE' && /clean/i.test(x.slides[0]?.title ?? ''), 'deck'),
      ck('product', 'bullets', 'Bullet points on slides 2 to 6', x.slides.slice(1).every((s) => !!s.body.trim() && !!s.title.trim()), 'deck'),
      ck('product', 'pic', 'A picture on slide 3', !!x.slides[2]?.pic, 'deck'),
      ck('product', 'chart', 'A chart on slide 5, animated', !!x.slides[4]?.chart && x.slides[4]?.anim !== 'NONE', 'deck'),
      ck('product', 'time', `Every slide advances after ${d.advance} s`, x.slides.length > 0 && x.slides.every((s) => s.advance === d.advance) && coDeckSeconds(x) === x.slides.length * d.advance, 'deck'),
    ];
  },
  model: (d, st) => {
    let x: CoDeck = { ...st.deck, slides: [titleSlide('Clean School', 'Student')] };
    x = outlineDeck(x, d.outline);
    x = coEditSlide(x, 2, { pic: true });
    x = coEditSlide(x, 4, { chart: true, anim: 'FADE' });
    x = coApplyAll({ ...x, theme: 'Forest' }, { transition: 'WIPE', advance: d.advance });
    x = { ...x, saved: 'Clean_School.pptx', reopened: 1 };
    x = coRunShow(x, 6, true, true);
    return { ...st, deck: x };
  },
  prec: PREC_DECK,
  explain: {
    q: 'What does setting "After 00:30" do, and why rehearse a timed show?',
    guide: '2 marks: (1) each slide advances automatically after 30 seconds, without a click; (1) rehearsing checks that the talk fits the time and that the audience can read each slide.',
    kw: [['automatic', 'by itself', 'without', 'advance'], ['fits', 'time', 'long enough', 'practise', 'practice', 'check']],
    need: 2,
  },
});

interface Deck3Data {
  outline: { title: string; body: string }[];
  advance: number;
  school: string;
  students: number;
  perPage: number;
  intro: number;
  questions: number;
}
const ROAD = [
  { title: 'Why road safety', body: 'Road crashes harm young people\nMost are preventable' },
  { title: 'Crossing the road', body: 'Look left and right\nUse the zebra crossing' },
  { title: 'Crash figures', body: 'Table of crashes by term' },
  { title: 'Seat belts and helmets', body: 'Always wear a seat belt\nHelmets on motorcycles' },
  { title: 'What to do', body: 'Report dangerous spots\nWalk facing traffic' },
];
const ICT_DECK = coDef<Deck3Data>({
  task: 'ICT_DECK',
  family: 'DECK',
  title: 'Slide master and slide show',
  apps: ['deck'],
  make: (seed) => {
    const r = labRandom(seed, 'ict-deck');
    return { outline: ROAD, advance: labPick(r, [20, 30, 40]), school: labPick(r, ['Greenfield School', 'Unity College', 'Crescent Academy']), students: labPick(r, [30, 35, 40]), perPage: 6, intro: 2, questions: 3 };
  },
  brief: (d) => [
    'Open View > Slide Master.',
    `On the master: set a title font and colour, insert the school logo, and type the footer ${d.school}. Close Master View.`,
    'Slide 1: title Road Safety and your name. Add five slides with Paste from outline.',
    'Check the logo and footer appear on every slide without being copied by hand.',
    'Insert a table on "Crash figures", a picture on "Crossing the road" and a shape diagram on "What to do".',
    `Apply one transition to all slides and set each to advance after ${d.advance} seconds.`,
    'Save as Road_Safety.pptx. Run the show from the beginning; Esc to end.',
    `Print handouts, ${d.perPage} slides per page.`,
  ],
  answers: (d) => {
    const show = 6 * d.advance;
    const pages = Math.ceil(6 / d.perPage);
    return [
      { id: 'secs', label: 'Length of the slide show (seconds)', value: show },
      { id: 'slot', label: `Whole talk with a ${d.intro}-minute introduction and ${d.questions} minutes of questions (minutes)`, value: roundDp(show / 60 + d.intro + d.questions, 2), tol: 0.02 },
      { id: 'pages', label: `Handout pages for ${d.students} students`, value: pages * d.students },
    ];
  },
  extra: (d) => ({ outline: d.outline }),
  start: (_, s) => ({ ...s, deck: { ...s.deck, slides: [coSlide('s1', 'TITLE', '', '')] } }),
  checks: (d, st) => {
    const x = st.deck;
    const by = (t: string) => x.slides.find((s) => s.title.toLowerCase() === t.toLowerCase());
    return [
      ck('procedure', 'master', 'Change the title style on the Slide Master', x.master.used && (x.master.titleFont !== 'Calibri' || x.master.titleColor !== '#111827'), 'deck', 'A change on the master updates every slide at once.'),
      ck('procedure', 'trans', 'One transition on all slides', allTransition(x), 'deck'),
      ck('procedure', 'save', 'Save as Road_Safety.pptx', savedDeck(x, 'Road_Safety'), 'deck'),
      ck('procedure', 'show', 'Run the show from the beginning and end it with Esc', ranShow(x), 'deck'),
      ck('procedure', 'hand', `Print handouts, ${d.perPage} per page`, x.handouts.jobs > 0 && x.handouts.perPage === d.perPage, 'deck'),
      ck('product', 'logo', 'Logo on the master', x.master.logo, 'deck'),
      ck('product', 'footer', 'School name in the master footer', coSameText(x.master.footer, d.school), 'deck'),
      ck('product', 'n', 'Title slide and all five outline slides', x.slides[0]?.layout === 'TITLE' && /road/i.test(x.slides[0]?.title ?? '') && d.outline.every((o) => !!by(o.title)), 'deck'),
      ck('product', 'objects', 'Table, picture and shape on their slides', !!by('Crash figures')?.table && !!by('Crossing the road')?.pic && !!by('What to do')?.shape, 'deck'),
      ck('product', 'time', `Every slide advances after ${d.advance} s`, x.slides.length > 0 && x.slides.every((s) => s.advance === d.advance), 'deck'),
    ];
  },
  model: (d, st) => {
    let x: CoDeck = { ...st.deck, slides: [titleSlide('Road Safety', 'Student')], master: { titleFont: 'Arial', titleColor: '#0f3d8c', logo: true, footer: d.school, used: true } };
    x = outlineDeck(x, d.outline);
    x = coEditSlide(x, 2, { pic: true });
    x = coEditSlide(x, 3, { table: true });
    x = coEditSlide(x, 5, { shape: true });
    x = coApplyAll(x, { transition: 'PUSH', advance: d.advance });
    x = { ...x, saved: 'Road_Safety.pptx' };
    x = coRunShow(x, 6, true, true);
    x = coPrintHandouts(x, d.perPage);
    return { ...st, deck: x };
  },
  prec: PREC_DECK,
  explain: {
    q: 'Why put the logo and footer on the slide master instead of on each slide?',
    guide: '2 marks: (1) they appear on every slide automatically; (1) one change on the master updates all slides, keeping a consistent design and saving time.',
    kw: [['every slide', 'all slides', 'automatic'], ['one change', 'update', 'consistent', 'saves time', 'once']],
    need: 2,
  },
});

// ------------------------------------------------------------------ files

const PREC_FILES = { guide: 'Two correct precautions, e.g. use meaningful file names; check before deleting; always eject a flash drive before pulling it out; keep backups on another device; scan a flash drive; a flash-drive delete cannot be undone.', kw: [['meaningful', 'clear name', 'sensible name'], ['check', 'careful', 'before deleting'], ['eject', 'safely remove'], ['backup', 'back up', 'another device', 'separate'], ['scan', 'antivirus', 'virus'], ['recycle', 'permanent']] };
const baseFs = (extra: { folder: string; files: [string, number][] }): CoFs => {
  const nodes: CoNode[] = [
    { id: 'c', name: 'C: (Local disk)', parent: null, kind: 'DRIVE', size: 0 },
    { id: 'd', name: 'D: (Data)', parent: null, kind: 'DRIVE', size: 0 },
    { id: 'f0', name: extra.folder, parent: 'd', kind: 'FOLDER', size: 0 },
    ...extra.files.map(([name, size], i): CoNode => ({ id: `s${i}`, name, parent: 'f0', kind: 'FILE', size })),
  ];
  return { ...coEmptyFs(), nodes, next: 100 };
};
const at = (fs: CoFs, p: string) => coFsByPath(fs, p);
const mk = (fs: CoFs, parentPath: string, name: string) => coFsMkdir(fs, at(fs, parentPath)!.id, name).fs;

interface FilesData {
  folder: string;
  project: string;
  other: [string, number][];
  count: number;
  avg: number;
  gb: number;
}
const CST_FILES = coDef<FilesData>({
  task: 'CST_FILES',
  family: 'FILES',
  title: 'Folders, paths and backups',
  apps: ['files'],
  make: (seed) => {
    const r = labRandom(seed, 'cst-files');
    return { folder: 'SS3', project: labPick(r, ['Project.docx', 'Essay.docx', 'Report.docx']), other: [['Timetable.xlsx', 180], ['Photo.jpg', 950]], count: labPick(r, [80, 120, 160, 200]), avg: labPick(r, [1.5, 2.5, 3]), gb: labPick(r, [4, 8, 16]) };
  },
  brief: (d) => [
    'Open File Explorer. On drive D make a folder School, and inside it a folder SS3.',
    `Your work is in D:\\Downloads. Cut ${d.project} and paste it into D:\\School\\SS3.`,
    `Make a folder Backup inside D:\\School. Copy ${d.project} from SS3 and paste it into Backup; rename the copy ${d.project.replace('.docx', '_backup.docx')}.`,
    `Delete the original in SS3, then open the Recycle Bin and restore it.`,
    'Insert the flash drive, copy the SS3 folder to it, then Eject the drive.',
    'Right-click SS3 > Properties to read its size.',
  ],
  answers: (d) => {
    const mb = d.count * d.avg;
    const cap = d.gb * 1024;
    return [
      { id: 'path', label: 'The full path of the restored file', value: `D:\\School\\SS3\\${d.project}` },
      { id: 'size', label: `Backup of ${d.count} files averaging ${d.avg} MB (MB)`, value: mb },
      { id: 'pct', label: `That as a percentage of a ${d.gb} GB flash drive (%)`, value: roundDp((mb / cap) * 100, 1), tol: 0.06 },
      { id: 'fit', label: 'Whole backups that fit on it', value: Math.floor(cap / mb) },
    ];
  },
  start: (d, s) => ({ ...s, fs: baseFs({ folder: 'Downloads', files: [[d.project, 2400], ...d.other]}) }),
  checks: (d, st) => {
    const fs = st.fs;
    const orig = `D:\\School\\SS3\\${d.project}`;
    const copy = `D:\\School\\Backup\\${d.project.replace('.docx', '_backup.docx')}`;
    const flash = fs.nodes.find((n) => n.parent === 'flash' && n.name === 'SS3');
    return [
      ck('procedure', 'cut', 'Use Cut and Paste to move the file', fs.did.includes('cut') && !at(fs, `D:\\Downloads\\${d.project}`), 'files', 'A move removes it from the old place; a copy leaves it there.'),
      ck('procedure', 'copy', 'Use Copy and Paste for the backup', fs.did.includes('copy') && fs.did.includes('paste'), 'files'),
      ck('procedure', 'rename', 'Rename the copy', fs.did.includes('rename'), 'files'),
      ck('procedure', 'restore', 'Delete the original and restore it from the Recycle Bin', fs.did.includes('delete') && fs.did.includes('restore'), 'files'),
      ck('procedure', 'eject', 'Eject the flash drive', fs.flash === 'EJECTED', 'files', 'Pulling it out while writing can corrupt files.'),
      ck('procedure', 'props', 'Open the Properties of SS3', fs.props.some((id) => coFsPath(fs, id) === 'D:\\School\\SS3'), 'files'),
      ck('product', 'tree', 'D:\\School holds SS3 and Backup', !!at(fs, 'D:\\School\\SS3') && !!at(fs, 'D:\\School\\Backup'), 'files'),
      ck('product', 'orig', `${d.project} is back in SS3`, !!at(fs, orig), 'files'),
      ck('product', 'copy', 'The renamed copy is in Backup', !!at(fs, copy), 'files'),
      ck('product', 'flash', 'SS3, with the file in it, is on the flash drive', !!flash && coFsKids(fs, flash.id).some((n) => n.name === d.project), 'files'),
    ];
  },
  model: (d, st) => {
    let fs = st.fs;
    fs = mk(fs, 'D:', 'School');
    fs = mk(fs, 'D:\\School', 'SS3');
    fs = mk(fs, 'D:\\School', 'Backup');
    fs = coFsCopy(fs, [at(fs, `D:\\Downloads\\${d.project}`)!.id], true);
    fs = coFsPaste(fs, at(fs, 'D:\\School\\SS3')!.id).fs;
    const src = at(fs, `D:\\School\\SS3\\${d.project}`)!;
    fs = coFsCopy(fs, [src.id], false);
    fs = coFsPaste(fs, at(fs, 'D:\\School\\Backup')!.id).fs;
    fs = coFsRename(fs, at(fs, `D:\\School\\Backup\\${d.project}`)!.id, d.project.replace('.docx', '_backup.docx')).fs;
    fs = coFsDelete(fs, src.id);
    fs = coFsRestore(fs, src.id);
    fs = coFsInsertFlash(fs);
    fs = coFsCopy(fs, [at(fs, 'D:\\School\\SS3')!.id], false);
    fs = coFsPaste(fs, 'flash').fs;
    fs = coFsEject(fs);
    fs = { ...fs, props: [at(fs, 'D:\\School\\SS3')!.id] };
    return { ...st, fs };
  },
  prec: PREC_FILES,
  explain: {
    q: 'What is the difference between Copy and Cut, and what is different about deleting from a flash drive?',
    guide: '2 marks: (1) a copy leaves the original in place, a cut (move) removes it from the source; (1) files deleted from a hard disk go to the Recycle Bin; from a flash drive they are removed permanently.',
    kw: [['leaves', 'original', 'duplicate', 'remains', 'stays'], ['moves', 'removes', 'cut'], ['permanent', 'recycle', 'cannot be restored', 'gone']],
    need: 2,
  },
});

interface Files2Data {
  files: [string, number][];
  mbFiles: [string, number];
}
const DPR_FILES = coDef<Files2Data>({
  task: 'DPR_FILES',
  family: 'FILES',
  title: 'Files, folders and the command line',
  apps: ['files'],
  make: (seed) => {
    const r = labRandom(seed, 'dpr-files');
    const a = labPick(r, [1.6, 2.4, 3.2]);
    const b = labPick(r, [650, 850, 950]);
    const c = labPick(r, [1.2, 1.5, 1.8]);
    return { files: [['Notes.docx', a * 1024], ['Photo.jpg', b], ['Table.xlsx', c * 1024]], mbFiles: [`${a} MB, ${b} KB and ${c} MB`, a * 1024 + b + c * 1024] };
  },
  brief: (d) => [
    'Open File Explorer. In drive D create School, and inside it SS3.',
    'Copy the three files from D:\\Work into D:\\School\\SS3.',
    'In SS3 rename Notes.docx to DP_Notes.docx.',
    'Switch to Details view and read each file\'s size.',
    'Insert the flash drive, copy the SS3 folder to it, then Eject.',
    'Delete Photo.jpg from D:\\School\\SS3, open the Recycle Bin and restore it.',
    'Open Command Prompt and type dir D:\\School\\SS3 to list the same files.',
    `The sizes are ${d.mbFiles[0]}.`,
  ],
  answers: (d) => [
    { id: 'path', label: 'Full path of the renamed file', value: 'D:\\School\\SS3\\DP_Notes.docx' },
    { id: 'kb', label: 'Total size of the three files (KB)', value: roundDp(d.mbFiles[1], 1), tol: 0.11 },
    { id: 'mb', label: 'Total size (MB, 2 d.p.)', value: roundDp(d.mbFiles[1] / 1024, 2), tol: 0.011 },
  ],
  start: (d, s) => ({ ...s, fs: baseFs({ folder: 'Work', files: d.files }) }),
  checks: (_, st) => {
    const fs = st.fs;
    const flash = fs.nodes.find((n) => n.parent === 'flash' && n.name === 'SS3');
    return [
      ck('procedure', 'copy', 'Copy and paste the three files', fs.did.includes('copy') && fs.did.includes('paste'), 'files'),
      ck('procedure', 'rename', 'Rename Notes.docx', fs.did.includes('rename'), 'files'),
      ck('procedure', 'details', 'Switch to Details view', fs.view === 'DETAILS', 'files'),
      ck('procedure', 'eject', 'Eject the flash drive', fs.flash === 'EJECTED', 'files'),
      ck('procedure', 'restore', 'Delete Photo.jpg and restore it', fs.did.includes('delete') && fs.did.includes('restore'), 'files'),
      ck('procedure', 'dir', 'Type dir D:\\School\\SS3 at the Command Prompt', fs.cmds.some((c) => /^dir\s+d:\\school\\ss3\\?\s*$/i.test(c.trim())), 'files', 'The same files, from a command-line interface.'),
      ck('product', 'tree', 'D:\\School\\SS3 exists', !!at(fs, 'D:\\School\\SS3'), 'files'),
      ck('product', 'files', 'DP_Notes.docx, Photo.jpg and Table.xlsx are in SS3', ['DP_Notes.docx', 'Photo.jpg', 'Table.xlsx'].every((n) => !!at(fs, `D:\\School\\SS3\\${n}`)), 'files'),
      ck('product', 'orig', 'The originals are still in D:\\Work', ['Notes.docx', 'Photo.jpg', 'Table.xlsx'].every((n) => !!at(fs, `D:\\Work\\${n}`)), 'files'),
      ck('product', 'flash', 'SS3 is on the flash drive with its three files', !!flash && coFsKids(fs, flash.id).length === 3, 'files'),
    ];
  },
  model: (_, st) => {
    let fs = st.fs;
    fs = mk(fs, 'D:', 'School');
    fs = mk(fs, 'D:\\School', 'SS3');
    fs = coFsCopy(fs, coFsKids(fs, 'f0').map((n) => n.id), false);
    fs = coFsPaste(fs, at(fs, 'D:\\School\\SS3')!.id).fs;
    fs = coFsRename(fs, at(fs, 'D:\\School\\SS3\\Notes.docx')!.id, 'DP_Notes.docx').fs;
    fs = { ...fs, view: 'DETAILS' };
    fs = coFsInsertFlash(fs);
    fs = coFsCopy(fs, [at(fs, 'D:\\School\\SS3')!.id], false);
    fs = coFsPaste(fs, 'flash').fs;
    fs = coFsEject(fs);
    const photo = at(fs, 'D:\\School\\SS3\\Photo.jpg')!;
    fs = coFsDelete(fs, photo.id);
    fs = coFsRestore(fs, photo.id);
    fs = { ...fs, cmds: ['dir D:\\School\\SS3'] };
    return { ...st, fs };
  },
  prec: PREC_FILES,
  explain: {
    q: 'Compare a graphical user interface with a command-line interface, and say why a backup should not stay on the same disk.',
    guide: '2 marks: (1) a GUI uses windows, icons, menus and a pointer; a command line takes typed commands; (1) if that disk fails the original and the copy are both lost.',
    kw: [['icon', 'window', 'menu', 'pointer', 'mouse'], ['typed', 'command', 'text'], ['fails', 'lost', 'damage', 'crash', 'both']],
    need: 2,
  },
});

export const CO_DECK_DEFS: CoDef[] = [CST_DECK, DPR_DECK, ICT_DECK];
export const CO_FILE_DEFS: CoDef[] = [CST_FILES, DPR_FILES];
void coFsSize;
export type { CompOfficeState };
