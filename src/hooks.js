import fs from 'node:fs';
import path from 'node:path';
import { getClaudeSettingsPath, getCodexHooksPath, HOOK_ID } from './config.js';

export const HOOK_EVENTS = [
  'UserPromptSubmit',
  'Stop',
  'StopFailure',
  'PostToolUse',
  'PostToolUseFailure',
];

export const CODEX_HOOK_EVENTS = [
  'UserPromptSubmit',
  'Stop',
  'PostToolUse',
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
  source = 'claude',
} = {}) {
  return [
    quoteCommandPart(nodePath, platform),
    '--no-warnings',
    quoteCommandPart(path.resolve(cliPath), platform),
    'capture',
    '--source',
    source,
    '--hook-id',
    HOOK_ID,
  ].join(' ');
}

export function createDesktopHookCommand({ executablePath, platform = process.platform, source = 'claude' } = {}) {
  if (!executablePath) throw new Error('The desktop hook requires an executable path.');
  return [
    quoteCommandPart(executablePath, platform),
    '--capture-hook',
    '--source',
    source,
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

export function installCodexHooks(options = {}) {
  return installHooksFile({
    ...options,
    settingsPath: options.settingsPath || getCodexHooksPath(options.env),
    events: CODEX_HOOK_EVENTS,
    command: options.command || createHookCommand({ ...options, source: 'codex' }),
    description: 'Prompt Contribution Graph activity hooks for Codex.',
  });
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

export function uninstallCodexHooks(options = {}) {
  return uninstallHooksFile({
    ...options,
    settingsPath: options.settingsPath || getCodexHooksPath(options.env),
  });
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

export function getCodexHookStatus(options = {}) {
  return hookStatus({
    ...options,
    settingsPath: options.settingsPath || getCodexHooksPath(options.env),
    events: CODEX_HOOK_EVENTS,
  });
}

function installHooksFile({ settingsPath, events, command, description }) {
  const settings = readSettings(settingsPath);
  if (!settings || Array.isArray(settings) || typeof settings !== 'object') {
    throw new Error('The hooks file must contain a JSON object.');
  }
  settings.description ||= description;
  settings.hooks ||= {};
  if (!settings.hooks || Array.isArray(settings.hooks) || typeof settings.hooks !== 'object') {
    throw new Error('The hooks field must contain a JSON object.');
  }
  let changed = false;
  for (const event of events) {
    settings.hooks[event] ||= [];
    if (!Array.isArray(settings.hooks[event])) {
      throw new Error(`The ${event} hook setting must be an array.`);
    }
    let installed = false;
    for (const group of settings.hooks[event]) {
      if (!Array.isArray(group?.hooks)) continue;
      for (const hook of group.hooks) {
        if (!isPromptTrailHook(hook)) continue;
        installed = true;
        if (hook.command !== command) {
          hook.command = command;
          changed = true;
        }
      }
    }
    if (installed) continue;
    settings.hooks[event].push({
      hooks: [{ type: 'command', command, timeout: 5 }],
    });
    changed = true;
  }
  if (!changed) return { changed: false, settingsPath };
  writeSettings(settingsPath, settings);
  return { changed: true, settingsPath };
}

function uninstallHooksFile({ settingsPath }) {
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

function hookStatus({ settingsPath, events }) {
  if (!fs.existsSync(settingsPath)) {
    return { installed: false, installedEvents: [], missingEvents: [...events], settingsPath };
  }
  const settings = readSettings(settingsPath);
  const installedEvents = events.filter((event) => settings.hooks?.[event]?.some((group) =>
    Array.isArray(group?.hooks) && group.hooks.some(isPromptTrailHook)));
  return {
    installed: installedEvents.length === events.length,
    installedEvents,
    missingEvents: events.filter((event) => !installedEvents.includes(event)),
    settingsPath,
  };
}
