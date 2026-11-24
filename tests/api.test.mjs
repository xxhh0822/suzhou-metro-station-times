import test from 'node:test';
import assert from 'node:assert/strict';
import { createMetroService } from '../lib/metro-service.mjs';

const stations = {
  '1': ['木渎', '广济南路'], '2': ['苏州火车站'], '3': ['唯亭'],
  '4': ['红庄'], '5': ['劳动路'], '6': ['金尚路', '南斜步'],
  '7': ['木里'], '8': ['车坊'], '11': ['唯亭'],
};
const catalogHtml = `<div class="left-menu"><ul>${Object.keys(stations).map(id => `<li v-line="${id}">${id}号线</li>`).join('')}</ul></div><div class="con">${Object.values(stations).map(names => `<div class="right-con"><ul>${names.map(name => `<li><div class="menu-txt"><h4>${name}</h4></div></li>`).join('')}</ul></div>`).join('')}</div>`;
const directionNames = line => line === '6' ? ['桑田岛', '苏州新区火车站'] : ['花桥', '苏州新区火车站'];

function liveHtml(line, station) {
  const names = directionNames(line);
  return `<p class="staTre-info-title">${station}</p><div class="staTre-timeline-item"><div>${line} 号线</div>${['最近班次', '下一班'].map((label, index) => `<span>${label}</span><div class="staTre-timeline-tableWrap"><div class="staTre-timeline-tableHead"><div class="tableLeft">${names[0]}方向</div><div class="tableRight">${names[1]}方向</div></div><div class="staTre-timeline-tableBody"><div class="tableLeft"><div class="inStation-time">${index + 2} 分钟</div></div><div class="tableRight"><div class="inStation-time">${index + 5} 分钟</div></div></div></div>`).join('')}</div>`;
}

function scheduleHtml(line, station, direction, weekday) {
  const names = directionNames(line);
  return `<h3>${line} 号线 ${station}</h3><h3>11-24 周二</h3>${[1, 2, 3, 4, 5, 6, 7].map(day => `<div class="box-item ${day === Number(weekday) ? 'box-item-active' : ''}" v-weekday="${day}">周${day}</div>`).join('')}${names.map((name, id) => `<div class="box-item ${String(id) === direction ? 'box-item-active' : ''}" v-direction="${id}">${name}</div>`).join('')}<div class="tab-content"><div class="tab-item"><div class="tab-item-left">小时</div><div class="tab-item-right">时刻</div></div><div class="tab-item"><div class="tab-item-left">9</div><div class="tab-item-right">${direction === '1' ? '11 21' : '10 20'}</div></div></div>`;
}

function harness(initialTime = '2026-11-24T09:00:00+08:00') {
  let clock = Date.parse(initialTime);
  const calls = [];
  let failLive = false;
  let wrongStation = false;
  let liveGate;
  const fetcher = async (input, init = {}) => {
    const url = new URL(input);
    assert.equal(url.port, '8512');
    assert.ok(['106.14.198.252', '106-14-198-252.sslip.io'].includes(url.hostname));
    const raw = new Headers(init.headers).get('cookie') || '';
    const preferences = Object.fromEntries(raw.split(';').filter(Boolean).map(pair => {
      const at = pair.indexOf('=');
      return [pair.slice(0, at).trim(), decodeURIComponent(pair.slice(at + 1))];
    }));
    calls.push({ path: url.pathname, ...preferences });
    if (url.pathname === '/station') return new Response(catalogHtml);
    if (url.pathname === '/stationDetail') {
      if (liveGate) await liveGate;
      if (failLive) return new Response('Unavailable', { status: 503 });
      return new Response(liveHtml(preferences.line, wrongStation ? '错误站点' : preferences.station));
    }
    assert.equal(url.pathname, '/scheduling');
    return new Response(scheduleHtml(preferences.line, preferences.station, preferences.direction, preferences.weekday));
  };
  return {
    service: createMetroService({ fetcher, now: () => clock }), calls,
    advance(ms) { clock += ms; },
    set failLive(value) { failLive = value; },
    set wrongStation(value) { wrongStation = value; },
    set liveGate(value) { liveGate = value; },
    count(path) { return calls.filter(call => call.path === path).length; },
  };
}

const liveQuery = { line: '6', station: '金尚路' };
const planQuery = { ...liveQuery, direction: '1', weekday: 2 };

