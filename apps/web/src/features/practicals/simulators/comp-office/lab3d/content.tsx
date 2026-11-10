import type { CoFamily, CoTask } from '@aischool/shared';
import { Armchair, Plug, ShieldCheck, Utensils } from 'lucide-react';
import type { AskSuggestions } from '../../../lab3d-kit/ask';
import { makeExplainer } from '../../../lab3d-kit/explain';
import type { LearnConfig } from '../../../lab3d-kit/learn';
import type { SafetyContent } from '../../../lab3d-kit/safety';
import { STATION } from '../../../lab3d-kit/layout';
import type { Spot } from '../../../lab3d-kit/store';
import { defaultTourSteps, type TourStep } from '../../../lab3d-kit/tour';
import { SPOT } from './scene';

/** Learn, the "What is this?" cards, the safety briefing, the tour and Ask for the computer room. */

export const officeExplainer = makeExplainer(
  {
    monitor: { name: 'Monitor', purpose: 'The output device: it shows the application you are using.', how: 'Tap it and choose Use the computer to work on the screen.', mistake: 'Sitting too close, or with the screen above eye level, which strains the eyes and neck.', keys: ['monitor', 'screen', 'computer'] },
    keyboard: { name: 'Keyboard', purpose: 'The main input device: letters, numbers and shortcut keys such as Ctrl+S.', how: 'Type with the fingers on the home keys; press Enter to confirm a cell or end a paragraph.', mistake: 'Pressing Enter at the end of each line of a paragraph: let word wrap do that.', keys: ['keyboard', 'type'] },
    mouse: { name: 'Mouse', purpose: 'The pointing device: click to select, drag to select a range.', how: 'Click a cell, drag across cells, double-click to open.', mistake: 'Clicking twice very fast when one click is enough.', keys: ['mouse', 'click'] },
    tower: { name: 'System unit', purpose: 'The case that holds the processor, memory and storage: it runs the applications.', how: 'Press the power button after switching on the UPS and monitor.', mistake: 'Switching off at the wall instead of shutting down, which can damage open files.', keys: ['system unit', 'computer', 'processor'] },
    ups: { name: 'UPS', purpose: 'Keeps the computer running for a few minutes in a power cut, and protects it from surges.', how: 'Switch it on first, then the computer. If NEPA goes off, save and shut down.', mistake: 'Plugging the printer into the UPS: its heater can overload it.', keys: ['ups', 'surge', 'power'] },
    printer: { name: 'Printer', purpose: 'The output device for paper copies.', how: 'Use Print Preview first, then choose the number of copies.', mistake: 'Printing without a preview and wasting paper.', keys: ['printer', 'print', 'preview'] },
    flash: { name: 'Flash drive', purpose: 'Portable storage for a backup of your work.', how: 'Copy to it, then Eject before pulling it out.', mistake: 'Pulling it out without Eject can corrupt files.', keys: ['flash'] },
    paper: { name: 'A4 paper', purpose: 'The paper for your printouts: 21.0 cm × 29.7 cm.', how: 'Load it in the printer tray with the edges square.', mistake: 'Printing on one side of a whole ream by mistake.', keys: ['a4', 'paper'] },
  },
  { 'cup:flash': 'flash', 'cup:paper': 'paper' },
);

export const officeSafety: SafetyContent = {
  cards: [
    { icon: <Utensils className="size-6" />, title: 'In the computer room', lines: ['No food or drink near the machines.', 'Bags under the bench, aisles clear.', 'Report a fault or a burning smell at once.'] },
    { icon: <Plug className="size-6" />, title: 'Electricity', lines: ['Dry hands on plugs and switches.', 'Never open the system unit or touch a bare wire.', 'Use the UPS or surge protector; shut down properly.'] },
    { icon: <Armchair className="size-6" />, title: 'Your body', lines: ['Sit up straight with your feet flat and your eyes level with the top of the screen.', 'Look away from the screen every 20 minutes.'] },
    { icon: <ShieldCheck className="size-6" />, title: 'Your work and your safety', lines: ['Save early and often; keep a backup.', 'Never share a password, and never open attachments from strangers.', 'Everything online in this lab is simulated and offline.'] },
  ],
  questions: [
    { q: 'NEPA has just gone off and the UPS is beeping. What do you do first?', options: [{ label: 'Save your work and shut down', aria: 'save', right: true, why: 'Right: the UPS gives you a few minutes to save and shut down properly.' }, { label: 'Keep typing until the light comes back', aria: 'keep typing', right: false, why: 'The UPS battery only lasts minutes. Save and shut down.' }, { label: 'Pull out the plug', aria: 'pull plug', right: false, why: 'You would lose unsaved work. Save and shut down first.' }] },
    { q: 'An e-mail says you have won a prize and asks for your password. What do you do?', options: [{ label: 'Send the password', aria: 'send it', right: false, why: 'No real prize asks for a password. It is a scam.' }, { label: 'Mark it as spam and tell the teacher', aria: 'spam', right: true, why: 'Right: it is phishing. Never reply and never click its links.' }, { label: 'Click the link to look', aria: 'click', right: false, why: 'The link can steal details or install a virus.' }] },
  ],
};

