import type { PracticalAskInput, PracticalContent } from '@aischool/shared';

/**
 * "Ask the lab assistant" (Mrs Ada, Mr Bayo, Mrs Okon): the answer to a student's question about a
 * practical, grounded in that practical's lesson. Pure prompt building (the
 * service runs it on the student's AI allowance), so it can be tested alone.
 */

export const ASK_STAGE_LABEL: Record<PracticalAskInput['stage'], string> = {
  LEARN: 'reading the "Learn first" introduction',
  DEMO: "watching the lab assistant's demonstration",
  TRY: 'doing the practice lab with their own values',
  SANDBOX: 'experimenting in the sandbox with values they chose',
};

const list = (title: string, items: string[] | undefined) => (items?.length ? `${title}:\n${items.map((x) => `- ${x}`).join('\n')}` : '');

/** The lesson facts the answer must stay within (the worked example's numbers are the lesson's own, not the student's). */
export function lessonBrief(title: string, d: Partial<PracticalContent>): string {
  return [
    `PRACTICAL: ${title}`,
    d.aim ? `AIM: ${d.aim}` : '',
    list('APPARATUS', d.apparatus),
    list('MATERIALS', d.materials),
    list('SAFETY', d.safety),
    list('PROCEDURE', d.procedure),
    d.expectedObservations ? `WHAT TO OBSERVE: ${d.expectedObservations}` : '',
    d.dataAndCalculations ? `WORKED EXAMPLE (sample data from the lesson): ${d.dataAndCalculations}` : '',
    list('PRECAUTIONS', d.precautions),
    list('SOURCES OF ERROR', d.sourcesOfError),
    list('COMMON MISTAKES', d.commonMistakes),
    list('EXAM TIPS', d.examTips),
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 9000);
}

/** The assistant the student sees in each subject's 3D lab (matches the web labs' assistant profiles). */
const ASSISTANT: Record<string, { name: string; role: string }> = {
  chemistry: { name: 'Mrs Ada', role: 'laboratory technician' },
  physics: { name: 'Mr Bayo', role: 'physics laboratory assistant' },
  biology: { name: 'Mrs Okon', role: 'biology laboratory technician' },
};

export function askPrompt(title: string, d: Partial<PracticalContent>, input: PracticalAskInput, subject = 'Chemistry') {
  const who = ASSISTANT[subject.toLowerCase()] ?? { name: 'the lab assistant', role: 'laboratory assistant' };
  const system = [
    `You are ${who.name}, a friendly, patient ${who.role} in a Nigerian secondary school, helping a student with a WAEC ${subject} practical in a virtual lab.`,
    'Answer the student’s question in simple British English: short (at most about 90 words), encouraging and practical. Explain the reason ("why"), not just the rule.',
    `Stay within the practical lesson below and standard school ${subject}. If the question is not about this practical or laboratory work, say kindly that you can only help with the practical.`,
    'Never work out, guess or confirm the numbers for the student’s own lab (their readings, measurements, titres, plotted values, calculated results or final answer). If asked, explain the method or the formula step by step and encourage them to do the calculation themselves. You may use the lesson’s own worked example to show the method.',
    'Never give instructions that would be unsafe in a real laboratory. Plain text only, no headings.',
    '',
    lessonBrief(title, d),
  ].join('\n');
  const context = [`The student is ${ASK_STAGE_LABEL[input.stage]}.`, input.step ? `Their current step: ${input.step}.` : ''].filter(Boolean).join(' ');
  const messages = [
    ...(input.history ?? []).flatMap((h) => [
      { role: 'user' as const, content: h.q.slice(0, 400) },
      { role: 'assistant' as const, content: h.a.slice(0, 1200) },
    ]),
    { role: 'user' as const, content: `${context}\n\nQuestion: ${input.question.slice(0, 400)}` },
  ];
  return { system, messages };
}