test('catalog is parsed from source and expires after 24 hours', async () => {
  const h = harness();
  const catalog = await h.service.getCatalog();
  assert.equal(catalog.lines.length, 9);
  assert.deepEqual(catalog.lines.find(line => line.id === '6').stations, ['金尚路', '南斜步']);
  h.advance(24 * 3600000 - 1);
  await h.service.getCatalog();
  assert.equal(h.count('/station'), 1);
  h.advance(2);
  await h.service.getCatalog();
  assert.equal(h.count('/station'), 2);
});

test('live cache separates station and line and expires after 8 seconds', async () => {
  const h = harness();
  const first = await h.service.getLive(liveQuery);
  assert.equal(first.station, '金尚路');
  assert.equal(first.line, '6');
  assert.equal(first.serviceDate, '2026-11-24');
  await h.service.getLive(liveQuery);
  assert.equal(h.count('/stationDetail'), 1);
  await h.service.getLive({ line: '6', station: '南斜步' });
  await h.service.getLive({ line: '11', station: '唯亭' });
  assert.equal(h.count('/stationDetail'), 3);
  h.advance(8001);
  await h.service.getLive(liveQuery);
  assert.equal(h.count('/stationDetail'), 4);
});

test('timetable cache includes line, station, direction and weekday', async () => {
  const h = harness();
  const plan = await h.service.getTimetable(planQuery);
  assert.deepEqual(plan.times, ['09:11', '09:21']);
  assert.equal(plan.weekday, 2);
  await h.service.getTimetable(planQuery);
  assert.equal(h.count('/scheduling'), 1);
  await h.service.getTimetable({ ...planQuery, weekday: 7 });
  await h.service.getTimetable({ ...planQuery, direction: '0' });
  await h.service.getTimetable({ ...planQuery, station: '南斜步' });
  await h.service.getTimetable({ ...planQuery, line: '11', station: '唯亭' });
  assert.equal(h.count('/scheduling'), 5);
  h.advance(300001);
  await h.service.getTimetable(planQuery);
  assert.equal(h.count('/scheduling'), 6);
});

test('weekend timetable does not alter the live service date or weekday', async () => {
  const h = harness();
  const sunday = await h.service.getTimetable({ ...planQuery, weekday: 7 });
  assert.equal(sunday.weekday, 7);
  const live = await h.service.getLive(liveQuery);
  assert.equal(live.serviceDate, '2026-11-24');
  const request = h.calls.find(call => call.path === '/stationDetail');
  assert.equal(request.weekday, '2');
});

test('Shanghai midnight invalidates live data even inside the 8 second TTL', async () => {
  const h = harness('2026-11-24T23:59:58+08:00');
  assert.equal((await h.service.getLive(liveQuery)).serviceDate, '2026-11-24');
  h.advance(3000);
  assert.equal((await h.service.getLive(liveQuery)).serviceDate, '2026-11-25');
  assert.equal(h.count('/stationDetail'), 2);
  assert.equal(h.calls.filter(call => call.path === '/stationDetail').at(-1).weekday, '3');
});

test('invalid line, station, weekday and direction are rejected as 400', async () => {
  const h = harness();
  const bad = [
    () => h.service.getLive({ line: '99', station: '金尚路' }),
    () => h.service.getLive({ line: '6', station: '不存在的车站' }),
    () => h.service.getTimetable({ ...planQuery, weekday: 0 }),
    () => h.service.getTimetable({ ...planQuery, weekday: 2.5 }),
    () => h.service.getTimetable({ ...planQuery, direction: '9' }),
    () => h.service.getLive({ line: '6', station: '金尚路; direction=0' }),
  ];
  for (const action of bad) await assert.rejects(action, error => error.status === 400);
  assert.equal(h.count('/stationDetail'), 0);
  assert.equal(h.count('/scheduling'), 0);
});

test('concurrent identical live requests share one source request', async () => {
  const h = harness();
  await h.service.getCatalog();
  let release;
  h.liveGate = new Promise(resolve => { release = resolve; });
  const one = h.service.getLive(liveQuery);
  const two = h.service.getLive(liveQuery);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.count('/stationDetail'), 1);
  release();
  const results = await Promise.all([one, two]);
  assert.equal(results[0].fetchedAt, results[1].fetchedAt);
});

test('source failures and mismatched identities do not poison live cache', async () => {
  const h = harness();
  h.failLive = true;
  await assert.rejects(() => h.service.getLive(liveQuery));
  h.failLive = false;
  h.wrongStation = true;
  await assert.rejects(() => h.service.getLive(liveQuery));
  h.wrongStation = false;
  assert.equal((await h.service.getLive(liveQuery)).station, '金尚路');
  assert.equal(h.count('/stationDetail'), 3);
});
