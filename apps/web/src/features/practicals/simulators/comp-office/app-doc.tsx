import {
  CO_FIELD,
  CO_FONTS,
  CO_SIZES,
  CO_SPACINGS,
  coAddPara,
  coAddTableRow,
  coDeletePara,
  coDocClose,
  coDocOpen,
  coDocPreview,
  coDocPrint,
  coDocSave,
  coDocText,
  coFormatParas,
  coInsertPicture,
  coInsertTable,
  coMergeText,
  coReplaceAll,
  coSetParaText,
  coSetTableCell,
  coSizePicture,
  coSourceRecords,
  coTableShown,
  coUpdateFields,
  type CoAlign,
  type CoDoc,
  type CoPara,
} from '@aischool/shared';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Office } from './actions';
import { Lbl, Modal, Note, Pri, Sec, Tabs, Tb, Tools, inputCls } from './ui';

/** A word processor: paragraphs with formatting state, page set-up, a table with fields, a picture, the spelling check, Find and Replace, Save As, print and mail merge. */

type Tab = 'home' | 'layout' | 'insert' | 'review' | 'mail' | 'file';
const FONT_CSS: Record<string, string> = { Calibri: 'Calibri, Carlito, sans-serif', 'Times New Roman': '"Times New Roman", Tinos, serif', Arial: 'Arial, Arimo, sans-serif', Cambria: 'Cambria, Caladea, serif', 'Comic Sans MS': '"Comic Sans MS", cursive' };
const ALIGN: Record<CoAlign, 'left' | 'center' | 'right' | 'justify'> = { L: 'left', C: 'center', R: 'right', J: 'justify' };
const ptToPx = (pt: number) => pt * 1.08;

function ParaBox({ p, ro, selected, active, onFocus, onToggle, onChange, onEnter, onEmptyBack, bind }: { p: CoPara; ro: boolean; selected: boolean; active: boolean; onFocus: () => void; onToggle: () => void; onChange: (t: string) => void; onEnter: () => void; onEmptyBack: () => void; bind: (el: HTMLTextAreaElement | null) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  });
  return (
    <div className={cn('group relative flex gap-1 rounded', selected && 'bg-blue-100')}>
      {!ro && (
        <button type="button" aria-label={`Select paragraph ${p.text.slice(0, 24)}`} aria-pressed={selected} onClick={onToggle} className={cn('mt-0.5 size-5 shrink-0 rounded border text-[10px]', selected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 text-transparent')}>
          ✓
        </button>
      )}
      {p.bullet && <span className="pl-1" style={{ fontSize: ptToPx(p.size) }}>•</span>}
      <textarea
        ref={(el) => {
          ref.current = el;
          bind(el);
        }}
        aria-label={`Paragraph: ${p.text.slice(0, 30)}`}
        rows={1}
        value={p.text}
        readOnly={ro}
        onFocus={onFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.preventDefault(), onEnter());
          else if (e.key === 'Backspace' && !p.text) (e.preventDefault(), onEmptyBack());
        }}
        className={cn('min-w-0 flex-1 resize-none overflow-hidden bg-transparent outline-none', active && 'ring-1 ring-blue-300')}
        style={{ fontFamily: FONT_CSS[p.font] ?? p.font, fontSize: ptToPx(p.size), fontWeight: p.b ? 700 : 400, fontStyle: p.i ? 'italic' : 'normal', textDecoration: p.u ? 'underline' : 'none', textAlign: ALIGN[p.align], lineHeight: p.spacing * 1.25 }}
      />
    </div>
  );
}

