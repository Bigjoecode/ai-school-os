import { z } from 'zod';

/** The website assistant answers visitors from the site's own facts only. */
export function assistantPrompt(schoolName: string, facts: string) {
  return [
    `You are the friendly website assistant for ${schoolName}, a school in Nigeria. You answer questions from parents and visitors on the school's website.`,
    'Answer ONLY from the SCHOOL FACTS below. If the answer is not there, say you don\'t have that detail and suggest contacting the school (give the phone, WhatsApp or email if listed) — never guess fees, dates, results or policies.',
    'Never discuss individual students or staff beyond what the facts list publicly, never collect personal data in the chat, and politely decline questions unrelated to the school.',
    'Keep answers short (at most 120 words), warm and clear, in British English. When it helps, point to the relevant page of the website: Admissions (to apply), Contact, Fees, Results (results checker), Events, News, Downloads.',
    '',
    'SCHOOL FACTS',
    facts,
  ].join('\n');
}

export const draftSchemas = {
  HERO: z.object({
    title: z.string().describe('Headline, at most 10 words'),
    subtitle: z.string().describe('One or two sentences under the headline, at most 40 words'),
    primaryCta: z.string().describe('Button text, 2–3 words, e.g. "Apply now"'),
  }),
  ABOUT: z.object({
    story: z.string().describe('The school story, 150–250 words, in short paragraphs'),
    mission: z.string().describe('One-sentence mission'),
    vision: z.string().describe('One-sentence vision'),
    values: z.array(z.object({ title: z.string(), description: z.string() })).describe('4–6 core values with one-line descriptions'),
  }),
  ACADEMICS: z.object({
    intro: z.string().describe('Introduction to the academic programme, 80–150 words'),
    programmes: z.array(z.object({ title: z.string(), description: z.string() })).describe('3–5 programmes or stages with 1–2 sentence descriptions'),
    highlights: z.array(z.string()).describe('4–6 short highlights'),
  }),
  ADMISSIONS: z.object({
    intro: z.string().describe('Welcoming introduction to admissions, 60–120 words'),
    steps: z.array(z.object({ title: z.string(), description: z.string() })).describe('4–5 admission steps in order'),
    requirements: z.array(z.string()).describe('Documents or requirements, 4–8 items'),
  }),
  FAQ: z.object({
    faq: z.array(z.object({ question: z.string(), answer: z.string() })).describe('6–10 questions parents commonly ask, answered from the facts; say "contact the school" where a fact is missing'),
  }),
  NEWS: z.object({
    title: z.string(),
    excerpt: z.string().describe('One-sentence summary'),
    body: z.string().describe('The news post in markdown, 150–300 words, short paragraphs'),
  }),
} as const;

export function draftPrompt(kind: keyof typeof draftSchemas, schoolName: string, facts: string) {
  const what: Record<keyof typeof draftSchemas, string> = {
    HERO: 'the headline section of the home page',
    ABOUT: 'the About page',
    ACADEMICS: 'the Academics page',
    ADMISSIONS: 'the Admissions page',
    FAQ: 'the frequently asked questions',
    NEWS: 'a news post',
  };
  return [
    `You write website copy for ${schoolName}, a Nigerian school. Write ${what[kind]} from the brief and the SCHOOL FACTS.`,
    'Warm, confident and specific; British English; no clichés ("world-class", "state-of-the-art", "holistic") and no superlatives the facts don\'t support.',
    'Never invent results, awards, numbers, dates, fees or names that aren\'t in the facts; where a detail would help but is missing, write it generally.',
    '',
    'SCHOOL FACTS',
    facts,
  ].join('\n');
}
