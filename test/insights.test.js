import assert from 'node:assert/strict';
import test from 'node:test';
import { createDailyInsight, createShareText } from '../src/public/insights.js';

const now = new Date(2026, 7, 13, 12);

function summary(overrides = {}) {
  return {
    total: 12,
    today: 3,
    currentStreak: 1,
    longestStreak: 5,
    daily: [
      { date: '2026-08-12', count: 1 },
      { date: '2026-08-13', count: 3 },
    ],
    ...overrides,
  };
}

test('creates a useful daily insight for each activity state', () => {
  assert.equal(createDailyInsight(summary({ total: 0, today: 0, currentStreak: 0, longestStreak: 0, daily: [] }), now),
    'Your trail is ready. One prompt starts today’s activity.');
  assert.equal(createDailyInsight(summary({ today: 0, currentStreak: 3, daily: [{ date: '2026-08-12', count: 2 }] }), now),
    'One prompt today keeps your 3-day streak alive.');
  assert.equal(createDailyInsight(summary({ currentStreak: 5, longestStreak: 5 }), now),
    'Personal best: your 5-day streak is still growing.');
  assert.equal(createDailyInsight(summary(), now), 'You are 2 prompts ahead of yesterday.');
  assert.equal(createDailyInsight(summary({ today: 1 }), now), 'You matched yesterday with 1 prompt today.');
});

test('creates a count-only share message', () => {
  const activity = summary();
  const insight = createDailyInsight(activity, now);
  const message = createShareText(activity, insight);
  assert.match(message, /3 prompts today/);
  assert.match(message, /1-day streak/);
  assert.match(message, /12 all time/);
  assert.doesNotMatch(message, /project|response|tool/i);
});
