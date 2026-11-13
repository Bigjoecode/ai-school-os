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

const { cleanDiagram, diagramSchema } = require('@aischool/shared') as typeof import('@aischool/shared');

test('an AI drawing counts as the picture', () => {
  const diagram = { elements: [{ t: 'circle', cx: 200, cy: 150, r: 60, fill: 'green' }, { t: 'text', x: 200, y: 60, text: 'Leaf', size: 'm', anchor: 'middle', bold: false }] };
  assert.doesNotThrow(() => missingPicture([{ kind: 'IMAGE', title: 'Leaf', fileId: null, diagram }]));
  assert.throws(() => missingPicture([{ kind: 'IMAGE', title: 'Leaf', fileId: null, diagram: { elements: [{ t: 'script' }] } }]), /Upload the picture/);
});

test('the AI drawing is tidied: kept on the canvas, labels shortened, unknown shapes dropped', () => {
  const d = cleanDiagram({
    elements: [
      { t: 'rect', x: -40, y: 20, w: 900, h: 50, fill: 'javascript:alert(1)' },
      { t: 'text', x: 10, y: 400, text: 'x'.repeat(200), size: 'huge', anchor: 'middle', bold: true },
      { t: 'foreignObject', html: '<img src=x onerror=alert(1)>' },
      { t: 'line', x1: 0, y1: 0, x2: Number.NaN, y2: 5, arrow: 'end', dashed: false },
    ],
  });
  assert.ok(d);
  assert.equal(d.elements.length, 2);
  assert.deepEqual(d.elements[0], { t: 'rect', x: 0, y: 20, w: 400, h: 50, fill: 'none' });
  assert.equal(d.elements[1]!.t === 'text' && d.elements[1].text.length, 60);
  assert.equal(d.elements[1]!.t === 'text' && d.elements[1].y, 300);
  assert.equal(diagramSchema.safeParse(d).success, true);
  assert.equal(cleanDiagram({ elements: [{ t: 'text', x: 1, y: 1, text: 'only one', size: 'm', anchor: 'start', bold: false }] }), null);
});

test('a saved step only takes a valid diagram, and only on a picture step', () => {
  const diagram = { elements: [{ t: 'circle', cx: 20, cy: 20, r: 10, fill: 'blue' }, { t: 'circle', cx: 60, cy: 20, r: 10, fill: 'red' }] };
  assert.equal(moduleStepSchema.safeParse({ kind: 'NOTE', title: 'N', body: 'x', diagram }).success, false);
  assert.equal(moduleStepSchema.safeParse({ kind: 'IMAGE', title: 'P', diagram: { elements: [{ t: 'circle', cx: 9999, cy: 1, r: 1, fill: 'blue' }, diagram.elements[0]] } }).success, false);
  assert.equal(moduleStepSchema.safeParse({ kind: 'IMAGE', title: 'P', diagram }).success, true);
});
