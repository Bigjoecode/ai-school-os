import type { BioMicroscopeState, MicroSlide } from '@aischool/shared';

/**
 * What the 3D microscope bench shows beyond the marked state (coat on,
 * apparatus collected, a clean slide out, the specimen in the drop, blotted,
 * lenses cleaned, the slide and swab disposed of, hands washed) is read back
 * from the attempt's own action log, so a reload, or switching between the 3D
 * and the 2D lab mid-attempt, keeps the bench as the student left it. These
 * entries carry no marks; the grader only reads the 2D fields.
 */

export type ApparatusId =
  | 'microscope'
  | 'slides'
  | 'needle'
  | 'forceps'
  | 'scalpel'
  | 'brush'
  | 'watchGlass'
  | 'filter'
  | 'lensTissue'
  | 'swabs'
  | 'disinfectant'
  | 'tape'
  | 'thermometer'
  | 'burner'
  | 'testTubes'
  | 'cylinder';
export const APPARATUS_LABEL: Record<ApparatusId, string> = {
  microscope: 'Compound light microscope',
  slides: 'Slides and cover slips',
  needle: 'Mounted needle',
  forceps: 'Forceps',
  scalpel: 'Scalpel / razor blade',
  brush: 'Fine paint brush',
  watchGlass: 'Watch glass',
  filter: 'Filter (blotting) paper',
  lensTissue: 'Lens tissue',
  swabs: 'Sterile cotton buds',
  disinfectant: 'Beaker of disinfectant',
  tape: 'Clear adhesive tape',
  thermometer: 'Thermometer',
  burner: 'Bunsen burner',
  testTubes: 'Test tubes in a rack',
  cylinder: 'Measuring cylinder',
};
export const ALL_APPARATUS = Object.keys(APPARATUS_LABEL) as ApparatusId[];

/** What each slide needs from the cupboard (the rest are the student's choice: they are not needed). */
export const NEEDED: Record<MicroSlide, ApparatusId[]> = {
  ONION: ['microscope', 'slides', 'needle', 'forceps', 'scalpel', 'filter', 'lensTissue'],
  CHEEK: ['microscope', 'slides', 'needle', 'swabs', 'disinfectant', 'filter', 'lensTissue'],
  PLASMOLYSIS: ['microscope', 'slides', 'needle', 'forceps', 'filter', 'lensTissue'],
  POND: ['microscope', 'slides', 'needle', 'filter', 'lensTissue'],
  STEM: ['microscope', 'slides', 'needle', 'scalpel', 'brush', 'watchGlass', 'filter', 'lensTissue'],
  LEAF: ['microscope', 'slides', 'needle', 'forceps', 'tape', 'filter', 'lensTissue'],
};
/** Harmless extras the cupboard also offers for every slide (handy, not marked against). */
export const OPTIONAL: ApparatusId[] = ['watchGlass', 'brush', 'forceps', 'scalpel', 'tape', 'swabs', 'disinfectant', 'filter'];
export const DISTRACTORS: ApparatusId[] = ['thermometer', 'burner', 'testTubes', 'cylinder'];

/** How the specimen is made, per slide: the action's label and what the student is told. */
export const SPECIMEN_STEP: Record<MicroSlide, { source: string; action: string; done: string; tool: ApparatusId | null }> = {
  ONION: { source: 'Onion bulb (scale leaf)', action: 'Peel the inner epidermis with forceps and lay it flat in the drop', done: 'A thin square of epidermis lies flat in the drop.', tool: 'forceps' },
  CHEEK: { source: 'Your cheek', action: 'Scrape the inside of your cheek gently with a cotton bud and smear it in the drop', done: 'Cheek cells smeared in the drop. Put the bud in the disinfectant.', tool: 'swabs' },
  PLASMOLYSIS: { source: 'Red onion (coloured epidermis)', action: 'Peel a strip of the coloured epidermis with forceps and lay it in the drop', done: 'The coloured epidermis lies flat in the drop.', tool: 'forceps' },
  POND: { source: 'Pond water sample', action: 'Put a drop of the pond water (with some green scum) on the cavity slide', done: 'A drop of pond water is on the slide.', tool: null },
  STEM: { source: 'Young stem', action: 'Cut thin transverse sections with the wet razor blade and lift the thinnest one with the brush', done: 'The thinnest section is in the drop.', tool: 'scalpel' },
  LEAF: { source: 'Fresh leaf', action: 'Tear the leaf so a thin strip of epidermis peels away (or lift it with tape) and lay it flat', done: 'A thin, colourless strip of epidermis lies flat on the slide.', tool: 'forceps' },
};

