import { compFamily, emptyCompCodeState, type CompCodeState, type CompTask } from '@aischool/shared';
import { Armchair, Coffee, Droplets, Plug, Scissors } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer, type Explainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { SafetyContent } from '../../../lab3d-kit/safety';
import { defaultTourSteps } from '../../../lab3d-kit/tour';
import { CSPOT, spotOf } from './bench';
import { neededFor } from './scene-state';

/** The texts: "What is this?" cards, safety briefing, Learn, tour and Ask suggestions. */

const E: Record<string, Explainer> = {
  monitor: { name: 'Monitor', purpose: 'Shows your work: the output device you read from.', how: 'Top of the screen at eye level, about arm’s length away.', mistake: 'Sitting too close, or with a window glaring behind it.', keys: ['monitor', 'screen', 'eye'] },
  sysunit: { name: 'System unit', purpose: 'Holds the processor, memory, storage and power supply.', how: 'Switch on last, after the UPS and monitor. Shut down from the Start menu.', mistake: 'Pressing the power button to switch off while it is running.', keys: ['system unit', 'cable', 'back of'] },
  dvd: { name: 'DVD drive', purpose: 'Reads and writes optical discs with a laser.', how: 'A lens-cleaning disc cleans the lens.', mistake: 'Poking the lens with anything rough.', keys: ['dvd', 'lens'] },
  keyboard: { name: 'Keyboard', purpose: 'The main input device: you type your program with it.', how: 'Hands dry, wrists level.', mistake: 'Eating over it: crumbs jam the keys.', keys: ['keyboard', 'food', 'drink'] },
  mouse: { name: 'Mouse', purpose: 'Points and selects on the screen.', how: 'A clean surface.', mistake: 'Gripping it tightly for hours.', keys: ['mouse'] },
  ups: { name: 'Uninterruptible power supply (UPS)', purpose: 'A battery that keeps the computer running through a power cut.', how: 'Runtime = battery energy × efficiency ÷ load.', mistake: 'Running a printer or heater off it.', keys: ['ups', 'battery'] },
  card: { name: 'Task card', purpose: 'The question paper.', how: 'Read it first and again before you hand in.', mistake: 'Missing a part of the question.', keys: [] },
  book: { name: 'Practical notebook', purpose: 'Your record of results, tables and answers.', how: 'Copy the output exactly.', mistake: 'Writing what you expected instead of what was printed.', keys: ['record'] },
  crimper: { name: 'Crimping tool', purpose: 'Presses the plug’s pins through the wire insulation and locks the plug on the jacket.', how: 'Push the plug fully into the die, then squeeze firmly.', mistake: 'Crimping before every wire reaches the end of the plug.', keys: ['crimp', 'strip', 'plug'] },
  cable: { name: 'Cat 6 UTP cable', purpose: 'Eight wires in four twisted pairs.', how: 'Strip 2.5 cm of the jacket without nicking the wires.', mistake: 'Untwisting more than the plug needs.', keys: ['cable', 'twist', 'wire'] },
  tester: { name: 'Cable tester', purpose: 'Shows which pin reaches which at the far end.', how: 'Lights 1 to 8 in the same order on both units.', mistake: 'Taking a pass to mean the colours are standard: it only checks that they match.', keys: ['tester', 'test'] },
  cloth: { name: 'Microfibre cloth', purpose: 'Cleans screens without scratching.', how: 'Slightly damp, never wet.', mistake: 'Paper tissue: it scratches.', keys: ['cloth', 'screen', 'damp'] },
  brush: { name: 'Soft brush', purpose: 'Lifts dust from between the keys.', how: 'Keyboard upside down.', mistake: 'A hard brush on the circuit boards.', keys: ['brush'] },
  alcohol: { name: 'Isopropyl alcohol', purpose: 'Cleans keys and evaporates quickly.', how: 'On a cloth, never poured.', mistake: 'Using it near a flame or on the screen.', keys: ['alcohol', 'isopropyl'] },
  blower: { name: 'Air blower', purpose: 'Moves dust out of the vents and fans.', how: 'Hold the fans still with a finger or a stick.', mistake: 'Letting the fans spin.', keys: ['blow', 'fan', 'dust'] },
  lensDisc: { name: 'Lens-cleaning disc', purpose: 'Brushes the laser lens clean.', how: 'Play it like a normal disc.', mistake: 'Opening the drive.', keys: ['lens'] },
  pendrive: { name: 'USB flash drive', purpose: 'Portable storage.', how: 'Eject before removing it.', mistake: 'Pulling it out while it is writing.', keys: [] },
  extinguisher: { name: 'CO₂ fire extinguisher', purpose: 'For electrical fires.', how: 'Switch off the power and tell the teacher first.', mistake: 'Throwing water at live equipment.', keys: ['fire'] },
  firstaid: { name: 'First-aid box', purpose: 'Dressings for cuts.', how: 'Tell the teacher.', mistake: 'Hiding a cut.', keys: [] },
};
export const compExplainer = makeExplainer(E, {});

