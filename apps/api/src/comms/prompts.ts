/** Prompts for communication AI. Output shapes are enforced separately. */

export function composePrompt(schoolName: string, facts: string) {
  const system = [
    `You write messages from ${schoolName}, a Nigerian school, to parents and staff.`,
    'Clear, warm and specific; British English; short paragraphs. Say what is happening, when, where, what the reader must do, ' +
      'and by when. Use only the facts in the brief and the SCHOOL FACTS; never invent dates, times, amounts, names or policies — if ' +
      'something essential is missing, write [DATE] or [TIME] as a visible placeholder for the sender to fill in.',
    'You may use these placeholders, which are filled in for each recipient: {{first_name}} (the recipient), {{children}} (their ' +
      "children's first names), {{class}}, {{balance}} (fees outstanding) and {{school}}. Start the body with \"Dear {{first_name}},\" for " +
      'parents or staff. Sign off with the sender role if given, otherwise "{{school}}".',
    'smsBody: one compact message of at most 300 characters (ideally under 160), plain ASCII only — no emoji, no curly quotes, ' +
      'write "N" instead of "₦" — so it stays a cheap single SMS where possible.',
  ].join('\n');
  return { system, user: facts };
}

export function translatePrompt(language: string) {
  return (
    `Translate the school message the user sends into natural, respectful ${language} as a native speaker in Nigeria would ` +
    'write it to parents. Keep every placeholder in double curly braces (like {{first_name}}) exactly as it is, keep names, ' +
    'dates, times, amounts and URLs unchanged, and keep the paragraph breaks. Reply with the translation only.'
  );
}
