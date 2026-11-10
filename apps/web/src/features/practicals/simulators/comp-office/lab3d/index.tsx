import { coStartState, compOfficeVariant, emptyCompOfficeState, type CoTask, type CompOfficeState, type CriterionScore } from '@aischool/shared';
import { ArrowLeft, FlaskConical } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import { assistantProfile } from '../../../lab3d-kit/assistant-profile';
import type { GuideStep } from '../../../lab3d-kit/guide';
import { ModeBar, type ObjectPanel } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import type { SimulatorProps } from '../../types';
import { lessonTask, nextHint, useChecks, useOffice, type Office } from '../actions';
import { Desktop } from '../desktop';
import { compOfficeMissing } from '../missing';
import { Notebook, TaskText } from '../notebook';
import { SANDBOX_IDEAS, learnConfig, officeAsk, officeExplainer, officeSafety, officeTour } from './content';
import { useOfficeDemo } from './demo';
import { OfficeScene, VIEW_BUTTONS } from './scene';

/**
 * The computer room in 3D: the same practicals as the 2D lab (same state,
 * same apps, same marks). The bench has a real PC; "Use the computer" sits
 * you at the screen and opens the application. Learn, the instructor's demo
 * on another seed, Try, an unmarked sandbox and Ask; a timed practical is Try only.
 */

const CUP = [
  { id: 'flash', label: 'Flash drive' },
  { id: 'paper', label: 'A4 paper' },
];
const SANDBOX_SEED = 616_161;

function useSandbox(task: CoTask, startedAt: string) {
  const [round, setRound] = useState(0);
  const v = useMemo(() => compOfficeVariant(SANDBOX_SEED + round, task), [task, round]);
  const [state, setState] = useState<CompOfficeState>(() => coStartState(v));
  useEffect(() => setState(coStartState(v)), [v]);
  const o = useOffice({ seed: v.seed, state, onChange: setState, readOnly: false, startedAt, variant: v });
  return { o, v, state, start: () => setRound((r) => r + 1) };
}

