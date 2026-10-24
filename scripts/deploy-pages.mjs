// Publishes dist/ to the gh-pages branch.
//
// GitHub Pages can also build from an Actions workflow, which redeploys on
// every push and is the nicer setup. Pushing a workflow file needs a token
// with the `workflow` scope, which `gh auth refresh -s workflow` grants.
// Until then, this script does the same job by hand.

import { execFileSync } from 'node:child_process';
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';

const OUT = '.gh-pages';
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit' });

if (!existsSync('dist/index.html')) {
  console.error('dist/ is missing — run `npm run build` first.');
  process.exit(1);
}

const remote = execFileSync('git', ['remote', 'get-url', 'origin']).toString().trim();

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT);
cpSync('dist', OUT, { recursive: true });

run('git', ['init', '-q', '-b', 'gh-pages'], OUT);
run('git', ['add', '-A'], OUT);
run('git', ['commit', '-q', '-m', 'Deploy'], OUT);
run('git', ['push', '-q', '-f', remote, 'gh-pages'], OUT);

rmSync(OUT, { recursive: true, force: true });
console.log('\nPushed dist/ to gh-pages.');
