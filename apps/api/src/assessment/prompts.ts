import type { QuestionCounts } from '@aischool/shared';

/**
 * Prompts for assessment AI. The output shape is enforced by structured
 * output; these describe what good looks like.
 */

export interface AssessmentContext {
  schoolName: string;
  country: string;
  subject: string;
  level: string;
  stage: string | null;
}

const EXAMS: Record<string, string> = {
  NG: 'WAEC, NECO and BECE',
  GH: 'WAEC and BECE',
};

export function questionsPrompt(
  ctx: AssessmentContext,
  req: { topic: string; counts: QuestionCounts; difficulty: string; guidance?: string },
) {
  const exams = EXAMS[ctx.country] ?? 'national examinations';
  const system = [
    `You are a senior examiner and ${ctx.subject} teacher writing assessment items for ${ctx.schoolName}.`,
    `Class: ${ctx.level}${ctx.stage ? ` (${ctx.stage})` : ''}. Match the language, difficulty and style of ${exams} items for this level.`,
    'Every item must be answerable from the topic alone, factually correct, unambiguous, and free of bias. ' +
      'Use local names, places and everyday situations where a context helps. Use ₦ for money in Nigeria.',
    'Write mathematics in plain text (x^2, sqrt(3), 3/4) so it prints cleanly.',
  ].join('\n');

  const lines: string[] = [];
  const c = req.counts;
  if (c.multipleChoice) {
    lines.push(
      `${c.multipleChoice} MULTIPLE_CHOICE: exactly four options, exactly one correct; distractors should reflect ` +
        'common misconceptions, be similar in length to the answer, and never be "all of the above". Put the correct ' +
        'option in varied positions. correctIndex is its 0-based index. marks: 1. answer: why it is correct in one sentence.',
    );
  }
  if (c.trueFalse) {
    lines.push(
      `${c.trueFalse} TRUE_FALSE: a clear statement; options exactly ["True", "False"]; correctIndex 0 for true, 1 for false. ` +
        'Mix true and false. marks: 1. answer: a one-sentence justification.',
    );
  }
  if (c.shortAnswer) {
    lines.push(
      `${c.shortAnswer} SHORT_ANSWER: answerable in a word, number or a sentence or two. options empty, correctIndex null. ` +
        'answer: the expected answer (and acceptable alternatives). markingGuide: how the marks are awarded. marks: 1–4.',
    );
  }
  if (c.theory) {
    lines.push(
      `${c.theory} THEORY: structured essay or working questions, may have parts (a), (b), (c). options empty, correctIndex null. ` +
        'answer: the key points or full working expected. markingGuide: a mark breakdown per point or step that adds up to marks. marks: 5–15.',
    );
  }

  const difficulty =
    req.difficulty === 'MIXED'
      ? 'Spread difficulty: about 30% EASY (recall), 50% MEDIUM (understanding and application), 20% HARD (analysis, multi-step).'
      : `All items should be ${req.difficulty} difficulty.`;

  const user = [
    `Topic: ${req.topic}.`,
    `Write exactly these items:\n- ${lines.join('\n- ')}`,
    difficulty,
    'Label each item with its type and difficulty. Do not repeat or near-repeat an item.',
    req.guidance ? `The teacher's notes:\n${req.guidance}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { system, user };
}

export function remarksPrompt(
  ctx: { schoolName: string; className: string; termName: string },
  students: { ref: string; firstName: string; gender: string; summary: string }[],
) {
  const system = [
    `You are an experienced class teacher at ${ctx.schoolName} writing end-of-term report card remarks for ${ctx.className}, ${ctx.termName}.`,
    'Each remark is one or two sentences (at most 40 words), addressed to parents in the third person, using the ' +
      "learner's first name. Be warm, specific and honest: name a real strength and one concrete area to work on, " +
      'based only on the results given. Never invent facts about behaviour, attendance or effort. Do not quote grades or ' +
      'positions. Vary the wording between learners. British English.',
  ].join('\n');
  const user =
    'Write one remark for each learner below. Return the same studentRef for each.\n\n' +
    students.map((s) => `${s.ref} | ${s.firstName} (${s.gender === 'MALE' ? 'he' : 'she'}) | ${s.summary}`).join('\n');
  return { system, user };
}

export function analysisPrompt(schoolName: string, data: string) {
  const system =
    `You are an assessment lead advising the principal of ${schoolName}. Write a concise performance briefing from the ` +
    'class results provided: at most 180 words. Lead with the headline, then 3–5 bullet points on what stands out ' +
    '(strongest and weakest subjects, spread, learners needing support, gaps in marks still to be entered), then two ' +
    'practical next steps. Use only the numbers given; if results are incomplete, say so and keep conclusions tentative.';
  return { system, user: data };
}
