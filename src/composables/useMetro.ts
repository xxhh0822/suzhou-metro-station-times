import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Catalog, Direction, Line, LiveData, SearchResult, Selection, Timetable } from '../types/metro';
import { chinaDate, chinaWeekday, readSelection, writeSelection } from '../utils/selection';

export function useMetro() {
  const lines = ref<Line[] | null>(null);
  const selection = ref<Selection | null>(null);
  const now = ref(Date.now());
  const catalogBusy = ref(false);
  const catalogError = ref('');
  const notice = ref('');
  const stationReversed = ref(false);
  const liveError = ref('');
  const scheduleError = ref('');
  const liveBusy = ref(false);
  const scheduleBusy = ref(false);
  const liveResult = ref<{ key: string; data: LiveData } | null>(null);
  const scheduleResult = ref<{ key: string; data: Timetable } | null>(null);
  const directionResult = ref<{ key: string; options: Direction[] } | null>(null);
  const today = computed(() => chinaDate(now.value));
  const todayWeekday = computed(() => chinaWeekday(now.value));
  const stationKey = computed(() => selection.value ? `${selection.value.line}|${selection.value.station}` : '');
  const liveKey = computed(() => stationKey.value ? `${stationKey.value}|${today.value}` : '');
  const scheduleKey = computed(() => selection.value ? `${stationKey.value}|${selection.value.direction}|${selection.value.weekday}` : '');
  const selectedLine = computed(() => lines.value?.find(line => line.id === selection.value?.line));
  const visibleStations = computed(() => selectedLine.value ? stationReversed.value ? [...selectedLine.value.stations].reverse() : selectedLine.value.stations : []);
  const live = computed(() => liveResult.value?.key === liveKey.value ? liveResult.value.data : null);
  const timetable = computed(() => scheduleResult.value?.key === scheduleKey.value ? scheduleResult.value.data : null);
  const directions = computed(() => directionResult.value?.key === stationKey.value ? directionResult.value.options : []);
  const selectedDirection = computed(() => directions.value.find(direction => direction.id === selection.value?.direction));
  const liveDirection = computed(() => live.value?.directions.find(direction => direction.name === selectedDirection.value?.name));
  const stale = computed(() => !!live.value && (now.value - Date.parse(live.value.fetchedAt) > 35000 || live.value.serviceDate !== today.value));

  let disposed = false;
  let fixedWeekday = false;
  let catalogVersion = 0;
  let liveVersion = 0;
  let scheduleVersion = 0;
  let catalogController: AbortController | null = null;
  let liveController: AbortController | null = null;
  let scheduleController: AbortController | null = null;
  let liveInFlight = false;
  let scheduleInFlight = false;
  const timers: ReturnType<typeof setInterval>[] = [];

  function restoreSelection() {
    if (!lines.value?.length) return;
    const restored = readSelection(lines.value);
    fixedWeekday = restored.fixedWeekday;
    selection.value = restored.selection;
    notice.value = restored.corrected ? '链接中的部分选项已失效，已为你选择可用的线路和站点。' : '';
    writeSelection(restored.selection, true);
  }

  async function loadCatalog() {
    const version = ++catalogVersion;
    catalogController?.abort();
    const controller = new AbortController();
    catalogController = controller;
    const timeout = setTimeout(() => controller.abort(), 12000);
    catalogBusy.value = true;
    catalogError.value = '';
    try {
      const response = await fetch('/api/catalog', { cache: 'no-store', signal: controller.signal });
      const result = await response.json() as Catalog;
      if (!response.ok || !Array.isArray(result.lines) || !result.lines.length) throw new Error('catalog');
      if (disposed || version !== catalogVersion || controller.signal.aborted) return;
      lines.value = result.lines;
      restoreSelection();
    } catch {
      if (!disposed && version === catalogVersion) catalogError.value = controller.signal.aborted ? '线路目录响应超时，请重试。' : '暂时无法获取线路与站点，请重试。';
    } finally {
      clearTimeout(timeout);
      if (!disposed && version === catalogVersion) catalogBusy.value = false;
    }
  }

  async function refreshLive() {
    if (disposed || document.hidden || liveInFlight || !selection.value) return;
    const { line, station } = selection.value;
    const key = liveKey.value;
    const version = liveVersion;
    const controller = new AbortController();
    liveController = controller;
    liveInFlight = true;
    liveBusy.value = true;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const query = new URLSearchParams({ line, station });
      const response = await fetch(`/api/live?${query}`, { cache: 'no-store', signal: controller.signal });
      const result = await response.json() as LiveData;
      if (!response.ok || result.line !== line || result.station !== station || result.serviceDate !== chinaDate(Date.now()) || !Number.isFinite(Date.parse(result.fetchedAt)) || !Array.isArray(result.directions)) throw new Error('live');
      if (!disposed && version === liveVersion && key === liveKey.value && !controller.signal.aborted) {
        liveResult.value = { key, data: result };
        liveError.value = '';
      }
    } catch {
      if (!disposed && version === liveVersion && key === liveKey.value) liveError.value = '实时班次获取失败，正在等待重试。';
    } finally {
      clearTimeout(timeout);
      if (!disposed && version === liveVersion) { liveInFlight = false; liveBusy.value = false; }
    }
  }

  async function refreshTimetable() {
    if (disposed || document.hidden || scheduleInFlight || !selection.value) return;
    const { line, station, direction, weekday } = selection.value;
    const key = scheduleKey.value;
    const metadataKey = stationKey.value;
    const version = scheduleVersion;
    const controller = new AbortController();
    scheduleController = controller;
    scheduleInFlight = true;
    scheduleBusy.value = true;
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const query = new URLSearchParams({ line, station, direction, weekday: String(weekday) });
      const response = await fetch(`/api/timetable?${query}`, { cache: 'no-store', signal: controller.signal });
      const result = await response.json() as Timetable;
      if (!response.ok || result.line !== line || result.station !== station || result.direction !== direction || result.weekday !== weekday || !Array.isArray(result.directions) || !Array.isArray(result.times) || !Number.isFinite(Date.parse(result.fetchedAt))) throw new Error('schedule');
      if (!disposed && version === scheduleVersion && key === scheduleKey.value && !controller.signal.aborted) {
        scheduleResult.value = { key, data: result };
        directionResult.value = { key: metadataKey, options: result.directions };
        scheduleError.value = '';
      }
    } catch {
      if (!disposed && version === scheduleVersion && key === scheduleKey.value) scheduleError.value = '计划时刻获取失败，请稍后重试。';
    } finally {
      clearTimeout(timeout);
      if (!disposed && version === scheduleVersion) { scheduleInFlight = false; scheduleBusy.value = false; }
    }
  }

  watch(liveKey, () => {
    ++liveVersion;
    liveController?.abort();
    liveInFlight = false;
    liveBusy.value = false;
    liveResult.value = null;
    liveError.value = '';
    if (liveKey.value) void refreshLive();
  }, { flush: 'sync' });

  watch(scheduleKey, () => {
    ++scheduleVersion;
    scheduleController?.abort();
    scheduleInFlight = false;
    scheduleBusy.value = false;
    scheduleResult.value = null;
    scheduleError.value = '';
    if (scheduleKey.value) void refreshTimetable();
  }, { flush: 'sync' });

  watch(() => selectedLine.value?.id, () => { stationReversed.value = false; }, { flush: 'sync' });
  watch(todayWeekday, weekday => {
    if (!fixedWeekday && selection.value && selection.value.weekday !== weekday) {
      selection.value = { ...selection.value, weekday };
      writeSelection(selection.value, true);
    }
  }, { flush: 'sync' });

  function choose(next: Selection) {
    selection.value = next;
    notice.value = '';
    writeSelection(next);
  }
  function chooseLine(id: string) {
    const line = lines.value?.find(item => item.id === id);
    if (line?.stations[0]) chooseStation(id, line.stations[0]);
  }
  function chooseStation(line: string, station: string) {
    if (selection.value && lines.value?.some(item => item.id === line && item.stations.includes(station))) choose({ ...selection.value, line, station, direction: '0' });
  }
  function chooseDirection(direction: string) {
    if (selection.value && directions.value.some(item => item.id === direction)) choose({ ...selection.value, direction });
  }
  function chooseWeekday(weekday: number) {
    if (!selection.value || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) return;
    fixedWeekday = true;
    choose({ ...selection.value, weekday });
  }
  function toggleStationOrder() { if (selectedLine.value) stationReversed.value = !stationReversed.value; }
  function search(query: string): SearchResult[] {
    const keyword = query.trim();
    return keyword ? lines.value?.flatMap(line => line.stations.filter(station => station.includes(keyword)).map(station => ({ line, station, value: `${line.name} ${station}` }))) || [] : [];
  }
  function onVisible() {
    if (document.hidden) return;
    now.value = Date.now();
    void refreshLive();
    void refreshTimetable();
  }

  onMounted(() => {
    now.value = Date.now();
    void loadCatalog();
    timers.push(setInterval(() => { now.value = Date.now(); }, 1000), setInterval(() => { void refreshLive(); }, 10000), setInterval(() => { void refreshTimetable(); }, 300000));
    window.addEventListener('popstate', restoreSelection);
    document.addEventListener('visibilitychange', onVisible);
  });
  onBeforeUnmount(() => {
    disposed = true;
    ++catalogVersion; ++liveVersion; ++scheduleVersion;
    catalogController?.abort(); liveController?.abort(); scheduleController?.abort();
    timers.forEach(timer => clearInterval(timer));
    window.removeEventListener('popstate', restoreSelection);
    document.removeEventListener('visibilitychange', onVisible);
  });

  return { lines, selection, now, selectedLine, catalogBusy, catalogError, notice, stationReversed, visibleStations, live, timetable, directions, selectedDirection, liveDirection, stale, liveError, scheduleError, liveBusy, scheduleBusy, today, todayWeekday, chooseLine, chooseStation, chooseDirection, chooseWeekday, toggleStationOrder, search, refreshLive, refreshTimetable, loadCatalog };
}
