import type { PhyMechanicsState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyMechanicsMissing(s: PhyMechanicsState, _seed: number): string[] {
  const out: string[] = [];
  const rowsFilled = (cols: string[]) => s.rows.every((r) => cols.every((c) => r.c[c]?.trim()));
  const blank = (id: keyof PhyMechanicsState['answers']) => !s.answers[id].value.trim();
  switch (s.task) {
    case null:
      out.push('No experiment chosen.');
      break;
    case 'FRICTION': {
      const loads = new Set(s.pulls.map((p) => p.load)).size;
      if (loads < 4) out.push(`Only ${loads} load${loads === 1 ? '' : 's'} pulled (at least four are needed).`);
      if (s.tilts.length < 2) out.push('The angle of slipping is not found twice.');
      if (!rowsFilled(['R', 'F1', 'F2', 'F'])) out.push('Some rows of the table are not filled in.');
      if (!s.cells.th?.trim()) out.push('The mean angle θ is not written down.');
      if (!s.line) out.push('No straight line drawn on the graph of F against R.');
      if (blank('slope')) out.push('μ from the slope is not worked out.');
      if (blank('mutan')) out.push('μ = tan θ is not worked out.');
      break;
    }
    case 'VISCOSITY': {
      const balls = new Set(s.drops.filter((d) => d.liquid === 'glycerine').map((d) => d.ball)).size;
      if (balls < 4) out.push(`Only ${balls} ball size${balls === 1 ? '' : 's'} timed (at least four are needed).`);
      if (!s.cells.L?.trim()) out.push('The distance between the bands is not written down.');
      if (!rowsFilled(['d', 'r', 'r2', 't1', 't2', 't', 'v'])) out.push('Some rows of the table are not filled in.');
      if (!s.drops.some((d) => d.liquid === 'oil')) out.push('No ball timed in the palm oil.');
      if (!s.line) out.push('No straight line drawn on the graph of v against r².');
      if (blank('slope')) out.push('The slope is not worked out.');
      if (blank('eta')) out.push('The viscosity η is not worked out.');
      if (blank('ratio')) out.push('The two liquids are not compared (the ratio of viscosities).');
      break;
    }
    case 'INCLINE': {
      const stops = new Set(s.runs.map((r) => r.stop)).size;
      if (stops < 4) out.push(`Only ${stops} distance${stops === 1 ? '' : 's'} timed (at least four are needed).`);
      if (!rowsFilled(['s', 't1', 't2', 't3', 't', 'tt'])) out.push('Some rows of the table are not filled in.');
      if (!s.line) out.push('No straight line drawn on the graph of s against t².');
      if (blank('slope')) out.push('The slope is not worked out.');
      if (blank('accel')) out.push('The acceleration a is not worked out.');
      break;
    }
    case 'FORCES': {
      if (!s.sets.length) out.push('No threads marked on the paper.');
      else if (!s.sets.some((x) => x.built)) out.push('The parallelogram is not drawn.');
      if (blank('scale')) out.push('Your scale is not stated.');
      if (!rowsFilled(['P', 'Q', 'W', 'OA', 'OB', 'OC', 'R', 'ang', 'diff'])) out.push('Some rows of the table are not filled in.');
      break;
    }
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
