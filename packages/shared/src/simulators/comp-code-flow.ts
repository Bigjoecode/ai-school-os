import { z } from 'zod';
import { BasicMachine, parseCondition, parseFragment, type BasicOptions, type BasicProgram, type BasicStatus } from './comp-code-basic';

/**
 * Flowcharts as data, with a runner: every box's text is compiled by the BASIC
 * parser and run by the BASIC machine, so a chart can be traced box by box and
 * marked on hidden inputs under the same limits as a program.
 *
 * Box text is what a student writes: START, STOP, INPUT X, READ A, B, C,
 * PRINT SUM / 5, OUTPUT Y, SUM = SUM + X, COUNT = 5?, IS N > 19?
 */

export const FLOW_KINDS = ['TERMINAL', 'IO', 'PROCESS', 'DECISION', 'CONNECTOR'] as const;
export type FlowKind = (typeof FLOW_KINDS)[number];
export const FLOW_KIND_LABEL: Record<FlowKind, string> = { TERMINAL: 'Terminal (Start / Stop)', IO: 'Input / output', PROCESS: 'Process', DECISION: 'Decision', CONNECTOR: 'Connector' };
export const FLOW_KIND_SHAPE: Record<FlowKind, string> = { TERMINAL: 'oval', IO: 'parallelogram', PROCESS: 'rectangle', DECISION: 'diamond', CONNECTOR: 'circle' };
export const FLOW_LIMITS = { nodes: 40, edges: 60, text: 80 } as const;

export interface FlowNode {
  id: string;
  kind: FlowKind;
  text: string;
  x: number;
  y: number;
}
export interface FlowEdge {
  from: string;
  to: string;
  label: '' | 'YES' | 'NO';
}
export interface FlowChart {
  nodes: FlowNode[];
  edges: FlowEdge[];
}
export const emptyFlowChart = (): FlowChart => ({ nodes: [], edges: [] });

export const flowChartSchema = z.object({
  nodes: z
    .array(z.object({ id: z.string().min(1).max(12), kind: z.enum(FLOW_KINDS), text: z.string().max(FLOW_LIMITS.text), x: z.number().min(-200).max(4000), y: z.number().min(-200).max(4000) }))
    .max(FLOW_LIMITS.nodes),
  edges: z.array(z.object({ from: z.string().max(12), to: z.string().max(12), label: z.enum(['', 'YES', 'NO']) })).max(FLOW_LIMITS.edges),
});

export type FlowRole = 'START' | 'STOP' | 'INPUT' | 'OUTPUT' | 'ASSIGN' | 'CONDITION' | 'CONNECT' | 'UNKNOWN';
const clean = (t: string) => t.trim().replace(/←|<-/g, '=').replace(/×/g, '*').replace(/÷/g, '/');

/** What a box's text says it does, whatever shape it was drawn in. */
export function flowRole(n: Pick<FlowNode, 'kind' | 'text'>): FlowRole {
  const t = clean(n.text);
  if (n.kind === 'CONNECTOR' && t.length <= 3) return 'CONNECT';
  if (/^(start|begin)$/i.test(t)) return 'START';
  if (/^(stop|end)$/i.test(t)) return 'STOP';
  if (/^(input|read|enter|get|accept)\b/i.test(t)) return 'INPUT';
  if (/^(print|output|display|write|show)\b/i.test(t)) return 'OUTPUT';
  if (n.kind === 'DECISION' || /\?\s*$/.test(t) || /^is\b/i.test(t)) return 'CONDITION';
  if (/^(let\s+)?[A-Za-z][A-Za-z0-9]*\s*=/.test(t)) return 'ASSIGN';
  return 'UNKNOWN';
}

/** The right shape for a box's job (null: any). */
export const flowShapeFor = (r: FlowRole): FlowKind | null => (r === 'START' || r === 'STOP' ? 'TERMINAL' : r === 'INPUT' || r === 'OUTPUT' ? 'IO' : r === 'ASSIGN' ? 'PROCESS' : r === 'CONDITION' ? 'DECISION' : null);

