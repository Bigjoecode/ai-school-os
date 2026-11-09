import { FLOW_KINDS, FLOW_KIND_LABEL, FLOW_LIMITS, FlowRunner, flowFacts, type FlowChart, type FlowEdge, type FlowKind, type FlowNode } from '@aischool/shared';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Link2, Play, RotateCcw, SkipForward, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { OutputScreen, Watch } from './console';

/**
 * The flowchart builder: the five standard symbols on an SVG sheet, joined by
 * arrows, and a trace that runs the chart box by box on the BASIC machine.
 * Every drag has a button: boxes move with the arrow buttons and arrows are
 * made by "Draw an arrow", then tapping the box it goes to.
 */

const W = 150;
const H = 50;
const SHEET_W = 460;

function Shape({ kind, on, flash }: { kind: FlowKind; on: boolean; flash: boolean }) {
  const fill = flash ? '#fde68a' : on ? '#dbeafe' : '#ffffff';
  const p = { fill, stroke: on ? '#1d4ed8' : '#334155', strokeWidth: on ? 2.2 : 1.5 };
  switch (kind) {
    case 'TERMINAL':
      return <rect x={-W / 2} y={-H / 2} width={W} height={H} rx={25} {...p} />;
    case 'IO':
      return <polygon points={`${-W / 2 + 18},${-H / 2} ${W / 2 + 6},${-H / 2} ${W / 2 - 18},${H / 2} ${-W / 2 - 6},${H / 2}`} {...p} />;
    case 'PROCESS':
      return <rect x={-W / 2} y={-H / 2} width={W} height={H} {...p} />;
    case 'DECISION':
      return <polygon points={`0,${-H / 2 - 12} ${W / 2 + 14},0 0,${H / 2 + 12} ${-W / 2 - 14},0`} {...p} />;
    case 'CONNECTOR':
      return <circle r={20} {...p} />;
  }
}

const halfH = (k: FlowKind) => (k === 'DECISION' ? H / 2 + 12 : k === 'CONNECTOR' ? 20 : H / 2);
const halfW = (k: FlowKind) => (k === 'DECISION' ? W / 2 + 14 : k === 'CONNECTOR' ? 20 : W / 2);

/** Straight down when the next box is below; round the side when it goes back up. */
function edgePath(a: FlowNode, b: FlowNode, side: number) {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  if (by > ay + 20 && Math.abs(bx - ax) < 8) return { d: `M${ax},${ay + halfH(a.kind)} L${bx},${by - halfH(b.kind)}`, lx: ax + 8, ly: ay + halfH(a.kind) + 12 };
  if (by > ay + 20) {
    const mid = ay + halfH(a.kind) + 14;
    return { d: `M${ax},${ay + halfH(a.kind)} L${ax},${mid} L${bx},${mid} L${bx},${by - halfH(b.kind)}`, lx: (ax + bx) / 2, ly: mid - 4 };
  }
  const x = Math.max(ax + halfW(a.kind), bx + halfW(b.kind)) + 22 + side * 16;
  return { d: `M${ax + halfW(a.kind)},${ay} L${x},${ay} L${x},${by} L${bx + halfW(b.kind) + 3},${by}`, lx: ax + halfW(a.kind) + 12, ly: ay - 5 };
}

export function FlowSheet({ chart, selected, flash, onPick, onDrag, label }: { chart: FlowChart; selected?: string | null; flash?: string | null; onPick?: (id: string) => void; onDrag?: (id: string, x: number, y: number) => void; label: string }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);
  const height = Math.max(320, ...chart.nodes.map((n) => n.y + 70));
  const toSvg = (e: RPointerEvent) => {
    const box = svg.current!.getBoundingClientRect();
    return { x: ((e.clientX - box.left) / box.width) * SHEET_W, y: ((e.clientY - box.top) / box.height) * height };
  };
  const byId = new Map(chart.nodes.map((n) => [n.id, n]));
  let backs = 0;
  return (
    <svg ref={svg} viewBox={`0 0 ${SHEET_W} ${height}`} className="block w-full touch-pan-y rounded-xl border border-border bg-white" role="img" aria-label={label} data-cc="sheet">
      <defs>
        <marker id="cc-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0,0 L8,4 L0,8 z" fill="#334155" />
        </marker>
      </defs>
      {chart.edges.map((e, i) => {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (!a || !b) return null;
        const back = !(b.y > a.y + 20);
        const p = edgePath(a, b, back ? backs++ : 0);
        return (
          <g key={i}>
            <path d={p.d} fill="none" stroke="#334155" strokeWidth={1.5} markerEnd="url(#cc-arrow)" />
            {e.label && (
              <text x={p.lx} y={p.ly} fontSize={11} fontWeight={700} fill="#b91c1c">
                {e.label}
              </text>
            )}
          </g>
        );
      })}
      {chart.nodes.map((n) => (
        <g
          key={n.id}
          transform={`translate(${n.x},${n.y})`}
          data-node={n.id}
          className="cursor-pointer"
          onPointerDown={(e) => {
            if (!onDrag) return;
            const p = toSvg(e);
            drag.current = { id: n.id, dx: n.x - p.x, dy: n.y - p.y, moved: false };
            (e.currentTarget as Element).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || !onDrag) return;
            const p = toSvg(e);
            const nx = Math.round((p.x + d.dx) / 10) * 10;
            const ny = Math.round((p.y + d.dy) / 10) * 10;
            if (Math.abs(nx - n.x) + Math.abs(ny - n.y) > 9) {
              d.moved = true;
              onDrag(d.id, Math.max(90, Math.min(SHEET_W - 90, nx)), Math.max(40, ny));
            }
          }}
          onPointerUp={() => {
            const d = drag.current;
            drag.current = null;
            if (!d?.moved) onPick?.(n.id);
          }}
        >
          <Shape kind={n.kind} on={selected === n.id} flash={flash === n.id} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={n.text.length > 22 ? 9.5 : 11.5} fontFamily="monospace" fill="#0f172a">
            {n.text.length > 30 ? `${n.text.slice(0, 29)}…` : n.text || '…'}
          </text>
        </g>
      ))}
    </svg>
  );
}

