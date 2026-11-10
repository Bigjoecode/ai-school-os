import { GEO_TASK_TITLE, type CriterionScore, type GeoMapsState } from '@aischool/shared';
import { ArrowLeft, BookOpen, Lightbulb } from 'lucide-react';
import { useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { setAssistant } from '../../../lab3d-kit/assistant-profile';
import type { GuideStep } from '../../../lab3d-kit/guide';
import { ModeBar, type ObjectPanel } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import type { SimulatorProps } from '../../types';
import { isMapTask, lessonTask, nextHint, nextStep, useGeo, type Geo } from '../actions';
import { GeoDesk } from '../bench';
import { geoMapsMissing } from '../missing';
import { GeoNotebook } from '../notebook';
import { TaskText } from '../task-text';
import { BENCH_IDLE, GEO_APPARATUS, GEO_APPARATUS_LABEL, VIEW_BUTTONS, neededFor, sceneFromState, useGeoBench, type GeoApparatusId } from './bench';
import { GEO_SAFETY, geoAsk, geoExplainer, geoTour, learnConfig, learnState } from './content';
import { useGeoDemo } from './demo';
import { GeoSandboxBadge, GeoSandboxForm, useGeoSandbox } from './sandbox';
import { GeoLabScene } from './scene';

/**
 * The 3D view of the geography lab: the classroom, with the sheet on the
 * student's desk and the instruments beside it. It is a front end over the
 * same state as the 2D lab; the measuring itself happens in the close view,
 * which is the 2D bench. Learn → Mr Eze's demo on his own sheet → Try, plus an
 * unmarked sandbox and Ask; timed practicals and sittings are Try only.
 */

const TOOL_OF: Partial<Record<GeoApparatusId, NonNullable<ReturnType<typeof useGeoBench.getState>['tool']>>> = { ruler: 'ruler', thread: 'string', dividers: 'dividers', protractor: 'protractor', romer: 'romer', pins: 'pin', strip: 'strip', pencil: 'pencil' };

function CloseView({ g, s, readOnly, assist, hint, onBack, onBook }: { g: Geo; s: GeoMapsState; readOnly: boolean; assist?: boolean; hint: string | null; onBack: () => void; onBook: () => void }) {
  const tool = useGeoBench((b) => b.tool);
  const panel = useGeoBench((b) => b.panel);
  return (
    <div className="pointer-events-auto absolute inset-0 z-[8] overflow-y-auto overscroll-contain bg-black/60 p-1.5 pt-[6.5rem] sm:p-4 sm:pt-28" role="dialog" aria-label="Your sheet, close up">
      <section className="mx-auto w-full max-w-4xl space-y-2 rounded-2xl bg-card p-2 text-card-foreground shadow-2xl sm:p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-8" onClick={onBack}>
            <ArrowLeft /> Back to the bench
          </Button>
          <Button size="sm" variant="outline" className="h-8" onClick={onBook}>
            <BookOpen /> Notebook
          </Button>
        </div>
        {hint && (
          <p className="flex items-start gap-2 rounded-xl bg-info-soft px-3 py-1.5 text-[12.5px] text-info">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {hint}
          </p>
        )}
        <GeoDesk g={g} s={s} readOnly={readOnly} panel={panel} tool={tool} assist={assist} compact />
      </section>
    </div>
  );
}

export default function GeoMapsLab3D(props: SimulatorProps<'geo-maps'>) {
  setAssistant({ name: 'Mr Eze', role: 'geography teacher', look: 'bayo', pronoun: 'his' });
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const gAttempt = useGeo({ seed, state: attemptState, onChange, readOnly, startedAt, practicalId });
  const task = attemptState.task ?? lessonTask(practicalId);
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('task:'));
  const sandbox = useGeoSandbox(task, startedAt);
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useGeoBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const demo = useGeoDemo({ studentSeed: seed, task, startedAt, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const g = stage === 'sandbox' ? sandbox.g : gAttempt;
  const state = stage === 'sandbox' ? sandbox.state : attemptState;
  const v = g.v;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const lState = useMemo(() => learnState(demo.v), [demo.v]);
  const learn = useMemo(() => learnConfig(v), [v]);
  const tour = useMemo(() => geoTour(v), [v]);
  const shown = stage === 'learn' ? { v: demo.v, state: lState } : stage === 'demo' ? { v: demo.v, state: demo.state } : { v, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  useEffect(() => () => useGeoBench.setState(BENCH_IDLE), []);
  const needed = neededFor(v);

  const openClose = useCallback((tool?: (typeof TOOL_OF)[GeoApparatusId], panel?: ReturnType<typeof useGeoBench.getState>['panel']) => {
    useGeoBench.setState({ tool, panel });
    useLabView.getState().set({ mode: 'read', selected: null });
  }, []);

  // ---- guidance: the task's own steps, after collecting the instruments
  const steps = useMemo<GuideStep[]>(() => {
    if (!guided) return [];
    const missingItems = needed.filter((a) => !scene.collected.has(a) && !scene.from2d);
    const begun = v.def.steps.some((x) => x.done(state)) || Object.keys(state.entries).length > 0;
    return [
      { id: 'collect', label: `Collect your instruments${missingItems.length ? ` (${missingItems.length} to go)` : ''}`, target: 'cupboard', why: needed.map((a) => GEO_APPARATUS_LABEL[a]).join(', ') + '.', done: !missingItems.length },
      { id: 'bench', label: 'Go to your desk', target: 'mybench', why: 'Bench 2, at the front.', done: camMode !== 'walk' || begun },
      ...v.def.steps.map((x) => ({ id: x.id, label: x.label, target: x.panel === 'map' || x.tool ? 'map' : x.panel ? 'map' : 'book', why: x.why, done: x.done(state) })),
      { id: 'written', label: 'Write two precautions and your explanation', target: 'book', why: 'Precautions are things you did to make the results reliable.', done: !!state.written.precautions.trim() && !!state.written.explain.trim() },
      { id: 'handin', label: 'Hand in your work', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
    ];
  }, [guided, state, scene, camMode, v, needed]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    if (fresh.some((e) => e.a === 'run:DIVIDERS') && !state.sets.dividersTold) kit.correct({ title: 'Keep the span small', why: 'A wide span cuts across the bends, so the route comes out too short. Use a small span and count the steps.' });
  });

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage, __geoV: v, __geoState: attemptState });

  const objectPanel = (id: string): ObjectPanel | null => {
    if (id.startsWith('cup:')) {
      const a = id.slice(4) as GeoApparatusId;
      return { title: GEO_APPARATUS_LABEL[a], info: 'In the cupboard.', actions: [{ key: 'take', label: 'Take to my desk', tone: 'brand', run: () => (g.note(`collect:${a}`), play('clink'), notify(`${GEO_APPARATUS_LABEL[a]} is on your desk.`, 'success', 1500), useLabView.getState().set({ selected: null })) }] };
    }
    if (id === 'map') {
      const n = nextStep(v, state);
      return { title: isMapTask(task) ? 'The map sheet' : 'Your graph paper', info: 'Open it to work on it with the instruments.', actions: [{ key: 'open', label: isMapTask(task) ? 'Work on the map' : 'Work on the paper', tone: 'brand', run: () => openClose(n?.tool, n?.panel) }] };
    }
    if (id === 'book') return { title: 'Your notebook', actions: [{ key: 'open', label: 'Open the notebook', tone: 'brand', run: () => (useLabView.getState().set({ selected: null }), kit.setSheet('notebook')) }] };
    if (id === 'card') return { title: 'Question paper', actions: [{ key: 'open', label: 'Read the question paper', tone: 'brand', run: () => (useLabView.getState().set({ selected: null }), kit.setSheet('task')) }] };
    const tool = TOOL_OF[id as GeoApparatusId];
    if (tool && v.def.tools.includes(tool)) return { title: GEO_APPARATUS_LABEL[id as GeoApparatusId], info: 'Use it on the sheet.', actions: [{ key: 'use', label: 'Use it on the sheet', tone: 'brand', run: () => openClose(tool, 'map') }] };
    if (GEO_APPARATUS.some((a) => a.id === id)) return { title: GEO_APPARATUS_LABEL[id as GeoApparatusId], actions: [] };
    return null;
  };
  const debriefView = (c: CriterionScore) => (c.id === 'construction' ? { mode: 'bench' as const, focus: 'map' } : { mode: 'bench' as const, focus: 'bench', notebook: true });

  return (
    <LabShell
      kit={kit}
      title="Geography room"
      heading={`Geography — ${GEO_TASK_TITLE[task].toLowerCase()}`}
      intro={{ short: 'Collect your instruments, then work on the sheet close up. Everything you place is recorded.', steps: ['Collect the instruments you need from the cupboard.', 'Go to your desk and open the sheet.', 'Measure, draw and record: read the instruments yourself.', 'Write your precautions and explanation, then hand in.'] }}
      readingStatus="working on the sheet"
      scene={<GeoLabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} onSlow={kit.onSlow} />}
      endsAt={endsAt}
      onHandIn={onHandIn}
      onUse2d={onUse2d}
      attemptId={attemptId}
      steps={steps}
      hint={practice && !guided ? nextHint(v, state) : null}
      objectPanel={(id) => (work ? objectPanel(id) : null)}
      explain={geoExplainer}
      task={<TaskText v={v} />}
      notebook={<GeoNotebook v={v} s={state} g={g} readOnly={readOnly} />}
      cupboard={{
        blurb: 'Take what you need to your desk, or drag it from the cupboard.',
        items: GEO_APPARATUS.map((a) => ({ id: a.id, label: a.label })),
        has: (id) => scene.collected.has(id),
        onToggle: (id, take) => g.note(`${take ? 'collect' : 'return'}:${id}`),
        onCarry: (id) => (g.note(`collect:${id}`), notify(`${GEO_APPARATUS_LABEL[id as GeoApparatusId]} is on your desk.`, 'success', 1500)),
      }}
      modeBar={<ModeBar views={VIEW_BUTTONS} read={{ label: isMapTask(task) ? 'Work on the map' : 'Work on the paper', can: true }} onRead={() => openClose(nextStep(v, state)?.tool, nextStep(v, state)?.panel)} />}
      readingPanel={<CloseView g={g} s={state} readOnly={readOnly} assist={stage === 'sandbox'} hint={practice ? nextHint(v, state) : null} onBack={() => useLabView.getState().set({ mode: 'bench', focus: 'map' })} onBook={() => kit.setSheet('notebook')} />}
      canRead
      learn={learn}
      demo={demo.player}
      demoPanel={demo.panel}
      sandbox={{
        form: (
          <GeoSandboxForm
            sandbox={sandbox}
            onStart={(t) => {
              sandbox.start(t);
              kit.goStage('sandbox');
            }}
          />
        ),
        results: <GeoSandboxBadge sandbox={sandbox} />,
      }}
      ask={{ suggestions: geoAsk(task), extra: stage === 'try' ? undefined : 'How do I check my answer?' }}
      tourSteps={tour}
      safety={GEO_SAFETY}
      briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
      onBriefing={(outcome) => gAttempt.note(`safety-briefing:${outcome}`)}
      missing={geoMapsMissing(attemptState, seed)}
      onResetStation={() => useGeoBench.setState(BENCH_IDLE)}
      debriefView={debriefView}
    />
  );
}
