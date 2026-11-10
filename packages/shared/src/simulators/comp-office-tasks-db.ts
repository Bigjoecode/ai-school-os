import { CO_SURNAME, ck, coDef, coSameText, coShuffle, type CoCheck, type CoDef, type CoVariant, type CompOfficeState } from './comp-office-data';
import { coColDefault, coDbAddRow, coDbAddTable, coDbDeleteRow, coDbRelate, coDbSort, coField, coFieldOf, coQueryDefault, coReportGroups, coRunQuery, coSqlRun, coTableOf, coRecordBytes, type CoDb, type CoField, type CoQCol, type CoQuery, type CoReport } from './comp-office-db';
import { labPick, labRandom, roundDp } from './seeded';

/** The database lessons. The records are on the task card; "paste" keys them through the same checks as typing, including one bad record. */

const named = (a: string, b: string) => coSameText(a, b);
const hasFields = (db: CoDb, t: string, want: CoField[]) => {
  const tb = coTableOf(db, t);
  return !!tb && want.every((w) => {
    const f = coFieldOf(tb, w.name);
    return !!f && f.type === w.type && (w.type !== 'TEXT' || f.size === w.size) && f.pk === w.pk;
  });
};
const rowsMatch = (db: CoDb, t: string, keyField: string, rows: Record<string, string>[]) => {
  const tb = coTableOf(db, t);
  return !!tb && tb.rows.length === rows.length && rows.every((r) => tb.rows.some((x) => Object.keys(r).every((k) => (x[k] ?? '').trim().toLowerCase() === r[k]!.toLowerCase()) && x[keyField] === r[keyField]));
};
const toRows = (head: string[], rows: string[][]) => rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
const addAll = (db: CoDb, t: string, rows: Record<string, string>[]) => rows.reduce((x, r) => coDbAddRow(x, t, r).db, db);
const q = (name: string, tables: string[], cols: Partial<CoQCol>[], totals = false): CoQuery => ({ ...coQueryDefault(name, tables), cols: cols.map((c) => ({ ...coColDefault(), ...c })), totals, runs: 1 });
const report = (r: Partial<CoReport> & { name: string; source: string }): CoReport => ({ fields: [], group: '', sort: '', sum: false, avg: false, layout: 'STEPPED', orient: 'PORTRAIT', previews: 1, ...r });
const col = (rows: (string | number)[][], i: number) => rows.map((r) => String(r[i] ?? ''));
const sameSet = (a: string[], b: string[]) => a.length === b.length && [...a].map((x) => x.toLowerCase()).sort().join('|') === [...b].map((x) => x.toLowerCase()).sort().join('|');
const findQ = (db: CoDb, name: string) => db.queries.find((x) => named(x.name, name));
const resultNames = (db: CoDb, qr: CoQuery | undefined, field: string) => {
  if (!qr) return null;
  const res = coRunQuery(db, qr);
  const i = res.cols.findIndex((c) => named(c, field));
  return !res.error && i >= 0 ? col(res.rows, i) : null;
};
const PREC = {
  guide: 'Two correct precautions, e.g. choose the primary key first; give each field a suitable type and size; keep phone numbers as text; check a query result against the table; back up the database.',
  kw: [['primary key', 'unique'], ['data type', 'field type', 'field size', 'suitable type'], ['text'], ['validation', 'validate'], ['check', 'verify'], ['backup', 'back up', 'save'], ['foreign', 'same type', 'referential', 'integrity']],
};

