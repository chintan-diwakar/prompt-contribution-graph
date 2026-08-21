import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../src/database.js';
import { startServer } from '../src/server.js';

test('serves the dashboard API and deletes a prompt', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompttrail-server-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  t.after(() => database.close());
  const prompt = database.insertPrompt({ sessionId: 'one', prompt: 'Hello dashboard', projectPath: '/work/alpha' });
  database.insertToolEvent({ sessionId: 'one', toolUseId: 'tool-one', toolName: 'Read', status: 'success', target: '/work/alpha/file.js' });
  database.completeLatestPrompt({ sessionId: 'one', response: 'Dashboard response', completedAt: prompt.createdAt + 500 });
  const { server, url } = await startServer({ database, port: 0 });
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const page = await fetch(url);
  assert.equal(page.status, 200);
  const markup = await page.text();
  assert.match(markup, /Prompt Activity/);
  assert.match(markup, /id="history-view"[^>]*hidden/);
  assert.match(markup, /href="#history"/);
  assert.match(markup, /href="#activity"/);

  const insightsModule = await fetch(`${url}/insights.js`);
  assert.equal(insightsModule.status, 200);
  assert.match(await insightsModule.text(), /createDailyInsight/);
  const dataClientModule = await fetch(`${url}/data-client.js`);
  assert.equal(dataClientModule.status, 200);
  assert.match(await dataClientModule.text(), /tauriInvoke/);
  const shareImageModule = await fetch(`${url}/share-image.js`);
  assert.equal(shareImageModule.status, 200);
  assert.match(await shareImageModule.text(), /createShareImage/);

  const history = await fetch(`${url}/api/prompts?q=dashboard`).then((response) => response.json());
  assert.equal(history.total, 1);
  assert.equal(history.items[0].prompt, 'Hello dashboard');
  assert.equal(history.items[0].response, 'Dashboard response');
  assert.equal(history.items[0].tools[0].toolName, 'Read');

  const blocked = await fetch(`${url}/api/prompts/${prompt.id}`, {
    method: 'DELETE',
    headers: { Origin: 'https://example.com' },
  });
  assert.equal(blocked.status, 403);
  assert.equal(database.getSummary().total, 1);

  const deleted = await fetch(`${url}/api/prompts/${prompt.id}`, { method: 'DELETE' });
  assert.equal(deleted.status, 200);
  assert.equal(database.getSummary().total, 0);
});
