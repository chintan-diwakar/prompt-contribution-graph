import os from 'node:os';
import path from 'node:path';

export const APP_NAME = 'PromptTrail';
export const HOOK_ID = 'prompttrail-local-v1';
export const DEFAULT_PORT = 4317;

export function getDataDirectory(env = process.env, platform = process.platform) {
  if (env.PROMPTTRAIL_HOME) {
    return path.resolve(env.PROMPTTRAIL_HOME);
  }

  if (platform === 'win32') {
    return path.join(env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
  }

  if (platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
  }

  return path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'prompttrail');
}

export function getDatabasePath(options = {}) {
  return path.join(options.dataDirectory || getDataDirectory(options.env, options.platform), 'prompts.sqlite');
}

export function getClaudeSettingsPath(env = process.env) {
  const claudeDirectory = env.CLAUDE_CONFIG_DIR
    ? path.resolve(env.CLAUDE_CONFIG_DIR)
    : path.join(os.homedir(), '.claude');
  return path.join(claudeDirectory, 'settings.json');
}
