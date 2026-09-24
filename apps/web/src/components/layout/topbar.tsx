import { ChevronRight, Menu, Search } from 'lucide-react';
import { useLocation } from 'react-router';
import { matchNav } from '@/app/navigation';
import { useUiStore } from '@/lib/ui-store';
import { AiSparkle } from '../ai/ai-sparkle';
import { Button } from '../ui/button';
import { Kbd, modKey } from '../ui/kbd';
import { Notifications } from './notifications';
import { ThemeToggle } from './theme-toggle';
import { UserMenu } from './user-menu';

export function Topbar() {
  const { pathname, search } = useLocation();
  const setCommandOpen = useUiStore((s) => s.setCommandOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);
  const match = matchNav(pathname, search);
  const group = match?.group;
  const title = match?.label ?? (pathname.startsWith('/settings') ? 'Settings' : 'AI School OS');

  return (
    <header className="glass sticky print:hidden top-0 z-20 border-b border-border/80">
      <div className="flex h-14 items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="icon"
          className="-ml-2 lg:hidden"
          aria-label="Open navigation"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu />
        </Button>

        <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
          {group && (
            <>
              <span className="truncate text-muted-foreground">{group}</span>
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" aria-hidden />
            </>
          )}
          <span className="truncate font-medium text-foreground" aria-current="page">
            {title}
          </span>
        </nav>

        <div className="flex min-w-0 flex-1 justify-center md:justify-end lg:justify-center">
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="group flex h-9 w-full max-w-[440px] items-center gap-2.5 rounded-xl border border-border bg-card/80 px-3 text-left text-[13px] text-muted-foreground shadow-xs transition-all hover:border-border-strong hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Search or ask AI"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1 truncate">
              Search or <span className="font-medium text-ai-gradient">ask AI</span>…
            </span>
            <AiSparkle className="size-3.5 opacity-80 transition-opacity group-hover:opacity-100" />
            <span className="hidden items-center gap-0.5 sm:flex">
              <Kbd>{modKey}</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Notifications />
          <ThemeToggle />
          <div className="ml-1.5">
            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  );
}
