import { ETH_FULL, OXY_MIN_WAIT, POTO_CONDS, POTO_MIN_WAIT, STARCH_MIN_HOURS, oxyLampAt, potoCondAt, potoCondSince, type BioPlantState } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { neededFor, type PlantScene } from './scene-state';

/**
 * Guided mode (practice only): the WAEC routine as a checklist — the shoot
 * cut and fitted under water, sealed, adjusted and timed in each condition;
 * the pondweed rig with its heat filter, each distance after 5 minutes; the
 * destarched plant, boiled leaves, ethanol with the flame off, iodine —
 * without giving away the readings. Corrections teach the habits that matter.
 */

export function plantGuideSteps(s: BioPlantState, scene: PlantScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'POTOMETER';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const begun = !!s.poto.cut || s.oxy.plant || s.oxy.nahco3 || !!s.starch.plant;
  const steps: GuideStep[] = [
    { id: 'safety', label: task === 'STARCH' ? 'Put on your lab coat and goggles' : 'Put on your lab coat', target: !scene.coat ? 'coat' : task === 'STARCH' && !scene.goggles ? 'goggles' : null, why: task === 'STARCH' ? 'Boiling water and ethanol can splash.' : 'It keeps water and plant sap off your clothes.', done: scene.coat && (task !== 'STARCH' || scene.goggles) },
    { id: 'collect', label: `Collect your apparatus${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(task).map((a) => a.label).join(', ') + '.', done: !missing.length },
    { id: 'bench', label: 'Go to your bench', target: 'mybench', why: 'Bench 2, at the front.', done: mode !== 'walk' || begun },
  ];
  const tail = (wash: string): GuideStep[] => [
    { id: 'written', label: 'Write two precautions and your explanation', target: 'book', why: 'Precautions are things you did to make the results reliable or safe.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'wash', label: 'Wash your hands', target: 'handwash', why: wash, done: scene.washedAtEnd },
    { id: 'handin', label: 'Hand in your lab', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];

  if (task === 'POTOMETER') {
    const w = s.poto;
    const used = POTO_CONDS.filter((c) => w.runs.some((r) => r.cond === c));
    const cur = potoCondAt(w, w.clock);
    const curRuns = w.runs.filter((r) => r.cond === cur && r.at >= potoCondSince(w, w.clock) - 1e-9).length;
    const adjusted = w.bubble && w.clock - potoCondSince(w, w.clock) >= POTO_MIN_WAIT - 1e-9;
    const rowsDone = used.filter((c) => {
      const r = w.rows[POTO_CONDS.indexOf(c)];
      return r && r.t1 && r.t2 && r.t3 && r.mean && r.rate && r.vol;
    }).length;
    steps.push(
      { id: 'cut', label: 'Cut the shoot under water', target: 'shoot', why: 'Cut in air, an air bubble enters the xylem and blocks the water column.', done: !!w.cut, group: 'Set up' },
      { id: 'fit', label: 'Fit it into the potometer under water', target: 'shoot', why: 'Still under water, so no air gets in at the cut end.', done: !!w.fit, group: 'Set up' },
      { id: 'seal', label: 'Seal the joint with Vaseline', target: 'vaseline', why: 'An airtight joint: a leak lets air in and the bubble moves erratically.', done: w.sealed, group: 'Set up' },
      { id: 'bubble', label: 'Dry the leaves and let in one air bubble', target: 'potometer', why: 'The bubble marks how far the water moves.', done: w.bubble, group: 'Set up' },
      { id: 'adjust', label: `Let the shoot adjust 5 minutes (${w.bubble ? Math.round((w.clock - potoCondSince(w, w.clock)) * 10) / 10 : 0} min)`, target: 'clock', why: 'The rate settles to a steady value after every change.', done: !!adjusted || curRuns > 0, group: 'Timing' },
      { id: 'time3', label: `Reset the bubble and time it over 30 mm, three times (${curRuns} of 3)`, target: 'potometer', why: 'Three timings give a reliable mean.', done: curRuns >= 3, group: 'Timing' },
      { id: 'conds', label: `Repeat in still air and two other conditions (${used.length} so far)`, target: used.includes('FAN') ? 'bags' : 'fan', why: 'Still air is the control; compare the fan, the lamp, the dark or humid air with it.', done: used.includes('STILL') && used.length >= 3 && used.every((c) => w.runs.filter((r) => r.cond === c).length >= 3), group: 'Timing' },
      { id: 'table', label: `Fill in the times, means, rates and volumes (${rowsDone} of ${used.length} rows)`, target: 'book', why: 'Rate = 30 mm ÷ mean time in minutes; volume = rate × πr².', done: used.length > 0 && rowsDone === used.length, group: 'Results' },
      { id: 'chart', label: 'Plot the bar chart and conclude', target: 'book', why: 'Compare each condition with still air.', done: w.bars.length >= 3 && !!w.fastest && w.claims.length > 0, group: 'Results' },
      ...tail('Before you leave the laboratory.'),
    );
    return steps;
  }

  if (task === 'OXYGEN') {
    const w = s.oxy;
    const d = oxyLampAt(w, w.clock);
    const since = w.clock - (w.moves.filter((m) => m.at <= w.clock).at(-1)?.at ?? 0);
    const countsHere = d === null ? 0 : w.counts.filter((c) => oxyLampAt(w, c.at) === d).length;
    const rowsFull = w.rows.filter((r) => r.c1 && r.c2 && r.c3 && r.mean && r.li).length;
    steps.push(
      { id: 'nahco3', label: 'Add a pinch of sodium hydrogencarbonate', target: 'bottle', why: 'It supplies carbon dioxide, so CO₂ does not limit the rate.', done: w.nahco3, group: 'Set up' },
      { id: 'plant', label: 'Put the pondweed under the funnel', target: 'weed', why: 'Cut end upwards: the bubbles of gas leave from it.', done: w.plant, group: 'Set up' },
      { id: 'tube', label: 'Put a test tube of water over the funnel stem', target: 'rig', why: 'It collects the gas to test at the end.', done: w.tubeAt !== null, group: 'Set up' },
      { id: 'shield', label: 'Put the water trough between the lamp and the beaker', target: 'trough', why: 'A heat filter: the lamp must not warm the water.', done: w.shield, group: 'Set up' },
      { id: 'dark', label: 'Darken the room', target: 'rig', why: 'Only the lamp should light the plant.', done: w.dark, group: 'Set up' },
      { id: 'lamp', label: d === null ? 'Switch the lamp on at 10 cm' : `Lamp at ${d} cm: wait 5 minutes (${Math.round(since * 10) / 10} min)`, target: 'lamp', why: 'The plant needs time to adjust to the new light.', done: d !== null && (since >= OXY_MIN_WAIT || countsHere > 0), group: 'Counting' },
      { id: 'count', label: `Count the bubbles for a minute, three times (${countsHere} of 3)`, target: 'rig', why: 'Three counts give a reliable mean.', done: countsHere >= 3, group: 'Counting' },
      { id: 'further', label: `Move the lamp further and repeat until bubbling stops (${w.rows.length} distances)`, target: 'lamp', why: 'At least five distances; far enough that the bubbling stops.', done: w.rows.length >= 5 && w.rows.some((r) => r.d >= 50), group: 'Counting' },
      { id: 'splint', label: 'Test the gas with a glowing splint', target: 'splint', why: 'Oxygen relights a glowing splint.', done: w.splintAt !== null, group: 'Counting' },
      { id: 'table', label: `Fill in the counts, means and light intensities (${rowsFull} of ${w.rows.length})`, target: 'book', why: 'Light intensity = 10 000 ÷ d².', done: w.rows.length > 0 && rowsFull === w.rows.length, group: 'Results' },
      { id: 'graph', label: 'Plot the graph, draw a smooth curve and conclude', target: 'book', why: 'Rate against light intensity: it rises, then levels off.', done: !!w.axis && !!w.curve && w.claims.length > 0 && !!w.compD.trim(), group: 'Results' },
      ...tail('Before you leave the laboratory.'),
    );
    return steps;
  }

  const w = s.starch;
  const l = w.leaves.find((x) => !x.iodine);
  steps.push(
    { id: 'plant', label: 'Use the destarched plant', target: 'pot', why: 'Kept 48 hours in the dark: any starch found was made during the experiment.', done: !!w.plant, group: 'Before the light' },
    { id: 'treat', label: 'Foil strip on one leaf; another leaf in the KOH flask', target: 'pot', why: 'The foil keeps light out; potassium hydroxide absorbs carbon dioxide.', done: w.foil && w.koh, group: 'Before the light' },
    { id: 'light', label: `Bright light for at least ${STARCH_MIN_HOURS} hours (${w.hours} h)`, target: 'pot', why: 'Time to make enough starch to show.', done: w.hours >= STARCH_MIN_HOURS, group: 'Before the light' },
    { id: 'pick', label: `Pick the leaves (${w.leaves.length} picked)`, target: 'pot', why: 'The foil-strip leaf, a variegated leaf, the leaf without CO₂ and a green control.', done: w.leaves.length >= 3, group: 'The test' },
    { id: 'boil', label: 'Boil each leaf in water for a minute', target: 'bath', why: 'Kills the cells and breaks the membranes so iodine can get in.', done: w.leaves.length > 0 && w.leaves.every((x) => x.boiled > 0), group: 'The test' },
    { id: 'flameoff', label: 'Turn the flame OFF', target: 'bath', why: 'Ethanol is highly flammable: never near a naked flame.', done: !w.flame && w.leaves.some((x) => x.eth > 0), group: 'The test' },
    { id: 'ethanol', label: 'Each leaf in a tube of ethanol in the hot water', target: 'bath', why: 'The ethanol dissolves the chlorophyll so the colour will show.', done: w.leaves.length > 0 && w.leaves.every((x) => x.eth >= ETH_FULL), group: 'The test' },
    { id: 'iodine', label: 'Soften, spread on the tile, add iodine', target: l ? `leaf:${w.leaves.indexOf(l)}` : 'iodine', why: 'Blue-black shows starch; yellow-brown, none.', done: w.leaves.length > 0 && w.leaves.every((x) => x.iodine), group: 'The test' },
    { id: 'grid', label: 'Lay the foil-strip leaf on the grid and count', target: 'grid', why: 'Squares covered and squares blue-black: the % that made starch.', done: w.grid.leaf !== null && !!w.grid.total.trim() && !!w.grid.blue.trim(), group: 'Results' },
    { id: 'rows', label: 'Write each leaf’s observation and inference; label the drawing', target: 'book', why: 'What colours appeared where, then what that shows.', done: w.leaves.length > 0 && w.rows.every((r) => r.observation.trim() && r.claims.length) && w.labels.filter(Boolean).length >= 4, group: 'Results' },
    ...tail('Iodine stains: wash your hands before you leave.'),
  );
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function plantCorrection(a: string, s: BioPlantState, scene: PlantScene): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'cut' && arg === 'AIR') return { title: 'Cut it under water.', why: 'A shoot cut in air sucks an air bubble into its xylem, which blocks the water column. The uptake will be far too slow.', focus: 'shoot' };
  if (verb === 'fit' && arg === 'AIR') return { title: 'Fit it under water.', why: 'Fitting it in air lets air into the cut end: an air lock in the xylem.', focus: 'potometer' };
  if (verb === 'bubble' && !s.poto.sealed) return { title: 'Seal the joint first.', why: 'Smear Vaseline round the joint so it is airtight; a leak makes the bubble move erratically.', focus: 'potometer' };
  if (verb.startsWith('time#')) {
    const r = s.poto.runs.at(-1);
    if (r && r.at - potoCondSince(s.poto, r.at) < POTO_MIN_WAIT - 1e-9) return { title: 'Let it adjust first.', why: 'After setting up or changing the condition, wait 5 minutes for the rate to settle before timing.', focus: 'potometer' };
  }
  if (verb.startsWith('count#')) {
    const c = s.oxy.counts.at(-1);
    const since = c ? c.at - (s.oxy.moves.filter((m) => m.at <= c.at).at(-1)?.at ?? 0) : 99;
    if (since < OXY_MIN_WAIT - 1e-9) return { title: 'Wait 5 minutes after moving the lamp.', why: 'The plant takes a few minutes to adjust to the new light intensity; counts taken straight away are wrong.', focus: 'oxygen' };
  }
  if (verb === 'lamp' && arg !== 'off' && !s.oxy.shield) return { title: 'Put the heat filter in.', why: 'Without the water trough the lamp warms the water, and the temperature change alters the rate as well as the light.', focus: 'oxygen' };
  if (verb === 'shield' && arg === 'off') return { title: 'Keep the heat filter in place.', why: 'It keeps the temperature constant while you change the light.', focus: 'oxygen' };
  if (verb === 'plant' && arg === 'WINDOW') return { title: 'That plant has not been destarched.', why: 'Its leaves are already full of starch from the sunny window, so every leaf will turn blue-black whatever you do to it.', focus: 'plant' };
  if (verb.startsWith('ethanol#') && s.starch.flame) return { title: 'Turn the flame off!', why: 'Ethanol is highly flammable. Turn the Bunsen off before the ethanol tube goes into the hot water bath.', focus: 'bath' };
  if (verb.startsWith('eth-direct#')) return { title: 'Never heat ethanol over a flame.', why: 'Its vapour catches fire. Turn the flame off and stand the tube in the hot water instead.', focus: 'bath' };
  if (verb.startsWith('ethanol#')) {
    const l = s.starch.leaves[Number(verb.slice(8)) - 1];
    if (l && l.boiled === 0) return { title: 'Boil the leaf in water first.', why: 'Boiling kills the cells and breaks the membranes; without it the iodine cannot reach the starch.', focus: 'bath' };
  }
  if (verb.startsWith('tile#')) {
    const l = s.starch.leaves[Number(verb.slice(5)) - 1];
    if (l && !l.soft && l.eth > 0) return { title: 'Soften it first.', why: 'After the ethanol the leaf is brittle. Dip it in warm water so it spreads without cracking.', focus: 'tile' };
  }
  if (verb === 'light' && s.starch.plant && (!s.starch.foil || !s.starch.koh)) return { title: 'Set up the leaves before the light.', why: 'The foil strip and the KOH flask must be on before the plant goes into the light, or those leaves make starch too.', focus: 'plant' };
  if (verb === 'collect' && arg && !neededFor(s.task ?? 'POTOMETER').some((x) => x.id === arg)) return { title: 'That is not needed for this practical.', why: 'Only take what the practical needs; you can put it back from your bench or from the cupboard list.' };
  if (verb === 'flame' && arg === 'on' && s.task === 'STARCH' && !scene.goggles) return { title: 'Goggles on.', why: 'Boiling water can spit; ethanol can splash.', focus: 'bath' };
  return null;
}