/** The bench as Mr Bayo sets it out for Learn (display only, never saved). */
export function learnState(task: CompTask): CompCodeState {
  const s = emptyCompCodeState();
  s.task = task;
  s.log = [{ t: 0, a: 'power:on' }, ...neededFor(task).map((a) => ({ t: 0, a: `collect:${a.id}` }))];
  return s;
}

export function learnConfig(task: CompTask): LearnConfig {
  const fam = compFamily(task);
  const monitor = spotOf(CSPOT.monitor, 0.24, 0.8, 0.1);
  const items: LearnConfig['items'] = [
    { match: /computer|interpreter|browser|text editor/i, id: 'monitor', spot: monitor },
    { match: /uti?p|cable|connector/i, id: 'cable', spot: spotOf(CSPOT.crimper, 0.04, 0.7, 0.6) },
    { match: /crimp|stripper/i, id: 'crimper', spot: spotOf(CSPOT.crimper, 0.03, 0.6, 0.6) },
    { match: /tester/i, id: 'tester', spot: spotOf(CSPOT.tester, 0.03, 0.6, 0.6) },
    { match: /ups/i, id: 'ups', spot: spotOf(CSPOT.ups, 0.08, 0.6, 0.3) },
    { match: /cloth|brush|alcohol|blower/i, id: 'cloth', spot: spotOf(CSPOT.kit, 0.04, 0.7, 0.5) },
    { match: /pencil|paper|graph|trace|ruler/i, id: 'book', spot: spotOf(CSPOT.book, 0.02, 0.55, 0.7) },
  ];
  const first = fam === 'BENCH' ? { spot: spotOf(CSPOT.tester, 0.1, 1.1, 0.5), point: task === 'CRIMP' ? 'crimper' : 'sysunit' } : { spot: monitor, point: 'monitor' };
  return {
    items,
    explain: compExplainer,
    procedure: [first, { spot: spotOf(CSPOT.keyboard, 0.03, 0.75, 0.55), point: 'keyboard' }],
    observe: { spot: monitor, point: 'monitor' },
    observeTitle: 'What you should see',
    dataCard: fam === 'BENCH' ? undefined : { kicker: 'Results', title: 'Worked results', speech: 'Here are the results this lesson works out.' },
  };
}

export function compSafety(task: CompTask): SafetyContent {
  const workshop = task === 'CRIMP';
  return {
    cards: [
      { icon: <Coffee className="size-6" />, title: 'Food and drink', lines: ['No food or drink in the computer room: a spill can short-circuit a keyboard or system unit.'], lessonMatch: /food|drink/i },
      { icon: <Plug className="size-6" />, title: 'Electricity', lines: ['Dry hands near sockets and cables.', 'Report frayed cables: do not touch them.'], lessonMatch: /socket|cable|wet/i },
      { icon: <Armchair className="size-6" />, title: 'Posture and eyes', lines: ['Sit upright, screen at eye level and arm’s length.', 'Rest your eyes every 20 minutes.'], lessonMatch: /posture|upright|eye/i },
      workshop ? { icon: <Scissors className="size-6" />, title: 'Sharp tools', lines: ['Keep your fingers clear of the crimper’s blades.', 'Wire ends are sharp: clear the offcuts.'], lessonMatch: /blade|cut/i } : { icon: <Droplets className="size-6" />, title: 'Liquids and power', lines: ['Shut down and switch off at the wall before cleaning anything.', 'A damp cloth, never a wet one.'], lessonMatch: /clean|damp/i },
    ],
    questions: [
      { q: 'You want a drink while you work. What do you do?', options: [{ label: 'Keep the bottle beside the keyboard', aria: 'keep', right: false, why: 'One knock and it is in the keyboard.' }, { label: 'Leave it outside the computer room', aria: 'outside', right: true, why: 'Right.' }] },
      { q: 'You notice a frayed cable behind your computer.', options: [{ label: 'Tuck it out of sight', aria: 'tuck', right: false, why: 'The bare wire is still live.' }, { label: 'Leave it alone and tell the teacher', aria: 'tell', right: true, why: 'Right.' }] },
    ],
  };
}

const FOCUS: Record<'BASIC' | 'FLOW' | 'HTML' | 'BENCH', [string, string]> = { BASIC: ['monitor', 'Monitor'], FLOW: ['monitor', 'Monitor'], HTML: ['monitor', 'Monitor'], BENCH: ['sysunit', 'System unit'] };
export const compTour = (task: CompTask) => {
  const [focusId, focusLabel] = FOCUS[compFamily(task)];
  return defaultTourSteps({ focusId, focusLabel });
};

