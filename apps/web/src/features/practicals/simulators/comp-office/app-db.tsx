import {
  CO_FIELD_TYPES,
  CO_FIELD_TYPE_LABEL,
  coColDefault,
  coDbAddRow,
  coDbAddTable,
  coDbDeleteRow,
  coDbRelate,
  coDbSetFields,
  coDbSort,
  coField,
  coQueryDefault,
  coQuerySql,
  coReportGroups,
  coRunQuery,
  coSortedRows,
  coSqlRun,
  coTableOf,
  type CoDb,
  type CoField,
  type CoForm,
  type CoQCol,
  type CoQuery,
  type CoReport,
  type CoResult,
  type CoTotal,
} from '@aischool/shared';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { Office } from './actions';
import { Lbl, Note, Pri, Sec, Tb, Tools, inputCls } from './ui';

/** A desktop database: navigation pane, Design View, Datasheet, Relationships, Query Design with SQL View, Form and Report wizards. */

type View = { k: 'design' | 'data'; t: string } | { k: 'query'; q: string } | { k: 'rel' } | { k: 'form'; f: string } | { k: 'report'; r: string } | { k: 'none' };

export function DbApp({ o }: { o: Office }) {
  const db = o.s.db;
  const ro = o.readOnly;
  const set = (fn: (x: CoDb) => CoDb, log?: string) => o.set('db', fn, log);
  const [view, setView] = useState<View>(db.tables[0] ? { k: 'data', t: db.tables[0].name } : { k: 'none' });
  const [newName, setNewName] = useState('School');
  const [newTable, setNewTable] = useState('');
  if (!db.file)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-100 p-4 text-slate-800" onKeyDown={(e) => e.stopPropagation()}>
        <p className="text-[14px] font-semibold">Blank database</p>
        <Lbl text="File name"><input aria-label="Database name" className={inputCls} value={newName} onChange={(e) => setNewName(e.target.value)} /></Lbl>
        <Pri aria-label="Create database" disabled={ro || !newName.trim()} onClick={() => set((x) => ({ ...x, file: `${newName.trim().replace(/\.accdb$/i, '')}.accdb` }), 'db:create')}>Create</Pri>
      </div>
    );
  if (db.closed)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-100 p-4 text-slate-800">
        <p className="text-[13px] font-semibold">Database closed</p>
        <Pri aria-label="Open database" disabled={ro} onClick={() => set((x) => ({ ...x, closed: false, reopened: x.reopened + 1 }), 'db:reopen')}>Open {db.file}</Pri>
      </div>
    );
  const item = (active: boolean, label: string, onClick: () => void, aria?: string) => (
    <button key={aria ?? label} type="button" aria-label={aria ?? label} onClick={onClick} className={cn('shrink-0 truncate rounded px-1.5 py-1 text-left text-[12px] hover:bg-slate-200 sm:w-full', active && 'bg-blue-100 font-semibold')}>
      {label}
    </button>
  );
  const head = (t: string) => <p className="hidden pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 sm:block">{t}</p>;
  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-slate-900 sm:flex-row" onKeyDown={(e) => e.stopPropagation()}>
      <nav aria-label="Navigation pane" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-300 bg-slate-100 p-1 sm:w-40 sm:flex-col sm:gap-0 sm:overflow-y-auto sm:border-b-0 sm:border-r">
        {head('Tables')}
        {db.tables.map((t) => item((view.k === 'data' || view.k === 'design') && view.t === t.name, t.name, () => setView({ k: 'data', t: t.name }), `Open table ${t.name}`))}
        {!ro && (
          <div className="flex shrink-0 gap-0.5 sm:mt-0.5">
            <input aria-label="New table name" className="h-7 w-20 rounded border border-slate-300 px-1 text-[12px] sm:w-full" placeholder="New table" value={newTable} onChange={(e) => setNewTable(e.target.value.toUpperCase())} />
            <Tb className="h-7" aria-label="Create table" disabled={!newTable.trim()} onClick={() => { const n = newTable.trim(); set((x) => coDbAddTable(x, n, [coField('', 'TEXT', 50)]), `db:table:${n}`); setView({ k: 'design', t: n }); setNewTable(''); }}>+</Tb>
          </div>
        )}
        {head('Queries')}
        {db.queries.map((q) => item(view.k === 'query' && view.q === q.name, q.name, () => setView({ k: 'query', q: q.name }), `Open query ${q.name}`))}
        {!ro && item(false, 'New query', () => { const name = `Query${db.queries.length + 1}`; set((x) => ({ ...x, queries: [...x.queries, coQueryDefault(name, x.tables[0] ? [x.tables[0].name] : [])] }), 'db:newquery'); setView({ k: 'query', q: name }); }, 'New query')}
        {head('Forms')}
        {db.forms.map((f) => item(view.k === 'form' && view.f === f.name, f.name, () => setView({ k: 'form', f: f.name }), `Open form ${f.name}`))}
        {!ro && item(false, 'Form Wizard', () => { const name = 'frmNew'; set((x) => (x.forms.some((f) => f.name === name) ? x : { ...x, forms: [...x.forms, { name, table: x.tables[0]?.name ?? '', fields: [], layout: 'COLUMNAR', title: '', added: 0, deleted: 0 }] }), 'db:newform'); setView({ k: 'form', f: name }); }, 'Form Wizard')}
        {head('Reports')}
        {db.reports.map((r) => item(view.k === 'report' && view.r === r.name, r.name, () => setView({ k: 'report', r: r.name }), `Open report ${r.name}`))}
        {!ro && item(false, 'Report Wizard', () => { const name = 'rptNew'; set((x) => (x.reports.some((r) => r.name === name) ? x : { ...x, reports: [...x.reports, { name, source: x.queries[0]?.name ?? x.tables[0]?.name ?? '', fields: [], group: '', sort: '', sum: false, avg: false, layout: 'STEPPED', orient: 'PORTRAIT', previews: 0 }] }), 'db:newreport'); setView({ k: 'report', r: name }); }, 'Report Wizard')}
        {head('Tools')}
        {item(view.k === 'rel', 'Relationships', () => setView({ k: 'rel' }))}
        {!ro && item(false, 'Close database', () => set((x) => ({ ...x, closed: true }), 'db:close'), 'Close database')}
      </nav>
      <div className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
        {view.k === 'none' && <p className="p-4 text-[13px] text-slate-600">Type a table name in the navigation pane and press +, or open what is there.</p>}
        {(view.k === 'design' || view.k === 'data') && coTableOf(db, view.t) && <TableView o={o} name={view.t} mode={view.k} setMode={(k) => setView({ k, t: view.t })} />}
        {view.k === 'rel' && <Rel o={o} />}
        {view.k === 'query' && db.queries.find((q) => q.name === view.q) && <QueryView o={o} name={view.q} rename={(q) => setView({ k: 'query', q })} />}
        {view.k === 'form' && db.forms.find((f) => f.name === view.f) && <FormView o={o} name={view.f} rename={(f) => setView({ k: 'form', f })} />}
        {view.k === 'report' && db.reports.find((r) => r.name === view.r) && <ReportView o={o} name={view.r} rename={(r) => setView({ k: 'report', r })} />}
      </div>
    </div>
  );
}

