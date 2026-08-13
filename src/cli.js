#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { DEFAULT_PORT, getDatabasePath } from './config.js';
import { getHookStatus, installHook, uninstallHook } from './hooks.js';

const HELP = `PromptTrail — local prompt history for Claude Code

Usage:
  prompttrail install              Install the Claude Code hook
  prompttrail start [--port 4317]  Start the local dashboard
  prompttrail status               Show the hook and database status
  prompttrail uninstall            Remove only the PromptTrail hook
  prompttrail help                 Show this help
`;

function argumentValue(argumentsList, flag, fallback) {
  const index = argumentsList.indexOf(flag);
  return index >= 0 && argumentsList[index + 1] ? argumentsList[index + 1] : fallback;
}

function openBrowser(url) {
  const command = process.platform === 'darwin'
    ? ['open', [url]]
    : process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : ['xdg-open', [url]];
  const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

async function importDatabaseModule(modulePath) {
  const emitWarning = process.emitWarning;
  process.emitWarning = function filterSqliteWarning(warning, options, ...rest) {
    const warningType = typeof options === 'string' ? options : options?.type;
    if (warningType === 'ExperimentalWarning' && String(warning).includes('SQLite')) return;
    return emitWarning.call(process, warning, options, ...rest);
  };
  try {
    return await import(modulePath);
  } finally {
    process.emitWarning = emitWarning;
  }
}

async function main() {
  const argumentsList = process.argv.slice(2);
  const command = argumentsList[0] || 'help';

  if (command === 'capture') {
    try {
      const { captureFromStandardInput } = await importDatabaseModule('./capture.js');
      await captureFromStandardInput();
    } catch (error) {
      process.stderr.write(`PromptTrail capture error: ${error.message}\n`);
    }
    process.stdout.write('{}');
    return;
  }

  if (command === 'install') {
    const result = installHook();
    console.log(result.changed ? 'PromptTrail installed the Claude Code hooks.' : 'The PromptTrail hooks are already installed.');
    console.log(`Settings: ${result.settingsPath}`);
    console.log('Run `prompttrail start` to open the dashboard.');
    return;
  }

  if (command === 'uninstall') {
    const result = uninstallHook();
    console.log(result.changed ? 'PromptTrail removed the Claude Code hooks.' : 'The PromptTrail hooks are not installed.');
    console.log('Your prompt database was not deleted.');
    return;
  }

  if (command === 'status') {
    const { openDatabase } = await importDatabaseModule('./database.js');
    const hook = getHookStatus();
    const database = openDatabase();
    const summary = database.getSummary();
    database.close();
    const hookState = hook.installed ? 'installed' : hook.installedEvents.length ? 'partially installed' : 'not installed';
    console.log(`Hooks: ${hookState}`);
    console.log(`Prompts: ${summary.total}`);
    console.log(`Database: ${getDatabasePath()}`);
    return;
  }

  if (command === 'start') {
    const { startServer } = await importDatabaseModule('./server.js');
    const port = Number(argumentValue(argumentsList, '--port', DEFAULT_PORT));
    const { url } = await startServer({ port });
    console.log(`PromptTrail is available at ${url}`);
    console.log('Press Ctrl+C to stop it.');
    if (!argumentsList.includes('--no-open')) openBrowser(url);
    return;
  }

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  process.stderr.write(`PromptTrail error: ${error.message}\n`);
  process.exitCode = 1;
});
