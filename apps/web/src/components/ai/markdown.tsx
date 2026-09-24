import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A tiny, safe markdown-ish renderer for AI replies. Supports paragraphs,
 * headings (#, ##, ###), bullet and numbered lists, **bold**, *italic* and
 * `code`. Everything becomes React elements — no HTML injection possible.
 */
export function Markdown({ text, className }: { text: string; className?: string }) {
  return <div className={cn('space-y-3 text-[14px] leading-relaxed', className)}>{renderBlocks(text)}</div>;
}

type Block =
  | { type: 'p'; lines: string[] }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'h'; level: number; text: string };

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*)$/;

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      flush();
      blocks.push({ type: 'h', level: h[1].length, text: h[2] });
      continue;
    }
    const b = BULLET.exec(line);
    if (b) {
      if (current?.type !== 'ul') {
        flush();
        current = { type: 'ul', items: [] };
      }
      current.items.push(b[1]);
      continue;
    }
    const n = NUMBERED.exec(line);
    if (n) {
      if (current?.type !== 'ol') {
        flush();
        current = { type: 'ol', items: [] };
      }
      current.items.push(n[1]);
      continue;
    }
    // Continuation of a list item (indented line) or paragraph.
    if ((current?.type === 'ul' || current?.type === 'ol') && /^\s{2,}/.test(raw)) {
      current.items[current.items.length - 1] += ` ${line.trim()}`;
      continue;
    }
    if (current?.type !== 'p') {
      flush();
      current = { type: 'p', lines: [] };
    }
    current.lines.push(line.trim());
  }
  flush();
  return blocks;
}

function renderBlocks(text: string): ReactNode[] {
  return parse(text).map((block, i) => {
    switch (block.type) {
      case 'h':
        return (
          <p key={i} className={cn('font-display font-semibold tracking-tight', block.level === 1 ? 'text-base' : 'text-[14.5px]')}>
            {renderInline(block.text)}
          </p>
        );
      case 'ul':
        return (
          <ul key={i} className="space-y-1.5 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span aria-hidden className="mt-[9px] size-1.5 shrink-0 rounded-full bg-ai-2/70" />
                <span className="min-w-0">{renderInline(item)}</span>
              </li>
            ))}
          </ul>
        );
      case 'ol':
        return (
          <ol key={i} className="space-y-1.5 pl-1">
            {block.items.map((item, j) => (
              <li key={j} className="flex gap-2.5">
                <span aria-hidden className="mt-px w-4 shrink-0 text-right font-mono text-[12px] text-muted-foreground tabular">
                  {j + 1}.
                </span>
                <span className="min-w-0">{renderInline(item)}</span>
              </li>
            ))}
          </ol>
        );
      default:
        return (
          <p key={i}>
            {block.lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {renderInline(l)}
              </Fragment>
            ))}
          </p>
        );
    }
  });
}

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\s][^*]*\*)/g;

function renderInline(text: string): ReactNode[] {
  const parts = text.split(INLINE).filter((p) => p !== '');
  return parts.map((part, i) => {
    if ((part.startsWith('**') && part.endsWith('**')) || (part.startsWith('__') && part.endsWith('__'))) {
      return (
        <strong key={i} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={i} className="rounded bg-muted px-1 py-0.5 font-mono text-[12.5px]">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.length > 2 && part.startsWith('*') && part.endsWith('*')) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
