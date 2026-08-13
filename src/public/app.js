const state = {
  offset: 0,
  limit: 30,
  query: '',
  project: '',
  total: 0,
};

const shellParameters = new URLSearchParams(window.location.search);
if (shellParameters.get('desktop') === '1') document.documentElement.dataset.shell = 'desktop';
if (shellParameters.get('platform')) document.documentElement.dataset.platform = shellParameters.get('platform');

const elements = {
  activityView: document.querySelector('#activity-view'),
  historyView: document.querySelector('#history-view'),
  today: document.querySelector('#today-count'),
  todayNote: document.querySelector('#today-note'),
  currentStreak: document.querySelector('#current-streak'),
  longestStreak: document.querySelector('#longest-streak'),
  total: document.querySelector('#total-count'),
  heatmap: document.querySelector('#heatmap'),
  monthLabels: document.querySelector('#month-labels'),
  list: document.querySelector('#prompt-list'),
  template: document.querySelector('#prompt-template'),
  resultCount: document.querySelector('#result-count'),
  search: document.querySelector('#search'),
  project: document.querySelector('#project-filter'),
  loadMore: document.querySelector('#load-more'),
  filters: document.querySelector('#filters'),
};

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfChart() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() - (52 * 7));
  return start;
}

function activityLevel(count) {
  if (!count) return 0;
  if (count <= 2) return 1;
  if (count <= 5) return 2;
  if (count <= 9) return 3;
  return 4;
}

function renderHeatmap(daily) {
  const countByDate = new Map(daily.map((item) => [item.date, item.count]));
  const start = startOfChart();
  const todayKey = localDateKey(new Date());
  const fragment = document.createDocumentFragment();
  const formatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

  elements.heatmap.replaceChildren();
  for (let dayIndex = 0; dayIndex < 53 * 7; dayIndex += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + dayIndex);
    const key = localDateKey(date);
    const count = countByDate.get(key) || 0;
    const cell = document.createElement('span');
    cell.className = `heatmap-cell level-${activityLevel(count)}`;
    cell.style.animationDelay = `${Math.min(dayIndex * 0.0012, 0.38).toFixed(3)}s`;
    if (key > todayKey) cell.classList.add('future');
    cell.title = `${count} ${count === 1 ? 'prompt' : 'prompts'} on ${formatter.format(date)}`;
    cell.setAttribute('aria-label', cell.title);
    fragment.append(cell);
  }
  elements.heatmap.append(fragment);
  renderMonthLabels(start);
}

function renderMonthLabels(start) {
  elements.monthLabels.replaceChildren();
  let lastMonth = -1;
  for (let week = 0; week < 53; week += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + (week * 7));
    if (date.getMonth() === lastMonth) continue;
    lastMonth = date.getMonth();
    const label = document.createElement('span');
    label.textContent = date.toLocaleDateString(undefined, { month: 'short' });
    label.style.left = `${week * 16}px`;
    elements.monthLabels.append(label);
  }
}