function TableView({ o, name, mode, setMode }: { o: Office; name: string; mode: 'design' | 'data'; setMode: (k: 'design' | 'data') => void }) {
  const db = o.s.db;
  const ro = o.readOnly;
  const t = coTableOf(db, name)!;
  const set = (fn: (x: CoDb) => CoDb, log?: string) => o.set('db', fn, log);
  const [row, setRow] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ t: 'bad' | 'good'; x: string }[]>([]);
  const [find, setFind] = useState('');
  const fields = (fs: CoField[]) => set((x) => coDbSetFields(x, name, fs));
  const pasted = o.v.records?.find((r) => r.table === name);
  const paste = () => {
    if (!pasted) return;
    const out: { t: 'bad' | 'good'; x: string }[] = [];
    o.set(
      'db',
      (x) => {
        let d = x;
        for (const r of pasted.rows) {
          const res = coDbAddRow(d, name, Object.fromEntries(pasted.head.map((h, i) => [h, r[i] ?? ''])));
          d = res.db;
          if (res.error) out.push({ t: 'bad', x: `${r[0]}: ${res.error}` });
        }
        return d;
      },
      `db:paste:${name}`,
    );
    setMsg([...out, { t: 'good', x: `${pasted.rows.length - out.length} of ${pasted.rows.length} records saved.` }]);
  };
  const add = () => {
    const res = coDbAddRow(db, name, row);
    o.set('db', () => res.db, `db:add:${name}`);
    setMsg(res.error ? [{ t: 'bad', x: res.error }] : []);
    if (!res.error) setRow({});
  };
  const shown = coSortedRows(t);
  return (
    <div>
      <Tools>
        <Tb on={mode === 'data'} aria-label="Datasheet View" onClick={() => setMode('data')}>Datasheet View</Tb>
        <Tb on={mode === 'design'} aria-label="Design View" onClick={() => setMode('design')}>Design View</Tb>
        {!ro && mode === 'data' && pasted && <Tb aria-label={`Paste records into ${name}`} onClick={paste}>Paste records from the task card</Tb>}
        {!ro && mode === 'data' && t.sort && <Tb aria-label="Clear sort" onClick={() => set((x) => ({ ...x, tables: x.tables.map((y) => (y.name === name ? { ...y, sort: null } : y)) }), 'db:unsort')}>Clear sort</Tb>}
        {mode === 'data' && (
          <>
            <input aria-label="Find" className="h-8 w-28 shrink-0 rounded border border-slate-300 px-1 text-[12px]" placeholder="Find" value={find} onChange={(e) => setFind(e.target.value)} />
            <Tb aria-label="Find next" disabled={ro || !find.trim()} onClick={() => { const hit = t.rows.some((r) => Object.values(r).some((v) => v.toLowerCase() === find.trim().toLowerCase())); setMsg([{ t: hit ? 'good' : 'bad', x: hit ? `Found ${find.trim()}.` : `${find.trim()} was not found.` }]); if (hit) set((x) => ({ ...x, found: [...x.found.filter((f) => f !== find.trim()), find.trim()].slice(-8) }), 'db:find'); }}>Find</Tb>
          </>
        )}
      </Tools>
      {msg.length > 0 && <div className="space-y-0.5 p-1">{msg.map((m) => <Note key={m.x} tone={m.t}>{m.x}</Note>)}</div>}
      {mode === 'design' ? (
        <div className="space-y-1 p-2">
          <p className="text-[12.5px] font-semibold">{name}: Design View</p>
          {t.fields.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr] gap-1 rounded border border-slate-200 p-1 sm:grid-cols-[1.4fr_1fr_64px_auto_1fr_auto]">
              <input aria-label={`Field ${i + 1} name`} readOnly={ro} className={inputCls} placeholder="Field name" value={f.name} onChange={(e) => fields(t.fields.map((g, k) => (k === i ? { ...g, name: e.target.value.replace(/\s/g, '') } : g)))} />
              <select aria-label={`Field ${i + 1} type`} disabled={ro} className={inputCls} value={f.type} onChange={(e) => fields(t.fields.map((g, k) => (k === i ? { ...g, type: e.target.value as CoField['type'] } : g)))}>
                {CO_FIELD_TYPES.map((x) => <option key={x} value={x}>{CO_FIELD_TYPE_LABEL[x]}</option>)}
              </select>
              <input aria-label={`Field ${i + 1} size`} readOnly={ro} disabled={f.type !== 'TEXT'} className={inputCls} inputMode="numeric" value={f.type === 'TEXT' ? f.size : ''} onChange={(e) => fields(t.fields.map((g, k) => (k === i ? { ...g, size: Math.min(255, Number(e.target.value) || 0) } : g)))} />
              <Tb className="h-9" aria-label={`Field ${i + 1} primary key`} on={f.pk} disabled={ro} onClick={() => fields(t.fields.map((g, k) => (k === i ? { ...g, pk: !g.pk } : { ...g, pk: false })))}>Key</Tb>
              <input aria-label={`Field ${i + 1} validation rule`} readOnly={ro} className={inputCls} placeholder="Validation rule" value={f.rule} onChange={(e) => fields(t.fields.map((g, k) => (k === i ? { ...g, rule: e.target.value } : g)))} />
              {!ro && <Tb className="h-9" aria-label={`Delete field ${i + 1}`} onClick={() => fields(t.fields.filter((_, k) => k !== i))}>✕</Tb>}
            </div>
          ))}
          {!ro && <Sec aria-label="Add field" onClick={() => fields([...t.fields, coField('', 'TEXT', 50)])}>Add field</Sec>}
        </div>
      ) : (
        <div className="overflow-x-auto p-1">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-slate-200">
                {t.fields.map((f) => (
                  <th key={f.name} scope="col" className="whitespace-nowrap border border-slate-300 px-1 py-1 text-left font-medium">
                    {f.pk ? '🔑 ' : ''}{f.name}
                    {!ro && (
                      <>
                        <button type="button" aria-label={`Sort ${f.name} ascending`} className="ml-1 px-0.5" onClick={() => set((x) => coDbSort(x, name, f.name, true), `db:sort:${f.name}`)}>↑</button>
                        <button type="button" aria-label={`Sort ${f.name} descending`} className="px-0.5" onClick={() => set((x) => coDbSort(x, name, f.name, false), `db:sort:${f.name}`)}>↓</button>
                      </>
                    )}
                  </th>
                ))}
                <th className="border border-slate-300" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  {t.fields.map((f) => <td key={f.name} className="whitespace-nowrap border border-slate-200 px-1 py-1">{r[f.name]}</td>)}
                  <td className="border border-slate-200 text-center">
                    {!ro && <button type="button" aria-label={`Delete record ${i + 1}`} className="px-1 text-slate-500" onClick={() => set((x) => coDbDeleteRow(x, name, t.rows.indexOf(r)), `db:del:${name}`)}>✕</button>}
                  </td>
                </tr>
              ))}
              {!ro && (
                <tr>
                  {t.fields.map((f) => (
                    <td key={f.name} className="border border-slate-200 p-0.5">
                      <input aria-label={`New ${f.name}`} className="h-8 w-full min-w-[70px] rounded border border-slate-300 px-1 text-[12.5px]" value={row[f.name] ?? ''} onChange={(e) => setRow({ ...row, [f.name]: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
                    </td>
                  ))}
                  <td className="border border-slate-200 p-0.5"><Tb aria-label="Add record" onClick={add}>Add</Tb></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Rel({ o }: { o: Office }) {
  const db = o.s.db;
  const [one, setOne] = useState(db.tables[0]?.name ?? '');
  const [many, setMany] = useState(db.tables[1]?.name ?? '');
  const [field, setField] = useState('AdmNo');
  const [enforce, setEnforce] = useState(false);
  const [err, setErr] = useState('');
  const names = db.tables.map((t) => t.name);
  const go = () => {
    const r = coDbRelate(db, one, many, field, enforce);
    setErr(r.error ?? '');
    if (!r.error) o.set('db', () => r.db, 'db:relate');
  };
  return (
    <div className="space-y-2 p-2 text-[13px]">
      <p className="font-semibold">Relationships</p>
      {!o.readOnly && (
        <div className="grid gap-2 sm:grid-cols-3">
          <Lbl text="One side (primary key)"><select aria-label="One side table" className={inputCls} value={one} onChange={(e) => setOne(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select></Lbl>
          <Lbl text="Many side (foreign key)"><select aria-label="Many side table" className={inputCls} value={many} onChange={(e) => setMany(e.target.value)}>{names.map((n) => <option key={n}>{n}</option>)}</select></Lbl>
          <Lbl text="Field"><input aria-label="Relationship field" className={inputCls} value={field} onChange={(e) => setField(e.target.value)} /></Lbl>
        </div>
      )}
      {!o.readOnly && (
        <>
          <label className="flex items-center gap-2"><input type="checkbox" aria-label="Enforce Referential Integrity" checked={enforce} onChange={(e) => setEnforce(e.target.checked)} /> Enforce Referential Integrity</label>
          <Pri aria-label="Create relationship" onClick={go}>Create</Pri>
        </>
      )}
      {err && <Note tone="bad">{err}</Note>}
      {db.relations.map((r) => (
        <p key={r.one + r.many} className="rounded border border-slate-300 bg-slate-50 p-2 font-mono text-[12.5px]">{r.one}.{r.field} 1 ─── ∞ {r.many}.{r.field}{r.enforce ? ' (integrity enforced)' : ''}</p>
      ))}
    </div>
  );
}

const ResultTable = ({ r }: { r: CoResult }) =>
  r.error ? (
    <Note tone="bad">{r.error}</Note>
  ) : (
    <div className="overflow-x-auto">
      <table className="border-collapse text-[12.5px]" aria-label="Query result">
        <thead><tr className="bg-slate-200">{r.cols.map((c) => <th key={c} scope="col" className="border border-slate-300 px-1.5 py-1 text-left font-medium">{c}</th>)}</tr></thead>
        <tbody>{r.rows.map((row, i) => <tr key={i}>{row.map((x, j) => <td key={j} className="border border-slate-200 px-1.5 py-1">{String(x)}</td>)}</tr>)}</tbody>
      </table>
      <p className="mt-1 text-[12px] text-slate-600">{r.rows.length} record{r.rows.length === 1 ? '' : 's'}</p>
    </div>
  );

function QueryView({ o, name, rename }: { o: Office; name: string; rename: (n: string) => void }) {
  const db = o.s.db;
  const ro = o.readOnly;
  const q = db.queries.find((x) => x.name === name)!;
  const up = (fn: (x: CoQuery) => CoQuery, log?: string) => o.set('db', (d) => ({ ...d, queries: d.queries.map((x) => (x.name === name ? fn(x) : x)) }), log);
  const col = (i: number, patch: Partial<CoQCol>) => up((x) => ({ ...x, cols: x.cols.map((c, k) => (k === i ? { ...c, ...patch } : c)) }));
  const [result, setResult] = useState<CoResult | null>(null);
  const [saveAs, setSaveAs] = useState(name);
  const [sqlOpen, setSqlOpen] = useState(false);
  const [sql, setSql] = useState('');
  const [sqlRes, setSqlRes] = useState<CoResult | null>(null);
  const fields = q.tables.flatMap((t) => coTableOf(db, t)?.fields.map((f) => f.name) ?? []);
  const uniq = [...new Set(fields)];
  const run = () => {
    setResult(coRunQuery(db, q));
    up((x) => ({ ...x, runs: x.runs + 1 }), 'db:run');
  };
  return (
    <div className="space-y-2 p-2 text-[13px]">
      {!ro && (
        <div className="flex flex-wrap items-end gap-1">
          {db.tables.map((t) => (
            <label key={t.name} className="flex items-center gap-1 rounded border border-slate-300 px-1.5 py-1 text-[12px]">
              <input type="checkbox" aria-label={`Use table ${t.name}`} checked={q.tables.includes(t.name)} onChange={(e) => up((x) => ({ ...x, tables: e.target.checked ? [...x.tables, t.name] : x.tables.filter((n) => n !== t.name) }))} /> {t.name}
            </label>
          ))}
          <label className="flex items-center gap-1 rounded border border-slate-300 px-1.5 py-1 text-[12px]">
            <input type="checkbox" aria-label="Totals" checked={q.totals} onChange={(e) => up((x) => ({ ...x, totals: e.target.checked }))} /> Totals
          </label>
          <Tb className="h-8" aria-label="Add column" onClick={() => up((x) => ({ ...x, cols: [...x.cols, coColDefault(uniq[x.cols.length] ?? '')] }))}>Add field</Tb>
        </div>
      )}
      <div className="flex gap-1 overflow-x-auto pb-1">
        <div className="hidden shrink-0 space-y-1 pt-1 text-[11.5px] text-slate-500 sm:block" aria-hidden>
          <p className="h-8 leading-8">Field</p>{q.totals && <p className="h-8 leading-8">Total</p>}<p className="h-8 leading-8">Sort</p><p className="h-6 leading-6">Show</p><p className="h-8 leading-8">Criteria</p><p className="h-8 leading-8">or</p>
        </div>
        {q.cols.map((c, i) => (
          <div key={i} className="w-40 shrink-0 space-y-1 rounded border border-slate-200 p-1">
            <input aria-label={`Column ${i + 1} field`} list="co-fields" readOnly={ro} className="h-8 w-full rounded border border-slate-300 px-1 text-[12.5px]" value={c.field} onChange={(e) => col(i, { field: e.target.value })} />
            {q.totals && (
              <select aria-label={`Column ${i + 1} total`} disabled={ro} className="h-8 w-full rounded border border-slate-300 text-[12px]" value={c.total} onChange={(e) => col(i, { total: e.target.value as CoTotal })}>
                {(['GROUP', 'SUM', 'AVG', 'COUNT', 'MAX', 'MIN', 'EXPR'] as const).map((t) => <option key={t} value={t}>{t === 'GROUP' ? 'Group By' : t === 'EXPR' ? 'Expression' : t}</option>)}
              </select>
            )}
            <select aria-label={`Column ${i + 1} sort`} disabled={ro} className="h-8 w-full rounded border border-slate-300 text-[12px]" value={c.sort} onChange={(e) => col(i, { sort: e.target.value as CoQCol['sort'] })}>
              <option value="NONE">Sort: none</option><option value="ASC">Ascending</option><option value="DESC">Descending</option>
            </select>
            <label className="flex h-6 items-center gap-1 text-[12px]"><input type="checkbox" aria-label={`Column ${i + 1} show`} disabled={ro} checked={c.show} onChange={(e) => col(i, { show: e.target.checked })} /> Show</label>
            <input aria-label={`Column ${i + 1} criteria`} readOnly={ro} placeholder="Criteria" className="h-8 w-full rounded border border-slate-300 px-1 text-[12.5px]" value={c.crit} onChange={(e) => col(i, { crit: e.target.value })} />
            <input aria-label={`Column ${i + 1} or`} readOnly={ro} placeholder="or" className="h-8 w-full rounded border border-slate-300 px-1 text-[12.5px]" value={c.or} onChange={(e) => col(i, { or: e.target.value })} />
          </div>
        ))}
        <datalist id="co-fields">{uniq.map((f) => <option key={f} value={f} />)}</datalist>
      </div>
      {!ro && (
        <div className="flex flex-wrap items-center gap-1">
          <Pri aria-label="Run query" onClick={run}>Run !</Pri>
          <input aria-label="Query name" className="h-9 w-36 rounded border border-slate-300 px-1 text-[13px]" value={saveAs} onChange={(e) => setSaveAs(e.target.value.replace(/\s/g, ''))} />
          <Sec aria-label="Save query" disabled={!saveAs || (saveAs !== name && db.queries.some((x) => x.name === saveAs))} onClick={() => { up((x) => ({ ...x, name: saveAs }), `db:savequery:${saveAs}`); rename(saveAs); }}>Save</Sec>
          <Sec aria-label="SQL View" onClick={() => { if (!sqlOpen) o.set('db', (d) => ({ ...d, sqlViews: d.sqlViews + 1 }), 'db:sqlview'); setSqlOpen(!sqlOpen); }}>SQL View</Sec>
        </div>
      )}
      {sqlOpen && (
        <div className="space-y-1 rounded border border-slate-300 bg-slate-50 p-2">
          <pre className="whitespace-pre-wrap font-mono text-[12px]" aria-label="SQL of this query">{coQuerySql(q)}</pre>
          <textarea aria-label="SQL statement" rows={3} spellCheck={false} className="w-full rounded border border-slate-300 p-1 font-mono text-[12.5px]" value={sql} onChange={(e) => setSql(e.target.value)} placeholder="SELECT …" />
          <Sec aria-label="Run SQL" onClick={() => { const r = coSqlRun(db, sql); setSqlRes(r); if (!r.error) o.set('db', (d) => ({ ...d, sql: [...d.sql, sql.slice(0, 480)].slice(-8) }), 'db:sql'); }}>Run SQL</Sec>
          {sqlRes && <ResultTable r={sqlRes} />}
        </div>
      )}
      {result && <ResultTable r={result} />}
    </div>
  );
}

function FormView({ o, name, rename }: { o: Office; name: string; rename: (n: string) => void }) {
  const db = o.s.db;
  const ro = o.readOnly;
  const f = db.forms.find((x) => x.name === name)!;
  const up = (fn: (x: CoForm) => CoForm, log?: string) => o.set('db', (d) => ({ ...d, forms: d.forms.map((x) => (x.name === name ? fn(x) : x)) }), log);
  const t = coTableOf(db, f.table);
  const [i, setI] = useState(0);
  const [fresh, setFresh] = useState<Record<string, string> | null>(null);
  const [err, setErr] = useState('');
  const [saveAs, setSaveAs] = useState(name);
  const rec = fresh ?? t?.rows[Math.min(i, (t?.rows.length ?? 1) - 1)] ?? {};
  return (
    <div className="space-y-2 p-2 text-[13px]">
      {!ro && (
        <div className="grid gap-1 rounded border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2">
          <Lbl text="Table"><select aria-label="Form table" className={inputCls} value={f.table} onChange={(e) => up((x) => ({ ...x, table: e.target.value }))}>{db.tables.map((n) => <option key={n.name}>{n.name}</option>)}</select></Lbl>
          <Lbl text="Layout"><select aria-label="Form layout" className={inputCls} value={f.layout} onChange={(e) => up((x) => ({ ...x, layout: e.target.value as 'COLUMNAR' }))}><option value="COLUMNAR">Columnar</option><option value="TABULAR">Tabular</option></select></Lbl>
          <Sec aria-label="Add all fields" onClick={() => up((x) => ({ ...x, fields: t?.fields.map((y) => y.name) ?? [] }), 'db:formfields')}>Add all fields ({f.fields.length})</Sec>
          <div className="flex gap-1">
            <input aria-label="Form name" className={inputCls} value={saveAs} onChange={(e) => setSaveAs(e.target.value.replace(/\s/g, ''))} />
            <Sec aria-label="Save form" disabled={!saveAs} onClick={() => { up((x) => ({ ...x, name: saveAs }), 'db:saveform'); rename(saveAs); }}>Save</Sec>
          </div>
          <Lbl text="Form title (Layout View)"><input aria-label="Form title" className={inputCls} value={f.title} onChange={(e) => up((x) => ({ ...x, title: e.target.value.slice(0, 80) }))} /></Lbl>
        </div>
      )}
      <div className="rounded border border-slate-300 p-2">
        <p className="mb-1 font-semibold">{f.title || name}</p>
        {f.fields.map((k) => (
          <label key={k} className="mb-1 grid grid-cols-[96px_1fr] items-center gap-1 text-[12.5px]">
            {k}
            <input aria-label={`Form field ${k}`} readOnly={!fresh} className={inputCls} value={rec[k] ?? ''} onChange={(e) => setFresh({ ...fresh, [k]: e.target.value })} />
          </label>
        ))}
        {!ro && (
          <div className="flex flex-wrap items-center gap-1">
            <Tb aria-label="Previous record" onClick={() => (setFresh(null), setI(Math.max(0, i - 1)))}>◀</Tb>
            <span className="text-[12px]">Record {Math.min(i + 1, t?.rows.length ?? 0)} of {t?.rows.length ?? 0}</span>
            <Tb aria-label="Next record" onClick={() => (setFresh(null), setI(Math.min((t?.rows.length ?? 1) - 1, i + 1)))}>▶</Tb>
            {!fresh ? (
              <Tb aria-label="New blank record" onClick={() => setFresh({})}>New record</Tb>
            ) : (
              <Tb aria-label="Save record" onClick={() => { const r = coDbAddRow(db, f.table, fresh); setErr(r.error ?? ''); if (!r.error) { o.set('db', () => ({ ...r.db, forms: r.db.forms.map((x) => (x.name === name ? { ...x, added: x.added + 1 } : x)) }), 'db:formadd'); setFresh(null); setI((t?.rows.length ?? 0)); } }}>Save record</Tb>
            )}
            <Tb aria-label="Delete this record" disabled={!!fresh} onClick={() => { o.set('db', (d) => ({ ...coDbDeleteRow(d, f.table, Math.min(i, (t?.rows.length ?? 1) - 1)), forms: d.forms.map((x) => (x.name === name ? { ...x, deleted: x.deleted + 1 } : x)) }), 'db:formdel'); setI(Math.max(0, i - 1)); }}>Delete record</Tb>
          </div>
        )}
        {err && <Note tone="bad">{err}</Note>}
      </div>
    </div>
  );
}

function ReportView({ o, name, rename }: { o: Office; name: string; rename: (n: string) => void }) {
  const db = o.s.db;
  const ro = o.readOnly;
  const r = db.reports.find((x) => x.name === name)!;
  const up = (fn: (x: CoReport) => CoReport, log?: string) => o.set('db', (d) => ({ ...d, reports: d.reports.map((x) => (x.name === name ? fn(x) : x)) }), log);
  const [show, setShow] = useState(false);
  const [saveAs, setSaveAs] = useState(name);
  const sources = [...db.tables.map((t) => t.name), ...db.queries.map((q) => q.name)];
  const src = coTableOf(db, r.source);
  const q = db.queries.find((x) => x.name === r.source);
  const choose = src?.fields.map((f) => f.name) ?? (q ? coRunQuery(db, q).cols : []);
  const g = coReportGroups(db, r);
  return (
    <div className="space-y-2 p-2 text-[13px]">
      {!ro && (
        <div className="grid gap-1 rounded border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2">
          <Lbl text="Table or query"><select aria-label="Report source" className={inputCls} value={r.source} onChange={(e) => up((x) => ({ ...x, source: e.target.value }))}>{sources.map((n) => <option key={n}>{n}</option>)}</select></Lbl>
          <div>
            <p className="text-[12px] text-slate-600">Fields</p>
            <div className="flex flex-wrap gap-1">
              {choose.map((f) => <Tb key={f} on={r.fields.includes(f)} aria-label={`Report field ${f}`} onClick={() => up((x) => ({ ...x, fields: x.fields.includes(f) ? x.fields.filter((y) => y !== f) : [...x.fields, f] }))}>{f}</Tb>)}
            </div>
          </div>
          <Lbl text="Group by"><select aria-label="Group by" className={inputCls} value={r.group} onChange={(e) => up((x) => ({ ...x, group: e.target.value }))}><option value="">None</option>{r.fields.map((f) => <option key={f}>{f}</option>)}</select></Lbl>
          <Lbl text="Sort by"><select aria-label="Report sort" className={inputCls} value={r.sort} onChange={(e) => up((x) => ({ ...x, sort: e.target.value }))}><option value="">None</option>{r.fields.map((f) => <option key={f}>{f}</option>)}</select></Lbl>
          <div className="flex items-center gap-3 text-[12.5px]">
            <label className="flex items-center gap-1"><input type="checkbox" aria-label="Sum" checked={r.sum} onChange={(e) => up((x) => ({ ...x, sum: e.target.checked }))} /> Sum</label>
            <label className="flex items-center gap-1"><input type="checkbox" aria-label="Avg" checked={r.avg} onChange={(e) => up((x) => ({ ...x, avg: e.target.checked }))} /> Avg</label>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <select aria-label="Report layout" className={inputCls} value={r.layout} onChange={(e) => up((x) => ({ ...x, layout: e.target.value as 'STEPPED' }))}><option value="STEPPED">Stepped</option><option value="BLOCK">Block</option></select>
            <select aria-label="Report orientation" className={inputCls} value={r.orient} onChange={(e) => up((x) => ({ ...x, orient: e.target.value as 'PORTRAIT' }))}><option value="PORTRAIT">Portrait</option><option value="LANDSCAPE">Landscape</option></select>
          </div>
          <div className="flex gap-1">
            <input aria-label="Report name" className={inputCls} value={saveAs} onChange={(e) => setSaveAs(e.target.value.replace(/\s/g, ''))} />
            <Sec aria-label="Save report" disabled={!saveAs} onClick={() => { up((x) => ({ ...x, name: saveAs }), 'db:savereport'); rename(saveAs); }}>Save</Sec>
          </div>
          <Pri aria-label="Print Preview report" onClick={() => { up((x) => ({ ...x, previews: x.previews + 1 }), 'db:preview'); setShow(true); }}>Print Preview</Pri>
        </div>
      )}
      {(show || ro) && (
        <div className="rounded border border-slate-300 bg-white p-2 text-[12.5px]" aria-label="Report preview">
          <p className="font-semibold">{name}</p>
          {g.groups.map((x) => (
            <div key={x.key} className="mt-1">
              <p className="font-semibold">{r.group}: {x.key || '(blank)'}</p>
              <table className="ml-3"><tbody>{x.rows.map((row, i) => <tr key={i}>{r.fields.filter((f) => f !== r.group).map((f) => <td key={f} className="pr-3">{row[f]}</td>)}</tr>)}</tbody></table>
              {g.measure && (r.sum || r.avg) && <p className="ml-3 border-t border-slate-300 text-slate-700">{r.sum ? `Sum ${x.sum}` : ''} {r.avg ? `Avg ${Number(x.avg.toFixed(2))}` : ''}</p>}
            </div>
          ))}
          {g.measure && (r.sum || r.avg) && <p className="mt-1 border-t-2 border-slate-500 font-semibold">Grand {r.sum ? `Sum ${g.total}` : ''} {r.avg ? `Avg ${Number(g.avg.toFixed(2))}` : ''}</p>}
        </div>
      )}
    </div>
  );
}
