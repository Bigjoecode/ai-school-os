import { formatMoney, type PublicFees } from '@aischool/shared';
import { Check, ChevronDown, Compass, HelpCircle, Layers, Receipt, Target } from 'lucide-react';
import * as React from 'react';
import { cn } from '@/lib/utils';
import { useSite, useSitePart, useSiteTitle } from './context';
import { ApplyCta, LeaderMessage } from './pages-home';
import { Chip, Eyebrow, IconTile, MoreLink, PageIntro, Reveal, Section, SectionHeading, SiteCard, SiteEmpty, SiteError, SiteLink, Shimmer, paragraphs, siteButton } from './ui';
import { errorMessage } from '@/lib/api';

// ------------------------------------------------------------------ about

export function AboutPage() {
  const { site } = useSite();
  const a = site.settings.about;
  useSiteTitle('About us', a.mission || undefined);
  const story = paragraphs(a.story);
  return (
    <>
      <PageIntro eyebrow={a.founded ? `Since ${a.founded}` : 'About us'} title={`About ${site.school.name}`} description={a.mission || site.settings.hero.subtitle} />
      {story.length > 0 && (
        <Section>
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr] [&>*]:min-w-0">
            <div>
              <Eyebrow className="mb-3">Our story</Eyebrow>
              <h2 className="site-h text-[28px] font-semibold leading-tight text-site-ink sm:text-[34px]">{site.school.motto ? `“${site.school.motto}”` : 'Who we are'}</h2>
            </div>
            <Reveal className="space-y-5 text-[17px] leading-[1.75] text-site-ink/85">
              {story.map((p, i) => (
                <p key={i} className={cn(i === 0 && 'text-[19px] text-site-ink')}>
                  {p}
                </p>
              ))}
            </Reveal>
          </div>
        </Section>
      )}
      {(a.mission || a.vision) && (
        <Section tone="surface">
          <div className="grid gap-6 md:grid-cols-2 [&>*]:min-w-0">
            {a.mission && (
              <Reveal>
                <SiteCard className="h-full p-7 sm:p-9">
                  <IconTile icon={Target} />
                  <Eyebrow className="mt-6">Our mission</Eyebrow>
                  <p className="site-h mt-3 text-[21px] font-semibold leading-snug text-site-ink sm:text-[24px]">{a.mission}</p>
                </SiteCard>
              </Reveal>
            )}
            {a.vision && (
              <Reveal delay={0.06}>
                <SiteCard className="h-full p-7 sm:p-9">
                  <IconTile icon={Compass} />
                  <Eyebrow className="mt-6">Our vision</Eyebrow>
                  <p className="site-h mt-3 text-[21px] font-semibold leading-snug text-site-ink sm:text-[24px]">{a.vision}</p>
                </SiteCard>
              </Reveal>
            )}
          </div>
        </Section>
      )}
      {a.values.length > 0 && (
        <Section>
          <SectionHeading eyebrow="Our values" title="What we stand for" align="center" />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4 [&>*]:min-w-0">
            {a.values.map((v, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <div className="h-full border-t-2 border-site pt-5">
                  <p className="site-h text-[13px] font-semibold text-site tabular">0{i + 1}</p>
                  <p className="site-h mt-2 text-[19px] font-semibold text-site-ink">{v.title}</p>
                  <p className="mt-2 text-[14.5px] leading-relaxed text-site-muted">{v.description}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </Section>
      )}
      <LeaderMessage />
      {!story.length && !a.mission && !a.values.length && !a.leaderMessage && (
        <Section>
          <SiteEmpty icon={Compass} title="Our story is coming soon" description="The school is still writing this page. Get in touch to learn more in the meantime." action={<SiteLink to="/contact" className={siteButton('primary', 'sm')}>Contact us</SiteLink>} />
        </Section>
      )}
      <ApplyCta />
    </>
  );
}

// ------------------------------------------------------------------ academics

export function AcademicsPage() {
  const { site } = useSite();
  const a = site.settings.academics;
  useSiteTitle('Academics', a.intro.slice(0, 160) || undefined);
  const byStage = React.useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of site.classes) {
      const k = c.stage || 'Classes';
      m.set(k, [...(m.get(k) ?? []), c.level]);
    }
    return [...m.entries()];
  }, [site.classes]);
  return (
    <>
      <PageIntro eyebrow="Academics" title="Teaching that brings out the best in every child" description={a.intro || undefined} />
      {a.programmes.length > 0 && (
        <Section>
          <SectionHeading eyebrow="Programmes" title="Stages of learning" />
          <div className="grid gap-5 md:grid-cols-2 [&>*]:min-w-0">
            {a.programmes.map((p, i) => (
              <Reveal key={i} delay={i * 0.04}>
                <SiteCard className="flex h-full gap-5 p-6 sm:p-7">
                  <span className="site-h grid size-11 shrink-0 place-items-center rounded-site bg-site text-[15px] font-semibold text-site-on tabular">{i + 1}</span>
                  <div className="min-w-0">
                    <p className="site-h text-[19px] font-semibold text-site-ink">{p.title}</p>
                    <p className="mt-2 text-[15px] leading-relaxed text-site-muted">{p.description}</p>
                  </div>
                </SiteCard>
              </Reveal>
            ))}
          </div>
        </Section>
      )}
      {a.highlights.length > 0 && (
        <Section tone="soft">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.4fr] [&>*]:min-w-0">
            <SectionHeading eyebrow="Highlights" title="Why families choose us" className="mb-0" />
            <ul className="grid gap-3 sm:grid-cols-2">
              {a.highlights.map((h, i) => (
                <li key={i} className="flex items-start gap-3 rounded-site bg-white p-4 text-[15px] font-medium text-site-ink shadow-[0_1px_2px_rgb(16_24_40/0.05)]">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-site text-site-on">
                    <Check className="size-3.5" aria-hidden />
                  </span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}
      {(byStage.length > 0 || site.subjects.length > 0) && (
        <Section>
          <div className="grid gap-12 lg:grid-cols-2 [&>*]:min-w-0">
            {byStage.length > 0 && (
              <div>
                <SectionHeading eyebrow="Classes" title="Classes we offer" className="mb-6" />
                <div className="space-y-4">
                  {byStage.map(([stage, levels]) => (
                    <div key={stage} className="flex flex-col gap-2 border-b border-site-line pb-4 sm:flex-row sm:items-center sm:gap-6">
                      <p className="w-44 shrink-0 text-[14px] font-semibold text-site-ink">{stage}</p>
                      <div className="flex flex-wrap gap-2">
                        {levels.map((l) => (
                          <Chip key={l} tone="outline">
                            {l}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {site.subjects.length > 0 && (
              <div>
                <SectionHeading eyebrow="Subjects" title="What we teach" className="mb-6" />
                <div className="flex flex-wrap gap-2">
                  {site.subjects.map((s) => (
                    <Chip key={s}>{s}</Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Section>
      )}
      {!a.intro && !a.programmes.length && !site.classes.length && (
        <Section>
          <SiteEmpty icon={Layers} title="Academic details coming soon" description="Contact the school to ask about classes and subjects." />
        </Section>
      )}
      <ApplyCta />
    </>
  );
}

// ------------------------------------------------------------------ FAQ

export function FaqPage() {
  const { site } = useSite();
  useSiteTitle('Frequently asked questions');
  const faq = site.settings.faq;
  const [open, setOpen] = React.useState<number | null>(0);
  return (
    <>
      <PageIntro eyebrow="FAQ" title="Questions parents ask" description="Quick answers about admissions, fees, transport and school life. Can’t find yours? Get in touch." />
      <Section>
        {faq.length === 0 ? (
          <SiteEmpty icon={HelpCircle} title="No questions yet" description="Ask us anything on the contact page." />
        ) : (
          <div className="mx-auto max-w-3xl divide-y divide-site-line rounded-site-lg border border-site-line bg-white">
            {faq.map((f, i) => {
              const on = open === i;
              return (
                <div key={i}>
                  <h3>
                    <button
                      type="button"
                      id={`faq-q-${i}`}
                      aria-expanded={on}
                      aria-controls={`faq-a-${i}`}
                      onClick={() => setOpen(on ? null : i)}
                      className="flex w-full items-center justify-between gap-4 px-5 py-5 text-left sm:px-7"
                    >
                      <span className="site-h text-[16.5px] font-semibold text-site-ink sm:text-[17.5px]">{f.question}</span>
                      <span className={cn('grid size-8 shrink-0 place-items-center rounded-full border border-site-line text-site-muted transition-[transform,background-color,color]', on && 'rotate-180 border-transparent bg-site text-site-on')}>
                        <ChevronDown className="size-4" aria-hidden />
                      </span>
                    </button>
                  </h3>
                  <div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} hidden={!on} className="px-5 pb-6 text-[15.5px] leading-relaxed text-site-muted sm:px-7">
                    {paragraphs(f.answer).map((p, j) => (
                      <p key={j} className={cn(j > 0 && 'mt-3')}>
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-10 text-center">
          <MoreLink to="/contact">Still have a question? Contact us</MoreLink>
        </div>
      </Section>
    </>
  );
}

// ------------------------------------------------------------------ fees

export function FeesPage() {
  useSiteTitle('School fees');
  const q = useSitePart<PublicFees>('/fees');
  const [level, setLevel] = React.useState(0);
  const fees = q.data;
  const cur = fees?.levels[level];
  return (
    <>
      <PageIntro eyebrow="Fees" title="School fees" description={fees ? `Fees per term for ${fees.term}. Optional items are charged only if your child takes them.` : 'What it costs to study with us, per term.'} />
      <Section>
        {q.error ? (
          <SiteError message={errorMessage(q.error)} onRetry={() => void q.refetch()} />
        ) : !fees ? (
          <div className="space-y-3">
            <Shimmer className="h-10 w-full max-w-lg" />
            <Shimmer className="h-64 w-full" />
          </div>
        ) : fees.levels.length === 0 ? (
          <SiteEmpty icon={Receipt} title="No fee schedule yet" description="The school hasn’t published fees for this term. Contact the bursary for details." />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[240px_1fr] [&>*]:min-w-0">
            <div role="tablist" aria-label="Class" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:mx-0 lg:flex-col lg:px-0">
              {fees.levels.map((l, i) => (
                <button
                  key={l.level}
                  role="tab"
                  type="button"
                  aria-selected={i === level}
                  onClick={() => setLevel(i)}
                  className={cn('shrink-0 rounded-site px-4 py-2.5 text-left text-[14px] font-medium transition-colors', i === level ? 'bg-site text-site-on' : 'bg-site-surface text-site-ink hover:bg-site-soft')}
                >
                  {l.level}
                </button>
              ))}
            </div>
            {cur && (
              <SiteCard className="overflow-hidden">
                <div className="flex flex-wrap items-end justify-between gap-3 border-b border-site-line p-5 sm:p-7">
                  <div>
                    <p className="text-[13px] font-medium text-site-muted">{cur.level} · {fees.term}</p>
                    <p className="site-h mt-1 text-[30px] font-semibold text-site-ink tabular">{formatMoney(cur.totalKobo, fees.currency)}</p>
                    <p className="text-[13px] text-site-muted">Compulsory fees per term</p>
                  </div>
                </div>
                {cur.items.length === 0 ? (
                  <p className="p-7 text-[14.5px] text-site-muted">No fees listed for this class yet.</p>
                ) : (
                  <ul className="divide-y divide-site-line">
                    {cur.items.map((it, i) => (
                      <li key={i} className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-7">
                        <span className="min-w-0 text-[15px] text-site-ink">
                          {it.name}
                          {it.optional && (
                            <Chip tone="outline" className="ml-2 py-0.5">
                              Optional
                            </Chip>
                          )}
                        </span>
                        <span className="shrink-0 text-[15px] font-medium text-site-ink tabular">{formatMoney(it.amountKobo, fees.currency)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </SiteCard>
            )}
          </div>
        )}
      </Section>
    </>
  );
}
