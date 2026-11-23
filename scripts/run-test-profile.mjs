import { spawnSync } from 'node:child_process';
import { loadAndValidateManifest } from './test-manifest.mjs';

const profile = process.argv[2];
if (!['fast', 'integration', 'full'].includes(profile)) throw new Error(`Unknown profile: ${profile ?? '(missing)'}`);
const manifest = loadAndValidateManifest();
const run = (label, command, args) => {
  console.log(`\n[${profile}] ${label}: ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', cwd: process.cwd(), env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
};
const select = runner => manifest.entries.filter(entry => entry.profiles.includes(profile) && entry.runner === runner).map(entry => entry.path);
const backend = select('backend-node-test');
const playground = select('playground-node-test');
const node = process.execPath;
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (profile === 'fast') {
  run('architecture', npm, ['run', 'check:architecture']);
  run('typecheck', npm, ['run', 'typecheck']);
  run('fast backend selection', node, ['--import', 'tsx', '--test', '--test-concurrency=1', ...backend]);
} else if (profile === 'integration') {
  if (process.version !== 'v22.23.5') throw new Error(`Integration baseline requires Node v22.23.5; found ${process.version}. Use an explicitly labeled exploratory run to assess another Node version.`);
  run('Node/native SQLite preflight', node, ['scripts/sqlite-preflight.mjs']);
  run('integration backend selection', node, ['--import', 'tsx', '--test', '--test-concurrency=1', ...backend]);
  run('playground selection', npm, ['--prefix', 'testing', 'run', 'test:playground']);
} else {
  if (process.version !== 'v22.23.5') throw new Error(`Full baseline requires Node v22.23.5; found ${process.version}. Use an explicitly labeled exploratory run to assess another Node version.`);
  run('Node/native SQLite preflight', node, ['scripts/sqlite-preflight.mjs']);
  run('architecture', npm, ['run', 'check:architecture']);
  run('typecheck', npm, ['run', 'typecheck']);
  run('build', npm, ['run', 'build']);
  run('unchanged full backend command', npm, ['test', '--', '--test-concurrency=1']);
  run('all playground tests', npm, ['--prefix', 'testing', 'run', 'test:playground']);
}
console.log(`\n${profile.toUpperCase()} profile passed (${backend.length} selected backend files, ${playground.length} selected playground files).`);
