// Loads the Vercel Functions the way Vercel does: compiled to plain ES modules, run by Node.
// Vite and Vitest resolve extensionless imports, but Node's ESM loader doesn't, so a missing
// ".js" in api/ imports breaks production (500 FUNCTION_INVOCATION_FAILED) while dev works.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const api = join(root, 'api');
const sources = readdirSync(api).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
const functions = sources.filter((f) => !f.startsWith('_'));   // "_" files are shared helpers, not endpoints
const out = mkdtempSync(join(tmpdir(), 'cinetrack-api-'));
let failed = false;

try {
  copyFileSync(join(root, 'package.json'), join(out, 'package.json'));   // "type": "module"
  execFileSync(process.execPath, [
    join(root, 'node_modules/typescript/bin/tsc'),
    ...sources.map((f) => join('api', f)),
    '--outDir', out, '--rootDir', api, '--module', 'esnext', '--target', 'es2022',
    '--moduleResolution', 'bundler', '--skipLibCheck', '--types', 'node',
  ], { cwd: root, stdio: 'inherit' });

  for (const f of functions) {
    const file = f.replace(/\.ts$/, '.js');
    try {
      const mod = await import(pathToFileURL(join(out, file)).href);
      if (typeof mod.GET !== 'function') throw new Error('does not export a GET handler');
      const res = await mod.GET(new Request('http://localhost/api/x?path=account'));   // no keys set: a clean 4xx/5xx response
      if (!(res instanceof Response)) throw new Error('GET did not return a Response');
      console.log(`ok   api/${f}  (loads, GET → ${res.status})`);
    } catch (err) {
      failed = true;
      console.error(`FAIL api/${f}: ${err.code ?? ''} ${err.message}`);
    }
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
