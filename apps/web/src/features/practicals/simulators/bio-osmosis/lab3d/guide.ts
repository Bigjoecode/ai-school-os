import { PLAS_MEDIUM_CONC, PLAS_MIN_WAIT, PLAS_STAGES, POTATO_MIN_SOAK, plasCaptureOf, plasStageIrrigation, potatoPhase, type BioOsmosisState } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { neededFor, type OsmoScene } from './scene-state';

/**
 * Guided mode (practice only): the WAEC routine as a checklist — the potato
 * cylinders bored, trimmed, blotted, measured, weighed, soaked together,
 * re-measured and graphed; the epidermis mounted, irrigated and counted; the
 * agar cubes measured, timed and cut — without giving away the readings.
 * Corrections teach the habits that matter (blot, draw it under, wait).
 */

export function osmoGuideSteps(s: BioOsmosisState, scene: OsmoScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'POTATO';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const steps: GuideStep[] = [
    { id: 'safety', label: task === 'AGAR' ? 'Put on your lab coat and goggles' : 'Put on your lab coat', target: !scene.coat ? 'coat' : task === 'AGAR' && !scene.goggles ? 'goggles' : null, why: task === 'AGAR' ? 'The acid, and the alkali in the agar, harm the eyes.' : 'It keeps stains and solutions off your clothes.', done: scene.coat && (task !== 'AGAR' || scene.goggles) },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(task).map((a) => a.label).join(', ') + '.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || s.potato.cyl.length > 0 || s.plas.peeled || s.agar.cubes.length > 0 },
  ];
  const tail = (wash: string): GuideStep[] => [
    { id: 'written', label: 'Write two precautions and your explanation', target: 'book', why: 'Precautions are things you did to make the results reliable.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'wash', label: 'Wash your hands', target: 'handwash', why: wash, done: scene.washedAtEnd },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];

  if (task === 'POTATO') {
    const w = s.potato;
    const concs = new Set(w.cyl.map((c) => c.conc));
    const has = (i: number, ph: 'B' | 'A', what: 'm' | 'w') => (what === 'm' ? w.measures : w.weighs).some((x) => x.cyl === i && x.phase === ph);
    const B = w.cyl.map((c, i) => ({ c, i }));
    const soakStart = w.cyl.find((c) => c.placedAt !== null)?.placedAt ?? null;
    const rowsDone = w.rows.filter((r) => r.l0 && r.l1 && r.m0 && r.m1 && r.pl && r.pm && r.firm).length;
    steps.push(
      { id: 'bore', label: `Bore a cylinder for water and for each sucrose solution (${w.cyl.length} so far)`, target: 'tuber', why: 'At least five solutions including distilled water — some weaker and some stronger than the cell sap.', done: concs.size >= 5 && concs.has(0), group: 'Before soaking' },
      { id: 'trim', label: 'Trim every cylinder to 50 mm', target: 'tile', why: 'The same starting length, and no skin.', done: w.cyl.length > 0 && w.cyl.every((c) => c.trimmed), group: 'Before soaking' },
      { id: 'blot0', label: 'Blot each cylinder dry before you weigh it', target: 'paper', why: 'Sap on the cut surface would be weighed too.', done: w.cyl.length > 0 && w.cyl.every((c) => c.blotB || c.placedAt !== null), group: 'Before soaking' },
      { id: 'read0', label: 'Measure and weigh each cylinder', target: B.find((x) => !has(x.i, 'B', 'm') || !has(x.i, 'B', 'w')) ? `cyl:${B.find((x) => !has(x.i, 'B', 'm') || !has(x.i, 'B', 'w'))!.i}` : 'balance', why: 'Length to the nearest mm; mass to 0.01 g. Write each in the notebook.', done: w.cyl.length > 0 && B.every((x) => has(x.i, 'B', 'm') && has(x.i, 'B', 'w')), group: 'Before soaking' },
      { id: 'soak', label: soakStart === null ? 'Put every cylinder into its solution at the same time' : `Soak them at least ${POTATO_MIN_SOAK} minutes (now ${w.clock - soakStart} min)`, target: 'clock', why: 'All the same time, fully covered. An hour gets them close to equilibrium.', done: soakStart !== null && (w.cyl.some((c) => c.removedAt !== null) || w.clock - soakStart >= POTATO_MIN_SOAK), group: 'Soaking' },
      { id: 'out', label: 'Take them all out together', target: 'clock', why: 'So every cylinder has soaked for the same time.', done: w.cyl.length > 0 && w.cyl.every((c) => potatoPhase(c) === 'A'), group: 'Soaking' },
      { id: 'read1', label: 'Blot, measure, weigh and feel each one again', target: B.find((x) => potatoPhase(x.c) === 'A' && (!has(x.i, 'A', 'm') || !has(x.i, 'A', 'w') || !x.c.blotA)) ? `cyl:${B.find((x) => potatoPhase(x.c) === 'A' && (!has(x.i, 'A', 'm') || !has(x.i, 'A', 'w') || !x.c.blotA))!.i}` : 'balance', why: 'Blot gently the same way as before. Firm = turgid; soft and bendy = flaccid.', done: w.cyl.length > 0 && B.every((x) => potatoPhase(x.c) === 'A' && x.c.blotA && has(x.i, 'A', 'm') && has(x.i, 'A', 'w')), group: 'After soaking' },
      { id: 'table', label: `Fill in the table and the % changes${w.cyl.length ? ` (${rowsDone} of ${w.cyl.length} rows)` : ''}`, target: 'book', why: '% change = (final − initial) ÷ initial × 100, with a minus sign for a loss.', done: w.cyl.length > 0 && rowsDone === w.cyl.length, group: 'Results' },
      { id: 'graph', label: 'Plot % change in mass against concentration and draw the best line', target: 'book', why: 'Points scattered evenly on both sides of a straight line.', done: !!w.line, group: 'Results' },
      { id: 'iso', label: 'Read the isotonic concentration where the line crosses 0 %', target: 'book', why: 'No net movement of water there: it estimates the concentration of the cell sap.', done: !!w.iso.trim(), group: 'Results' },
      ...tail('Before you leave the laboratory.'),
    );
    return steps;
  }

  if (task === 'PLASMOLYSIS') {
    const w = s.plas;
    const strong = w.irrigations.find((x) => PLAS_MEDIUM_CONC[x.to] > 0.3);
    const back = strong ? w.irrigations.find((x) => x.at >= strong.at && PLAS_MEDIUM_CONC[x.to] <= 0.3) : undefined;
    const cap = (st: (typeof PLAS_STAGES)[number]) => plasCaptureOf(w, st);
    const sCap = cap('STRONG');
    const sAt = sCap >= 0 ? w.captures[sCap]!.at : null;
    const sIrr = sAt !== null ? plasStageIrrigation(w, 'STRONG', sAt) : null;
    steps.push(
      { id: 'peel', label: 'Peel a thin strip of the red epidermis', target: 'onion', why: 'One cell thick, so light passes through each cell.', done: w.peeled, group: 'The slide' },
      { id: 'mount', label: 'Mount it in a drop of distilled water', target: 'dropper:WATER', why: 'First see the cells turgid, in water.', done: !!w.mount, group: 'The slide' },
      { id: 'cs', label: 'Lower the cover slip at an angle', target: 'slide', why: 'With the mounted needle, so no air bubbles are trapped.', done: w.coverslip, group: 'The slide' },
      { id: 'stage', label: 'Put the slide on the microscope stage', target: 'slide', why: 'Clipped over the hole in the stage.', done: w.onStage, group: 'The slide' },
      { id: 'water', label: 'Record the cells in water: ×10, then ×40', target: 'scope', why: 'Low power first to find a good area, then high power for detail.', done: w.captures.some((c) => c.objective === 10) && cap('WATER') >= 0 && w.captures.some((c) => c.objective === 40), group: 'In water' },
      { id: 'irr', label: 'Draw strong salt or sucrose under the cover slip', target: !strong ? 'dropper:SUCROSE' : 'paper', why: 'A drop at one edge, filter paper at the opposite edge to pull it right under.', done: !!strong && strong.drawn, group: 'Strong solution' },
      { id: 'wait', label: strong ? `Wait 5–10 minutes (now ${Math.max(0, w.clock - strong.at)} min)` : 'Wait 5–10 minutes', target: 'scope', why: 'The solution mixes in and water leaves the cells by osmosis.', done: !!strong && w.clock - strong.at >= PLAS_MIN_WAIT, group: 'Strong solution' },
      { id: 'count', label: 'Record the view at ×40 and count the cells', target: 'scope', why: 'Cells with their centre in the field, and those with the cytoplasm pulled away from the wall.', done: sAt !== null && !!sIrr && sAt - sIrr.at >= PLAS_MIN_WAIT && !!w.count.total.trim() && !!w.count.plasmolysed.trim(), group: 'Strong solution' },
      { id: 'back', label: 'Draw water back under the cover slip', target: !back ? 'dropper:WATER' : 'paper', why: 'Water re-enters the cells: deplasmolysis.', done: !!back && back.drawn, group: 'Back in water' },
      { id: 'backrec', label: 'After 5–10 minutes, record the view again', target: 'scope', why: 'The vacuoles swell back against the wall.', done: cap('BACK') >= 0 && !!back && w.captures[cap('BACK')]!.at - back.at >= PLAS_MIN_WAIT, group: 'Back in water' },
      { id: 'rows', label: 'Write the three observations and inferences', target: 'book', why: 'What the vacuole, cytoplasm and wall did; then what that shows.', done: w.rows.every((r) => r.observation.trim() && r.claims.length), group: 'Notebook' },
      { id: 'label', label: 'Label the drawing of a plasmolysed cell', target: 'book', why: 'Six labels; the space between the wall and the membrane holds the outside solution.', done: w.labels.filter(Boolean).length >= 6 && w.drawing.length > 0, group: 'Notebook' },
      ...tail('Before you leave; put broken slides in the sharps jar.'),
    );
    return steps;
  }

  const w = s.agar;
  const sizes = new Set(w.cubes.map((c) => c.size));
  const started = w.cubes.some((c) => c.placedAt !== null);
  const cut = w.cubes.findIndex((c) => c.cutAt !== null);
  const timed = w.cubes.filter((c) => c.placedAt !== null && c.cutAt === null);
  steps.push(
    { id: 'cut', label: `Cut cubes of 1, 2 and 3 cm and a spare (${w.cubes.length} so far)`, target: 'block', why: 'Three sizes give three SA : V ratios; the spare is cut open later.', done: sizes.size >= 3 && w.cubes.length >= 4, group: 'The cubes' },
    { id: 'measure', label: 'Measure the side of every cube', target: w.cubes.findIndex((_, i) => !w.measured.includes(i)) >= 0 ? `cube:${w.cubes.findIndex((_, i) => !w.measured.includes(i))}` : 'ruler', why: 'Then work out each surface area, volume and SA : V.', done: w.cubes.length > 0 && w.cubes.every((_, i) => w.measured.includes(i)), group: 'The cubes' },
    { id: 'acid', label: 'Pour enough acid to cover every cube', target: 'acidbottle', why: 'A cube sticking out of the acid is reached later from the top.', done: w.acid === 'FULL', group: 'The acid' },
    { id: 'in', label: 'Put all the cubes into the acid at the same moment', target: 'acid', why: 'Then start the stopwatch.', done: started && w.cubes.every((c) => c.placedAt !== null), group: 'The acid' },
    { id: 'spare', label: 'After about 5 minutes, take out the spare cube and cut it in half', target: 'acid', why: 'The colourless rim shows how far the acid has diffused.', done: cut >= 0, group: 'Timing' },
    { id: 'depth', label: 'Measure the depth of the colourless zone', target: cut >= 0 ? `cube:${cut}` : 'ruler', why: 'Rate of diffusion = depth ÷ time.', done: cut >= 0 && w.depthMeasured.includes(cut), group: 'Timing' },
    { id: 'watch', label: 'Watch until every cube is colourless; note each time', target: 'stopwatch', why: 'The smallest cube clears first.', done: timed.length > 0 && w.rows.every((r, i) => w.cubes[i]!.cutAt !== null || !!r.time.trim()), group: 'Timing' },
    { id: 'table', label: 'Fill in the table: side, area, volume, SA : V, time', target: 'book', why: 'Surface area = 6 × side²; volume = side³.', done: w.rows.length > 0 && w.rows.every((r) => r.side && r.sa && r.vol && r.ratio), group: 'Notebook' },
    { id: 'conclude', label: 'Name the first cube to clear and conclude', target: 'book', why: 'Relate the times to the SA : V ratios.', done: w.first !== null && w.claims.length > 0 && !!w.depth.rate.trim(), group: 'Notebook' },
    ...tail('Acid on your hands: wash them before you leave.'),
  );
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function osmoCorrection(a: string, s: BioOsmosisState, scene: OsmoScene): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb.startsWith('weigh#')) {
    const i = Number(verb.slice(6)) - 1;
    const x = s.potato.weighs.filter((y) => y.cyl === i).at(-1);
    if (x && !x.blotted) return { title: 'Blot it dry before you weigh it.', why: x.phase === 'A' ? 'Solution clinging to the cylinder is weighed as if it were water the cells took in. Roll it gently on filter paper, then weigh it again.' : 'Sap from the cut surface adds to the mass. Blot it on filter paper, then weigh it again.', focus: 'balance' };
  }
  if (verb.startsWith('measure#') && !s.potato.cyl[Number(verb.slice(8)) - 1]?.trimmed) return { title: 'Trim it to 50 mm first.', why: 'Every cylinder should start the same length: cut it on the tile with the scalpel, away from your fingers.', focus: 'tile' };
  if (verb === 'remove' || verb.startsWith('remove#')) {
    const c = s.potato.cyl.find((x) => x.removedAt !== null);
    if (c && c.placedAt !== null && (c.removedAt ?? 0) - c.placedAt < POTATO_MIN_SOAK) return { title: 'That was a short soak.', why: `Leave the cylinders at least ${POTATO_MIN_SOAK} minutes (better an hour) so the water has time to move in or out.`, focus: 'beakers' };
  }
  if (verb.startsWith('place#') && s.potato.cyl.some((c) => c.placedAt === null)) return { title: 'Put them all in at the same time.', why: 'Each cylinder should soak for the same time: use “Put every cylinder into its solution now”.', focus: 'beakers' };
  if (verb === 'drop' && arg && PLAS_MEDIUM_CONC[arg as 'WATER'] !== undefined && !scene.collected.has('paper')) return { title: 'You will need filter paper.', why: 'A drop at the edge barely mixes in: filter paper at the opposite edge draws it right under the cover slip.', focus: 'slide' };
  if (verb.startsWith('capture@')) {
    const w = s.plas;
    const c = w.captures.at(-1);
    const irr = c ? [...w.irrigations].filter((x) => x.at <= c.at).at(-1) : undefined;
    if (irr && !irr.drawn && c && c.at > irr.at) return { title: 'The drop was not drawn under the cover slip.', why: 'Put the filter paper at the opposite edge straight after the drop, otherwise little of the new liquid reaches the cells.', focus: 'slide' };
    if (irr && c && c.at - irr.at < PLAS_MIN_WAIT && PLAS_MEDIUM_CONC[irr.to] > 0.3) return { title: 'Give it a few more minutes.', why: 'The solution takes 5–10 minutes to mix in and draw water out of the cells. Wait, then record again.', focus: 'scope' };
  }
  if (verb === 'mount' && arg && arg !== 'WATER') return { title: 'Mount it in water first.', why: 'You need to see the turgid cells in water before the strong solution — that is the comparison.', focus: 'slide' };
  if (verb === 'acid' && arg === 'SHALLOW') return { title: 'That will not cover the larger cubes.', why: 'Use enough acid to cover every cube completely, so it diffuses in from all six faces.', focus: 'acid' };
  if (verb.startsWith('place-cube#') && s.agar.cubes.some((c) => c.placedAt === null)) return { title: 'Put them all in at the same moment.', why: 'Otherwise their times cannot be compared.', focus: 'acid' };
  if ((verb === 'cube' || verb === 'acid') && s.task === 'AGAR' && !scene.goggles) return { title: 'Goggles on.', why: 'The acid, and the alkali in the agar, are harmful to the eyes.', focus: 'block' };
  if (verb === 'away') return { title: 'Watch the cubes.', why: 'If you leave the bench you cannot see when each cube becomes colourless.', focus: 'acid' };
  if (verb === 'collect' && arg && !neededFor(s.task ?? 'POTATO').some((x) => x.id === arg)) return { title: 'That is not needed for this practical.', why: 'Only take what the practical needs; you can put it back from your bench or from the cupboard list.' };
  return null;
}
