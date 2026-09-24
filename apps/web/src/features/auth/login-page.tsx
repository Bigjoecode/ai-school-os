import { loginSchema } from '@aischool/shared';
import { zodResolver } from '@hookform/resolvers/zod';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, BrainCircuit, Building2, ChevronDown, Eye, EyeOff, ShieldCheck, Zap } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router';
import type { z } from 'zod';
import { AiSparkle } from '@/components/ai/ai-sparkle';
import { BrandMark } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError, errorMessage } from '@/lib/api';
import { applyServerErrors, emptyToUndefined } from '@/lib/forms';
import { useDocumentTitle } from '@/lib/hooks';
import { useLogin } from './session';

type LoginValues = z.input<typeof loginSchema>;

const VALUE_PROPS = [
  { icon: BrainCircuit, title: 'AI at the centre', text: 'Assistants for leaders, teachers, parents and students.' },
  { icon: Zap, title: 'Every module, one system', text: 'Academics, finance, people and operations — connected.' },
  { icon: ShieldCheck, title: 'Secure by design', text: 'Granular roles, full audit trail, per-school isolation.' },
];

// Accounts in the Greenfield demo school. The platform owner exists only in a
// locally seeded database, so it is never advertised on a deployed site.
const DEMOS = [
  { label: 'School admin', email: 'admin@greenfield.demo', password: 'Greenfield#2026', school: 'greenfield' },
  { label: 'Principal', email: 'principal@greenfield.demo', password: 'Greenfield#2026', school: 'greenfield' },
  { label: 'Parent (two schools)', email: 'parent@greenfield.demo', password: 'Greenfield#2026', school: '' },
  ...(import.meta.env.DEV
    ? [{ label: 'Platform owner (local)', email: 'owner@aischool.os', password: 'AiSchoolOS#2026', school: '' }]
    : []),
];