function relativeTime(timestamp) {
  const seconds = Math.round((timestamp - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const ranges = [
    ['year', 31_536_000],
    ['month', 2_592_000],
    ['week', 604_800],
    ['day', 86_400],
    ['hour', 3_600],
    ['minute', 60],
  ];
  for (const [unit, amount] of ranges) {
    if (Math.abs(seconds) >= amount) return formatter.format(Math.round(seconds / amount), unit);
  }
  return 'just now';
}

function promptSummary(prompt) {
  return prompt.replace(/\s+/g, ' ').trim();
}

function formatDuration(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '';
  if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
  if (milliseconds < 60_000) return `${(milliseconds / 1_000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`;
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.round((milliseconds % 60_000) / 1_000);
  return `${minutes}m ${seconds}s`;
}

function toolSummaryText(summary) {
  const parts = [`${summary.count} ${summary.count === 1 ? 'tool call' : 'tool calls'}`];
  if (summary.filesChanged) parts.push(`${summary.filesChanged} ${summary.filesChanged === 1 ? 'file changed' : 'files changed'}`);
  if (summary.failed) parts.push(`${summary.failed} failed`);
  if (summary.durationMs) parts.push(formatDuration(summary.durationMs));
  return parts.join(' · ');
}

function createPromptCard(prompt) {
  const card = elements.template.content.firstElementChild.cloneNode(true);
  const project = card.querySelector('.project-chip');
  const time = card.querySelector('time');
  const summary = card.querySelector('.prompt-summary');
  const content = card.querySelector('.prompt-content');
  const session = card.querySelector('.session-id');
  const deleteButton = card.querySelector('.delete-prompt');
  const details = card.querySelector('.prompt-details');
  const promptExpand = card.querySelector('.prompt-expand');
  const responseDetails = card.querySelector('.response-details');
  const responseSummary = card.querySelector('.response-summary');
  const responseContent = card.querySelector('.response-content');
  const responseExpand = card.querySelector('.response-expand');
  const responseEmpty = card.querySelector('.response-empty');
  const responseState = card.querySelector('.response-state');
  const toolsDetails = card.querySelector('.tools-details');
  const toolsSummary = card.querySelector('.tools-summary-text');
  const toolList = card.querySelector('.tool-list');
  const turnDuration = card.querySelector('.turn-duration');

  project.textContent = prompt.projectName;
  project.title = prompt.projectPath || prompt.projectName;
  time.dateTime = new Date(prompt.createdAt).toISOString();
  time.textContent = relativeTime(prompt.createdAt);
  time.title = new Date(prompt.createdAt).toLocaleString();
  summary.textContent = promptSummary(prompt.prompt);
  content.textContent = prompt.prompt;
  session.textContent = `Session ${prompt.sessionId.slice(0, 8)}`;
  turnDuration.textContent = prompt.durationMs === null ? '' : `Response ${formatDuration(prompt.durationMs)}`;

  if (prompt.response) {
    responseDetails.hidden = false;
    responseEmpty.hidden = true;
    responseSummary.textContent = promptSummary(prompt.response);
    responseContent.textContent = prompt.response;
    responseExpand.hidden = false;
  } else {
    responseDetails.hidden = true;
    responseEmpty.hidden = false;
    responseEmpty.textContent = prompt.responseStatus === 'failed'
      ? (prompt.responseError || 'Claude stopped with an error.')
      : 'No response captured.';
  }
  responseState.textContent = prompt.responseStatus === 'completed'
    ? 'Completed'
    : prompt.responseStatus === 'failed' ? 'Failed' : 'Pending';
  responseState.classList.toggle('failed', prompt.responseStatus === 'failed');

  if (prompt.tools.length) {
    toolsDetails.hidden = false;
    toolsSummary.textContent = toolSummaryText(prompt.toolSummary);
    for (const tool of prompt.tools) {
      const row = document.createElement('div');
      row.className = 'tool-row';
      const status = document.createElement('span');
      status.className = `tool-status${tool.status === 'failed' ? ' failed' : ''}`;
      status.title = tool.status;
      const name = document.createElement('span');
      name.className = 'tool-name';
      name.textContent = tool.toolName;
      const target = document.createElement('span');
      target.className = 'tool-target';
      target.textContent = tool.target || (tool.agentType ? `Agent: ${tool.agentType}` : '');
      target.title = target.textContent;
      const duration = document.createElement('span');
      duration.className = 'tool-duration';
      duration.textContent = formatDuration(tool.durationMs);
      row.append(status, name, target, duration);
      toolList.append(row);
    }
  } else {
    toolsDetails.hidden = true;
  }

  details.addEventListener('toggle', () => {
    promptExpand.textContent = details.open ? 'Close full prompt' : 'Open full prompt';
  });
  promptExpand.addEventListener('click', () => { details.open = !details.open; });
  responseDetails.addEventListener('toggle', () => {
    responseExpand.textContent = responseDetails.open ? 'Close full response' : 'Open full response';
  });
  responseExpand.addEventListener('click', () => { responseDetails.open = !responseDetails.open; });
  deleteButton.addEventListener('click', async () => {
    if (!window.confirm('Delete this prompt from the local database?')) return;
    deleteButton.disabled = true;
    const response = await fetch(`/api/prompts/${encodeURIComponent(prompt.id)}`, { method: 'DELETE' });
    if (!response.ok) {
      deleteButton.disabled = false;
      window.alert('PromptTrail could not delete this prompt.');
      return;
    }
    await Promise.all([loadSummary(), loadProjects(), loadPrompts({ reset: true })]);
  });
  return card;
}

async function loadSummary() {
  const response = await fetch('/api/summary?days=371');
  if (!response.ok) throw new Error('Could not load the activity summary.');
  const summary = await response.json();
  elements.today.textContent = summary.today.toLocaleString();
  elements.todayNote.textContent = summary.today === 1 ? 'One step forward' : summary.today ? 'The trail is growing' : 'Start a new trail today';
  elements.currentStreak.textContent = summary.currentStreak.toLocaleString();
  elements.longestStreak.textContent = summary.longestStreak.toLocaleString();
  elements.total.textContent = summary.total.toLocaleString();
  renderHeatmap(summary.daily);
}

async function loadProjects() {
  const response = await fetch('/api/projects');
  if (!response.ok) throw new Error('Could not load projects.');
  const { items } = await response.json();
  const selected = elements.project.value;
  elements.project.replaceChildren(new Option('All projects', ''));
  for (const item of items) {
    elements.project.add(new Option(`${item.name} (${item.count})`, item.name));
  }
  elements.project.value = selected;
}

async function loadPrompts({ reset = false } = {}) {
  if (reset) {
    state.offset = 0;
    elements.list.innerHTML = '<div class="loading-row">Loading your prompt trail…</div>';
  }
  const parameters = new URLSearchParams({
    limit: String(state.limit),
    offset: String(state.offset),
    q: state.query,
    project: state.project,
  });
  const response = await fetch(`/api/prompts?${parameters}`);
  if (!response.ok) throw new Error('Could not load prompt history.');
  const result = await response.json();
  state.total = result.total;

  if (reset) elements.list.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const prompt of result.items) fragment.append(createPromptCard(prompt));
  elements.list.append(fragment);
  state.offset += result.items.length;

  if (!state.total) {
    const empty = document.createElement('div');
    empty.className = 'empty-row';
    empty.textContent = state.query || state.project
      ? 'No prompts match these filters.'
      : 'No prompts yet. Submit a prompt in Claude Code to start your trail.';
    elements.list.append(empty);
  }
  elements.resultCount.textContent = `${state.total.toLocaleString()} ${state.total === 1 ? 'prompt' : 'prompts'}`;
  elements.loadMore.hidden = state.offset >= state.total;
}

let searchTimer;
elements.search.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = elements.search.value.trim();
    loadPrompts({ reset: true }).catch(showError);
  }, 220);
});

elements.project.addEventListener('change', () => {
  state.project = elements.project.value;
  loadPrompts({ reset: true }).catch(showError);
});

elements.filters.addEventListener('submit', (event) => event.preventDefault());
elements.loadMore.addEventListener('click', () => loadPrompts().catch(showError));

function showError(error) {
  const message = document.createElement('div');
  message.className = 'empty-row';
  message.textContent = error.message;
  elements.list.replaceChildren(message);
}

let historyLoaded = false;

function animateView(view) {
  view.classList.remove('is-entering');
  requestAnimationFrame(() => view.classList.add('is-entering'));
}

async function showCurrentView() {
  const showHistory = window.location.hash === '#history';
  elements.activityView.hidden = showHistory;
  elements.historyView.hidden = !showHistory;

  const activeView = showHistory ? elements.historyView : elements.activityView;
  animateView(activeView);

  if (showHistory && !historyLoaded) {
    elements.list.innerHTML = '<div class="loading-row">Loading your prompt history…</div>';
    await Promise.all([loadProjects(), loadPrompts({ reset: true })]);
    historyLoaded = true;
  }
}

window.addEventListener('hashchange', () => showCurrentView().catch(showError));

loadSummary()
  .then(showCurrentView)
  .catch(showError);