/** Friendly explanations of the mistakes the log shows. */
function correctionFor(a: string, s: CompOfficeState) {
  const m = /^sheet:set:(.+)$/.exec(a);
  if (m) {
    const f = s.sheet.cells[m[1]!]?.f ?? '';
    if (/^(sum|average|max|min|if|count|rank|countif)\(/i.test(f)) return { title: 'Begin a formula with =', why: 'Without the equals sign the spreadsheet stores your typing as text and calculates nothing.' };
    if (/^=.*%\s*$/.test(f) && /7\.5%/.test(f)) return null;
  }
  if (a === 'mail:refused') return { title: 'The message is too large', why: 'Attachments grow by about a third when they are encoded. Compress the files or share a link.' };
  return null;
}

export default function CompOfficeLab3D(props: SimulatorProps<'comp-office'>) {
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  useMemo(() => setAssistant({ name: 'Mr Bayo', role: 'computer instructor', look: 'bayo', pronoun: 'his' }), []);
  const attempt = useOffice({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started });
  const { stage, work, practice, teach } = kit;
  // A practical test can run in LAB mode: no guided steps, hints or corrections while it is being sat.
  const guided = kit.guided && !kit.sitting;
  const demo = useOfficeDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o: Office = stage === 'sandbox' ? sandbox.o : attempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = o.v;
  const checks = useChecks(v, state.task ? state : { ...state, task });
  const camMode = useLabView((x) => x.mode);
  const on = state.log.some((e) => e.a === 'power:on') || readOnly || stage === 'sandbox';
  const collected = useMemo(() => {
    const out = new Set<string>();
    for (const e of state.log) {
      const [k, id] = e.a.split(':');
      if (k === 'collect') out.add(id!);
      else if (k === 'return') out.delete(id!);
    }
    return out;
  }, [state.log]);
  useEffect(() => {
    if (stage === 'demo' || stage === 'learn') useLabView.setState((x) => ({ ada: { ...x.ada, goggles: false } }));
  }, [stage]);

  const useComputer = useCallback(() => {
    if (!on) {
      o.note('power:on');
      play('tick');
      notify('UPS, then the computer: switched on.', 'success', 1500);
    }
    useLabView.getState().set({ mode: 'read', selected: null });
  }, [on, o]);

  const steps = useMemo((): GuideStep[] => {
    // One step with no answer in it, so the assistant has something honest to say in a test.
    if (kit.sitting) return [{ id: 'test', label: 'Work through your task card', target: null, why: 'This is a test, so there are no step-by-step hints.', done: false }];
    if (!guided) return [];
    return [
      { id: 'power', label: 'Switch on the power and the computer', target: 'ups', why: 'Switch on the UPS (the battery backup) first: it protects the computer from surges and power cuts.', done: on },
      ...checks.map((c): GuideStep => ({ id: c.id, label: c.crit === 'calculation' ? `Notebook: ${c.label}` : c.label, target: c.crit === 'calculation' ? null : 'monitor', why: c.why ?? (c.crit === 'calculation' ? 'Work it out from your own data and write it in your notebook.' : 'Use the computer: the step is on your task card.'), done: c.done, group: c.crit === 'calculation' ? 'Notebook' : 'On the computer' })),
      { id: 'written', label: 'Write your precautions and the explanation', target: null, why: 'Marked by the teacher’s guide: say what you did and why.', done: !!state.written.precautions.trim() && !!state.written.explain.trim(), group: 'Notebook' },
    ];
  }, [kit.sitting, guided, checks, on, state.written]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided) return;
    for (const e of fresh) {
      const c = correctionFor(e.a, state);
      if (c) kit.correct(c);
    }
  });
  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dStage: stage, __lab3dShown: state });

  const objectPanel = (id: string): ObjectPanel | null => {
    const close = () => useLabView.getState().set({ selected: null });
    if (id === 'monitor' || id === 'keyboard' || id === 'mouse') return { title: id === 'monitor' ? 'Monitor' : id === 'keyboard' ? 'Keyboard' : 'Mouse', info: on ? 'The computer is on.' : 'The computer is off.', actions: [{ key: 'use', label: 'Use the computer', tone: 'brand', run: useComputer }] };
    if (id === 'ups' || id === 'tower') return { title: id === 'ups' ? 'UPS' : 'System unit', info: on ? 'Running.' : 'Off.', actions: on ? [] : [{ key: 'on', label: 'Switch on', tone: 'brand', run: () => (o.note('power:on'), play('tick'), close()) }] };
    if (id === 'printer') return { title: 'Printer', info: 'Print from the application, after a preview.', actions: [] };
    if (id === 'flash' || id === 'paper') return { title: id === 'flash' ? 'Flash drive' : 'A4 paper', actions: [{ key: 'ret', label: 'Put it back', run: () => (o.note(`return:${id}`), close()) }] };
    return null;
  };
  const screenOpen = (camMode === 'read' && (work || readOnly)) && !kit.intro;
  const overlay = screenOpen ? (
    <div className={`pointer-events-auto absolute inset-x-1 bottom-1 z-[9] flex flex-col gap-1 ${practice ? 'top-[5.1rem]' : 'top-12'} sm:inset-x-3 sm:bottom-3`} data-co-screen>
      <div className="flex items-center gap-2 rounded-lg bg-black/70 px-2 py-1 text-[12px] text-white">
        <Button size="sm" variant="outline" className="h-7 border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => useLabView.getState().set({ mode: 'bench', focus: 'bench' })} aria-label="Back to the room">
          <ArrowLeft /> Room
        </Button>
        {stage === 'sandbox' && <span className="shrink-0 rounded bg-white/15 px-1.5 text-[11px] font-semibold uppercase tracking-wide">Sandbox, unmarked</span>}
        {teach && <span className="min-w-0 truncate">{nextHint(checks)}</span>}
      </div>
      <Desktop o={o} className="h-full min-h-0 flex-1" />
    </div>
  ) : null;
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' || c.id === 'product' ? { mode: 'read' as const, focus: 'bench' } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const family = v.family;
  return (
    <LabShell
      kit={kit}
      title="Computer room"
      heading={`Computer room — ${v.title.toLowerCase()}`}
      intro={{
        short: 'Sit at your bench, switch on, use the computer, and record your answers in the notebook.',
        steps: ['Walk to your bench (or go straight to it).', 'Switch on the UPS, then the computer.', 'Choose Use the computer: the application opens and the task card tells you what to do.', 'Write your answers in the notebook, then hand in.'],
      }}
      readingStatus="at the computer"
      scene={<OfficeScene s={stage === 'demo' ? demo.state : state} v={stage === 'demo' ? demo.v : v} on={on || stage === 'demo' || stage === 'learn'} collected={collected} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />}
      overlay={overlay}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={teach && !guided && camMode !== 'read' ? nextHint(checks) : null}
      objectPanel={(id) => (work ? objectPanel(id) : null)}
      explain={officeExplainer}
      task={<TaskText o={o} />}
      notebook={<Notebook o={o} />}
      cupboard={{
        blurb: 'Take what you need to your bench.',
        items: CUP,
        has: (id) => collected.has(id),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry: (id) => o.note(`collect:${id}`),
      }}
      modeBar={<ModeBar views={VIEW_BUTTONS} read={{ label: 'Use the computer', can: true }} onRead={useComputer} />}
      learn={useMemo(learnConfig, [])}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <div className="space-y-3 text-[13.5px]">
            <p className="text-muted-foreground">The same practical with fresh data. {SANDBOX_IDEAS[family]} Nothing here is marked or saved.</p>
            <Button
              variant="brand"
              onClick={() => {
                sandbox.start();
                kit.goStage('sandbox');
                useLabView.getState().set({ mode: 'read' });
              }}
            >
              <FlaskConical /> Start the sandbox
            </Button>
          </div>
        ),
        // At the screen the bar above it says Sandbox instead: the card would sit half under it.
        results: screenOpen ? null : <section className="pointer-events-auto w-[min(260px,calc(100vw-1rem))] rounded-2xl border border-white/15 bg-black/60 p-2.5 text-[12.5px] text-white shadow-xl backdrop-blur" aria-label="Sandbox"><p className="text-[11.5px] font-semibold uppercase tracking-wide text-white/70">Sandbox (unmarked)</p><p>Data for practice only. Go on, break it.</p></section>,
      }}
      ask={{ suggestions: officeAsk(family), extra: stage === 'try' ? undefined : `What does ${assistantProfile.name} check first?` }}
      tourSteps={useMemo(officeTour, [])}
      safety={officeSafety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => attempt.note(`safety-briefing:${outcome}`)}
      missing={compOfficeMissing(attemptState, seed)}
      onResetStation={() => undefined}
      debriefView={debriefView}
      canRead
    />
  );
}
void emptyCompOfficeState;
