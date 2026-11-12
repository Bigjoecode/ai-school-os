// A model reply that holds a first draft, a thinking pause and then the full answer must reach the
// student once (the tutor showed the same lesson twice when every text block was joined).
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/ai-final-text.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';
process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5432/none';

/* eslint-disable @typescript-eslint/no-require-imports */
const { finalText } = require('../src/ai/providers/anthropic.provider') as typeof import('../src/ai/providers/anthropic.provider');

test('only the answer after the last thinking block is kept', () => {
  const content = [
    { type: 'text', text: 'Past tense: add -ed. Bought is irregular.' },
    { type: 'thinking' },
    { type: 'text', text: 'Great, Emeka. Past tense: add -ed. bought is irregular.' },
  ];
  assert.equal(finalText(content), 'Great, Emeka. Past tense: add -ed. bought is irregular.');
});

test('text blocks next to each other are still joined', () => {
  assert.equal(finalText([{ type: 'text', text: 'One.' }, { type: 'text', text: 'Two.' }]), 'One.\nTwo.');
  assert.equal(finalText([{ type: 'thinking' }, { type: 'text', text: 'Answer.' }]), 'Answer.');
});

test('a reply that ends in a non-text block keeps its text', () => {
  assert.equal(finalText([{ type: 'text', text: 'Let me check.' }, { type: 'tool_use' }]), 'Let me check.');
  assert.equal(finalText([]), '');
});
