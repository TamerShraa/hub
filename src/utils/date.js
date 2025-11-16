function toMs(dateStr) {
  if (!dateStr) return null;
  const value = Date.parse(dateStr);
  return Number.isNaN(value) ? null : value;
}

function inRange(dateStr, startMs, endMs) {
  const value = Date.parse(dateStr);
  if (Number.isNaN(value)) return false;
  if (startMs && value < startMs) return false;
  if (endMs && value > endMs) return false;
  return true;
}

function resolvePreset(preset) {
  if (!preset) return { start: null, end: null };
  const now = new Date();
  const end = new Date(now);
  let start;
  if (preset === 'thisWeek') {
    const day = now.getDay();
    const diff = (day === 0 ? 6 : day - 1);
    start = new Date(now);
    start.setDate(now.getDate() - diff);
  } else if (preset === 'thisMonth') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === 'lastMonth') {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end.setFullYear(start.getFullYear(), start.getMonth() + 1, 0);
  } else {
    return { start: null, end: null };
  }
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

module.exports = { toMs, inRange, resolvePreset };
