import assert from 'node:assert/strict';
import test from 'node:test';
import { buildXIntent, normalizeCaptureRect, screenshotFileName } from '../desktop/share-utils.js';

test('keeps the screenshot rectangle inside the window', () => {
  assert.deepEqual(
    normalizeCaptureRect({ x: -4.8, y: 12.2, width: 1_400.4, height: 900 }, { width: 1_180, height: 760 }),
    { x: 0, y: 12, width: 1_180, height: 748 },
  );
  assert.deepEqual(
    normalizeCaptureRect({ x: 1_179, y: 759, width: 0, height: 0 }, { width: 1_180, height: 760 }),
    { x: 1_179, y: 759, width: 1, height: 1 },
  );
});

test('creates a stable screenshot name and safe X intent', () => {
  assert.equal(
    screenshotFileName(new Date('2026-08-13T12:34:56.789Z')),
    'Prompt-Contribution-Graph-activity-2026-08-13T12-34-56Z.png',
  );
  const intent = new URL(buildXIntent('A'.repeat(300)));
  assert.equal(intent.origin + intent.pathname, 'https://x.com/intent/tweet');
  assert.equal(intent.searchParams.get('text').length, 240);
  assert.equal(intent.searchParams.get('url'), 'https://github.com/chintan-diwakar/prompt-contribution-graph');
});
