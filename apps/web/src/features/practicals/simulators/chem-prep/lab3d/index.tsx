import { PREP_TASKS, PREP_TASK_TITLE, prepTubeTask, prepTubes, type CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import type { SimulatorProps } from '../../types';
import { lessonTask, usePrep } from '../actions';
import { chemPrepMissing } from '../missing';
import { PrepRecordAll } from '../notebook';
import { nextHint } from '../steps';
import { TaskText } from '../task-text';
import { BENCH_IDLE, VIEW_BUTTONS, usePrepBench } from './bench';
import { PREP_ASK, learnConfig, learnState, prepExplainer, prepSafety, prepTour } from './content';
import { usePrepDemo } from './demo';
import { prepCorrection, prepGuideSteps } from './guide';
import { prepHint3d, prepObjectPanel } from './lab-actions';
import { PrepSandboxBadge, PrepSandboxForm, usePrepSandbox } from './sandbox';
import { PrepLabScene } from './scene';
import { PREP_APPARATUS, PREP_APPARATUS_LABEL, prepSceneFromState, type PrepApparatusId } from './scene-state';

/**
 * The 3D chem-prep lab: the same five practicals as the 2D lab (same state,
 * same actions, same marks) in the kit's chemistry room with Mrs Ada — a
 * standard solution and its dilution, Le Chatelier's principle, salt and pure
 * water from sea water, halogen displacement, and preparing ammonia. Learn →
 * Mrs Ada's demo (her own bench) → Try, plus an unmarked sandbox and Ask;
 * timed practicals are Try only.
 */

export default function ChemPrepLab3D(props: SimulatorProps<'chem-prep'>) {
  setAssistant({ name: 'Mrs Ada', role: 'lab technician', look: 'ada', pronoun: 'her' });
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const pAttempt = usePrep({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = usePrepSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => usePrepBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = usePrepDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : pAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = o.v;
  const scene = useMemo(() => prepSceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => prepSafety(task), [task]);
  const tour = useMemo(() => prepTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState } : stage === 'demo' ? { v: demo.v, state: demo.state } : { v, state };
  const shownScene = useMemo(() => prepSceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  const active = usePrepBench((b) => b.active);
  useLabView((x) => x.held);
  const nTubes = prepTubeTask(task) ? prepTubes(task, attemptState.events).length : 0;
  useEffect(() => {
    if (stage === 'try' && usePrepBench.getState().active < 0 && nTubes) usePrepBench.setState({ active: nTubes - 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, nTubes > 0]);
  useEffect(() => () => usePrepBench.setState(BENCH_IDLE), []);

  const steps = useMemo(() => (guided ? prepGuideSteps(v, state, scene, camMode) : []), [guided, v, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = prepCorrection(e.a, state, scene, v.seed) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __prepActive: active });
  const ctx = { o, s: state, scene, open: (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${PREP_APPARATUS_LABEL[id as PrepApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const setActive = (i: number) => i >= 0 && usePrepBench.setState({ active: i });
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' ? { mode: 'bench' as const, focus: 'bench' } : { mode: 'bench' as const, focus: 'bench', notebook: true });

  return (
    <LabShell
      kit={kit}
      title="Chemistry lab"
      heading={`Chemistry laboratory — ${PREP_TASK_TITLE[task].toLowerCase()}`}
      intro={{
        short: 'Coat and goggles on, collect your apparatus from the cupboard, then follow the task card.',
        steps: ['Put on your lab coat and goggles (hooks by the door).', 'Collect the apparatus the practical needs from the cupboard.', 'Work at your bench: tap any object for what you can do with it.', 'Record observations, readings and answers in your notebook, then hand in.'],
      }}
      scene={<PrepLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? prepHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? prepObjectPanel(id, ctx) : null)}
      explain={prepExplainer}
      task={
        <>
          <TaskText v={v} />
          {!readOnly && !practicalId && stage === 'try' && !attemptState.events.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PREP_TASKS.map((t) => (
                <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => pAttempt.chooseTask(t)}>
                  {PREP_TASK_TITLE[t]}
                </Button>
              ))}
            </div>
          )}
          <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Lab coat: {scene.coat ? 'on' : 'not on'} · Goggles: {scene.goggles ? 'on' : 'not on'}
          </p>
        </>
      }
      notebook={<PrepRecordAll v={v} state={state} readOnly={readOnly} update={o.update} active={active} setActive={setActive} book />}
      cupboard={{
        blurb: 'Take what you need to your bench — or drag things from the cupboard onto the tray.',
        items: PREP_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as PrepApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={VIEW_BUTTONS[task]} />}
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <PrepSandboxForm
            sandbox={sandbox}
            onStart={() => {
              sandbox.start();
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <PrepSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: PREP_ASK[task], extra: stage === 'try' ? undefined : 'Why is this precaution needed?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => pAttempt.note(`safety-briefing:${outcome}`)}
      missing={chemPrepMissing(attemptState, seed)}
      onResetStation={() => usePrepBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