interface StudentData {
  head: string[];
  rows: string[][];
  bad: string[];
  minAge: number;
  cls: string;
  students: number;
}
const stuFields: CoField[] = [coField('AdmNo', 'TEXT', 6, true), coField('Surname', 'TEXT', 20), coField('Class', 'TEXT', 3), coField('Sex', 'TEXT', 1), coField('Age', 'NUMBER', 0)];
const CST_DB = coDef<StudentData>({
  task: 'CST_DB',
  family: 'DB',
  title: 'A database table, sort and query',
  apps: ['db'],
  make: (seed) => {
    const r = labRandom(seed, 'cst-db');
    const cls = labPick(r, ['SS2', 'SS3']);
    for (;;) {
      const names = coShuffle(r, CO_SURNAME).slice(0, 8);
      const rows = names.map((n, i) => [String(1001 + i), n, r() < 0.6 ? cls : cls === 'SS3' ? 'SS2' : 'SS3', r() < 0.5 ? 'M' : 'F', String(15 + Math.floor(r() * 4))]);
      const minAge = 16;
      const hit = rows.filter((x) => x[2] === cls && Number(x[4]) >= minAge).length;
      const rest = rows.filter((x) => x[2] === cls).length - hit;
      const sexes = new Set(rows.filter((x) => x[2] === cls && Number(x[4]) >= minAge).map((x) => x[3]));
      if (hit >= 2 && rest >= 1 && sexes.size === 2) return { head: ['AdmNo', 'Surname', 'Class', 'Sex', 'Age'], rows, bad: [rows[3]![0]!, 'Danladi', cls, 'M', '16'], minAge, cls, students: 800 + 100 * Math.floor(r() * 8) };
    }
  },
  brief: (d) => [
    'New database: name it School (Blank database).',
    'Design View, new table STUDENTS: AdmNo (Short Text, 6, primary key), Surname (Short Text, 20), Class (Short Text, 3), Sex (Short Text, 1), Age (Number).',
    'Datasheet View: use Paste records from the task card. One record is a mistake: note what happens to it.',
    'Sort by Surname, ascending.',
    `Query Design on STUDENTS: all five fields, Criteria Class "${d.cls}" and Age >=${d.minAge}. Run it, save it as Query1.`,
    'Report Wizard on Query1, grouped by Sex. Preview it. Name it rptStudents.',
    `Work out the storage for ${d.students} records.`,
  ],
  answers: (d) => {
    const bytes = coRecordBytes(stuFields);
    return [
      { id: 'n', label: 'Records the query returned', value: d.rows.filter((x) => x[2] === d.cls && Number(x[4]) >= d.minAge).length },
      { id: 'bytes', label: 'Record length in bytes (text = size, integer = 2)', value: bytes },
      { id: 'kb', label: `Storage for ${d.students} records (KB, 1 KB = 1 024 bytes)`, value: roundDp((d.students * bytes) / 1024, 2), tol: 0.06 },
      { id: 'why', label: 'Which field refused the bad record?', value: 'AdmNo', alt: ['primary key', 'admno primary key'] },
    ];
  },
  extra: (d) => ({ records: [{ table: 'STUDENTS', head: d.head, rows: [...d.rows.slice(0, 5), d.bad, ...d.rows.slice(5)] }] }),
  start: (_, s) => s,
  checks: (d, st) => {
    const db = st.db;
    const rows = toRows(d.head, d.rows);
    const qr = findQ(db, 'Query1');
    const want = d.rows.filter((x) => x[2] === d.cls && Number(x[4]) >= d.minAge).map((x) => x[1]!);
    const got = resultNames(db, qr, 'Surname');
    const tb = coTableOf(db, 'STUDENTS');
    const rep = db.reports.find((x) => named(x.name, 'rptStudents'));
    return [
      ck('procedure', 'file', 'Create the database School', named(db.file.replace(/\.accdb$/i, ''), 'School'), 'db'),
      ck('procedure', 'refused', 'Enter the records: the duplicate AdmNo is refused', db.refused.includes('PK'), 'db', 'A primary key must be unique.'),
      ck('procedure', 'sort', 'Sort by Surname ascending', !!tb?.sort && named(tb.sort.field, 'Surname') && tb.sort.asc, 'db'),
      ck('procedure', 'run', 'Run the query and save it as Query1', !!qr && qr.runs > 0, 'db'),
      ck('procedure', 'preview', 'Preview the report', !!rep && rep.previews > 0, 'db'),
      ck('product', 'design', 'STUDENTS has the right fields, types, sizes and key', hasFields(db, 'STUDENTS', stuFields), 'db'),
      ck('product', 'rows', 'All eight records, correctly keyed', rowsMatch(db, 'STUDENTS', 'AdmNo', rows), 'db'),
      ck('product', 'query', 'The query returns exactly the right students', !!got && sameSet(got, want), 'db'),
      ck('product', 'report', 'A report on the query grouped by Sex', !!rep && named(rep.source, 'Query1') && named(rep.group, 'Sex'), 'db'),
    ];
  },
  model: (d, st) => {
    let db: CoDb = { ...st.db, file: 'School.accdb' };
    db = coDbAddTable(db, 'STUDENTS', stuFields);
    const rows = toRows(d.head, d.rows);
    db = addAll(db, 'STUDENTS', rows.slice(0, 5));
    db = coDbAddRow(db, 'STUDENTS', toRows(d.head, [d.bad])[0]!).db;
    db = addAll(db, 'STUDENTS', rows.slice(5));
    db = coDbSort(db, 'STUDENTS', 'Surname', true);
    db = { ...db, queries: [q('Query1', ['STUDENTS'], [{ field: 'AdmNo' }, { field: 'Surname' }, { field: 'Class', crit: `"${d.cls}"` }, { field: 'Sex' }, { field: 'Age', crit: `>=${d.minAge}` }])] };
    db = { ...db, reports: [report({ name: 'rptStudents', source: 'Query1', fields: d.head, group: 'Sex', sort: 'Surname' })] };
    return { ...st, db };
  },
  prec: PREC,
  explain: {
    q: 'What is a primary key and why did the database refuse the duplicate record? What do two criteria on the same row of a query mean?',
    guide: '2 marks: (1) a primary key identifies each record uniquely, so a repeated value is refused; (1) criteria on the same row must both be true (AND).',
    kw: [['unique', 'identif'], ['and', 'both', 'all']],
    need: 2,
  },
});

