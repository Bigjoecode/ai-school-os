import { COMP_TASK_TITLE, type CriterionScore } from '@aischool/shared';
import { ClipboardList, Laptop, NotebookPen, X } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import type { SimulatorProps } from '../../types';
import { lessonTask, useComp } from '../actions';
import { compCodeMissing } from '../missing';
import { CompRecord } from '../notebook';
import { compNextHint } from '../steps';
import { TaskText } from '../task-text';
import { Workstation } from '../workstation';
import { BENCH_IDLE, compViews, useCompBench, usesComputer } from './bench';
import { COMP_ASK, compExplainer, compSafety, compTour, learnConfig, learnState } from './content';
import { useCompDemo } from './demo';
import { compCorrection, compGuideSteps } from './guide';
import { compHint3d, compObjectPanel } from './lab-actions';
import { CompSandboxBadge, CompSandboxForm, useCompSandbox } from './sandbox';
import { CompLabScene } from './scene';
import { COMP_APPARATUS, COMP_APPARATUS_LABEL, compSceneFromState, type CompApparatusId } from './scene-state';

/**
 * The 3D lab: a simple computer-room bench around the 2D tools, in the kit's
 * room with Mr Bayo. The real work happens on the screen overlay (the same
 * Workstation as the 2D lab, same state, same marks); the room carries the
 * routine around it: power on, the tools, the notebook. Learn, Demo on its own
 * problem, Try, an unmarked sandbox and Ask; timed practicals are Try only.
 */

export default function CompCodeLab3D(props: SimulatorProps<'comp-code'>) {
  setAssistant({ name: 'Mr Bayo', role: 'computer lab technician', look: 'bayo', pronoun: 'his' });
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const pAttempt = useComp({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useCompSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useCompBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = useCompDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : pAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = o.v;
  const scene = useMemo(() => compSceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => compSafety(task), [task]);
  const tour = useMemo(() => compTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState } : stage === 'demo' ? { v: demo.v, state: demo.state } : { v, state };
  const shownScene = useMemo(() => compSceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  const tab = useCompBench((b) => b.tab);
  useLabView((x) => x.held);
  useEffect(() => () => useCompBench.setState(BENCH_IDLE), []);

  const steps = useMemo(() => (guided ? compGuideSteps(v, state, scene, camMode) : []), [guided, v, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = compCorrection(e.a, state) ?? found;
    if (found) kit.correct(found);
  });

  const screen = useCallback(() => useLabView.getState().set({ mode: 'read', selected: null }), []);
  const canScreen = !usesComputer(task) || scene.power;
  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage });
  const ctx = { o, s: state, scene, open: (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w)), screen, practice };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${COMP_APPARATUS_LABEL[id as CompApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const debriefView = (c: CriterionScore) => (c.id === 'work' || c.id === 'method' ? { mode: 'bench' as const, focus: 'monitor' } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const useLabel = task === 'CRIMP' ? 'Work on the cable' : task === 'MAINT' ? 'List of jobs' : 'Use the computer';

  return (
    <LabShell
      kit={kit}
      title="Computer room"
      heading={`Computer room: ${COMP_TASK_TITLE[task].toLowerCase()}`}
      intro={{
        short: 'Go to your workstation, switch on, then follow the task card.',
        steps: [usesComputer(task) ? 'Go to your workstation and switch on: UPS, monitor, then system unit.' : 'Collect what you need from the equipment cupboard.', usesComputer(task) ? 'Tap the monitor to use the computer: it fills the screen.' : 'Work at your bench: tap any object for what you can do with it.', 'Record your results and answers in your notebook.', 'Hand in when everything is recorded.'],
      }}
      readingStatus="at the computer"
      scene={<CompLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? compHint3d(ctx, compNextHint(v, state)) : null}
      objectPanel={(id) => (work ? compObjectPanel(id, ctx) : null)}
      explain={compExplainer}
      task={<TaskText v={v} />}
      notebook={<CompRecord v={v} state={state} readOnly={readOnly} w={o} book />}
      cupboard={{
        blurb: 'Take what you need to your bench, or drag it from the cupboard.',
        items: COMP_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as CompApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      dock={
        <Button size="sm" variant="brand" data-cc="open-screen" disabled={!canScreen} title={canScreen ? undefined : 'Switch the computer on first: tap the system unit.'} onClick={screen}>
          <Laptop /> {useLabel}
        </Button>
      }
      modeBar={<ModeBar views={compViews(task)} />}
      readingPanel={
        <section data-cc="screen" aria-label="The computer screen" className="pointer-events-auto absolute inset-x-1 bottom-1 top-12 z-20 flex flex-col overflow-hidden rounded-2xl bg-card text-card-foreground shadow-2xl sm:inset-x-3 sm:top-14">
          <header className="flex flex-wrap items-center gap-1.5 border-b border-border px-2.5 py-1.5">
            <p className="mr-auto truncate text-[13px] font-semibold">{COMP_TASK_TITLE[task]}</p>
            <Button size="sm" variant="outline" className="h-7" onClick={() => kit.setSheet('task')}>
              <ClipboardList /> Task
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={() => kit.setSheet('notebook')}>
              <NotebookPen /> Notebook
            </Button>
            <Button size="sm" variant="outline" className="h-7" data-cc="leave-screen" onClick={() => useLabView.getState().set({ mode: 'bench' })}>
              <X /> Back to the bench
            </Button>
          </header>
          <div className="min-h-0 flex-1 overflow-auto p-2.5">
            {practice && <p className="mb-2 rounded-lg bg-info-soft px-2.5 py-1.5 text-[12.5px] text-info">{compNextHint(v, state)}</p>}
            <Workstation key={stage} c={o} state={state} readOnly={readOnly} tab={tab} setTab={(i) => useCompBench.setState({ tab: i })} />
          </div>
        </section>
      }
      canRead={canScreen}
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <CompSandboxForm
            sandbox={sandbox}
            onStart={() => {
              sandbox.start();
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <CompSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: COMP_ASK[task], extra: stage === 'try' ? undefined : 'Why is this precaution needed?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => pAttempt.note(`safety-briefing:${outcome}`)}
      missing={compCodeMissing(attemptState, seed)}
      onResetStation={() => useCompBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
