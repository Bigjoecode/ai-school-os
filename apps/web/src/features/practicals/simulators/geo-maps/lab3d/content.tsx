import { emptyGeoMapsState, type GeoMapsState, type GeoTask, type GeoVariant } from '@aischool/shared';
import { Compass, Pencil } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { SafetyContent } from '../../../lab3d-kit/safety';
import { defaultTourSteps, type TourStep } from '../../../lab3d-kit/tour';
import { isMapTask } from '../actions';
import { GSPOT, neededFor, spotOf } from './bench';

/** The geography lab's texts: "What is this?" cards, the door briefing, Learn, the tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  map: { name: 'The topographical sheet', purpose: 'A fictional map at a stated scale: contours for relief, a grid for location, a key for symbols.', how: 'Read the margin first: scale, contour interval and key. Open it to measure.', mistake: 'Starting to measure before you know the scale.', keys: ['map'] },
  ruler: { name: '30 cm ruler', purpose: 'Measures straight distances on the map to the nearest millimetre.', how: 'Zero on the point, the edge through the other point, and read straight on.', mistake: 'Reading from the end of the ruler instead of the zero mark.', keys: ['ruler', 'straight'] },
  thread: { name: 'Thread', purpose: 'Follows a curved road or river so its length can be measured.', how: 'Lay it along every bend, mark the end, straighten it against the ruler.', mistake: 'Cutting corners, which makes the route too short.', keys: ['thread', 'string', 'curved'] },
  dividers: { name: 'Pair of dividers', purpose: 'Walks a curved route in small equal steps.', how: 'Set a small span, step along the route and count: steps × span = distance.', mistake: 'A wide span: it cuts across the bends.', keys: ['dividers'] },
  protractor: { name: 'Protractor', purpose: 'Measures bearings on the map and sector angles in a pie chart.', how: 'Centre on the point you measure FROM, 0° on north; read clockwise.', mistake: 'Measuring from the wrong point, or anticlockwise.', keys: ['protractor', 'bearing'] },
  romer: { name: 'Tenths square', purpose: 'Divides a grid square into tenths for six-figure references.', how: 'Set it on the grid lines to the left of and below the feature.', mistake: 'Using the lines to the right or above.', keys: ['grid', 'tenths', 'reference'] },
  pins: { name: 'Map pins', purpose: 'Mark features as you find and count them.', how: 'One pin each, so nothing is counted twice.', mistake: 'Counting without marking.', keys: ['count'] },
  strip: { name: 'Paper strip', purpose: 'Carries every contour on a section line from the map to the graph paper.', how: 'Lay its straight edge along the line; tick each contour with its value.', mistake: 'Missing a contour, or moving the strip while marking.', keys: ['strip', 'profile', 'cross'] },
  pencil: { name: 'Sharp HB pencil and eraser', purpose: 'Fine lines keep your measurements accurate.', how: 'Keep it sharp; rub out neatly.', mistake: 'A blunt pencil: a thick line can hide a whole millimetre.', keys: ['pencil'] },
  calculator: { name: 'Calculator', purpose: 'For conversions and statistics.', how: 'Write each step in your notebook: marks are given for method.', mistake: 'Writing only the final answer.', keys: ['calculat'] },
  compasses: { name: 'Pair of compasses', purpose: 'Draws pie charts and proportional circles.', how: 'Set the radius against the ruler.', mistake: 'Letting the legs slip while drawing.', keys: ['compass', 'circle'] },
  colours: { name: 'Coloured pencils', purpose: 'Shading for bars, sectors and density classes.', how: 'A graded shading: light for low, dark for high.', mistake: 'Random colours that have no order.', keys: ['colour', 'shad'] },
  atlas: { name: 'Atlas', purpose: 'Gives the latitude and longitude of places.', how: 'Use the index, then read the grid.', mistake: 'Mixing up north and south.', keys: ['atlas'] },
  globe: { name: 'Globe', purpose: 'Shows parallels and meridians as they really are.', how: 'Turn it west to east, as the earth turns.', mistake: 'Forgetting that the sun reaches the east first.', keys: ['globe', 'longitude', 'latitude'] },
  card: { name: 'Question paper', purpose: 'The exercise, and its data tables.', how: 'Read it first, and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Notebook', purpose: 'Your readings, working and answers: this is what is marked.', how: 'Write each reading as you take it.', mistake: 'Answers with no units.', keys: [] },
};
export const geoExplainer = makeExplainer(E, {});

/** The desk as Mr Eze sets it out for Learn (display only, never saved). */
export function learnState(v: GeoVariant): GeoMapsState {
  const s = emptyGeoMapsState();
  s.task = v.task;
  s.log = neededFor(v).map((a) => ({ t: 0, a: `collect:${a}` }));
  return s;
}

