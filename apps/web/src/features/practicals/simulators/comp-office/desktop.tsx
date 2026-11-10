import { CO_APP_LABEL, type CoApp } from '@aischool/shared';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import type { Office } from './actions';
import { DbApp } from './app-db';
import { DeckApp } from './app-deck';
import { DocApp } from './app-doc';
import { FilesApp } from './app-files';
import { BrowserApp, CloudApp, MailApp } from './app-net';
import { SheetApp } from './app-sheet';

/** The computer's screen: the open application in a window, and a taskbar when the practical uses two. */

const APPS: Record<CoApp, (p: { o: Office }) => React.JSX.Element> = { sheet: SheetApp, doc: DocApp, db: DbApp, deck: DeckApp, files: FilesApp, browser: BrowserApp, mail: MailApp, cloud: CloudApp };
const FILE_NAME = (o: Office, a: CoApp) => (a === 'sheet' ? o.s.sheet.file || 'Book1' : a === 'doc' ? o.s.doc.saved?.name || 'Document1' : a === 'db' ? o.s.db.file || 'Database' : a === 'deck' ? o.s.deck.saved || 'Presentation1' : '');

export function Desktop({ o, app: wanted, className }: { o: Office; app?: CoApp; className?: string }) {
  const [app, setApp] = useState<CoApp>(wanted ?? o.v.apps[0]!);
  useEffect(() => setApp(wanted ?? o.v.apps[0]!), [wanted, o.task]); // eslint-disable-line react-hooks/exhaustive-deps
  const App = APPS[app];
  return (
    <div className={cn('relative flex h-[min(74dvh,640px)] min-h-[420px] flex-col overflow-hidden rounded-lg border-2 border-slate-800 bg-slate-800', className)} data-co-desktop>
      <div className="flex shrink-0 items-center gap-2 bg-slate-800 px-2 py-1 text-[12px] text-white">
        <span className="font-semibold">{CO_APP_LABEL[app]}</span>
        <span className="min-w-0 truncate text-white/70">{FILE_NAME(o, app)}</span>
      </div>
      <div className="relative min-h-0 flex-1 bg-white">
        <App key={app} o={o} />
      </div>
      {o.v.apps.length > 1 && (
        <div className="flex shrink-0 gap-1 bg-slate-900 p-1">
          {o.v.apps.map((a) => (
            <button key={a} type="button" aria-label={`Open ${CO_APP_LABEL[a]}`} aria-pressed={a === app} onClick={() => setApp(a)} className={cn('rounded px-2 py-1 text-[12px] text-white', a === app ? 'bg-blue-600' : 'bg-slate-700')}>
              {CO_APP_LABEL[a]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
