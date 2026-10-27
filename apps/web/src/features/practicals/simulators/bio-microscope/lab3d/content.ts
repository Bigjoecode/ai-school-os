import { MICRO_SLIDE_INFO, emptyBioMicroscopeState, type BioMicroscopeState, type MicroSlide } from '@aischool/shared';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { BIO_ROOM_EXPLAIN } from '../../bio-common/lab3d/common';
import { NEEDED } from './scene-state';
import { SPOTS } from './spots';

/** The microscope lab's "What is this?" cards, Learn configuration and suggested questions. */

const E: Record<string, Explainer> = {
  ...BIO_ROOM_EXPLAIN,
  scope: { name: 'Compound light microscope', purpose: 'Magnifies thin, transparent specimens with two lenses: the eyepiece and an objective.', how: 'Carry it with two hands. Low power first: raise the stage with the coarse focus, sharpen with the fine focus, then turn to high power and use only the fine focus.', mistake: 'Using the coarse focus at ×40 and cracking the slide.', keys: ['microscope', 'carry', 'coarse', 'focus'] },
  eyepiece: { name: 'Eyepiece', purpose: 'The lens you look through (×10 or ×15). Total magnification = eyepiece × objective.', how: 'Keep both eyes open if you can; the graticule scale inside it measures in eyepiece units.', mistake: 'Forgetting to multiply by the eyepiece magnification.', keys: ['eyepiece', 'magnification'] },
  turret: { name: 'Revolving nosepiece and objectives', purpose: 'Holds the ×4, ×10 and ×40 objectives; turn it until one clicks into place.', how: 'Start with ×4 (red) or ×10 (yellow); turn to ×40 (blue) only when the specimen is focused and centred.', mistake: 'Starting at high power.', keys: ['objective', 'low power', 'high power'] },
  coarse: { name: 'Coarse focus knob', purpose: 'Moves the stage a long way, to find the image.', how: 'Use it only at low power; watch from the side as you raise the stage.', mistake: 'Using it at high power.', keys: ['coarse'] },
  fine: { name: 'Fine focus knob', purpose: 'Moves the stage a tiny distance to make the image sharp.', how: 'The only focus to use at high power. Turn it slowly back and forth.', mistake: 'Turning it fast and passing the sharp point.', keys: ['fine'] },
  diaphragm: { name: 'Iris diaphragm', purpose: 'Controls how much light reaches the specimen, and the contrast.', how: 'Close it a little for unstained, colourless specimens; open it for high power.', mistake: 'Leaving it wide open on a colourless specimen: the cells vanish in the glare.', keys: ['diaphragm', 'light'] },
  lamp: { name: 'Lamp', purpose: 'Lights the specimen from below.', how: 'Turn it up until the field is evenly lit — not glaring.', mistake: 'Too dark at high power.', keys: ['lamp', 'light', 'mirror'] },
  stage: { name: 'Stage and clips', purpose: 'Holds the slide over the hole, so light passes up through it.', how: 'Centre the specimen over the hole and clip the slide down.', mistake: 'Not clipping the slide: it slides about.', keys: ['stage'] },
  slide: { name: 'Your slide', purpose: 'The temporary mount: the specimen in a drop of liquid under a cover slip.', how: 'Thin single layer, the right liquid, cover slip lowered at an angle, excess blotted off.', mistake: 'Air bubbles from dropping the cover slip.', keys: ['cover slip', 'slide', 'bubble'] },
  tile: { name: 'White tile', purpose: 'A clean, white surface to make the slide on.', how: 'Lay the slide on it; you can see the specimen against the white.', mistake: 'Making the slide in your hand.', keys: [] },
  slides: { name: 'Slides and cover slips', purpose: 'Glass slides hold the specimen; the thin cover slip flattens it and keeps it moist.', how: 'Hold them by the edges. Lower the cover slip at an angle with a mounted needle.', mistake: 'Fingerprints on the slide; dropping the cover slip flat.', keys: ['cover slip', 'slide'] },
  needle: { name: 'Mounted needle', purpose: 'Lowers the cover slip slowly at an angle, and teases specimens flat.', how: 'Rest one edge of the cover slip on the slide, support the other on the needle and lower it.', mistake: 'Letting the cover slip fall.', keys: ['needle', 'cover slip'] },
  forceps: { name: 'Forceps', purpose: 'Peel and lift thin tissue such as onion epidermis.', how: 'Grip the edge of the thin skin and peel it back gently.', mistake: 'Folding the epidermis: overlapping cells.', keys: ['forceps', 'peel'] },
  scalpel: { name: 'Scalpel / razor blade', purpose: 'Cuts thin sections and the onion scale leaf.', how: 'Always cut away from your fingers, on the tile; keep the blade wet for sections.', mistake: 'Cutting towards your hand.', keys: ['scalpel', 'razor', 'blade', 'cut'] },
  brush: { name: 'Fine paint brush', purpose: 'Lifts thin sections without tearing them.', how: 'Pick the thinnest section from the watch glass with a wet brush.', mistake: 'Mounting a thick section that light cannot pass through.', keys: ['brush', 'section'] },
  watchGlass: { name: 'Watch glass', purpose: 'Keeps sections or peels in water until you mount them.', how: 'Float the sections in water and pick the thinnest.', mistake: 'Letting sections dry out.', keys: ['watch glass'] },
  filter: { name: 'Filter (blotting) paper', purpose: 'Draws off extra liquid from around the cover slip.', how: 'Touch its edge to the side of the cover slip.', mistake: 'Pressing on the cover slip and crushing the specimen.', keys: ['blot', 'filter'] },
  lensTissue: { name: 'Lens tissue', purpose: 'Cleans the eyepiece and objective lenses without scratching them.', how: 'Wipe gently; never use paper towels or your fingers.', mistake: 'Cleaning lenses with a handkerchief.', keys: ['lens tissue', 'clean'] },
  swabs: { name: 'Sterile cotton buds', purpose: 'Gently scrape cells from the inside of your cheek.', how: 'Use a fresh one, smear it in the drop, then put it in the disinfectant.', mistake: 'Scraping hard, or reusing a bud.', keys: ['swab', 'cotton', 'spatula'] },
  disinfectant: { name: 'Beaker of disinfectant', purpose: 'Kills microbes on used cheek swabs.', how: 'Drop the used bud straight in.', mistake: 'Putting it in the bin or on the bench.', keys: ['disinfect'] },
  bin: { name: 'Sharps and discard jar', purpose: 'Takes used slides, cover slips and broken glass safely.', how: 'Put your slide in when you have finished at the microscope.', mistake: 'Leaving broken glass on the bench or in the bin.', keys: ['broken', 'glass', 'dispos'] },
  stain: { name: 'Mounting liquids and stains', purpose: 'Water keeps living things moist; iodine stains plant nuclei and starch; methylene blue stains animal nuclei; safranin stains lignin red; salt solution makes cells lose water.', how: 'One drop on the slide, before the specimen.', mistake: 'Using a stain on living organisms you want to watch move.', keys: ['iodine', 'methylene', 'stain', 'safranin', 'salt', 'sucrose'] },
  source: { name: 'The specimen', purpose: 'What you are examining today.', how: 'Use a thin, single layer so light passes through.', mistake: 'A thick or folded piece.', keys: ['epidermis', 'thin', 'layer', 'section'] },
  card: { name: 'Task card', purpose: 'The question paper: what to prepare, what to measure and the values you are given.', how: 'Read it before you start and again before the calculations.', mistake: 'Missing the eyepiece magnification on the paper.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your labels, measurements, calculations, drawing checklist, observations and precautions — this is what is marked.', how: 'Capture your views first; then label and measure from them.', mistake: 'Giving a magnification a unit.', keys: ['record', 'magnification'] },
};
export const explainer = makeExplainer(E, { 'stain:': 'stain' });