export const COMP_ASK: Record<CompTask, AskSuggestions> = {
  BASIC_IO: { LEARN: ['What does LET do?', 'Why number lines in tens?', 'What does the semicolon do in PRINT?', 'What is the difference between INPUT and READ?'], DEMO: ['Why are brackets needed here?', 'What does REM do?', 'Why does INPUT show a question mark?', 'What does END do?'], TRY: ['Why do I get a Syntax error?', 'How do I print words and a number together?', 'How do I save my program?', 'What precautions can I write?'], SANDBOX: ['What happens if I leave out END?', 'What does Redo from start mean?', 'Can a variable name be a word?', 'What happens if I divide by zero?'] },
  BASIC_LOOP: { LEARN: ['How does FOR-NEXT work?', 'What does STEP do?', 'How do READ and DATA work together?', 'What is a trace table?'], DEMO: ['Why set S to 0 first?', 'Why is PRINT after NEXT?', 'What does the pointer in DATA do?', 'How many times does the loop run?'], TRY: ['What does Out of DATA mean?', 'How do I fill in a trace table?', 'How do I find how many passes a loop makes?', 'What precautions can I write?'], SANDBOX: ['What if STEP is negative?', 'What if the start is past the end?', 'Can loops be nested?', 'What does RESTORE do?'] },
  BASIC_ARRAY: { LEARN: ['What is an array?', 'What does DIM do?', 'What is a subscript?', 'Why use an array instead of ten variables?'], DEMO: ['Why start BIG at N(1)?', 'Why does the second loop start at 2?', 'How does STEP -1 work?', 'Why READ into N(I)?'], TRY: ['What does Subscript out of range mean?', 'How do I print in reverse?', 'How do I find the smallest value?', 'What precautions can I write?'], SANDBOX: ['What if I leave out DIM?', 'Can an array hold words?', 'What is a two-dimensional array?', 'How would I sort an array?'] },
  BASIC_FUNC: { LEARN: ['What does INT do to negative numbers?', 'What does ABS do?', 'Why does SIN need radians?', 'What is a built-in function?'], DEMO: ['Why is SIN(180) not exactly 0?', 'How do I change degrees to radians?', 'What is the STEP for?', 'How do I round to 2 places?'], TRY: ['How do I plot the table?', 'How do I print on one line?', 'What is SQR?', 'What precautions can I write?'], SANDBOX: ['What does RND do?', 'What is LOG in BASIC?', 'How does TAB work?', 'What does SGN do?'] },
  BASIC_WHILE: { LEARN: ['What is desk checking?', 'How does WHILE differ from FOR?', 'What are the steps of program development?', 'What is compound interest?'], DEMO: ['Why does the condition use <=?', 'Why count the years in Y?', 'What would make this loop endless?', 'What does documentation mean?'], TRY: ['How do I fill the desk-check table?', 'Why did my program never stop?', 'How do I add 10% to M?', 'What precautions can I write?'], SANDBOX: ['What happens if M already passes T?', 'Can WHILE loops be nested?', 'How does DO UNTIL differ?', 'How do I break out of a loop?'] },
  FLOW: { LEARN: ['What are the flowchart symbols?', 'What makes a good algorithm?', 'Why use a counter?', 'What is a dry run?'], DEMO: ['Why does the arrow go back?', 'Why set COUNT to 0?', 'What goes in the diamond?', 'Why two exits?'], TRY: ['How do I connect two boxes?', 'How do I label YES and NO?', 'What should I write in the box?', 'What precautions can I write?'], SANDBOX: ['What if a decision has no NO arrow?', 'What does a connector do?', 'Can a chart have two STOPs?', 'How is a flowchart turned into BASIC?'] },
  HTML: { LEARN: ['What is a URL?', 'What does the head hold?', 'How do HTTP and HTML differ?', 'What are the parts of a domain name?'], DEMO: ['Why does the title show on the tab?', 'Why close every tag?', 'What does ul stand for?', 'What is a hyperlink?'], TRY: ['How do I make a hyperlink?', 'How do I make a bulleted list?', 'How do I work out the load time?', 'What precautions can I write?'], SANDBOX: ['What if I forget a closing tag?', 'How do I add a table?', 'How do I change the colour?', 'What does img need?'] },
  CRIMP: { LEARN: ['What is the T568B order?', 'What is UTP?', 'What is a straight-through cable?', 'Why are the wires twisted?'], DEMO: ['Why slide the boots on first?', 'Why trim to 1.3 cm?', 'Why must the clip face down?', 'What does crimping do?'], TRY: ['How do I read the cable tester?', 'How many plugs do I need?', 'How do I work out the cable length?', 'What precautions can I write?'], SANDBOX: ['What if I flip one plug?', 'What if I trim too short?', 'What is a crossover cable?', 'What is T568A?'] },
  MAINT: { LEARN: ['Why does dust harm a computer?', 'What does a UPS do?', 'What does Disk Cleanup do?', 'How often should I back up?'], DEMO: ['Why shut down before unplugging?', 'Why hold the fans still?', 'Why isopropyl alcohol?', 'How do I work out UPS runtime?'], TRY: ['How do I find the energy in the battery?', 'When should the battery be replaced?', 'What does efficiency mean here?', 'What precautions can I write?'], SANDBOX: ['What if I clean it while it is on?', 'What is VA on a UPS?', 'Why not back up to the same disk?', 'What does defragmenting do?'] },
};
