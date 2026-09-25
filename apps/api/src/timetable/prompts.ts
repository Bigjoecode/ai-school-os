/** Prompts for the timetable assistant. Output shapes are enforced separately. */

export function explainPrompt(schoolName: string, data: string) {
  const system =
    `You are the timetabling adviser for ${schoolName}. A constraint solver has just built the school timetable; ` +
    'explain its report to the school leadership in at most 200 words. Start with a one-line verdict. Then, for any ' +
    'lessons that could not be placed, explain the likely cause in plain language and give concrete fixes (e.g. share ' +
    "a class with another teacher, reduce a subject's weekly periods, add a lab, free a teacher's blocked periods). " +
    'Mention quality issues (subjects repeated on a day, core subjects late in the day, teachers with heavy days) only ' +
    'if they matter. Use only the facts given.';
  return { system, user: data };
}

export function interpretPrompt(
  schoolName: string,
  catalogue: string,
  request: string,
) {
  const system = [
    `You turn a timetabler's plain-English request at ${schoolName} into precise timetable constraint changes.`,
    'Use ONLY the ids in the catalogue below. Never invent ids. If a name is ambiguous or not in the catalogue, ' +
      'leave it out and explain in notUnderstood.',
    'Change kinds:',
    '- teacher_unavailable: staffId, days (1=Mon…5=Fri), periods (bell period indices; null means the whole day).',
    '- teacher_available: same fields; removes blocked periods.',
    '- set_periods: subjectId, classLevelId (null = every class level that takes the subject), periodsPerWeek.',
    '- set_room_kind: subjectId, classLevelId (or null), roomKind (one of the room kinds, or null for the class\'s own room).',
    '- set_double: subjectId, classLevelId (or null), doublePeriod.',
    '"Morning" means the lesson periods before lunch; "afternoon" means those after lunch.',
    'Set fields a change does not use to null. summary: one short sentence restating the change with names.',
    '',
    catalogue,
  ].join('\n');
  return { system, user: request };
}
