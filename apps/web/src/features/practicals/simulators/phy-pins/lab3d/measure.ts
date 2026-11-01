import { mirrorConstruction, pinsAlignedPhi, pinsMeet, pinsPrism, prismConstruction, prismInDir, type PhyPinsVariant, type PinsPoint, type PinsTrace } from '@aischool/shared';

/** Where the protractor is centred for a joined trace: where P₄P₃ meets MM′ (mirror), or where the produced rays meet (prism). */
export function measurePoint(v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', t: PinsTrace): PinsPoint | null {
  if (task === 'MIRROR') return mirrorConstruction(t)?.at ?? null;
  const sh = pinsPrism(v);
  const c = prismConstruction(sh, t);
  return c ? (pinsMeet(sh.O, prismInDir(sh, t.i), c.at, c.dir)?.at ?? null) : null;
}
/** The eye's starting angle for a trace: a few degrees off the line, so the student has to find it. */
export const eyePhiOf = (v: PhyPinsVariant, task: 'MIRROR' | 'PRISM', t: PinsTrace) => Math.round(((pinsAlignedPhi(v, task, t.i) ?? t.i) + 4) * 10) / 10;
