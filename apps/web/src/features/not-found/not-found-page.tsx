import { motion } from 'framer-motion';
import { ArrowLeft, Compass, Search } from 'lucide-react';
import { Link } from 'react-router';
import { Page } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Kbd, modKey } from '@/components/ui/kbd';
import { useDocumentTitle } from '@/lib/hooks';
import { useUiStore } from '@/lib/ui-store';

export default function NotFoundPage() {
  useDocumentTitle('Page not found');
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);
  return (
    <Page className="grid min-h-[calc(100dvh-56px)] place-items-center">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="max-w-md text-center"
      >
        <p className="font-display text-[96px] font-semibold leading-none tracking-[-0.05em] text-ai-gradient">404</p>
        <div className="mx-auto mt-6 grid size-12 place-items-center rounded-2xl border border-border bg-card shadow-soft">
          <Compass className="size-6 text-muted-foreground" />
        </div>
        <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">This page wandered off</h1>
        <p className="mt-2 text-[14px] text-muted-foreground">The link may be broken, or the page may have moved. Try searching instead.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-2">
          <Button asChild variant="outline">
            <Link to="/">
              <ArrowLeft /> Back to overview
            </Link>
          </Button>
          <Button onClick={() => setCommandOpen(true)}>
            <Search /> Search <Kbd className="ml-1 border-white/20 bg-white/10 text-inherit dark:border-black/10 dark:bg-black/5">{modKey} K</Kbd>
          </Button>
        </div>
      </motion.div>
    </Page>
  );
}
