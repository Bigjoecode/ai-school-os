// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/practicals-ask.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { practicalAskSchema } from '@aischool/shared';
import { askPrompt, lessonBrief } from '../src/practicals/ask';

const lesson = {
  aim: 'To determine the concentration of sodium hydroxide by titration.',
  apparatus: ['50 cm³ burette', '25.0 cm³ pipette with pipette filler'],
  safety: ['Always use a pipette filler — never pipette by mouth.'],
  procedure: ['Rinse the burette with a little of A and fill it.'],
  precautions: ['Read the bottom of the meniscus at eye level.'],
  commonMistakes: ['Including the rough titre in the average.'],
  dataAndCalculations: 'Mean titre = 24.85 cm³.',
};

test('the prompt is grounded in the lesson and refuses the student’s own numbers', () => {
  const { system, messages } = askPrompt('Acid–base titration', lesson, { question: 'Why rinse the burette with the acid?', stage: 'TRY', step: 'Rinse the burette with acid A' });
  assert.match(system, /Mrs Ada/);
  assert.match(system, /British English/);
  assert.match(system, /Never work out, guess or confirm the numbers/);
  assert.match(system, /AIM: To determine the concentration/);
  assert.match(system, /never pipette by mouth/);
  assert.match(system, /WORKED EXAMPLE \(sample data from the lesson\): Mean titre = 24\.85/);
  assert.equal(messages.length, 1);
  assert.match(messages[0]!.content, /practice lab with their own values/);
  assert.match(messages[0]!.content, /Their current step: Rinse the burette with acid A\./);
  assert.match(messages[0]!.content, /Question: Why rinse the burette with the acid\?$/);
});

test('the assistant and subject follow the practical', () => {
  const phy = askPrompt('Simple pendulum', lesson, { question: 'Why time 20 swings?', stage: 'TRY' }, 'Physics').system;
  assert.match(phy, /You are Mr Bayo/);
  assert.match(phy, /WAEC Physics practical/);
  assert.match(phy, /standard school Physics/);
  assert.match(askPrompt('Microscope', lesson, { question: 'q', stage: 'LEARN' }, 'Biology').system, /You are Mrs Okon/);
});

test('history becomes earlier turns, newest question last', () => {
  const { messages } = askPrompt('T', lesson, { question: 'And the pipette?', stage: 'DEMO', history: [{ q: 'Why rinse the burette?', a: 'So water does not dilute A.' }] });
  assert.deepEqual(
    messages.map((m) => m.role),
    ['user', 'assistant', 'user'],
  );
  assert.match(messages[2]!.content, /demonstration/);
});

test('the lesson brief skips missing sections and is capped', () => {
  const brief = lessonBrief('T', { aim: 'x'.repeat(20_000) });
  assert.ok(brief.length <= 9000);
  assert.doesNotMatch(lessonBrief('T', { aim: 'A' }), /SAFETY/);
});

test('the request schema keeps questions short and stages known', () => {
  assert.equal(practicalAskSchema.safeParse({ question: 'Why?', stage: 'LEARN' }).success, true);
  assert.equal(practicalAskSchema.safeParse({ question: 'x'.repeat(401), stage: 'LEARN' }).success, false);
  assert.equal(practicalAskSchema.safeParse({ question: 'Why?', stage: 'EXAM' }).success, false);
  assert.equal(practicalAskSchema.safeParse({ question: 'Why?', stage: 'TRY', history: Array.from({ length: 5 }, () => ({ q: 'a', a: 'b' })) }).success, false);
});