function BrandPanel() {
  return (
    <div className="relative hidden overflow-hidden bg-[#050918] text-white lg:flex lg:flex-col">
      {/* gradient mesh */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="animate-orb absolute -left-[10%] -top-[10%] size-[520px] rounded-full bg-[#4f46e5]/40 blur-[120px]" />
        <div
          className="animate-orb absolute -right-[15%] top-[25%] size-[460px] rounded-full bg-[#7c3aed]/35 blur-[120px]"
          style={{ animationDelay: '-6s' }}
        />
        <div
          className="animate-orb absolute -bottom-[15%] left-[20%] size-[420px] rounded-full bg-[#06b6d4]/25 blur-[120px]"
          style={{ animationDelay: '-12s' }}
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgb(255_255_255/0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      </div>

      <div className="relative flex flex-1 flex-col justify-between p-12 xl:p-16">
        <div className="flex items-center gap-3">
          <BrandMark className="size-10" />
          <span className="font-display text-lg font-semibold tracking-tight">
            AI School <span className="text-ai-gradient">OS</span>
          </span>
        </div>

        <div className="max-w-lg">
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="font-display text-[44px] font-semibold leading-[1.05] tracking-[-0.03em] xl:text-[52px]"
          >
            The intelligent operating system for <span className="text-ai-gradient">modern schools.</span>
          </motion.h1>
          <ul className="mt-10 space-y-5">
            {VALUE_PROPS.map((v, i) => (
              <motion.li
                key={v.title}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="flex gap-4"
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5">
                  <v.icon className="size-[18px] text-[#a5b4fc]" />
                </span>
                <span>
                  <span className="block text-[15px] font-medium">{v.title}</span>
                  <span className="block text-[14px] text-white/55">{v.text}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* floating AI insight card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="animate-float ai-border max-w-sm self-end rounded-2xl border border-white/10 bg-white/[0.06] p-5 shadow-[0_20px_60px_-15px_rgba(79,70,229,0.5)] backdrop-blur-xl"
        >
          <div className="flex items-center gap-2 text-[12px] font-medium text-white/70">
            <AiSparkle className="size-4" />
            AI School Intelligence
          </div>
          <p className="mt-3 text-[14.5px] font-medium leading-snug">JSS 2B is at 96% capacity — consider opening a new arm next term.</p>
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <div className="h-full w-[96%] rounded-full bg-ai-gradient" />
            </div>
            <span className="font-mono text-[12px] text-white/60">96%</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  useDocumentTitle('Sign in');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const login = useLogin();
  const [showSchool, setShowSchool] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginValues, unknown, z.output<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', school: undefined },
  });
  const { register, handleSubmit, formState, setValue, setError } = form;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    login.mutate(values, {
      onSuccess: () => navigate(from === '/login' ? '/' : from, { replace: true }),
      onError: (err) => {
        if (!applyServerErrors(err, setError)) {
          setFormError(
            err instanceof ApiError && err.status === 401 ? 'That email and password combination didn’t work.' : errorMessage(err),
          );
        }
      },
    });
  });

  const fillDemo = (d: (typeof DEMOS)[number]) => {
    setValue('email', d.email, { shouldValidate: true });
    setValue('password', d.password, { shouldValidate: true });
    setValue('school', d.school || undefined);
    setShowSchool(!!d.school);
    setFormError(null);
  };

  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[1.1fr_1fr]">
      <BrandPanel />
      <div className="relative flex flex-col">
        <div className="flex items-center justify-between p-5 sm:p-6">
          <div className="flex items-center gap-2.5 lg:invisible">
            <BrandMark />
            <span className="font-display text-[15px] font-semibold tracking-tight">
              AI School <span className="text-ai-gradient">OS</span>
            </span>
          </div>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center px-5 pb-10 sm:px-8">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-[400px]"
          >
            <h2 className="font-display text-[28px] font-semibold tracking-tight">Welcome back</h2>
            <p className="mt-1.5 text-[14px] text-muted-foreground">Sign in to your school’s workspace.</p>

            <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
              <Field label="Email" htmlFor="email" error={formState.errors.email?.message}>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@school.edu"
                  autoFocus
                  invalid={!!formState.errors.email}
                  {...register('email')}
                />
              </Field>
              <Field label="Password" htmlFor="password" error={formState.errors.password?.message}>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••••"
                    className="pr-10"
                    invalid={!!formState.errors.password}
                    {...register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </Field>

              <div>
                <button
                  type="button"
                  onClick={() => setShowSchool((v) => !v)}
                  className="flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
                  aria-expanded={showSchool}
                  aria-controls="school-field"
                >
                  <Building2 className="size-3.5" />
                  Signing in to a specific school?
                  <ChevronDown className={`size-3.5 transition-transform ${showSchool ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {showSchool && (
                    <motion.div
                      id="school-field"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <Field
                        label="School ID"
                        htmlFor="school"
                        error={formState.errors.school?.message}
                        hint="Your school’s short ID, e.g. greenfield"
                        className="px-0.5 pb-0.5 pt-3"
                      >
                        <Input
                          id="school"
                          placeholder="greenfield"
                          autoCapitalize="none"
                          invalid={!!formState.errors.school}
                          {...register('school', { setValueAs: (v: string) => emptyToUndefined(v?.trim()) })}
                        />
                      </Field>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {formError && (
                <p role="alert" className="rounded-lg border border-danger/20 bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">
                  {formError}
                </p>
              )}

              <Button type="submit" size="lg" className="w-full" loading={login.isPending}>
                Sign in <ArrowRight />
              </Button>
            </form>

            <div className="mt-8 rounded-2xl border border-dashed border-border bg-muted/40 p-4">
              <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                <AiSparkle className="size-3.5" animated={false} /> Demo accounts
              </p>
              <div className="mt-3 space-y-2">
                {DEMOS.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={() => fillDemo(d)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5 text-left shadow-xs transition-all hover:border-border-strong hover:shadow-soft"
                  >
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-medium">{d.label}</span>
                      <span className="block truncate font-mono text-[11.5px] text-muted-foreground">
                        {d.email} · {d.password}
                        {d.school && ` · ${d.school}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11.5px] font-medium text-brand">Use</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
        <p className="pb-6 text-center text-[12px] text-muted-foreground">© {new Date().getFullYear()} AI School OS</p>
      </div>
    </div>
  );
}
