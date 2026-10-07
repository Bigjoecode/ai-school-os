import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

/**
 * Renders the legal documents' Markdown: headings, paragraphs, lists,
 * tables, blockquotes, rules, **bold**, *italic*, `code` and links.
 * Everything becomes React elements — no HTML injection is possible.
 * [PLACEHOLDER: …] markers are highlighted so reviewers can spot them.
 */
export function LegalMarkdown({ text, className }: { text: string; className?: string }) {
  return <div className={cn('legal-doc space-y-4 text-[14.5px] leading-relaxed text-foreground/90', className)}>{blocks(text)}</div>;
}

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'quote'; text: string }
  | { t: 'hr' };

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, '')
    .split('|')
    .map((c) => c.trim());

function parse(src: string): Block[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      out.push({ t: 'h', level: h[1]!.length, text: h[2]! });
      i++;
      continue;
    }
    if (/^-{3,}\s*$/.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (line.startsWith('>')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.startsWith('>')) buf.push(lines[i++]!.replace(/^>\s?/, ''));
      out.push({ t: 'quote', text: buf.join('\n') });
      continue;
    }
    if (line.trim().startsWith('|') && i + 1 < lines.length && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1]!)) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(cells(lines[i++]!));
      out.push({ t: 'table', head, rows });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/;
    const num = /^\s*(?:\d+[.)]|[a-z]\))\s+(.*)$/;
    if (bullet.test(line) || num.test(line)) {
      const kind = bullet.test(line) ? 'ul' : 'ol';
      const re = kind === 'ul' ? bullet : num;
      const items: string[] = [];
      while (i < lines.length && lines[i]!.trim()) {
        const m = re.exec(lines[i]!);
        if (m) items.push(m[1]!);
        else if (/^\s{2,}/.test(lines[i]!) && items.length) items[items.length - 1] += ` ${lines[i]!.trim()}`;
        else break;
        i++;
      }
      out.push({ t: kind, items });
      continue;
    }
    const buf: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !/^(#{1,4}\s|>|\s*[-*]\s|\s*\d+[.)]\s|\s*\|)/.test(lines[i]!)) buf.push(lines[i++]!.trim());
    if (!buf.length) buf.push(lines[i++]!.trim());
    out.push({ t: 'p', text: buf.join(' ') });
  }
  return out;
}

function blocks(src: string): ReactNode[] {
  return parse(src).map((b, k) => {
    switch (b.t) {
      case 'h': {
        const cls = ['', 'font-display text-[26px] font-semibold tracking-tight text-foreground', 'mt-8 font-display text-[19px] font-semibold tracking-tight text-foreground', 'mt-6 text-[16px] font-semibold text-foreground', 'mt-4 text-[14.5px] font-semibold text-foreground'][b.level];
        const id = b.text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        if (b.level === 1) return <h1 key={k} id={id} className={cls}>{inline(b.text)}</h1>;
        if (b.level === 2) return <h2 key={k} id={id} className={cls}>{inline(b.text)}</h2>;
        if (b.level === 3) return <h3 key={k} id={id} className={cls}>{inline(b.text)}</h3>;
        return <h4 key={k} id={id} className={cls}>{inline(b.text)}</h4>;
      }
      case 'hr':
        return <hr key={k} className="my-8 border-border" />;
      case 'quote':
        return (
          <div key={k} className="space-y-2 rounded-2xl border border-brand/25 bg-brand-soft/50 px-5 py-4 text-[14px]">
            {blocks(b.text)}
          </div>
        );
      case 'table':
        return (
          <div key={k} className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
              <thead className="bg-muted/60">
                <tr>
                  {b.head.map((c, j) => (
                    <th key={j} className="border-b border-border px-3 py-2 font-semibold text-foreground">
                      {inline(c)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r, j) => (
                  <tr key={j} className="align-top odd:bg-card even:bg-muted/20">
                    {r.map((c, m) => (
                      <td key={m} className="border-b border-border px-3 py-2">
                        {inline(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      case 'ul':
        return (
          <ul key={k} className="space-y-1.5 pl-1">
            {b.items.map((it, j) => (
              <li key={j} className="flex gap-2.5">
                <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-brand/70" />
                <span className="min-w-0">{inline(it)}</span>
              </li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={k} className="list-decimal space-y-1.5 pl-6 marker:text-muted-foreground">
            {b.items.map((it, j) => (
              <li key={j}>{inline(it)}</li>
            ))}
          </ol>
        );
      default:
        return <p key={k}>{inline(b.text)}</p>;
    }
  });
}

const INLINE = /(\[PLACEHOLDER:[^\]]*\]|\[[^\]]+\]\([^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

function inline(text: string): ReactNode[] {
  return text
    .split(INLINE)
    .filter((p) => p !== '')
    .map((part, i) => {
      if (part.startsWith('[PLACEHOLDER:')) {
        return (
          <mark key={i} className="rounded bg-warning-soft px-1 font-medium text-warning">
            {part}
          </mark>
        );
      }
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
      if (link) {
        const [, label, href] = link;
        if (href!.startsWith('/')) return <Link key={i} to={href!} className="font-medium text-brand underline underline-offset-2">{label}</Link>;
        const doc = /^([a-z-]+)\.md$/.exec(href!);
        if (doc) return <Fragment key={i}>{label}</Fragment>;
        return <a key={i} href={href} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-2">{label}</a>;
      }
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} className="font-semibold text-foreground">{inline(part.slice(2, -2))}</strong>;
      if (part.startsWith('`') && part.endsWith('`')) return <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[12.5px]">{part.slice(1, -1)}</code>;
      if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
      // Bare in-app paths such as /legal/privacy become links.
      const pieces = part.split(/(\/legal\/[a-z]+|https:\/\/[^\s)]+)/g);
      return (
        <Fragment key={i}>
          {pieces.map((p, j) =>
            /^\/legal\/[a-z]+$/.test(p) ? (
              <Link key={j} to={p} className="font-medium text-brand underline underline-offset-2">{p}</Link>
            ) : /^https:\/\//.test(p) ? (
              <a key={j} href={p} target="_blank" rel="noopener noreferrer" className="font-medium text-brand underline underline-offset-2">{p}</a>
            ) : (
              p
            ),
          )}
        </Fragment>
      );
    });
}
