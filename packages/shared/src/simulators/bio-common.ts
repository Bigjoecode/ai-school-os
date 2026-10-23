import { labRandom } from './seeded';

/**
 * Shared by the biology virtual labs (bio-microscope, bio-specimens): the
 * biological drawing checklist (drawing skills are assessed through guided
 * choices, never by grading freehand drawings) and the label-to-target helper.
 */

export interface BioDrawingStatement {
  id: string;
  text: string;
  /** True: good practice in a WAEC biological drawing. */
  good: boolean;
}

export const BIO_DRAWING_STATEMENTS: BioDrawingStatement[] = [
  { id: 'title', text: 'Give the drawing a title that names the specimen and the view (e.g. “Drawing of onion epidermal cells, ×400”).', good: true },
  { id: 'mag', text: 'State the magnification of the drawing beside the title.', good: true },
  { id: 'lines', text: 'Use clean, continuous single lines drawn with a sharp HB pencil.', good: true },
  { id: 'ruled', text: 'Draw label lines with a ruler; they should be horizontal where possible and must not cross.', good: true },
  { id: 'side', text: 'Write the labels to one or both sides of the drawing, not on it.', good: true },
  { id: 'size', text: 'Make the drawing large enough to show the details, with parts in the right proportion.', good: true },
  { id: 'touch', text: 'Each label line should touch the structure it names.', good: true },
  { id: 'shade', text: 'Shade or colour in the nucleus and other dark parts so they stand out.', good: false },
  { id: 'arrows', text: 'Put arrowheads at the ends of the label lines.', good: false },
  { id: 'sketch', text: 'Use short, sketchy, overlapping strokes so the outline looks natural.', good: false },
  { id: 'ink', text: 'Draw in ink so the lines cannot be rubbed out.', good: false },
  { id: 'onlabel', text: 'Write the labels across the drawing, close to each part.', good: false },
  { id: 'all', text: 'Draw every cell in the field of view rather than a few representative ones.', good: false },
];

/** Six statements (four good, two poor practice), in a seeded order. */
export function bioDrawingPick(seed: number, salt: string): BioDrawingStatement[] {
  const r = labRandom(seed, `${salt}-drawing`);
  const shuffle = <T>(xs: T[]) => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [a[i], a[j]] = [a[j]!, a[i]!];
    }
    return a;
  };
  const good = shuffle(BIO_DRAWING_STATEMENTS.filter((s) => s.good)).slice(0, 4);
  const bad = shuffle(BIO_DRAWING_STATEMENTS.filter((s) => !s.good)).slice(0, 2);
  return shuffle([...good, ...bad]);
}

/** Marks for the drawing checklist (out of 2): every statement judged right → 2; one wrong → 1. */
export function bioDrawingMarks(shown: BioDrawingStatement[], chosen: string[]): { awarded: number; wrong: BioDrawingStatement[] } {
  const wrong = shown.filter((s) => s.good !== chosen.includes(s.id));
  return { awarded: wrong.length === 0 ? 2 : wrong.length === 1 ? 1 : 0, wrong };
}

/** Normalises a name as written for matching ("Atlas vertebra!" → "atlas vertebra"). */
export const bioNormalise = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
