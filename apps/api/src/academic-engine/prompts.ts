/**
 * Prompts for the academic generators. Each returns a system prompt (who the
 * model is and the house rules) and a user message (this specific job). The
 * output shape is enforced separately by the structured-output schema, so the
 * prompts describe quality, not JSON.
 */

export interface SchoolContext {
  schoolName: string;
  country: string;
  subject: string;
  level: string;
  stage: string | null;
}

const COUNTRY_CURRICULA: Record<string, string> = {
  NG: 'the Nigerian national curriculum (NERDC), with WAEC/NECO/BECE expectations where relevant',
  GH: 'the Ghanaian national curriculum (NaCCA), with WAEC/BECE expectations where relevant',
};

function framework(country: string) {
  return COUNTRY_CURRICULA[country] ?? `the national curriculum of ${country}`;
}

function base(ctx: SchoolContext, role: string) {
  return [
    `You are ${role} working for ${ctx.schoolName}.`,
    `Subject: ${ctx.subject}. Class: ${ctx.level}${ctx.stage ? ` (${ctx.stage})` : ''}.`,
    `Align content to ${framework(ctx.country)} unless the school's guidance says otherwise.`,
    'Write in clear British English suitable for teachers. Be concrete and practical: name real examples, ' +
      'materials that a typical school has, and tasks a teacher can run tomorrow.',
    'Use local context (names, places, currency, everyday situations) where it helps learners connect.',
    'Every list item is one short, self-contained sentence or phrase. Do not number list items.',
  ].join('\n');
}

export function curriculumTermPrompt(
  ctx: SchoolContext,
  term: { order: number; weeks: number; earlierTopics: string[] },
  guidance?: string | null,
) {
  const system = base(ctx, 'an expert curriculum designer');
  const user = [
    `Write term ${term.order} of 3 of the year-long curriculum: exactly ${term.weeks} weeks, one topic per week.`,
    term.order === 1
      ? 'Start from the foundations expected at the beginning of this class.'
      : `These topics were already covered in earlier terms; build on them and do not repeat them:\n- ${term.earlierTopics.join('\n- ')}`,
    `Sequence topics so each week builds on the last. Make the final week of the term revision and assessment.`,
    'For each week give: the topic; 2–4 subtopics; 2–4 measurable learning objectives starting with a verb ' +
      '("Learners should be able to…" is implied, so start with the verb); 2–4 learning activities; ' +
      '1–3 resources; 1–3 assessment ideas.',
    'Also give termSummary: two or three sentences on what this term covers and why in this order.',
    guidance ? `The school's guidance:\n${guidance}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { system, user };
}

export function schemePrompt(
  ctx: SchoolContext,
  term: { name: string; sessionName: string; weeks: { week: number; startsOn: string }[] },
  curriculumWeeks: { topic: string; subtopics: string[]; objectives: string[] }[] | null,
  guidance?: string | null,
) {
  const system = base(ctx, 'an experienced head of department writing a scheme of work');
  const calendar = term.weeks.map((w) => `Week ${w.week}: week of ${w.startsOn}`).join('\n');
  const source = curriculumWeeks?.length
    ? `Follow the school's approved curriculum for this term, in order. Adapt it to the calendar; ` +
      `if there are more calendar weeks than topics, use the spare weeks for consolidation, revision and ` +
      `examination; if fewer, merge the lightest topics.\n\n` +
      curriculumWeeks
        .map((w, i) => `${i + 1}. ${w.topic} — ${w.subtopics.join('; ')} | objectives: ${w.objectives.join('; ')}`)
        .join('\n')
    : 'There is no approved curriculum on record for this subject and class, so plan the term from the national curriculum.';
  const user = [
    `Write the scheme of work for ${term.name}, ${term.sessionName}: exactly ${term.weeks.length} weeks.`,
    `Term calendar:\n${calendar}`,
    source,
    'For each week give: the topic; 2–4 subtopics; 2–4 measurable objectives starting with a verb; ' +
      '2–4 teaching and learning activities; 1–3 resources; 1–3 evaluation questions or tasks the teacher ' +
      'can use to check understanding at the end of the week.',
    guidance ? `The school's guidance:\n${guidance}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { system, user };
}

export function lessonPrompt(
  ctx: SchoolContext & { classArm: string },
  lesson: { topic: string; durationMinutes: number; objectives: string[]; subtopics: string[]; date: string | null },
  guidance?: string | null,
) {
  const system = base(ctx, 'an outstanding classroom teacher and teacher-trainer');
  const user = [
    `Plan one ${lesson.durationMinutes}-minute lesson for ${ctx.level} ${ctx.classArm} on: ${lesson.topic}.`,
    lesson.subtopics.length ? `This week's subtopics: ${lesson.subtopics.join('; ')}.` : '',
    lesson.objectives.length
      ? `The scheme of work sets these objectives for the week (choose the ones that fit one lesson): ${lesson.objectives.join('; ')}.`
      : '',
    lesson.date ? `The lesson is on ${lesson.date}.` : '',
    `Structure the lesson in 4 to 6 steps (introduction, development, practice, plenary) whose minutes add up ` +
      `to exactly ${lesson.durationMinutes}. For each step say what the teacher does and what learners do.`,
    'Objectives: 2–4, measurable, starting with a verb. priorKnowledge: one or two sentences. materials: 2–5 items.',
    'differentiation: how the same lesson is pitched for learners who need support, for most learners (core), ' +
      'and for learners ready for stretch — one or two sentences each.',
    'assessment: 2–4 quick checks for understanding. homework: one short, specific task.',
    guidance ? `The teacher's notes:\n${guidance}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  return { system, user };
}
