import { parseCatalog, parseLive, parseTimetable } from './metro.mjs';

const sourceOrigin = 'http://106.14.198.252:8512';
// Workers requires a DNS hostname; the public A record targets the original server.
// Local development uses the original IP to work with this machine's proxy DNS.
const upstreamOrigin = import.meta.env?.DEV ? sourceOrigin : 'http://106-14-198-252.sslip.io:8512';

export class MetroError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function createMetroService({ fetcher = fetch, now = Date.now } = {}) {
  const cache = new Map();
  const pending = new Map();
  const date = () => new Date(now() + 8 * 3600000).toISOString().slice(0, 10);
  const weekday = () => new Date(`${date()}T12:00:00+08:00`).getUTCDay() || 7;
  const timestamp = () => new Date(now()).toISOString();

  async function cached(key, ttl, load) {
    const existing = cache.get(key);
    if (existing && existing.expires > now()) return existing.value;
    if (pending.has(key)) return pending.get(key);
    const request = Promise.resolve().then(load).then((value) => {
      for (const [entryKey, entry] of cache) if (entry.expires <= now()) cache.delete(entryKey);
      cache.set(key, { expires: now() + ttl, value });
      return value;
    }).finally(() => pending.delete(key));
    pending.set(key, request);
    return request;
  }

  async function upstream(path, selection) {
    const preferences = selection
      ? `line=${selection.line}; station=${encodeURIComponent(selection.station)}; direction=${selection.direction ?? '0'}; weekday=${selection.weekday ?? weekday()}`
      : undefined;
    const response = await fetcher(`${upstreamOrigin}${path}`, {
      headers: { Accept: 'text/html', ...(preferences ? { Cookie: preferences } : {}) },
      cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Metro source HTTP ${response.status}`);
    const html = await response.text();
    return { html, fetchedAt: timestamp() };
  }

  async function getCatalog() {
    return cached('catalog', 86400000, async () => {
      const { html, fetchedAt } = await upstream('/station');
      return { fetchedAt, source: `${sourceOrigin}/station`, lines: parseCatalog(html) };
    });
  }

  async function validateStation(selection) {
    const catalog = await getCatalog();
    const line = catalog.lines.find((item) => item.id === selection.line);
    if (!line || !line.stations.includes(selection.station)) throw new MetroError('请选择有效的线路和车站。');
  }

  async function getLive(selection) {
    await validateStation(selection);
    const serviceDate = date();
    const currentWeekday = new Date(`${serviceDate}T12:00:00+08:00`).getUTCDay() || 7;
    const { line, station } = selection;
    return cached(JSON.stringify(['live', line, station, serviceDate]), 8000, async () => {
      const { html, fetchedAt } = await upstream('/stationDetail', { line, station, weekday: currentWeekday });
      return { fetchedAt, serviceDate, line, station, directions: parseLive(html, { line, station }) };
    });
  }

  async function getTimetable(selection) {
    const { line, station, direction, weekday: requestedWeekday } = selection;
    if (!['0', '1'].includes(direction) || !Number.isInteger(requestedWeekday) || requestedWeekday < 1 || requestedWeekday > 7) {
      throw new MetroError('请选择有效的方向和星期。');
    }
    await validateStation(selection);
    return cached(JSON.stringify(['timetable', line, station, direction, requestedWeekday]), 300000, async () => {
      const { html, fetchedAt } = await upstream('/scheduling', selection);
      const { directions, times, sourceLine } = parseTimetable(html, selection);
      return { fetchedAt, line, station, direction, weekday: requestedWeekday, sourceLine, directions, times };
    });
  }

  return { getCatalog, getLive, getTimetable };
}

export const metroService = createMetroService();
