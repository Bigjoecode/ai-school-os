import {
  CO_CHART_TYPES,
  coAddChart,
  coAddr,
  coAutoFit,
  coChartData,
  coClear,
  coColName,
  coColWidth,
  coCondHit,
  coCycleRef,
  coDeleteRow,
  coEvalAll,
  coFillDown,
  coFillRight,
  coFormatCells,
  coParseAddr,
  coPaste,
  coSetCell,
  coShown,
  coSortRange,
  type CoChart,
  type CoChartType,
  type CoNumFmt,
  type CoSheet,
} from '@aischool/shared';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { cn } from '@/lib/utils';
import type { Office } from './actions';
import { ChartView } from './chart';
import { Lbl, Modal, Note, Pri, Sec, Tabs, Tb, Tools, inputCls } from './ui';

/**
 * A working spreadsheet: a grid, a formula bar (the one place text is
 * edited, so it works the same with a keyboard and on a phone), point-to-
 * reference, the fill handle, formats, sort, charts and print set-up.
 * On a phone, Range mode replaces dragging and a key row gives = $ : ( ).
 */

type Tab = 'home' | 'insert' | 'data' | 'page';
const norm = (a: string, b: string) => {
  const p = coParseAddr(a)!;
  const q = coParseAddr(b)!;
  return { c0: Math.min(p.c, q.c), r0: Math.min(p.r, q.r), c1: Math.max(p.c, q.c), r1: Math.max(p.r, q.r) };
};
const rangeStr = (a: string, b: string) => (a === b ? a : (() => {
  const g = norm(a, b);
  return `${coAddr(g.c0, g.r0)}:${coAddr(g.c1, g.r1)}`;
})());
const FILL = '#dbeafe';
const REFS_AT_END = /\$?[A-Za-z]{1,3}\$?\d+$/;
const KEYS = ['=', '(', ')', ':', ',', '$', '+', '-', '*', '/', '>', '<', '"', '%', 'SUM(', 'AVERAGE(', 'IF(', 'MAX(', 'MIN(', 'COUNT(', 'RANK(', 'COUNTIF('];

