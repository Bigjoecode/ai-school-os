/**
 * Titles, descriptions and the share image for the sales pages. Plain data (no React, no Vite env)
 * so the build plugin (seo-plugin.ts) can write a static HTML copy of each page with these tags:
 * WhatsApp, Facebook and LinkedIn read Open Graph tags without running JavaScript.
 */
export interface SalesSeo {
  path: string;
  /** Static HTML file written by the build (served for `path` by .htaccess). */
  file: string;
  title: string;
  description: string;
}

export const OG_IMAGE = '/og/ai-school-os.png';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT = 'AI School OS: the school system for Nigerian schools — lessons, exams, results, fees and parents in one place';

export const SALES_SEO: SalesSeo[] = [
  {
    path: '/for-schools',
    file: 'og/for-schools.html',
    title: 'AI School OS for Nigerian schools',
    description:
      'Less paperwork for teachers, weekly updates for parents and offline exam practice for WAEC, BECE and JAMB. Results, fees, attendance and more in one system. From ₦1,200 per student per term.',
  },
  {
    path: '/for-schools/deck',
    file: 'og/for-schools-deck.html',
    title: 'AI School OS — the pitch deck',
    description: 'A short slide deck for proprietors and principals: the problems, how the learning loop works, offline exams, parents, pricing and the pilot offer.',
  },
  {
    path: '/for-schools/calculator',
    file: 'og/for-schools-calculator.html',
    title: 'AI School OS — savings calculator',
    description: 'Estimate teacher hours saved, paper and SMS costs, and the cost per student for your school. Every assumption is shown and can be changed.',
  },
  {
    path: '/for-boards',
    file: 'og/for-boards.html',
    title: 'AI School OS for SUBEBs and state ministries',
    description: 'Offline CBT at scale, classroom engagement evidence, school returns reports and NDPA-ready data protection. A pilot proposal outline for state boards.',
  },
];

export const seoFor = (path: string) => SALES_SEO.find((s) => s.path === path) ?? SALES_SEO[0]!;