const near = (p: readonly [number, number, number], y: number, dist: number, pitch: number): Spot => ({ target: [p[0], y, p[2]], dist, pitch });
export const SCREEN_SPOT: Spot = near(SPOT.monitor, 0.3, 0.85, 0.06);
export const learnConfig = (): LearnConfig => ({
  items: [
    { match: /computer|laptop|desktop/i, id: 'monitor', spot: SCREEN_SPOT },
    { match: /printer/i, id: 'printer', spot: near(SPOT.printer, 0.1, 0.8, 0.35) },
    { match: /flash|storage/i, id: 'tower', spot: near(SPOT.tower, 0.18, 0.9, 0.3) },
    { match: /keyboard|mouse/i, id: 'keyboard', spot: near(SPOT.keyboard, 0.02, 0.6, 0.7) },
  ],
  explain: officeExplainer,
  procedure: [{ spot: SCREEN_SPOT, point: 'monitor' }, { spot: near(SPOT.keyboard, 0.02, 0.6, 0.7), point: 'keyboard' }],
  observe: { spot: SCREEN_SPOT, point: 'monitor' },
  observeTitle: 'What you should see',
  dataCard: { kicker: 'Worked example', title: 'The numbers', speech: 'Here is a worked example with sample data. Your own data will be different.' },
});

export const officeTour = (): TourStep[] =>
  defaultTourSteps({ focusId: 'screen', focusLabel: 'Screen', readLabel: 'Use the computer', readText: '“Use the computer” sits you at the screen: the application opens and you work in it. Back to the room brings you back here.' }).map((s) =>
    s.id === 'welcome' ? { ...s, title: 'Welcome to the computer room', body: () => 'This is your school computer room in 3D. A one-minute tour shows you how to move and work. You can skip it and replay it any time from the menu.' } : s,
  );

const BY_FAMILY: Record<CoFamily, string[]> = {
  SHEET: ['Why does a formula start with =?', 'What does the $ do in a cell reference?', 'Why does my cell show #####?'],
  DOC: ['What does justified text mean?', 'What is the difference between Save and Save As?', 'What is a merge field?'],
  DB: ['What is a primary key?', 'What does referential integrity stop?', 'What is the difference between AND and OR in a query?'],
  DECK: ['What is the difference between a transition and an animation?', 'What is a slide master for?', 'How many words should a slide have?'],
  FILES: ['What is a full file path?', 'Why must I eject a flash drive?', 'What is the difference between Copy and Cut?'],
  NET: ['What does https mean?', 'How can I tell a scam message?', 'What is the difference between Cc and Bcc?'],
};
export const officeAsk = (family: CoFamily): AskSuggestions => ({ LEARN: BY_FAMILY[family], DEMO: BY_FAMILY[family], TRY: BY_FAMILY[family], SANDBOX: BY_FAMILY[family] });
export const SANDBOX_IDEAS: Record<CoFamily, string> = {
  SHEET: 'Try a formula without =, divide by an empty cell, copy a formula with and without $, or chart the total row by mistake.',
  DOC: 'Change margins and watch the text re-flow, or merge with the blank row still in the list.',
  DB: 'Try a duplicate key, break a validation rule, or move a criterion to the or row and compare the results.',
  DECK: 'Try every transition, or put too much text on a slide and run the show.',
  FILES: 'Delete something on the flash drive and look for it in the Recycle Bin.',
  NET: 'Search with and without quotes, try the unsafe download, and send a message that is over the size limit.',
};
export const TASK_NOTE = (t: CoTask) => t;
export { STATION };
