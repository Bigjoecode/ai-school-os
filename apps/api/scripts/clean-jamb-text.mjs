// Repairs text copied from JAMB's IBASS site: UTF-8 that was read as Windows-1252
// ("â€™" → "’", "Â " → " "), runs of non-breaking spaces, and stray Word/HTML markup.
// Used by the IBASS transform and to clean prisma/jamb/ibass.json.gz in place:
//   node scripts/clean-jamb-text.mjs [--write]

import { gunzipSync, gzipSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Windows-1252 bytes 0x80–0x9F that are not Latin-1 code points.
const CP1252 = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};
const byteOf = (ch) => {
  const c = ch.codePointAt(0);
  if (c < 0x100) return c;
  return CP1252[c] ?? -1;
};
const utf8 = new TextDecoder('utf-8', { fatal: true });

/** A run that starts with a UTF-8 lead byte read as Latin-1/CP1252 (Â, Ã, â …) and its continuation characters. */
const SUSPECT = /[Â-ô][\u0080-¿ŒœŠšŸŽžƒˆ˜–—‘’‚“”„†-•…‰‹›€™]{1,3}/g;

function fixMojibake(s) {
  let prev;
  // Some texts were mis-decoded twice; repeat until nothing changes.
  for (let i = 0; i < 3 && s !== prev; i++) {
    prev = s;
    s = s.replace(SUSPECT, (run) => {
      const bytes = [...run].map(byteOf);
      if (bytes.some((b) => b < 0)) return run;
      try {
        return utf8.decode(Uint8Array.from(bytes));
      } catch {
        return run;
      }
    });
  }
  return s;
}

export function cleanJambText(input) {
  if (typeof input !== 'string') return input;
  let s = fixMojibake(input);
  s = s
    // Leftovers whose second byte was lost when the site turned a non-breaking space into a plain one.
    .replace(/Â(?=[\s ]|$)/g, ' ')
    .replace(/â€(?=[\s .,;:)]|$)/g, '”')
    .replace(/<[a-z!/][^>]*>/gi, ' ') // complete tags
    .replace(/<[a-z][^<]*$/i, '') // a tag cut off at the end of the text
    .replace(/[­​‌‍﻿]/g, '') // soft hyphens, zero-width characters
    .replace(/ /g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return s;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = join(dirname(fileURLToPath(import.meta.url)), '../prisma/jamb/ibass.json.gz');
  const data = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8'));
  let changed = 0;
  const clean = (v) => {
    const c = cleanJambText(v);
    if (c !== v) changed++;
    return c;
  };
  data.texts = data.texts.map(clean);
  for (const i of data.institutions) for (const k of ['name', 'address', 'specialization']) if (typeof i[k] === 'string') i[k] = clean(i[k]);
  for (const p of data.programmes) for (const k of ['name', 'dept']) if (typeof p[k] === 'string') p[k] = clean(p[k]);
  const left = data.texts.filter((t) => /Â|â€|Ã|<[a-z]/i.test(t ?? ''));
  console.log(`changed ${changed} strings; texts still suspicious: ${left.length}`);
  for (const t of left.slice(0, 5)) console.log('  ·', t.slice(0, 160));
  if (process.argv.includes('--write')) {
    writeFileSync(file, gzipSync(Buffer.from(JSON.stringify(data)), { level: 9 }));
    console.log('written', file);
  }
}
