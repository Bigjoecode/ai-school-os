import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import {
  Award,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  QrCode,
  ScanLine,
  Wand2,
  ClipboardList,
  FileQuestionMark,
  FileText,
  Briefcase,
  CornerDownLeft,
  GraduationCap,
  LogOut,
  NotebookPen,
  Presentation,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  Users,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { visibleNav } from '@/app/navigation';
import { useSignOut } from '@/features/auth/session';
import { hasPermission, useMe } from '@/lib/auth-store';
import { useThemeStore } from '@/lib/theme';
import { useUiStore } from '@/lib/ui-store';
import { cn } from '@/lib/utils';
import { AiSparkle } from '../ai/ai-sparkle';
import { DialogOverlay } from '../ui/dialog';
import { Kbd } from '../ui/kbd';

const itemClass =
  'group flex cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] text-foreground outline-none transition-colors data-[selected=true]:bg-muted data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50';

const groupClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[10.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.08em] [&_[cmdk-group-heading]]:text-muted-foreground/80';

function IconBox({ children, ai }: { children: ReactNode; ai?: boolean }) {
  return (
    <span
      className={cn(
        'grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs group-data-[selected=true]:text-foreground [&_svg]:size-4',
        ai && 'ai-border border-transparent',
      )}
    >
      {children}
    </span>
  );
}

export function CommandPalette() {
  const open = useUiStore((s) => s.commandOpen);
  const setOpen = useUiStore((s) => s.setCommandOpen);
  const me = useMe();
  const navigate = useNavigate();
  const signOut = useSignOut();
  const resolved = useThemeStore((s) => s.resolved);
  const toggleTheme = useThemeStore((s) => s.toggle);
  const [query, setQuery] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useUiStore.getState().commandOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const navItems = useMemo(() => visibleNav(me).flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))), [me]);
  const canAi = hasPermission(me, 'ai.use');

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const actions = [
    hasPermission(me, 'students.manage') && {
      id: 'admit',
      label: 'Admit student',
      icon: <GraduationCap />,
      keywords: 'new add enrol student',
      onSelect: () => navigate('/students?new=1'),
    },
    hasPermission(me, 'guardians.manage') && {
      id: 'parent',
      label: 'Add parent',
      icon: <Users />,
      keywords: 'guardian new',
      onSelect: () => navigate('/parents?new=1'),
    },
    hasPermission(me, 'staff.manage') && {
      id: 'staff',
      label: 'Add staff',
      icon: <Briefcase />,
      keywords: 'teacher employee new',
      onSelect: () => navigate('/staff?new=1'),
    },
    canAi &&
      hasPermission(me, 'curriculum.manage') && {
        id: 'gen-curriculum',
        label: 'Generate a curriculum',
        icon: <BookOpen />,
        keywords: 'ai new curriculum syllabus create',
        onSelect: () => navigate('/curriculum?new=1'),
      },
    canAi &&
      hasPermission(me, 'curriculum.manage') && {
        id: 'gen-scheme',
        label: 'Generate a scheme of work',
        icon: <NotebookPen />,
        keywords: 'ai new scheme termly plan create',
        onSelect: () => navigate('/schemes?new=1'),
      },
    canAi &&
      hasPermission(me, 'lessons.manage') && {
        id: 'plan-lesson',
        label: 'Plan a lesson with AI',
        icon: <Presentation />,
        keywords: 'ai new lesson plan note create teacher',
        onSelect: () => navigate('/lessons?new=1'),
      },
    canAi &&
      hasPermission(me, 'assessment.manage') && {
        id: 'gen-questions',
        label: 'Generate questions with AI',
        icon: <FileQuestionMark />,
        keywords: 'ai new question bank objective theory quiz create',
        onSelect: () => navigate('/questions?new=1'),
      },
    hasPermission(me, 'assessment.manage') && {
      id: 'build-paper',
      label: 'Build an exam paper',
      icon: <FileText />,
      keywords: 'exam test paper new create assessment',
      onSelect: () => navigate('/exams?new=1'),
    },
    hasPermission(me, 'results.enter') && {
      id: 'enter-scores',
      label: 'Enter scores',
      icon: <ClipboardList />,
      keywords: 'results marks ca exam score sheet grades',
      onSelect: () => navigate('/results'),
    },
    canAi &&
      hasPermission(me, 'results.read') && {
        id: 'draft-remarks',
        label: 'Draft report card remarks',
        icon: <Award />,
        keywords: 'ai report card teacher remark comments',
        onSelect: () => navigate('/report-cards?remarks=1'),
      },
    hasPermission(me, 'timetable.read') && {
      id: 'open-timetable',
      label: 'Open timetable',
      icon: <CalendarClock />,
      keywords: 'timetable schedule periods today class teacher room',
      onSelect: () => navigate('/timetable'),
    },
    hasPermission(me, 'timetable.manage') && {
      id: 'gen-timetable',
      label: 'Generate a timetable',
      icon: <Wand2 />,
      keywords: 'timetable new build solver schedule create',
      onSelect: () => navigate('/timetable?new=1'),
    },
    canAi &&
      hasPermission(me, 'timetable.manage') && {
        id: 'timetable-assistant',
        label: 'Timetable assistant (AI)',
        icon: <AiSparkle />,
        keywords: 'ai timetable constraints availability periods teacher change',
        onSelect: () => navigate('/timetable/setup?tab=assistant'),
      },
    hasPermission(me, 'attendance.read') && {
      id: 'take-register',
      label: 'Take register',
      icon: <ClipboardCheck />,
      keywords: 'attendance register roll call mark present absent late class',
      onSelect: () => navigate('/attendance?tab=register'),
    },
    hasPermission(me, 'attendance.read') && {
      id: 'attendance-today',
      label: 'Attendance today',
      icon: <CalendarCheck />,
      keywords: 'attendance today absent absentees registers taken staff',
      onSelect: () => navigate('/attendance'),
    },
    hasPermission(me, 'attendance.manage') && {
      id: 'kiosk',
      label: 'Open check-in kiosk',
      icon: <QrCode />,
      keywords: 'attendance kiosk qr code staff check in reception screen',
      onSelect: () => navigate('/attendance/kiosk'),
    },
    !!me?.tenant && {
      id: 'check-in',
      label: 'Check in / out',
      icon: <ScanLine />,
      keywords: 'attendance staff check in out clock arrive leave scan qr',
      onSelect: () => navigate('/check-in'),
    },
    hasPermission(me, 'roles.manage') && {
      id: 'role',
      label: 'Create role',
      icon: <ShieldCheck />,
      keywords: 'permissions rbac new',
      onSelect: () => navigate('/settings/roles?new=1'),
    },
    {
      id: 'theme',
      label: resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      icon: resolved === 'dark' ? <Sun /> : <Moon />,
      keywords: 'toggle theme dark light mode appearance',
      onSelect: toggleTheme,
    },
    {
      id: 'signout',
      label: 'Sign out',
      icon: <LogOut />,
      keywords: 'logout log out exit',
      onSelect: () => void signOut(),
    },
  ].filter(Boolean) as { id: string; label: string; icon: ReactNode; keywords: string; onSelect: () => void }[];

  const trimmed = query.trim();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogOverlay />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-[12dvh] z-50 w-[calc(100%-24px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-pop outline-none data-[state=open]:animate-[dialog-in_200ms_cubic-bezier(0.16,1,0.3,1)]"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Search or ask AI</DialogPrimitive.Title>
          <Command label="Command menu" loop className="flex max-h-[min(560px,76dvh)] flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-[18px] shrink-0 text-muted-foreground" aria-hidden />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Search pages, run actions or ask AI…"
                className="h-14 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
              />
              <Kbd className="hidden sm:inline-flex">Esc</Kbd>
            </div>
            <Command.List className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
              <Command.Empty className="px-4 py-10 text-center text-[13px] text-muted-foreground">
                No matches. Press Enter on “Ask School AI” to ask instead.
              </Command.Empty>

              {canAi && (
                <Command.Group heading="Ask AI" className={groupClass} forceMount>
                  <Command.Item
                    value={`ask-ai ${trimmed}`}
                    forceMount
                    onSelect={() =>
                      run(() =>
                        navigate(trimmed ? `/ai?agent=school&q=${encodeURIComponent(trimmed)}` : '/ai?agent=school'),
                      )
                    }
                    className={itemClass}
                  >
                    <IconBox ai>
                      <AiSparkle />
                    </IconBox>
                    <span className="min-w-0 flex-1 truncate">
                      {trimmed ? (
                        <>
                          <span className="font-medium text-ai-gradient">Ask School AI:</span>{' '}
                          <span className="text-foreground">{trimmed}</span>
                        </>
                      ) : (
                        <span className="font-medium text-ai-gradient">Ask School AI anything…</span>
                      )}
                    </span>
                    <CornerDownLeft className="size-3.5 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
                  </Command.Item>
                </Command.Group>
              )}

              <Command.Group heading="Navigate" className={groupClass}>
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item
                      key={item.to}
                      value={`${item.label} ${item.group ?? ''} ${item.to}`}
                      keywords={item.keywords ? item.keywords.split(' ') : undefined}
                      onSelect={() => run(() => navigate(item.to))}
                      className={itemClass}
                    >
                      <IconBox>
                        <Icon />
                      </IconBox>
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.group && <span className="hidden text-[12px] text-muted-foreground sm:inline">{item.group}</span>}
                      {item.soon && (
                        <span className="rounded-full border border-border px-1.5 text-[10px] leading-4 text-muted-foreground">Soon</span>
                      )}
                      <ArrowRight className="size-3.5 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
                    </Command.Item>
                  );
                })}
              </Command.Group>

              <Command.Group heading="Actions" className={groupClass}>
                {actions.map((a) => (
                  <Command.Item
                    key={a.id}
                    value={a.label}
                    keywords={a.keywords.split(' ')}
                    onSelect={() => run(a.onSelect)}
                    className={itemClass}
                  >
                    <IconBox>{a.icon}</IconBox>
                    <span className="min-w-0 flex-1 truncate">{a.label}</span>
                    <CornerDownLeft className="size-3.5 text-muted-foreground opacity-0 group-data-[selected=true]:opacity-100" />
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
            <div className="hidden items-center gap-4 border-t border-border bg-muted/40 px-4 py-2.5 text-[11.5px] text-muted-foreground sm:flex">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> Navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> Select
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>Esc</Kbd> Close
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <AiSparkle className="size-3" animated={false} /> AI-powered search
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
