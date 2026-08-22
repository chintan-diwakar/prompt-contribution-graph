import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../src/database.js';

function temporaryDatabase(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompttrail-db-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  t.after(() => database.close());
  return database;
}

test('stores prompts and calculates daily streaks', (t) => {
  const database = temporaryDatabase(t);
  const now = new Date(2026, 7, 13, 12).getTime();
  const yesterday = new Date(2026, 7, 12, 12).getTime();
  const threeDaysAgo = new Date(2026, 7, 10, 12).getTime();

  database.insertPrompt({ sessionId: 'one', prompt: 'Today', projectPath: '/work/alpha', createdAt: now });
  database.insertPrompt({ sessionId: 'one', prompt: 'Yesterday', projectPath: '/work/alpha', createdAt: yesterday });
  database.insertPrompt({ sessionId: 'two', prompt: 'Earlier', projectPath: '/work/beta', createdAt: threeDaysAgo });

  assert.deepEqual(database.getSummary({ now }), {
    total: 3,
    today: 1,
    currentStreak: 2,
    longestStreak: 2,
    daily: [
      { date: '2026-08-10', count: 1 },
      { date: '2026-08-12', count: 1 },
      { date: '2026-08-13', count: 1 },
    ],
  });
});

test('filters prompts and treats search wildcards as text', (t) => {
  const database = temporaryDatabase(t);
  database.insertPrompt({ sessionId: 'one', prompt: 'Make this 100% ready_name', projectPath: '/work/alpha' });
  database.insertPrompt({ sessionId: 'two', prompt: 'A different prompt', projectPath: '/work/beta' });
  database.completeLatestPrompt({ sessionId: 'two', response: 'Response search phrase', completedAt: Date.now() });

  assert.equal(database.listPrompts({ query: '%' }).total, 1);
  assert.equal(database.listPrompts({ query: '_' }).total, 1);
  assert.equal(database.listPrompts({ project: 'beta' }).total, 1);
  assert.equal(database.listPrompts({ query: 'search phrase' }).total, 1);
  assert.deepEqual(database.listProjects(), [
    { name: 'alpha', count: 1 },
    { name: 'beta', count: 1 },
  ]);
});

test('migrates an existing prompt database without data loss', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompttrail-migration-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const databasePath = path.join(directory, 'legacy.sqlite');
  const legacy = new DatabaseSync(databasePath);
  legacy.exec(`
    CREATE TABLE prompts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      project_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      transcript_path TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO prompts VALUES ('old-id', 'old-session', 'Old prompt', '/work/old', 'old', NULL, 100);
  `);
  legacy.close();

  const database = openDatabase({ databasePath });
  t.after(() => database.close());
  const prompt = database.listPrompts().items[0];
  assert.equal(prompt.id, 'old-id');
  assert.equal(prompt.prompt, 'Old prompt');
  assert.equal(prompt.agent, 'claude');
  assert.equal(prompt.responseStatus, 'pending');
  assert.deepEqual(prompt.tools, []);
});

test('deleting a prompt also deletes its tool events', (t) => {
  const database = temporaryDatabase(t);
  const prompt = database.insertPrompt({ sessionId: 'one', prompt: 'First', projectPath: '/work/alpha' });
  database.insertToolEvent({
    sessionId: 'one',
    toolUseId: 'tool-one',
    toolName: 'Write',
    status: 'success',
    target: '/work/alpha/file.js',
  });
  assert.equal(database.listPrompts().items[0].tools.length, 1);
  assert.equal(database.deletePrompt(prompt.id), 1);
  assert.equal(database.listPrompts().total, 0);
});

test('deletes only the selected prompt', (t) => {
  const database = temporaryDatabase(t);
  const first = database.insertPrompt({ sessionId: 'one', prompt: 'First', projectPath: '/work/alpha' });
  database.insertPrompt({ sessionId: 'two', prompt: 'Second', projectPath: '/work/alpha' });

  assert.equal(database.deletePrompt(first.id), 1);
  assert.equal(database.deletePrompt(first.id), 0);
  assert.equal(database.getSummary().total, 1);
});
