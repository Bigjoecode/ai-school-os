import { z } from 'zod';

/**
 * Study materials: notes, documents, slides, videos, audio, pictures and
 * links that teachers share with their classes (or the whole school), and
 * the library students and parents read them in.
 */

export const MATERIAL_KINDS = ['NOTE', 'DOCUMENT', 'SLIDES', 'VIDEO', 'AUDIO', 'IMAGE', 'LINK'] as const;
export type MaterialKind = (typeof MATERIAL_KINDS)[number];
export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  NOTE: 'Note',
  DOCUMENT: 'Document',
  SLIDES: 'Slides',
  VIDEO: 'Video',
  AUDIO: 'Audio',
  IMAGE: 'Picture',
  LINK: 'Link',
};

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const id = () =>
  z
    .string()
    .min(1)
    .nullish()
    .transform((v) => v ?? null);

export const materialSchema = z
  .object({
    title: z.string().trim().min(2, 'Give it a title').max(160),
    description: text(1000),
    kind: z.enum(MATERIAL_KINDS),
    subjectId: id(),
    /** Every arm of these levels, plus any arms listed. Both empty = the whole school. */
    classLevelIds: z.array(z.string().min(1)).max(40).default([]),
    classArmIds: z.array(z.string().min(1)).max(80).default([]),
    termId: id(),
    topic: text(160),
    fileId: id(),
    url: text(1000),
    /** Written notes (markdown). */
    body: text(50_000),
    published: z.boolean().default(true),
    /** Tell the students (and their parents) in the app when it is published. */
    notify: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.url && !/^https:\/\/[^\s]+$/i.test(v.url)) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Use a full https:// link' });
    if (v.kind === 'NOTE' && !v.body) ctx.addIssue({ code: 'custom', path: ['body'], message: 'Write the note' });
    if (v.kind === 'LINK' && !v.url) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Paste the link' });
    if (v.kind === 'VIDEO' && !v.fileId && !v.url) ctx.addIssue({ code: 'custom', path: ['url'], message: 'Upload a video or paste a YouTube link' });
    if (['DOCUMENT', 'SLIDES', 'AUDIO', 'IMAGE'].includes(v.kind) && !v.fileId && !v.url) ctx.addIssue({ code: 'custom', path: ['fileId'], message: 'Upload the file' });
  });
export type MaterialInput = z.input<typeof materialSchema>;

export const materialListQuerySchema = z.object({
  subjectId: z.string().optional(),
  classArmId: z.string().optional(),
  classLevelId: z.string().optional(),
  kind: z.enum(MATERIAL_KINDS).optional(),
  termId: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  mine: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});
export type MaterialListQuery = z.input<typeof materialListQuerySchema>;

export const materialPublishSchema = z.object({ published: z.boolean(), notify: z.boolean().default(true) });

/** The YouTube video id of a youtube.com / youtu.be link, or null. */
export function youtubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
    let v: string | null = null;
    if (host === 'youtu.be') v = u.pathname.slice(1).split('/')[0] ?? null;
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') v = u.searchParams.get('v');
      else v = /^\/(?:embed|shorts|live|v)\/([^/?#]+)/.exec(u.pathname)?.[1] ?? null;
    }
    return v && /^[\w-]{6,20}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

// ============================================================ responses

export interface MaterialRow {
  id: string;
  title: string;
  description: string | null;
  kind: MaterialKind;
  subject: { id: string; name: string } | null;
  classLevels: { id: string; name: string }[];
  classArms: { id: string; name: string }[];
  /** Shared with every class in the school. */
  wholeSchool: boolean;
  term: { id: string; name: string } | null;
  topic: string | null;
  /** An uploaded file, served from `/api/materials/:id/file`. */
  file: { id: string; name: string; mimeType: string; sizeBytes: number } | null;
  url: string | null;
  /** Set when `url` is a YouTube video. */
  youtubeId: string | null;
  body: string | null;
  published: boolean;
  views: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** The signed-in user may edit or delete it. */
  canEdit: boolean;
}

export interface MaterialOptions {
  /** Can share with any class (academics.manage or curriculum.manage). */
  manageAll: boolean;
  /** Can share with the whole school (academics.manage). */
  wholeSchool: boolean;
  aiEnabled: boolean;
  levels: { id: string; name: string; arms: { id: string; name: string }[] }[];
  subjects: { id: string; name: string }[];
  terms: { id: string; name: string; sessionName: string; isCurrent: boolean }[];
  /** For teachers: the arm–subject pairs they teach, and the arms they lead (any subject). */
  teaches: { classArmId: string; subjectId: string }[];
  leads: string[];
}

export interface MaterialLibrary {
  student: { id: string; name: string; firstName: string; className: string | null };
  sections: { subject: { id: string; name: string } | null; materials: MaterialRow[] }[];
  total: number;
}

export interface MaterialAiDraft {
  title: string;
  /** Ready to save as a NOTE. */
  markdown: string;
  questions?: { question: string; options: string[]; answer: string; explanation: string }[];
}

export interface MaterialStreamUrl {
  url: string;
  expiresAt: string;
}
