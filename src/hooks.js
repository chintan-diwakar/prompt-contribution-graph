import fs from 'node:fs';
import path from 'node:path';
import { getClaudeSettingsPath, HOOK_ID } from './config.js';

export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'Stop',
  'StopFailure',
  'PostToolUse',
  'PostToolUseFailure',
];

function quoteCommandPart(value, platform = process.platform) {
  const text = String(value);
  if (platform === 'win32') {
    return `"${text.replaceAll('"', '\\"')}"`;
  }
  return `'${text.replaceAll("'", "'\\''")}'`;
}

export function createHookCommand({
  nodePath = process.execPath,
  cliPath = process.argv[1],
  platform = process.platform,
} = {}) {
  return [
    quoteCommandPart(nodePath, platform),
    '--no-warnings',
    quoteCommandPart(path.resolve(cliPath), platform),
    'capture',
    '--hook-id',
    HOOK_ID,
  ].join(' ');
}

export function createDesktopHookCommand({ executablePath, platform = process.platform } = {}) {
  if (!executablePath) throw new Error('The desktop hook requires an executable path.');
  return [
    quoteCommandPart(executablePath, platform),
    '--capture-hook',
    '--hook-id',
    HOOK_ID,
  ].join(' ');
}

function isPromptTrailHook(hook) {
  return hook?.type === 'command'
    && typeof hook.command === 'string'
    && hook.command.includes(`--hook-id ${HOOK_ID}`);
}

function readSettings(settingsPath) {
  if (!fs.existsSync(settingsPath)) return {};
  const source = fs.readFileSync(settingsPath, 'utf8').trim();
  return source ? JSON.parse(source) : {};
}

function writeSettings(settingsPath, settings) {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true, mode: 0o700 });
  if (fs.existsSync(settingsPath)) {
    fs.copyFileSync(settingsPath, `${settingsPath}.prompttrail.bak`);
  }
  const temporaryPath = `${settingsPath}.prompttrail.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporaryPath, settingsPath);
}

export function installHook(options = {}) {
  const settingsPath = options.settingsPath || getClaudeSettingsPath(options.env);
  const settings = readSettings(settingsPath);
  settings.hooks ||= {};
  let changed = false;
  const command = options.command || createHookCommand(options);
  for (const event of HOOK_EVENTS) {
    settings.hooks[event] ||= [];
    let isInstalled = false;
    for (const group of settings.hooks[event]) {
      if (!Array.isArray(group?.hooks)) continue;
      for (const hook of group.hooks) {
        if (!isPromptTrailHook(hook)) continue;
        isInstalled = true;
        if (hook.command !== command) {
          hook.command = command;
          changed = true;
        }
      }
    }
    if (isInstalled) continue;
    settings.hooks[event].push({
      matcher: '',
      hooks: [{ type: 'command', command, timeout: 5 }],
    });
    changed = true;
  }
  if (!changed) return { changed: false, settingsPath };
  writeSettings(settingsPath, settings);
  return { changed: true, settingsPath };
}

export function uninstallHook(options = {}) {
  const settingsPath = options.settingsPath || getClaudeSettingsPath(options.env);
  if (!fs.existsSync(settingsPath)) return { changed: false, settingsPath };
  const settings = readSettings(settingsPath);
  let changed = false;
  for (const [event, groups] of Object.entries(settings.hooks || {})) {
    if (!Array.isArray(groups)) continue;
    const nextGroups = groups
      .map((group) => ({
        ...group,
        hooks: Array.isArray(group?.hooks) ? group.hooks.filter((hook) => !isPromptTrailHook(hook)) : group?.hooks,
      }))
      .filter((group) => !Array.isArray(group.hooks) || group.hooks.length > 0);
    const removed = groups.reduce((count, group) => count + (group.hooks?.filter(isPromptTrailHook).length || 0), 0);
    if (!removed) continue;
    changed = true;
    if (nextGroups.length) settings.hooks[event] = nextGroups;
    else delete settings.hooks[event];
  }
  if (!changed) return { changed: false, settingsPath };
  if (settings.hooks && Object.keys(settings.hooks).length === 0) delete settings.hooks;
  writeSettings(settingsPath, settings);
  return { changed: true, settingsPath };
}

export function getHookStatus(options = {}) {
  const settingsPath = options.settingsPath || getClaudeSettingsPath(options.env);
  if (!fs.existsSync(settingsPath)) {
    return { installed: false, installedEvents: [], missingEvents: [...HOOK_EVENTS], settingsPath };
  }
  const settings = readSettings(settingsPath);
  const installedEvents = HOOK_EVENTS.filter((event) => settings.hooks?.[event]?.some((group) =>
    Array.isArray(group?.hooks) && group.hooks.some(isPromptTrailHook)));
  return {
    installed: installedEvents.length === HOOK_EVENTS.length,
    installedEvents,
    missingEvents: HOOK_EVENTS.filter((event) => !installedEvents.includes(event)),
    settingsPath,
  };
}