interface TableData {
  rows: string[][];
  head: string[];
  students: number;
  dupe: string[];
  badSex: string[];
  findNo: string;
}
const dbmsFields: CoField[] = [coField('AdmNo', 'TEXT', 6, true), coField('Surname', 'TEXT', 20), coField('FirstName', 'TEXT', 20), coField('DateOfBirth', 'DATE', 0), coField('Class', 'TEXT', 5), coField('Sex', 'TEXT', 1, false, '"M" Or "F"'), coField('Phone', 'TEXT', 11)];
const DPR_TABLE = coDef<TableData>({
  task: 'DPR_TABLE',
  family: 'DB',
  title: 'A table with suitable field types',
  apps: ['db'],
  make: (seed) => {
    const r = labRandom(seed, 'dpr-table');
    const head = dbmsFields.map((f) => f.name);
    const sur = coShuffle(r, CO_SURNAME);
    const rows = Array.from({ length: 5 }, (_, i) => [String(2001 + i), sur[i]!, labPick(r, ['Ada', 'Musa', 'Tolu', 'Grace', 'Sade', 'Femi']), `${2008 + i % 2}-0${1 + Math.floor(r() * 9)}-1${Math.floor(r() * 9)}`, labPick(r, ['SS3A', 'SS3B']), r() < 0.5 ? 'M' : 'F', `080${String(10000000 + Math.floor(r() * 89999999))}`]);
    return { head, rows, students: 1000 + 100 * Math.floor(r() * 6), dupe: [rows[1]![0]!, sur[6]!, 'Sani', '2008-02-11', 'SS3A', 'M', '08011112222'], badSex: ['2006', sur[7]!, 'Efe', '2008-03-12', 'SS3B', 'X', '08033334444'], findNo: rows[2]![0]! };
  },
  brief: (d) => [
    'Blank database: name it School.',
    'Design View, table STUDENTS: AdmNo (Short Text, 6), Surname (Short Text, 20), FirstName (Short Text, 20), DateOfBirth (Date/Time), Class (Short Text, 5), Sex (Short Text, 1), Phone (Short Text, 11).',
    'Make AdmNo the primary key; set the Validation Rule of Sex to "M" Or "F".',
    'Datasheet View: Paste records from the task card. Two of the seven are mistakes: read what the database says.',
    'Sort by Surname, ascending.',
    `Use Find to locate admission number ${d.findNo}.`,
    'Close the database and open it again; the records must still be there.',
    `Work out the storage for ${d.students} students.`,
  ],
  answers: (d) => {
    const b = 6 + 20 + 20 + 8 + 5 + 1 + 11;
    return [
      { id: 'bytes', label: 'Bytes per record (characters, date = 8)', value: b },
      { id: 'kb', label: `Storage for ${d.students} students (KB, 1 024 bytes = 1 KB)`, value: roundDp((b * d.students) / 1024, 1), tol: 0.06 },
      { id: 'phone', label: 'Data type that keeps a phone number\'s leading zero', value: 'Short Text', alt: ['text'] },
    ];
  },
  extra: (d) => ({ records: [{ table: 'STUDENTS', head: d.head, rows: [...d.rows.slice(0, 3), d.dupe, d.badSex, ...d.rows.slice(3)] }] }),
  start: (_, s) => s,
  checks: (d, st) => {
    const db = st.db;
    const tb = coTableOf(db, 'STUDENTS');
    const rows = toRows(d.head, d.rows);
    return [
      ck('procedure', 'file', 'Create the database School', named(db.file.replace(/\.accdb$/i, ''), 'School'), 'db'),
      ck('procedure', 'pk', 'Duplicate AdmNo refused by the primary key', db.refused.includes('PK'), 'db'),
      ck('procedure', 'rule', 'Sex X refused by the validation rule', db.refused.includes('RULE'), 'db'),
      ck('procedure', 'sort', 'Sort by Surname ascending', !!tb?.sort && named(tb.sort.field, 'Surname') && tb.sort.asc, 'db'),
      ck('procedure', 'find', `Find ${d.findNo}`, db.found.includes(d.findNo), 'db'),
      ck('procedure', 'reopen', 'Close the database and open it again', db.reopened > 0 && !db.closed, 'db', 'That proves it was saved.'),
      ck('product', 'design', 'Fields, types and sizes as the task card says, with AdmNo the key', hasFields(db, 'STUDENTS', dbmsFields), 'db'),
      ck('product', 'rule', 'Validation rule on Sex', /"?m"?\s+or\s+"?f"?/i.test(coFieldOf(tb, 'Sex')?.rule ?? ''), 'db'),
      ck('product', 'rows', 'The five good records', rowsMatch(db, 'STUDENTS', 'AdmNo', rows), 'db'),
      ck('product', 'zero', 'Phone numbers keep their leading zero', !!tb && tb.rows.length > 0 && tb.rows.every((r) => (r.Phone ?? '').startsWith('0')), 'db'),
    ];
  },
  model: (d, st) => {
    let db: CoDb = { ...st.db, file: 'School.accdb' };
    db = coDbAddTable(db, 'STUDENTS', dbmsFields);
    db = addAll(db, 'STUDENTS', toRows(d.head, d.rows));
    db = coDbAddRow(db, 'STUDENTS', toRows(d.head, [d.dupe])[0]!).db;
    db = coDbAddRow(db, 'STUDENTS', toRows(d.head, [d.badSex])[0]!).db;
    db = coDbSort(db, 'STUDENTS', 'Surname', true);
    db = { ...db, found: [d.findNo], reopened: 1 };
    return { ...st, db };
  },
  prec: PREC,
  explain: {
    q: 'Why is a phone number stored as text and not as a number, and what does a validation rule do?',
    guide: '2 marks: (1) it is never calculated with, and a number field would lose the leading zero; (1) a validation rule lets only allowed values into the field, so wrong data is refused at entry.',
    kw: [['leading zero', 'zero', 'not calculated', 'calculate'], ['allowed', 'refuse', 'reject', 'only', 'restrict', 'wrong data', 'invalid']],
    need: 2,
  },
});

