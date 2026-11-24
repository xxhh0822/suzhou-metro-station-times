import { handleApi } from '../server/api.mjs';

declare const __METRO_ASSETS__: Record<string, { body: string; type: string }>;
const assets = __METRO_ASSETS__;

export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === '/api' || pathname.startsWith('/api/')) return handleApi(request);
    if (!['GET', 'HEAD'].includes(request.method)) {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
    }
    const asset = assets[pathname === '/' ? '/index.html' : pathname];
    if (!asset) return new Response('Not found', { status: 404 });
    return new Response(request.method === 'HEAD' ? null : asset.body, {
      headers: {
        'Content-Type': asset.type,
        'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  },
};
