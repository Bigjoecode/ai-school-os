import { THERM_TIMES, type PhyThermalState } from '@aischool/shared';

/** What is still missing before hand-in (the lab can be handed in anyway). */
export function phyThermalMissing(s: PhyThermalState, _seed: number): string[] {
  const out: string[] = [];
  if (!s.task) return ['No experiment chosen.'];
  const blank = (ids: string[]) => ids.filter((id) => !(s.cells[id] ?? '').trim()).length;
  const a = s.answers;
  if (s.task === 'EXPANSION') {
    const n = blank(['l0', 'th1', 'r1', 'th2', 'r2', 'e', 'dth']);
    if (n) out.push(`${n} entr${n === 1 ? 'y' : 'ies'} of the table not filled in.`);
    if (!(s.cells.r2b ?? '').trim()) out.push('The final micrometer reading is not repeated.');
    if (!a.alpha.value.trim()) out.push('α is not worked out.');
  } else if (s.task === 'CHARLES') {
    if (s.rows.length < 5) out.push(`Only ${s.rows.length} row${s.rows.length === 1 ? '' : 's'} of readings (at least 5 are needed).`);
    if (s.rows.some((r) => ['th', 'l', 'T', 'lT'].some((c) => !(r.c[c] ?? '').trim()))) out.push('Some rows of the table are not filled in.');
    if (!s.line) out.push('No line drawn on the graph.');
    if (!a.slope.value.trim()) out.push('The slope is not worked out.');
    if (!a.zero.value.trim()) out.push('Absolute zero is not read from the graph.');
    if (!a.ratio.value.trim()) out.push('l/T is not worked out.');
  } else {
    const n = blank(['mc', 'mcw', 'm', 'V', 'I', 't', 'th0', 'thmax', 'dth']);
    if (n) out.push(`${n} entr${n === 1 ? 'y' : 'ies'} of the table not filled in.`);
    const rows = THERM_TIMES.filter((t) => !(s.rows.find((r) => r.key === t)?.c.th ?? '').trim()).length;
    if (rows) out.push(`${rows} temperature${rows === 1 ? '' : 's'} missing from the 60 s readings.`);
    if (!s.line) out.push('No line drawn on the graph of θ against t.');
    if (!a.energy.value.trim() || !a.power.value.trim()) out.push('E and P are not worked out.');
    if (!a.c.value.trim()) out.push('c is not worked out.');
  }
  if (!s.written.precautions.trim()) out.push('No precautions written.');
  return out;
}
