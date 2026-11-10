import { CO_FIRST, CO_SURNAME, ck, coDef, coSameText, coShuffle, type CoCheck, type CoDef, type CompOfficeState } from './comp-office-data';
import { CO_FIELD, coAddTableRow, coCountWord, coDocPreview, coDocPrint, coDocSave, coDocText, coEmptyDoc, coFieldsIn, coFormatParas, coInsertPicture, coInsertTable, coPara, coReplaceAll, coSetParaText, coSetTableCell, coSizePicture, coSpellLeft, coTableNum, coUpdateFields, type CoDoc, type CoPara } from './comp-office-doc';
import { coEvalAll } from './comp-office-formula';
import { coDeleteRow, coSheetFrom, type CoSheet } from './comp-office-sheet';
import { labPick, labRandom, roundDp } from './seeded';

/** The word-processing lessons. */

/** Misspelt words for the spelling check, one list per gap so the corrected sentence still makes sense. */
const NOTICE_SPELL = [
  [{ wrong: 'recieve', right: 'receive' }, { wrong: 'colect', right: 'collect' }, { wrong: 'dispaly', right: 'display' }],
  [{ wrong: 'seperate', right: 'separate' }, { wrong: 'compleet', right: 'complete' }, { wrong: 'detialed', right: 'detailed' }],
];
const LETTER_SPELL = [
  [{ wrong: 'Saterday', right: 'Saturday' }, { wrong: 'Wensday', right: 'Wednesday' }, { wrong: 'Firday', right: 'Friday' }],
  [{ wrong: 'developement', right: 'development' }, { wrong: 'maintainance', right: 'maintenance' }, { wrong: 'libary', right: 'library' }],
];
const pickSpell = (r: () => number, slots: { wrong: string; right: string }[][]) => slots.map((s) => labPick(r, s));
const inFolder = (d: CoDoc, folder: string) => !!d.saved && coSameText(d.saved.folder.replace(/\//g, '\\'), folder);
const named = (d: CoDoc, name: string) => !!d.saved && coSameText(d.saved.name.replace(/\.(docx?|odt)$/i, ''), name.replace(/\.docx$/i, ''));
const near = (a: number, b: number, t = 0.011) => Math.abs(a - b) <= t;
const para = (d: CoDoc, id: string) => d.paras.find((p) => p.id === id);
const margins = (d: CoDoc, m: number) => [d.page.mt, d.page.mb, d.page.ml, d.page.mr].every((x) => near(x, m));
const ofIds = (d: CoDoc, ids: string[], f: (p: CoPara) => boolean) => ids.every((id) => !!para(d, id) && f(para(d, id)!));
const fixSpell = (d: CoDoc, list: { wrong: string; right: string }[]): CoDoc => {
  let out = d;
  for (const w of list) out = coReplaceAll(out, w.wrong, w.right, false).doc;
  return { ...out, spellRuns: out.spellRuns + 1, replaced: d.replaced };
};
const PREC = {
  guide: 'Two correct precautions, e.g. select text before formatting; save early and often; use Print Preview before printing; use the alignment and spacing tools, not the space bar or Enter; preview merged letters; no blank rows in the data source.',
  kw: [['select'], ['save', 'saved', 'ctrl s'], ['preview'], ['alignment', 'space bar', 'spacing tool', 'enter key'], ['blank row', 'no blank'], ['spell'], ['aspect', 'lock', 'stretch'], ['update', 'f9']],
};

interface NoticeData {
  when: string;
  venue: string;
  events: string[];
  houses: string[];
  margin: number;
  headSize: number;
  bodySize: number;
  spacing: number;
  spell: { wrong: string; right: string }[];
  file: string;
  folder: string;
}
const HEAD = 'head';
const noticeBody = ['b1', 'b2'];
const eventIds = (d: NoticeData) => d.events.map((_, i) => `e${i}`);
const noticeDoc = (d: NoticeData): CoDoc => ({
  ...coEmptyDoc(),
  page: { paper: 'A4', orient: 'PORTRAIT', mt: 1.91, mb: 1.91, ml: 1.91, mr: 1.91 },
  paras: [
    coPara(HEAD, 'INTER-HOUSE SPORTS'),
    coPara('b1', `All students and staff are invited to the Inter-House Sports on ${d.when} at the ${d.venue}. Each House will ${d.spell[0]!.wrong} its colours at the gate, and every House must arrive on time.`),
    coPara('b2', `${d.houses[0]} House and ${d.houses[1]} House will meet in the final. Parents are welcome; a ${d.spell[1]!.wrong} list of events is below.`),
    ...d.events.map((e, i) => coPara(`e${i}`, e)),
  ],
});
const CST_NOTICE = coDef<NoticeData>({
  task: 'CST_NOTICE',
  family: 'DOC',
  title: 'Formatting a notice',
  apps: ['doc'],
  make: (seed) => {
    const r = labRandom(seed, 'cst-notice');
    const day = labPick(r, ['Friday 14 March', 'Thursday 20 February', 'Saturday 8 March', 'Friday 7 February']);
    const hour = labPick(r, ['9 a.m.', '10 a.m.', '11 a.m.']);
    return {
      when: `${day}, ${hour}`,
      venue: labPick(r, ['school field', 'main field', 'township stadium']),
      events: coShuffle(r, ['100 m race', '4 x 100 m relay', 'Long jump', 'High jump', 'Sack race', 'Tug of war', 'Football final']).slice(0, 4),
      houses: coShuffle(r, ['Blue', 'Red', 'Green', 'Yellow']).slice(0, 2),
      margin: labPick(r, [2.54, 2.54, 2, 2.2]),
      headSize: labPick(r, [14, 16, 16, 18]),
      bodySize: 12,
      spacing: labPick(r, [1.15, 1.5, 1.5]),
      spell: pickSpell(r, NOTICE_SPELL),
      file: 'Sports_Notice.docx',
      folder: 'Documents\\SS3',
    };
  },
  brief: (d) => [
    'The notice has been typed into the document. Do not retype it.',
    `Select the heading: Bold, ${d.headSize} pt, Centre.`,
    `Select the two body paragraphs and the list: Times New Roman ${d.bodySize} pt. Justify the two paragraphs, with ${d.spacing} line spacing.`,
    `Layout > Margins: ${d.margin} cm on all four sides, A4 portrait.`,
    'Make the list of events a bulleted list; add a page border.',
    'Find and Replace: change "House" to "house" with Match case on.',
    'Run the spelling check (F7) and correct both words.',
    `Save As: in Documents make a folder SS3 and save as ${d.file}.`,
    'Open Print Preview, then print 1 copy.',
  ],
  answers: (d) => [
    { id: 'width', label: 'Text width on A4 with your margins (cm)', value: roundDp(21 - 2 * d.margin, 2), tol: 0.011 },
    { id: 'height', label: `Height of ${d.bodySize} pt text (cm, 72 pt = 2.54 cm)`, value: roundDp((d.bodySize / 72) * 2.54, 2), tol: 0.011 },
    { id: 'ratio', label: `How many times taller is the ${d.headSize} pt heading than the body?`, value: roundDp(d.headSize / d.bodySize, 2), tol: 0.011 },
  ],
  start: (d, s) => ({ ...s, doc: noticeDoc(d) }),
  extra: (d) => ({ spell: d.spell }),
  checks: (d, st) => {
    const x = st.doc;
    const body = ofIds(x, noticeBody, (p) => p.font === 'Times New Roman' && p.size === d.bodySize && p.align === 'J' && p.spacing === d.spacing);
    const text = coDocText(x);
    const lower = x.paras.filter((p) => p.id !== HEAD).map((p) => p.text).join(' ');
    return [
      ck('procedure', 'replace', 'Find and Replace: House to house, Match case on', x.replaced >= 2 && coCountWord(lower, 'House') === 0, 'doc', 'A replace is quicker and misses none.'),
      ck('procedure', 'spell', 'Run the spelling check and correct both words', x.spellRuns > 0 && !coSpellLeft(x, d.spell).length, 'doc'),
      ck('procedure', 'save', `Save in ${d.folder} as ${d.file}`, inFolder(x, d.folder) && named(x, d.file), 'doc'),
      ck('procedure', 'preview', 'Print Preview before printing', x.print.previewedFirst, 'doc', 'What you see in preview is what prints.'),
      ck('procedure', 'print', 'Print 1 copy', x.print.jobs > 0 && x.print.copies === 1, 'doc'),
      ck('product', 'head', `Heading bold, ${d.headSize} pt, centred`, ofIds(x, [HEAD], (p) => !!p.b && p.size === d.headSize && p.align === 'C'), 'doc'),
      ck('product', 'body', `Body Times New Roman ${d.bodySize} pt, justified, ${d.spacing} spacing`, body, 'doc'),
      ck('product', 'margin', `A4 portrait, ${d.margin} cm margins`, margins(x, d.margin) && x.page.paper === 'A4' && x.page.orient === 'PORTRAIT', 'doc'),
      ck('product', 'bullets', 'The events are a bulleted list', ofIds(x, eventIds(d), (p) => !!p.bullet), 'doc'),
      ck('product', 'border', 'A page border', x.border, 'doc'),
      ck('product', 'text', 'The details of the notice are unchanged', text.includes(d.when) && text.includes(d.venue) && d.events.every((e) => text.includes(e)), 'doc'),
    ];
  },
  model: (d, st) => {
    let x = coFormatParas(st.doc, [HEAD], { b: true, size: d.headSize, align: 'C' });
    x = coFormatParas(x, [...noticeBody, ...eventIds(d)], { font: 'Times New Roman', size: d.bodySize });
    x = coFormatParas(x, noticeBody, { align: 'J', spacing: d.spacing });
    x = coFormatParas(x, eventIds(d), { bullet: true });
    x = { ...x, page: { ...x.page, mt: d.margin, mb: d.margin, ml: d.margin, mr: d.margin }, border: true };
    x = coReplaceAll(x, 'House', 'house', true).doc;
    x = fixSpell(x, d.spell);
    x = coDocSave(x, d.folder, d.file);
    x = coDocPrint(coDocPreview(x), 1);
    return { ...st, doc: x };
  },
  prec: PREC,
  explain: {
    q: 'Why should you let word wrap end each line, and what is the use of Print Preview?',
    guide: '2 marks: (1) word wrap moves text to the next line by itself, so lines re-flow when text or margins change (pressing Enter breaks the paragraph); (1) Print Preview shows the page as it will print (WYSIWYG), so paper is not wasted.',
    kw: [['wrap', 'next line', 'automatically', 'reflow', 're flow'], ['preview', 'see', 'wysiwyg', 'waste', 'check']],
    need: 2,
  },
});

interface MergeData {
  parents: { Title: string; Surname: string; StudentName: string; Class: string; Address?: string }[];
  blankRow: number;
  ppm: number;
  ream: number;
}
const TITLES = ['Mr', 'Mrs', 'Dr', 'Chief', 'Alhaji'];
const mergeData = (seed: number, salt: string): MergeData => {
  const r = labRandom(seed, salt);
  const n = 6 + Math.floor(r() * 4);
  const sur = coShuffle(r, CO_SURNAME);
  const first = coShuffle(r, CO_FIRST);
  return {
    parents: Array.from({ length: n }, (_, i) => ({ Title: labPick(r, TITLES), Surname: sur[i]!, StudentName: first[i]!, Class: labPick(r, ['SS1A', 'SS2B', 'SS3A', 'SS3B']), Address: `${1 + Math.floor(r() * 60)} ${labPick(r, ['Market', 'School', 'Station', 'Church', 'Lake'])} Road` })),
    blankRow: 2 + Math.floor(r() * (n - 2)),
    ppm: labPick(r, [15, 20, 24, 30]),
    ream: labPick(r, [4000, 4500, 5000]),
  };
};
/** The list as supplied: one blank row, which would print an empty letter. */
function parentSheet(d: MergeData, cols: string[]): CoSheet {
  const rows: (string | null)[][] = [cols];
  d.parents.forEach((p, i) => {
    if (i === d.blankRow) rows.push(cols.map(() => null));
    rows.push(cols.map((c) => p[c as keyof typeof p] ?? ''));
  });
  return { ...coSheetFrom(rows, 'A1', { rows: rows.length + 3, cols: 6 }), file: 'Parents.xlsx' };
}
/** Records of the data source: every row between the headings and the last filled row, blank rows included. */
export function coSourceRecords(s: CoSheet): Record<string, string>[] {
  const vals = coEvalAll(s.cells);
  const cols: { c: string; name: string }[] = [];
  for (const c of 'ABCDEFGHIJKL') if (vals[`${c}1`]) cols.push({ c, name: String(vals[`${c}1`]) });
  const rows = Object.keys(vals).map((a) => Number(a.replace(/\D/g, '')));
  const last = Math.max(1, ...rows);
  const out: Record<string, string>[] = [];
  for (let r = 2; r <= last; r++) out.push(Object.fromEntries(cols.map((c) => [c.name, String(vals[`${c.c}${r}`] ?? '')])));
  return out;
}
const merged = (x: CoDoc, n: number) => x.merge.started && coSameText(x.merge.source.replace(/\.xlsx$/i, ''), 'Parents') && x.merge.previewed >= 2 && x.merge.letters === n;
const blankGone = (s: CoSheet) => coSourceRecords(s).every((r) => Object.values(r).some(Boolean));
const letterDoc = (d: { head: string; lines: CoPara[] }): CoDoc => ({ ...coEmptyDoc(), paras: [coPara('head', d.head), ...d.lines] });

const CST_MERGE = coDef<MergeData>({
  task: 'CST_MERGE',
  family: 'DOC',
  title: 'Mail merge: letters to parents',
  apps: ['sheet', 'doc'],
  make: (seed) => mergeData(seed, 'cst-merge'),
  brief: (d) => [
    `Spreadsheet: Parents.xlsx holds ${d.parents.length} parents. Look for a blank row and delete it: it would print an empty letter.`,
    'Word processor: Mailings > Start Mail Merge > Letters, then Select Recipients and choose Parents.xlsx.',
    'In the letter, replace each blank ____ with Insert Merge Field: Title and Surname after Dear (with a space between them), StudentName and Class in the sentence.',
    'Preview Results and step through at least two letters.',
    'Finish & Merge: Edit Individual Documents, All records.',
    `Work out the printing: ${d.parents.length} one-page letters on a ${d.ppm} page-per-minute printer, paper ₦${d.ream.toLocaleString('en')} a ream of 500.`,
  ],
  answers: (d) => {
    const n = d.parents.length;
    return [
      { id: 'pages', label: 'Pages in the merged document', value: n },
      { id: 'mins', label: 'Printing time (minutes)', value: roundDp(n / d.ppm, 2), tol: 0.02 },
      { id: 'paper', label: 'Cost of the paper (₦)', value: roundDp((n * d.ream) / 500, 2), tol: 0.011 },
    ];
  },
  start: (d, s) => ({
    ...s,
    sheet: parentSheet(d, ['Title', 'Surname', 'StudentName', 'Class']),
    doc: letterDoc({ head: 'PTA MEETING', lines: [coPara('dear', 'Dear ____ ____,'), coPara('b1', 'You are invited to the PTA meeting. We would like to discuss the progress of ____ of class ____.'), coPara('b2', 'Yours faithfully,'), coPara('b3', 'The Principal')] }),
  }),
  checks: (d, st) => {
    const x = st.doc;
    const f = coFieldsIn(x);
    const t = coDocText(x);
    return [
      ck('procedure', 'blank', 'Delete the blank row from the data source', blankGone(st.sheet), 'sheet', 'Each row is a record, so a blank row prints an empty letter.'),
      ck('procedure', 'start', 'Start a Letters merge and select Parents.xlsx', x.merge.started && coSameText(x.merge.source.replace(/\.xlsx$/i, ''), 'Parents'), 'doc'),
      ck('procedure', 'preview', 'Preview at least two letters', x.merge.previewed >= 2, 'doc', 'Preview catches spacing mistakes such as Mr.Okeke.'),
      ck('procedure', 'finish', 'Finish & Merge all records', x.merge.letters > 0, 'doc'),
      ck('product', 'fields', 'All four merge fields are in the letter', ['Title', 'Surname', 'StudentName', 'Class'].every((k) => f.includes(k)), 'doc'),
      ck('product', 'space', 'Dear «Title» «Surname», with a space', /Dear «Title» «Surname»/.test(t), 'doc'),
      ck('product', 'noblanks', 'No ____ left in the letter', !t.includes('____'), 'doc'),
      ck('product', 'letters', `One letter per parent: ${d.parents.length}`, merged(x, d.parents.length), 'doc'),
    ];
  },
  model: (d, st) => {
    let x = coSetParaText(st.doc, 'dear', `Dear ${CO_FIELD('Title')} ${CO_FIELD('Surname')},`);
    x = coSetParaText(x, 'b1', `You are invited to the PTA meeting. We would like to discuss the progress of ${CO_FIELD('StudentName')} of class ${CO_FIELD('Class')}.`);
    x = { ...x, merge: { started: true, source: 'Parents.xlsx', previewed: 2, letters: d.parents.length, printed: false } };
    return { ...st, sheet: coDeleteRow(st.sheet, d.blankRow + 1), doc: x };
  },
  prec: PREC,
  explain: {
    q: 'What are the main document and the data source in a mail merge, and why does one blank row in the list matter?',
    guide: '2 marks: (1) the main document holds the text that is the same in every letter with merge fields; the data source holds one record for each person; (1) every row makes one letter, so a blank row gives an empty letter.',
    kw: [['main document', 'letter', 'same text', 'template'], ['data source', 'record', 'list'], ['empty', 'blank letter', 'wasted', 'empty letter']],
    need: 2,
  },
});

interface LetterData extends MergeData {
  spell: { wrong: string; right: string }[];
  head: number;
  spacing: number;
  wpm: number;
  words: number;
}
const CST_BODY = ['b1', 'b2', 'b3'];
const DPR_LETTER = coDef<LetterData>({
  task: 'DPR_LETTER',
  family: 'DOC',
  title: 'A letter: format, save, retrieve, merge',
  apps: ['sheet', 'doc'],
  make: (seed) => {
    const r = labRandom(seed, 'dpr-letter');
    return { ...mergeData(seed, 'dpr-merge'), spell: pickSpell(r, LETTER_SPELL), head: labPick(r, [14, 14, 16]), spacing: labPick(r, [1.15, 1.15, 1.5]), wpm: labPick(r, [25, 30, 40]), words: 75 * labPick(r, [2, 3, 4]) };
  },
  brief: (d) => [
    'Page Setup: the draft is on Letter paper with narrow margins. Set A4, Portrait, Normal margins (2.54 cm).',
    `Select the heading: Bold, Centre, ${d.head} pt.`,
    `Justify the three body paragraphs and set line spacing to ${d.spacing}.`,
    'Run Spelling & Grammar (F7) and correct the two wrong words.',
    'Save As in Documents\\SS3 with the name PTA_Letter (make the folder if needed).',
    'Close the document, then open it again from Recent to show it was saved.',
    'In the spreadsheet, delete the blank row in Parents.xlsx.',
    'Mail merge: Letters, Select Recipients Parents.xlsx. Put «Title» «Surname» after Dear and «Address» in the address line.',
    'Preview at least two letters, then Finish & Merge.',
  ],
  answers: (d) => [
    { id: 'line', label: 'Usable line length on A4 (cm)', value: 15.92, tol: 0.011 },
    { id: 'print', label: `Time to print ${d.parents.length} one-page letters at ${d.ppm} pages a minute (min)`, value: roundDp(d.parents.length / d.ppm, 2), tol: 0.02 },
    { id: 'type', label: `Time to type ${d.words} words at ${d.wpm} words a minute (min)`, value: roundDp(d.words / d.wpm, 2), tol: 0.02 },
  ],
  extra: (d) => ({ spell: d.spell }),
  start: (d, s) => ({
    ...s,
    sheet: parentSheet(d, ['Title', 'Surname', 'Address']),
    doc: {
      ...letterDoc({
        head: 'GREENFIELD SECONDARY SCHOOL',
        lines: [
          coPara('addr', '____'),
          coPara('dear', 'Dear ____,'),
          coPara('b1', `The PTA will meet in the school hall on ${d.spell[0]!.wrong} at 10 a.m. We ask every parent to attend.`),
          coPara('b2', `The ${d.spell[1]!.wrong} levy, the new science block and the end-of-term results will be discussed.`),
          coPara('b3', 'Please come with this letter. Light refreshments will be served after the meeting.'),
          coPara('close', 'Yours faithfully,'),
          coPara('sign', 'The Principal'),
        ],
      }),
      page: { paper: 'LETTER', orient: 'PORTRAIT', mt: 1.27, mb: 1.27, ml: 1.27, mr: 1.27 },
    },
  }),
  checks: (d, st) => {
    const x = st.doc;
    const t = coDocText(x);
    return [
      ck('procedure', 'spell', 'Run the spelling check and correct both words', x.spellRuns > 0 && !coSpellLeft(x, d.spell).length, 'doc'),
      ck('procedure', 'save', 'Save in Documents\\SS3 as PTA_Letter', inFolder(x, 'Documents\\SS3') && named(x, 'PTA_Letter'), 'doc', 'Save puts it in a place you know; Save As sets the name, place and type.'),
      ck('procedure', 'reopen', 'Close it and open it again', x.reopened > 0 && x.open, 'doc'),
      ck('procedure', 'blank', 'Delete the blank row from the list', blankGone(st.sheet), 'sheet'),
      ck('procedure', 'merge', 'Mail merge from Parents.xlsx, previewing two letters', x.merge.started && x.merge.previewed >= 2, 'doc'),
      ck('product', 'page', 'A4 portrait with 2.54 cm margins', x.page.paper === 'A4' && x.page.orient === 'PORTRAIT' && margins(x, 2.54), 'doc'),
      ck('product', 'head', `Heading bold, centred, ${d.head} pt`, ofIds(x, ['head'], (p) => !!p.b && p.align === 'C' && p.size === d.head), 'doc'),
      ck('product', 'body', `Body justified with ${d.spacing} spacing`, ofIds(x, CST_BODY, (p) => p.align === 'J' && p.spacing === d.spacing), 'doc'),
      ck('product', 'fields', 'Merge fields after Dear and in the address', /Dear «Title» «Surname»/.test(t) && t.includes('«Address»') && !t.includes('____'), 'doc'),
      ck('product', 'letters', `One letter per parent: ${d.parents.length}`, x.merge.letters === d.parents.length, 'doc'),
    ];
  },
  model: (d, st) => {
    let x: CoDoc = { ...st.doc, page: { paper: 'A4', orient: 'PORTRAIT', mt: 2.54, mb: 2.54, ml: 2.54, mr: 2.54 } };
    x = coFormatParas(x, ['head'], { b: true, align: 'C', size: d.head });
    x = coFormatParas(x, CST_BODY, { align: 'J', spacing: d.spacing });
    x = fixSpell(x, d.spell);
    x = coSetParaText(x, 'addr', CO_FIELD('Address'));
    x = coSetParaText(x, 'dear', `Dear ${CO_FIELD('Title')} ${CO_FIELD('Surname')},`);
    x = coDocSave(x, 'Documents\\SS3', 'PTA_Letter.docx');
    x = { ...x, reopened: 1, merge: { started: true, source: 'Parents.xlsx', previewed: 2, letters: d.parents.length, printed: false } };
    return { ...st, sheet: coDeleteRow(st.sheet, d.blankRow + 1), doc: x };
  },
  prec: PREC,
  explain: {
    q: 'What is the difference between Save and Save As, and why is mail merge better than typing each letter?',
    guide: '2 marks: (1) Save keeps the same name and place, Save As gives a new name, place or type; (1) mail merge makes personalised letters from one main document and a list, quickly and without retyping.',
    kw: [['same name', 'same place', 'new name', 'different name', 'another name', 'location'], ['personal', 'quick', 'faster', 'retyp', 'time', 'once']],
    need: 2,
  },
});

interface TableData {
  items: [string, number, number][];
  px: number;
  py: number;
  width: number;
  head: number;
}
const ICT_TABLE = coDef<TableData>({
  task: 'ICT_TABLE',
  family: 'DOC',
  title: 'Tables and graphics',
  apps: ['doc'],
  make: (seed) => {
    const r = labRandom(seed, 'ict-table');
    const items = coShuffle(r, [['Exercise book', 250], ['Biro', 100], ['Ruler', 150], ['Eraser', 50], ['Pencil', 80], ['Mathematical set', 1200], ['Sharpener', 60]] as [string, number][]).slice(0, 4).map(([n, p]): [string, number, number] => [n, 5 * (2 + Math.floor(r() * 12)), p]);
    const [px, py] = labPick(r, [[1600, 1200], [1200, 900], [2000, 1000], [1500, 1000]] as [number, number][]);
    return { items, px, py, width: labPick(r, [6, 8, 9, 10]), head: 16 };
  },
  brief: (d) => [
    `The heading is typed: make it Bold, ${d.head} pt, Centred.`,
    'Insert a table of 4 columns and 5 rows. Headings: Item, Quantity, Unit Price (N), Amount (N).',
    `Enter: ${d.items.map((x) => `${x[0]} ${x[1]}, ${x[2]}`).join('; ')}.`,
    'In each Amount cell type =PRODUCT(LEFT).',
    'Press Tab in the last cell (or Add Row) to add a row: type Total, and =SUM(ABOVE) in the Amount column. Press F9 to update the fields.',
    'Apply a table style, make the header row bold, right-align the numbers.',
    `Insert the logo (${d.px} x ${d.py} pixels): set Width to ${d.width} cm with Lock aspect ratio on, and Wrap Text to Square.`,
    'Add a header (the school name) and page numbers. Preview, then save as Bookshop_Stock.',
  ],
  answers: (d) => {
    const total = d.items.reduce((t, x) => t + x[1] * x[2], 0);
    return [
      { id: 'total', label: 'Total value of stock (₦)', value: total },
      { id: 'pic', label: 'Height of the picture on the page (cm)', value: roundDp((d.width * d.py) / d.px, 2), tol: 0.011 },
      { id: 'cols', label: 'Width of each of 4 equal columns on A4 with 2.54 cm margins (cm)', value: 3.98, tol: 0.011 },
    ];
  },
  start: (_, s) => ({ ...s, doc: { ...coEmptyDoc(), paras: [coPara('head', 'Bookshop Stock, First Term')] } }),
  checks: (d, st) => {
    const x = st.doc;
    const t = x.table;
    const n = d.items.length;
    const lastCol = 3;
    const cellsOk = !!t && t.rows.length >= n + 2 && (t.rows[0]?.length ?? 0) === 4 && d.items.every((it, i) => coSameText(t.rows[i + 1]![0] ?? '', it[0]) && Number(t.rows[i + 1]![1]) === it[1] && Number(t.rows[i + 1]![2]) === it[2]);
    const amounts = !!t && cellsOk && d.items.every((it, i) => /^=\s*PRODUCT\s*\(\s*LEFT\s*\)\s*$/i.test(t.rows[i + 1]![lastCol] ?? '') && coTableNum(t, i + 1, lastCol) === it[1] * it[2]);
    const total = !!t && cellsOk && /^=\s*SUM\s*\(\s*ABOVE\s*\)\s*$/i.test(t.rows[n + 1]?.[lastCol] ?? '') && coTableNum(t, n + 1, lastCol) === d.items.reduce((a, it) => a + it[1] * it[2], 0);
    const p = x.picture;
    return [
      ck('procedure', 'style', 'Table style, bold header, right-aligned numbers', !!t && !!t.style && t.headerBold && t.rightNums, 'doc'),
      ck('procedure', 'lock', 'Keep Lock aspect ratio on while resizing', !!p && p.lock && near(p.w / p.h, p.px / p.py, 0.01), 'doc', 'Otherwise the picture stretches out of shape.'),
      ck('procedure', 'wrap', 'Wrap Text: Square', p?.wrap === 'SQUARE', 'doc'),
      ck('procedure', 'head', 'Header and page numbers', !!x.header.trim() && x.pageNumbers, 'doc'),
      ck('procedure', 'preview', 'Preview, then save as Bookshop_Stock', x.print.preview > 0 && named(x, 'Bookshop_Stock'), 'doc'),
      ck('product', 'title', `Heading bold, ${d.head} pt, centred`, ofIds(x, ['head'], (q) => !!q.b && q.size === d.head && q.align === 'C'), 'doc'),
      ck('product', 'table', 'The table has the stock list', !!t && cellsOk, 'doc'),
      ck('product', 'amount', 'Each Amount by =PRODUCT(LEFT), updated', amounts, 'doc'),
      ck('product', 'total', 'Total row by =SUM(ABOVE), updated with F9', total, 'doc', 'Word table formulas do not update by themselves.'),
      ck('product', 'pic', `Picture ${d.width} cm wide, in proportion`, !!p && near(p.w, d.width) && near(p.h, (d.width * d.py) / d.px), 'doc'),
    ];
  },
  model: (d, st) => {
    let x = coFormatParas(st.doc, ['head'], { b: true, size: d.head, align: 'C' });
    x = coInsertTable(x, 4, 5);
    ['Item', 'Quantity', 'Unit Price (N)', 'Amount (N)'].forEach((h, c) => (x = coSetTableCell(x, 0, c, h)));
    d.items.forEach((it, i) => {
      x = coSetTableCell(x, i + 1, 0, it[0]);
      x = coSetTableCell(x, i + 1, 1, String(it[1]));
      x = coSetTableCell(x, i + 1, 2, String(it[2]));
      x = coSetTableCell(x, i + 1, 3, '=PRODUCT(LEFT)');
    });
    x = coAddTableRow(x);
    x = coSetTableCell(x, d.items.length + 1, 0, 'Total');
    x = coSetTableCell(x, d.items.length + 1, 3, '=SUM(ABOVE)');
    x = coUpdateFields(x);
    x = { ...x, table: { ...x.table!, style: 'Grid', headerBold: true, rightNums: true }, header: 'Greenfield School Bookshop', pageNumbers: true };
    x = coInsertPicture(x, d.px, d.py);
    x = coSizePicture(x, 'w', d.width);
    x = { ...x, picture: { ...x.picture!, wrap: 'SQUARE' } };
    x = coDocSave(coDocPreview(x), 'Documents', 'Bookshop_Stock.docx');
    return { ...st, doc: x };
  },
  prec: PREC,
  explain: {
    q: 'Why must you press F9 after changing a number in a table, and why keep the aspect ratio locked?',
    guide: '2 marks: (1) Word table formulas are fields which do not update automatically; (1) the height changes in the same proportion as the width, so the picture is not stretched or distorted.',
    kw: [['automatic', 'update', 'do not', 'field'], ['proportion', 'stretch', 'distort', 'shape', 'ratio']],
    need: 2,
  },
});

export const CO_DOC_DEFS: CoDef[] = [CST_NOTICE, CST_MERGE, DPR_LETTER, ICT_TABLE];
export type { CoCheck, CompOfficeState };
