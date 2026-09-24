import { motion } from 'framer-motion';
import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router';
import { useUiStore } from '@/lib/ui-store';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../ui/sheet';
import { RouteLoader } from './boot-loader';
import { CommandPalette } from './command-palette';
import { SidebarContent, Sidebar } from './sidebar';
import { Topbar } from './topbar';

export function AppShell() {
  const location = useLocation();
  const mobileNavOpen = useUiStore((s) => s.mobileNavOpen);
  const setMobileNavOpen = useUiStore((s) => s.setMobileNavOpen);

  return (
    <div className="flex min-h-dvh w-full bg-background">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:shadow-pop"
      >
        Skip to content
      </a>
      <Sidebar />
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="bg-sidebar p-0 lg:hidden">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
          <SidebarContent onNavigate={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" className="min-w-0 flex-1">
          <Suspense fallback={<RouteLoader />}>
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <Outlet />
            </motion.div>
          </Suspense>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
