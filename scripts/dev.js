import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kids = [];

function run(cmd, args, extra = {}) {
  const child = spawn(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    ...extra,
  });
  kids.push(child);
  child.on('exit', (code) => {
    if (code) stop(code);
  });
  return child;
}

function stop(code = 0) {
  for (const child of kids) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

run('node', ['server/src/index.js']);
run('npm', ['run', 'dev', '-w', 'web']);
