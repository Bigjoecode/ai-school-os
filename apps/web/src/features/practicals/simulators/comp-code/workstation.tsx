import { compFamily, emptyFlowChart, type CompCodeState, type CompProgramDef } from '@aischool/shared';
import { Check, Save } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Comp } from './actions';
import { CrimpBench, MaintBench } from './bench';
import { OutputScreen, RunnerBar, Watch, useBasicRunner } from './console';
import { CodeEditor } from './editor';
import { FlowBuilder } from './flow-builder';
import { HtmlLab } from './html-lab';

/** The computer itself: the program editor, the flowchart sheet, the page editor or the workshop bench, the same in 2D and in the 3D overlay. */

function SaveBox({ c, p, readOnly, state }: { c: Comp; p: CompProgramDef; readOnly: boolean; state: CompCodeState }) {
  const saved = state.names[p.id] ?? '';
  const [name, setName] = useState(saved);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Input data-cc="save-name" value={name} onChange={(e) => setName(e.target.value)} disabled={readOnly} placeholder="File name" aria-label="File name" className="h-8 w-44 font-mono text-[12.5px]" maxLength={40} />
      <Button size="sm" variant="outline" data-cc="save" disabled={readOnly || !name.trim()} onClick={() => c.saveAs(p.id, name.trim())}>
        <Save /> Save
      </Button>
      {saved && (
        <span className="inline-flex items-center gap-1 text-[12px] text-success">
          <Check className="size-3.5" aria-hidden /> Saved as {saved}
        </span>
      )}
    </div>
  );
}

function BasicProgramPanel({ c, p, readOnly, state }: { c: Comp; p: CompProgramDef; readOnly: boolean; state: CompCodeState }) {
  const src = state.programs[p.id] ?? '';
  const r = useBasicRunner(src, (status) => c.note(`run:${p.id}:${status}`));
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] [&>*]:min-w-0">
      <div className="space-y-2">
        <CodeEditor value={src} onChange={(t) => c.setSource(p.id, t)} lang="basic" readOnly={readOnly} errorLine={r.errorLine} currentLine={r.currentLine} onRun={r.run} label={`BASIC editor, program ${p.id}`} />
        <SaveBox c={c} p={p} readOnly={readOnly} state={state} />
      </div>
      <div className="space-y-2">
        <RunnerBar r={r} disabled={readOnly} />
        <OutputScreen text={r.output} prompt={!!r.waiting} onEnter={r.feed} />
        <Watch rows={r.watch} />
      </div>
    </div>
  );
}

function Tabs({ c, active, setActive, state }: { c: Comp; active: number; setActive: (i: number) => void; state: CompCodeState }) {
  const fam = c.family;
  if (c.v.programs.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-1" role="tablist">
      {c.v.programs.map((p, i) => {
        const has = fam === 'FLOW' ? !!state.charts[p.id]?.nodes.length : !!state.programs[p.id]?.trim();
        return (
          <button key={p.id} type="button" role="tab" aria-selected={active === i} data-cc={`tab-${p.id}`} onClick={() => setActive(i)} className={cn('rounded-lg border px-2.5 py-1 text-[12.5px]', active === i ? 'border-brand bg-brand/10 font-semibold' : 'border-border text-muted-foreground')}>
            {fam === 'FLOW' ? 'Chart' : 'Program'} {p.id}: {p.title}
            {has ? ' ·' : ''}
          </button>
        );
      })}
    </div>
  );
}

export function Workstation({ c, state, readOnly, tab, setTab }: { c: Comp; state: CompCodeState; readOnly: boolean; tab?: number; setTab?: (i: number) => void }) {
  const [own, setOwn] = useState(0);
  const active = tab ?? own;
  const setActive = setTab ?? setOwn;
  const p = c.v.programs[Math.min(active, c.v.programs.length - 1)];
  const fam = compFamily(c.task);
  if (c.task === 'CRIMP') return <CrimpBench c={c} readOnly={readOnly} />;
  if (c.task === 'MAINT') return <MaintBench c={c} readOnly={readOnly} />;
  if (!p) return null;
  if (fam === 'HTML')
    return (
      <div className="space-y-2">
        <HtmlLab source={state.programs.page ?? ''} fileName={state.names.page || 'untitled.html'} onChange={(t) => c.setSource('page', t)} readOnly={readOnly} />
        <SaveBox c={c} p={p} readOnly={readOnly} state={state} />
      </div>
    );
  return (
    <div className="space-y-2">
      <Tabs c={c} active={active} setActive={setActive} state={state} />
      {fam === 'FLOW' ? (
        <div key={p.id} className="space-y-1">
          <p className="text-[12.5px] text-muted-foreground">{p.brief[0]}</p>
          <FlowBuilder chart={state.charts[p.id] ?? emptyFlowChart()} onChange={(ch, log) => c.setChart(p.id, ch, log)} readOnly={readOnly} sample={p.sample.join(', ')} onTraced={(s) => c.note(`run:${p.id}:${s}`)} name={p.id} />
        </div>
      ) : (
        <BasicProgramPanel key={p.id} c={c} p={p} readOnly={readOnly} state={state} />
      )}
    </div>
  );
}
