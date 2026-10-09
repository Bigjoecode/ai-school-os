// Builds prisma/jamb/faculties.json: { "<normalised course name>": "<Faculty>" }.
//
// Two sources, both JAMB's own:
//  1. The brochure section ("dept") each programme is filed under in IBASS
//     (SCIENCES, SOCIAL SCIENCES, ENGINEERING/TECH/ENV, …), counted per course
//     name across every institution: the main signal.
//  2. The numbered course lists at the start of each faculty section of the
//     printed brochure (text extracted from the PDFs), for names IBASS files
//     under no faculty (ND/NCE lists, blanks) and for names not yet in the data.
//
// Usage: node scripts/build-jamb-faculties.mjs [path/to/pdftext-dir]
// Re-run it when prisma/jamb/ibass.json.gz is replaced with a fuller copy.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pdfDir = process.argv[2];

/** Must match normCourse() in src/prisma/jamb-install.ts. */
export function normCourse(s) {
  return String(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\//g, ' and ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9]+/g, '');
}

const DEPT = {
  SCIENCES: 'Sciences',
  SCIENCE: 'Sciences',
  'SOCIAL SCIENCES': 'Social Sciences',
  'SOCIAL SCIENCE': 'Social Sciences',
  ARTS: 'Arts',
  'ARTS AND HUMANITIES': 'Arts',
  ENGINEERING: 'Engineering & Technology',
  'ENGINEERING/TECH/ENV': 'Engineering & Technology',
  MEDICAL: 'Medicine & Health Sciences',
  'MED/PHARM/HEALTH SCIENCES': 'Medicine & Health Sciences',
  HEALTH: 'Medicine & Health Sciences',
  LAW: 'Law',
  'LAW/LEGAL STUDIES': 'Law',
  AGRICULTURE: 'Agriculture',
  EDUCATION: 'Education',
  ADMINISTRATION: 'Administration & Management',
};
const FILES = {
  administration2: 'Administration & Management',
  agriculture2: 'Agriculture',
  arts2: 'Arts',
  education2: 'Education',
  engineering2: 'Engineering & Technology',
  law2: 'Law',
  medical2: 'Medicine & Health Sciences',
  sciences2: 'Sciences',
  social2: 'Social Sciences',
};

const data = JSON.parse(gunzipSync(readFileSync(join(root, 'prisma/jamb/ibass.json.gz'))).toString('utf8'));
const votes = new Map(); // norm -> Map<faculty, n>
const vote = (key, faculty, n) => {
  if (!key || !faculty) return;
  const m = votes.get(key) ?? new Map();
  m.set(faculty, (m.get(faculty) ?? 0) + n);
  votes.set(key, m);
};
const dataNames = new Set();
for (const p of data.programmes) {
  const key = normCourse(p.name);
  if (!key) continue;
  dataNames.add(key);
  vote(key, DEPT[(p.dept ?? '').trim().toUpperCase()], 1);
}

// The brochure's numbered lists ("1Architecture41Computer with Statistics81…", multi-column).
let fromPdf = 0;
const pdfOnly = new Map();
if (pdfDir && existsSync(pdfDir)) {
  for (const [file, faculty] of Object.entries(FILES)) {
    const path = join(pdfDir, `${file}.txt`);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, 'utf8');
    const end = text.search(/AWARDING\s*INSTITUTIONS|DEGREEAWARDING|PROGRAMME\/DEGREE|COURSE\/DEGREE|COURSE\/\s*\n/);
    const head = (end > 0 ? text.slice(0, end) : text.slice(0, 8000))
      .split('\n')
      .filter((l) => /[a-z]/.test(l) && !/^\s*\[/.test(l) && !/Hons|Universit|programme|candidates|Entry|lasts|minimum/i.test(l))
      .join(' ');
    const items = head.split(/(?<![\d])\d{1,3}\.?\s*(?=[A-Za-z])/).map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => s.length > 2 && s.length < 90);
    for (const item of items) {
      const candidates = new Set([item, ...item.split('/').map((s) => s.trim())]);
      let matched = false;
      for (const c of candidates) {
        const key = normCourse(c);
        if (key.length < 3) continue;
        if (dataNames.has(key)) {
          vote(key, faculty, 2);
          matched = true;
          fromPdf++;
        }
      }
      if (!matched) {
        const key = normCourse(item);
        if (key.length >= 4 && !pdfOnly.has(key)) pdfOnly.set(key, faculty);
      }
    }
  }
}

function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const out = {};
for (const [key, m] of votes) {
  const best = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  if (best) out[key] = best[0];
}
// Brochure names with a typo ("Micribiology"): give an unplaced data name the faculty of a near-identical listed name.
let fuzzy = 0;
const pdfKeys = [...pdfOnly.keys()];
for (const key of dataNames) {
  if (out[key] || key.length < 9) continue;
  const hit = pdfKeys.find((k) => lev(k, key, 2) <= 2);
  if (hit) {
    out[key] = pdfOnly.get(hit);
    fuzzy++;
  }
}
// Listed names not (yet) in the data, for when the full brochure data arrives.
for (const [key, faculty] of pdfOnly) if (!out[key]) out[key] = faculty;
// Names placed earlier and not produced by this run (DEGREE names found in the brochure's faculty
// tables, field groupings for ND/NCE courses IBASS files under no faculty): keep them.
const facultiesPath = join(root, 'prisma/jamb/faculties.json');
if (existsSync(facultiesPath)) {
  for (const [key, faculty] of Object.entries(JSON.parse(readFileSync(facultiesPath, 'utf8')))) if (!out[key]) out[key] = faculty;
}

const sorted = Object.fromEntries(Object.entries(out).sort((a, b) => a[0].localeCompare(b[0])));
writeFileSync(join(root, 'prisma/jamb/faculties.json'), `${JSON.stringify(sorted, null, 1)}\n`);
const unplaced = [...dataNames].filter((k) => !out[k]);
const counts = {};
for (const f of Object.values(sorted)) counts[f] = (counts[f] ?? 0) + 1;
console.log(`faculties.json: ${Object.keys(sorted).length} names (${fromPdf} brochure-list hits, ${fuzzy} fuzzy, ${pdfOnly.size} list-only); ${unplaced.length} data names without a faculty`);
console.log(counts);
if (process.env.SHOW_UNPLACED) console.log(unplaced.join('\n'));
