import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_PORT } from './config.js';
import { openDatabase } from './database.js';

const publicDirectory = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const staticFiles = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/style.css', ['style.css', 'text/css; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/data-client.js', ['data-client.js', 'text/javascript; charset=utf-8']],
  ['/insights.js', ['insights.js', 'text/javascript; charset=utf-8']],
  ['/share-image.js', ['share-image.js', 'text/javascript; charset=utf-8']],
]);

function sendJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(value));
}

function sendStatic(response, fileName, contentType) {
  response.writeHead(200, {
    'Content-Type': contentType,
    'Cache-Control': fileName === 'index.html' ? 'no-store' : 'public, max-age=3600',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  fs.createReadStream(path.join(publicDirectory, fileName)).pipe(response);
}

function isAllowedOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

export function createPromptTrailServer(options = {}) {
  const database = options.database || openDatabase(options);
  const ownsDatabase = !options.database;
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    try {
      if (request.method === 'GET' && staticFiles.has(url.pathname)) {
        const [fileName, contentType] = staticFiles.get(url.pathname);
        sendStatic(response, fileName, contentType);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/summary') {
        sendJson(response, 200, database.getSummary({ days: Number(url.searchParams.get('days')) || 371 }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/projects') {
        sendJson(response, 200, { items: database.listProjects() });
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/prompts') {
        sendJson(response, 200, database.listPrompts({
          limit: url.searchParams.get('limit'),
          offset: url.searchParams.get('offset'),
          query: url.searchParams.get('q') || '',
          project: url.searchParams.get('project') || '',
        }));
        return;
      }

      const promptMatch = url.pathname.match(/^\/api\/prompts\/([a-zA-Z0-9-]+)$/);
      if (request.method === 'DELETE' && promptMatch) {
        if (!isAllowedOrigin(request)) {
          sendJson(response, 403, { error: 'The request origin is not allowed.' });
          return;
        }
        const changes = database.deletePrompt(promptMatch[1]);
        sendJson(response, changes ? 200 : 404, changes ? { deleted: true } : { error: 'Prompt not found.' });
        return;
      }

      sendJson(response, 404, { error: 'Not found.' });
    } catch (error) {
      sendJson(response, 500, { error: error.message || 'Internal server error.' });
    }
  });

  server.on('close', () => {
    if (ownsDatabase) database.close();
  });
  return server;
}

export async function startServer(options = {}) {
  const port = options.port === undefined ? DEFAULT_PORT : Number(options.port);
  const host = '127.0.0.1';
  const server = createPromptTrailServer(options);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  return { server, url: `http://${host}:${address.port}` };
}
