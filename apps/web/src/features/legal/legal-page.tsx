import { ArrowLeft, FileText, Printer } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { BrandMark } from '@/components/layout/brand';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/lib/auth-store';
import { useDocumentTitle } from '@/lib/hooks';
import { cn } from '@/lib/utils';
import { LEGAL_DOCS, LEGAL_TEXT, isLegalSlug } from './docs';
import { LegalMarkdown } from './legal-markdown';

/** Public pages: /legal (index) and /legal/:doc. No sign-in, no app chrome. */
export default function LegalPage() {
  const { doc } = useParams();
  const authed = useAuthStore((s) => s.status === 'authenticated');
  const current = isLegalSlug(doc) ? LEGAL_DOCS.find((d) => d.slug === doc)! : null;
  useDocumentTitle(current ? current.title : 'Privacy & legal');
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [doc]);

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/legal" className="flex items-center gap-2.5">
            <BrandMark />
            <span className="font-display text-[15px] font-semibold tracking-tight">
              AI School <span className="text-ai-gradient">OS</span>
            </span>
          </Link>
          <Button asChild variant="ghost" size="sm">
            <Link to={authed ? '/' : '/login'}>
              <ArrowLeft /> {authed ? 'Back to the app' : 'Sign in'}
            </Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-8 px-4 py-8 md:grid-cols-[220px_1fr]">
        <aside className="print:hidden">
          <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">Privacy & legal</p>
          <nav aria-label="Documents" className="no-scrollbar -mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
            {LEGAL_DOCS.map((d) => (
              <Link
                key={d.slug}
                to={`/legal/${d.slug}`}
                aria-current={d.slug === doc ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors',
                  d.slug === doc ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {d.title}
              </Link>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          {current ? (
            <>
              <div className="mb-4 flex justify-end print:hidden">
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer /> Print or save as PDF
                </Button>
              </div>
              <LegalMarkdown text={LEGAL_TEXT[current.slug]} />
            </>
          ) : (
            <div>
              <h1 className="font-display text-[26px] font-semibold tracking-tight">Privacy & legal</h1>
              <p className="mt-2 text-[14.5px] text-muted-foreground">
                How AI School OS looks after the information of students, parents and staff. These documents are drafts awaiting legal review.
              </p>
              <ul className="mt-6 grid gap-3 sm:grid-cols-2">
                {LEGAL_DOCS.map((d) => (
                  <li key={d.slug}>
                    <Link to={`/legal/${d.slug}`} className="flex h-full gap-3 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-border-strong">
                      <FileText className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
                      <span>
                        <span className="block text-[14px] font-semibold">{d.title}</span>
                        <span className="mt-0.5 block text-[13px] text-muted-foreground">{d.description}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </main>
      </div>
      <footer className="border-t border-border py-6 text-center text-[12px] text-muted-foreground print:hidden">© {new Date().getFullYear()} AI School OS</footer>
    </div>
  );
}
