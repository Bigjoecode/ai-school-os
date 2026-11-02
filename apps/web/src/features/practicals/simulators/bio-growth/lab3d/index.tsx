import { GROWTH_TASKS, GROWTH_TASK_TITLE, type CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { useBioAssistant } from '../../bio-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, nextHint, useGrowth } from '../actions';
import { bioGrowthMissing } from '../missing';
import { GermNotebook, RespNotebook, SeedNotebook, TropNotebook, Written } from '../notebook';
import { TaskText } from '../task-text';
import { BENCH_IDLE, VIEW_BUTTONS, useGrowthBench } from './bench';
import { GROWTH_ASK, growthExplainer, growthSafety, growthTour, learnConfig, learnState } from './content';
import { useGrowthDemo } from './demo';
import { DRAG_HINT, GrowthDrags } from './drag';
import { growthCorrection, growthGuideSteps } from './guide';
import { growthHint3d, growthObjectPanel, type GrowthCtx } from './lab-actions';
import { ReadingPanel } from './reading';
import { GrowthSandboxBadge, GrowthSandboxForm, useGrowthSandbox } from './sandbox';
import { GrowthLabScene } from './scene';
import { GROWTH_APPARATUS, GROWTH_APPARATUS_LABEL, sceneFromState, type GrowthApparatusId } from './scene-state';

/**
 * The 3D germination and plant-response lab: the same experiments as the 2D
 * lab (same state, same actions, same marks) in the biology room with Mrs
 * Okon. GERM: four tubes of seeds, one condition missing from each, counted
 * daily. SEEDLING: cowpea and maize in sawdust and a seed jar, measured
 * daily. RESP: germinating and boiled seeds in vacuum flasks, read daily, and
 * lime water. TROPISM: the light-proof box and the clinostat, the cork of
 * pinned radicles.
 *
 * Learn → Mrs Okon's demo (her own material) → Try, plus an unmarked sandbox
 * and Ask; timed practicals are Try only.
 */

const FOCUS: Record<string, string> = { GERM: 'tubes', SEEDLING: 'jar', RESP: 'flasks', TROPISM: 'lightbox' };

export default function BioGrowthLab3D(props: SimulatorProps<'bio-growth'>) {
  useBioAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const pAttempt = useGrowth({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useGrowthSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useGrowthBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = useGrowthDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const p = stage === 'sandbox' ? sandbox.p : pAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = p.v;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => growthSafety(task), [task]);
  const tour = useMemo(() => growthTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState, p: demo.p } : stage === 'demo' ? { v: demo.v, state: demo.state, p: demo.p } : { v, state, p };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  useLabView((x) => x.held);
  useGrowthBench((b) => b.tube);
  useGrowthBench((b) => b.ref);
  useEffect(() => () => useGrowthBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? growthGuideSteps(state, scene, camMode) : []), [guided, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = growthCorrection(e.a, state, scene) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __growthV: v });
  const ctx: GrowthCtx = { p, s: state, scene, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const shownCtx: GrowthCtx = { p: shown.p, s: shown.state, scene: shownScene, open: ctx.open };
  const onCarry = useCallback(
    (id: string) => {
      p.note(`collect:${id}`);
      notify(`${GROWTH_APPARATUS_LABEL[id as GrowthApparatusId]} is on your bench.`, 'success', 1500);
    },
    [p],
  );
  const ss = shown.state;
  const canRead = task === 'GERM' ? ss.germ.tubes.some((t) => t.seeds > 0) : task === 'SEEDLING' ? ss.seedling.box || ss.seedling.jar : task === 'RESP' ? ss.resp.A.thermo || ss.resp.co2.at !== null : ss.trop.box || ss.trop.pinned;
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' ? { mode: 'bench' as const, focus: FOCUS[task]! } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const flat = 'border-0 p-0 shadow-none sm:p-0';
  const notebook = (
    <div className="space-y-4">
      {task === 'SEEDLING' ? <SeedNotebook v={v} state={state} readOnly={readOnly} update={p.update} book className={flat} /> : task === 'RESP' ? <RespNotebook state={state} readOnly={readOnly} update={p.update} book className={flat} /> : task === 'TROPISM' ? <TropNotebook state={state} readOnly={readOnly} update={p.update} book className={flat} /> : <GermNotebook state={state} readOnly={readOnly} update={p.update} book className={flat} />}
      <Written state={state} readOnly={readOnly} update={p.update} className={flat} />
    </div>
  );
  const look = () => canRead && (useLabView.getState().set({ mode: 'read', selected: null }), kit.setSheet(null));
  const intro = {
    GERM: { short: 'Coat on, set up four tubes of seeds — each missing one condition — and count the germinated seeds daily.', steps: ['Put on your lab coat (hooks by the door).', 'Collect the tubes and rack, cotton wool, boiled water, oil, labels and a wash bottle.', 'Sorted seeds, 10 per tube: A moist, B dry, C boiled water + oil, D moist in the fridge; label.', 'Leave a day at a time; count the seeds with a radicle; work out %.'] },
    SEEDLING: { short: 'Coat on, sow cowpea and maize, and follow them for nine days with a ruler.', steps: ['Put on your lab coat (hooks by the door).', 'Collect the sawdust box, seed jar, ruler and wash bottle.', 'Soak, then sow in the sawdust and against the blotting paper.', 'Each day: water, measure both shoots from the seed; draw at day 3 and 7.'] },
    RESP: { short: 'Coat and goggles on; germinating and boiled seeds in vacuum flasks, read for three days, and lime water.', steps: ['Put on your lab coat and goggles (hooks by the door).', 'Collect the flasks, thermometers, cotton wool, disinfectant, boiling beaker and the CO₂ test.', 'Boil half; disinfect both; A live, B boiled; thermometers, loose plugs, invert.', 'Read at the start and daily for 3 days; lime water with a control.'] },
    TROPISM: { short: 'Coat on; one-sided light in a box, pinned radicles on a cork, clinostat controls; measure daily.', steps: ['Put on your lab coat (hooks by the door).', 'Collect the light box, lamp, clinostat, cork jar, protractor, tape and wash bottle.', 'Box: slit to the lamp, tape gaps; control on the clinostat; pin seedlings on the moist cork.', 'Each day: water, protractor on both shoots; count the radicles growing down.'] },
  }[task];

  return (
    <LabShell
      kit={kit}
      title="Biology lab"
      heading={`Biology laboratory — ${GROWTH_TASK_TITLE[task].toLowerCase()}`}
      intro={intro}
      readingStatus={task === 'RESP' ? 'reading the thermometers' : task === 'GERM' ? 'looking at the tubes' : 'looking at the seedlings'}
      scene={
        <>
          <GrowthLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />
          {!readOnly && work && <GrowthDrags ctx={ctx} />}
        </>
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? growthHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? growthObjectPanel(id, ctx) : null)}
      explain={growthExplainer}
      task={
        <>
          <TaskText v={v} />
          {!readOnly && !practicalId && stage === 'try' && !started && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {GROWTH_TASKS.map((t) => (
                <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => pAttempt.chooseTask(t)}>
                  {GROWTH_TASK_TITLE[t]}
                </Button>
              ))}
            </div>
          )}
          <p className="mt-4 text-[12.5px] font-semibold">Safety</p>
          <p className="text-[13px] text-muted-foreground">
            Lab coat: {scene.coat ? 'on' : 'not on'} · Goggles: {scene.goggles ? 'on' : 'not on'} · Hands washed at the end: {scene.washedAtEnd ? 'yes' : 'not yet'}
          </p>
        </>
      }
      notebook={notebook}
      cupboard={{
        blurb: 'Take what you need to your bench — or drag things from the cupboard onto the tray.',
        items: GROWTH_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as GrowthApparatusId),
        onToggle: (id, take) => p.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={VIEW_BUTTONS[task]} read={{ label: task === 'RESP' ? 'Read' : 'Look', can: canRead }} onRead={look} />}
      readingPanel={<ReadingPanel ctx={shownCtx} readOnly={readOnly || stage === 'learn' || stage === 'demo'} onBack={() => useLabView.getState().set({ mode: 'bench', focus: FOCUS[task]! })} />}
      canRead={canRead}
      dragFeedback={(d) => (DRAG_HINT[d.kind] ? <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{DRAG_HINT[d.kind]}</span> : null)}
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <GrowthSandboxForm
            sandbox={sandbox}
            onStart={(x) => {
              sandbox.start(x);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <GrowthSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: GROWTH_ASK[task], extra: stage === 'try' ? undefined : task === 'GERM' ? 'Why is light not needed for germination?' : task === 'SEEDLING' ? 'Why do cowpea cotyledons turn green?' : task === 'RESP' ? 'Where does the heat come from?' : 'How does auxin make a shoot bend?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => pAttempt.note(`safety-briefing:${outcome}`)}
      missing={bioGrowthMissing(attemptState, seed)}
      onResetStation={() => useGrowthBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
