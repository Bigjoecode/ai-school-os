import { GEN_PRACTICAL, type CriterionScore, type GenPracticalState } from '@aischool/shared';
import { buildGen, numericRight, orderFraction, pickFraction, unitOk } from './gen-paper';
import { score } from './helpers';
import type { AiItem, GradeContext, GraderOutput, SimulatorGrader } from './types';

const crit = (id: string) => GEN_PRACTICAL.rubric.find((c) => c.id === id)!;
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (marks: number, frac: number) => Math.floor(marks * frac * 2 + 1e-9) / 2;
const list = (xs: string[]) => xs.map((x) => `"${x}"`).join('; ');

/**
 * Marks a Guided practical against the key built on the server from the stored
 * lesson (never anything the browser sent but the student's own choices). The
 * state holds only opaque ids; an id that isn't on this attempt's paper earns
 * nothing. Parts a lesson has no data for are shared out so that the rubric
 * still totals 20: a missing part's marks go with the student (see `absent`).
 */
export const genPracticalGrader: SimulatorGrader<'gen-practical'> = {
  id: 'gen-practical',
  grade(state: GenPracticalState, seed: number, ctx?: GradeContext): GraderOutput {
    const lesson = ctx?.lesson;
    if (!lesson) {
      // The lesson has gone (removed from the syllabus): the work can't be marked against anything.
      return {
        auto: GEN_PRACTICAL.rubric.filter((c) => c.how === 'AUTO').map((c) => score(c, 0, ['This practical is no longer available to mark against. Your teacher can review it.'])),
        ai: [
          { criterionId: 'precautions', question: 'Precautions', answer: state.written.precautions, keywords: [], need: 1 },
          { criterionId: 'explanation', question: 'Explanation', answer: state.written.explanation, keywords: [], need: 1 },
        ],
        solution: [],
        facts: [],
      };
    }
    const { key, paper } = buildGen(lesson, seed);
    const auto: CriterionScore[] = [];
    const solution: string[] = [];
    const facts: string[] = [`Practical: ${lesson.title}.`];

    // ---- safety (3)
    {
      const right = key.safety.filter((x) => x.correct);
      const r = pickFraction(right.map((x) => x.id), state.safety);
      const notes: string[] = [];
      if (!state.safety.length) notes.push('No safety choices were made.');
      for (const id of r.wrong) {
        const x = key.safety.find((k) => k.id === id);
        if (x) notes.push(`Wrong choice: "${x.text}" ${x.why}`);
      }
      if (r.missed) notes.push(`You missed ${r.missed} correct precaution${r.missed === 1 ? '' : 's'}.`);
      auto.push(score(crit('safety'), round(3, r.fraction), notes));
      solution.push(`Safety: ${list(right.map((x) => x.text))}.`);
      facts.push(`Safety: ${r.hits} of ${right.length} right, ${r.wrong.length} wrong.`);
    }

    // ---- set out (3)
    {
      const right = key.tools.filter((x) => x.correct);
      const r = pickFraction(right.map((x) => x.id), state.tools, key.optional);
      const notes: string[] = [];
      if (!state.tools.length) notes.push('Nothing was set out.');
      for (const id of r.wrong) {
        const x = key.tools.find((k) => k.id === id);
        if (x) notes.push(`Not needed: ${x.text}. ${x.why}`);
      }
      const missed = right.filter((x) => !state.tools.includes(x.id) && !key.optional.includes(x.id));
      if (missed.length) notes.push(`Left out: ${missed.map((x) => x.text).join(', ')}.`);
      auto.push(score(crit('setout'), round(3, r.fraction), notes));
      solution.push(`Tools and materials: ${right.map((x) => x.text).join(', ')}.`);
      facts.push(`Set out: ${r.hits} of ${right.length - key.optional.length} needed, ${r.wrong.length} not needed.`);
    }

    // ---- procedure order (3)
    {
      const r = orderFraction(state.order, key);
      const notes: string[] = [];
      if (!r.perfect) notes.push(r.placed < key.order.length ? `Only ${r.placed} of ${key.order.length} steps were placed.` : 'Some steps are out of order: each step should only depend on what has already been done.');
      auto.push(score(crit('order'), round(3, r.fraction), notes));
      solution.push(`Procedure: ${key.order.map((id, i) => `(${i + 1}) ${key.stepText[id]}`).join(' ')}`);
      facts.push(`Order: ${r.perfect ? 'all in order' : `${Math.round(r.fraction * 100)}% of the sequence right`}.`);
    }

    // ---- decisions (3): with no decisions on the paper the order mark stands in
    {
      const right = key.decisions.filter((d) => state.decisions[d.id] === d.right);
      const notes = key.decisions
        .filter((d) => state.decisions[d.id] !== d.right)
        .map((d) => (state.decisions[d.id] ? (d.consequence[state.decisions[d.id]!] ?? 'That choice is not on this paper.') : `No decision taken: ${d.prompt}`));
      const frac = key.decisions.length ? right.length / key.decisions.length : (auto.find((a) => a.id === 'order')!.awarded / 3);
      auto.push(score(crit('decisions'), round(3, frac), notes));
      for (const d of key.decisions) solution.push(`${d.prompt} ${d.options.find((o) => o.id === d.right)?.text ?? ''}`);
      facts.push(`Decisions: ${right.length} of ${key.decisions.length} sound.`);
    }

    // ---- observations and results (3)
    {
      const notes: string[] = [];
      const parts: number[] = [];
      for (const o of key.observations) {
        const c = state.observations[o.id];
        parts.push(c === o.right ? 1 : 0);
        if (c !== o.right) notes.push(c ? (o.why[c] ?? 'That option is not on this paper.') : `Not answered: ${o.prompt}`);
        solution.push(`${o.prompt} ${o.rightText}`);
      }
      for (const n of key.numerics) {
        const a = state.numerics[n.id];
        const v = !!a && numericRight(n, a.value);
        const u = !!a && unitOk(a.unit, n.units);
        const part = n.wantsUnit ? (v ? 0.75 : 0) + (v && u ? 0.25 : 0) : v ? 1 : 0;
        parts.push(part);
        if (!a?.value.trim()) notes.push(`Not answered: ${n.prompt}`);
        else if (!v) notes.push(`"${n.prompt}" should be about ${n.shown}${n.unit ? ` ${n.unit}` : ''}.`);
        else if (!u) notes.push(`Give the unit with your answer (${n.unit}).`);
        solution.push(n.working);
      }
      const frac = parts.length ? mean(parts) : auto.find((a) => a.id === 'order')!.awarded / 3;
      auto.push(score(crit('observe'), round(3, frac), notes));
      facts.push(`Observations and results: ${parts.filter((p) => p === 1).length} of ${parts.length} fully right.`);
    }

    // ---- spot the fault (2)
    {
      const notes: string[] = [];
      const parts: number[] = [];
      for (const f of key.faults) {
        const r = pickFraction(f.faults, state.faults[f.id] ?? []);
        parts.push(r.fraction);
        for (const id of r.wrong) if (f.why[id]) notes.push(`"${f.lines.find((l) => l.id === id)?.text}" ${f.why[id]}`);
        if (r.missed) notes.push(`${r.missed} fault${r.missed === 1 ? '' : 's'} not found.`);
        solution.push(`Faults: ${f.faults.map((id) => `"${f.lines.find((l) => l.id === id)?.text}" ${f.why[id] ?? ''}`.trim()).join(' ')}`);
      }
      const frac = parts.length ? mean(parts) : auto.find((a) => a.id === 'safety')!.awarded / 3;
      auto.push(score(crit('faults'), round(2, frac), notes));
      facts.push(`Faults: ${Math.round(mean(parts) * 100)}% found.`);
    }

    const ai: AiItem[] = [
      { criterionId: 'precautions', question: `${paper.written.precautions} (Practical: ${lesson.title})`, answer: state.written.precautions, guide: key.written.precautions.guide, keywords: key.written.precautions.keywords, need: key.written.precautions.need },
      { criterionId: 'explanation', question: `${paper.written.explanation} (Practical: ${lesson.title})`, answer: state.written.explanation, guide: key.written.explanation.guide, keywords: key.written.explanation.keywords, need: key.written.explanation.need },
    ];
    solution.push(`Expected result: ${lesson.expectedObservations}`);
    solution.push(`Precautions: ${key.written.precautions.guide.replace(/^Any two of: /, '')}`);
    return { auto, ai, solution, facts };
  },
};
