import { FOOD_TASKS, FOOD_TASK_TITLE, type CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { useBioAssistant } from '../../bio-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, nextHint, useFoodTests } from '../actions';
import { TaskText } from '../task-text';
import { bioFoodMissing } from '../missing';
import { AmyNotebook, FoodConclusion, FoodNotebook, Written } from '../notebook';
import { AMY_VIEW_BUTTONS, BENCH_IDLE, FOOD_VIEW_BUTTONS, useFoodBench } from './bench';
import { AMY_ASK, FOOD_ASK, foodExplainer, foodSafety, foodTour, learnConfig, learnState } from './content';
import { useFoodDemo } from './demo';
import { FoodDrags } from './drag';
import { foodCorrection, foodGuideSteps } from './guide';
import { foodHint3d, foodObjectPanel } from './lab-actions';
import { FoodSandboxBadge, FoodSandboxForm, useFoodSandbox } from './sandbox';
import { FoodLabScene } from './scene';
import { FOOD_APPARATUS, FOOD_APPARATUS_LABEL, sceneFromState, type FoodApparatusId } from './scene-state';

/**
 * The 3D food-tests lab: the same tests as the 2D lab (same state, same
 * actions, same marks) in the biology room with Mrs Okon. FOOD: the student
 * puts on a coat and goggles, collects test tubes, a holder and the water
 * bath, lights the burner, tests samples P, Q and R with the reagent shelf —
 * the colours form in the tube, Benedict's develops in the boiling bath — and
 * writes TEST | OBSERVATION | INFERENCE. AMYLASE: the spotting tile, the
 * baths with starch and saliva, the stopwatch, drops on iodine every 30 s and
 * the end points.
 *
 * Learn → Mrs Okon's demo (her own samples) → Try, plus an unmarked sandbox
 * and Ask; timed practicals are Try only.
 */

export default function BioFoodTestsLab3D(props: SimulatorProps<'bio-food-tests'>) {
  useBioAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const fAttempt = useFoodTests({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useFoodSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useFoodBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = useFoodDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const f = stage === 'sandbox' ? sandbox.f : fAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = f.v;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => foodSafety(task), [task]);
  const tour = useMemo(() => foodTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState } : stage === 'demo' ? { v: demo.v, state: demo.state } : { v, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  const active = useFoodBench((b) => b.active);
  useLabView((x) => x.held);
  // Back in Try (or on opening): the latest test tube is the one in use.
  const tries = stage === 'try' ? attemptState.tests.length : -1;
  useEffect(() => {
    if (stage === 'learn') useFoodBench.setState({ active: 0, anim: null });
    if (stage === 'try' && useFoodBench.getState().active < 0) useFoodBench.setState({ active: attemptState.tests.length - 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, tries > 0]);
  useEffect(() => () => useFoodBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? foodGuideSteps(v, state, scene, camMode) : []), [guided, v, state, scene, camMode]);
  // A reminder that has been given once (e.g. ethanol near the flame) is not repeated for every tube.
  const said = useRef(new Set<string>());
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = foodCorrection(e.a, state, scene) ?? found;
    if (found && found.title.startsWith('Ethanol') && said.current.has(found.title)) return;
    if (found) {
      said.current.add(found.title);
      kit.correct(found);
    }
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __foodActive: active });
  const ctx = { f, s: state, scene, open: (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const onCarry = useCallback(
    (id: string) => {
      f.note(`collect:${id}`);
      notify(`${FOOD_APPARATUS_LABEL[id as FoodApparatusId]} is on your bench.`, 'success', 1500);
    },
    [f],
  );
  const setActive = (i: number) => i >= 0 && useFoodBench.setState({ active: i, anim: null });
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' ? { mode: 'bench' as const, focus: task === 'AMYLASE' ? 'baths' : 'bath' } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const amylase = task === 'AMYLASE';
  const notebook = (
    <div className="space-y-4">
      {amylase ? (
        <AmyNotebook state={state} readOnly={readOnly} update={f.update} active={active} setActive={setActive} book className="border-0 p-0 shadow-none sm:p-0" />
      ) : (
        <>
          <FoodNotebook state={state} readOnly={readOnly} update={f.update} active={active} setActive={setActive} book className="border-0 p-0 shadow-none sm:p-0" />
          <FoodConclusion state={state} readOnly={readOnly} update={f.update} className="border-0 p-0 shadow-none sm:p-0" />
        </>
      )}
      <Written state={state} readOnly={readOnly} update={f.update} className="border-0 p-0 shadow-none sm:p-0" />
    </div>
  );

  return (
    <LabShell
      kit={kit}
      title="Biology lab"
      heading={`Biology laboratory — ${FOOD_TASK_TITLE[task].toLowerCase()}`}
      intro={{
        short: amylase ? 'Coat and goggles on, collect the tile, thermometer and stopwatch, then time the digestion of starch at each temperature.' : 'Coat and goggles on, collect test tubes and the water bath, then test samples P, Q and R.',
        steps: amylase
          ? ['Put on your lab coat and goggles (hooks by the door).', 'Collect test tubes, a holder, the water bath, the spotting tile, a thermometer and a stopwatch.', 'Iodine in the tile; starch and saliva in each bath (and boiled saliva as a control); 5 minutes to reach the temperature.', 'Mix, then a drop on iodine every 30 s until it stays yellow-brown. Record the times.']
          : ['Put on your lab coat and goggles (hooks by the door).', 'Collect test tubes, a holder, the water bath and filter paper; light the burner.', 'Test P, Q and R for starch, reducing sugar, protein and fat — Benedict’s in the boiling water bath.', 'Record TEST | OBSERVATION | INFERENCE and name the food substances.'],
      }}
      scene={
        <>
          <FoodLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />
          {!readOnly && work && <FoodDrags ctx={ctx} />}
        </>
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? foodHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? foodObjectPanel(id, ctx) : null)}
      explain={foodExplainer}
      task={
        <>
          <TaskText v={v} />
          {!readOnly && !practicalId && stage === 'try' && !attemptState.tests.length && !attemptState.tubes.length && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FOOD_TASKS.map((t) => (
                <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => fAttempt.chooseTask(t)}>
                  {FOOD_TASK_TITLE[t]}
                </Button>
              ))}
            </div>
          )}
          <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Lab coat: {scene.coat ? 'on' : 'not on'} · Goggles: {scene.goggles ? 'on' : 'not on'} · Burner: {scene.burnerOn ? 'lit' : 'off'} · Hands washed at the end: {scene.washedAtEnd ? 'yes' : 'not yet'}
          </p>
        </>
      }
      notebook={notebook}
      cupboard={{
        blurb: 'Take what you need to your bench — or drag things from the cupboard onto the tray.',
        items: FOOD_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as FoodApparatusId),
        onToggle: (id, take) => f.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={amylase ? AMY_VIEW_BUTTONS : FOOD_VIEW_BUTTONS} />}
      dragFeedback={(d) =>
        d.kind === 'reagentdrag' || d.kind === 'tubedrag' ? (
          <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{d.kind === 'tubedrag' ? 'Drop the tube in the water bath' : amylase ? 'Drop it on the spotting tile or a bath' : 'Drop it on a sample, or on the tube in use'}</span>
        ) : null
      }
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <FoodSandboxForm
            sandbox={sandbox}
            onStart={(o) => {
              sandbox.start(o);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <FoodSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: amylase ? AMY_ASK : FOOD_ASK, extra: stage === 'try' ? undefined : amylase ? 'Why does boiling stop the enzyme for good?' : 'Why does Benedict’s change colour slowly in the bath?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => fAttempt.note(`safety-briefing:${outcome}`)}
      missing={bioFoodMissing(attemptState, seed)}
      onResetStation={() => useFoodBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
