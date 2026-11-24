import type { Line, Selection } from '../types/metro';

export const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
export function chinaDate(timestamp: number) { return new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10); }
export function chinaWeekday(timestamp: number) { return new Date(timestamp + 8 * 3600000).getUTCDay() || 7; }

export function readSelection(lines: Line[]) {
  const params = new URLSearchParams(window.location.search);
  const fallbackLine = lines.find(line => line.id === '6') || lines[0]!;
  const line = lines.find(item => item.id === params.get('line')) || fallbackLine;
  const fallbackStation = line.id === '6' && line.stations.includes('金尚路') ? '金尚路' : line.stations[0]!;
  const station = line.stations.includes(params.get('station') || '') ? params.get('station')! : fallbackStation;
  const direction = /^[01]$/.test(params.get('direction') || '') ? params.get('direction')! : line.id === '6' && station === '金尚路' ? '1' : '0';
  const requestedWeekday = Number(params.get('weekday'));
  const fixedWeekday = Number.isInteger(requestedWeekday) && requestedWeekday >= 1 && requestedWeekday <= 7;
  const selection: Selection = { line: line.id, station, direction, weekday: fixedWeekday ? requestedWeekday : chinaWeekday(Date.now()) };
  const corrected = (Object.keys(selection) as (keyof Selection)[]).some(key => params.has(key) && params.get(key) !== String(selection[key]));
  return { selection, corrected, fixedWeekday };
}

export function writeSelection(selection: Selection, replace = false) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(selection)) url.searchParams.set(key, String(value));
  if (url.href !== window.location.href) window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
}