/** The bench as Mrs Okon sets it out for the introduction (display only, never saved): everything out, a slide made and on the stage. */
export function learnState(slide: MicroSlide): BioMicroscopeState {
  const base = emptyBioMicroscopeState();
  return {
    ...base,
    slide,
    prep: { medium: MICRO_SLIDE_INFO[slide].media[0]!, coverslip: 'ANGLE', placed: true, clipped: true },
    scope: { ...base.scope, lamp: 50 },
    log: [{ t: 0, a: 'safety:coat' }, ...NEEDED[slide].map((a) => ({ t: 0, a: `collect:${a}` })), { t: 0, a: 'take-slide' }, { t: 0, a: 'specimen-on' }, { t: 0, a: 'place-slide' }],
  };
}

/** Lesson apparatus lines → the object on the bench (first match wins). */
const MATCH: [RegExp, string, keyof typeof SPOTS][] = [
  [/microscope/i, 'scope', 'scope'],
  [/cover slip|slides?/i, 'slides', 'tile'],
  [/forceps/i, 'forceps', 'tools'],
  [/mounted needle|needle/i, 'needle', 'tools'],
  [/scalpel|razor|blade/i, 'scalpel', 'tools'],
  [/brush/i, 'brush', 'tools'],
  [/dropper|pipette/i, 'stain', 'stains'],
  [/filter paper|blotting/i, 'filter', 'tile'],
  [/watch glass/i, 'watchGlass', 'source'],
  [/cotton bud|spatula|swab/i, 'swabs', 'prep'],
  [/disinfectant|beaker/i, 'disinfectant', 'bin'],
  [/tape/i, 'tape', 'tools'],
];
export const LEARN_CONFIG: LearnConfig = {
  items: MATCH.map(([match, id, spot]) => ({ match, id: id === 'stain' ? 'stain:IODINE' : id, spot: SPOTS[spot]! })),
  explain: explainer,
  procedure: [
    { spot: SPOTS.prep!, point: 'tile' },
    { spot: SPOTS.scope!, point: 'scope' },
  ],
  observe: { spot: SPOTS.stage!, point: 'eyepiece' },
  observeTitle: 'What you will see',
};

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['Why lower the cover slip at an angle?', 'Why start at low power?', 'What does the stain show?', 'How do I work out the total magnification?'],
  DEMO: ['Why only the fine focus at ×40?', 'Why close the diaphragm a little?', 'How do you count cells across the field?', 'How do you work out the drawing magnification?'],
  TRY: ['Why is my image blurred?', 'Why is the field dark?', 'How do I measure with the graticule?', 'Should a magnification have a unit?'],
  SANDBOX: ['What happens with the wrong stain?', 'Why does high power need more light?', 'What do air bubbles look like?', 'Why does the image look upside down?'],
};