interface RelData {
  students: string[][];
  payments: string[][];
  bad: string[];
  fee: number;
}
const relS: CoField[] = [coField('AdmNo', 'TEXT', 6, true), coField('Surname', 'TEXT', 20), coField('FirstName', 'TEXT', 20), coField('Class', 'TEXT', 5)];
const relP: CoField[] = [coField('ReceiptNo', 'TEXT', 6, true), coField('AdmNo', 'TEXT', 6), coField('Amount', 'CURRENCY', 0), coField('PayDate', 'DATE', 0)];
const relHeadS = relS.map((f) => f.name);
const relHeadP = relP.map((f) => f.name);
const paidBy = (d: RelData, no: string) => d.payments.filter((p) => p[1] === no).reduce((t, p) => t + Number(p[2]), 0);
const DPR_REL = coDef<RelData>({
  task: 'DPR_REL',
  family: 'DB',
  title: 'Linking tables: primary and foreign keys',
  apps: ['db'],
  make: (seed) => {
    const r = labRandom(seed, 'dpr-rel');
    const sur = coShuffle(r, CO_SURNAME).slice(0, 4);
    const fee = 45000;
    const students = sur.map((n, i) => [String(1001 + i), n, labPick(r, ['Ada', 'Musa', 'Tolu', 'Grace']), i % 2 ? 'SS3B' : 'SS3A']);
    const payments: string[][] = [];
    students.forEach((s, i) => {
      let left = fee - 5000 * Math.floor(r() * 5);
      if (i === 1) left = fee;
      const parts = i % 2 ? [left] : [Math.round(left * 0.6 / 5000) * 5000, left - Math.round(left * 0.6 / 5000) * 5000];
      parts.forEach((a) => payments.push([`R${String(payments.length + 1).padStart(2, '0')}`, s[0]!, String(a), `2026-0${1 + payments.length % 3}-1${payments.length}`]));
    });
    return { students, payments, bad: ['R99', '1009', '5000', '2026-03-01'], fee };
  },
  brief: (d) => [
    'Blank database School.',
    'STUDENTS: AdmNo (Short Text 6, primary key), Surname (20), FirstName (20), Class (5). Paste its records.',
    'PAYMENTS: ReceiptNo (Short Text 6, primary key), AdmNo (Short Text 6), Amount (Currency), PayDate (Date/Time). Paste its records.',
    'Relationships: link STUDENTS.AdmNo (one) to PAYMENTS.AdmNo (many), tick Enforce Referential Integrity.',
    'Try a payment for AdmNo 1009 (Add one record: R99, 1009, 5000, 2026-03-01) and read the error.',
    `Query qryFees on both tables with Totals: Surname Group By, Amount Sum, and a calculated field Outstanding: ${d.fee}-[SumOfAmount]. Run and save it.`,
  ],
  answers: (d) => {
    const paid = d.payments.reduce((t, p) => t + Number(p[2]), 0);
    return [
      { id: 'in', label: 'Total collected (₦)', value: paid },
      { id: 'out', label: 'Total outstanding (₦)', value: d.students.length * d.fee - paid },
      { id: 'one', label: `Outstanding for ${d.students[0]![1]} (₦)`, value: d.fee - paidBy(d, d.students[0]![0]!) },
      { id: 'many', label: 'Which table is on the many side?', value: 'PAYMENTS' },
    ];
  },
  extra: (d) => ({ records: [{ table: 'STUDENTS', head: relHeadS, rows: d.students }, { table: 'PAYMENTS', head: relHeadP, rows: d.payments }] }),
  start: (_, s) => s,
  checks: (d, st) => {
    const db = st.db;
    const rel = db.relations.find((x) => named(x.one, 'STUDENTS') && named(x.many, 'PAYMENTS'));
    const qr = findQ(db, 'qryFees');
    const res = qr ? coRunQuery(db, qr) : null;
    const iS = res?.cols.findIndex((c) => named(c, 'Surname')) ?? -1;
    const iO = res?.cols.findIndex((c) => named(c, 'Outstanding')) ?? -1;
    const iA = res?.cols.findIndex((c) => named(c, 'SumOfAmount')) ?? -1;
    const totalsOk = !!res && !res.error && res.rows.length === d.students.length && iS >= 0 && iA >= 0 && d.students.every((s) => res.rows.some((r) => named(String(r[iS]), s[1]!) && Number(r[iA]) === paidBy(d, s[0]!)));
    const outOk = !!res && totalsOk && iO >= 0 && d.students.every((s) => res.rows.some((r) => named(String(r[iS]), s[1]!) && Number(r[iO]) === d.fee - paidBy(d, s[0]!)));
    return [
      ck('procedure', 'file', 'Create the database School', named(db.file.replace(/\.accdb$/i, ''), 'School'), 'db'),
      ck('procedure', 'rel', 'Link AdmNo from STUDENTS to PAYMENTS', !!rel, 'db'),
      ck('procedure', 'enforce', 'Enforce referential integrity', !!rel?.enforce, 'db'),
      ck('procedure', 'fk', 'Try the payment for 1009: it is refused', db.refused.includes('FK'), 'db', 'There is no such student: integrity refuses orphan records.'),
      ck('procedure', 'run', 'Run and save the totals query', !!qr && qr.runs > 0, 'db'),
      ck('product', 'designs', 'Both designs, with primary keys', hasFields(db, 'STUDENTS', relS) && hasFields(db, 'PAYMENTS', relP), 'db'),
      ck('product', 'rows', 'The records of both tables', rowsMatch(db, 'STUDENTS', 'AdmNo', toRows(relHeadS, d.students)) && rowsMatch(db, 'PAYMENTS', 'ReceiptNo', toRows(relHeadP, d.payments)), 'db'),
      ck('product', 'orphan', 'No orphan payment in the table', !coTableOf(db, 'PAYMENTS')?.rows.some((r) => r.AdmNo === '1009'), 'db'),
      ck('product', 'totals', 'One row per student with the sum paid', totalsOk, 'db'),
      ck('product', 'calc', 'The calculated Outstanding field', outOk, 'db'),
    ];
  },
  model: (d, st) => {
    let db: CoDb = { ...st.db, file: 'School.accdb' };
    db = coDbAddTable(db, 'STUDENTS', relS);
    db = coDbAddTable(db, 'PAYMENTS', relP);
    db = addAll(db, 'STUDENTS', toRows(relHeadS, d.students));
    db = addAll(db, 'PAYMENTS', toRows(relHeadP, d.payments));
    db = coDbRelate(db, 'STUDENTS', 'PAYMENTS', 'AdmNo', true).db;
    db = coDbAddRow(db, 'PAYMENTS', toRows(relHeadP, [d.bad])[0]!).db;
    db = { ...db, queries: [q('qryFees', ['STUDENTS', 'PAYMENTS'], [{ field: 'Surname' }, { field: 'Amount', total: 'SUM' }, { field: `Outstanding: ${d.fee}-[SumOfAmount]`, total: 'EXPR' }], true)] };
    return { ...st, db };
  },
  prec: PREC,
  explain: {
    q: 'What is a foreign key, and what does referential integrity stop?',
    guide: '2 marks: (1) a field in one table that holds the primary key of another, linking them; (1) it stops a record pointing to something that does not exist, e.g. a payment for a student who is not in STUDENTS.',
    kw: [['primary key', 'another table', 'other table', 'link'], ['does not exist', 'non existent', 'no such', 'orphan', 'not in', 'refuse', 'invalid', 'stops']],
    need: 2,
  },
});

