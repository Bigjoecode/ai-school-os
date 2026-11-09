import { BasicMachine, parseBasic, type BasicFault } from '@aischool/shared';
import { CornerDownLeft, Footprints, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** The output screen and INPUT line shared by the program runner and the flowchart trace. */
export function OutputScreen({ text, prompt, onEnter, label = 'Program output' }: { text: string; prompt: boolean; onEnter: (line: string) => void; label?: string }) {
  const [line, setLine] = useState('');
  const box = useRef<HTMLPreElement>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
    if (prompt) field.current?.focus({ preventScroll: true });
  }, [text, prompt]);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-black">
      <pre ref={box} data-cc="output" aria-label={label} aria-live="polite" tabIndex={0} className="m-0 h-36 overflow-auto whitespace-pre p-2.5 font-mono text-[13px] leading-5 text-[#d1fae5]">
        {text || ' '}
      </pre>
      {prompt && (
        <form
          className="flex items-center gap-1.5 border-t border-white/15 p-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            onEnter(line);
            setLine('');
          }}
        >
          <Input ref={field} data-cc="input" value={line} onChange={(e) => setLine(e.target.value)} placeholder="Type your answer, then Enter" aria-label="Program input" className="h-8 bg-white font-mono text-[13px] text-black" autoComplete="off" />
          <Button type="submit" size="sm" variant="brand" className="h-8" data-cc="enter">
            <CornerDownLeft /> Enter
          </Button>
        </form>
      )}
    </div>
  );
}

export function Watch({ rows }: { rows: { name: string; value: string }[] }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/40 p-2">
      <p className="mb-1 text-[11.5px] font-medium text-muted-foreground">Variables now</p>
      <div className="flex flex-wrap gap-1">
        {rows.map((r) => (
          <span key={r.name} className="rounded-md bg-card px-1.5 py-0.5 font-mono text-[12px]">
            {r.name} = {r.value}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Runs the source on the shared interpreter: Run, Step, INPUT, output and variables. */
export function useBasicRunner(source: string, onFinish: (status: string) => void) {
  const m = useRef<BasicMachine | null>(null);
  const stepping = useRef(false);
  const [, tick] = useState(0);
  const [fault, setFault] = useState<BasicFault | null>(null);
  const start = () => {
    setFault(null);
    const p = parseBasic(source);
    if (!p.ok) {
      m.current = null;
      setFault(p.fault);
      onFinish('error');
      return null;
    }
    m.current = new BasicMachine(p.program, { echo: true, rnd: Date.now() & 0xffff });
    return m.current;
  };
  const after = (x: BasicMachine) => {
    if (x.fault) setFault(x.fault);
    if (x.status !== 'input' && !x.running) onFinish(x.status);
    tick((n) => n + 1);
  };
  const run = () => {
    stepping.current = false;
    const x = start();
    if (x) {
      x.run();
      after(x);
    } else tick((n) => n + 1);
  };
  const step = () => {
    stepping.current = true;
    let x = m.current;
    if (!x || (!x.running && x.status !== 'input')) x = start();
    if (!x) return tick((n) => n + 1);
    if (x.status === 'input') return;
    x.step();
    after(x);
  };
  const feed = (line: string) => {
    const x = m.current;
    if (!x) return;
    x.feed(line);
    if (x.running && !stepping.current) x.run();
    after(x);
  };
  const reset = () => {
    m.current = null;
    setFault(null);
    tick((n) => n + 1);
  };
  const x = m.current;
  return { run, step, feed, reset, machine: x, fault, waiting: x?.status === 'input', output: x?.output ?? '', currentLine: stepping.current && x?.running ? x.line : null, errorLine: fault && fault.line > 0 ? fault.line : null, watch: stepping.current && x ? x.watch() : [] };
}

export function RunnerBar({ r, disabled }: { r: ReturnType<typeof useBasicRunner>; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button size="sm" variant="brand" data-cc="run" onClick={r.run} disabled={disabled}>
        <Play /> Run
      </Button>
      <Button size="sm" variant="outline" data-cc="step" onClick={r.step} disabled={disabled || r.waiting}>
        <Footprints /> Step
      </Button>
      <Button size="sm" variant="outline" onClick={r.reset} disabled={disabled}>
        <RotateCcw /> Clear
      </Button>
      <span className={cn('text-[12.5px]', r.fault ? 'font-medium text-danger' : 'text-muted-foreground')} data-cc="status" role="status">
        {r.fault ? r.fault.message : r.waiting ? 'Waiting for your input' : r.machine?.status === 'done' ? 'Finished' : r.machine ? 'Stepping' : ''}
      </span>
    </div>
  );
}
