import { MetroError } from './metro-service.mjs';

export async function metroResponse(load: () => Promise<unknown>) {
  const headers = { 'Cache-Control': 'no-store, max-age=0' };
  try {
    return Response.json(await load(), { headers });
  } catch (error) {
    const status = error instanceof MetroError ? error.status : 503;
    return Response.json({ error: status === 400 ? (error as Error).message : '暂时无法获取原站数据，请稍后重试。' }, { status, headers });
  }
}
