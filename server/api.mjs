import { MetroError, metroService } from '../lib/metro-service.mjs';

const headers = { 'Cache-Control': 'no-store, max-age=0' };
const routes = new Set(['/api/catalog', '/api/live', '/api/timetable']);

export function createApiHandler(service = metroService) {
  return async function handleApi(request) {
    const url = new URL(request.url);
    if (!routes.has(url.pathname)) return Response.json({ error: '查询接口不存在。' }, { status: 404, headers });
    if (!['GET', 'HEAD'].includes(request.method)) {
      return Response.json({ error: '该接口仅支持查询。' }, { status: 405, headers: { ...headers, Allow: 'GET, HEAD' } });
    }
    try {
      const params = url.searchParams;
      const selection = { line: params.get('line') ?? '', station: params.get('station') ?? '' };
      const result = url.pathname === '/api/catalog' ? await service.getCatalog()
        : url.pathname === '/api/live' ? await service.getLive(selection)
        : await service.getTimetable({ ...selection, direction: params.get('direction') ?? '', weekday: Number(params.get('weekday') ?? '') });
      const response = Response.json(result, { headers });
      return request.method === 'HEAD' ? new Response(null, { status: response.status, headers: response.headers }) : response;
    } catch (error) {
      const status = error instanceof MetroError ? error.status : 503;
      const response = Response.json({ error: status === 400 ? error.message : '暂时无法获取原站数据，请稍后重试。' }, { status, headers });
      return request.method === 'HEAD' ? new Response(null, { status, headers: response.headers }) : response;
    }
  };
}

export const handleApi = createApiHandler();
