import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import { BIO_ROOM_EXPLAIN } from '../../bio-common/lab3d/common';
import { SPOTS, specSpot } from './scene-state';

/** The specimen bench's "What is this?" cards, Learn configuration and suggested questions. */

const E: Record<string, Explainer> = {
  ...BIO_ROOM_EXPLAIN,
  spec: { name: 'A bench specimen', purpose: 'One of the specimens you must identify: on a tray, in a Petri dish or preserved in a jar, with its letter.', how: 'Examine it with the hand lens; name it, classify it, label it and describe what you can see.', mistake: 'Writing a function where a feature (something you can see) is asked for.', keys: ['specimen', 'preserv'] },
  lens: { name: 'Hand lens', purpose: 'Magnifies small details: hairs, veins, segments, spiracles, sori…', how: 'Hold it close to your eye and bring the specimen up towards it until it is sharp.', mistake: 'Holding the lens at arm’s length.', keys: ['hand lens', 'lens'] },
  ruler: { name: '30 cm ruler', purpose: 'Measures the specimen’s length, for the magnification of your drawing.', how: 'Put the zero at one end (not the end of the ruler), read the other end to the nearest millimetre, and give the unit.', mistake: 'Measuring from the end of the ruler instead of the zero.', keys: ['ruler', 'measure'] },
  gloves: { name: 'Disposable gloves', purpose: 'Protect your skin from preservative (formalin) and from germs on animal material.', how: 'Put them on before handling the specimens; take them off into the bin at the end and wash your hands.', mistake: 'Touching your face or your pen with gloved hands.', keys: ['glove'] },
  forceps: { name: 'Forceps', purpose: 'Turn small specimens over gently.', how: 'Hold the specimen by a tough part, not a delicate one.', mistake: 'Squeezing hard and damaging the specimen.', keys: ['forceps'] },
  scalpel: { name: 'Scalpel', purpose: 'Cuts sections of fruits, flowers or organs.', how: 'Cut on a tile or board, away from your fingers.', mistake: 'Cutting towards your hand.', keys: ['scalpel', 'knife', 'blade'] },
  board: { name: 'Dissecting board', purpose: 'A firm surface for cutting specimens.', how: 'Lay the specimen on it and cut away from you.', mistake: 'Cutting on the bench top.', keys: ['dissect', 'board'] },
  card: { name: 'Task card', purpose: 'The question paper: which specimens to name, measure and compare.', how: 'Read it first, and again before the comparison.', mistake: 'Comparing the wrong two specimens.', keys: [] },
  book: { name: 'Answer sheet', purpose: 'Your names, groups, labels, features, functions, the measurement and the comparison — this is what is marked.', how: 'Examine each specimen first, then record it.', mistake: 'Giving the magnification a unit.', keys: ['record'] },
};
export const explainer = makeExplainer(E, { 'spec:': 'spec' });

/** Lesson apparatus lines → the object on the bench (first match wins). */
const MATCH: [RegExp, string][] = [
  [/hand lens|lens/i, 'lens'],
  [/ruler|metre rule/i, 'ruler'],
  [/glove/i, 'gloves'],
  [/forceps/i, 'forceps'],
  [/scalpel|knife|razor|scissors/i, 'scalpel'],
  [/dissecting|board/i, 'board'],
  [/tray|petri|dish|bottle/i, 'spec:A'],
];
export function learnConfig(n: number): LearnConfig {
  const spot: Record<string, keyof typeof SPOTS> = { lens: 'tools', ruler: 'tools', gloves: 'gloves', forceps: 'tools', scalpel: 'tools', board: 'bench' };
  return {
    items: MATCH.map(([match, id]) => ({ match, id, spot: id === 'spec:A' ? specSpot(0, n) : SPOTS[spot[id]!]! })),
    explain: explainer,
    procedure: [
      { spot: SPOTS.trays!, point: 'spec:A' },
      { spot: SPOTS.tools!, point: 'ruler' },
    ],
    observe: { spot: specSpot(0, n), point: 'spec:A' },
    observeTitle: 'What to look for',
  };
}

export const ASK_SUGGESTIONS: AskSuggestions = {
  LEARN: ['What is the difference between a feature and a function?', 'How do I classify these specimens?', 'Why use a hand lens?', 'How do I work out the magnification of a drawing?'],
  DEMO: ['Why measure from the zero, not the end of the ruler?', 'Why does magnification have no unit?', 'How do I write a good difference?', 'Why wear gloves?'],
  TRY: ['What should I look for with the hand lens?', 'How many features do I need?', 'How do I compare two specimens?', 'What is a good title for my drawing?'],
  SANDBOX: ['How do I tell these specimens apart?', 'What features show the group it belongs to?', 'Why is this one in a jar?', 'What is the adaptation here?'],
};
