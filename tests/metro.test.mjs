import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseCatalog, parseLive, parseTimetable } from '../lib/metro.mjs';

const fixture = name => readFile(new URL(`./fixtures/${name}.html`, import.meta.url), 'utf8');
const jinshang = { line: '6', station: '金尚路' };
const tuesday = { ...jinshang, direction: '1', weekday: 2 };

test('reads every source catalog line and preserves station order and interchange memberships', async () => {
  const html = await fixture('catalog');
  const lines = parseCatalog(html);
  assert.deepEqual(lines.map(line => line.id), ['1', '2', '3', '4', '5', '6', '7', '8', '11']);
  assert.equal(lines.reduce((count, line) => count + line.stations.length, 0), 275);
  assert.equal(new Set(lines.flatMap(line => line.stations)).size, 235);
  assert.deepEqual(lines.filter(line => line.stations.includes('唯亭')).map(line => line.id), ['3', '11']);
  assert.deepEqual(lines.find(line => line.id === '6').stations.slice(-3), ['南斜步', '金尚路', '桑田岛']);
  assert.throws(() => parseCatalog(html.replace('v-line="2"', 'v-line="1"')), /目录不完整/);
  assert.throws(() => parseCatalog(html.replace('<h4>木渎</h4>', '<h4></h4>')), /站点目录不完整/);
});

test('reads both directions and the nearest two services from a real line 6 page', async () => {
  const result = parseLive(await fixture('live-line6-jinshang'), jinshang);
  assert.deepEqual(result.map(direction => direction.name), ['桑田岛', '苏州新区火车站']);
  assert.deepEqual(result[1].services, [
    { label: '最近班次', minutes: 6, text: '6 分钟' },
    { label: '下一班', minutes: 15, text: '15 分钟' },
  ]);
});

test('keeps endpoint unavailability local to its direction and recognizes imminent arrival', async () => {
  const endpoint = parseLive(await fixture('live-line8-chefang'), { line: '8', station: '车坊' });
  assert.equal(endpoint[0].name, '车坊');
  assert.deepEqual(endpoint[0].services.map(service => service.minutes), [null, null]);
  assert.ok(endpoint[1].services.every(service => service.minutes > 0));
  const imminent = (await fixture('live-line6-jinshang')).replace('6 分钟', '即将到达');
  assert.deepEqual(parseLive(imminent, jinshang)[1].services[0], { label: '最近班次', minutes: 0, text: '即将到达' });
});

test('uses actual through-service direction names on lines 3 and 11', async () => {
  for (const line of ['3', '11']) {
    const suffix = line === '3' ? 'line3-weiting' : 'line11-weiting-sunday';
    const selection = { line, station: '唯亭' };
    const live = parseLive(await fixture(`live-${suffix}`), selection);
    assert.deepEqual(live.map(direction => direction.name), ['花桥', '苏州新区火车站']);
    const timetable = parseTimetable(await fixture(`timetable-${suffix}`), { ...selection, direction: line === '3' ? '1' : '0', weekday: line === '3' ? 2 : 7 });
    assert.deepEqual(timetable.directions, [{ id: '0', name: '花桥' }, { id: '1', name: '苏州新区火车站' }]);
    assert.ok(timetable.times.length > 0);
  }
});

test('permits only the verified Weiting through-service source-line normalization', async () => {
  const east = await fixture('timetable-line3-weiting-through-east');
  const west = await fixture('timetable-line11-weiting-through-west');
  const eastQuery = { line: '3', station: '唯亭', direction: '0', weekday: 2 };
  const westQuery = { line: '11', station: '唯亭', direction: '1', weekday: 2 };
  assert.equal(parseTimetable(east, eastQuery).sourceLine, '11');
  assert.equal(parseTimetable(west, westQuery).sourceLine, '3');
  assert.ok(parseTimetable(east, eastQuery).times.length > 0);
  assert.throws(() => parseTimetable(east, { ...eastQuery, station: '临顿路' }), /线路或站点不符/);
  assert.throws(() => parseTimetable(east, { ...eastQuery, line: '6' }), /线路或站点不符/);
  assert.throws(() => parseTimetable(east.replace('花桥</div>', '唯亭</div>'), eastQuery), /线路或站点不符/);
  assert.throws(() => parseTimetable(west.replace('苏州新区火车站</div>', '木渎</div>'), westQuery), /线路或站点不符/);
  assert.throws(() => parseTimetable(east, { ...eastQuery, direction: '1' }), /方向不符/);
  assert.throws(() => parseTimetable(west, { ...westQuery, weekday: 7 }), /星期不符/);
});

test('reads timetable rows without confusing the header or current-date heading with the queried weekday', async () => {
  const result = parseTimetable(await fixture('timetable-line6-jinshang-tuesday'), tuesday);
  assert.equal(result.times.length, 113);
  assert.equal(result.times[0], '05:43');
  assert.equal(result.times.at(-1), '22:23');
  const sunday = await fixture('timetable-line11-weiting-sunday');
  assert.match(sunday, /11-24 周二/);
  assert.ok(parseTimetable(sunday, { line: '11', station: '唯亭', direction: '0', weekday: 7 }).times.length > 0);
  assert.throws(() => parseTimetable(sunday, { line: '11', station: '唯亭', direction: '0', weekday: 2 }), /星期不符/);
});

test('accepts a real endpoint empty table while still returning valid direction choices', async () => {
  const result = parseTimetable(await fixture('timetable-line8-chefang'), { line: '8', station: '车坊', direction: '0', weekday: 2 });
  assert.deepEqual(result.times, []);
  assert.deepEqual(result.directions, [{ id: '0', name: '车坊' }, { id: '1', name: '西津桥' }]);
  assert.deepEqual(parseTimetable(await fixture('timetable-line6-terminal-empty'), { line: '6', station: '苏州新区火车站', direction: '1', weekday: 2 }).times, []);
});

test('rejects wrong identities, wrong active direction, and broken source structure', async () => {
  const live = await fixture('live-line6-jinshang');
  const timetable = await fixture('timetable-line6-jinshang-tuesday');
  assert.throws(() => parseLive(live, { line: '6', station: '南斜步' }), /站点不符/);
  assert.throws(() => parseLive(live, { line: '5', station: '金尚路' }), /线路不符/);
  assert.throws(() => parseTimetable(timetable, { ...tuesday, station: '南斜步' }), /线路或站点不符/);
  assert.throws(() => parseTimetable(timetable, { ...tuesday, line: '5' }), /线路或站点不符/);
  assert.throws(() => parseTimetable(timetable, { ...tuesday, direction: '0' }), /方向不符/);
  assert.throws(() => parseTimetable(timetable.replace('小时', '损坏'), tuesday), /表头已变化/);
  assert.throws(() => parseLive(live.replace('6 分钟', '未知'), jinshang), /时间无法识别/);
  assert.throws(() => parseLive(live.replace('</div>', ''), jinshang), /结构不完整/);
});
