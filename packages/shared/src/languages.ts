import { z } from 'zod';

/**
 * Nigerian languages for students (the AI tutor and careers counsellor) and
 * parents (Parent AI, WhatsApp assistant, weekly learning update).
 * English is the default. Subject and exam terms always stay in English,
 * because WAEC, NECO and JAMB are written in English.
 *
 * Yoruba, Igbo and Hausa quality depends on the AI model: have a native
 * speaker review replies during a pilot.
 */
export const LANGUAGE_CODES = ['EN', 'PCM', 'YO', 'IG', 'HA'] as const;
export type LanguageCode = (typeof LANGUAGE_CODES)[number];
export const languageCodeSchema = z.enum(LANGUAGE_CODES);
export const DEFAULT_LANGUAGE: LanguageCode = 'EN';

export interface LanguageInfo {
  code: LanguageCode;
  /** The language's name in itself ("Yorùbá"). */
  label: string;
  /** Its name in English ("Yoruba"), for prompts and staff screens. */
  english: string;
  /** ISO 639-1 code for speech-to-text hints (Pidgin is transcribed as English). */
  iso: 'en' | 'yo' | 'ig' | 'ha';
  /** BCP 47 tag for the browser's speech recognition and voices. */
  speech: string;
  /** OpenAI's voices are English-centric: spoken replies may sound accented. */
  accentedSpeech: boolean;
  /** One-line instruction for an AI system prompt. */
  instruction: string;
}

export const LANGUAGES: readonly LanguageInfo[] = [
  {
    code: 'EN',
    label: 'English',
    english: 'English',
    iso: 'en',
    speech: 'en-NG',
    accentedSpeech: false,
    instruction: 'Reply in clear, simple English (British spelling).',
  },
  {
    code: 'PCM',
    label: 'Naijá (Pidgin)',
    english: 'Nigerian Pidgin',
    iso: 'en',
    speech: 'en-NG',
    accentedSpeech: false,
    instruction: 'Reply in Nigerian Pidgin (Naijá), the friendly everyday Pidgin spoken across Nigeria — natural, not exaggerated or comic.',
  },
  {
    code: 'YO',
    label: 'Yorùbá',
    english: 'Yoruba',
    iso: 'yo',
    speech: 'yo-NG',
    accentedSpeech: true,
    instruction: 'Reply in Yoruba (Yorùbá), written with correct tone marks and under-dots (e.g. ẹ, ọ, ṣ), in a warm, respectful register.',
  },
  {
    code: 'IG',
    label: 'Igbo',
    english: 'Igbo',
    iso: 'ig',
    speech: 'ig-NG',
    accentedSpeech: true,
    instruction: 'Reply in Igbo, in standard written Igbo (Igbo Izugbe) with the correct dotted vowels (ị, ọ, ụ) and ṅ, in a warm, respectful register.',
  },
  {
    code: 'HA',
    label: 'Hausa',
    english: 'Hausa',
    iso: 'ha',
    speech: 'ha-NG',
    accentedSpeech: true,
    instruction: 'Reply in Hausa, in standard Kano Hausa written in Latin script (Boko) with the hooked letters (ɓ, ɗ, ƙ, ƴ), in a warm, respectful register.',
  },
];

export function isLanguageCode(v: unknown): v is LanguageCode {
  return typeof v === 'string' && (LANGUAGE_CODES as readonly string[]).includes(v);
}

/** The language's details; anything unknown or empty is English. */
export function languageInfo(code: string | null | undefined): LanguageInfo {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0]!;
}

/** A stored value as a language code, or null when unset or unknown. */
export const asLanguage = (v: unknown): LanguageCode | null => (isLanguageCode(v) ? v : null);

/**
 * The language block for an AI system prompt (never the user turn).
 * `explicit`: the user asked for this one reply in this language, so don't
 * mirror the language of their message.
 */
export function languagePrompt(code: string | null | undefined, audience: 'student' | 'parent', opts: { explicit?: boolean } = {}): string {
  const l = languageInfo(code);
  const others = LANGUAGES.filter((x) => x.code !== l.code)
    .map((x) => x.english)
    .join(', ');
  const terms =
    audience === 'student'
      ? "Keep subject terms and exam vocabulary in English (for example 'quadratic equation', 'photosynthesis', 'simultaneous equations', 'concord'), because WAEC, NECO and JAMB are written in English; explain what each term means simply in the reply language."
      : 'Keep subject names, topic names, class names, the school’s name and other school terms in English, exactly as the school records them.';
  const lines = [
    `LANGUAGE: ${l.instruction}`,
    l.code === 'EN' ? null : terms,
    'Never translate or change numbers: write scores, percentages, grades, amounts (₦), dates, times and formulas exactly as given, in digits.',
    opts.explicit
      ? `They asked for this reply in ${l.english}: use ${l.english} for this reply even if their message is in another language.`
      : `If their latest message is written in another language (${others}), mirror it and reply in that language instead.`,
    l.code === 'EN' ? null : 'Be culturally appropriate and respectful: greet and address people the way a polite Nigerian teacher or school officer would in this language. If you are unsure of a word, use the English word rather than guess.',
  ];
  return lines.filter(Boolean).join(' ');
}

/** Fixed, reviewed lines for messages that don't use AI (subject and topic names stay in English). */
export const LEARNING_UPDATE_INTRO: Record<LanguageCode, (name: string) => string> = {
  EN: (n) => `This is how ${n} is learning this week.`,
  PCM: (n) => `Dis na how ${n} dey learn dis week.`,
  YO: (n) => `Èyí ni bí ${n} ṣe ń kẹ́kọ̀ọ́ ní ọ̀sẹ̀ yìí.`,
  IG: (n) => `Nke a bụ otú ${n} si na-amụ akwụkwọ n'izu a.`,
  HA: (n) => `Ga yadda ${n} ke karatu a wannan makon.`,
};
/** "Our suggestion:" before the recommendation. */
export const SUGGESTION_LABEL: Record<LanguageCode, string> = {
  EN: 'Our suggestion:',
  PCM: 'Wetin we suggest:',
  YO: 'Ìmọ̀ràn wa:',
  IG: 'Ndụmọdụ anyị:',
  HA: 'Shawararmu:',
};

/** The student's tutor language (self-service, or set by a parent). */
export const tutorLanguageSchema = z.object({ language: languageCodeSchema.nullable() });
/** A parent's own language for messages and the Parent AI. */
export const parentLanguageSchema = z.object({ language: languageCodeSchema.nullable() });

export interface ParentLanguageInfo {
  /** The parent's own choice, or null to use the school's default. */
  language: LanguageCode | null;
  /** The school's default for parent messages. */
  schoolDefault: LanguageCode;
}
