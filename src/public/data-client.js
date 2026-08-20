const tauriInvoke = window.__TAURI__?.core?.invoke;

async function jsonResponse(response, message) {
  if (!response.ok) throw new Error(message);
  return response.json();
}

const httpClient = {
  kind: 'browser',
  async getSummary(days = 371) {
    return jsonResponse(await fetch(`/api/summary?days=${encodeURIComponent(days)}`), 'Could not load the activity summary.');
  },
  async listProjects() {
    const result = await jsonResponse(await fetch('/api/projects'), 'Could not load projects.');
    return result.items;
  },
  async listPrompts(request) {
    const parameters = new URLSearchParams({
      limit: String(request.limit),
      offset: String(request.offset),
      q: request.query,
      project: request.project,
    });
    return jsonResponse(await fetch(`/api/prompts?${parameters}`), 'Could not load prompt history.');
  },
  async deletePrompt(id) {
    return jsonResponse(await fetch(`/api/prompts/${encodeURIComponent(id)}`, { method: 'DELETE' }), 'Prompt Contribution Graph could not delete this prompt.');
  },
  async shareActivity({ text }) {
    const url = new URL('https://x.com/intent/tweet');
    url.searchParams.set('text', text.slice(0, 240));
    url.searchParams.set('url', 'https://github.com/chintan-diwakar/prompt-contribution-graph');
    window.open(url, '_blank', 'noopener');
    return { mode: 'browser' };
  },
};

const tauriClient = {
  kind: 'tauri',
  getSummary(days = 371) {
    return tauriInvoke('get_summary', { days });
  },
  listProjects() {
    return tauriInvoke('list_projects');
  },
  listPrompts(request) {
    return tauriInvoke('list_prompts', { request });
  },
  deletePrompt(id) {
    return tauriInvoke('delete_prompt', { id });
  },
  shareActivity({ text, imageDataUrl }) {
    return tauriInvoke('share_activity', { text, imageDataUrl });
  },
};

export const dataClient = tauriInvoke ? tauriClient : httpClient;
