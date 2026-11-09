import { COMP_MCQ, compFamily, compFields, compTraces, crimpRun, htmlFacts, maintRun, parseBasic, type CompCodeState, type CompCodeVariant } from '@aischool/shared';

/**
 * The practical as a list of milestones, worked out from the state (never from
 * hidden answers): the 2D hint, the 3D checklist and the "what is missing"
 * list all come from here.
 */

export interface CompStep {
  id: string;
  label: string;
  why: string;
  /** The 3D object it is done with. */
  target: string;
  done: boolean;
  group?: string;
}

const ran = (s: CompCodeState, id: string) => s.log.some((e) => e.a === `run:${id}:done`);

export function compWorkSteps(v: CompCodeVariant, s: CompCodeState): CompStep[] {
  const fam = compFamily(v.task);
  if (fam === 'BASIC')
    return v.programs.flatMap((p): CompStep[] => {
      const src = s.programs[p.id] ?? '';
      const parsed = src.trim() ? parseBasic(src) : null;
      const g = `Program ${p.id}: ${p.title}`;
      return [
        { id: `write-${p.id}`, group: g, label: `Type program ${p.id}`, why: p.brief[0] ?? '', target: 'monitor', done: !!parsed?.ok && parsed.program.facts.codeLines >= 3 },
        { id: `run-${p.id}`, group: g, label: p.sample.length ? `Run it with ${p.sample.join(', ')}` : 'Run it', why: 'The output is what you copy into your notebook.', target: 'monitor', done: ran(s, p.id) },
        { id: `save-${p.id}`, group: g, label: `Save it (for example ${p.file})`, why: 'BASIC programs are saved with the .BAS extension.', target: 'monitor', done: !!s.names[p.id] },
      ];
    });
  if (fam === 'FLOW')
    return v.programs.flatMap((p): CompStep[] => {
      const c = s.charts[p.id];
      const g = `Chart ${p.id}: ${p.title}`;
      return [
        { id: `draw-${p.id}`, group: g, label: `Draw chart ${p.id}`, why: p.brief[0] ?? '', target: 'monitor', done: (c?.nodes.length ?? 0) >= 4 && (c?.edges.length ?? 0) >= 3 },
        { id: `trace-${p.id}`, group: g, label: 'Trace it to STOP', why: 'A dry run with test data shows whether the chart works.', target: 'monitor', done: ran(s, p.id) },
      ];
    });
  if (fam === 'HTML') {
    const f = htmlFacts(s.programs.page ?? '');
    return [
      { id: 'page', label: 'Type the page in the editor', why: 'html, head with title, then body.', target: 'monitor', done: f.html && f.head && f.body && !!f.title },
      { id: 'parts', label: 'Add the heading, paragraph, list and hyperlink', why: 'Check each one in the preview as you add it.', target: 'monitor', done: f.headings.length > 0 && f.paragraphs.length > 0 && f.listItems.length > 0 && f.links.length > 0 },
      { id: 'save', label: 'Save it as an .html file', why: 'Notepad adds .txt unless you type .html yourself.', target: 'monitor', done: !!s.names.page },
    ];
  }
  if (v.task === 'CRIMP') {
    const r = crimpRun(s.events);
    const end = (k: 'A' | 'B'): CompStep => ({ id: `end-${k}`, group: 'The cable', label: `Finish end ${k}: strip, untwist, T568B order, trim, insert, crimp`, why: 'Strip about 2.5 cm, trim the wires to about 1.3 cm, clip facing down.', target: 'crimper', done: r.ends[k].crimped });
    return [
      { id: 'cut', group: 'The cable', label: `Cut ${v.crimp.run} m of cable`, why: `${v.crimp.dist} m to the switch plus ${v.crimp.slack} m slack.`, target: 'crimper', done: r.cut !== null },
      { id: 'boots', group: 'The cable', label: 'Slide on the boots', why: 'They cannot go on after the plug.', target: 'crimper', done: r.boots },
      end('A'),
      end('B'),
      { id: 'test', group: 'The cable', label: 'Test it on the cable tester', why: 'The lights must come on 1 to 8 in the same order on both units.', target: 'tester', done: r.tested > 0 },
    ];
  }
  const r = maintRun(s.events);
  const d = r.done;
  const hasAny = (...k: string[]) => k.some((x) => d.has(x));
  return [
    { id: 'off', group: 'Power off', label: 'Shut down, then switch off at the wall', why: 'Never clean a live computer.', target: 'sysunit', done: d.has('SHUTDOWN') && d.has('UNPLUG') },
    { id: 'screen', group: 'Clean the hardware', label: 'Wipe the screen', why: 'A slightly damp microfibre cloth.', target: 'monitor', done: hasAny('WIPE:DAMP', 'WIPE:WET') },
    { id: 'keys', group: 'Clean the hardware', label: 'Clean the keyboard: tap, brush, wipe', why: 'Isopropyl alcohol on a cloth.', target: 'keyboard', done: d.has('KEYTAP') && d.has('KEYBRUSH') && hasAny('KEYCLEAN:ALCOHOL', 'KEYCLEAN:WATER') },
    { id: 'blow', group: 'Clean the hardware', label: 'Blow the dust from the vents', why: 'Hold the fans still.', target: 'sysunit', done: hasAny('BLOW:HOLD', 'BLOW:FREE') },
    { id: 'lens', group: 'Clean the hardware', label: 'Clean the DVD lens', why: 'A lens-cleaning disc.', target: 'dvd', done: d.has('LENS') },
    { id: 'on', group: 'Back on', label: 'Switch on and press the UPS self-test', why: 'Note the battery reading.', target: 'ups', done: d.has('REPLUG') && d.has('UPSTEST') },
    { id: 'boot', group: 'Back on', label: 'Press the power button', why: 'Software jobs need a running computer.', target: 'sysunit', done: d.has('BOOT') },
    { id: 'soft', group: 'Software', label: 'Disk Cleanup, updates and a backup', why: 'Use the screen for these.', target: 'monitor', done: d.has('CLEANUP') && d.has('UPDATES') && d.has('BACKUP') },
  ];
}

export function compRecordSteps(v: CompCodeVariant, s: CompCodeState): CompStep[] {
  const empty = compFields(v).filter((f) => !(s.readings[f.id] ?? '').trim()).length;
  const traces = compTraces(v).filter((t) => !(s.trace[t.id] ?? []).some((r) => r.some((c) => c.trim()))).length;
  const mcq = COMP_MCQ[v.task].filter((q) => !(s.choices[q.id] ?? []).length).length;
  const g = 'Your notebook';
  return [
    { id: 'fields', group: g, label: `Record your results and answers${empty ? ` (${empty} left)` : ''}`, why: 'Copy what the computer printed, exactly.', target: 'book', done: !empty },
    ...(compTraces(v).length ? [{ id: 'trace', group: g, label: 'Fill in the table', why: 'One row for each pass of the loop.', target: 'book', done: !traces }] : []),
    { id: 'mcq', group: g, label: 'Answer the questions', why: 'They are in your notebook.', target: 'book', done: !mcq },
    { id: 'written', group: g, label: 'Write your precautions and explanation', why: 'Two precise precautions.', target: 'book', done: !!s.written.precautions.trim() && !!s.written.explain.trim() },
  ];
}

export function compNextHint(v: CompCodeVariant, s: CompCodeState): string {
  const n = [...compWorkSteps(v, s), ...compRecordSteps(v, s)].find((x) => !x.done);
  return n ? `${n.label}. ${n.why}` : 'Everything is recorded. Check your work, then hand in.';
}