export function SheetApp({ o }: { o: Office }) {
  const s = o.s.sheet;
  const ro = o.readOnly;
  const set = (fn: (x: CoSheet) => CoSheet, log?: string) => o.set('sheet', fn, log);
  const [tab, setTab] = useState<Tab>('home');
  const [sel, setSel] = useState({ a: 'A1', b: 'A1' });
  const [edit, setEdit] = useState<string | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const rangeTaps = useRef(0);
  const [clip, setClip] = useState('');
  const [dialog, setDialog] = useState<null | 'save' | 'chart' | 'page' | 'preview' | 'cond'>(null);
  const [msg, setMsg] = useState('');
  const [fillTo, setFillTo] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const drag = useRef<'select' | 'fill' | 'point' | null>(null);
  const point = useRef<{ start: number; anchor: string } | null>(null);
  const vals = useMemo(() => coEvalAll(s.cells), [s.cells]);
  const range = rangeStr(sel.a, sel.b);
  const g = norm(sel.a, sel.b);
  const pointing = edit?.startsWith('=') ?? false;
  const cols = Array.from({ length: s.cols }, (_, i) => i);
  const rows = Array.from({ length: s.rows }, (_, i) => i);

  useEffect(() => {
    const up = () => {
      if (drag.current === 'fill' && fillTo) applyFill(fillTo);
      drag.current = null;
    };
    window.addEventListener('pointerup', up);
    return () => window.removeEventListener('pointerup', up);
  });

  const commit = (move?: 'down' | 'right') => {
    if (edit === null) return;
    const value = edit;
    const at = sel.a;
    set((x) => coSetCell(x, at, value), `sheet:set:${at}`);
    setEdit(null);
    point.current = null;
    const p = coParseAddr(at)!;
    if (move) {
      const next = move === 'down' ? coAddr(p.c, Math.min(p.r + 1, s.rows - 1)) : coAddr(Math.min(p.c + 1, s.cols - 1), p.r);
      setSel({ a: next, b: next });
    }
    grid.current?.focus({ preventScroll: true });
  };
  const beginEdit = (first?: string) => {
    if (ro) return;
    setEdit(first ?? s.cells[sel.a]?.f ?? '');
    requestAnimationFrame(() => {
      input.current?.focus({ preventScroll: true });
      const n = input.current?.value.length ?? 0;
      input.current?.setSelectionRange(n, n);
    });
  };
  /** Clicking a cell while typing a formula puts its address in the formula. */
  const insertRef = (addr: string, extend: boolean) => {
    const el = input.current;
    const text = edit ?? '';
    if (extend && point.current) {
      const r = rangeStr(point.current.anchor, addr);
      const next = text.slice(0, point.current.start) + r + text.slice(el?.selectionStart ?? text.length);
      setEdit(next);
      requestAnimationFrame(() => el?.setSelectionRange(point.current!.start + r.length, point.current!.start + r.length));
      return;
    }
    const at = el?.selectionStart ?? text.length;
    setEdit(text.slice(0, at) + addr + text.slice(at));
    point.current = { start: at, anchor: addr };
    requestAnimationFrame(() => {
      el?.focus({ preventScroll: true });
      el?.setSelectionRange(at + addr.length, at + addr.length);
    });
  };
  const addKey = (k: string) => {
    const el = input.current;
    if (edit === null) return beginEdit(k);
    const at = el?.selectionStart ?? edit.length;
    setEdit(edit.slice(0, at) + k + edit.slice(at));
    point.current = null;
    requestAnimationFrame(() => {
      el?.focus({ preventScroll: true });
      el?.setSelectionRange(at + k.length, at + k.length);
    });
  };
  const f4 = () => {
    if (edit === null) return;
    const el = input.current;
    const at = el?.selectionStart ?? edit.length;
    const head = edit.slice(0, at);
    const m = REFS_AT_END.exec(head);
    if (!m) return;
    const next = coCycleRef(m[0]);
    setEdit(head.slice(0, m.index) + next + edit.slice(at));
    point.current = null;
    requestAnimationFrame(() => el?.setSelectionRange(m.index + next.length, m.index + next.length));
  };
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.preventDefault(), commit('down'));
    else if (e.key === 'Tab') (e.preventDefault(), commit('right'));
    else if (e.key === 'Escape') {
      e.preventDefault();
      setEdit(null);
      grid.current?.focus({ preventScroll: true });
    } else if (e.key === 'F4') (e.preventDefault(), f4());
  };
  const moveSel = (dc: number, dr: number, extend: boolean) => {
    const p = coParseAddr(extend ? sel.b : sel.a)!;
    const next = coAddr(Math.max(0, Math.min(s.cols - 1, p.c + dc)), Math.max(0, Math.min(s.rows - 1, p.r + dr)));
    setSel(extend ? { a: sel.a, b: next } : { a: next, b: next });
    grid.current?.querySelector(`[data-cell="${next}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };
  const fillDown = () => set((x) => coFillDown(x, range), `sheet:fill:${range}`);
  const onGridKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (ro || edit !== null) return;
    const k = e.key;
    if (e.ctrlKey || e.metaKey) {
      const c = k.toLowerCase();
      if (c === 'd') (e.preventDefault(), fillDown());
      else if (c === 'c') (e.preventDefault(), setClip(range), setMsg(`Copied ${range}`));
      else if (c === 'v' && clip) (e.preventDefault(), set((x) => coPaste(x, clip, sel.a), `sheet:paste:${sel.a}`));
      else if (c === 'b') (e.preventDefault(), set((x) => coFormatCells(x, range, { b: !x.cells[sel.a]?.b }), 'sheet:bold'));
      else if (c === 's') (e.preventDefault(), setDialog('save'));
      return;
    }
    if (k === 'ArrowDown') (e.preventDefault(), moveSel(0, 1, e.shiftKey));
    else if (k === 'ArrowUp') (e.preventDefault(), moveSel(0, -1, e.shiftKey));
    else if (k === 'ArrowRight' || k === 'Tab') (e.preventDefault(), moveSel(1, 0, e.shiftKey && k !== 'Tab'));
    else if (k === 'ArrowLeft') (e.preventDefault(), moveSel(-1, 0, e.shiftKey));
    else if (k === 'Enter' || k === 'F2') (e.preventDefault(), beginEdit());
    else if (k === 'Delete' || k === 'Backspace') (e.preventDefault(), set((x) => coClear(x, range), `sheet:clear:${range}`));
    else if (k.length === 1) (e.preventDefault(), beginEdit(k));
  };
  const select = (addr: string, extend: boolean) => {
    if (pointing) return insertRef(addr, extend);
    if (edit !== null) commit();
    setSel(extend ? { a: sel.a, b: addr } : { a: addr, b: addr });
  };
  const onCellDown = (addr: string, e: RPointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    if (pointing) e.preventDefault();
    drag.current = pointing ? 'point' : 'select';
    select(addr, e.shiftKey);
  };
  const onCellEnter = (addr: string) => {
    if (drag.current === 'select') setSel((x) => ({ ...x, b: addr }));
    else if (drag.current === 'point') insertRef(addr, true);
    else if (drag.current === 'fill') setFillTo(addr);
  };
  const onCellClick = (addr: string, e: React.MouseEvent) => {
    const touch = (e.nativeEvent as PointerEvent).pointerType !== 'mouse' && (e.nativeEvent as PointerEvent).pointerType !== undefined && (e.nativeEvent as PointerEvent).pointerType !== '';
    if (!touch) return;
    // A tap: in Range mode the second tap extends.
    if (rangeMode) {
      if (pointing) insertRef(addr, !!point.current);
      else {
        // The first tap starts the range, the second ends it (not the cell that was selected before Range was switched on).
        const second = rangeTaps.current % 2 === 1;
        rangeTaps.current += 1;
        setSel((x) => (second ? { a: x.a, b: addr } : { a: addr, b: addr }));
      }
    } else select(addr, false);
  };
  function applyFill(to: string) {
    const t = coParseAddr(to)!;
    setFillTo(null);
    if (t.r > g.r1) {
      const r = `${coAddr(g.c0, g.r0)}:${coAddr(g.c1, t.r)}`;
      set((x) => coFillDown(x, r), `sheet:fill:${r}`);
      setSel({ a: coAddr(g.c0, g.r0), b: coAddr(g.c1, t.r) });
    } else if (t.c > g.c1) {
      const r = `${coAddr(g.c0, g.r0)}:${coAddr(t.c, g.r1)}`;
      set((x) => coFillRight(x, r), `sheet:fill:${r}`);
      setSel({ a: coAddr(g.c0, g.r0), b: coAddr(t.c, g.r1) });
    }
  }
  const fmt = (patch: Parameters<typeof coFormatCells>[2], log: string) => set((x) => coFormatCells(x, range, patch), `sheet:${log}`);
  const nf = (n: CoNumFmt, dp?: number) => fmt({ nf: n, dp }, `fmt:${n}`);
  const dpNow = s.cells[sel.a]?.dp ?? 0;
  const stat = useMemo(() => {
    if (sel.a === sel.b) return '';
    const xs: number[] = [];
    for (let r = g.r0; r <= g.r1; r++) for (let c = g.c0; c <= g.c1; c++) {
      const x = vals[coAddr(c, r)];
      if (typeof x === 'number') xs.push(x);
    }
    return xs.length ? `Sum ${Number(xs.reduce((a, b) => a + b, 0).toPrecision(10))}  Average ${Number((xs.reduce((a, b) => a + b, 0) / xs.length).toPrecision(8))}  Count ${xs.length}` : '';
  }, [g.c0, g.c1, g.r0, g.r1, sel.a, sel.b, vals]);
  const inSel = (c: number, r: number) => c >= g.c0 && c <= g.c1 && r >= g.r0 && r <= g.r1;
  const previewFill = fillTo ? coParseAddr(fillTo)! : null;

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-white text-slate-900" onKeyDown={(e) => e.stopPropagation()}>
      {!ro && <Tabs<Tab> tabs={[{ id: 'home', label: 'Home' }, { id: 'insert', label: 'Insert' }, { id: 'data', label: 'Data' }, { id: 'page', label: 'File and page' }]} value={tab} onChange={setTab} />}
      {!ro && tab === 'home' && (
        <Tools>
          <Tb className="font-bold" aria-label="Bold" on={!!s.cells[sel.a]?.b} onClick={() => fmt({ b: !s.cells[sel.a]?.b }, 'bold')}>B</Tb>
          <Tb aria-label="All borders" on={!!s.cells[sel.a]?.bd} onClick={() => fmt({ bd: !s.cells[sel.a]?.bd }, 'border')}>Borders</Tb>
          <Tb aria-label="Fill colour" on={!!s.cells[sel.a]?.fill} onClick={() => fmt({ fill: s.cells[sel.a]?.fill ? undefined : FILL }, 'fill')}>Fill</Tb>
          <Tb aria-label="Currency" onClick={() => nf('CURRENCY', 2)}>₦</Tb>
          <Tb aria-label="Percentage" onClick={() => nf('PERCENT', 2)}>%</Tb>
          <Tb aria-label="Thousands separator" onClick={() => nf('THOUSANDS', s.cells[sel.a]?.dp ?? 0)}>1,000</Tb>
          <Tb aria-label="Number format general" onClick={() => fmt({ nf: undefined, dp: undefined }, 'fmt:GENERAL')}>General</Tb>
          <Tb aria-label="Decrease decimal" onClick={() => fmt({ dp: Math.max(0, dpNow - 1) }, 'dp')}>.0-</Tb>
          <Tb aria-label="Increase decimal" onClick={() => fmt({ dp: Math.min(6, dpNow + 1) }, 'dp')}>.0+</Tb>
          <Tb aria-label="Fill down" onClick={fillDown}>Fill down</Tb>
          <Tb aria-label="Fill right" onClick={() => set((x) => coFillRight(x, range), `sheet:fillr:${range}`)}>Fill right</Tb>
          <Tb aria-label="Copy" onClick={() => (setClip(range), setMsg(`Copied ${range}`))}>Copy</Tb>
          <Tb aria-label="Paste" disabled={!clip} onClick={() => set((x) => coPaste(x, clip, sel.a), `sheet:paste:${sel.a}`)}>Paste</Tb>
          <Tb aria-label="Clear" onClick={() => set((x) => coClear(x, range), `sheet:clear:${range}`)}>Clear</Tb>
          <Tb aria-label="AutoFit column" onClick={() => set((x) => coAutoFit(x, coParseAddr(sel.a)!.c), 'sheet:autofit')}>AutoFit</Tb>
          <Tb aria-label="Delete row" onClick={() => set((x) => coDeleteRow(x, coParseAddr(sel.a)!.r), `sheet:delrow:${sel.a}`)}>Delete row</Tb>
        </Tools>
      )}
      {!ro && tab === 'insert' && (
        <Tools>
          <Tb aria-label="Insert chart" onClick={() => setDialog('chart')}>Chart from {range}</Tb>
          <Tb aria-label="Conditional formatting" onClick={() => setDialog('cond')}>Conditional formatting</Tb>
        </Tools>
      )}
      {!ro && tab === 'data' && (
        <Tools>
          <Tb aria-label="Sort ascending" onClick={() => set((x) => coSortRange(x, range, coParseAddr(sel.a)!.c, true), 'sheet:sort:asc')}>Sort A to Z</Tb>
          <Tb aria-label="Sort descending" onClick={() => set((x) => coSortRange(x, range, coParseAddr(sel.a)!.c, false), 'sheet:sort:desc')}>Sort Z to A</Tb>
          <Tb aria-label="Freeze top row" on={s.freeze === 1} onClick={() => set((x) => ({ ...x, freeze: x.freeze ? 0 : 1 }), 'sheet:freeze')}>Freeze top row</Tb>
        </Tools>
      )}
      {!ro && tab === 'page' && (
        <Tools>
          <Tb aria-label="Save as" onClick={() => setDialog('save')}>Save As</Tb>
          <Tb aria-label="Page setup" onClick={() => setDialog('page')}>Page Setup</Tb>
          <Tb aria-label="Print preview" onClick={() => (set((x) => ({ ...x, print: { ...x.print, preview: x.print.preview + 1 } }), 'sheet:preview'), setDialog('preview'))}>Print Preview</Tb>
          <span className="truncate px-1 text-[12px] text-slate-500">{s.file || 'Not saved yet'}</span>
        </Tools>
      )}
      <div className="flex items-center gap-1 border-b border-slate-200 p-1">
        <span className="w-14 shrink-0 rounded border border-slate-200 px-1 py-1 text-center text-[12px] tabular-nums" aria-label="Selected cell">{sel.a === sel.b ? sel.a : range}</span>
        <span className="shrink-0 px-0.5 text-[12px] italic text-slate-500">fx</span>
        <input
          ref={input}
          aria-label="Formula bar"
          value={edit ?? s.cells[sel.a]?.f ?? ''}
          disabled={ro}
          onChange={(e) => (setEdit(e.target.value), (point.current = null))}
          onFocus={() => edit === null && beginEdit()}
          onKeyDown={onInputKey}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-8 min-w-0 flex-1 rounded border border-slate-300 px-1.5 font-mono text-[13px] outline-none focus:border-blue-500"
        />
        {edit !== null && (
          <>
            <Tb aria-label="Enter" onMouseDown={(e) => e.preventDefault()} onClick={() => commit('down')}>✓</Tb>
            <Tb aria-label="Cancel" onMouseDown={(e) => e.preventDefault()} onClick={() => setEdit(null)}>✕</Tb>
          </>
        )}
      </div>
      {!ro && (edit !== null || rangeMode) && (
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 p-1 sm:hidden">
          {KEYS.map((k) => (
            <Tb key={k} onMouseDown={(e) => e.preventDefault()} onClick={() => addKey(k)} className="font-mono">{k}</Tb>
          ))}
          <Tb onMouseDown={(e) => e.preventDefault()} onClick={f4}>F4 $</Tb>
        </div>
      )}
      <div ref={grid} tabIndex={0} aria-label="Worksheet grid" onKeyDown={onGridKey} className="relative min-h-0 flex-1 overflow-auto overscroll-contain outline-none">
        <table className="border-separate border-spacing-0 text-[13px]" role="grid" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 h-7 w-9 min-w-9 border-b border-r border-slate-300 bg-slate-200" />
              {cols.map((c) => (
                <th key={c} scope="col" style={{ minWidth: Math.max(48, coColWidth(s, c) * 7.6), width: Math.max(48, coColWidth(s, c) * 7.6) }} className={cn('sticky top-0 z-10 border-b border-r border-slate-300 bg-slate-200 text-[12px] font-medium text-slate-600', c >= g.c0 && c <= g.c1 && 'bg-blue-200')}>
                  {coColName(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <th scope="row" className={cn('sticky left-0 z-10 h-7 border-b border-r border-slate-300 bg-slate-200 text-[12px] font-medium text-slate-600', r >= g.r0 && r <= g.r1 && 'bg-blue-200')} style={s.freeze && r === 0 ? { top: 28, zIndex: 15 } : undefined}>{r + 1}</th>
                {cols.map((c) => {
                  const a = coAddr(c, r);
                  const cell = s.cells[a];
                  const v = vals[a] ?? null;
                  const hit = coCondHit(s, a, v);
                  const num = typeof v === 'number';
                  const sell = inSel(c, r);
                  const corner = c === g.c1 && r === g.r1 && !ro && edit === null;
                  const inFill = previewFill && c >= g.c0 && r >= g.r0 && ((previewFill.r > g.r1 && c <= g.c1 && r <= previewFill.r) || (previewFill.c > g.c1 && r <= g.r1 && c <= previewFill.c));
                  const shown = coShown(s, a, v);
                  return (
                    <td
                      key={c}
                      data-cell={a}
                      role="gridcell"
                      aria-selected={sell}
                      onPointerDown={(e) => onCellDown(a, e)}
                      onPointerEnter={() => onCellEnter(a)}
                      onClick={(e) => onCellClick(a, e)}
                      onDoubleClick={() => !pointing && beginEdit()}
                      style={{ background: hit?.fill ?? cell?.fill ?? undefined, ...(s.freeze && r === 0 ? { position: 'sticky', top: 28, zIndex: 5 } : {}) }}
                      className={cn('relative h-7 max-w-0 select-none overflow-hidden whitespace-nowrap border-b border-r border-slate-200 bg-white px-1', cell?.bd && 'border-slate-600', cell?.b && 'font-semibold', num || typeof v === 'boolean' ? 'text-right tabular-nums' : 'text-left', sell && 'bg-blue-50 outline outline-1 -outline-offset-1 outline-blue-300', a === sel.a && 'outline-2 outline-blue-600', inFill && 'outline-dashed outline-1 outline-slate-500')}
                    >
                      {shown}
                      {corner && (
                        <span
                          aria-label="Fill handle"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            drag.current = 'fill';
                          }}
                          className="absolute bottom-0 right-0 z-10 size-2.5 cursor-crosshair bg-blue-600"
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 border-t border-slate-200 bg-slate-50 px-1 py-0.5 text-[11.5px] text-slate-600">
        {!ro && (
          <Tb className="h-7" on={rangeMode} aria-label="Range mode" onMouseDown={(e) => e.preventDefault()} onClick={() => ((rangeTaps.current = 0), setRangeMode((x) => !x))}>Range</Tb>
        )}
        <span className="min-w-0 truncate">{msg || (rangeMode ? 'Range mode: tap the first cell, then the last.' : pointing ? 'Click a cell to put its address in the formula.' : stat || 'Ready')}</span>
      </div>
      {s.charts.length > 0 && (
        <div className="flex max-h-[40%] shrink-0 gap-2 overflow-x-auto border-t border-slate-300 bg-slate-100 p-2">
          {s.charts.map((c, i) => (
            <div key={i} className="relative w-[280px] shrink-0 rounded border border-slate-300 bg-white p-1">
              <ChartView chart={c} data={coChartData(s, c)} />
              {!ro && (
                <button type="button" aria-label={`Delete chart ${i + 1}`} onClick={() => set((x) => ({ ...x, charts: x.charts.filter((_, k) => k !== i) }), 'sheet:delchart')} className="absolute right-1 top-1 rounded bg-slate-100 px-1 text-[11px] text-slate-600">
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {dialog === 'save' && <SaveBox s={s} onClose={() => setDialog(null)} onSave={(file) => (set((x) => ({ ...x, file }), `sheet:save:${file}`), setDialog(null))} />}
      {dialog === 'chart' && <ChartBox range={range} s={s} onClose={() => setDialog(null)} onAdd={(c) => (set((x) => coAddChart(x, c), `sheet:chart:${c.type}:${c.range}`), setDialog(null))} />}
      {dialog === 'page' && <PageBox s={s} onClose={() => setDialog(null)} onSet={(p) => set((x) => ({ ...x, print: { ...x.print, ...p } }), 'sheet:page')} />}
      {dialog === 'cond' && <CondBox range={range} onClose={() => setDialog(null)} onAdd={(c) => (set((x) => ({ ...x, cond: [...x.cond, c].slice(-6) }), 'sheet:cond'), setDialog(null))} />}
      {dialog === 'preview' && (
        <PreviewBox
          s={s}
          onClose={() => setDialog(null)}
          onPrint={(copies) => (set((x) => ({ ...x, print: { ...x.print, copies, jobs: x.print.jobs + 1, previewedFirst: x.print.previewedFirst || x.print.jobs === 0 } }), 'sheet:print'), setDialog(null), setMsg(`Printed ${copies} ${copies === 1 ? 'copy' : 'copies'}`))}
        />
      )}
    </div>
  );
}

function SaveBox({ s, onClose, onSave }: { s: CoSheet; onClose: () => void; onSave: (file: string) => void }) {
  const [name, setName] = useState(s.file || 'Book1.xlsx');
  return (
    <Modal title="Save As" onClose={onClose}>
      <Lbl text="File name">
        <input aria-label="File name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Lbl>
      <Pri aria-label="Save" onClick={() => onSave(name.trim())} disabled={!name.trim()}>Save</Pri>
    </Modal>
  );
}
function ChartBox({ range, s, onClose, onAdd }: { range: string; s: CoSheet; onClose: () => void; onAdd: (c: CoChart) => void }) {
  const [c, setC] = useState<CoChart>({ type: 'PIE', range, title: '', xTitle: '', yTitle: '', labels: 'NONE' });
  const data = coChartData(s, c);
  return (
    <Modal title="Insert chart" onClose={onClose} wide>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-2">
          <Lbl text="Chart type">
            <select aria-label="Chart type" className={inputCls} value={c.type} onChange={(e) => setC({ ...c, type: e.target.value as CoChartType })}>
              {CO_CHART_TYPES.map((t) => <option key={t} value={t}>{t === 'COLUMN' ? 'Clustered column' : t === 'BAR' ? 'Bar' : t === 'PIE' ? 'Pie' : 'Line'}</option>)}
            </select>
          </Lbl>
          <Lbl text="Data range">
            <input aria-label="Data range" className={inputCls} value={c.range} onChange={(e) => setC({ ...c, range: e.target.value.toUpperCase() })} />
          </Lbl>
          <Lbl text="Chart title">
            <input aria-label="Chart title" className={inputCls} value={c.title} onChange={(e) => setC({ ...c, title: e.target.value })} />
          </Lbl>
          {c.type !== 'PIE' && (
            <div className="grid grid-cols-2 gap-2">
              <Lbl text="X axis title">
                <input aria-label="X axis title" className={inputCls} value={c.xTitle} onChange={(e) => setC({ ...c, xTitle: e.target.value })} />
              </Lbl>
              <Lbl text="Y axis title">
                <input aria-label="Y axis title" className={inputCls} value={c.yTitle} onChange={(e) => setC({ ...c, yTitle: e.target.value })} />
              </Lbl>
            </div>
          )}
          <Lbl text="Data labels">
            <select aria-label="Data labels" className={inputCls} value={c.labels} onChange={(e) => setC({ ...c, labels: e.target.value as CoChart['labels'] })}>
              <option value="NONE">None</option>
              <option value="VALUE">Values</option>
              <option value="PERCENT">Percentages</option>
            </select>
          </Lbl>
        </div>
        <ChartView chart={c} data={data} />
      </div>
      <Pri aria-label="Add chart" onClick={() => onAdd(c)}>Add chart</Pri>
    </Modal>
  );
}
function PageBox({ s, onClose, onSet }: { s: CoSheet; onClose: () => void; onSet: (p: Partial<CoSheet['print']>) => void }) {
  const p = s.print;
  return (
    <Modal title="Page Setup" onClose={onClose}>
      <Lbl text="Orientation">
        <select aria-label="Orientation" className={inputCls} value={p.orient} onChange={(e) => onSet({ orient: e.target.value as 'PORTRAIT' })}>
          <option value="PORTRAIT">Portrait</option>
          <option value="LANDSCAPE">Landscape</option>
        </select>
      </Lbl>
      <Lbl text="Rows to repeat at top">
        <input aria-label="Rows to repeat at top" className={inputCls} placeholder="$1:$1" value={p.titleRows} onChange={(e) => onSet({ titleRows: e.target.value })} />
      </Lbl>
      <label className="flex items-center gap-2"><input type="checkbox" aria-label="Fit all columns on one page" checked={p.fitWidth} onChange={(e) => onSet({ fitWidth: e.target.checked })} /> Fit All Columns on One Page</label>
      <label className="flex items-center gap-2"><input type="checkbox" aria-label="Print gridlines" checked={p.gridlines} onChange={(e) => onSet({ gridlines: e.target.checked })} /> Print gridlines</label>
      <Sec onClick={onClose}>Done</Sec>
    </Modal>
  );
}
function CondBox({ range, onClose, onAdd }: { range: string; onClose: () => void; onAdd: (c: CoSheet['cond'][number]) => void }) {
  const [r, setR] = useState(range);
  const [op, setOp] = useState<'LT' | 'GT'>('LT');
  const [value, setValue] = useState('50');
  return (
    <Modal title="Highlight cells rule" onClose={onClose}>
      <Lbl text="Cells">
        <input aria-label="Rule range" className={inputCls} value={r} onChange={(e) => setR(e.target.value.toUpperCase())} />
      </Lbl>
      <div className="grid grid-cols-2 gap-2">
        <Lbl text="Rule">
          <select aria-label="Rule" className={inputCls} value={op} onChange={(e) => setOp(e.target.value as 'LT')}>
            <option value="LT">Less than</option>
            <option value="GT">Greater than</option>
          </select>
        </Lbl>
        <Lbl text="Value">
          <input aria-label="Rule value" className={inputCls} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
        </Lbl>
      </div>
      <Pri aria-label="Apply rule" onClick={() => onAdd({ range: r, op, value: Number(value), fill: '#fecaca' })}>Apply (light red fill)</Pri>
    </Modal>
  );
}
function PreviewBox({ s, onClose, onPrint }: { s: CoSheet; onClose: () => void; onPrint: (copies: number) => void }) {
  const [copies, setCopies] = useState(1);
  const last = Math.max(1, ...Object.keys(s.cells).map((a) => coParseAddr(a)!.r + 1));
  const lastCol = Math.max(1, ...Object.keys(s.cells).map((a) => coParseAddr(a)!.c + 1));
  const per = s.print.orient === 'PORTRAIT' ? 45 : 30;
  const rows = Math.max(1, last - (s.print.titleRows ? 1 : 0));
  const pages = Math.ceil(rows / per);
  const vals = coEvalAll(s.cells);
  return (
    <Modal title="Print Preview" onClose={onClose} wide>
      <p className="text-[12.5px]">{pages} page{pages === 1 ? '' : 's'} · {s.print.orient.toLowerCase()} · {s.print.gridlines ? 'gridlines on' : 'no gridlines'} · {s.print.fitWidth ? 'all columns on one page' : `${lastCol} columns`}{s.print.titleRows ? ` · headings repeat (${s.print.titleRows})` : ''}</p>
      <div className="max-h-48 overflow-auto rounded border border-slate-300 bg-slate-100 p-2">
        <div className="mx-auto w-fit bg-white p-2 text-[10px] shadow">
          <table>
            <tbody>
              {Array.from({ length: Math.min(last, 12) }, (_, r) => (
                <tr key={r}>
                  {Array.from({ length: lastCol }, (_, c) => (
                    <td key={c} className={cn('whitespace-nowrap px-1', s.print.gridlines && 'border border-slate-300')}>{coShown(s, coAddr(c, r), vals[coAddr(c, r)] ?? null)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex items-end gap-2">
        <Lbl text="Copies">
          <input aria-label="Copies" type="number" min={1} max={50} className={cn(inputCls, 'w-20')} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} />
        </Lbl>
        <Pri aria-label="Print" onClick={() => onPrint(copies)}>Print</Pri>
      </div>
      <Note>Printing here sends nothing anywhere: the job is recorded.</Note>
    </Modal>
  );
}