export type SlideAt = 'none' | 'tile' | 'stage' | 'bin';
export interface SceneState {
  coat: boolean;
  goggles: boolean;
  collected: Set<ApparatusId>;
  slide: SlideAt;
  specimen: boolean;
  blotted: boolean;
  lensCleaned: boolean;
  swabDisposed: boolean;
  /** Hands washed since the slide was disposed of (the end of the practical), or at all. */
  washedAtEnd: boolean;
  washed: boolean;
}

const MARKED_2D = /^(medium:|coverslip:|place-slide|objective:|capture:)/;

/** Replays the log entries the 3D lab writes (and the 2D ones that move things). */
export function sceneFromState(s: BioMicroscopeState): SceneState {
  const out: SceneState = { coat: false, goggles: false, collected: new Set(), slide: 'none', specimen: false, blotted: false, lensCleaned: false, swabDisposed: false, washedAtEnd: false, washed: false };
  // Work started in the 2D lab (before anything was collected here): its microscope and slide are already on the bench.
  const firstCollect = s.log.findIndex((e) => e.a.startsWith('collect:'));
  const first2d = s.log.findIndex((e) => MARKED_2D.test(e.a));
  const from2d = first2d >= 0 && (firstCollect < 0 || first2d < firstCollect);
  if (from2d && s.slide) {
    for (const x of NEEDED[s.slide]) out.collected.add(x);
    out.slide = 'tile';
    out.specimen = true;
  }
  for (const { a } of s.log) {
    const [verb, arg] = a.split(':') as [string, string | undefined];
    if (verb === 'safety' && arg === 'coat') out.coat = true;
    else if (verb === 'safety' && arg === 'goggles') out.goggles = true;
    else if (verb === 'safety-off' && arg === 'coat') out.coat = false;
    else if (verb === 'safety-off' && arg === 'goggles') out.goggles = false;
    else if (verb === 'collect' && arg) out.collected.add(arg as ApparatusId);
    else if (verb === 'return' && arg) out.collected.delete(arg as ApparatusId);
    else if (verb === 'take-slide') out.slide = out.slide === 'none' ? 'tile' : out.slide;
    else if (verb === 'specimen-on') out.specimen = true;
    else if (verb === 'blot') out.blotted = true;
    else if (verb === 'clean-lens') out.lensCleaned = true;
    else if (verb === 'place-slide') out.slide = 'stage';
    else if (verb === 'dispose-slide') {
      out.slide = 'bin';
      out.washedAtEnd = false;
    } else if (verb === 'dispose-swab') out.swabDisposed = true;
    else if (verb === 'wash-hands') {
      out.washed = true;
      if (out.slide === 'bin') out.washedAtEnd = true;
    } else if (verb === 'change-slide') Object.assign(out, { slide: 'none', specimen: false, blotted: false, swabDisposed: false, washedAtEnd: false });
  }
  if (s.prep.placed && out.slide !== 'bin') out.slide = 'stage';
  if ((s.prep.medium || s.prep.coverslip) && out.slide === 'none') out.slide = 'tile';
  return out;
}

export const needed = (slide: MicroSlide | null) => (slide ? NEEDED[slide] : NEEDED.ONION);
export const cupboardItems = (slide: MicroSlide | null): ApparatusId[] => {
  const n = needed(slide);
  return [...n, ...OPTIONAL.filter((x) => !n.includes(x)), ...DISTRACTORS];
};
