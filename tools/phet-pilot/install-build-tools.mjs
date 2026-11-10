import { access, lstat, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const npm = path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
await access(npm);
const pilots = ['density', 'pendulum-lab', 'circuit-construction-kit-dc'];
await Promise.all(pilots.filter(sim => !process.argv[2] || sim === process.argv[2]).map(async simulation => {
  const workspace = path.join(root, 'tmp/phet-pilot', simulation, 'monitored');
  for (const repo of ['chipper', ...(simulation === 'pendulum-lab' ? [] : ['perennial-alias']), simulation]) {
    const cwd = path.join(workspace, repo);
    const modules = path.join(cwd, 'node_modules');
    try {
      const stat = await lstat(modules);
      if (stat.isSymbolicLink()) {
        throw new Error(`Build dependencies must be independent directories, not links: ${modules}`);
      }
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    console.log(`${simulation}: installing locked ${repo} build dependencies`);
    const result = await exec(process.execPath, [npm, 'ci', '--offline', '--no-audit', '--no-fund'], {
      cwd, windowsHide: true, maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true', PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: 'true' },
    });
    await writeFile(path.join(workspace, `${repo}-install.log`), result.stdout + result.stderr);
  }
}));
