import { OSMO_TASKS, OSMO_TASK_TITLE, type CriterionScore } from '@aischool/shared';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { useBioAssistant } from '../../bio-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { lessonTask, nextHint, useOsmosis } from '../actions';
import { bioOsmosisMissing } from '../missing';
import { AgarNotebook, PlasNotebook, PotatoNotebook, Written } from '../notebook';
import { TaskText } from '../task-text';
import { BENCH_IDLE, VIEW_BUTTONS, useOsmoBench } from './bench';
import { OSMO_ASK, learnConfig, learnState, osmoExplainer, osmoSafety, osmoTour } from './content';
import { useOsmoDemo } from './demo';
import { DRAG_HINT, OsmoDrags } from './drag';
import { osmoCorrection, osmoGuideSteps } from './guide';
import { osmoHint3d, osmoObjectPanel, type OsmoCtx } from './lab-actions';
import { ReadingPanel } from './reading';
import { OsmoSandboxBadge, OsmoSandboxForm, useOsmoSandbox } from './sandbox';
import { OsmoLabScene } from './scene';
import { OSMO_APPARATUS, OSMO_APPARATUS_LABEL, sceneFromState, type OsmoApparatusId } from './scene-state';

/**
 * The 3D osmosis lab: the same experiments as the 2D lab (same state, same
 * actions, same marks) in the biology room with Mrs Okon. POTATO: bore and
 * trim cylinders, blot, measure on the ruler and weigh on the balance, soak
 * them in the labelled beakers (time-lapse), again, then the table and the
 * graph. PLASMOLYSIS: peel, mount, irrigate under the cover slip and watch
 * the cells through the eyepiece. AGAR: cut and measure cubes, put them in
 * the acid together, watch them clear and cut the spare open.
 *
 * Learn → Mrs Okon's demo (her own material) → Try, plus an unmarked sandbox
 * and Ask; timed practicals are Try only.
 */

