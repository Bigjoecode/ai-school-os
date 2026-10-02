import { z } from 'zod';

/**
 * School website contracts: the public site every school gets (home, about,
 * academics, admissions, teachers, news, events, gallery, contact, FAQ,
 * results, downloads), its content settings, the results checker and the
 * AI website assistant.
 */

const text = (max: number) => z.string().trim().max(max);
const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
/** A link to a file uploaded to this school, or an https image URL. */
const mediaUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith('/api/public/files/') || /^https:\/\//.test(v), 'Upload a file or use an https:// link')
  .nullish()
  .transform((v) => v ?? null);

// ============================================================ settings

export const WEBSITE_SECTIONS = ['news', 'events', 'gallery', 'teachers', 'results', 'downloads', 'fees', 'stats', 'assistant'] as const;
export type WebsiteSection = (typeof WEBSITE_SECTIONS)[number];

export const websiteSettingsSchema = z.object({
  published: z.boolean(),
  /** Colours and feel. */
  theme: z.object({
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #1d4ed8'),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a hex colour like #f59e0b'),
    style: z.enum(['CLASSIC', 'MODERN', 'WARM']),
  }),
  hero: z.object({
    title: text(120),
    subtitle: text(300),
    imageUrl: mediaUrl,
    primaryCta: text(40),
  }),
  about: z.object({
    story: text(5000),
    mission: text(500),
    vision: text(500),
    values: z.array(z.object({ title: text(60), description: text(300) })).max(8),
    leaderName: nullableText(120),
    leaderTitle: nullableText(80),
    leaderMessage: nullableText(3000),
    leaderPhotoUrl: mediaUrl,
    founded: nullableText(10),
  }),
  academics: z.object({
    intro: text(3000),
    programmes: z.array(z.object({ title: text(80), description: text(800) })).max(10),
    highlights: z.array(text(120)).max(10),
  }),
  admissions: z.object({
    open: z.boolean(),
    intro: text(3000),
    steps: z.array(z.object({ title: text(80), description: text(400) })).max(8),
    requirements: z.array(text(200)).max(15),
    entryTerms: z.array(text(60)).max(6),
  }),
  contact: z.object({
    address: nullableText(300),
    phone: nullableText(40),
    whatsapp: nullableText(40),
    email: nullableText(120),
    hours: nullableText(200),
    mapUrl: z.url().max(1000).nullish().transform((v) => v ?? null),
  }),
  social: z.object({
    facebook: z.url().max(300).nullish().transform((v) => v ?? null),
    instagram: z.url().max(300).nullish().transform((v) => v ?? null),
    x: z.url().max(300).nullish().transform((v) => v ?? null),
    youtube: z.url().max(300).nullish().transform((v) => v ?? null),
    linkedin: z.url().max(300).nullish().transform((v) => v ?? null),
  }),
  faq: z.array(z.object({ question: text(200), answer: text(1500) })).max(30),
  sections: z.record(z.enum(WEBSITE_SECTIONS), z.boolean()),
  seo: z.object({ title: nullableText(70), description: nullableText(160) }),
});
export type WebsiteSettings = z.infer<typeof websiteSettingsSchema>;

export const DEFAULT_WEBSITE_SETTINGS: WebsiteSettings = {
  published: false,
  theme: { primaryColor: '#1d4ed8', accentColor: '#f59e0b', style: 'MODERN' },
  hero: { title: 'A great education, close to home', subtitle: 'Tell families what makes your school special.', imageUrl: null, primaryCta: 'Apply now' },
  about: { story: '', mission: '', vision: '', values: [], leaderName: null, leaderTitle: null, leaderMessage: null, leaderPhotoUrl: null, founded: null },
  academics: { intro: '', programmes: [], highlights: [] },
  admissions: { open: true, intro: '', steps: [], requirements: [], entryTerms: [] },
  contact: { address: null, phone: null, whatsapp: null, email: null, hours: null, mapUrl: null },
  social: { facebook: null, instagram: null, x: null, youtube: null, linkedin: null },
  faq: [],
  sections: { news: true, events: true, gallery: true, teachers: true, results: true, downloads: true, fees: false, stats: true, assistant: true },
  seo: { title: null, description: null },
};

// ============================================================ content

export const POST_CATEGORIES = ['NEWS', 'ACHIEVEMENT', 'EVENT', 'ANNOUNCEMENT', 'BLOG'] as const;
export type PostCategory = (typeof POST_CATEGORIES)[number];
export const POST_CATEGORY_LABELS: Record<PostCategory, string> = { NEWS: 'News', ACHIEVEMENT: 'Achievement', EVENT: 'Event', ANNOUNCEMENT: 'Announcement', BLOG: 'Blog' };

export const postSchema = z.object({
  title: z.string().trim().min(3).max(160),
  excerpt: nullableText(300),
  body: z.string().trim().min(10).max(30_000),
  category: z.enum(POST_CATEGORIES).default('NEWS'),
  coverUrl: mediaUrl,
  status: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  publishedAt: isoDate.nullish().transform((v) => v ?? null),
});
export type PostInput = z.infer<typeof postSchema>;

export const albumSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: nullableText(500),
  date: isoDate.nullish().transform((v) => v ?? null),
  published: z.boolean().default(true),
});
export const photoSchema = z.object({ url: mediaUrl.refine((v) => !!v, 'Upload a photo'), caption: nullableText(200) });

