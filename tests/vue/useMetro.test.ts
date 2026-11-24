import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { useMetro } from '../../src/composables/useMetro';
import { chinaDate } from '../../src/utils/selection';
import type { LiveData, Selection, Timetable } from '../../src/types/metro';

const catalog = [
  { id: '2', name: '2号线', stations: ['苏州火车站', '金尚路'] },
  { id: '6', name: '6号线', stations: ['苏州新区火车站', '南斜步', '金尚路', '桑田岛'] },
  { id: '11', name: '11号线', stations: ['唯亭', '花桥'] },
];
const directions = [{ id: '0', name: '桑田岛' }, { id: '1', name: '苏州新区火车站' }];
const wrappers: VueWrapper[] = [];
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function liveData(selection: Selection): LiveData {
  return { ...selection, fetchedAt: new Date().toISOString(), serviceDate: chinaDate(Date.now()), directions: directions.map(direction => ({ name: direction.name, services: [{ label: '最近班次', minutes: 2, text: '2 分钟' }, { label: '下一班', minutes: 10, text: '10 分钟' }] })) };
}
function timetableData(selection: Selection): Timetable {
  return { ...selection, sourceLine: selection.line, fetchedAt: new Date().toISOString(), directions, times: ['06:00', '09:10', '22:00'] };
}
function harness() {
  let api!: ReturnType<typeof useMetro>;
  const controls: {
    failLive: boolean;
    live?: (selection: Selection) => Promise<Response>;
    timetable?: (selection: Selection) => Promise<Response>;
  } = { failLive: false };
  const requests: { path: string; selection: Selection; signal: AbortSignal | null | undefined }[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    const selection = { line: url.searchParams.get('line') || '', station: url.searchParams.get('station') || '', direction: url.searchParams.get('direction') || '0', weekday: Number(url.searchParams.get('weekday') || 2) };
    requests.push({ path: url.pathname, selection, signal: init?.signal });
    if (url.pathname === '/api/catalog') return json({ lines: catalog, fetchedAt: new Date().toISOString(), source: 'https://example.test/station' });
    if (url.pathname === '/api/live') {
      if (controls.failLive) return json({ error: 'Unavailable' }, 503);
      return controls.live ? controls.live(selection) : json(liveData(selection));
    }
    return controls.timetable ? controls.timetable(selection) : json(timetableData(selection));
  });
  vi.stubGlobal('fetch', fetcher);
  const wrapper = mount(defineComponent({ setup() { api = useMetro(); return () => h('div'); } }));
  wrappers.push(wrapper);
  return { api, controls, requests };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] });
  vi.setSystemTime(new Date('2026-11-24T09:00:00+08:00'));
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  window.history.replaceState({}, '', '/');
});
afterEach(() => {
  wrappers.splice(0).forEach(wrapper => wrapper.unmount());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Vue metro query state', () => {
  it('defaults to line 6 Jinshang and restores validated URL choices and history', async () => {
    const { api } = harness();
    await flushPromises();
    expect(api.selection.value).toEqual({ line: '6', station: '金尚路', direction: '1', weekday: 2 });
    expect(api.selectedDirection.value?.name).toBe('苏州新区火车站');
    window.history.replaceState({}, '', '/?line=11&station=唯亭&direction=1&weekday=7');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flushPromises();
    expect(api.selection.value).toEqual({ line: '11', station: '唯亭', direction: '1', weekday: 7 });
    expect(api.timetable.value?.weekday).toBe(7);
    expect(api.live.value?.serviceDate).toBe('2026-11-24');
    window.history.replaceState({}, '', '/?line=99&station=不存在&direction=9&weekday=99');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await flushPromises();
    expect(api.selection.value?.station).toBe('金尚路');
    expect(api.notice.value).toContain('选项已失效');
  });

  it('ignores a late live response from the previously selected station', async () => {
    const { api, controls, requests } = harness();
    let release!: (response: Response) => void;
    controls.live = selection => selection.station === '金尚路' ? new Promise(resolve => { release = resolve; }) : Promise.resolve(json(liveData(selection)));
    await flushPromises();
    const previousRequest = requests.find(request => request.path === '/api/live');
    api.chooseStation('6', '南斜步');
    await flushPromises();
    expect(previousRequest?.signal?.aborted).toBe(true);
    expect(api.live.value?.station).toBe('南斜步');
    release(json(liveData({ line: '6', station: '金尚路', direction: '1', weekday: 2 })));
    await flushPromises();
    expect(api.live.value?.station).toBe('南斜步');
    expect(api.selection.value?.station).toBe('南斜步');
  });

  it('switches only the plan when choosing Sunday and rejects late previous plans', async () => {
    const { api, controls, requests } = harness();
    await flushPromises();
    const liveRequests = requests.filter(request => request.path === '/api/live').length;
    let release!: (response: Response) => void;
    controls.timetable = selection => selection.weekday === 7 ? new Promise(resolve => { release = resolve; }) : Promise.resolve(json(timetableData(selection)));
    api.chooseWeekday(7);
    await flushPromises();
    api.chooseWeekday(6);
    await flushPromises();
    release(json(timetableData({ line: '6', station: '金尚路', direction: '1', weekday: 7 })));
    await flushPromises();
    expect(api.timetable.value?.weekday).toBe(6);
    expect(api.live.value?.serviceDate).toBe('2026-11-24');
    expect(requests.filter(request => request.path === '/api/live')).toHaveLength(liveRequests);
  });

  it('marks retained data stale after 35 seconds of failures and recovers on refresh', async () => {
    const { api, controls } = harness();
    await flushPromises();
    const fetchedAt = api.live.value?.fetchedAt;
    controls.failLive = true;
    await vi.advanceTimersByTimeAsync(36000);
    expect(api.live.value?.fetchedAt).toBe(fetchedAt);
    expect(api.liveError.value).toContain('获取失败');
    expect(api.stale.value).toBe(true);
    controls.failLive = false;
    await api.refreshLive();
    expect(api.liveError.value).toBe('');
    expect(api.stale.value).toBe(false);
    expect(api.live.value?.fetchedAt).not.toBe(fetchedAt);
  });

  it('reverses display order without changing the catalog or query and resets on line changes', async () => {
    const { api } = harness();
    await flushPromises();
    const query = window.location.search;
    const original = [...api.selectedLine.value!.stations];
    api.toggleStationOrder();
    expect(api.visibleStations.value).toEqual([...original].reverse());
    expect(api.selectedLine.value?.stations).toEqual(original);
    expect(window.location.search).toBe(query);
    expect(api.search('金尚路').map(result => result.line.id)).toEqual(['2', '6']);
    api.chooseLine('11');
    await flushPromises();
    expect(api.stationReversed.value).toBe(false);
    expect(api.visibleStations.value[0]).toBe('唯亭');
  });

  it('refreshes the live day and default plan at Shanghai midnight', async () => {
    vi.setSystemTime(new Date('2026-11-24T23:59:58+08:00'));
    const { api, requests } = harness();
    await flushPromises();
    expect(api.selection.value?.weekday).toBe(2);
    await vi.advanceTimersByTimeAsync(3000);
    await flushPromises();
    expect(api.today.value).toBe('2026-11-25');
    expect(api.selection.value?.weekday).toBe(3);
    expect(api.live.value?.serviceDate).toBe('2026-11-25');
    expect(requests.filter(request => request.path === '/api/live')).toHaveLength(2);
  });
});
