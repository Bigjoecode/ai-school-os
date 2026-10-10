import { cn } from '@/lib/utils';

/**
 * The learning loop, as the app runs it: teach → check (check-ins, homework, tests) → topic mastery
 * per student → class insights for the teacher → re-teach or move on; parents get the weekly update.
 */
export function LoopDiagram({ className }: { className?: string }) {
  const steps = [
    { x: 200, y: 46, title: 'Teach', sub: 'Modules, notes, workbook' },
    { x: 344, y: 150, title: 'Check', sub: 'Check-ins, homework, tests' },
    { x: 290, y: 300, title: 'Mastery', sub: 'Each topic, each student' },
    { x: 110, y: 300, title: 'Class insights', sub: 'Hard topics, who needs help' },
    { x: 56, y: 150, title: 'Re-teach', sub: 'or move on, with practice' },
  ];
  return (
    <svg
      viewBox="-20 12 440 326"
      role="img"
      aria-labelledby="loop-title loop-desc"
      className={cn('h-auto w-full max-w-[420px] text-foreground', className)}
    >
      <title id="loop-title">The learning loop</title>
      <desc id="loop-desc">
        Teach, then check understanding with check-ins, homework and tests. Each result updates the student's topic mastery. Class insights show the teacher the
        hardest topics and who needs help, so the teacher re-teaches or moves on. Parents get a weekly update from the same mastery data.
      </desc>
      <defs>
        <marker id="loop-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 10 5 0 10z" fill="var(--brand)" />
        </marker>
      </defs>
      <circle cx="200" cy="190" r="128" fill="none" stroke="var(--border-strong)" strokeWidth="2" strokeDasharray="4 6" />
      {[
        'M232 58 Q300 80 330 120',
        'M350 182 Q340 250 310 278',
        'M252 316 Q200 330 150 316',
        'M86 280 Q56 240 54 182',
        'M74 118 Q110 66 166 52',
      ].map((d) => (
        <path key={d} d={d} fill="none" stroke="var(--brand)" strokeWidth="2.5" markerEnd="url(#loop-arrow)" />
      ))}
      <g>
        <circle cx="200" cy="190" r="56" fill="var(--brand-soft)" stroke="var(--brand)" strokeWidth="1.5" />
        <text x="200" y="184" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
          Weekly parent
        </text>
        <text x="200" y="201" textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
          update
        </text>
        <text x="200" y="218" textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">
          from the same data
        </text>
      </g>
      {steps.map((s) => (
        <g key={s.title}>
          <rect x={s.x - 68} y={s.y - 24} width="136" height="48" rx="12" fill="var(--card)" stroke="var(--border-strong)" />
          <text x={s.x} y={s.y - 3} textAnchor="middle" fontSize="13" fontWeight="700" fill="currentColor">
            {s.title}
          </text>
          <text x={s.x} y={s.y + 13} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)">
            {s.sub}
          </text>
        </g>
      ))}
    </svg>
  );
}
