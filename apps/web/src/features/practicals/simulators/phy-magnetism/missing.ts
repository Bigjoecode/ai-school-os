import type { PhyMagnetismState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyMagnetismMissing(s: PhyMagnetismState, _seed: number): string[] {
  const out: string[] = [];
  const rowsFilled = (cols: string[]) => s.rows.every((r) => cols.every((c) => r.c[c]?.trim()));
  const blank = (id: keyof PhyMagnetismState['answers']) => !s.answers[id].value.trim();
  switch (s.task) {
    case null:
      out.push('No experiment chosen.');
      break;
    case 'FIELD': {
      const n = s.sheets.filter((x) => x.arr === 'one' && x.facing === 'north');
      const so = s.sheets.filter((x) => x.arr === 'one' && x.facing === 'south');
      if (!n.some((x) => x.lines.length >= 4)) out.push('Fewer than four field lines plotted with the N pole pointing north.');
      if (!n.some((x) => x.arrows)) out.push('No arrows on the field lines.');
      if (!n.some((x) => x.neutrals.length >= 2)) out.push('The neutral points (N pole pointing north) are not marked.');
      if (!so.some((x) => x.neutrals.length >= 2)) out.push('The neutral points with the magnet reversed are not marked.');
      if (!['xe', 'yw', 'an', 'as'].every((c) => s.cells[c]?.trim())) out.push('Some neutral-point distances are not written down.');
      if (blank('me') || blank('ma')) out.push('The mean distances are not worked out.');
      if (blank('ratio')) out.push('The ratio of the distances is not worked out.');
      break;
    }
    case 'ELECTROMAGNET': {
      const n30 = new Set(s.lifts.filter((l) => l.turns === 30 && l.core === 'iron').map((l) => l.rheo)).size;
      if (n30 < 4) out.push(`Only ${n30} current${n30 === 1 ? '' : 's'} tried with 30 turns (at least four are needed).`);
      if (!s.lifts.some((l) => l.turns === 60)) out.push('No lifts with 60 turns.');
      if (!s.lifts.some((l) => l.core === 'none')) out.push('The coil has not been tried without its core.');
      if (!rowsFilled(['N', 'I', 'c1', 'c2', 'c'])) out.push('Some rows of the table are not filled in.');
      if (!s.line) out.push('No straight line drawn on the graph of clips against current.');
      if (blank('slope')) out.push('The initial slope is not worked out.');
      if (blank('rturns')) out.push('The 60-turn ÷ 30-turn ratio is not worked out.');
      break;
    }
    case 'INDUCTION': {
      if (s.moves.length < 6) out.push('Fewer than six movements of the magnet recorded.');
      if (!s.moves.some((m) => m.coil === 600)) out.push('The coil of more turns has not been used.');
      if (!rowsFilled(['dir', 'size'])) out.push('Some rows of the table are not filled in.');
      if (blank('emf') || blank('emf2')) out.push('The Faraday’s-law calculation is not done.');
      if (blank('rspeed') || blank('rturns')) out.push('The ratios of the swings are not worked out.');
      if (blank('lenz')) out.push('The Lenz’s-law question is not answered.');
      break;
    }
    case 'DIODE': {
      const f = s.reads.filter((r) => r.bias === 'fwd').length;
      if (f < 8) out.push(`Only ${f} forward reading${f === 1 ? '' : 's'} (at least eight are needed).`);
      if (s.reads.filter((r) => r.bias === 'rev').length < 3) out.push('Fewer than three reverse-bias readings.');
      if (!rowsFilled(['V', 'I'])) out.push('Some rows of the table are not filled in.');
      if (!s.line) out.push('No tangent drawn on the I–V graph.');
      if (blank('knee')) out.push('The knee voltage is not found.');
      if (blank('rdyn') || blank('rstat')) out.push('The resistances are not worked out.');
      break;
    }
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