export function learnConfig(v: GeoVariant): LearnConfig {
  const mapSpot = spotOf(GSPOT.map, 0.02, 0.86, 1.05);
  const items: LearnConfig['items'] = [
    { match: /ruler/i, id: 'ruler', spot: spotOf(GSPOT.ruler, 0.01, 0.45, 0.9) },
    { match: /protractor/i, id: 'protractor', spot: spotOf(GSPOT.protractor, 0.01, 0.4, 0.9) },
    { match: /dividers/i, id: 'dividers', spot: spotOf(GSPOT.dividers, 0.01, 0.4, 0.9) },
    { match: /thread|string/i, id: 'thread', spot: spotOf(GSPOT.thread, 0.02, 0.4, 0.8) },
    { match: /pencil/i, id: 'pencil', spot: spotOf(GSPOT.pencil, 0.01, 0.4, 0.9) },
    { match: /calculator/i, id: 'calculator', spot: spotOf(GSPOT.calculator, 0.01, 0.4, 0.9) },
    { match: /compasses/i, id: 'compasses', spot: spotOf(GSPOT.compasses, 0.01, 0.4, 0.9) },
    { match: /coloured/i, id: 'colours', spot: spotOf(GSPOT.colours, 0.05, 0.5, 0.6) },
    { match: /globe/i, id: 'globe', spot: spotOf(GSPOT.globe, 0.1, 0.6, 0.3) },
    { match: /map|graph paper|exercise/i, id: 'map', spot: mapSpot },
  ];
  return {
    items,
    explain: geoExplainer,
    procedure: [
      { spot: mapSpot, point: 'map' },
      { spot: spotOf(GSPOT.thread, 0.02, 0.6, 0.7), point: 'map' },
    ],
    observe: { spot: mapSpot, point: 'map' },
    observeTitle: isMapTask(v.task) ? 'What the map shows' : 'What the diagram shows',
    dataCard: { kicker: 'Worked example', title: 'The working', speech: 'Look at how each step is set out. Marks are given for method.' },
  };
}

export const GEO_SAFETY: SafetyContent = {
  cards: [
    { icon: <Pencil className="size-6" />, title: 'At your desk', lines: ['Bags under the desk, aisles clear.', 'Handle maps carefully: do not fold them along new lines.'], lessonMatch: /map|paper/i },
    { icon: <Compass className="size-6" />, title: 'Sharp instruments', lines: ['Dividers and compasses have sharp points: carry them closed, pointing down.', 'Put them back in their tin when you finish.'] },
  ],
  questions: [
    {
      q: 'How do you carry dividers or compasses across the room?',
      options: [
        { label: 'Closed, points down', aria: 'closed', right: true, why: 'Right: the points cannot catch anyone.' },
        { label: 'Open, to save time', aria: 'open', right: false, why: 'Open points can injure someone in a crowded room.' },
        { label: 'In your pocket, points up', aria: 'pocket', right: false, why: 'Points up in a pocket will stab you.' },
      ],
    },
    {
      q: 'How do you treat a map sheet?',
      options: [
        { label: 'Keep it flat; fold only on its folds', aria: 'flat', right: true, why: 'Right: new folds spoil the map and stretch the distances.' },
        { label: 'Fold it to fit your book', aria: 'fold', right: false, why: 'New folds spoil it for the next student.' },
        { label: 'Write the answers on it in pen', aria: 'pen', right: false, why: 'Use a sharp pencil, lightly, and only where allowed.' },
      ],
    },
  ],
};

export const geoTour = (v: GeoVariant): TourStep[] =>
  defaultTourSteps({ focusId: 'map', focusLabel: 'The sheet', readLabel: isMapTask(v.task) ? 'Work on the map' : 'Work on the paper', readText: 'the instruments and your sheet' }).map((s) =>
    s.id === 'welcome'
      ? { ...s, title: 'Welcome to the geography room', body: () => 'This is a classroom with your map sheet on the desk. A one-minute tour shows you how to move and work. The real work happens close up, on the paper. You can skip it and replay it any time from the menu.' }
      : s.id === 'task'
        ? { ...s, body: () => 'The question paper lists the exercise and its data. Open it now.' }
        : s,
  );

const MAP_ASK: AskSuggestions = {
  LEARN: ['What is a representative fraction?', 'How do contours show height?', 'What is a grid reference?', 'Why do we use thread for curves?'],
  DEMO: ['Why measure from the point stated?', 'How do I read a six-figure reference?', 'Why does the V point uphill in a valley?', 'How do I convert cm to km?'],
  TRY: ['How do I convert the map distance to km?', 'What precautions can I write?', 'How do I read the ruler accurately?', 'Which way do the contours rise?'],
  SANDBOX: ['What happens with a wider divider span?', 'Why are contours crowded here?', 'What does a change of scale do?', 'What if I measure from the wrong point?'],
};
const CHART_ASK: AskSuggestions = {
  LEARN: ['When is a line graph better than bars?', 'Why start the scale at zero?', 'What does a key do?', 'How do I choose a scale?'],
  DEMO: ['Why that scale?', 'Why are the angles out of 360?', 'Why a square root for circles?', 'Why are the classes graded?'],
  TRY: ['How do I work out the mean?', 'What precautions can I write?', 'How do I check my angles?', 'What should the title say?'],
  SANDBOX: ['What if the scale does not start at zero?', 'What if the radius equals the value?', 'What if I use random colours?', 'What makes a good scale?'],
};
export const geoAsk = (t: GeoTask) => (isMapTask(t) ? MAP_ASK : CHART_ASK);
