import type { PhyPinsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyPinsMissing(s: PhyPinsState, _seed: number): string[] {
  const out: string[] = [];
  const task = s.task ?? 'MIRROR';
  if (task === 'MIRROR' || task === 'PRISM') {
    const done = s.traces.filter((t) => t.joined).length;
    const need = task === 'PRISM' ? 6 : 5;
    if (done < need) out.push(`Only ${done} ray${done === 1 ? '' : 's'} traced (at least ${need} angles are needed).`);
    if (s.traces.some((t) => !t.joined)) out.push(`A trace is not finished: remove the ${task === 'MIRROR' ? 'mirror' : 'prism'} and join the points.`);
    if (s.table.some((r, i) => s.traces[i]?.joined && (!r.i.trim() || !r.a.trim()))) out.push('Some rows of the table are not filled in.');
    if (task === 'MIRROR') {
      if (!s.line) out.push('No straight line drawn on the graph.');
      if (!s.answers.slope.value.trim()) out.push('The slope is not given.');
      if (!s.written.conclusion.trim()) out.push('No conclusion written.');
    } else {
      if (!s.curve) out.push('No smooth curve drawn through the points.');
      if (!s.line) out.push('The minimum is not marked on the curve.');
      if (!s.answers.dmin.value.trim()) out.push('Dₘ is not given.');
      if (!s.answers.n.value.trim()) out.push('n is not worked out.');
    }
  } else if (task === 'DEPTH') {
    const depths = new Set(s.depth.readings.map((r) => r.blocks)).size;
    if (depths < 4) out.push(`Only ${depths} depth${depths === 1 ? '' : 's'} used (at least four are needed).`);
    if (s.depth.rows.some((r) => !r.real.trim() || !r.app.trim())) out.push('Some rows of the table are not filled in.');
    if (!s.line) out.push('No straight line drawn on the graph.');
    if (!s.answers.slope.value.trim()) out.push('The slope is not given.');
    if (!s.answers.n.value.trim()) out.push('n is not stated.');
  } else {
    if (!s.disp.looks.length) out.push('You have not looked at the spectrum on the screen.');
    if (s.disp.order.length < 7) out.push('The order of the colours is not complete.');
    if (!s.disp.most || !s.disp.least) out.push('Which colour is deviated most and least is not recorded.');
    if (!s.disp.filterObs) out.push('The filter observation is not recorded.');
    if (!s.disp.ray) out.push('The ray diagram is not chosen.');
    if (!s.answers.dred.value.trim() || !s.answers.dviol.value.trim()) out.push('D for red and violet are not recorded.');
    if (!s.answers.disp.value.trim()) out.push('The angular dispersion is not worked out.');
    if (!s.written.conclusion.trim()) out.push('Dispersion is not explained.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
