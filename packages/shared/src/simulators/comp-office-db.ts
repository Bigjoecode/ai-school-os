import { coEvalOne, coIsErr } from './comp-office-formula';

/**
 * comp-office: a small relational database: table designs with data types,
 * primary keys and validation rules, records that are checked as a DBMS
 * checks them, relationships with referential integrity, a query-by-example
 * engine (AND on a row, OR across rows, totals, calculated fields), a small
 * SQL SELECT, forms and grouped reports.
 */

export const CO_FIELD_TYPES = ['TEXT', 'NUMBER', 'CURRENCY', 'DATE', 'YESNO'] as const;
export type CoFieldType = (typeof CO_FIELD_TYPES)[number];
export const CO_FIELD_TYPE_LABEL: Record<CoFieldType, string> = { TEXT: 'Short Text', NUMBER: 'Number', CURRENCY: 'Currency', DATE: 'Date/Time', YESNO: 'Yes/No' };

export interface CoField {
  name: string;
  type: CoFieldType;
  size: number;
  pk: boolean;
  /** Validation rule, e.g. "M" Or "F". */
  rule: string;
}
export interface CoTable {
  name: string;
  fields: CoField[];
  rows: Record<string, string>[];
  sort: { field: string; asc: boolean } | null;
}
export interface CoRelation {
  /** One side (primary key) and many side (foreign key). */
  one: string;
  many: string;
  field: string;
  enforce: boolean;
}
export type CoTotal = 'GROUP' | 'SUM' | 'AVG' | 'COUNT' | 'MAX' | 'MIN' | 'EXPR';
export interface CoQCol {
  /** A field, or a calculated field written Name: expression with [Field] references. */
  field: string;
  show: boolean;
  sort: 'NONE' | 'ASC' | 'DESC';
  crit: string;
  or: string;
  total: CoTotal;
}
export interface CoQuery {
  name: string;
  tables: string[];
  cols: CoQCol[];
  totals: boolean;
  runs: number;
}
export interface CoForm {
  name: string;
  table: string;
  fields: string[];
  layout: 'COLUMNAR' | 'TABULAR';
  title: string;
  /** Records added and deleted through the form. */
  added: number;
  deleted: number;
}
export interface CoReport {
  name: string;
  source: string;
  fields: string[];
  group: string;
  sort: string;
  sum: boolean;
  avg: boolean;
  layout: 'STEPPED' | 'BLOCK';
  orient: 'PORTRAIT' | 'LANDSCAPE';
  previews: number;
}
export interface CoDb {
  file: string;
  tables: CoTable[];
  relations: CoRelation[];
  queries: CoQuery[];
  forms: CoForm[];
  reports: CoReport[];
  /** Why the last records were refused ("PK", "RULE", "FK"): each kind once. */
  refused: string[];
  /** SQL statements run without error (last few). */
  sql: string[];
  /** Queries shown in SQL View. */
  sqlViews: number;
  /** Values found with Find. */
  found: string[];
  closed: boolean;
  reopened: number;
}
export const coEmptyDb = (): CoDb => ({ file: '', tables: [], relations: [], queries: [], forms: [], reports: [], refused: [], sql: [], sqlViews: 0, found: [], closed: false, reopened: 0 });
export const coField = (name: string, type: CoFieldType = 'TEXT', size = 50, pk = false, rule = ''): CoField => ({ name, type, size, pk, rule });
export const coTableOf = (db: CoDb, name: string) => db.tables.find((t) => t.name.toLowerCase() === name.toLowerCase());
export const coFieldOf = (t: CoTable | undefined, name: string) => t?.fields.find((f) => f.name.toLowerCase() === name.toLowerCase());

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const num = (s: string) => {
  const t = s.trim().replace(/,/g, '');
  const x = t === '' ? NaN : Number(t);
  return Number.isFinite(x) ? x : null;
};
const unquote = (s: string) => s.trim().replace(/^["']|["']$/g, '');

/** One criterion against a value: "SS3", >=60, <>5, Between 1 And 5, Like "A*", Not X, A Or B. */
export function coCritMatch(crit: string, value: string): boolean {
  const c = crit.trim();
  if (!c) return true;
  const or = c.split(/\s+or\s+/i);
  if (or.length > 1) return or.some((x) => coCritMatch(x, value));
  const between = /^between\s+(.+?)\s+and\s+(.+)$/i.exec(c);
  if (between) {
    const v = num(value);
    const lo = num(unquote(between[1]!));
    const hi = num(unquote(between[2]!));
    return v !== null && lo !== null && hi !== null && v >= lo && v <= hi;
  }
  const like = /^like\s+(.+)$/i.exec(c);
  if (like) {
    const re = new RegExp(`^${unquote(like[1]!).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')}$`, 'i');
    return re.test(value);
  }
  const not = /^not\s+(.+)$/i.exec(c);
  if (not) return !coCritMatch(not[1]!, value);
  const m = /^(<=|>=|<>|<|>|=)\s*(.*)$/.exec(c);
  const op = m ? m[1]! : '=';
  const right = unquote(m ? m[2]! : c);
  const a = num(value);
  const b = num(right);
  if (a !== null && b !== null) return op === '=' ? a === b : op === '<>' ? a !== b : op === '<' ? a < b : op === '>' ? a > b : op === '<=' ? a <= b : a >= b;
  const r = value.trim().toLowerCase().localeCompare(right.toLowerCase());
  return op === '=' ? r === 0 : op === '<>' ? r !== 0 : op === '<' ? r < 0 : op === '>' ? r > 0 : op === '<=' ? r <= 0 : r >= 0;
}

/** Why a record can't be stored, or null. Mirrors what Access says. */
export function coRowProblem(db: CoDb, t: CoTable, row: Record<string, string>, editing = -1): { kind: 'PK' | 'RULE' | 'TYPE' | 'FK' | 'SIZE'; text: string } | null {
  for (const f of t.fields) {
    const v = (row[f.name] ?? '').trim();
    if (f.pk && !v) return { kind: 'PK', text: `The primary key ${f.name} cannot be empty.` };
    if (!v) continue;
    if ((f.type === 'NUMBER' || f.type === 'CURRENCY') && num(v) === null) return { kind: 'TYPE', text: `${v} is not a number, so it can't go in ${f.name}.` };
    if (f.type === 'DATE' && !/^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(v)) return { kind: 'TYPE', text: `${v} is not a date.` };
    if (f.type === 'TEXT' && f.size > 0 && v.length > f.size) return { kind: 'SIZE', text: `${f.name} takes at most ${f.size} characters.` };
    if (f.rule && !coCritMatch(f.rule, v)) return { kind: 'RULE', text: `${v} breaks the validation rule of ${f.name}: ${f.rule}.` };
  }
  const key = t.fields.filter((f) => f.pk);
  if (key.length && t.rows.some((r, i) => i !== editing && key.every((f) => same(r[f.name] ?? '', row[f.name] ?? '')))) return { kind: 'PK', text: `A record with this ${key.map((f) => f.name).join(' + ')} already exists: a primary key must be unique.` };
  for (const rel of db.relations) {
    if (!rel.enforce || !same(rel.many, t.name)) continue;
    const v = (row[rel.field] ?? '').trim();
    if (v && !coTableOf(db, rel.one)?.rows.some((r) => same(r[rel.field] ?? '', v))) return { kind: 'FK', text: `There is no ${rel.one} record with ${rel.field} ${v}: referential integrity refuses it.` };
  }
  return null;
}
const refuse = (db: CoDb, kind: string): CoDb => (db.refused.includes(kind) ? db : { ...db, refused: [...db.refused, kind].slice(-6) });
const upd = (db: CoDb, name: string, fn: (t: CoTable) => CoTable): CoDb => ({ ...db, tables: db.tables.map((t) => (same(t.name, name) ? fn(t) : t)) });

export const coDbAddTable = (db: CoDb, name: string, fields: CoField[]): CoDb => (coTableOf(db, name) ? upd(db, name, (t) => ({ ...t, fields })) : { ...db, tables: [...db.tables, { name, fields, rows: [], sort: null }] });
export const coDbSetFields = (db: CoDb, name: string, fields: CoField[]): CoDb => upd(db, name, (t) => ({ ...t, fields }));
export function coDbAddRow(db: CoDb, name: string, row: Record<string, string>): { db: CoDb; error: string | null } {
  const t = coTableOf(db, name);
  if (!t) return { db, error: 'No such table.' };
  const p = coRowProblem(db, t, row);
  if (p) return { db: refuse(db, p.kind), error: p.text };
  return { db: upd(db, name, (x) => ({ ...x, rows: [...x.rows, row] })), error: null };
}
export function coDbEditRow(db: CoDb, name: string, i: number, row: Record<string, string>): { db: CoDb; error: string | null } {
  const t = coTableOf(db, name);
  if (!t) return { db, error: 'No such table.' };
  const p = coRowProblem(db, t, row, i);
  if (p) return { db: refuse(db, p.kind), error: p.text };
  return { db: upd(db, name, (x) => ({ ...x, rows: x.rows.map((r, k) => (k === i ? row : r)) })), error: null };
}
export const coDbDeleteRow = (db: CoDb, name: string, i: number): CoDb => upd(db, name, (t) => ({ ...t, rows: t.rows.filter((_, k) => k !== i) }));
export const coDbSort = (db: CoDb, name: string, field: string, asc: boolean): CoDb => upd(db, name, (t) => ({ ...t, sort: { field, asc } }));
/** A table's rows as the datasheet shows them. */
export function coSortedRows(t: CoTable): Record<string, string>[] {
  if (!t.sort) return t.rows;
  const { field, asc } = t.sort;
  return [...t.rows].sort((a, b) => {
    const x = a[field] ?? '';
    const y = b[field] ?? '';
    const p = num(x);
    const q = num(y);
    const c = p !== null && q !== null ? p - q : x.localeCompare(y, 'en', { sensitivity: 'base' });
    return asc ? c : -c;
  });
}
export function coDbRelate(db: CoDb, one: string, many: string, field: string, enforce: boolean): { db: CoDb; error: string | null } {
  const o = coTableOf(db, one);
  const m = coTableOf(db, many);
  if (!o || !m) return { db, error: 'Add both tables first.' };
  if (!coFieldOf(o, field)?.pk) return { db, error: `${field} must be the primary key of ${one}: the one side of a relationship is a primary key.` };
  const f = coFieldOf(m, field);
  if (!f) return { db, error: `${many} has no field ${field}.` };
  if (f.type !== coFieldOf(o, field)!.type) return { db, error: `${field} must have the same data type in both tables.` };
  if (enforce && m.rows.some((r) => r[f.name] && !o.rows.some((x) => same(x[field] ?? '', r[f.name]!)))) return { db, error: `Some ${many} records have a ${field} that is not in ${one}, so integrity can't be enforced yet.` };
  return { db: { ...db, relations: [...db.relations.filter((r) => !(same(r.one, one) && same(r.many, many))), { one: o.name, many: m.name, field: f.name, enforce }] }, error: null };
}

// ------------------------------------------------------------------ query by example

export const coColDefault = (field = ''): CoQCol => ({ field, show: true, sort: 'NONE', crit: '', or: '', total: 'GROUP' });
export const coQueryDefault = (name: string, tables: string[]): CoQuery => ({ name, tables, cols: [], totals: false, runs: 0 });
export interface CoResult {
  cols: string[];
  rows: (string | number)[][];
  error?: string;
}
/** The joined rows of the query's tables: an inner join along their relationship, or on a field they share. */
function joined(db: CoDb, names: string[]): { rows: Record<string, string>[]; error?: string } {
  const ts = names.map((n) => coTableOf(db, n)).filter((t): t is CoTable => !!t);
  if (!ts.length) return { rows: [], error: 'Add a table to the query.' };
  let rows = ts[0]!.rows.map((r) => ({ ...r }));
  for (const t of ts.slice(1)) {
    const seen = new Set(Object.keys(rows[0] ?? {}));
    const prev = ts.slice(0, ts.indexOf(t));
    const rel = db.relations.find((r) => (same(r.one, t.name) && prev.some((x) => same(x.name, r.many))) || (same(r.many, t.name) && prev.some((x) => same(x.name, r.one))));
    const key = rel?.field ?? t.fields.find((f) => prev.some((x) => coFieldOf(x, f.name)))?.name;
    if (!key) return { rows: [], error: `${t.name} is not linked to the other table.` };
    void seen;
    const next: Record<string, string>[] = [];
    for (const a of rows) for (const b of t.rows) if (same(a[key] ?? '', b[key] ?? '')) next.push({ ...b, ...a });
    rows = next;
  }
  return { rows };
}
const aliasOf = (c: CoQCol) => /^([^:]+):/.exec(c.field)?.[1]?.trim();
const defaultName = (c: CoQCol) => {
  const a = aliasOf(c);
  if (a) return a;
  const f = c.field.trim();
  return c.total === 'SUM' ? `SumOf${f}` : c.total === 'AVG' ? `AvgOf${f}` : c.total === 'COUNT' ? `CountOf${f}` : c.total === 'MAX' ? `MaxOf${f}` : c.total === 'MIN' ? `MinOf${f}` : f;
};
function calc(expr: string, row: Record<string, string | number>): string | number {
  const f = `=${expr.replace(/\[([^\]]+)\]/g, (_, k: string) => {
    const hit = Object.keys(row).find((x) => same(x, k));
    return hit !== undefined ? String(row[hit] ?? 0) : 'XX';
  })}`;
  const v = coEvalOne(f);
  return coIsErr(v) || v === null ? '#Error' : typeof v === 'boolean' ? String(v) : v;
}
const fix = (x: number) => Number(x.toPrecision(12));

/** Runs a query from the design grid. */
export function coRunQuery(db: CoDb, q: CoQuery): CoResult {
  const j = joined(db, q.tables);
  if (j.error) return { cols: [], rows: [], error: j.error };
  const cols = q.cols.filter((c) => c.field.trim());
  if (!cols.length) return { cols: [], rows: [], error: 'Add a field to the grid.' };
  const fieldsAll = new Set(q.tables.flatMap((n) => coTableOf(db, n)?.fields.map((f) => f.name.toLowerCase()) ?? []));
  for (const c of cols) if (!aliasOf(c) && c.total !== 'EXPR' && !fieldsAll.has(c.field.trim().toLowerCase())) return { cols: [], rows: [], error: `No field called ${c.field.trim()}.` };
  const test = (r: Record<string, string>, k: 'crit' | 'or') => cols.every((c) => !c[k].trim() || aliasOf(c) || coCritMatch(c[k], r[Object.keys(r).find((x) => same(x, c.field)) ?? ''] ?? ''));
  const anyOr = cols.some((c) => c.or.trim());
  const rows = j.rows.filter((r) => test(r, 'crit') || (anyOr && test(r, 'or')));
  const key = (r: Record<string, string>, f: string) => r[Object.keys(r).find((x) => same(x, f)) ?? ''] ?? '';
  let out: Record<string, string | number>[];
  if (q.totals) {
    const groups = new Map<string, Record<string, string>[]>();
    const by = cols.filter((c) => c.total === 'GROUP' && !aliasOf(c));
    for (const r of rows) {
      const k = by.map((c) => key(r, c.field)).join('');
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    out = [...groups.values()].map((g) => {
      const o: Record<string, string | number> = {};
      for (const c of cols) {
        if (aliasOf(c)) continue;
        const name = defaultName(c);
        const xs = g.map((r) => num(key(r, c.field))).filter((x): x is number => x !== null);
        if (c.total === 'GROUP') o[name] = key(g[0]!, c.field);
        else if (c.total === 'COUNT') o[name] = g.length;
        else if (c.total === 'SUM') o[name] = fix(xs.reduce((a, b) => a + b, 0));
        else if (c.total === 'AVG') o[name] = xs.length ? fix(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
        else if (c.total === 'MAX') o[name] = xs.length ? Math.max(...xs) : 0;
        else if (c.total === 'MIN') o[name] = xs.length ? Math.min(...xs) : 0;
      }
      for (const c of cols) if (aliasOf(c)) o[aliasOf(c)!] = calc(c.field.slice(c.field.indexOf(':') + 1), o);
      return o;
    });
  } else
    out = rows.map((r) => {
      const o: Record<string, string | number> = {};
      for (const c of cols) {
        if (aliasOf(c)) o[aliasOf(c)!] = calc(c.field.slice(c.field.indexOf(':') + 1), r);
        else o[c.field.trim()] = key(r, c.field);
      }
      return o;
    });
  for (const c of [...cols].reverse()) {
    if (c.sort === 'NONE') continue;
    const n = defaultName(c);
    const dir = c.sort === 'ASC' ? 1 : -1;
    out = [...out].sort((a, b) => {
      const p = a[n] ?? '';
      const q2 = b[n] ?? '';
      return dir * (typeof p === 'number' && typeof q2 === 'number' ? p - q2 : num(String(p)) !== null && num(String(q2)) !== null ? num(String(p))! - num(String(q2))! : String(p).localeCompare(String(q2)));
    });
  }
  const shown = cols.filter((c) => c.show).map(defaultName);
  return { cols: shown, rows: out.map((o) => shown.map((n) => o[n] ?? '')) };
}

/** The SQL a design grid stands for (SQL View). */
export function coQuerySql(q: CoQuery): string {
  const cols = q.cols.filter((c) => c.field.trim());
  const item = (c: CoQCol) => {
    const a = aliasOf(c);
    if (a) return `${c.field.slice(c.field.indexOf(':') + 1).trim()} AS ${a}`;
    if (!q.totals || c.total === 'GROUP') return c.field.trim();
    return `${c.total}(${c.field.trim()}) AS ${defaultName(c)}`;
  };
  const lit = (c: CoQCol, raw: string) => {
    const t = raw.trim();
    if (/^(<=|>=|<>|<|>|=)/.test(t)) return `${c.field.trim()} ${t}`;
    return `${c.field.trim()} = ${num(t) !== null ? t : `'${unquote(t)}'`}`;
  };
  const and = (k: 'crit' | 'or') => cols.filter((c) => c[k].trim() && !aliasOf(c)).map((c) => lit(c, c[k]));
  const a = and('crit');
  const o = and('or');
  const where = [a, o].filter((x) => x.length).map((x) => x.join(' AND '));
  const group = q.totals ? cols.filter((c) => c.total === 'GROUP' && !aliasOf(c)).map((c) => c.field.trim()) : [];
  const order = cols.filter((c) => c.sort !== 'NONE').map((c) => `${defaultName(c)}${c.sort === 'DESC' ? ' DESC' : ''}`);
  return `SELECT ${cols.filter((c) => c.show).map(item).join(', ')}\nFROM ${q.tables.join(', ')}${where.length ? `\nWHERE ${where.length > 1 ? where.map((x) => `(${x})`).join(' OR ') : where[0]}` : ''}${group.length ? `\nGROUP BY ${group.join(', ')}` : ''}${order.length ? `\nORDER BY ${order.join(', ')}` : ''};`;
}

// ------------------------------------------------------------------ SQL

/** Runs one SELECT: fields, COUNT(*), SUM, AVG, MAX, MIN with AS, WHERE with AND/OR, GROUP BY, ORDER BY. */
export function coSqlRun(db: CoDb, text: string): CoResult {
  const bad = (error: string): CoResult => ({ cols: [], rows: [], error });
  const sql = text.trim().replace(/;+\s*$/, '').replace(/\s+/g, ' ');
  const m = /^select (.+?) from (.+?)(?: where (.+?))?(?: group by (.+?))?(?: order by (.+?))?$/i.exec(sql);
  if (!m) return bad('Syntax error: expected SELECT fields FROM table.');
  const [, select, from, where, group, order] = m;
  const names = from!.split(',').map((x) => x.trim());
  const miss = names.find((n) => !coTableOf(db, n));
  if (miss) return bad(`No table called ${miss}.`);
  const j = joined(db, names);
  if (j.error) return bad(j.error);
  const fields = new Set(names.flatMap((n) => coTableOf(db, n)!.fields.map((f) => f.name.toLowerCase())));
  const allFields = names.flatMap((n) => coTableOf(db, n)!.fields.map((f) => f.name));
  const get = (r: Record<string, string>, f: string) => r[Object.keys(r).find((x) => same(x, f)) ?? ''] ?? '';

  // WHERE: OR of ANDs of field op literal.
  let rows = j.rows;
  if (where) {
    const orParts = where.split(/\s+or\s+/i).map((p) =>
      p
        .replace(/^\(|\)$/g, '')
        .split(/\s+and\s+/i)
        .map((c) => /^\(?\s*([A-Za-z_]\w*)\s*(<=|>=|<>|!=|<|>|=)\s*(.+?)\)?$/.exec(c.trim())),
    );
    if (orParts.flat().some((x) => !x)) return bad('Syntax error in WHERE.');
    for (const c of orParts.flat()) if (!fields.has(c![1]!.toLowerCase())) return bad(`No field called ${c![1]}.`);
    rows = rows.filter((r) => orParts.some((and) => and.every((c) => coCritMatch(`${c![2] === '!=' ? '<>' : c![2]}${c![3]}`, get(r, c![1]!)))));
  }
  // SELECT items.
  const items = select!.split(',').map((s) => {
    const a = /^(.+?)\s+as\s+([A-Za-z_]\w*)$/i.exec(s.trim());
    const e = (a ? a[1]! : s).trim();
    const fn = /^(count|sum|avg|max|min)\s*\(\s*(\*|[A-Za-z_]\w*)\s*\)$/i.exec(e);
    return { e, alias: a?.[2], fn: fn?.[1]?.toUpperCase(), arg: fn?.[2] };
  });
  const expanded = items.flatMap((it) => (it.e === '*' ? allFields.map((f) => ({ e: f, alias: undefined, fn: undefined, arg: undefined })) : [it]));
  for (const it of expanded) {
    if (it.fn ? it.arg !== '*' && !fields.has(it.arg!.toLowerCase()) : !fields.has(it.e.toLowerCase())) return bad(`No field called ${it.fn ? it.arg : it.e}.`);
  }
  const groupBy = group?.split(',').map((x) => x.trim()) ?? [];
  for (const g of groupBy) if (!fields.has(g.toLowerCase())) return bad(`No field called ${g}.`);
  const aggregate = expanded.some((x) => x.fn);
  if (aggregate) for (const it of expanded) if (!it.fn && !groupBy.some((g) => same(g, it.e))) return bad(`${it.e} must be in GROUP BY.`);
  const label = (it: (typeof expanded)[number]) => it.alias ?? (it.fn ? `${it.fn}(${it.arg})` : it.e);
  const cols = expanded.map(label);
  let out: Record<string, string | number>[];
  if (aggregate) {
    const g = new Map<string, Record<string, string>[]>();
    for (const r of rows) {
      const k = groupBy.map((f) => get(r, f)).join('');
      g.set(k, [...(g.get(k) ?? []), r]);
    }
    out = [...g.values()].map((list) =>
      Object.fromEntries(
        expanded.map((it) => {
          if (!it.fn) return [label(it), get(list[0]!, it.e)];
          const xs = list.map((r) => num(get(r, it.arg!))).filter((x): x is number => x !== null);
          const v = it.fn === 'COUNT' ? (it.arg === '*' ? list.length : xs.length) : it.fn === 'SUM' ? xs.reduce((a, b) => a + b, 0) : it.fn === 'AVG' ? xs.reduce((a, b) => a + b, 0) / (xs.length || 1) : it.fn === 'MAX' ? Math.max(...xs) : Math.min(...xs);
          return [label(it), fix(v)];
        }),
      ),
    );
  } else out = rows.map((r) => Object.fromEntries([...allFields.map((f) => [f, get(r, f)]), ...expanded.map((it) => [label(it), get(r, it.e)])]));
  for (const o of (order?.split(',') ?? []).reverse()) {
    const p = /^\s*([A-Za-z_]\w*)(?:\s+(asc|desc))?\s*$/i.exec(o);
    if (!p) return bad('Syntax error in ORDER BY.');
    const dir = p[2]?.toLowerCase() === 'desc' ? -1 : 1;
    const n = Object.keys(out[0] ?? {}).find((x) => same(x, p[1]!)) ?? p[1]!;
    out = [...out].sort((a, b) => {
      const x = a[n] ?? '';
      const y = b[n] ?? '';
      const u = num(String(x));
      const w = num(String(y));
      return dir * (u !== null && w !== null ? u - w : String(x).localeCompare(String(y)));
    });
  }
  return { cols, rows: out.map((o) => cols.map((c) => o[c] ?? '')) };
}

// ------------------------------------------------------------------ reports

export interface CoReportGroup {
  key: string;
  rows: Record<string, string>[];
  sum: number;
  avg: number;
}
/** A report's groups with their subtotals on the first numeric field listed. */
export function coReportGroups(db: CoDb, r: CoReport): { groups: CoReportGroup[]; total: number; avg: number; measure: string } {
  const q = db.queries.find((x) => same(x.name, r.source));
  let rows: Record<string, string>[] = [];
  if (q) {
    const res = coRunQuery(db, q);
    rows = res.rows.map((x) => Object.fromEntries(res.cols.map((c, i) => [c, String(x[i] ?? '')])));
  } else rows = coTableOf(db, r.source)?.rows ?? [];
  const t = coTableOf(db, r.source) ?? (q ? coTableOf(db, q.tables[0] ?? '') : undefined);
  const measure = r.fields.find((f) => ['NUMBER', 'CURRENCY'].includes(coFieldOf(t, f)?.type ?? '')) ?? '';
  const keys = [...new Set(rows.map((x) => x[r.group] ?? ''))].sort();
  const groups = keys.map((key) => {
    const list = rows.filter((x) => (x[r.group] ?? '') === key).sort((a, b) => (a[r.sort] ?? '').localeCompare(b[r.sort] ?? ''));
    const xs = list.map((x) => num(x[measure] ?? '') ?? 0);
    const sum = xs.reduce((a, b) => a + b, 0);
    return { key, rows: list, sum, avg: xs.length ? sum / xs.length : 0 };
  });
  const all = rows.map((x) => num(x[measure] ?? '') ?? 0);
  const total = all.reduce((a, b) => a + b, 0);
  return { groups, total, avg: all.length ? total / all.length : 0, measure };
}
/** Bytes per record from the design (text = size, integer 2, date 8, currency 8). */
export const coRecordBytes = (fields: CoField[]) => fields.reduce((t, f) => t + (f.type === 'TEXT' ? f.size : f.type === 'NUMBER' ? 2 : f.type === 'YESNO' ? 1 : 8), 0);
