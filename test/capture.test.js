import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { saveHookEvent } from '../src/capture.js';
import { openDatabase } from '../src/database.js';

test('saves a Claude Code UserPromptSubmit event', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompttrail-capture-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  t.after(() => database.close());

  saveHookEvent({
    hook_event_name: 'UserPromptSubmit',
    session_id: 'session-123',
    prompt: 'Create a contribution chart',
    cwd: '/work/my-project',
    transcript_path: '/tmp/transcript.jsonl',
  }, { database, createdAt: 123456 });

  const result = database.listPrompts();
  assert.equal(result.total, 1);
  assert.deepEqual(result.items[0], {
    id: result.items[0].id,
    sessionId: 'session-123',
    prompt: 'Create a contribution chart',
    projectPath: '/work/my-project',
    projectName: 'my-project',
    transcriptPath: '/tmp/transcript.jsonl',
    createdAt: 123456,
    response: null,
    responseStatus: 'pending',
    responseError: null,
    completedAt: null,
    durationMs: null,
    tools: [],
    toolSummary: { count: 0, failed: 0, durationMs: 0, filesChanged: 0 },
  });
});

test('saves the final response and safe tool metadata', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompttrail-events-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  t.after(() => database.close());

  saveHookEvent({
    hook_event_name: 'UserPromptSubmit',
    session_id: 'session-123',
    prompt: 'Update the README',
    cwd: '/work/project',
  }, { database, createdAt: 1_000 });
  saveHookEvent({
    hook_event_name: 'PostToolUse',
    session_id: 'session-123',
    tool_use_id: 'tool-read',
    tool_name: 'Read',
    tool_input: { file_path: '/work/project/README.md' },
    tool_response: { content: 'private output that must not be stored' },
    duration_ms: 25,
  }, { database, createdAt: 1_100 });
  saveHookEvent({
    hook_event_name: 'PostToolUse',
    session_id: 'session-123',
    tool_use_id: 'tool-bash',
    tool_name: 'Bash',
    tool_input: { command: 'echo secret-value' },
    duration_ms: 75,
  }, { database, createdAt: 1_200 });
  saveHookEvent({
    hook_event_name: 'PostToolUseFailure',
    session_id: 'session-123',
    tool_use_id: 'tool-edit',
    tool_name: 'Edit',
    tool_input: { file_path: '/work/project/README.md' },
    error: 'Edit failed',
    duration_ms: 10,
  }, { database, createdAt: 1_300 });
  saveHookEvent({
    hook_event_name: 'Stop',
    session_id: 'session-123',
    last_assistant_message: 'The README now contains the new section.',
  }, { database, createdAt: 2_000 });

  const prompt = database.listPrompts().items[0];
  assert.equal(prompt.response, 'The README now contains the new section.');
  assert.equal(prompt.responseStatus, 'completed');
  assert.equal(prompt.durationMs, 1_000);
  assert.deepEqual(prompt.tools.map((tool) => ({
    name: tool.toolName,
    status: tool.status,
    target: tool.target,
    duration: tool.durationMs,
  })), [
    { name: 'Read', status: 'success', target: '/work/project/README.md', duration: 25 },
    { name: 'Bash', status: 'success', target: null, duration: 75 },
    { name: 'Edit', status: 'failed', target: '/work/project/README.md', duration: 10 },
  ]);
  assert.deepEqual(prompt.toolSummary, { count: 3, failed: 1, durationMs: 110, filesChanged: 0 });
  assert.equal(JSON.stringify(prompt).includes('secret-value'), false);
  assert.equal(JSON.stringify(prompt).includes('private output'), false);
});

test('records a failed Claude response', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompttrail-failure-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const database = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  t.after(() => database.close());
  database.insertPrompt({ sessionId: 'failed-session', prompt: 'Try this', projectPath: '/work/project', createdAt: 100 });

  saveHookEvent({
    hook_event_name: 'StopFailure',
    session_id: 'failed-session',
    error: 'rate_limit',
    error_details: '429 Too Many Requests',
    last_assistant_message: 'API Error: Rate limit reached',
  }, { database, createdAt: 200 });

  const prompt = database.listPrompts().items[0];
  assert.equal(prompt.responseStatus, 'failed');
  assert.equal(prompt.response, 'API Error: Rate limit reached');
  assert.equal(prompt.responseError, '429 Too Many Requests');
});

test('rejects unrelated hook events and empty prompts', () => {
  assert.throws(() => saveHookEvent({ hook_event_name: 'SessionStart' }), /does not support/);
  assert.throws(() => saveHookEvent({ hook_event_name: 'UserPromptSubmit', prompt: '  ' }), /does not contain a prompt/);
  assert.throws(() => saveHookEvent({ hook_event_name: 'PostToolUse' }), /does not contain tool metadata/);
});
