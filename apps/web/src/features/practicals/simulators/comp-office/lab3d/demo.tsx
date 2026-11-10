import { coAiText, coModelState, coStartState, compOfficeVariant, emptyCompOfficeState, type CoTask, type CompOfficeState } from '@aischool/shared';
import { useMemo, useState } from 'react';
import { useDemoPlayer, type DemoStep as KitDemoStep } from '../../../lab3d-kit/demo-player';
import { useOffice, type Office } from '../actions';
import { Desktop } from '../desktop';
import { SCREEN_SPOT } from './content';

/**
 * The instructor's demonstration: the same practical on another seed, shown
 * growing from the start of the attempt to the model answer, one task-card
 * step at a time. It has its own in-memory state and never touches the attempt.
 */

const part = <T,>(xs: T[], f: number) => xs.slice(0, Math.ceil(xs.length * f));
/** The work as it stands a fraction of the way through. */
export function coDemoFrame(a: CompOfficeState, b: CompOfficeState, f: number): CompOfficeState {
  if (f >= 1) return b;
  const changed = Object.keys(b.sheet.cells).filter((k) => JSON.stringify(a.sheet.cells[k]) !== JSON.stringify(b.sheet.cells[k]));
  const cells = { ...a.sheet.cells };
  for (const k of part(changed, f)) cells[k] = b.sheet.cells[k]!;
  return {
    ...a,
    sheet: { ...a.sheet, cells, charts: f > 0.7 ? part(b.sheet.charts, f) : a.sheet.charts, widths: f > 0.3 ? b.sheet.widths : a.sheet.widths, cond: f > 0.5 ? b.sheet.cond : a.sheet.cond, freeze: f > 0.6 ? b.sheet.freeze : 0, print: f > 0.8 ? b.sheet.print : a.sheet.print },
    doc: { ...a.doc, paras: b.doc.paras.map((p, i) => (i < b.doc.paras.length * f ? p : (a.doc.paras[i] ?? p))), page: f > 0.3 ? b.doc.page : a.doc.page, border: f > 0.5 ? b.doc.border : a.doc.border, table: f > 0.4 ? b.doc.table : a.doc.table, picture: f > 0.6 ? b.doc.picture : a.doc.picture, header: f > 0.7 ? b.doc.header : a.doc.header, pageNumbers: f > 0.7 ? b.doc.pageNumbers : a.doc.pageNumbers, merge: f > 0.7 ? b.doc.merge : a.doc.merge },
    db: { ...b.db, tables: b.db.tables.map((t) => ({ ...t, rows: part(t.rows, f * 1.5 > 1 ? 1 : f * 1.5) })), relations: f > 0.5 ? b.db.relations : [], queries: f > 0.6 ? b.db.queries : a.db.queries, forms: f > 0.7 ? b.db.forms : [], reports: f > 0.8 ? b.db.reports : [] },
    deck: { ...b.deck, slides: part(b.deck.slides, f), theme: f > 0.5 ? b.deck.theme : a.deck.theme, master: f > 0.3 ? b.deck.master : a.deck.master },
    fs: { ...b.fs, nodes: a.fs.nodes.length ? [...a.fs.nodes.filter((n) => !b.fs.nodes.some((x) => x.id === n.id)), ...part(b.fs.nodes, Math.max(0.5, f))] : [] },
    web: { ...b.web, history: part(b.web.history, f), opened: part(b.web.opened, f), searches: part(b.web.searches, f), bookmarks: f > 0.6 ? b.web.bookmarks : [], downloads: f > 0.7 ? b.web.downloads : [] },
    mail: { ...b.mail, signedIn: b.mail.signedIn || f < 1, signedOut: false, sent: part(b.mail.sent, f), spam: f > 0.7 ? b.mail.spam : [] },
    cloud: { ...b.cloud, uploads: f > 0.3 ? b.cloud.uploads : [], shares: f > 0.5 ? b.cloud.shares : [], chat: f > 0.8 ? b.cloud.chat : '' },
  };
}

interface Ctx {
  go: (f: number) => void;
}
type Step = KitDemoStep<Ctx>;

export function useOfficeDemo({ studentSeed, task, startedAt, active, onFinished }: { studentSeed: number; task: CoTask; startedAt: string; active: boolean; onFinished: () => void }) {
  const v = useMemo(() => compOfficeVariant(studentSeed + 73, task), [studentSeed, task]);
  const start = useMemo(() => coStartState(v), [v]);
  const model = useMemo(() => coModelState(v), [v]);
  const [f, setF] = useState(0);
  const state = useMemo(() => ({ ...coDemoFrame(start, model, f), task }), [start, model, f, task]);
  const o = useOffice({ seed: v.seed, state, onChange: () => undefined, readOnly: true, startedAt, variant: v });
  const steps = useMemo((): Step[] => {
    const view = { mode: 'bench' as const, focus: 'bench', spot: SCREEN_SPOT };
    const brief = v.brief;
    return [
      { id: 'intro', title: 'What we are doing', say: () => 'Watch me do it on my own computer, with my own data, not yours. Then it is your turn.', ms: 3800, view, panel: 'screen', beats: [] },
      ...brief.map((b, i): Step => ({ id: `s${i}`, title: `Step ${i + 1}`, say: () => b, ms: Math.min(9000, 3200 + b.length * 34), view, panel: 'screen', beats: [{ at: 900, run: (c) => c.go((i + 1) / brief.length) }] })),
      { id: 'why', title: 'Why it matters', say: () => `Now think about this: ${coAiText(task).explain.q}`, ms: 6500, view, panel: 'screen', beats: [] },
      { id: 'end', title: 'Your turn', say: () => 'That is the whole practical. Your data will be different, so work it out yourself. Remember to record your answers in the notebook.', ms: 5000, view, panel: 'screen', beats: [] },
    ];
  }, [v, task]);
  const player = useDemoPlayer<Ctx>({ steps, ctx: () => ({ go: setF }), reset: () => setF(0), beatsFor: (s) => s.beats ?? [], goggles: () => false, active, onFinished });
  const panel = () => (
    <div className="pointer-events-auto absolute inset-x-2 bottom-[11.5rem] top-14 z-[15] mx-auto max-w-3xl sm:bottom-[10rem]">
      <Desktop o={o as Office} className="h-full min-h-0" />
    </div>
  );
  return { player, panel, v, state };
}
void emptyCompOfficeState;
