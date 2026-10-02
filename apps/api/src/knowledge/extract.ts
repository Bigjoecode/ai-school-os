/**
 * Plain text from uploaded documents. Both readers are pure JavaScript so
 * they bundle into the single-file API (no native modules, nothing to
 * install on the server). PDFs must have a text layer; scanned images of
 * pages have none and are reported as such.
 */
/* eslint-disable @typescript-eslint/no-require-imports */

interface PdfJs {
  disableWorker: boolean;
  getDocument(data: Uint8Array): Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str: string; transform: number[] }[] }> }>; destroy(): void }>;
}

let pdfjs: PdfJs | null = null;
function loadPdf(): PdfJs {
  // The pdf.js build that ships inside pdf-parse, loaded directly: its
  // index file reads a test PDF on import, and its version switch is a
  // dynamic require a bundler can't follow.
  pdfjs ??= require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js') as PdfJs;
  pdfjs.disableWorker = true;
  return pdfjs;
}

export const MAX_PAGES = 200;

export async function pdfText(buf: Buffer): Promise<string> {
  const doc = await loadPdf().getDocument(new Uint8Array(buf));
  const pages: string[] = [];
  try {
    for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      let lastY: number | undefined;
      let text = '';
      for (const item of content.items) {
        const y = item.transform[5];
        text += lastY === undefined || lastY === y ? item.str : `\n${item.str}`;
        lastY = y;
      }
      pages.push(text);
    }
  } finally {
    doc.destroy();
  }
  return pages.join('\n\n');
}

export async function docxText(buf: Buffer): Promise<string> {
  const mammoth = require('mammoth') as { extractRawText(input: { buffer: Buffer }): Promise<{ value: string }> };
  return (await mammoth.extractRawText({ buffer: buf })).value;
}

export async function extractText(buf: Buffer, mimeType: string): Promise<string> {
  if (mimeType === 'application/pdf') return pdfText(buf);
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return docxText(buf);
  if (mimeType.startsWith('text/')) return buf.toString('utf8');
  throw new Error('Only PDF and Word documents can be read (or paste the text instead)');
}

/** Splits text into overlapping passages of about 1,200 characters on paragraph boundaries, keeping the nearest heading. */
export function chunk(text: string, size = 1200, overlap = 150): { heading: string | null; text: string }[] {
  const clean = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const paras = clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const out: { heading: string | null; text: string }[] = [];
  let heading: string | null = null;
  let buf = '';
  const isHeading = (p: string) => p.length < 80 && !/[.:;,]$/.test(p) && /^[A-Z0-9]/.test(p) && p.split(' ').length <= 10;
  const flush = () => {
    if (buf.trim()) out.push({ heading, text: buf.trim() });
    buf = buf.slice(-overlap);
  };
  for (const p of paras) {
    if (isHeading(p)) {
      if (buf.trim().length > overlap) flush();
      heading = p;
      buf = '';
      continue;
    }
    if (buf.length + p.length > size && buf.length > overlap) flush();
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size - overlap) {
        buf += p.slice(i, i + size);
        flush();
      }
      continue;
    }
    buf += (buf ? '\n\n' : '') + p;
  }
  if (buf.trim().length > overlap || (!out.length && buf.trim())) out.push({ heading, text: buf.trim() });
  return out;
}
