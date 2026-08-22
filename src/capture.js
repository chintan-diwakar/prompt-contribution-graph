import path from 'node:path';
import { DISPLAY_NAME } from './config.js';
import { openDatabase } from './database.js';

export async function readStandardInput(stream = process.stdin) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function safeToolTarget(event) {
  const input = event.tool_input || {};
  if (['Read', 'Write', 'Edit', 'MultiEdit'].includes(event.tool_name)) return input.file_path;
  if (event.tool_name === 'NotebookEdit') return input.notebook_path;
  if (['Glob', 'Grep'].includes(event.tool_name)) return input.path;
  if (event.tool_name === 'Skill') return input.skill;
  if (['Agent', 'Task'].includes(event.tool_name)) return input.subagent_type || event.agent_type;
  if (event.tool_name === 'WebFetch' && input.url) {
    try {
      return new URL(input.url).hostname;
    } catch {
      return null;
    }
  }
  return null;
}

export function saveHookEvent(event, options = {}) {
  if (!event?.hook_event_name) throw new Error('The hook input does not contain an event name.');
  const source = options.source === 'codex' ? 'codex' : 'claude';

  const database = options.database || openDatabase(options);
  const ownsDatabase = !options.database;
  try {
    if (event.hook_event_name === 'UserPromptSubmit') {
      if (typeof event.prompt !== 'string' || !event.prompt.trim()) {
        throw new Error('The hook input does not contain a prompt.');
      }
      return database.insertPrompt({
        sessionId: event.session_id,
        agent: source,
        prompt: event.prompt,
        projectPath: event.cwd || '',
        projectName: path.basename(event.cwd || '') || 'Unknown project',
        transcriptPath: event.transcript_path,
        createdAt: options.createdAt,
      });
    }

    if (event.hook_event_name === 'Stop') {
      return database.completeLatestPrompt({
        sessionId: event.session_id,
        agent: source,
        response: event.last_assistant_message,
        status: 'completed',
        completedAt: options.createdAt,
      });
    }

    if (event.hook_event_name === 'StopFailure') {
      return database.completeLatestPrompt({
        sessionId: event.session_id,
        agent: source,
        response: event.last_assistant_message,
        status: 'failed',
        error: event.error_details || event.error || 'unknown',
        completedAt: options.createdAt,
      });
    }

    if (['PostToolUse', 'PostToolUseFailure'].includes(event.hook_event_name)) {
      if (!event.tool_name || !event.tool_use_id) {
        throw new Error('The hook input does not contain tool metadata.');
      }
      return database.insertToolEvent({
        sessionId: event.session_id,
        agent: source,
        toolUseId: event.tool_use_id,
        toolName: event.tool_name,
        status: event.hook_event_name === 'PostToolUse' ? 'success' : 'failed',
        durationMs: Number.isFinite(event.duration_ms) ? event.duration_ms : null,
        target: safeToolTarget(event),
        agentId: event.agent_id,
        agentType: event.agent_type,
        createdAt: options.createdAt,
      });
    }

    throw new Error(`${DISPLAY_NAME} does not support the ${event.hook_event_name} hook event.`);
  } finally {
    if (ownsDatabase) database.close();
  }
}

export async function captureFromStandardInput(options = {}) {
  const source = await readStandardInput(options.stream);
  return saveHookEvent(JSON.parse(source), options);
}
