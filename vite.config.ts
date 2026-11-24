import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { defineConfig, type PreviewServer, type ViteDevServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { handleApi } from './server/api.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));

function installApi(server: ViteDevServer | PreviewServer) {
  server.middlewares.use((request, response, next) => {
    const url = new URL(request.url ?? '/', 'http://localhost');
    if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return next();
    void handleApi(new Request(url, { method: request.method ?? 'GET' })).then(async result => {
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
    }).catch(() => {
      response.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ error: '暂时无法获取原站数据，请稍后重试。' }));
    });
  });
}

export default defineConfig({
  plugins: [vue(), { name: 'metro-api', configureServer: installApi, configurePreviewServer: installApi }],
  resolve: { alias: { '@': resolve(root, 'src') } },
  server: { host: '127.0.0.1', port: 4175, strictPort: true },
  preview: { host: '127.0.0.1', port: 4175, strictPort: true },
  build: { outDir: 'dist/client', emptyOutDir: true, sourcemap: false },
});
