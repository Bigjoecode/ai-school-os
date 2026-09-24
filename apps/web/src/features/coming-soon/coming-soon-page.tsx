import { motion } from 'framer-motion';
import { ArrowLeft, Check, Rocket } from 'lucide-react';
import { Link } from 'react-router';
import { allNavItems } from '@/app/navigation';
import { UPCOMING_MODULES } from '@/app/modules';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { Page } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useDocumentTitle } from '@/lib/hooks';

export default function ComingSoonPage({ path }: { path: string }) {
  const mod = UPCOMING_MODULES[path];
  const nav = allNavItems().find((i) => i.to === path);
  const Icon = nav?.icon ?? Rocket;
  useDocumentTitle(mod?.name ?? 'Coming soon');
  if (!mod) return null;
  const aiFeature = mod.features[mod.features.length - 1];
  const features = mod.features.slice(0, -1);

  return (
    <Page className="flex min-h-[calc(100dvh-56px)] items-center">
      <div className="relative mx-auto w-full max-w-3xl">
        <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-brand/10 blur-[100px]" />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-3xl border border-border bg-card shadow-lift"
        >
          <div className="bg-grid relative border-b border-border px-6 pb-8 pt-10 sm:px-10 [mask-image:linear-gradient(to_bottom,black,black)]">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Phase {mod.phase}</Badge>
              <Badge variant="secondary">In the build queue</Badge>
            </div>
            <div className="mt-6 flex items-start gap-5">
              <motion.span
                initial={{ scale: 0.8, rotate: -8 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                className="grid size-16 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-lift"
              >
                <Icon className="size-7" />
              </motion.span>
              <div>
                <h1 className="font-display text-[28px] font-semibold tracking-tight sm:text-[34px]">{mod.name}</h1>
                <p className="mt-1.5 text-[15px] text-muted-foreground">{mod.summary}</p>
              </div>
            </div>
          </div>
          <div className="px-6 py-8 sm:px-10">
            <p className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">What it will do</p>
            <ul className="mt-4 space-y-3">
              {features.map((f, i) => (
                <motion.li
                  key={f}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.07 }}
                  className="flex items-start gap-3 text-[14.5px]"
                >
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-success-soft text-success">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {f}
                </motion.li>
              ))}
            </ul>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="ai-border ai-glow mt-6 flex items-start gap-3 rounded-2xl bg-card p-4"
            >
              <AiSparkle className="mt-0.5 size-5" />
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wider text-ai-gradient">AI capability</p>
                <p className="mt-1 text-[14.5px] font-medium">{aiFeature}</p>
              </div>
            </motion.div>
            <div className="mt-8 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link to="/">
                  <ArrowLeft /> Back to overview
                </Link>
              </Button>
              <Button asChild variant="ai">
                <Link to={`/ai?agent=school&q=${encodeURIComponent(`What will the ${mod.name} module do for our school?`)}`}>
                  <AiSparkle className="size-4 [&_path]:fill-white" animated={false} /> Ask AI about {mod.name}
                </Link>
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </Page>
  );
}