interface QData {
  rows: string[][];
  cls: string;
  other: string;
  min: number;
  lo: number;
  hi: number;
}
const resHead = ['AdmNo', 'Surname', 'Class', 'Score'];
const resFields: CoField[] = [coField('AdmNo', 'TEXT', 6, true), coField('Surname', 'TEXT', 20), coField('Class', 'TEXT', 5), coField('Score', 'NUMBER', 0)];
const resData = (seed: number, salt: string): QData => {
  const r = labRandom(seed, salt);
  const cls = 'SS3A';
  const other = 'SS3B';
  for (;;) {
    const names = coShuffle(r, CO_SURNAME).slice(0, 6);
    const scores = coShuffle(r, [48, 52, 55, 58, 61, 64, 67, 72, 75, 81, 86, 90]).slice(0, 6);
    const classes = [cls, other, cls, other, cls, cls];
    const rows = names.map((n, i) => [String(1001 + i), n, classes[i]!, String(scores[i])]);
    const min = labPick(r, [55, 60, 65]);
    const sorted = [...scores].sort((a, b) => a - b);
    const lo = sorted[1]! + 1;
    const hi = sorted[4]! - 1;
    const hit = rows.filter((x) => x[2] === cls && Number(x[3]) >= min);
    if (hit.length >= 2 && hit.length < 4 && lo < hi) return { rows, cls, other, min, lo, hi };
  }
};
const preload = (s: CompOfficeState, d: QData): CompOfficeState => {
  let db: CoDb = { ...s.db, file: 'School.accdb' };
  db = coDbAddTable(db, 'RESULTS', resFields);
  db = addAll(db, 'RESULTS', toRows(resHead, d.rows));
  return { ...s, db };
};
const stats = (d: QData, c: string) => {
  const xs = d.rows.filter((r) => r[2] === c).map((r) => Number(r[3]));
  return { n: xs.length, mean: xs.reduce((a, b) => a + b, 0) / xs.length };
};
const DPR_QUERY = coDef<QData>({
  task: 'DPR_QUERY',
  family: 'DB',
  title: 'Query by example and SQL',
  apps: ['db'],
  make: (seed) => resData(seed, 'dpr-query'),
  brief: (d) => [
    'School.accdb is open with the RESULTS table.',
    `Query Design on RESULTS: Surname, Class, Score. Criteria: Class "${d.cls}", Score >=${d.min}; Sort Score Descending. Run it, save as qryCredit.`,
    'Open SQL View and read the statement it built.',
    `SQL: run SELECT Class, COUNT(*) AS Students, AVG(Score) AS Mean FROM RESULTS GROUP BY Class;`,
    `New query qryOr: Surname and Score, Score <${d.lo} on Criteria and Score >${d.hi} on the or row. Run it and save it.`,
  ],
  answers: (d) => {
    const a = stats(d, d.cls);
    const b = stats(d, d.other);
    const list = d.rows.filter((r) => r[2] === d.cls && Number(r[3]) >= d.min).sort((x, y) => Number(y[3]) - Number(x[3]));
    return [
      { id: 'n', label: 'Records from qryCredit', value: list.length },
      { id: 'top', label: 'Who is first in qryCredit?', value: list[0]![1]! },
      { id: 'meanA', label: `Mean of ${d.cls}`, value: roundDp(a.mean, 2), tol: 0.011 },
      { id: 'meanB', label: `Mean of ${d.other}`, value: roundDp(b.mean, 2), tol: 0.011 },
      { id: 'or', label: 'Records from qryOr', value: d.rows.filter((r) => Number(r[3]) < d.lo || Number(r[3]) > d.hi).length },
    ];
  },
  start: (d, s) => preload(s, d),
  checks: (d, st) => {
    const db = st.db;
    const q1 = findQ(db, 'qryCredit');
    const res = q1 ? coRunQuery(db, q1) : null;
    const want = d.rows.filter((r) => r[2] === d.cls && Number(r[3]) >= d.min).sort((a, b) => Number(b[3]) - Number(a[3])).map((r) => r[1]!);
    const iS = res?.cols.findIndex((c) => named(c, 'Surname')) ?? -1;
    const q2 = findQ(db, 'qryOr');
    const orWant = d.rows.filter((r) => Number(r[3]) < d.lo || Number(r[3]) > d.hi).map((r) => r[1]!);
    const orGot = resultNames(db, q2, 'Surname');
    const sqlOk = db.sql.some((text) => {
      const r = coSqlRun(db, text);
      if (r.error || r.rows.length !== 2) return false;
      return [d.cls, d.other].every((c) => r.rows.some((row) => named(String(row[0]), c) && Number(row[1]) === stats(d, c).n && Math.abs(Number(row[2]) - stats(d, c).mean) < 0.01));
    });
    return [
      ck('procedure', 'run', 'Run the design query and save it as qryCredit', !!q1 && q1.runs > 0, 'db'),
      ck('procedure', 'sqlview', 'Open SQL View', db.sqlViews > 0, 'db', 'A QBE grid and SQL are two ways to write the same query.'),
      ck('procedure', 'sql', 'Run the SQL totals statement', sqlOk, 'db'),
      ck('procedure', 'or', 'Put the second condition on the or row', !!q2 && q2.cols.some((c) => !!c.crit.trim()) && q2.cols.some((c) => !!c.or.trim()) && q2.runs > 0, 'db', 'Same row = AND; different rows = OR.'),
      ck('product', 'data', 'RESULTS is unchanged', rowsMatch(db, 'RESULTS', 'AdmNo', toRows(resHead, d.rows)), 'db'),
      ck('product', 'credit', 'qryCredit returns the right records', !!res && !res.error && iS >= 0 && sameSet(col(res.rows, iS), want), 'db'),
      ck('product', 'order', 'qryCredit is sorted highest first', !!res && iS >= 0 && col(res.rows, iS).join('|').toLowerCase() === want.join('|').toLowerCase(), 'db'),
      ck('product', 'orq', 'qryOr returns the right records', !!orGot && sameSet(orGot, orWant), 'db'),
    ];
  },
  model: (d, st) => {
    let db = st.db;
    db = { ...db, queries: [q('qryCredit', ['RESULTS'], [{ field: 'Surname' }, { field: 'Class', crit: `"${d.cls}"` }, { field: 'Score', crit: `>=${d.min}`, sort: 'DESC' }]), q('qryOr', ['RESULTS'], [{ field: 'Surname' }, { field: 'Score', crit: `<${d.lo}`, or: `>${d.hi}` }])], sqlViews: 1, sql: ['SELECT Class, COUNT(*) AS Students, AVG(Score) AS Mean FROM RESULTS GROUP BY Class;'] };
    return { ...st, db };
  },
  prec: { guide: 'Two correct precautions, e.g. type criteria exactly as stored; check the query result against the table; save the query with a meaningful name; put AND conditions on one row and OR conditions on separate rows.', kw: [['criteria', 'exactly', 'spelling', 'quotation'], ['check', 'verify'], ['save', 'name'], ['same row', 'separate row', 'or row', 'and']] },
  explain: {
    q: 'How does a query show AND and OR, and why is a query called a dynamic view of the table?',
    guide: '2 marks: (1) conditions on the same Criteria row are AND, on different rows are OR; (1) the query stores the question, not the records, so if the table changes its result changes.',
    kw: [['same row', 'different row', 'separate row', 'or row'], ['changes', 'update', 'stores the question', 'not the records', 'dynamic', 'live']],
    need: 2,
  },
});

