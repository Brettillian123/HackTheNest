import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const graderCli = resolve(root, 'grader/node_modules/tsx/dist/cli.mjs');
if (!existsSync(graderCli)) {
  console.error('Grader dependencies are missing. Run: npm.cmd install --prefix grader');
  process.exit(1);
}

const graderPort = process.env.GRADER_PORT || '3101';
const commonEnv = { ...process.env, GRADER_PORT: graderPort };
const children = [
  spawn(process.execPath, ['--env-file=.env', graderCli, 'grader/server.ts'], { cwd: root, env: commonEnv, stdio: 'inherit' }),
  spawn(process.execPath, ['--env-file=.env', 'dev-server.mjs'], {
    cwd: root,
    env: { ...commonEnv, GRADER_SERVICE_URL: `http://127.0.0.1:${graderPort}/grade` },
    stdio: 'inherit',
  }),
];

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (!child.killed) child.kill();
  setTimeout(() => process.exit(code), 300);
}

for (const child of children) child.on('exit', (code) => {
  if (!stopping) stopAll(code || 0);
});
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
