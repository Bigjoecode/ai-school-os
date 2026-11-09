import { htmlFacts, htmlPreviewDoc } from '@aischool/shared';
import { Globe, Lock } from 'lucide-react';
import { useDeferredValue, useMemo } from 'react';
import { CodeEditor } from './editor';

/**
 * The live preview. `sandbox=""` gives the frame a unique origin with scripts,
 * forms, pop-ups and top-level navigation all off; the document is rebuilt by
 * `htmlPreviewDoc` from an allow-list, under a CSP that blocks every request.
 */
export function HtmlPreview({ source, fileName }: { source: string; fileName: string }) {
  const shown = useDeferredValue(source);
  const doc = useMemo(() => htmlPreviewDoc(shown), [shown]);
  const title = useMemo(() => htmlFacts(shown).title, [shown]);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted/50">
      <div className="flex items-end gap-1 px-2 pt-1.5">
        <span data-cc="tab-title" className="inline-flex max-w-[70%] items-center gap-1.5 truncate rounded-t-md bg-card px-2.5 py-1 text-[12px]">
          <Globe className="size-3 shrink-0 text-muted-foreground" aria-hidden /> {title || fileName}
        </span>
      </div>
      <div className="flex items-center gap-1.5 bg-card px-2 py-1 text-[11.5px] text-muted-foreground">
        <Lock className="size-3 shrink-0" aria-hidden />
        <span className="truncate">file:///C:/Users/Student/{fileName}</span>
      </div>
      <iframe title="Page preview" data-cc="preview" sandbox="" referrerPolicy="no-referrer" srcDoc={doc} className="block h-56 w-full border-0 bg-white" />
    </div>
  );
}

export function HtmlLab({ source, fileName, onChange, readOnly }: { source: string; fileName: string; onChange: (v: string) => void; readOnly: boolean }) {
  const problems = useMemo(() => htmlFacts(source).problems, [source]);
  return (
    <div className="grid gap-3 lg:grid-cols-2 [&>*]:min-w-0">
      <CodeEditor value={source} onChange={onChange} lang="html" readOnly={readOnly} label="HTML editor" rows={13} />
      <div className="space-y-2">
        <HtmlPreview source={source} fileName={fileName} />
        {problems.length > 0 && (
          <ul className="list-disc rounded-xl bg-warning-soft py-2 pl-6 pr-2 text-[12.5px] text-warning" data-cc="html-problems">
            {problems.slice(0, 3).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-muted-foreground">This preview runs no scripts and reaches no network. Links look like links here but do not open.</p>
      </div>
    </div>
  );
}
