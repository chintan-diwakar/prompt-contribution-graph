const WIDTH = 1200;
const HEIGHT = 675;
const PROJECT_URL = 'github.com/chintan-diwakar/prompt-contribution-graph';

function roundedRectangle(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.fill();
}

function drawStat(context, label, value, x, width) {
  context.fillStyle = '#fffdfa';
  roundedRectangle(context, x, 170, width, 138, 24);
  context.fillStyle = '#8d7f72';
  context.font = '600 18px system-ui, sans-serif';
  context.fillText(label.toUpperCase(), x + 26, 210);
  context.fillStyle = '#332b25';
  context.font = '700 52px system-ui, sans-serif';
  context.fillText(value.toLocaleString(), x + 26, 275);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function drawHeatmap(context, daily) {
  const counts = new Map(daily.map((item) => [item.date, item.count]));
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay() - (52 * 7));
  const colors = ['#ede6dd', '#f4c4a9', '#e99a73', '#d96b3d', '#b94921'];
  const cell = 12;
  const gap = 4;
  for (let index = 0; index < 53 * 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const count = counts.get(localDateKey(date)) || 0;
    const level = count ? count <= 2 ? 1 : count <= 5 ? 2 : count <= 9 ? 3 : 4 : 0;
    context.fillStyle = colors[level];
    context.fillRect(62 + (Math.floor(index / 7) * (cell + gap)), 408 + ((index % 7) * (cell + gap)), cell, cell);
  }
}

export async function createShareImage(summary, insight) {
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  context.fillStyle = '#f5efe6';
  context.fillRect(0, 0, WIDTH, HEIGHT);

  context.fillStyle = '#d95725';
  context.beginPath();
  context.arc(65, 68, 15, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#332b25';
  context.font = '700 38px system-ui, sans-serif';
  context.fillText('Prompt Contribution Graph', 96, 81);
  context.fillStyle = '#786b60';
  context.font = '500 21px system-ui, sans-serif';
  context.fillText(insight, 64, 132, 1070);

  drawStat(context, 'Prompts today', summary.today, 64, 252);
  drawStat(context, 'Current streak', summary.currentStreak, 342, 252);
  drawStat(context, 'Longest streak', summary.longestStreak, 620, 252);
  drawStat(context, 'All-time prompts', summary.total, 898, 238);

  context.fillStyle = '#51463d';
  context.font = '650 22px system-ui, sans-serif';
  context.fillText('Last 12 months', 64, 370);
  drawHeatmap(context, summary.daily);
  context.fillStyle = '#998b7f';
  context.font = '500 17px ui-monospace, monospace';
  context.fillText(PROJECT_URL, 64, 630);
  context.fillStyle = '#d95725';
  context.fillText('Local-first · no telemetry', 888, 630);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Could not render the activity image.')), 'image/png');
  });
  return new File([blob], 'Prompt-Contribution-Graph.png', { type: 'image/png' });
}

export async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result), { once: true });
    reader.addEventListener('error', () => reject(reader.error || new Error('Could not read the activity image.')), { once: true });
    reader.readAsDataURL(file);
  });
}
