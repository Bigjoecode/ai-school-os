import type { PhyDensityState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyDensityMissing(s: PhyDensityState, _seed: number): string[] {
  const out: string[] = [];
  const c = (id: string) => (s.cells[id] ?? '').trim();
  const a = (id: keyof PhyDensityState['answers']) => s.answers[id].value.trim();
  const blank = (ids: string[], what: string) => ids.some((id) => !c(id)) && out.push(`${what} not filled in.`);
  switch (s.task) {
    case null:
      out.push('No experiment chosen.');
      break;
    case 'CAL':
      blank(['zv', 'zm'], 'The zero errors are');
      blank(['c1', 'c2', 'c3', 'cm'], 'The cylinder’s readings are');
      blank(['b1', 'b2', 'b3', 'bm'], 'The ball bearing’s readings are');
      if (!a('dcyl') || !a('dball')) out.push('The corrected diameters are not worked out.');
      if (!a('vol')) out.push('The volume of the ball bearing is not worked out.');
      break;
    case 'ARCH':
      blank(['w1', 'w2', 'w3'], 'W₁, W₂ and W₃ are');
      blank(['mb', 'mbw'], 'The beaker’s masses are');
      if (!a('up') || !a('wdisp')) out.push('The upthrust and the weight of water displaced are not worked out.');
      if (!a('rds') || !a('rdl')) out.push('The relative densities are not worked out.');
      break;
    case 'FLOAT': {
      const loads = new Set(s.depths.map((d) => d.load)).size;
      if (loads < 5) out.push(`Only ${loads} load${loads === 1 ? '' : 's'} read (at least five are needed).`);
      blank(['D', 'mt'], 'The diameter and the tube’s mass are');
      if (s.float.some((r) => !r.m.trim() || !r.h.trim())) out.push('Some rows of the table are not filled in.');
      if (!s.line) out.push('No straight line drawn on the graph.');
      if (!a('area') || !a('slope') || !a('rho') || !a('mtube')) out.push('A, the slope, ρ or the tube’s mass is not worked out.');
      break;
    }
    case 'BOTTLE':
      blank(s.sample === 'grains' ? ['m1', 'm2', 'm3', 'm4'] : ['m1', 'm2', 'm3'], 'The masses are');
      blank(['T'], 'The room temperature is');
      if (!a('mw') || !a('ml')) out.push('The masses of water and of the sample are not worked out.');
      if (!a('rd') || !a('rho')) out.push('The relative density or the density is not worked out.');
      break;
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
