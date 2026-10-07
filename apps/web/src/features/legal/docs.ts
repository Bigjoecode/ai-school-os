import { LEGAL_DOCS, type LegalDocSlug } from '@aischool/shared';
import privacy from '../../../../../docs/legal/privacy-notice.md?raw';
import children from '../../../../../docs/legal/ai-use-statement.md?raw';
import terms from '../../../../../docs/legal/terms-of-service.md?raw';
import dpa from '../../../../../docs/legal/data-processing-agreement.md?raw';
import subprocessors from '../../../../../docs/legal/subprocessors.md?raw';
import retention from '../../../../../docs/legal/data-retention.md?raw';

/** The Markdown sources in docs/legal, bundled at build time so the pages and the files never drift apart. */
export const LEGAL_TEXT: Record<LegalDocSlug, string> = { privacy, children, terms, dpa, subprocessors, retention };

export { LEGAL_DOCS };
export type { LegalDocSlug };

export const isLegalSlug = (s: string | undefined): s is LegalDocSlug => !!s && LEGAL_DOCS.some((d) => d.slug === s);
