import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getDatabasePath } from './config.js';

function localDateKey(timestamp) {
  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addLocalDays(dateKey, amount) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day + amount, 12);
  return localDateKey(date.getTime());
}

function calculateStreaks(rows, todayKey) {
  const activeDays = new Set(rows.map((row) => row.date));
  let cursor = activeDays.has(todayKey) ? todayKey : addLocalDays(todayKey, -1);
  let current = 0;

  while (activeDays.has(cursor)) {
    current += 1;
    cursor = addLocalDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  let previous = null;
  for (const row of rows) {
    run = previous && addLocalDays(previous, 1) === row.date ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = row.date;
  }

  return { current, longest };
}

function addMissingColumn(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function mapToolEvent(row) {
  return {
    id: row.id,
    promptId: row.prompt_id,
    sessionId: row.session_id,
    toolUseId: row.tool_use_id,
    toolName: row.tool_name,
    status: row.status,
    durationMs: row.duration_ms,
    target: row.target,
    agentId: row.agent_id,
    agentType: row.agent_type,
    createdAt: row.created_at,
  };
}

function toolSummary(events) {
  const changedToolNames = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
  const changedFiles = new Set(events
    .filter((event) => event.status === 'success' && changedToolNames.has(event.toolName) && event.target)
    .map((event) => event.target));
  return {
    count: events.length,
    failed: events.filter((event) => event.status === 'failed').length,
    durationMs: events.reduce((total, event) => total + (event.durationMs || 0), 0),
    filesChanged: changedFiles.size,
  };
}

export function openDatabase(options = {}) {
  const databasePath = options.databasePath || getDatabasePath(options);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true, mode: 0o700 });
  const database = new DatabaseSync(databasePath);
  database.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  database.exec(`
    CREATE TABLE IF NOT EXISTS prompts (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      prompt TEXT NOT NULL,
      project_path TEXT NOT NULL,
      project_name TEXT NOT NULL,
      transcript_path TEXT,
      created_at INTEGER NOT NULL,
      response TEXT,
      response_status TEXT NOT NULL DEFAULT 'pending',
      response_error TEXT,
      completed_at INTEGER
    );
  `);
  addMissingColumn(database, 'prompts', 'response', 'TEXT');
  addMissingColumn(database, 'prompts', 'response_status', "TEXT NOT NULL DEFAULT 'pending'");
  addMissingColumn(database, 'prompts', 'response_error', 'TEXT');
  addMissingColumn(database, 'prompts', 'completed_at', 'INTEGER');
  database.exec(`
    CREATE TABLE IF NOT EXISTS tool_events (
      id TEXT PRIMARY KEY,
      prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL,
      tool_use_id TEXT NOT NULL UNIQUE,
      tool_name TEXT NOT NULL,
      status TEXT NOT NULL,
      duration_ms INTEGER,
      target TEXT,
      agent_id TEXT,
      agent_type TEXT,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_prompts_created_at ON prompts(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_prompts_project_name ON prompts(project_name);
    CREATE INDEX IF NOT EXISTS idx_tool_events_prompt_id ON tool_events(prompt_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_tool_events_session_id ON tool_events(session_id);
  `);

  return {
    path: databasePath,
    close: () => database.close(),

    insertPrompt(input) {
      const row = {
        id: input.id || randomUUID(),
        sessionId: input.sessionId || 'unknown',
        prompt: String(input.prompt),
        projectPath: input.projectPath || '',
        projectName: input.projectName || path.basename(input.projectPath || '') || 'Unknown project',
        transcriptPath: input.transcriptPath || null,
        createdAt: input.createdAt ?? Date.now(),
        response: null,
        responseStatus: 'pending',
        responseError: null,
        completedAt: null,
      };
      database.prepare(`
        INSERT INTO prompts (
          id, session_id, prompt, project_path, project_name, transcript_path, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.sessionId,
        row.prompt,
        row.projectPath,
        row.projectName,
        row.transcriptPath,
        row.createdAt,
      );
      return row;
    },

    completeLatestPrompt(input) {
      const latest = database.prepare(`
        SELECT id FROM prompts
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(input.sessionId || 'unknown');
      if (!latest) return null;
      const completedAt = input.completedAt ?? Date.now();
      database.prepare(`
        UPDATE prompts
        SET response = ?, response_status = ?, response_error = ?, completed_at = ?
        WHERE id = ?
      `).run(
        input.response || null,
        input.status || 'completed',
        input.error || null,
        completedAt,
        latest.id,
      );
      return { promptId: latest.id, completedAt };
    },

    insertToolEvent(input) {
      const latest = database.prepare(`
        SELECT id FROM prompts
        WHERE session_id = ?
        ORDER BY created_at DESC
        LIMIT 1
      `).get(input.sessionId || 'unknown');
      if (!latest) return null;
      const row = {
        id: input.id || randomUUID(),
        promptId: latest.id,
        sessionId: input.sessionId || 'unknown',
        toolUseId: input.toolUseId,
        toolName: input.toolName,
        status: input.status,
        durationMs: Number.isFinite(input.durationMs) ? input.durationMs : null,
        target: input.target || null,
        agentId: input.agentId || null,
        agentType: input.agentType || null,
        createdAt: input.createdAt ?? Date.now(),
      };
      const result = database.prepare(`
        INSERT OR IGNORE INTO tool_events (
          id, prompt_id, session_id, tool_use_id, tool_name, status, duration_ms,
          target, agent_id, agent_type, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        row.id,
        row.promptId,
        row.sessionId,
        row.toolUseId,
        row.toolName,
        row.status,
        row.durationMs,
        row.target,
        row.agentId,
        row.agentType,
        row.createdAt,
      );
      return Number(result.changes) ? row : null;
    },

    getSummary({ days = 371, now = Date.now() } = {}) {
      const allDaily = database.prepare(`
        SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch', 'localtime') AS date,
               COUNT(*) AS count
        FROM prompts
        GROUP BY date
        ORDER BY date ASC
      `).all().map((row) => ({ date: row.date, count: Number(row.count) }));
      const todayKey = localDateKey(now);
      const startKey = addLocalDays(todayKey, -(Math.max(1, days) - 1));
      const daily = allDaily.filter((row) => row.date >= startKey && row.date <= todayKey);
      const total = Number(database.prepare('SELECT COUNT(*) AS count FROM prompts').get().count);
      const today = allDaily.find((row) => row.date === todayKey)?.count || 0;
      const streaks = calculateStreaks(allDaily, todayKey);

      return {
        total,
        today,
        currentStreak: streaks.current,
        longestStreak: streaks.longest,
        daily,
      };
    },

    listPrompts({ limit = 50, offset = 0, query = '', project = '' } = {}) {
      const conditions = [];
      const parameters = [];
      if (query) {
        conditions.push('(prompt LIKE ? ESCAPE \'\\\' OR response LIKE ? ESCAPE \'\\\' OR project_name LIKE ? ESCAPE \'\\\')');
        const pattern = `%${query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
        parameters.push(pattern, pattern, pattern);
      }
      if (project) {
        conditions.push('project_name = ?');
        parameters.push(project);
      }
      const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
      const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
      const safeOffset = Math.max(Number(offset) || 0, 0);
      const rows = database.prepare(`
        SELECT id, session_id, prompt, project_path, project_name, transcript_path, created_at,
               response, response_status, response_error, completed_at
        FROM prompts
        ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).all(...parameters, safeLimit, safeOffset);
      const count = Number(database.prepare(`SELECT COUNT(*) AS count FROM prompts ${where}`).get(...parameters).count);
      const eventsByPrompt = new Map(rows.map((row) => [row.id, []]));
      if (rows.length) {
        const placeholders = rows.map(() => '?').join(', ');
        const toolRows = database.prepare(`
          SELECT id, prompt_id, session_id, tool_use_id, tool_name, status, duration_ms,
                 target, agent_id, agent_type, created_at
          FROM tool_events
          WHERE prompt_id IN (${placeholders})
          ORDER BY created_at ASC
        `).all(...rows.map((row) => row.id));
        for (const toolRow of toolRows) {
          eventsByPrompt.get(toolRow.prompt_id)?.push(mapToolEvent(toolRow));
        }
      }

      return {
        total: count,
        items: rows.map((row) => {
          const tools = eventsByPrompt.get(row.id) || [];
          return {
            id: row.id,
            sessionId: row.session_id,
            prompt: row.prompt,
            projectPath: row.project_path,
            projectName: row.project_name,
            transcriptPath: row.transcript_path,
            createdAt: row.created_at,
            response: row.response,
            responseStatus: row.response_status,
            responseError: row.response_error,
            completedAt: row.completed_at,
            durationMs: row.completed_at ? Math.max(0, row.completed_at - row.created_at) : null,
            tools,
            toolSummary: toolSummary(tools),
          };
        }),
      };
    },

    listProjects() {
      return database.prepare(`
        SELECT project_name AS name, COUNT(*) AS count
        FROM prompts
        GROUP BY project_name
        ORDER BY count DESC, name ASC
      `).all().map((row) => ({ name: row.name, count: Number(row.count) }));
    },

    deletePrompt(id) {
      return Number(database.prepare('DELETE FROM prompts WHERE id = ?').run(id).changes);
    },
  };
}

export const dateHelpers = { localDateKey, addLocalDays };
