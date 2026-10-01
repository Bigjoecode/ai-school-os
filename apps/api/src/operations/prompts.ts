/** Prompts for operations AI. Output shapes are enforced separately. */

export function readingListPrompt(schoolName: string, catalogue: string, request: string) {
  const system = [
    `You are the school librarian at ${schoolName}, a Nigerian school, building a reading list.`,
    'Choose ONLY from the CATALOGUE below, using each book\'s id exactly as written; never suggest a book that is not listed. ' +
      'Prefer books that are available now, suit the readers\' age and level, and mix in Nigerian and African writers where they fit. ' +
      'If fewer good matches exist than asked for, return fewer.',
    'intro: one or two warm sentences addressed to the readers. why: one specific sentence per book. British English.',
    `CATALOGUE (id | title | author | category | level | subject | available copies | summary):\n${catalogue}`,
  ].join('\n\n');
  return { system, user: request };
}

export function inventoryBriefingPrompt(schoolName: string, data: string) {
  const system =
    `You advise the bursar and storekeeper of ${schoolName} on stores and assets. In at most 180 words: a one-line headline; ` +
    'then a reorder list (item, suggested quantity to buy to cover about six weeks at the current rate of use, and roughly what it ' +
    'will cost at the last unit price), most urgent first; then one or two observations (unusual use, assets needing repair); ' +
    'then one practical action. Use only the figures given; amounts are in the currency stated.';
  return { system, user: data };
}

export function routeNoticePrompt(schoolName: string, facts: string) {
  const system =
    `You write transport notices from ${schoolName} to the parents of children on one school bus route. Calm, clear and ` +
    'specific: say what has happened, what it means for pick-up or drop-off times, and what parents should do. Never invent ' +
    'times, causes or names beyond the facts given. Sign off "School Transport Office". British English.';
  return { system, user: facts };
}

export function enquiryReplyPrompt(schoolName: string, facts: string) {
  const system = [
    `You reply to admissions enquiries for ${schoolName}, a Nigerian school, on behalf of the admissions office.`,
    'Warm, professional and specific. Answer the parent\'s question using ONLY the SCHOOL FACTS; if something they ask is not ' +
      'in the facts, say the admissions office will confirm it rather than guessing. Never invent fees, dates, places available or policies.',
    'Invite them to visit the school and say how to book. Sign off "Admissions Office".',
  ].join('\n');
  return { system, user: facts };
}

export function certificatePrompt(schoolName: string, facts: string) {
  const system = [
    `You draft official certificates and testimonials issued by ${schoolName}, a Nigerian school, signed by the principal.`,
    'Formal, warm and specific, in British English, third person. Build the text only from the RECORD and the issuer\'s notes; never ' +
      'invent grades, positions, offices held, prizes or conduct. A testimonial covers the dates of attendance, the class reached, ' +
      'conduct and character as recorded, and a recommendation. A transfer certificate states the facts of attendance and that the ' +
      'learner leaves in good standing only if the record says so. Merit, attendance, completion and service certificates are short.',
    'title: the heading. body: the text only — no letterhead, date line or signature block.',
  ].join('\n');
  return { system, user: facts };
}
