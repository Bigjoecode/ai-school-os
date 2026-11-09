import { useMemo, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * A code editor without a library: a transparent textarea over a highlighted
 * copy of the same text, so the caret, selection, phone keyboard and undo are
 * the browser's own. Enter continues the line numbering; the key bar puts
 * BASIC words a phone keyboard makes slow within one tap.
 */

const BASIC_WORD = /\b(REM|LET|PRINT|INPUT|READ|DATA|DIM|FOR|TO|STEP|NEXT|WHILE|WEND|IF|THEN|ELSE|GOTO|GOSUB|RETURN|END|STOP|RESTORE|AND|OR|NOT|MOD|DO|LOOP|UNTIL)\b/gi;

function paintBasic(line: string): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  const num = /^\s*\d+/.exec(line);
  if (num) {
    out.push(
      <span key="n" className="text-[#7dd3fc]">
        {num[0]}
      </span>,
    );
    i = num[0].length;
  }
  const rest = line.slice(i);
  if (/^\s*(REM\b|')/i.test(rest)) {
    out.push(
      <span key="r" className="italic text-[#94a3b8]">
        {rest}
      </span>,
    );
    return out;
  }
  rest.split(/("[^"]*"?)/).forEach((part, p) => {
    if (part.startsWith('"')) {
      out.push(
        <span key={`s${p}`} className="text-[#fcd34d]">
          {part}
        </span>,
      );
      return;
    }
    let at = 0;
    for (const m of part.matchAll(BASIC_WORD)) {
      out.push(part.slice(at, m.index));
      out.push(
        <span key={`k${p}-${m.index}`} className="text-[#f9a8d4]">
          {m[0]}
        </span>,
      );
      at = m.index + m[0].length;
    }
    out.push(part.slice(at));
  });
  return out;
}
function paintHtml(line: string): ReactNode[] {
  return line.split(/(<[^>]*>?)/).map((p, i) =>
    p.startsWith('<') ? (
      <span key={i} className="text-[#7dd3fc]">
        {p}
      </span>
    ) : (
      p
    ),
  );
}

const BASIC_KEYS = ['PRINT ', 'INPUT ', 'LET ', 'READ ', 'DATA ', 'FOR ', ' TO ', ' STEP ', 'NEXT ', 'WHILE ', 'WEND', 'IF ', ' THEN ', 'DIM ', 'REM ', 'END', '"', ';', ',', '(', ')', '=', '*', '/', '^'];
const HTML_KEYS = ['<html>', '<head>', '<title>', '<body>', '<h1>', '<p>', '<ul>', '<li>', '</', '>', '<a href="', '">'];

export function CodeEditor({ value, onChange, lang, readOnly, errorLine, currentLine, onRun, label, rows = 15 }: { value: string; onChange: (v: string) => void; lang: 'basic' | 'html'; readOnly?: boolean; errorLine?: number | null; currentLine?: number | null; onRun?: () => void; label: string; rows?: number }) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const pre = useRef<HTMLPreElement>(null);
  const lines = useMemo(() => value.split('\n'), [value]);
  const put = (text: string) => {
    const el = ta.current;
    if (!el || readOnly) return;
    const a = el.selectionStart;
    const b = el.selectionEnd;
    onChange(value.slice(0, a) + text + value.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = a + text.length;
    });
  };
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'F5') {
      e.preventDefault();
      onRun?.();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      put('  ');
    } else if (e.key === 'Enter' && lang === 'basic') {
      const el = e.currentTarget;
      const from = value.lastIndexOf('\n', el.selectionStart - 1) + 1;
      const typed = value.slice(from, el.selectionStart);
      const m = /^(\d+)\s+\S/.exec(typed);
      if (m) {
        e.preventDefault();
        put(`\n${Number(m[1]) + 10} `);
      }
    }
  };
  return (
    <div className="space-y-1.5">
      <div className="relative overflow-hidden rounded-xl border border-border bg-[#0b1f4b] font-mono text-[13px] leading-[1.32rem] text-[#e2e8f0]" style={{ height: `${rows * 1.32 + 1.3}rem` }}>
        <pre ref={pre} aria-hidden className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-2.5 font-mono text-[13px] leading-[1.32rem]">
          {lines.map((l, i) => (
            <div key={i} className={cn('min-h-[1.32rem] w-max min-w-full', errorLine === i + 1 && 'bg-danger/50', currentLine === i + 1 && 'bg-[#facc15]/25')}>
              {lang === 'basic' ? paintBasic(l) : paintHtml(l)}
            </div>
          ))}
        </pre>
        <textarea
          ref={ta}
          data-cc="editor"
          aria-label={label}
          value={value}
          readOnly={readOnly}
          wrap="off"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={key}
          onScroll={(e) => {
            if (pre.current) {
              pre.current.scrollTop = e.currentTarget.scrollTop;
              pre.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
          className="absolute inset-0 m-0 size-full resize-none overflow-auto whitespace-pre bg-transparent p-2.5 font-mono text-[13px] leading-[1.32rem] text-transparent caret-white outline-none selection:bg-white/25"
        />
      </div>
      {!readOnly && (
        <div className="flex gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Keywords">
          {(lang === 'basic' ? BASIC_KEYS : HTML_KEYS).map((k) => (
            <Button key={k} type="button" size="sm" variant="outline" className="h-7 shrink-0 px-2 font-mono text-[11.5px]" onClick={() => put(k)}>
              {k.trim() || k}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
