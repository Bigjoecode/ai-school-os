import { CAP_MIN_WAIT, FAC_DAYS, FAC_MIN_DAYS, FAC_SITES, QUAD_HERBS, QUAD_MIN, SOIL_DRAIN_TIMES, SOIL_JAR_LABELS, SOIL_MIN_SETTLE, type BioEcologyState } from '@aischool/shared';
import type { Correction, GuideStep } from '../../../lab3d-kit/guide';
import type { CameraMode } from '../../../lab3d-kit/store';
import { neededFor, type EcoScene } from './scene-state';

/**
 * Guided mode (practice only): the WAEC routine of each investigation as a
 * checklist, without giving away the readings, and gentle corrections for
 * the sampling mistakes that spoil field work.
 */

export function ecoGuideSteps(s: BioEcologyState, scene: EcoScene, mode: CameraMode): GuideStep[] {
  const task = s.task ?? 'QUADRAT';
  const missing = neededFor(task).filter((a) => !scene.collected.has(a.id));
  const started = s.log.some((e) => /^(peg|quad|sweep|go:|read:|station|jar|funnel|air|crucible)/.test(e.a));
  const steps: GuideStep[] = [
    { id: 'safety', label: task === 'SOIL' ? 'Put on your lab coat and goggles' : 'Put on your lab coat', target: !scene.coat ? 'coat' : task === 'SOIL' && !scene.goggles ? 'goggles' : null, why: task === 'SOIL' ? 'You will heat soil strongly: goggles protect your eyes.' : 'It keeps soil, paint and plant sap off your clothes.', done: scene.coat && (task !== 'SOIL' || scene.goggles) },
    { id: 'collect', label: `Collect your apparatus from the shed${missing.length ? ` (${missing.length} to go)` : ''}`, target: 'cupboard', why: neededFor(task).map((a) => a.label).join(', ') + '.', done: !missing.length },
    { id: 'bench', label: 'Go to your field table', target: 'mybench', why: 'The table at the front of the outdoor classroom.', done: mode !== 'walk' || started },
  ];
  const tail = (wash: string): GuideStep[] => [
    { id: 'written', label: 'Write two precautions and your explanation', target: 'book', why: 'Precautions are what you did to make the results reliable.', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
    { id: 'wash', label: 'Wash your hands at the outside tap', target: 'handwash', why: wash, done: scene.washedAtEnd },
    { id: 'handin', label: 'Hand in your work', target: null, why: 'Open the menu and choose Hand in when everything is recorded.', done: false },
  ];
  if (task === 'QUADRAT') {
    const w = s.quad;
    const unseen = w.quads.findIndex((_, i) => !w.looked.includes(i));
    const rowsDone = w.rows.filter((r) => r.TRIDAX.trim() && r.SIDA.trim() && r.EUPH.trim() && r.grass.trim()).length;
    steps.push(
      { id: 'peg', label: 'Peg out the plot with the tapes on two edges', target: 'plot', why: 'The tapes are the x and y axes for the coordinates.', done: w.pegged, group: 'Sampling' },
      { id: 'place', label: `Place at least ${QUAD_MIN} quadrats at random coordinates (${w.quads.length} so far)`, target: 'randtable', why: 'Two numbers from 00 to 19 from the random-number table: no choosing by eye.', done: w.quads.length >= QUAD_MIN, group: 'Sampling' },
      { id: 'look', label: 'Examine each quadrat: count each herb and the grass squares', target: unseen >= 0 ? `quad:${unseen}` : 'plot', why: 'Plants on the frame: count those on two sides only.', done: w.quads.length > 0 && unseen < 0, group: 'Sampling' },
      { id: 'table', label: `Fill in the table (${rowsDone} of ${w.quads.length} rows)`, target: 'book', why: 'One row per quadrat; add up the columns.', done: w.quads.length > 0 && rowsDone === w.quads.length && QUAD_HERBS.every((h) => w.res[h].total.trim()), group: 'Results' },
      { id: 'calc', label: 'Work out density, frequency and population', target: 'book', why: 'Density = total ÷ area sampled; frequency over all the quadrats.', done: QUAD_HERBS.every((h) => w.res[h].density.trim() && w.res[h].freq.trim() && w.res[h].pop.trim()) && !!w.cover.trim(), group: 'Results' },
      { id: 'chart', label: 'Draw the bar chart and name the most frequent and most dense herbs', target: 'book', why: 'Each bar to its density.', done: QUAD_HERBS.every((h) => w.bars[h] !== null) && !!w.mostFreq && !!w.mostDense, group: 'Results' },
      ...tail('Plant sap and soil: wash before you eat.'),
    );
    return steps;
  }
  if (task === 'CAPTURE') {
    const w = s.cap;
    steps.push(
      { id: 's1', label: 'Sweep the plot for a fixed time', target: 'net', why: 'Note the time: the second sample must use the same effort.', done: !!w.first, group: 'First sample' },
      { id: 'c1', label: 'Tip the catch onto the tray and count it (n₁)', target: 'tray', why: 'Tick each one as you count.', done: w.counted1 && !!w.n1.trim(), group: 'First sample' },
      { id: 'mk', label: 'Mark each one harmlessly', target: 'paint', why: 'Small, non-toxic, where predators will not see it.', done: !!w.mark, group: 'First sample' },
      { id: 'rel', label: 'Release them where they were caught', target: 'watch', why: 'Spread out, so they mix sooner.', done: !!w.release, group: 'First sample' },
      { id: 'wait', label: `Leave them to mix (${w.clock} h so far)`, target: 'watch', why: 'About a day.', done: w.clock >= CAP_MIN_WAIT || !!w.second, group: 'Second sample' },
      { id: 's2', label: 'Sweep again the same way', target: 'net', why: 'Same area, same time.', done: !!w.second, group: 'Second sample' },
      { id: 'ex', label: 'Count the catch (n₂) and the marked ones (m); release them', target: 'tray', why: 'Turn each one over to find the dot.', done: w.examined && w.freed && !!w.n2.trim() && !!w.m.trim(), group: 'Second sample' },
      { id: 'calc', label: 'Work out N, the % marked and the density; assumptions', target: 'book', why: 'N = n₁ × n₂ ÷ m.', done: !!w.N.trim() && !!w.pct.trim() && !!w.density.trim() && w.assume.length > 0 && w.errors.length > 0, group: 'Results' },
      ...tail('After handling insects: wash your hands.'),
    );
    return steps;
  }
  if (task === 'FACTORS') {
    const w = s.fac;
    const today = (site: 'OPEN' | 'SHADE') => w.reads.filter((r) => r.day === w.day && r.site === site).length;
    const daysDone = [...new Set(w.reads.map((r) => r.day))].filter((d) => FAC_SITES.every((site) => w.reads.some((r) => r.day === d && r.site === site))).length;
    steps.push(
      { id: 'st', label: `Day ${w.day}: read the Six’s, the rain gauge and the vane; reset and empty`, target: !w.station.some((x) => x.day === w.day && x.inst === 'SIX') ? 'screen' : !w.station.some((x) => x.day === w.day && x.inst === 'RAIN') ? 'raingauge' : 'vane', why: 'The Six’s shows the extremes since it was reset; the gauge, the rain since it was emptied.', done: w.station.filter((x) => x.day === w.day).length >= 3 && w.resets.includes(w.day) && w.empties.includes(w.day), group: `Day ${w.day}` },
      ...(w.day <= FAC_MIN_DAYS
        ? [
            { id: 'open', label: `Open field: every instrument (${today('OPEN')} read)`, target: 'site:OPEN', why: 'Thermometers in the shade of the card.', done: today('OPEN') >= 5, group: `Day ${w.day}` },
            { id: 'shade', label: `Under the canopy, at about the same time (${today('SHADE')} read)`, target: 'site:SHADE', why: 'Within an hour of the open-field readings.', done: today('SHADE') >= 5, group: `Day ${w.day}` },
          ]
        : []),
      { id: 'pond', label: 'Read the Secchi disc at the pond (once)', target: 'pond', why: 'Keep back from the edge.', done: w.secchiRead, group: 'Pond' },
      { id: 'days', label: `Repeat on three days (${daysDone} done); then the last morning’s station readings`, target: 'screen', why: `Go on to the next day when today is done (day ${w.day} of ${FAC_DAYS}).`, done: daysDone >= FAC_MIN_DAYS && w.day >= FAC_DAYS, group: 'Days' },
      { id: 'tab', label: 'Fill in the tables, the means and the humidity', target: 'book', why: 'RH from the table with dry bulb and depression.', done: FAC_SITES.every((site) => !!w.means[site].air.trim()), group: 'Results' },
      { id: 'calc', label: 'Six’s mean and range, rainfall total and mean; compare the sites', target: 'book', why: 'Relate the readings to the organisms in each site.', done: !!w.rainTotal.trim() && !!w.obs.trim() && w.claims.length > 0, group: 'Results' },
      ...tail('After the pond and the soil: wash your hands.'),
    );
    return steps;
  }
  const w = s.soil;
  const jar = w.jars.findIndex((j) => j.shakenAt !== null);
  steps.push(
    { id: 'jar', label: 'Shake some loam with water in a jar', target: w.jars.length ? `jar:0` : 'bag:LOAM', why: 'Then leave it to settle while you do the rest.', done: jar >= 0, group: 'Sedimentation' },
    { id: 'fun', label: `Three funnels, 100 g of each soil, cotton wool (${w.funnels.length} so far)`, target: w.funnels.length < 3 ? 'funnels' : 'funnels', why: 'Same mass of soil, same volume of water.', done: w.funnels.length >= 3, group: 'Drainage' },
    { id: 'pour', label: 'Pour 100 cm³ of water onto each together', target: 'funnels', why: 'Start the stopwatch as you pour.', done: w.pouredAt !== null, group: 'Drainage' },
    { id: 'dr', label: `Read the cylinders at 1, 2, 5, 10, 20 and 30 min (${w.dclock} min)`, target: 'funnels', why: 'Bottom of the meniscus, at eye level.', done: w.funnels.length > 0 && w.funnels.every((_, f) => SOIL_DRAIN_TIMES.every((t) => w.dReads.some((x) => x.f === f && x.t === t))), group: 'Drainage' },
    { id: 'air', label: 'Air content of each soil: add, stir, read', target: w.airs.length < 3 ? 'cylinders' : 'aircyl:0', why: 'Stir until the bubbles stop.', done: w.airs.length >= 3 && w.airs.every((_, i) => w.airReads.includes(i)), group: 'Air' },
    { id: 'hum', label: 'Humus: weigh, heat, cool, weigh — to constant mass', target: w.crucibles.length < 3 ? 'bag:LOAM' : 'burner', why: 'Oven-dried soil; two cooled weighings within 0.01 g.', done: w.crucibles.length >= 3 && w.crucibles.every((c) => c.heats >= 2), group: 'Humus' },
    { id: 'meas', label: 'After a day, measure the jar’s layers', target: jar >= 0 ? `jar:${jar}` : 'jars', why: 'The clay takes hours to settle.', done: w.jarReads.some((x) => { const j = w.jars[x.jar]; return !!j && j.shakenAt !== null && x.at - j.shakenAt >= SOIL_MIN_SETTLE; }), group: 'Sedimentation' },
    { id: 'tab', label: 'Fill in the tables, plot the graph, label the jar', target: 'book', why: 'Retained = 100 − collected; % air of the soil’s 50 cm³.', done: w.plotted && w.labels.filter(Boolean).length >= SOIL_JAR_LABELS.length && w.retained.every((x) => x.trim()), group: 'Results' },
    { id: 'conc', label: 'Describe the jar and conclude', target: 'book', why: 'Which soil holds water, drains fast, has most humus.', done: !!w.obs.trim() && w.claims.length > 0, group: 'Results' },
    ...tail('After soil: wash your hands before you eat.'),
  );
  return steps;
}

/** A gentle correction for a step just recorded in the log (null: nothing wrong). */
export function ecoCorrection(a: string, s: BioEcologyState, scene: EcoScene): Correction | null {
  const [verb, arg] = a.split(':') as [string, string | undefined];
  if (verb === 'quad-chosen') return { title: 'That quadrat was placed by eye.', why: 'Choosing where to put it picks out the patches where plants grow, so the estimate is biased. Use the next pair of random numbers instead (lift this one if you like).', focus: 'plot' };
  if (verb === 'mark' && arg === 'BRIGHT') return { title: 'A bright mark on the back is easy for birds to see.', why: 'Marked grasshoppers get eaten, fewer are recaptured and N comes out too big. A small dot of non-toxic paint underneath is safer.', focus: 'tray' };
  if (verb === 'mark' && arg === 'CLIP') return { title: 'Clipping a wing harms the grasshopper.', why: 'It cannot escape or fly properly: it may die, and it is caught more easily. Use a small dot of non-toxic paint underneath.', focus: 'tray' };
  if (verb === 'release' && arg === 'CORNER') return { title: 'Tipped out in one heap?', why: 'Released all together in one corner they take much longer to mix with the others. Release them where they were caught.', focus: 'plot' };
  if (verb.startsWith('sweep2') && s.cap.second && s.cap.second.at < CAP_MIN_WAIT) return { title: 'That was too soon.', why: `After only ${s.cap.second.at} h the marked grasshoppers are still near where you let them go, so you recapture too many of them and N comes out too small. Wait about a day.`, focus: 'watch' };
  if (verb.startsWith('sweep2') && s.cap.first && s.cap.second && s.cap.second.effort !== s.cap.first.effort) return { title: 'Not the same effort.', why: 'Sweep for the same time both times, so the two samples are taken the same way.', focus: 'net' };
  if (verb.startsWith('read') && /-sun@/.test(arg ?? a)) return { title: 'The sun is on the bulb.', why: 'Direct sunlight heats the thermometer itself, so it reads too high. Shade it with the card (or your body), wait a minute, then read.', focus: 'site:OPEN' };
  if (verb === 'go' && arg === 'POND') return { title: 'Careful at the pond.', why: 'Keep well back from the edge and work with a partner.', focus: 'pond' };
  if (verb === 'next-day') {
    const d = s.fac.day - 1;
    if (!s.fac.resets.includes(d) && s.fac.station.some((x) => x.day === d && x.inst === 'SIX')) return { title: 'The Six’s thermometer was not reset.', why: 'Tomorrow’s reading would include today’s extremes. Reset the indices with the magnet after each reading.', focus: 'screen' };
    if (!s.fac.empties.includes(d) && s.fac.station.some((x) => x.day === d && x.inst === 'RAIN')) return { title: 'The rain gauge was not emptied.', why: 'Tomorrow’s reading would add today’s rain. Empty it after each reading.', focus: 'raingauge' };
  }
  if (verb === 'funnel' && a.endsWith(':nocotton')) return { title: 'No cotton wool?', why: 'Without a plug, soil washes through into the cylinder. Plug each funnel with cotton wool.', focus: 'funnels' };
  if (verb === 'funnel' && s.soil.funnels.length > 1 && new Set(s.soil.funnels.map((f) => f.mass)).size > 1) return { title: 'Different masses of soil.', why: 'Use the same mass in every funnel, or the volumes cannot be compared.', focus: 'funnels' };
  if (verb === 'crucible' && a.endsWith(':damp')) return { title: 'Use oven-dried soil.', why: 'Damp soil loses its water when heated as well as its humus, so the % humus comes out too high.', focus: 'burner' };
  if (verb.startsWith('read-air#')) {
    const x = s.soil.airs[Number(verb.slice(9)) - 1];
    if (x && !x.stirred) return { title: 'Stir it first.', why: 'Air stays trapped in the lumps until you stir: stir with the glass rod until no more bubbles rise, then read.', focus: 'cylinders' };
  }
  if (verb.startsWith('weigh#')) {
    const c = s.soil.crucibles[Number(verb.slice(6)) - 1];
    if (c?.hot) return { title: 'Cool it before weighing.', why: 'A hot crucible sets up rising air currents and weighs too little. Cool it in the desiccator, then weigh.', focus: 'desiccator' };
  }
  if (verb === 'heat:all' && !scene.goggles) return { title: 'Goggles on.', why: 'Strongly heated soil can spit. Put your goggles on before heating.', focus: 'burner' };
  if (verb.startsWith('measure-jar#')) {
    const j = s.soil.jars[Number(verb.slice(12)) - 1];
    if (j && j.shakenAt !== null && s.soil.hours - j.shakenAt < SOIL_MIN_SETTLE) return { title: 'The clay is still settling.', why: 'The water is still cloudy: leave it overnight before you measure the layers.', focus: 'jars' };
  }
  if (verb === 'collect' && arg && !neededFor(s.task ?? 'QUADRAT').some((x) => x.id === arg)) return { title: 'That is not needed here.', why: 'Only take what the investigation needs; you can put it back from your table.' };
  return null;
}