const DPR_FORMS = coDef<QData>({
  task: 'DPR_FORMS',
  family: 'DB',
  title: 'A data-entry form and a grouped report',
  apps: ['db'],
  make: (seed) => resData(seed, 'dpr-forms'),
  brief: () => [
    'School.accdb is open with the RESULTS table.',
    'Form Wizard on RESULTS: all fields, Columnar, name frmResults.',
    'Change the form title to Class Results.',
    'In Form View use the buttons to move between records, then add a test record (1007, Danladi, SS3B, 66) and delete it again.',
    'Report Wizard: Class, Surname, Score; group by Class; sort by Surname; tick Sum and Avg; Stepped; Portrait; name rptClassScores.',
    'Print Preview the report and read the group footers.',
  ],
  answers: (d) => {
    const a = stats(d, d.cls);
    const b = stats(d, d.other);
    const total = a.n * a.mean + b.n * b.mean;
    return [
      { id: 'sumA', label: `Sum of ${d.cls}`, value: a.n * a.mean },
      { id: 'avgB', label: `Average of ${d.other}`, value: roundDp(b.mean, 2), tol: 0.011 },
      { id: 'grand', label: 'Grand total', value: total },
      { id: 'all', label: 'Overall average', value: roundDp(total / (a.n + b.n), 2), tol: 0.011 },
    ];
  },
  start: (d, s) => preload(s, d),
  checks: (d, st) => {
    const db = st.db;
    const f = db.forms.find((x) => named(x.name, 'frmResults'));
    const r = db.reports.find((x) => named(x.name, 'rptClassScores'));
    const g = r ? coReportGroups(db, r) : null;
    return [
      ck('procedure', 'form', 'Form Wizard: all fields, Columnar, frmResults', !!f && f.layout === 'COLUMNAR' && resHead.every((h) => f.fields.includes(h)), 'db'),
      ck('procedure', 'add', 'Add the test record in Form View', !!f && f.added > 0, 'db'),
      ck('procedure', 'del', 'Delete the test record', !!f && f.deleted > 0, 'db'),
      ck('procedure', 'title', 'Change the form title', !!f && /class results/i.test(f.title), 'db'),
      ck('procedure', 'preview', 'Print Preview the report', !!r && r.previews > 0, 'db'),
      ck('product', 'data', 'RESULTS is back to the six records', rowsMatch(db, 'RESULTS', 'AdmNo', toRows(resHead, d.rows)), 'db'),
      ck('product', 'group', 'Report grouped by Class, sorted by Surname', !!r && named(r.group, 'Class') && named(r.sort, 'Surname'), 'db'),
      ck('product', 'summary', 'Sum and Avg ticked', !!r && r.sum && r.avg, 'db'),
      ck('product', 'layout', 'Stepped and Portrait', !!r && r.layout === 'STEPPED' && r.orient === 'PORTRAIT', 'db'),
      ck('product', 'footers', 'Each class has its subtotal of Score', !!g && g.measure === 'Score' && g.groups.length === 2, 'db'),
    ];
  },
  model: (_, st) => {
    let db = st.db;
    const f = { name: 'frmResults', table: 'RESULTS', fields: resHead, layout: 'COLUMNAR' as const, title: 'Class Results', added: 1, deleted: 1 };
    db = coDbAddRow(db, 'RESULTS', { AdmNo: '1007', Surname: 'Danladi', Class: 'SS3B', Score: '66' }).db;
    db = coDbDeleteRow(db, 'RESULTS', coTableOf(db, 'RESULTS')!.rows.length - 1);
    db = { ...db, forms: [f], reports: [report({ name: 'rptClassScores', source: 'RESULTS', fields: ['Class', 'Surname', 'Score'], group: 'Class', sort: 'Surname', sum: true, avg: true })] };
    return { ...st, db };
  },
  prec: { guide: 'Two correct precautions, e.g. use a form to reduce keying errors; delete test records; preview a report before printing; check group totals by hand.', kw: [['form'], ['test record', 'delete'], ['preview'], ['check', 'verify', 'hand'], ['save', 'backup']] },
  explain: {
    q: 'Why is a form better than a table for entering data, and what is a report for?',
    guide: '2 marks: (1) a form shows one record at a time with labelled boxes, so entry is easier and more accurate; (1) a report presents data for reading or printing, grouped and with totals; it does not change the data.',
    kw: [['one record', 'labelled', 'easier', 'accurate', 'friendly'], ['print', 'present', 'group', 'summar', 'total', 'output']],
    need: 2,
  },
});

export const CO_DB_DEFS: CoDef[] = [CST_DB, DPR_TABLE, DPR_REL, DPR_QUERY, DPR_FORMS];
export type { CoCheck, CoVariant };
void roundDp;
