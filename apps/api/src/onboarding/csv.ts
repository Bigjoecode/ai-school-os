/**
 * A small RFC 4180 CSV reader for what Excel and Google Sheets export:
 * a UTF-8 BOM, quoted fields with commas, doubled quotes and line breaks,
 * CRLF or LF endings, and comma, semicolon or tab separators (detected from
 * the header line). Blank lines are dropped.
 */
export function parseCsv(text: string): { headers: string[]; rows: { line: number; values: string[] }[] } {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const delimiter = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0]!.d;

  const records: { line: number; values: string[] }[] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '"' && field === '') inQuotes = true;
    else if (c === delimiter) {
      record.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      record.push(field);
      records.push({ line: recordLine, values: record });
      record = [];
      field = '';
      line++;
      recordLine = line;
    } else field += c;
  }
  if (field !== '' || record.length) {
    record.push(field);
    records.push({ line: recordLine, values: record });
  }
  const nonBlank = records.filter((r) => r.values.some((v) => v.trim() !== ''));
  const [head, ...rows] = nonBlank;
  return { headers: (head?.values ?? []).map((h) => h.trim()), rows: rows.map((r) => ({ line: r.line, values: r.values.map((v) => v.trim()) })) };
}

/** "First Name", "first_name", "FIRSTNAME:" → "first name". */
export const normHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/[_\-./:*()#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Quotes a value for CSV output. */
export const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
