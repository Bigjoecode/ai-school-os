// AI-drafted lessons can suggest pictures as empty picture steps; those must never reach students.
// Run: cd apps/api && node -r ts-node/register/transpile-only --test test/module-pictures.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.JWT_SECRET ??= 'local-test-secret-local-test-secret';
process.env.DATABASE_URL ??= 'postgresql://x:y@localhost:5432/none';

/* eslint-disable @typescript-eslint/no-require-imports */
const { missingPicture } = require('../src/lesson-modules/modules.service') as typeof import('../src/lesson-modules/modules.service');
const { moduleStepSchema } = require('@aischool/shared') as typeof import('@aischool/shared');

test('a draft may keep a picture step that waits for its picture', () => {
  const r = moduleStepSchema.safeParse({ kind: 'IMAGE', title: 'Diagram: parts of a leaf', body: 'A leaf with its parts labelled.' });
  assert.equal(r.success, true);
});

test('publishing (or saving a published module) refuses an empty picture step', () => {
  assert.throws(
    () => missingPicture([{ kind: 'NOTE', title: 'Intro' }, { kind: 'IMAGE', title: 'Diagram: parts of a leaf', fileId: null }]),
    /Upload the picture for "Diagram: parts of a leaf"/,
  );
  assert.doesNotThrow(() => missingPicture([{ kind: 'IMAGE', title: 'Leaf', fileId: 'f1' }, { kind: 'NOTE', title: 'Intro' }]));
});
