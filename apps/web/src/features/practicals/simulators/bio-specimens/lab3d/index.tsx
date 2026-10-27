import { SPECIMEN_PRACTICAL_SETS, SPECIMEN_SETS, SPECIMEN_SET_INFO, bioSpecimensVariant, emptyBioSpecimensState, emptySpecimenEntry, type BioSpecimensState, type CriterionScore, type SpecimenSet } from '@aischool/shared';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { ModeBar } from '../../../lab3d-kit/hud';
import { LabShell, useLabKit, useNewLogEntries } from '../../../lab3d-kit/shell';
import { play } from '../../../lab3d-kit/sound';
import { notify, useLabView } from '../../../lab3d-kit/store';
import { bioSafety, bioTour, useBioAssistant } from '../../bio-common/lab3d/common';
import type { SimulatorProps } from '../../types';
import { bioSpecimensMissing } from '../missing';
import { ASK_SUGGESTIONS, explainer, learnConfig } from './content';
import { useSpecimensDemo } from './demo';
import { correctionFor, examine, guideSteps, measureSlip, nextHint3d, objectPanel } from './lab-actions';
import { SandboxResults, SandboxSetupForm, useSandbox } from './sandbox';
import { LabScene } from './scene';
import { APPARATUS_LABEL, BENCH_IDLE, CUPBOARD, NEEDED, SPEC_VIEW_BUTTONS, sceneFromState, useBench, type ApparatusId } from './scene-state';
import { AnswerSheet, LensView, RulerView, type SpecUpdate } from './sheet';
import { SpecimenDrags } from './drag';

/**
 * The 3D biology laboratory's specimen bench: the same state, actions and
 * marks as the 2D specimen lab, on the shared 3D lab kit. Specimens A–E lie
 * on trays, in Petri dishes or in jars of preservative on the student's bench
 * (each the 2D lab's own drawing of it); the student puts on a coat and
 * gloves, collects a hand lens and a ruler, examines each specimen under the
 * lens, measures one against the ruler and fills in the answer sheet (names,
 * groups, labels, features, functions, the magnification, the comparison and
 * the drawing checklist); then gloves off and hands washed.
 */

const HELP_ROWS: [string, React.ReactNode][] = [
  ['Hand lens', <>Select a specimen, or <Kbd>R</Kbd> for the one in front of you; <Kbd>←</Kbd> <Kbd>→</Kbd> the next specimen</>],
  ['Drag', 'Drag the hand lens onto a specimen to examine it, or the ruler onto the one you must measure'],
];
const TOUR = bioTour({
  focusId: 'trays',
  focusLabel: 'Specimens',
  readLabel: 'Hand lens',
  readText: 'With the hand lens collected, “Hand lens” shows the specimen in front of you enlarged: drag to look around it.',
  task: 'The task card lists your specimens, the one to measure and the two to compare.',
});
const SAFETY = bioSafety('specimens');

