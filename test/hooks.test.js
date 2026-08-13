import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createDesktopHookCommand, createHookCommand, getHookStatus, HOOK_EVENTS, installHook, uninstallHook } from '../src/hooks.js';

function temporarySettings(t, initial) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'prompttrail-hooks-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const settingsPath = path.join(directory, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  if (initial) fs.writeFileSync(settingsPath, JSON.stringify(initial));
  return settingsPath;
}

test('installs one hook and preserves existing Claude settings', (t) => {
  const existingGroup = { matcher: '', hooks: [{ type: 'command', command: 'existing-hook' }] };
  const settingsPath = temporarySettings(t, {
    permissions: { allow: ['Read'] },
    hooks: { UserPromptSubmit: [existingGroup] },
  });

  const first = installHook({ settingsPath, command: "node cli.js capture --hook-id prompttrail-local-v1" });
  const second = installHook({ settingsPath, command: "node cli.js capture --hook-id prompttrail-local-v1" });
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));

  assert.equal(first.changed, true);
  assert.equal(second.changed, false);
  assert.deepEqual(settings.permissions, { allow: ['Read'] });
  assert.equal(settings.hooks.UserPromptSubmit.length, 2);
  for (const event of HOOK_EVENTS.slice(1)) {
    assert.equal(settings.hooks[event].length, 1);
  }
  assert.equal(getHookStatus({ settingsPath }).installed, true);
  assert.equal(fs.existsSync(`${settingsPath}.prompttrail.bak`), true);
});

test('uninstalls only the marked PromptTrail hook', (t) => {
  const settingsPath = temporarySettings(t, {
    hooks: {
      UserPromptSubmit: [
        { matcher: '', hooks: [{ type: 'command', command: 'existing-hook' }] },
        { matcher: '', hooks: [{ type: 'command', command: 'node cli.js capture --hook-id prompttrail-local-v1' }] },
      ],
    },
  });

  assert.equal(uninstallHook({ settingsPath }).changed, true);
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.deepEqual(settings.hooks.UserPromptSubmit, [
    { matcher: '', hooks: [{ type: 'command', command: 'existing-hook' }] },
  ]);
  assert.equal(uninstallHook({ settingsPath }).changed, false);
});

test('upgrades a prompt-only installation with response and tool hooks', (t) => {
  const command = 'node cli.js capture --hook-id prompttrail-local-v1';
  const settingsPath = temporarySettings(t, {
    hooks: { UserPromptSubmit: [{ matcher: '', hooks: [{ type: 'command', command }] }] },
  });

  assert.deepEqual(getHookStatus({ settingsPath }).missingEvents, HOOK_EVENTS.slice(1));
  assert.equal(installHook({ settingsPath, command }).changed, true);
  const status = getHookStatus({ settingsPath });
  assert.equal(status.installed, true);
  assert.deepEqual(status.installedEvents, HOOK_EVENTS);
  assert.deepEqual(status.missingEvents, []);
});

test('quotes paths in the generated hook command', () => {
  const command = createHookCommand({
    nodePath: '/path with space/node',
    cliPath: '/project/prompt trail/cli.js',
    platform: 'linux',
  });
  assert.match(command, /^'\/path with space\/node' --no-warnings '\/project\/prompt trail\/cli.js' capture/);
  assert.match(command, /--hook-id prompttrail-local-v1$/);
});

test('creates a packaged desktop hook command', () => {
  const command = createDesktopHookCommand({
    executablePath: '/Applications/Prompt Trail.app/Contents/MacOS/PromptTrail',
    platform: 'darwin',
  });
  assert.equal(command, "'/Applications/Prompt Trail.app/Contents/MacOS/PromptTrail' --capture-hook --hook-id prompttrail-local-v1");
});
