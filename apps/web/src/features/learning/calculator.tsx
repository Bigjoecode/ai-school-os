import { Calculator as CalcIcon, X } from 'lucide-react';
import { useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

type Op = '+' | '−' | '×' | '÷';

interface CalcState {
  /** What the display shows (the number being typed, or the last result). */
  display: string;
  /** The left-hand number waiting for an operator. */
  acc: number | null;
  op: Op | null;
  /** The next digit starts a new number. */
  fresh: boolean;
  memory: number;
  error: boolean;
}

const START: CalcState = { display: '0', acc: null, op: null, fresh: true, memory: 0, error: false };

/** 12 significant figures, without trailing zeros or float noise (0.1 + 0.2 = 0.3). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return 'Error';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e12 || abs < 1e-9) return n.toExponential(6).replace(/\.?0+e/, 'e');
  return String(Number.parseFloat(n.toPrecision(12)));
}

function apply(a: number, op: Op, b: number): number {
  switch (op) {
    case '+':
      return a + b;
    case '−':
      return a - b;
    case '×':
      return a * b;
    case '÷':
      return b === 0 ? Number.NaN : a / b;
  }
}

/**
 * The calculator's key handler: a small state machine (no evaluation of
 * typed text). Exported for tests.
 */
export function press(s: CalcState, key: string): CalcState {
  if (s.error && key !== 'C' && key !== 'AC') return s;
  const cur = Number.parseFloat(s.display);
  const result = (n: number): CalcState => (Number.isFinite(n) ? { ...s, display: formatNumber(n), fresh: true, error: false } : { ...s, display: 'Error', acc: null, op: null, fresh: true, error: true });
  if (/^[0-9]$/.test(key)) {
    if (s.fresh) return { ...s, display: key, fresh: false };
    if (s.display.replace(/[-.]/g, '').length >= 12) return s;
    return { ...s, display: s.display === '0' ? key : s.display + key };
  }
  switch (key) {
    case '.':
      if (s.fresh) return { ...s, display: '0.', fresh: false };
      return s.display.includes('.') ? s : { ...s, display: s.display + '.' };
    case 'AC':
      return { ...START, memory: s.memory };
    case 'C':
      // Clear entry (a second press clears everything).
      return s.display === '0' && s.fresh ? { ...START, memory: s.memory } : { ...s, display: '0', fresh: true, error: false };
    case '⌫':
      if (s.fresh) return s;
      return { ...s, display: s.display.length > 1 && !(s.display.length === 2 && s.display.startsWith('-')) ? s.display.slice(0, -1) : '0' };
    case '±':
      return s.display === '0' ? s : { ...s, display: s.display.startsWith('-') ? s.display.slice(1) : `-${s.display}` };
    case '√':
      return cur < 0 ? { ...s, display: 'Error', acc: null, op: null, fresh: true, error: true } : result(Math.sqrt(cur));
    case '%': {
      // 200 + 10% = 220; 50 × 10% = 5; on its own: ÷ 100.
      const n = s.acc !== null && (s.op === '+' || s.op === '−') ? (s.acc * cur) / 100 : cur / 100;
      return { ...result(n), fresh: true };
    }
    case '+':
    case '−':
    case '×':
    case '÷': {
      if (s.acc !== null && s.op && !s.fresh) {
        const n = apply(s.acc, s.op, cur);
        const r = result(n);
        return r.error ? r : { ...r, acc: n, op: key };
      }
      return { ...s, acc: s.acc !== null && s.fresh && s.op ? s.acc : cur, op: key, fresh: true };
    }
    case '=': {
      if (s.acc === null || !s.op) return { ...s, fresh: true };
      const r = result(apply(s.acc, s.op, cur));
      return { ...r, acc: null, op: null };
    }
    case 'MC':
      return { ...s, memory: 0 };
    case 'MR':
      return { ...s, display: formatNumber(s.memory), fresh: true };
    case 'M+':
      return { ...s, memory: s.memory + cur, fresh: true };
    case 'M−':
      return { ...s, memory: s.memory - cur, fresh: true };
    default:
      return s;
  }
}

const KEYS: { k: string; label?: string; tone?: 'op' | 'fn' | 'eq' | 'mem'; wide?: boolean }[] = [
  { k: 'MC', tone: 'mem' },
  { k: 'MR', tone: 'mem' },
  { k: 'M+', tone: 'mem' },
  { k: 'M−', tone: 'mem' },
  { k: 'AC', tone: 'fn' },
  { k: 'C', label: 'CE', tone: 'fn' },
  { k: '⌫', tone: 'fn' },
  { k: '÷', tone: 'op' },
  { k: '7' },
  { k: '8' },
  { k: '9' },
  { k: '×', tone: 'op' },
  { k: '4' },
  { k: '5' },
  { k: '6' },
  { k: '−', tone: 'op' },
  { k: '1' },
  { k: '2' },
  { k: '3' },
  { k: '+', tone: 'op' },
  { k: '±', tone: 'fn' },
  { k: '0' },
  { k: '.' },
  { k: '%', tone: 'fn' },
  { k: '√', tone: 'fn' },
  { k: '=', tone: 'eq', wide: true },
];

/** Keyboard keys the calculator takes while it has focus. */
const KEYMAP: Record<string, string> = { '+': '+', '-': '−', '*': '×', x: '×', '/': '÷', Enter: '=', '=': '=', Backspace: '⌫', Escape: 'AC', Delete: 'C', '%': '%', '.': '.', ',': '.' };

/**
 * A basic on-screen calculator like the one in the UTME CBT software: + − × ÷,
 * %, √, ±, memory (MC MR M+ M−) and clear. It floats over the paper and does
 * not block it; typing goes to it only while it has focus.
 */
export function OnScreenCalculator({ open, onClose, className }: { open: boolean; onClose: () => void; className?: string }) {
  const [s, setS] = useState<CalcState>(START);
  if (!open) return null;
  const hit = (k: string) => setS((x) => press(x, k));
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = /^[0-9]$/.test(e.key) ? e.key : KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    e.stopPropagation();
    if (k === 'AC' && s.display === '0' && s.acc === null) onClose();
    else hit(k);
  };
  return (
    <div
      role="dialog"
      aria-label="Calculator"
      tabIndex={-1}
      onKeyDown={onKey}
      data-calculator
      className={cn('fixed bottom-20 right-3 z-40 w-[17.5rem] rounded-2xl border border-border bg-card p-3 shadow-pop outline-none focus-within:ring-2 focus-within:ring-ring lg:bottom-6 lg:right-6', className)}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold">
          <CalcIcon className="size-3.5" aria-hidden /> Calculator
        </p>
        <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Close calculator">
          <X className="size-4" />
        </button>
      </div>
      <div className="mb-2 rounded-xl bg-muted px-3 py-2 text-right">
        <p className="h-4 truncate text-[11px] tabular text-muted-foreground" aria-hidden>
          {s.memory !== 0 ? 'M ' : ''}
          {s.acc !== null && s.op ? `${formatNumber(s.acc)} ${s.op}` : ''}
        </p>
        <output className={cn('block truncate font-mono text-[24px] font-semibold tabular', s.error && 'text-danger')} aria-live="polite" data-testid="calc-display">
          {s.display}
        </output>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.map((key) => (
          <button
            key={key.k}
            type="button"
            onClick={() => hit(key.k)}
            aria-label={key.k === '√' ? 'Square root' : key.k === '⌫' ? 'Backspace' : key.k === '±' ? 'Change sign' : key.label ?? key.k}
            className={cn(
              'h-10 rounded-lg text-[15px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97]',
              key.wide && 'col-span-3',
              key.tone === 'op' ? 'bg-brand-soft text-brand hover:bg-brand/15' : key.tone === 'eq' ? 'bg-brand text-brand-foreground hover:bg-brand/90' : key.tone === 'fn' ? 'bg-muted hover:bg-muted/70' : key.tone === 'mem' ? 'bg-muted/60 text-[12.5px] text-muted-foreground hover:bg-muted' : 'border border-border bg-background hover:bg-muted/60',
            )}
          >
            {key.label ?? key.k}
          </button>
        ))}
      </div>
    </div>
  );
}
