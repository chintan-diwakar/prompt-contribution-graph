const X_INTENT_URL = 'https://x.com/intent/tweet';

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeCaptureRect(rect, bounds) {
  const maximumWidth = Math.max(1, Math.floor(finiteNumber(bounds?.width, 1)));
  const maximumHeight = Math.max(1, Math.floor(finiteNumber(bounds?.height, 1)));
  const x = Math.min(Math.max(0, Math.floor(finiteNumber(rect?.x))), maximumWidth - 1);
  const y = Math.min(Math.max(0, Math.floor(finiteNumber(rect?.y))), maximumHeight - 1);
  const width = Math.min(Math.max(1, Math.ceil(finiteNumber(rect?.width, maximumWidth))), maximumWidth - x);
  const height = Math.min(Math.max(1, Math.ceil(finiteNumber(rect?.height, maximumHeight))), maximumHeight - y);
  return { x, y, width, height };
}

export function screenshotFileName(date = new Date()) {
  const timestamp = date.toISOString().replaceAll(':', '-').replace(/\.\d{3}Z$/, 'Z');
  return `PromptTrail-activity-${timestamp}.png`;
}

export function buildXIntent(text, projectUrl = 'https://github.com/chintan-diwakar/prompttrail') {
  const url = new URL(X_INTENT_URL);
  url.searchParams.set('text', String(text || '').slice(0, 240));
  url.searchParams.set('url', projectUrl);
  return url.toString();
}