function compile(n: FlowNode): { program: BasicProgram | null; cond: unknown | null } {
  const t = clean(n.text);
  switch (flowRole(n)) {
    case 'INPUT':
      return { program: parseFragment(`INPUT ${t.replace(/^\S+\s*/, '')}`), cond: null };
    case 'OUTPUT':
      return { program: parseFragment(`PRINT ${t.replace(/^\S+\s*/, '')}`), cond: null };
    case 'ASSIGN':
      return { program: parseFragment(t.split(/\s*[;,]\s*(?=[A-Za-z][A-Za-z0-9]*\s*=)/).join(' : ')), cond: null };
    case 'CONDITION':
      return { program: null, cond: parseCondition(t.replace(/^is\s+/i, '').replace(/\?\s*$/, '')) };
    default:
      return { program: null, cond: null };
  }
}

export type FlowStatus = BasicStatus;
export interface FlowFault {
  message: string;
  node: string | null;
}

/** Runs a chart one box at a time. */
export class FlowRunner {
  status: FlowStatus = 'ready';
  cur: string | null;
  fault: FlowFault | null = null;
  /** Boxes run so far. */
  steps = 0;
  readonly machine: BasicMachine;
  private readonly chart: FlowChart;
  private readonly code = new Map<string, ReturnType<typeof compile>>();

  constructor(chart: FlowChart, opts: BasicOptions = {}) {
    this.chart = chart;
    this.machine = new BasicMachine(parseFragment('REM')!, opts);
    const start = chart.nodes.find((n) => flowRole(n) === 'START');
    this.cur = start?.id ?? null;
    if (!start) this.fail('There is no START box.', null);
  }
  private fail(message: string, node: string | null) {
    this.status = 'error';
    this.fault = { message, node };
    return this.status;
  }
  get output() {
    return this.machine.output;
  }
  get ticks() {
    return this.machine.ticks;
  }
  get running() {
    return this.status === 'ready' || this.status === 'running';
  }
  private node(id: string) {
    return this.chart.nodes.find((n) => n.id === id) ?? null;
  }
  private compiled(n: FlowNode) {
    let c = this.code.get(n.id);
    if (!c) this.code.set(n.id, (c = compile(n)));
    return c;
  }
  private follow(n: FlowNode, label: '' | 'YES' | 'NO') {
    const out = this.chart.edges.filter((e) => e.from === n.id);
    const e = label ? out.find((x) => x.label === label) : out[0];
    if (!e) return this.fail(label ? `The decision “${n.text}” has no ${label} arrow.` : `“${n.text}” has no arrow leaving it.`, n.id);
    if (!this.node(e.to)) return this.fail('An arrow leads nowhere.', n.id);
    this.cur = e.to;
    this.status = 'running';
    return this.status;
  }
  private afterMachine(id: string) {
    this.status = this.machine.status === 'limit' ? 'limit' : 'error';
    this.fault = { message: this.machine.fault?.message ?? 'The chart stopped.', node: id };
    return this.status;
  }

  /** Does the current box and moves on. Stops at an INPUT (feed it), at STOP or on a fault. */
  step(): FlowStatus {
    if (!this.running) return this.status;
    const n = this.cur ? this.node(this.cur) : null;
    if (!n) return this.fail('The chart has lost its way.', null);
    if (!this.machine.spend()) return this.afterMachine(n.id);
    this.steps++;
    const role = flowRole(n);
    if (role === 'START' || role === 'CONNECT') return this.follow(n, '');
    if (role === 'STOP') return (this.status = 'done');
    if (role === 'UNKNOWN') return this.fail(`“${n.text || 'This box'}” is not something the computer can do.`, n.id);
    const c = this.compiled(n);
    if (role === 'CONDITION') {
      if (c.cond === null) return this.fail(`Cannot work out “${n.text}”.`, n.id);
      const t = this.machine.truth(c.cond);
      if (t === null) return this.afterMachine(n.id);
      return this.follow(n, t ? 'YES' : 'NO');
    }
    if (!c.program) return this.fail(`Cannot read “${n.text}”.`, n.id);
    this.machine.load(c.program);
    const st = this.machine.run();
    if (st === 'input') return (this.status = 'input');
    if (st !== 'done') return this.afterMachine(n.id);
    return this.follow(n, '');
  }

