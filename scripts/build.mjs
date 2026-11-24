import { build as buildClient } from 'vite';
import { build as buildWorker } from 'esbuild';
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'dist');
if (dirname(output) !== root || basename(output) !== 'dist') throw new Error('Invalid build output directory.');
await rm(output, { recursive: true, force: true });
await buildClient({ root, configFile: resolve(root, 'vite.config.ts') });

const client = resolve(output, 'client');
const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
};
const assets = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await collect(path);
    else {
      const type = contentTypes[extname(entry.name)] ?? (extname(entry.name) ? null : 'text/plain; charset=utf-8');
      if (!type) throw new Error(`Unsupported static asset type: ${extname(entry.name)}`);
      assets['/' + relative(client, path).split(sep).join('/')] = { body: await readFile(path, 'utf8'), type };
    }
  }
}
await collect(client);
await mkdir(resolve(output, 'server'), { recursive: true });
await buildWorker({
  entryPoints: [resolve(root, 'worker/index.ts')], outfile: resolve(output, 'server/index.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
  sourcemap: false, define: { __METRO_ASSETS__: JSON.stringify(assets), 'import.meta.env.DEV': 'false' },
});
await mkdir(resolve(output, '.openai'), { recursive: true });
await cp(resolve(root, '.openai/hosting.json'), resolve(output, '.openai/hosting.json'));
console.log(`Built Vue client and Worker with ${Object.keys(assets).length} static assets.`);