export default function BioSpecimensLab3D(props: SimulatorProps<'bio-specimens'>) {
  useBioAssistant();
  const { seed, mode, state: attemptState, onChange, readOnly, startedAt, endsAt, onHandIn, onUse2d, practicalId, attemptId, result } = props;
  const t0 = useMemo(() => new Date(startedAt).getTime(), [startedAt]);
  const ref = useRef(attemptState);
  ref.current = attemptState;
  const updateAttempt: SpecUpdate = (fn, log) => {
    if (readOnly) return;
    let next = fn(ref.current);
    if (log) next = { ...next, log: [...next.log, { t: Math.max(0, Date.now() - t0), a: log.slice(0, 80) }].slice(-600) };
    ref.current = next;
    onChange(next);
  };
  const fromLesson = practicalId ? SPECIMEN_PRACTICAL_SETS[practicalId] : undefined;
  const choose = (set: SpecimenSet) => {
    const vv = bioSpecimensVariant(seed, set);
    updateAttempt((s) => ({ ...emptyBioSpecimensState(), log: s.log, set, entries: vv.specimens.map(() => emptySpecimenEntry()) }), `set:${set}`);
  };
  // The set the lesson uses, as the 2D lab sets it.
  useEffect(() => {
    if (!readOnly && !ref.current.set && fromLesson) choose(fromLesson);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromLesson, readOnly]);
  const set = attemptState.set ?? fromLesson ?? 'KINGDOMS';
  const started = attemptState.log.some((e) => !e.a.startsWith('safety-briefing') && !e.a.startsWith('set:'));
  const kit = useLabKit({ mode, readOnly, practicalId, result, started, onStageChange: () => useBench.setState(BENCH_IDLE) });
  const { stage, work, guided, practice } = kit;
  const vAttempt = useMemo(() => bioSpecimensVariant(seed, set), [seed, set]);
  const sandbox = useSandbox(set);
  const demo = useSpecimensDemo({ studentSeed: seed, set, active: stage === 'demo', onFinished: () => kit.markJourney('demo') });
  const learnState = useMemo<BioSpecimensState>(() => ({ ...emptyBioSpecimensState(), set, entries: vAttempt.specimens.map(() => emptySpecimenEntry()), log: [{ t: 0, a: 'safety:coat' }, ...NEEDED.map((a) => ({ t: 0, a: `collect:${a}` })), { t: 0, a: 'collect:forceps' }] }), [set, vAttempt]);
  const noteAttempt = (a: string) => updateAttempt((s) => s, a);
  const cur = stage === 'sandbox' ? { v: sandbox.v, state: sandbox.state, update: sandbox.update, note: sandbox.note } : { v: vAttempt, state: attemptState, update: updateAttempt, note: noteAttempt };
  const { v, state, update, note } = cur;
  const scene = useMemo(() => sceneFromState(state), [state]);
  const shown = stage === 'learn' ? { v: vAttempt, state: learnState } : stage === 'demo' ? { v: demo.v, state: demo.state } : { v, state };
  const shownScene = useMemo(() => sceneFromState(shown.state), [shown.state]);
  const camMode = useLabView((x) => x.mode);
  const look = useBench((b) => b.look);
  const current = useBench((b) => b.current);
  useEffect(() => () => useBench.setState(BENCH_IDLE), []);
  // Whatever opened the hand lens (a button, R, a drag), the specimen under it counts as examined (as in the 2D lab).
  useEffect(() => {
    if (camMode === 'read' && look === 'lens' && work && !readOnly) examine(cur, v.specimens[Math.min(current, v.specimens.length - 1)]!.letter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camMode, look, current, work, stage]);
  const learn = useMemo(() => learnConfig(vAttempt.specimens.length), [vAttempt]);

  // ---- guidance
  const steps = useMemo(() => (guided && state.set ? guideSteps(v, state, scene, camMode) : []), [guided, v, state, scene, camMode]);
  useNewLogEntries(state.log, stage, (fresh) => {
    if (!guided || !fresh.length) return;
    let found = null;
    for (const e of fresh) found = correctionFor(e.a, state, scene) ?? found;
    if (found) kit.correct(found);
  });
  // Unit slips in the measurement (typed fields have no log entry): said once each, a moment after typing stops.
  const slipSaid = useRef(new Set<string>());
  useEffect(() => {
    if (!guided) return;
    const id = setTimeout(() => {
      const slip = measureSlip(state);
      if (slip && !slipSaid.current.has(slip.title)) {
        slipSaid.current.add(slip.title);
        kit.correct(slip);
      }
    }, 1800);
    return () => clearTimeout(id);
  }, [guided, state.measure, kit]); // eslint-disable-line react-hooks/exhaustive-deps

  if (import.meta.env.DEV) Object.assign(window, { __lab3dState: attemptState, __lab3dShown: shown.state, __lab3dStage: stage });
  const openLens = (i: number) => {
    if (!scene.collected.has('lens')) return notify('Get the hand lens from the cupboard first.', 'warning');
    const sp = v.specimens[i]!;
    useBench.setState({ current: i, look: 'lens' });
    if (sp) play('tick');
    useLabView.getState().set({ mode: 'read', selected: null });
    kit.setSheet(null);
  };
  const openRuler = () => {
    if (!scene.collected.has('ruler')) return notify('Get the ruler from the cupboard first.', 'warning');
    const sp = v.specimens[v.measured]!;
    useBench.setState({ current: v.measured, look: 'ruler' });
    if (!scene.measured.has(sp.letter)) note(`ruler:${sp.letter}`);
    useLabView.getState().set({ mode: 'read', selected: null });
    kit.setSheet(null);
  };
  const ctx = { v, state, update, note, scene, open: (w: 'notebook' | 'task' | 'cupboard') => (useLabView.getState().set({ selected: null }), kit.setSheet(w)), lens: openLens, ruler: openRuler };
  const onCarry = useCallback(
    (id: string) => {
      note(`collect:${id}`);
      notify(`${APPARATUS_LABEL[id as ApparatusId]} is on your bench.`, 'success', 1500);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stage],
  );
  const back = () => useLabView.getState().set({ mode: 'bench', focus: 'trays' });
  const step = (d: number) => openLens((current + d + v.specimens.length) % v.specimens.length);
  const onKey = (e: KeyboardEvent, type: 'down' | 'up') => {
    if (type === 'up') return false;
    if (useLabView.getState().mode === 'read' && useBench.getState().look === 'lens') {
      if (e.key === 'ArrowLeft') return (step(-1), true);
      if (e.key === 'ArrowRight') return (step(1), true);
    }
    return false;
  };
  const debriefView = (c: CriterionScore) => (c.id === 'measurement' || c.id === 'units' ? { mode: 'bench' as const, focus: 'tools', notebook: true } : { mode: 'bench' as const, focus: 'trays', notebook: true });
  const sheetOf = (x: { v: typeof v; state: BioSpecimensState; update: SpecUpdate }) => <AnswerSheet v={x.v} state={x.state} readOnly={readOnly} update={x.update} />;
  const needsSet = !attemptState.set && !fromLesson && stage !== 'sandbox';

  return (
    <div className="relative">
      <LabShell
        kit={kit}
        title="Biology lab"
        heading="Biology laboratory — the specimen bench"
        intro={{
          short: 'Coat and gloves on, collect a hand lens and a ruler, then examine and record each specimen.',
          steps: ['Put on your lab coat (hooks by the door) and gloves (on your bench).', 'Collect a hand lens and a ruler from the cupboard.', 'Examine each specimen with the hand lens; name, classify and label it.', 'Measure one with the ruler, compare two, then wash your hands.'],
        }}
        readingStatus={look === 'lens' ? 'using the hand lens' : 'measuring'}
        scene={
          <>
            <LabScene v={shown.v} state={shown.state} scene={shownScene} guided={guided || stage === 'learn'} interactive={!readOnly && work} onSlow={kit.onSlow} />
            {!readOnly && work && <SpecimenDrags v={v} scene={scene} onLens={openLens} onRuler={openRuler} />}
          </>
        }
        endsAt={endsAt}
        onHandIn={onHandIn}
        onUse2d={onUse2d}
        attemptId={attemptId}
        steps={steps}
        hint={practice && !guided && state.set ? nextHint3d(v, state, scene) : null}
        objectPanel={(id) => objectPanel(id, ctx)}
        explain={explainer}
        task={
          <div className="space-y-2 text-[13.5px] leading-relaxed">
            <p className="font-semibold">{v.info.title}</p>
            <p>Specimens {v.specimens.map((x) => x.letter).join(', ')} are on the bench. Examine them carefully, using the hand lens where necessary.</p>
            <ol className="list-[lower-alpha] space-y-0.5 pl-6">
              <li>Name each specimen and state its {v.info.classify.question.toLowerCase()}.</li>
              <li>Label the numbered parts on each drawing.</li>
              <li>State two observable features of each specimen and one function or adaptation.</li>
              <li>
                Measure the {v.specimens[v.measured]!.def.lengthOf ?? 'length'} of specimen {v.specimens[v.measured]!.letter}. Your drawing of it is {v.drawingLength.toFixed(1)} cm long: calculate its magnification.
              </li>
              <li>
                State two similarities and two differences between {v.specimens[v.compare[0]]!.letter} and {v.specimens[v.compare[1]]!.letter}.
              </li>
            </ol>
            <p className="pt-2 text-[12.5px] font-semibold">Safety</p>
            <p className="text-[13px] text-muted-foreground">
              Lab coat: {scene.coat ? 'on' : 'not on'} · Gloves: {scene.gloves ? 'on' : 'not on'} · Hands washed at the end: {scene.washedAtEnd ? 'yes' : 'not yet'}
            </p>
          </div>
        }
        notebook={sheetOf(cur)}
        cupboard={{
          blurb: 'Take what you need to your bench — or drag things from the cupboard onto the tray.',
          items: CUPBOARD.map((id) => ({ id, label: APPARATUS_LABEL[id] })),
          has: (id) => scene.collected.has(id as ApparatusId),
          onToggle: (id, take) => note(`${take ? 'collect' : 'return'}:${id}`),
          onCarry,
        }}
        modeBar={<ModeBar views={SPEC_VIEW_BUTTONS} read={{ label: 'Hand lens', can: scene.collected.has('lens') }} onRead={() => openLens(current)} />}
        readingPanel={
          look === 'ruler' ? (
            <RulerView v={v} state={state} readOnly={readOnly} update={update} onBack={back} onLens={() => openLens(v.measured)} />
          ) : (
            <LensView v={v} index={Math.min(current, v.specimens.length - 1)} onPrev={() => step(-1)} onNext={() => step(1)} onSheet={() => (useBench.setState({ tab: current }), back(), kit.setSheet('notebook'))} onBack={back} onRuler={current === v.measured ? openRuler : undefined} />
          )
        }
        canRead={scene.collected.has('lens')}
        dragFeedback={(d) =>
          d.kind === 'lensdrag' || d.kind === 'rulerdrag' ? (
            <span className="absolute left-1/2 top-24 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-[12.5px] font-medium text-white shadow-lg">{d.kind === 'lensdrag' ? 'Drop the hand lens on a specimen' : `Drop the ruler on specimen ${v.specimens[v.measured]!.letter}`}</span>
          ) : null
        }
        learn={learn}
        demo={demo.player}
        demoPanel={demo.panel}
        sandbox={{
          form: (
            <SandboxSetupForm
              initial={sandbox.set}
              onStart={(x) => {
                sandbox.start(x);
                kit.goStage('sandbox');
              }}
            />
          ),
          results: <SandboxResults sandbox={sandbox} />,
        }}
        ask={{ suggestions: ASK_SUGGESTIONS, extra: `What features should I look for in ${SPECIMEN_SET_INFO[set].title.toLowerCase()}?` }}
        tourSteps={TOUR}
        safety={SAFETY}
        briefed={attemptState.log.some((e) => e.a.startsWith('safety-briefing'))}
        onBriefing={(outcome) => noteAttempt(`safety-briefing:${outcome}`)}
        missing={bioSpecimensMissing(attemptState, seed)}
        helpRows={HELP_ROWS}
        onResetStation={() => useBench.setState(BENCH_IDLE)}
        onKey={onKey}
        debriefView={debriefView}
      />
      {needsSet && !kit.intro && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/50 p-4">
          <div className="max-h-full w-full max-w-md overflow-y-auto rounded-2xl bg-card p-4 text-card-foreground shadow-2xl">
            <p className="font-display text-lg font-semibold">Choose the specimens</p>
            <p className="mb-3 text-[13px] text-muted-foreground">{readOnly ? 'No specimens were chosen.' : 'Which set of specimens will you examine?'}</p>
            {!readOnly && (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {SPECIMEN_SETS.map((st) => (
                  <Button key={st} variant="outline" className="h-auto justify-start whitespace-normal py-2 text-left" onClick={() => choose(st)}>
                    {SPECIMEN_SET_INFO[st].title}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