export const DOWNLOAD_CATEGORIES = ['PROSPECTUS', 'FORMS', 'CALENDAR', 'POLICIES', 'FEES', 'NEWSLETTER', 'OTHER'] as const;
export type DownloadCategory = (typeof DOWNLOAD_CATEGORIES)[number];
export const DOWNLOAD_CATEGORY_LABELS: Record<DownloadCategory, string> = {
  PROSPECTUS: 'Prospectus',
  FORMS: 'Forms',
  CALENDAR: 'Calendar',
  POLICIES: 'Policies',
  FEES: 'Fees',
  NEWSLETTER: 'Newsletters',
  OTHER: 'Other',
};
export const downloadSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: nullableText(300),
  category: z.enum(DOWNLOAD_CATEGORIES).default('OTHER'),
  fileUrl: mediaUrl.refine((v) => !!v, 'Upload the file'),
  published: z.boolean().default(true),
});

export const websiteTeacherSchema = z.object({
  showOnWebsite: z.boolean(),
  websiteBio: nullableText(800),
  photoUrl: mediaUrl,
});

export const MESSAGE_STATUSES = ['NEW', 'READ', 'REPLIED', 'ARCHIVED'] as const;
export type WebsiteMessageStatus = (typeof MESSAGE_STATUSES)[number];

export const resultCodesSchema = z.object({ classArmId: z.string().min(1), termId: z.string().min(1), maxUses: z.number().int().min(1).max(50).default(5) });

export const WEBSITE_DRAFT_KINDS = ['HERO', 'ABOUT', 'ACADEMICS', 'ADMISSIONS', 'FAQ', 'NEWS'] as const;
export const websiteDraftRequestSchema = z.object({
  kind: z.enum(WEBSITE_DRAFT_KINDS),
  brief: z.string().trim().min(3).max(2000),
});

// ============================================================ public forms

export const contactFormSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.email().max(160).nullish().or(z.literal('')).transform((v) => (v ? v : null)),
  phone: nullableText(30),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(5).max(3000),
  /** Honeypot: real people leave it empty. */
  website: z.string().max(0).optional(),
});

export const applicationFormSchema = z.object({
  parentName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(30),
  email: z.email().max(160).nullish().or(z.literal('')).transform((v) => (v ? v : null)),
  childName: z.string().trim().min(2).max(120),
  childDateOfBirth: isoDate.nullish().transform((v) => v ?? null),
  classOfInterest: z.string().trim().min(2).max(40),
  entryTerm: nullableText(60),
  currentSchool: nullableText(160),
  message: nullableText(2000),
  website: z.string().max(0).optional(),
});

export const resultCheckSchema = z.object({
  admissionNumber: z.string().trim().min(3).max(40),
  code: z.string().trim().toUpperCase().min(6).max(16),
});

export const assistantRequestSchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1).max(1500) }))
    .min(1)
    .max(12)
    .refine((m) => m[m.length - 1]!.role === 'user', 'The last message must be the visitor’s question'),
});

// ============================================================ responses

export interface PublicSite {
  slug: string;
  school: { name: string; shortName: string | null; motto: string | null; logoUrl: string | null; primaryColor: string | null };
  settings: WebsiteSettings;
  classes: { level: string; stage: string | null }[];
  subjects: string[];
  stats: { students: number; teachers: number; classes: number; founded: string | null } | null;
  news: PublicPost[];
  events: PublicEvent[];
  term: { name: string; startsOn: string; endsOn: string } | null;
}

export interface PublicPost {
  slug: string;
  title: string;
  excerpt: string | null;
  category: PostCategory;
  coverUrl: string | null;
  publishedAt: string;
  body?: string;
}

export interface PublicEvent {
  title: string;
  description: string | null;
  category: string;
  startDate: string;
  endDate: string | null;
  time: string | null;
  location: string | null;
}

export interface PublicAlbum {
  id: string;
  title: string;
  description: string | null;
  date: string | null;
  coverUrl: string | null;
  photos: number;
}

export interface PublicPhoto {
  id: string;
  url: string;
  caption: string | null;
}

export interface PublicTeacher {
  id: string;
  name: string;
  jobTitle: string;
  department: string | null;
  bio: string | null;
  photoUrl: string | null;
  subjects: string[];
}

export interface PublicDownload {
  id: string;
  title: string;
  description: string | null;
  category: DownloadCategory;
  fileUrl: string;
  sizeBytes: number | null;
}

export interface PublicFees {
  term: string;
  currency: string;
  levels: { level: string; items: { name: string; amountKobo: number; optional: boolean }[]; totalKobo: number }[];
}

export interface PublicResult {
  school: string;
  student: { name: string; admissionNumber: string; classArm: string };
  term: string;
  session: string;
  subjects: { subject: string; total: number | null; outOf: number; percent: number | null; grade: string | null; remark: string | null }[];
  average: number | null;
  position: number | null;
  classSize: number;
  teacherRemark: string | null;
  principalRemark: string | null;
  attendance: { present: number; absent: number; total: number } | null;
  usesLeft: number;
}

export interface WebsiteOverview {
  slug: string;
  publicUrl: string;
  settings: WebsiteSettings;
  counts: { posts: number; published: number; albums: number; photos: number; downloads: number; teachersShown: number; eventsShown: number; newMessages: number; applicationsThisMonth: number };
  domains: { hostname: string; kind: string }[];
}

export interface WebsitePostRow extends PublicPost {
  id: string;
  status: 'DRAFT' | 'PUBLISHED';
  body: string;
  updatedAt: string;
}

export interface WebsiteMessageRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  subject: string;
  message: string;
  status: WebsiteMessageStatus;
  createdAt: string;
}

export interface ResultCodeRow {
  studentId: string;
  name: string;
  admissionNumber: string;
  code: string | null;
  uses: number;
  maxUses: number;
}

export interface UploadedFile {
  id: string;
  url: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
}
