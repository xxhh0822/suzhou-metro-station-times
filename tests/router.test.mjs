import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../server/api.mjs';
import { MetroError } from '../lib/metro-service.mjs';

function harness() {
  const calls = [];
  const handler = createApiHandler({
    async getCatalog() { calls.push(['catalog']); return { lines: [] }; },
    async getLive(value) { calls.push(['live', value]); return value; },
    async getTimetable(value) { calls.push(['timetable', value]); return value; },
  });
  const query = (path, method = 'GET') => handler(new Request('http://localhost' + path, { method }));
  return { calls, query };
}

test('catalog returns JSON and prevents stale browser caching', async () => {
  const { calls, query } = harness();
  const response = await query('/api/catalog');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await response.json(), { lines: [] });
  assert.deepEqual(calls, [['catalog']]);
});

test('live maps only station identity and leaves weekday to the service', async () => {
  const { calls, query } = harness();
  await query('/api/live?line=6&station=' + encodeURIComponent('金尚路') + '&weekday=7&url=https://example.invalid');
  assert.deepEqual(calls, [['live', { line: '6', station: '金尚路' }]]);
});

test('timetable maps the full query with numeric weekday', async () => {
  const { calls, query } = harness();
  await query('/api/timetable?line=11&station=' + encodeURIComponent('唯亭') + '&direction=0&weekday=7');
  assert.deepEqual(calls, [['timetable', { line: '11', station: '唯亭', direction: '0', weekday: 7 }]]);
});

test('unknown API routes stay JSON 404 instead of becoming the SPA', async () => {
  const { calls, query } = harness();
  const response = await query('/api/missing');
  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /application\/json/);
  assert.deepEqual(calls, []);
});

test('mutating methods are rejected without invoking the service', async () => {
  const { calls, query } = harness();
  const response = await query('/api/catalog', 'POST');
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
  assert.deepEqual(calls, []);
});

test('HEAD has the same successful metadata without response body', async () => {
  const { query } = harness();
  const response = await query('/api/catalog', 'HEAD');
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
  assert.match(response.headers.get('content-type'), /application\/json/);
});

test('validation stays 400 while source failures are 503 without internal details', async () => {
  const invalid = createApiHandler({ async getCatalog() { throw new MetroError('请选择有效的线路和车站。'); } });
  const sourceFailure = createApiHandler({ async getCatalog() { throw new Error('Internal source connection detail'); } });
  const validation = await invalid(new Request('http://localhost/api/catalog'));
  assert.equal(validation.status, 400);
  assert.equal((await validation.json()).error, '请选择有效的线路和车站。');
  const failure = await sourceFailure(new Request('http://localhost/api/catalog'));
  assert.equal(failure.status, 503);
  assert.equal((await failure.json()).error, '暂时无法获取原站数据，请稍后重试。');
});