export default function BioOsmosisLab3D(props: SimulatorProps<'bio-osmosis'>) {
  useBioAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const oAttempt = useOsmosis({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useOsmoSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useOsmoBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = useOsmoDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const o = stage === 'sandbox' ? sandbox.o : oAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = o.v;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const lState = useMemo(() => learnState(task), [task]);
  const learn = useMemo(() => learnConfig(task), [task]);
  const safety = useMemo(() => osmoSafety(task), [task]);
  const tour = useMemo(() => osmoTour(task), [task]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState, o: demo.o } : stage === 'demo' ? { v: demo.v, state: demo.state, o: demo.o } : { v, state, o };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  useLabView((x) => x.held);
  useEffect(() => () => useOsmoBench.setState(BENCH_IDLE), []);

  // ---- guidance
  const steps = useMemo(() => (guided ? osmoGuideSteps(state, scene, camMode) : []), [guided, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = osmoCorrection(e.a, state, scene) ?? found;
    if (found) kit.correct(found);
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __osmoV: v });
  const ctx: OsmoCtx = { o, s: state, scene, open: (w) => (useLabView.getState().set({ selected: null }), kit.setSheet(w)) };
  const shownCtx: OsmoCtx = { o: shown.o, s: shown.state, scene: shownScene, open: ctx.open };
  const onCarry = useCallback(
    (id: string) => {
      o.note(`collect:${id}`);
      notify(`${OSMO_APPARATUS_LABEL[id as OsmoApparatusId]} is on your bench.`, 'success', 1500);
    },
    [o],
  );
  const canRead = task === 'PLASMOLYSIS' ? shown.state.plas.onStage : task === 'AGAR' ? shown.state.agar.cubes.length > 0 && shownScene.collected.has('ruler') : shown.state.potato.cyl.length > 0;
  const debriefView = (c: CriterionScore) => (c.id === 'procedure' ? { mode: 'bench' as const, focus: task === 'PLASMOLYSIS' ? 'slide' : task === 'AGAR' ? 'acid' : 'beakers' } : { mode: 'bench' as const, focus: 'bench', notebook: true });
  const flat = 'border-0 p-0 shadow-none sm:p-0';
  const notebook = (
    <div className="space-y-4">
      {task === 'PLASMOLYSIS' ? <PlasNotebook v={v} state={state} readOnly={readOnly} update={o.update} book className={flat} /> : task === 'AGAR' ? <AgarNotebook state={state} readOnly={readOnly} update={o.update} book className={flat} /> : <PotatoNotebook state={state} readOnly={readOnly} update={o.update} book className={flat} />}
      <Written state={state} readOnly={readOnly} update={o.update} className={flat} />
    </div>
  );
  const look = () => canRead && (useLabView.getState().set({ mode: 'read', selected: null }), kit.setSheet(null));

  return (
    <LabShell
      kit={kit}
      title="Biology lab"
      heading={`Biology laboratory — ${OSMO_TASK_TITLE[task].toLowerCase()}`}
      intro={{
        short: task === 'PLASMOLYSIS' ? 'Coat on, collect the microscope and slides, mount the red epidermis in water, then draw a strong solution under the cover slip.' : task === 'AGAR' ? 'Coat and goggles on, cut and measure the agar cubes, put them in the acid together and time them.' : 'Coat on, bore and trim potato cylinders, blot, measure and weigh them, soak them, then again.',
        steps:
          task === 'PLASMOLYSIS'
            ? ['Put on your lab coat (hooks by the door).', 'Collect the microscope, slides, mounted needle, forceps, filter paper and a tile.', 'Peel a thin strip of red onion epidermis; mount it in water under a cover slip; look at ×10 then ×40.', 'Draw strong sucrose or salt under the cover slip; wait 5–10 min; count; then water again.']
            : task === 'AGAR'
              ? ['Put on your lab coat and goggles (hooks by the door).', 'Collect the scalpel, tile, ruler, forceps, a 400 cm³ beaker and a stopwatch.', 'Cut 1, 2 and 3 cm cubes and a spare; measure them; work out SA : V.', 'All into the acid together; time each until colourless; cut the spare open at 5 min.']
              : ['Put on your lab coat (hooks by the door).', 'Collect the cork borer, scalpel, tile, ruler, balance, filter paper, forceps, beakers and a stopwatch.', 'Bore and trim five cylinders; blot, measure and weigh each.', 'Soak them 30–60 min; blot, measure and weigh again; table and graph.'],
      }}
      readingStatus={task === 'PLASMOLYSIS' ? 'looking through the eyepiece' : task === 'AGAR' ? 'reading the ruler' : 'reading the ruler and balance'}
      scene={
        <>
          <OsmoLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />
          {!readOnly && work && <OsmoDrags ctx={ctx} />}
        </>
      }
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? osmoHint3d(ctx, nextHint(v, state)) : null}
      objectPanel={(id) => (work ? osmoObjectPanel(id, ctx) : null)}
      explain={osmoExplainer}
      task={
        <>
          <TaskText v={v} />
          {!readOnly && !practicalId && stage === 'try' && !started && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {OSMO_TASKS.map((t) => (
                <Button key={t} size="sm" variant={task === t ? 'brand' : 'outline'} onClick={() => oAttempt.chooseTask(t)}>
                  {OSMO_TASK_TITLE[t]}
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
        items: OSMO_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id as OsmoApparatusId),
        onToggle: (id, take) => o.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry,
      }}
      modeBar={<ModeBar views={VIEW_BUTTONS[task]} read={{ label: task === 'PLASMOLYSIS' ? 'Eyepiece' : 'Read', can: canRead }} onRead={look} />}
      readingPanel={<ReadingPanel ctx={shownCtx} readOnly={readOnly || stage === 'learn' || stage === 'demo'} onBack={() => useLabView.getState().set({ mode: 'bench', focus: task === 'PLASMOLYSIS' ? 'scope' : task === 'AGAR' ? 'acid' : 'tile' })} />}
      canRead={canRead}
      dragFeedback={(d) => (DRAG_HINT[d.kind] ? <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{DRAG_HINT[d.kind]}</span> : null)}
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <OsmoSandboxForm
            sandbox={sandbox}
            onStart={(x) => {
              sandbox.start(x);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <OsmoSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: OSMO_ASK[task], extra: stage === 'try' ? undefined : task === 'PLASMOLYSIS' ? 'Why does the cell wall not shrink?' : task === 'AGAR' ? 'Why does depth grow as the square root of time?' : 'Why is the change in length smaller than the change in mass?' }}
      tourSteps={tour}
      safety={safety}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => oAttempt.note(`safety-briefing:${outcome}`)}
      missing={bioOsmosisMissing(attemptState, seed)}
      onResetStation={() => useOsmoBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