  /** Answers the box waiting at INPUT. */
  feed(line: string): FlowStatus {
    if (this.status !== 'input') return this.status;
    const st = this.machine.feed(line);
    if (st === 'input') return this.status;
    const n = this.node(this.cur!)!;
    if (st === 'running') this.machine.run();
    if (this.machine.status === 'done') return this.follow(n, '');
    return this.afterMachine(n.id);
  }
  run(): FlowStatus {
    while (this.running) this.step();
    return this.status;
  }
  watch() {
    return this.machine.watch();
  }
}

export interface FlowRun {
  status: FlowStatus;
  output: string;
  fault: FlowFault | null;
  ticks: number;
  steps: number;
}

/** Runs a chart to STOP, answering INPUT boxes from `values`, one value per variable. */
export function runFlow(chart: FlowChart, values: string[] = [], opts: BasicOptions = {}): FlowRun {
  const r = new FlowRunner(chart, { echo: false, ...opts });
  let next = 0;
  for (;;) {
    const st = r.run();
    if (st !== 'input') break;
    const count = r.machine.need?.count ?? 1;
    if (next + count > values.length) {
      r.status = 'no-input';
      break;
    }
    r.feed(values.slice(next, next + count).join(','));
    next += count;
    if (r.status === 'input') {
      r.status = 'no-input';
      break;
    }
  }
  return { status: r.status, output: r.output, fault: r.fault, ticks: r.ticks, steps: r.steps };
}

export interface FlowFacts {
  starts: number;
  stops: number;
  /** Boxes in the wrong shape for what they say. */
  wrongShape: string[];
  /** Decisions without one YES and one NO arrow. */
  badDecisions: string[];
  /** Boxes that can't be reached from START. */
  unreachable: string[];
  /** Boxes (not STOP) with no arrow out. */
  deadEnds: string[];
  /** A path comes back to an earlier box. */
  loop: boolean;
  /** Boxes the computer can't read. */
  unreadable: string[];
}

/** What a marker checks by eye on a chart. */
export function flowFacts(c: FlowChart): FlowFacts {
  const roles = new Map(c.nodes.map((n) => [n.id, flowRole(n)]));
  const out = (id: string) => c.edges.filter((e) => e.from === id && roles.has(e.to));
  const starts = c.nodes.filter((n) => roles.get(n.id) === 'START');
  const seen = new Set<string>();
  let loop = false;
  const walk = (id: string, path: Set<string>) => {
    if (path.has(id)) {
      loop = true;
      return;
    }
    if (seen.has(id)) return;
    seen.add(id);
    path.add(id);
    for (const e of out(id)) walk(e.to, path);
    path.delete(id);
  };
  for (const s of starts) walk(s.id, new Set());
  const name = (n: FlowNode) => n.text || FLOW_KIND_LABEL[n.kind];
  return {
    starts: starts.length,
    stops: c.nodes.filter((n) => roles.get(n.id) === 'STOP').length,
    wrongShape: c.nodes
      .filter((n) => {
        const want = flowShapeFor(roles.get(n.id)!);
        return want !== null && want !== n.kind;
      })
      .map(name),
    badDecisions: c.nodes
      .filter((n) => n.kind === 'DECISION')
      .filter((n) => {
        const labels = out(n.id).map((e) => e.label);
        return !(labels.length === 2 && labels.includes('YES') && labels.includes('NO'));
      })
      .map(name),
    unreachable: c.nodes.filter((n) => !seen.has(n.id)).map(name),
    deadEnds: c.nodes.filter((n) => roles.get(n.id) !== 'STOP' && !out(n.id).length).map(name),
    loop,
    unreadable: c.nodes
      .filter((n) => {
        const r = roles.get(n.id)!;
        if (r === 'UNKNOWN') return true;
        if (r === 'INPUT' || r === 'OUTPUT' || r === 'ASSIGN') return !compile(n).program;
        return r === 'CONDITION' && compile(n).cond === null;
      })
      .map(name),
  };
}
