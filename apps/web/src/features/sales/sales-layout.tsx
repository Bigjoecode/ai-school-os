import { Check, Copy, Mail, MessageCircle, Phone, Printer, Share2 } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';
import { toast } from 'sonner';
import { BrandMark } from '@/components/layout/brand';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { SALES_CONTACT, SALES_PAGES, SIGNUP_PATH, isPlaceholder, showContact, whatsappLink } from './config';
import { OG_IMAGE, seoFor } from './seo-data';

/** Title, description and Open Graph tags in the live document (the static copies carry them for crawlers). */
export function useSalesSeo(path: string) {
  useEffect(() => {
    const seo = seoFor(path);
    const prevTitle = document.title;
    document.title = seo.title;
    const set = (attr: 'name' | 'property', key: string, value: string) => {
      let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
      const created = !el;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      const prev = el.content;
      el.content = value;
      return () => (created ? el!.remove() : (el!.content = prev));
    };
    const url = window.location.origin + seo.path;
    const undo = [
      set('name', 'description', seo.description),
      set('property', 'og:title', seo.title),
      set('property', 'og:description', seo.description),
      set('property', 'og:url', url),
      set('property', 'og:image', window.location.origin + OG_IMAGE),
      set('name', 'twitter:card', 'summary_large_image'),
    ];
    return () => {
      document.title = prevTitle;
      undo.forEach((f) => f());
    };
  }, [path]);
}

/** Share the current page: the phone's share sheet when there is one, otherwise WhatsApp / copy link. */
export function ShareButton({ path, text, className, size = 'sm' }: { path?: string; text?: string; className?: string; size?: 'sm' | 'default' }) {
  const location = useLocation();
  const seo = seoFor(path ?? location.pathname);
  const url = window.location.origin + (path ?? location.pathname + location.search);
  const message = text ?? `${seo.title} — ${seo.description}`;
  const [copied, setCopied] = useState(false);
  const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Link copied');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy the link — copy it from the address bar');
    }
  };

  if (canNativeShare) {
    return (
      <Button
        variant="outline"
        size={size}
        className={cn('print:hidden', className)}
        onClick={() => void navigator.share({ title: seo.title, text: message, url }).catch(() => undefined)}
      >
        <Share2 /> Share
      </Button>
    );
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size={size} className={cn('print:hidden', className)}>
          <Share2 /> Share
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2">
        <a
          href={whatsappLink(`${message}\n${url}`)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13.5px] hover:bg-muted"
        >
          <MessageCircle className="size-4 text-success" aria-hidden /> Share on WhatsApp
        </a>
        <a
          href={`mailto:?subject=${encodeURIComponent(seo.title)}&body=${encodeURIComponent(`${message}\n\n${url}`)}`}
          className="flex items-center gap-2 rounded-md px-2.5 py-2 text-[13.5px] hover:bg-muted"
        >
          <Mail className="size-4 text-info" aria-hidden /> Send by email
        </a>
        <button type="button" onClick={() => void copy()} className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13.5px] hover:bg-muted">
          {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4 text-muted-foreground" aria-hidden />} Copy link
        </button>
      </PopoverContent>
    </Popover>
  );
}

export function PrintButton({ label = 'Print or save as PDF' }: { label?: string }) {
  return (
    <Button variant="outline" size="sm" className="print:hidden" onClick={() => window.print()}>
      <Printer /> <span className="hidden sm:inline">{label}</span>
      <span className="sm:hidden">PDF</span>
    </Button>
  );
}

