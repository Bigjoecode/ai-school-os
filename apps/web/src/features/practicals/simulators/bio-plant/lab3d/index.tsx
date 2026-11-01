import { PLANT_TASKS, PLANT_TASK_TITLE, type CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { useBioAssistant } from '../../bio-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, nextHint, usePlant } from '../actions';
import { bioPlantMissing } from '../missing';
import { OxyNotebook, PotoNotebook, StarchNotebook, Written } from '../notebook';
import { TaskText } from '../task-text';
import { BENCH_IDLE, VIEW_BUTTONS, usePlantBench } from './bench';
import { PLANT_ASK, learnConfig, learnState, plantExplainer, plantSafety, plantTour } from './content';
import { usePlantDemo } from './demo';
import { DRAG_HINT, PlantDrags } from './drag';
import { plantCorrection, plantGuideSteps } from './guide';
import { plantHint3d, plantObjectPanel, type PlantCtx } from './lab-actions';
import { ReadingPanel } from './reading';
import { PlantSandboxBadge, PlantSandboxForm, usePlantSandbox } from './sandbox';
import { PlantLabScene } from './scene';
import { PLANT_APPARATUS, PLANT_APPARATUS_LABEL, sceneFromState, type PlantApparatusId } from './scene-state';

/**
 * The 3D plant physiology lab: the same experiments as the 2D lab (same
 * state, same actions, same marks) in the biology room with Mrs Okon.
 * POTOMETER: cut and fit the shoot under water, seal it, time the bubble in
 * still air, with the fan, the lamp, in the dark and humid air. OXYGEN: the
 * pondweed under its funnel, the heat filter, the lamp along the metre rule,
 * bubbles counted, the glowing splint. STARCH: the destarched plant, foil and
 * KOH, boiling, ethanol with the flame off, iodine on the tile, the grid.
 *
 * Learn → Mrs Okon's demo (her own material) → Try, plus an unmarked sandbox
 * and Ask; timed practicals are Try only.
 */

export default function BioPlantLab3D(props: SimulatorProps<'bio-plant'>) {
  useBioAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const pAttempt = usePlant({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = usePlantSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => usePlantBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = usePlantDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const p = stage === 'sandbox' ? sandbox.p : pAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = p.v;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => plantSafety(task), [task]);
  const tour = useMemo(() => plantTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState, p: demo.p } : stage === 'demo' ? { v: demo.v, state: demo.state, p: demo.p } : { v, state, p };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  useLabView((x) => x.held);
  usePlantBench((b) => b.sel);
  useEffect(() => () => usePlantBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? plantGuideSteps(state, scene, camMode) : []), [guided, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = plantCorrection(e.a, state, scene) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __plantV: v });
  const ctx: PlantCtx = { p, s: state, scene, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const shownCtx: PlantCtx = { p: shown.p, s: shown.state, scene: shownScene, open: ctx.open };
  const onCarry = useCallback(
    (id: string) => {
      p.note(`collect:${id}`);
      notify(`${PLANT_APPARATUS_LABEL[id as PlantApparatusId]} is on your bench.`, 'success', 1500);
    },
    [p],
  );
  const canRead = task === 'OXYGEN' ? shown.state.oxy.plant : task === 'STARCH' ? shown.state.starch.leaves.length > 0 : shown.state.poto.bubble;
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' ? { mode: 'bench' as const, focus: task === 'OXYGEN' ? 'oxygen' : task === 'STARCH' ? 'bath' : 'potometer' } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const flat = 'border-0 p-0 shadow-none sm:p-0';
  const notebook = (
    <div className="space-y-4">
      {task === 'OXYGEN' ? <OxyNotebook state={state} readOnly={readOnly} update={p.update} book className={flat} /> : task === 'STARCH' ? <StarchNotebook v={v} state={state} readOnly={readOnly} update={p.update} book className={flat} /> : <PotoNotebook v={v} state={state} readOnly={readOnly} update={p.update} book className={flat} />}
      <Written state={state} readOnly={readOnly} update={p.update} className={flat} />
    </div>
  );
  const look = () => canRead && (useLabView.getState().set({ mode: 'read', selected: null }), kit.setSheet(null));

  return (
    <LabShell
      kit={kit}
      title="Biology lab"
      heading={`Biology laboratory — ${PLANT_TASK_TITLE[task].toLowerCase()}`}
      intro={{
        short: task === 'OXYGEN' ? 'Coat on, set up the pondweed under its funnel, move the lamp and count the bubbles.' : task === 'STARCH' ? 'Coat and goggles on; test leaves of a destarched plant for starch — flame off before the ethanol.' : 'Coat on, set up the potometer under water and time the bubble in different conditions.',
        steps:
          task === 'OXYGEN'
            ? ['Put on your lab coat (hooks by the door).', 'Collect the beaker, funnel, test tube, lamp, metre rule, trough, thermometer, stopwatch and splints.', 'NaHCO₃, pondweed under the funnel, tube over the stem; heat filter; darken the room.', 'Lamp at 10, 20, 30… cm: wait 5 min, count a minute three times; splint test.']
            : task === 'STARCH'
              ? ['Put on your lab coat and goggles (hooks by the door).', 'Collect the water bath, boiling tubes, forceps, tile, foil, KOH flask and grid paper.', 'Destarched plant: foil strip and KOH flask, then 4–6 h of light; pick the leaves.', 'Boil; flame OFF; ethanol in the hot water; soften; tile; iodine; count on the grid.']
              : ['Put on your lab coat (hooks by the door).', 'Collect the potometer, bowl, blade, Vaseline, fan, lamp, bags and a stopwatch.', 'Cut and fit the shoot under water; seal; let in one bubble.', 'Still air, then fan, lamp, dark or humid: adjust 5 min, time 30 mm three times.'],
      }}
      readingStatus={task === 'OXYGEN' ? 'watching the pondweed' : task === 'STARCH' ? 'looking at the leaf' : 'reading the potometer'}
      scene={
        <>
          <PlantLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />
          {!readOnly && work && <PlantDrags ctx={ctx} />}
        </>
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? plantHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? plantObjectPanel(id, ctx) : null)}
      explain={plantExplainer}
      task={
        <>
          <TaskText v={v} />
          {!readOnly && !practicalId && stage === 'try' && !started && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {PLANT_TASKS.map((t) => (
                <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => pAttempt.chooseTask(t)}>
                  {PLANT_TASK_TITLE[t]}
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
        items: PLANT_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as PlantApparatusId),
        onToggle: (id, take) => p.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={VIEW_BUTTONS[task]} read={{ label: task === 'STARCH' ? 'Look' : task === 'OXYGEN' ? 'Watch' : 'Read', can: canRead }} onRead={look} />}
      readingPanel={<ReadingPanel ctx={shownCtx} readOnly={readOnly || stage === 'learn' || stage === 'demo'} onBack={() => useLabView.getState().set({ mode: 'bench', focus: task === 'OXYGEN' ? 'oxygen' : task === 'STARCH' ? 'tile' : 'potometer' })} />}
      canRead={canRead}
      dragFeedback={(d) => (DRAG_HINT[d.kind] ? <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{DRAG_HINT[d.kind]}</span> : null)}
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <PlantSandboxForm
            sandbox={sandbox}
            onStart={(x) => {
              sandbox.start(x);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <PlantSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: PLANT_ASK[task], extra: stage === 'try' ? undefined : task === 'OXYGEN' ? 'Why does the rate level off near the lamp?' : task === 'STARCH' ? 'Why must the flame be off before using ethanol?' : 'Why is water uptake not exactly equal to transpiration?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => pAttempt.note(`safety-briefing:${outcome}`)}
      missing={bioPlantMissing(attemptState, seed)}
      onResetStation={() => usePlantBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