export function DocApp({ o }: { o: Office }) {
  const d = o.s.doc;
  const ro = o.readOnly;
  const set = (fn: (x: CoDoc) => CoDoc, log?: string) => o.set('doc', fn, log);
  const [tab, setTab] = useState<Tab>('home');
  const [sel, setSel] = useState<string[]>([]);
  const [active, setActive] = useState(d.paras[0]?.id ?? '');
  const [dialog, setDialog] = useState<null | 'save' | 'page' | 'find' | 'spell' | 'table' | 'print' | 'merge'>(null);
  const [mergeAt, setMergeAt] = useState(-1);
  const boxes = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const records = useMemo(() => coSourceRecords(o.s.sheet), [o.s.sheet]);
  const fields = useMemo(() => (records[0] ? Object.keys(records[0]) : []), [records]);
  const target = sel.length ? sel : active ? [active] : [];
  const cur = d.paras.find((p) => p.id === target[0]);
  const fmt = (patch: Partial<CoPara>, log: string) => set((x) => coFormatParas(x, target, patch), `doc:${log}`);
  const toggle = (id: string) => setSel((x) => (x.includes(id) ? x.filter((y) => y !== id) : [...x, id]));
  const insertField = (name: string) => {
    const el = boxes.current[active];
    const para = d.paras.find((p) => p.id === active);
    if (!para) return;
    const at = el?.selectionStart ?? para.text.length;
    const to = el?.selectionEnd ?? at;
    const token = CO_FIELD(name);
    set((x) => coSetParaText(x, active, para.text.slice(0, at) + token + para.text.slice(to)), `doc:field:${name}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + token.length, at + token.length);
    });
  };
  const preview = mergeAt >= 0 && records[mergeAt];
  if (!d.open)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 bg-slate-100 p-4 text-slate-800">
        <p className="text-[13px] font-semibold">No document open</p>
        <p className="text-[12px] text-slate-600">Recent: {d.saved?.folder}\{d.saved?.name}</p>
        <Pri aria-label="Open recent" disabled={ro} onClick={() => set(coDocOpen, 'doc:reopen')}>Open from Recent</Pri>
      </div>
    );
  const pageW = d.page.orient === 'PORTRAIT' ? 21 : 29.7;
  const pad = (cm: number) => `${(cm / pageW) * 100}%`;
  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white text-slate-900" onKeyDown={(e) => e.stopPropagation()}>
      {!ro && <Tabs<Tab> tabs={[{ id: 'home', label: 'Home' }, { id: 'layout', label: 'Layout' }, { id: 'insert', label: 'Insert' }, { id: 'review', label: 'Review' }, { id: 'mail', label: 'Mailings' }, { id: 'file', label: 'File' }]} value={tab} onChange={setTab} />}
      {!ro && tab === 'home' && (
        <Tools>
          <select aria-label="Font" className="h-8 rounded border border-slate-200 text-[12px]" value={cur?.font ?? ''} onChange={(e) => fmt({ font: e.target.value }, 'font')}>
            {CO_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select aria-label="Font size" className="h-8 rounded border border-slate-200 text-[12px]" value={cur?.size ?? 11} onChange={(e) => fmt({ size: Number(e.target.value) }, 'size')}>
            {CO_SIZES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <Tb aria-label="Bold" className="font-bold" on={!!cur?.b} onClick={() => fmt({ b: !cur?.b }, 'bold')}>B</Tb>
          <Tb aria-label="Italic" className="italic" on={!!cur?.i} onClick={() => fmt({ i: !cur?.i }, 'italic')}>I</Tb>
          <Tb aria-label="Underline" className="underline" on={!!cur?.u} onClick={() => fmt({ u: !cur?.u }, 'underline')}>U</Tb>
          {(['L', 'C', 'R', 'J'] as const).map((a) => (
            <Tb key={a} aria-label={`Align ${ALIGN[a]}`} on={cur?.align === a} onClick={() => fmt({ align: a }, `align:${a}`)}>{a === 'L' ? 'Left' : a === 'C' ? 'Centre' : a === 'R' ? 'Right' : 'Justify'}</Tb>
          ))}
          <select aria-label="Line spacing" className="h-8 rounded border border-slate-200 text-[12px]" value={cur?.spacing ?? 1} onChange={(e) => fmt({ spacing: Number(e.target.value) }, 'spacing')}>
            {CO_SPACINGS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <Tb aria-label="Bullets" on={!!cur?.bullet} onClick={() => fmt({ bullet: !cur?.bullet }, 'bullets')}>Bullets</Tb>
          <Tb aria-label="Select all" onClick={() => setSel(d.paras.map((p) => p.id))}>Select all</Tb>
          <Tb aria-label="Clear selection" onClick={() => setSel([])}>Clear selection</Tb>
        </Tools>
      )}
      {!ro && tab === 'layout' && (
        <Tools>
          <Tb aria-label="Page setup" onClick={() => setDialog('page')}>Size, orientation, margins</Tb>
          <Tb aria-label="Page border" on={d.border} onClick={() => set((x) => ({ ...x, border: !x.border }), 'doc:border')}>Page border</Tb>
        </Tools>
      )}
      {!ro && tab === 'insert' && (
        <Tools>
          <Tb aria-label="Insert table" disabled={!!d.table} onClick={() => setDialog('table')}>Table</Tb>
          <Tb aria-label="Insert picture" disabled={!!d.picture} onClick={() => set((x) => { const [px, py] = picSize(o); return coInsertPicture(x, px, py); }, 'doc:picture')}>Picture</Tb>
          <input aria-label="Header text" className="h-8 w-40 rounded border border-slate-200 px-1 text-[12px]" placeholder="Header text" value={d.header} onChange={(e) => set((x) => ({ ...x, header: e.target.value.slice(0, 120) }))} />
          <Tb aria-label="Page numbers" on={d.pageNumbers} onClick={() => set((x) => ({ ...x, pageNumbers: !x.pageNumbers }), 'doc:pagenum')}>Page numbers</Tb>
        </Tools>
      )}
      {!ro && tab === 'review' && (
        <Tools>
          <Tb aria-label="Spelling" onClick={() => setDialog('spell')}>Spelling and Grammar (F7)</Tb>
          <Tb aria-label="Find and replace" onClick={() => setDialog('find')}>Find and Replace</Tb>
        </Tools>
      )}
      {!ro && tab === 'mail' && (
        <Tools>
          <Tb aria-label="Start mail merge" on={d.merge.started} onClick={() => setDialog('merge')}>Start, Select Recipients</Tb>
          {d.merge.started && fields.map((f) => (
            <Tb key={f} aria-label={`Insert field ${f}`} onMouseDown={(e) => e.preventDefault()} onClick={() => insertField(f)}>{`«${f}»`}</Tb>
          ))}
          {d.merge.started && (
            <>
              <Tb aria-label="Preview results" on={mergeAt >= 0} onClick={() => { setMergeAt(mergeAt >= 0 ? -1 : 0); if (mergeAt < 0) set((x) => ({ ...x, merge: { ...x.merge, previewed: Math.max(x.merge.previewed, 1) } }), 'doc:mergepreview'); }}>Preview</Tb>
              <Tb aria-label="Next record" disabled={mergeAt < 0} onClick={() => { const n = Math.min(records.length - 1, mergeAt + 1); setMergeAt(n); set((x) => ({ ...x, merge: { ...x.merge, previewed: Math.max(x.merge.previewed, n + 1) } }), 'doc:mergenext'); }}>Next</Tb>
              <Tb aria-label="Finish and merge" onClick={() => set((x) => ({ ...x, merge: { ...x.merge, letters: records.length } }), 'doc:merged')}>Finish &amp; Merge</Tb>
              {d.merge.letters > 0 && <span className="px-1 text-[12px] text-emerald-700">{d.merge.letters} letters made</span>}
            </>
          )}
        </Tools>
      )}
      {!ro && tab === 'file' && (
        <Tools>
          <Tb aria-label="Save as" onClick={() => setDialog('save')}>Save As</Tb>
          <Tb aria-label="Print" onClick={() => (set(coDocPreview, 'doc:preview'), setDialog('print'))}>Print Preview</Tb>
          <Tb aria-label="Close document" disabled={!d.saved} onClick={() => set(coDocClose, 'doc:close')}>Close</Tb>
          <span className="truncate px-1 text-[12px] text-slate-500">{d.saved ? `${d.saved.folder}\\${d.saved.name}` : 'Not saved yet'}</span>
        </Tools>
      )}
      <div className="min-h-0 flex-1 overflow-auto overscroll-contain bg-slate-300 p-2 sm:p-4">
        <div className={cn('mx-auto w-full max-w-[640px] bg-white shadow', d.border && 'outline outline-2 outline-offset-[-10px] outline-slate-700')} style={{ padding: `${pad(d.page.mt)} ${pad(d.page.mr)} ${pad(d.page.mb)} ${pad(d.page.ml)}`, minHeight: 420 }}>
          {d.header && <p className="mb-2 border-b border-slate-200 text-[11px] text-slate-500">{d.header}</p>}
          <div className="space-y-1.5">
            {d.paras.map((p, i) =>
              preview ? (
                <p key={p.id} style={{ fontFamily: FONT_CSS[p.font], fontSize: ptToPx(p.size), fontWeight: p.b ? 700 : 400, textAlign: ALIGN[p.align], lineHeight: p.spacing * 1.25 }}>{coMergeText(p.text, preview)}</p>
              ) : (
                <ParaBox
                  key={p.id}
                  p={p}
                  ro={ro}
                  selected={sel.includes(p.id)}
                  active={active === p.id}
                  bind={(el) => (boxes.current[p.id] = el)}
                  onFocus={() => setActive(p.id)}
                  onToggle={() => toggle(p.id)}
                  onChange={(t) => set((x) => coSetParaText(x, p.id, t.slice(0, 1900)))}
                  onEnter={() => set((x) => coAddPara(x, p.id, ''), 'doc:newpara')}
                  onEmptyBack={() => d.paras.length > 1 && (set((x) => coDeletePara(x, p.id), 'doc:delpara'), setActive(d.paras[i - 1]?.id ?? ''))}
                />
              ),
            )}
          </div>
          {preview && <Note>Record {mergeAt + 1} of {records.length}</Note>}
          {d.table && <TableBlock o={o} />}
          {d.picture && <PictureBlock o={o} />}
          {d.pageNumbers && <p className="mt-4 text-center text-[11px] text-slate-500">1</p>}
        </div>
      </div>
      {dialog === 'page' && <PageBox d={d} onSet={(p) => set((x) => ({ ...x, page: { ...x.page, ...p } }), 'doc:page')} onClose={() => setDialog(null)} />}
      {dialog === 'find' && <FindBox onRun={(a, b, m) => { const c = coReplaceAll(d, a, b, m).count; set((x) => coReplaceAll(x, a, b, m).doc, `doc:replace:${c}`); return c; }} onClose={() => setDialog(null)} />}
      {dialog === 'spell' && <SpellBox o={o} onClose={() => setDialog(null)} />}
      {dialog === 'table' && <TableBox onAdd={(c, r) => (set((x) => coInsertTable(x, c, r), 'doc:table'), setDialog(null))} onClose={() => setDialog(null)} />}
      {dialog === 'save' && <SaveBox d={d} onSave={(f, n) => (set((x) => coDocSave(x, f, n), `doc:save:${n}`), setDialog(null))} onClose={() => setDialog(null)} />}
      {dialog === 'print' && <PrintBox d={d} onPrint={(c) => (set((x) => coDocPrint(x, c), 'doc:print'), setDialog(null))} onClose={() => setDialog(null)} />}
      {dialog === 'merge' && <MergeBox file={o.s.sheet.file} n={records.length} onStart={() => (set((x) => ({ ...x, merge: { ...x.merge, started: true, source: o.s.sheet.file } }), 'doc:mergestart'), setDialog(null))} onClose={() => setDialog(null)} />}
    </div>
  );
}
function picSize(o: Office): [number, number] {
  const d = o.v.data as { px?: number; py?: number };
  return [d.px ?? 1600, d.py ?? 1200];
}

function TableBlock({ o }: { o: Office }) {
  const d = o.s.doc;
  const t = d.table!;
  const ro = o.readOnly;
  const set = (fn: (x: CoDoc) => CoDoc, log?: string) => o.set('doc', fn, log);
  const [focus, setFocus] = useState<string | null>(null);
  return (
    <div className="mt-3">
      {!ro && (
        <div className="mb-1 flex flex-wrap gap-1">
          <select aria-label="Table style" className="h-8 rounded border border-slate-200 text-[12px]" value={t.style} onChange={(e) => set((x) => ({ ...x, table: { ...x.table!, style: e.target.value } }), 'doc:tablestyle')}>
            <option value="">No style</option>
            <option>Grid</option>
            <option>Banded</option>
          </select>
          <Tb aria-label="Bold header row" on={t.headerBold} onClick={() => set((x) => ({ ...x, table: { ...x.table!, headerBold: !x.table!.headerBold } }), 'doc:tablebold')}>Bold header</Tb>
          <Tb aria-label="Right-align numbers" on={t.rightNums} onClick={() => set((x) => ({ ...x, table: { ...x.table!, rightNums: !x.table!.rightNums } }), 'doc:tableright')}>Right-align numbers</Tb>
          <Tb aria-label="Add row" onClick={() => set(coAddTableRow, 'doc:addrow')}>Add row</Tb>
          <Tb aria-label="Update fields" onClick={() => set(coUpdateFieldsSafe, 'doc:f9')}>Update fields (F9)</Tb>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className={cn('w-full border-collapse text-[12.5px]', t.style === 'Banded' && '[&_tr:nth-child(even)]:bg-slate-100')}>
          <tbody>
            {t.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => {
                  const k = `${r},${c}`;
                  const num = t.rightNums && r > 0 && c > 0;
                  return (
                    <td key={c} className="border border-slate-400 p-0">
                      <input
                        aria-label={`Table cell row ${r + 1} column ${c + 1}`}
                        readOnly={ro}
                        value={focus === k || !cell.startsWith('=') ? cell : coTableShown(t, r, c)}
                        onFocus={() => setFocus(k)}
                        onBlur={() => setFocus(null)}
                        onChange={(e) => set((x) => coSetTableCell(x, r, c, e.target.value))}
                        onKeyDown={(e) => {
                          if (e.key === 'F9') (e.preventDefault(), set(coUpdateFieldsSafe, 'doc:f9'));
                          if (e.key === 'Tab' && !e.shiftKey && r === t.rows.length - 1 && c === row.length - 1) (e.preventDefault(), set(coAddTableRow, 'doc:addrow'));
                        }}
                        className={cn('w-full min-w-[64px] bg-transparent px-1 py-1 outline-none', t.headerBold && r === 0 && 'font-bold', num && 'text-right')}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
const coUpdateFieldsSafe = (x: CoDoc) => coUpdateFields(x);

function PictureBlock({ o }: { o: Office }) {
  const d = o.s.doc;
  const p = d.picture!;
  const ro = o.readOnly;
  const set = (fn: (x: CoDoc) => CoDoc, log?: string) => o.set('doc', fn, log);
  const [w, setW] = useState(String(Number(p.w.toFixed(2))));
  const [h, setH] = useState(String(Number(p.h.toFixed(2))));
  const sync = (x: CoDoc) => {
    const q = x.picture!;
    setW(String(Number(q.w.toFixed(2))));
    setH(String(Number(q.h.toFixed(2))));
    return x;
  };
  const scale = Math.min(1, 160 / (p.w * 16));
  return (
    <div className={cn('mt-3 flex gap-3', p.wrap === 'INLINE' ? 'flex-col' : 'flex-wrap items-start')}>
      <svg role="img" aria-label="School logo picture" style={{ width: p.w * 16 * scale, height: p.h * 16 * scale }} viewBox={`0 0 ${p.px} ${p.py}`} preserveAspectRatio="none" className="border border-slate-300 bg-sky-100">
        <circle cx={p.px / 2} cy={p.py / 2} r={Math.min(p.px, p.py) * 0.36} fill="#1d4ed8" />
        <rect x={p.px * 0.38} y={p.py * 0.4} width={p.px * 0.24} height={p.py * 0.28} fill="#fff" />
      </svg>
      {!ro && (
        <div className="grid grid-cols-2 gap-1 text-[12px]">
          <Lbl text="Width (cm)">
            <input aria-label="Picture width" className={inputCls} inputMode="decimal" value={w} onChange={(e) => setW(e.target.value)} onBlur={() => set((x) => sync(coSizePicture(x, 'w', Number(w))), 'doc:picsize')} onKeyDown={(e) => e.key === 'Enter' && set((x) => sync(coSizePicture(x, 'w', Number(w))), 'doc:picsize')} />
          </Lbl>
          <Lbl text="Height (cm)">
            <input aria-label="Picture height" className={inputCls} inputMode="decimal" value={h} onChange={(e) => setH(e.target.value)} onBlur={() => set((x) => sync(coSizePicture(x, 'h', Number(h))), 'doc:picsize')} onKeyDown={(e) => e.key === 'Enter' && set((x) => sync(coSizePicture(x, 'h', Number(h))), 'doc:picsize')} />
          </Lbl>
          <label className="col-span-2 flex items-center gap-1"><input type="checkbox" aria-label="Lock aspect ratio" checked={p.lock} onChange={(e) => set((x) => ({ ...x, picture: { ...x.picture!, lock: e.target.checked } }), 'doc:piclock')} /> Lock aspect ratio</label>
          <Lbl text="Wrap Text">
            <select aria-label="Wrap text" className={inputCls} value={p.wrap} onChange={(e) => set((x) => ({ ...x, picture: { ...x.picture!, wrap: e.target.value as 'SQUARE' } }), 'doc:picwrap')}>
              <option value="INLINE">In line with text</option>
              <option value="SQUARE">Square</option>
              <option value="TIGHT">Tight</option>
            </select>
          </Lbl>
        </div>
      )}
      <p className="text-[12.5px] text-slate-500">{p.wrap === 'INLINE' ? '' : 'Text flows around the picture.'}</p>
    </div>
  );
}

function PageBox({ d, onSet, onClose }: { d: CoDoc; onSet: (p: Partial<CoDoc['page']>) => void; onClose: () => void }) {
  const [m, setM] = useState({ mt: String(d.page.mt), mb: String(d.page.mb), ml: String(d.page.ml), mr: String(d.page.mr) });
  const apply = (k: keyof typeof m, v: string) => {
    setM({ ...m, [k]: v });
    const x = Number(v);
    if (x > 0 && x < 10) onSet({ [k]: x });
  };
  return (
    <Modal title="Page Setup" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Lbl text="Size">
          <select aria-label="Paper size" className={inputCls} value={d.page.paper} onChange={(e) => onSet({ paper: e.target.value as 'A4' })}>
            <option value="A4">A4</option>
            <option value="LETTER">Letter</option>
          </select>
        </Lbl>
        <Lbl text="Orientation">
          <select aria-label="Orientation" className={inputCls} value={d.page.orient} onChange={(e) => onSet({ orient: e.target.value as 'PORTRAIT' })}>
            <option value="PORTRAIT">Portrait</option>
            <option value="LANDSCAPE">Landscape</option>
          </select>
        </Lbl>
        {(['mt', 'mb', 'ml', 'mr'] as const).map((k) => (
          <Lbl key={k} text={`${k === 'mt' ? 'Top' : k === 'mb' ? 'Bottom' : k === 'ml' ? 'Left' : 'Right'} margin (cm)`}>
            <input aria-label={`Margin ${k}`} className={inputCls} inputMode="decimal" value={m[k]} onChange={(e) => apply(k, e.target.value)} />
          </Lbl>
        ))}
      </div>
      <Sec onClick={onClose}>Done</Sec>
    </Modal>
  );
}
function FindBox({ onRun, onClose }: { onRun: (a: string, b: string, m: boolean) => number; onClose: () => void }) {
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [m, setM] = useState(true);
  const [done, setDone] = useState<number | null>(null);
  return (
    <Modal title="Find and Replace" onClose={onClose}>
      <Lbl text="Find what"><input aria-label="Find what" className={inputCls} value={a} onChange={(e) => setA(e.target.value)} /></Lbl>
      <Lbl text="Replace with"><input aria-label="Replace with" className={inputCls} value={b} onChange={(e) => setB(e.target.value)} /></Lbl>
      <label className="flex items-center gap-2"><input type="checkbox" aria-label="Match case" checked={m} onChange={(e) => setM(e.target.checked)} /> Match case</label>
      <Pri aria-label="Replace all" onClick={() => setDone(onRun(a, b, m))}>Replace All</Pri>
      {done !== null && <Note>{done} replacement{done === 1 ? '' : 's'} made.</Note>}
    </Modal>
  );
}
function SpellBox({ o, onClose }: { o: Office; onClose: () => void }) {
  const d = o.s.doc;
  const list = o.v.spell ?? [];
  const left = list.filter((w) => new RegExp(`\\b${w.wrong}\\b`, 'i').test(coDocText(d)));
  const w = left[0];
  return (
    <Modal title="Spelling and Grammar" onClose={onClose}>
      {w ? (
        <>
          <p>Not in dictionary: <span className="font-semibold text-red-700">{w.wrong}</span></p>
          <p>Suggestion: <span className="font-semibold">{w.right}</span></p>
          <div className="flex gap-2">
            <Pri aria-label="Change" onClick={() => o.set('doc', (x) => coReplaceAll(x, w.wrong, w.right, false).doc, `doc:spell:${w.wrong}`)}>Change</Pri>
            <Sec aria-label="Ignore" onClick={onClose}>Ignore</Sec>
          </div>
        </>
      ) : (
        <>
          <Note tone="good">The spelling check is complete.</Note>
          <Pri aria-label="Finish spelling" onClick={() => (o.set('doc', (x) => ({ ...x, spellRuns: x.spellRuns + 1 }), 'doc:spelldone'), onClose())}>OK</Pri>
        </>
      )}
    </Modal>
  );
}
function TableBox({ onAdd, onClose }: { onAdd: (c: number, r: number) => void; onClose: () => void }) {
  const [c, setC] = useState(4);
  const [r, setR] = useState(5);
  return (
    <Modal title="Insert Table" onClose={onClose}>
      <div className="grid grid-cols-2 gap-2">
        <Lbl text="Columns"><input aria-label="Columns" type="number" min={1} max={6} className={inputCls} value={c} onChange={(e) => setC(Math.max(1, Math.min(6, Number(e.target.value) || 1)))} /></Lbl>
        <Lbl text="Rows"><input aria-label="Rows" type="number" min={1} max={12} className={inputCls} value={r} onChange={(e) => setR(Math.max(1, Math.min(12, Number(e.target.value) || 1)))} /></Lbl>
      </div>
      <Pri aria-label="Create table" onClick={() => onAdd(c, r)}>OK</Pri>
    </Modal>
  );
}
function SaveBox({ d, onSave, onClose }: { d: CoDoc; onSave: (folder: string, name: string) => void; onClose: () => void }) {
  const [folders, setFolders] = useState(['Documents', 'Desktop', ...(d.saved && !/^(Documents|Desktop)$/.test(d.saved.folder) ? [d.saved.folder] : [])]);
  const [folder, setFolder] = useState(d.saved?.folder ?? 'Documents');
  const [name, setName] = useState(d.saved?.name ?? 'Document1.docx');
  const [fresh, setFresh] = useState('');
  return (
    <Modal title="Save As" onClose={onClose}>
      <Lbl text="Save in">
        <select aria-label="Save in folder" className={inputCls} value={folder} onChange={(e) => setFolder(e.target.value)}>
          {folders.map((f) => <option key={f}>{f}</option>)}
        </select>
      </Lbl>
      <div className="flex items-end gap-1">
        <Lbl text="New folder inside it"><input aria-label="New folder name" className={inputCls} value={fresh} onChange={(e) => setFresh(e.target.value)} /></Lbl>
        <Sec aria-label="Create folder" disabled={!fresh.trim()} onClick={() => { const f = `${folder}\\${fresh.trim()}`; setFolders([...folders, f]); setFolder(f); setFresh(''); }}>Create</Sec>
      </div>
      <Lbl text="File name"><input aria-label="File name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Lbl>
      <Pri aria-label="Save" disabled={!name.trim()} onClick={() => onSave(folder, name.trim())}>Save</Pri>
    </Modal>
  );
}
function PrintBox({ d, onPrint, onClose }: { d: CoDoc; onPrint: (c: number) => void; onClose: () => void }) {
  const [c, setC] = useState(1);
  return (
    <Modal title="Print Preview" onClose={onClose}>
      <p className="text-[12.5px]">{d.page.paper} {d.page.orient.toLowerCase()}, margins {d.page.mt} / {d.page.mb} / {d.page.ml} / {d.page.mr} cm. What you see on the page is what prints.</p>
      <div className="flex items-end gap-2">
        <Lbl text="Copies"><input aria-label="Copies" type="number" min={1} max={50} className={cn(inputCls, 'w-20')} value={c} onChange={(e) => setC(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} /></Lbl>
        <Pri aria-label="Print now" onClick={() => onPrint(c)}>Print</Pri>
      </div>
    </Modal>
  );
}
function MergeBox({ file, n, onStart, onClose }: { file: string; n: number; onStart: () => void; onClose: () => void }) {
  return (
    <Modal title="Start Mail Merge" onClose={onClose}>
      <p>Document type: Letters</p>
      <p>Use an existing list: <span className="font-semibold">{file || 'no list'}</span> ({n} records)</p>
      <Pri aria-label="Select recipients" onClick={onStart}>Select Recipients</Pri>
    </Modal>
  );
}