/** "Book a demo" options from config.ts; only the ones filled in (placeholders show in development). */
export function DemoContacts({ className, compact }: { className?: string; compact?: boolean }) {
  const demoText = 'Hello, I would like to book a demo of AI School OS for my school.';
  const items = [
    showContact(SALES_CONTACT.whatsapp) && {
      key: 'wa',
      icon: MessageCircle,
      label: 'WhatsApp',
      value: isPlaceholder(SALES_CONTACT.whatsapp) ? SALES_CONTACT.whatsapp : `+${SALES_CONTACT.whatsapp.replace(/\D/g, '')}`,
      href: whatsappLink(demoText, SALES_CONTACT.whatsapp),
    },
    showContact(SALES_CONTACT.phone) && {
      key: 'phone',
      icon: Phone,
      label: 'Call',
      value: SALES_CONTACT.phone,
      href: `tel:${SALES_CONTACT.phone.replace(/[^\d+]/g, '')}`,
    },
    showContact(SALES_CONTACT.email) && {
      key: 'email',
      icon: Mail,
      label: 'Email',
      value: SALES_CONTACT.email,
      href: `mailto:${SALES_CONTACT.email}?subject=${encodeURIComponent('Demo of AI School OS')}&body=${encodeURIComponent(demoText)}`,
    },
  ].filter(Boolean) as { key: string; icon: typeof Phone; label: string; value: string; href: string }[];

  if (items.length === 0) {
    return (
      <p className={cn('text-[13.5px] text-muted-foreground', className)}>
        To book a demo, <Link to={SIGNUP_PATH} className="font-medium text-brand underline-offset-4 hover:underline">sign up your school</Link> and ask us from the
        Support page inside the app.
      </p>
    );
  }
  return (
    <ul className={cn('grid gap-2', compact ? 'sm:grid-cols-3' : 'sm:grid-cols-3', className)}>
      {items.map(({ key, icon: Icon, label, value, href }) => (
        <li key={key}>
          <a
            href={href}
            target={key === 'wa' ? '_blank' : undefined}
            rel={key === 'wa' ? 'noopener noreferrer' : undefined}
            className="flex h-full items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 transition-colors hover:border-border-strong"
          >
            <Icon className="size-5 shrink-0 text-brand" aria-hidden />
            <span className="min-w-0">
              <span className="block text-[12px] text-muted-foreground">{label}</span>
              <span className="block truncate text-[14px] font-semibold">{value}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Public chrome for the sales pages: no sign-in needed. */
export function SalesLayout({ path, children, actions, wide }: { path: string; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  useSalesSeo(path);
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="min-h-dvh bg-background text-foreground print:min-h-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-20 border-b border-border bg-background/90 pt-[env(safe-area-inset-top)] backdrop-blur print:hidden">
        <div className={cn('mx-auto flex items-center justify-between gap-2 px-4 py-2.5', wide ? 'max-w-6xl' : 'max-w-5xl')}>
          <Link to="/for-schools" className="flex min-w-0 items-center gap-2.5" aria-label="AI School OS — for schools">
            <BrandMark className="size-7" />
            <span className="hidden font-display text-[15px] font-semibold tracking-tight min-[400px]:inline">
              AI School <span className="text-ai-gradient">OS</span>
            </span>
          </Link>
          <div className="flex items-center gap-1.5">
            {actions}
            <ThemeToggle />
            <Button asChild variant="brand" size="sm">
              <Link to={SIGNUP_PATH}>Sign up</Link>
            </Button>
          </div>
        </div>
        <nav aria-label="Sales kit" className={cn('no-scrollbar mx-auto flex gap-1 overflow-x-auto px-4 pb-2', wide ? 'max-w-6xl' : 'max-w-5xl')}>
          {SALES_PAGES.map((p) => (
            <NavLink
              key={p.to}
              to={p.to}
              end
              className={({ isActive }) =>
                cn(
                  'shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
                  isActive ? 'bg-brand-soft text-brand' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )
              }
            >
              {p.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="border-t border-border py-6 text-[12.5px] text-muted-foreground print:hidden">
        <div className={cn('mx-auto flex flex-wrap items-center justify-between gap-3 px-4', wide ? 'max-w-6xl' : 'max-w-5xl')}>
          <span>© {new Date().getFullYear()} AI School OS</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <Link to="/legal" className="hover:text-foreground">
              Privacy & legal
            </Link>
            <Link to="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link to={SIGNUP_PATH} className="hover:text-foreground">
              Sign up
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