const SHAPE_ICON: Record<FlowKind, string> = { TERMINAL: '⬭', IO: '▱', PROCESS: '▭', DECISION: '◇', CONNECTOR: '○' };

export function FlowBuilder({ chart, onChange, readOnly, sample, onTraced, name }: { chart: FlowChart; onChange: (c: FlowChart, log?: string) => void; readOnly: boolean; sample: string; onTraced: (status: string) => void; name: string }) {
  const [sel, setSel] = useState<string | null>(null);
  const [linking, setLinking] = useState<null | '' | 'YES' | 'NO'>(null);
  const runner = useRef<FlowRunner | null>(null);
  const auto = useRef(false);
  const [, tick] = useState(0);
  const node = chart.nodes.find((n) => n.id === sel) ?? null;
  const facts = useMemo(() => flowFacts(chart), [chart]);
  const nextId = () => {
    for (let i = 1; ; i++) if (!chart.nodes.some((n) => n.id === `n${i}`)) return `n${i}`;
  };
  const add = (kind: FlowKind) => {
    if (chart.nodes.length >= FLOW_LIMITS.nodes) return;
    const id = nextId();
    const below = node ?? chart.nodes.at(-1);
    const n: FlowNode = { id, kind, text: kind === 'TERMINAL' ? (chart.nodes.length ? 'STOP' : 'START') : '', x: below?.x ?? 170, y: below ? below.y + 92 : 40 };
    while (chart.nodes.some((o) => Math.abs(o.x - n.x) < 40 && Math.abs(o.y - n.y) < 60)) n.y += 92;
    const edges: FlowEdge[] = [...chart.edges];
    if (node && node.kind !== 'DECISION' && !chart.edges.some((e) => e.from === node.id)) edges.push({ from: node.id, to: id, label: '' });
    onChange({ nodes: [...chart.nodes, n], edges }, `flow:add:${kind}`);
    setSel(id);
  };
  const patch = (id: string, p: Partial<FlowNode>) => onChange({ ...chart, nodes: chart.nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) });
  const pick = (id: string) => {
    if (linking !== null && sel && id !== sel) {
      const edges = chart.edges.filter((e) => !(e.from === sel && (linking === '' || e.label === linking)));
      if (edges.length < FLOW_LIMITS.edges) onChange({ ...chart, edges: [...edges, { from: sel, to: id, label: linking }] }, 'flow:link');
      setLinking(null);
      return;
    }
    setLinking(null);
    setSel(id);
  };
  const remove = () => {
    if (!sel) return;
    onChange({ nodes: chart.nodes.filter((n) => n.id !== sel), edges: chart.edges.filter((e) => e.from !== sel && e.to !== sel) }, 'flow:remove');
    setSel(null);
  };
  const r = runner.current;
  const after = () => {
    const x = runner.current;
    if (x && !x.running && x.status !== 'input') onTraced(x.status);
    tick((n) => n + 1);
  };
  const begin = () => {
    runner.current = new FlowRunner(chart, { echo: true });
    return runner.current;
  };
  const stepTrace = () => {
    auto.current = false;
    const x = r && (r.running || r.status === 'input') ? r : begin();
    if (x.status !== 'input') x.step();
    after();
  };
  const runAll = () => {
    auto.current = true;
    begin().run();
    after();
  };
  const feed = (line: string) => {
    if (!r) return;
    r.feed(line);
    if (auto.current) r.run();
    after();
  };
  const problems = [...(facts.starts !== 1 && chart.nodes.length ? ['One START box.'] : []), ...facts.deadEnds.slice(0, 2).map((x) => `No arrow leaves “${x}”.`), ...facts.badDecisions.slice(0, 2).map((x) => `“${x}” needs YES and NO arrows.`), ...facts.unreadable.slice(0, 2).map((x) => `The computer cannot read “${x}”.`)];
  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,17rem)] [&>*]:min-w-0">
      <div className="space-y-2">
        {!readOnly && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Add a symbol">
            {FLOW_KINDS.map((k) => (
              <Button key={k} size="sm" variant="outline" className="h-8 px-2 text-[12px]" data-cc={`add-${k}`} onClick={() => add(k)} title={FLOW_KIND_LABEL[k]}>
                <span aria-hidden>{SHAPE_ICON[k]}</span> {FLOW_KIND_LABEL[k].split(' (')[0]}
              </Button>
            ))}
          </div>
        )}
        <FlowSheet chart={chart} selected={sel} flash={r?.cur ?? null} onPick={readOnly ? undefined : pick} onDrag={readOnly ? undefined : (id, x, y) => patch(id, { x, y })} label={`Flowchart ${name}`} />
      </div>
      <div className="space-y-2">
        {!readOnly && node && (
          <div className="space-y-2 rounded-xl border border-border p-2.5">
            <p className="text-[12px] font-medium text-muted-foreground">{FLOW_KIND_LABEL[node.kind]}</p>
            <Input data-cc="box-text" value={node.text} maxLength={FLOW_LIMITS.text} onChange={(e) => patch(node.id, { text: e.target.value })} placeholder={node.kind === 'DECISION' ? 'COUNT = 5?' : node.kind === 'IO' ? 'INPUT X  or  PRINT SUM' : 'SUM = SUM + X'} aria-label="Text in the box" className="font-mono text-[13px]" />
            <div className="flex flex-wrap gap-1">
              {(node.kind === 'DECISION' ? (['YES', 'NO'] as const) : ([''] as const)).map((l) => (
                <Button key={l || 'arrow'} size="sm" variant={linking === l ? 'brand' : 'outline'} className="h-8" data-cc={`arrow-${l || 'next'}`} onClick={() => setLinking(linking === l ? null : l)}>
                  <Link2 /> {l ? `${l} arrow` : 'Draw an arrow'}
                </Button>
              ))}
              <Button size="sm" variant="outline" className="h-8" onClick={() => onChange({ ...chart, edges: chart.edges.filter((e) => e.from !== node.id) }, 'flow:unlink')}>
                <X /> Clear arrows
              </Button>
              <Button size="icon-sm" variant="outline" onClick={remove} aria-label="Delete this box">
                <Trash2 />
              </Button>
            </div>
            {linking !== null && <p className="text-[12.5px] text-info">Now tap the box it goes to.</p>}
            <div className="flex gap-1" role="group" aria-label="Move the box">
              {(
                [
                  [ArrowLeft, -50, 0, 'Left'],
                  [ArrowUp, 0, -30, 'Up'],
                  [ArrowDown, 0, 30, 'Down'],
                  [ArrowRight, 50, 0, 'Right'],
                ] as const
              ).map(([Icon, dx, dy, l]) => (
                <Button key={l} size="icon-sm" variant="outline" aria-label={`Move ${l.toLowerCase()}`} onClick={() => patch(node.id, { x: Math.max(90, Math.min(SHEET_W - 90, node.x + dx)), y: Math.max(40, node.y + dy) })}>
                  <Icon />
                </Button>
              ))}
            </div>
          </div>
        )}
        {problems.length > 0 && !readOnly && (
          <ul className="list-disc space-y-0.5 rounded-xl bg-warning-soft py-2 pl-6 pr-2 text-[12.5px] text-warning">
            {problems.slice(0, 4).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="brand" data-cc="trace-run" onClick={runAll} disabled={readOnly}>
            <Play /> Run
          </Button>
          <Button size="sm" variant="outline" data-cc="trace-step" onClick={stepTrace} disabled={readOnly || r?.status === 'input'}>
            <SkipForward /> Trace a box
          </Button>
          <Button size="sm" variant="outline" onClick={() => ((runner.current = null), tick((n) => n + 1))} disabled={readOnly}>
            <RotateCcw /> Clear
          </Button>
        </div>
        <p className={cn('text-[12.5px]', r?.fault ? 'font-medium text-danger' : 'text-muted-foreground')} data-cc="status" role="status">
          {r?.fault?.message ?? (r?.status === 'input' ? 'Waiting for your input' : r?.status === 'done' ? 'Reached STOP' : r ? 'Tracing' : sample ? `Test data: ${sample}` : '')}
        </p>
        <OutputScreen text={r?.output ?? ''} prompt={r?.status === 'input'} onEnter={feed} label="Flowchart output" />
        {r && <Watch rows={r.watch()} />}
      </div>
    </div>
  );
}
