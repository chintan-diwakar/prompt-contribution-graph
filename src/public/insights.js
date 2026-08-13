function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateKeyOffset(date, offset) {
  const shifted = new Date(date);
  shifted.setHours(12, 0, 0, 0);
  shifted.setDate(shifted.getDate() + offset);
  return localDateKey(shifted);
}

function promptWord(count) {
  return count === 1 ? 'prompt' : 'prompts';
}

export function createDailyInsight(summary, now = new Date()) {
  const countByDate = new Map(summary.daily.map((item) => [item.date, item.count]));
  const yesterday = countByDate.get(dateKeyOffset(now, -1)) || 0;
  const lastSevenDays = Array.from({ length: 7 }, (_, index) => countByDate.get(dateKeyOffset(now, -index)) || 0);
  const weeklyTotal = lastSevenDays.reduce((total, count) => total + count, 0);

  if (!summary.total) {
    return 'Your contribution graph is ready. One prompt starts today’s activity.';
  }

  if (!summary.today) {
    if (summary.currentStreak) {
      return `One prompt today keeps your ${summary.currentStreak}-day streak alive.`;
    }
    if (weeklyTotal) {
      return `A quiet day so far, after ${weeklyTotal} ${promptWord(weeklyTotal)} in the last seven days.`;
    }
    return 'Your prompt activity is quiet today. One prompt starts fresh momentum.';
  }

  if (summary.currentStreak >= 2 && summary.currentStreak === summary.longestStreak) {
    return `Personal best: your ${summary.currentStreak}-day streak is still growing.`;
  }

  if (!yesterday) {
    return `${summary.today} ${promptWord(summary.today)} today started a fresh contribution streak.`;
  }

  if (summary.today > yesterday) {
    const difference = summary.today - yesterday;
    return `You are ${difference} ${promptWord(difference)} ahead of yesterday.`;
  }

  if (summary.today === yesterday) {
    return `You matched yesterday with ${summary.today} ${promptWord(summary.today)} today.`;
  }

  return `${summary.today} ${promptWord(summary.today)} today, with ${weeklyTotal} in the last seven days.`;
}

export function createShareText(summary, insight) {
  const streak = `${summary.currentStreak}-day streak`;
  return [
    `My Prompt Contribution Graph: ${summary.today} ${promptWord(summary.today)} today · ${streak} · ${summary.total} all time.`,
    insight,
    'Tracking my CLI coding-agent prompts locally with Prompt Contribution Graph.',
  ].join('\n\n');
}
