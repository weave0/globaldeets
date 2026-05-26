#!/usr/bin/env node

const { execFileSync, spawnSync } = require('child_process');
const { stageDeploy } = require('./stage-deploy');

const PROJECT_NAME = process.env.CF_PAGES_PROJECT || 'globaldeets';
const BRANCH = process.env.CF_PAGES_BRANCH || git(['rev-parse', '--abbrev-ref', 'HEAD'], 'main');
const COMMIT = process.env.CF_PAGES_COMMIT_SHA || git(['rev-parse', 'HEAD'], 'unknown');
const COMMIT_MESSAGE =
  process.env.CF_PAGES_COMMIT_MESSAGE || git(['log', '-1', '--pretty=%s'], 'Manual deploy');

function git(args, fallback) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

function runWranglerDeploy() {
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const args = [
    'wrangler',
    'pages',
    'deploy',
    'dist',
    '--project-name',
    PROJECT_NAME,
    '--branch',
    BRANCH,
  ];

  if (COMMIT !== 'unknown') {
    args.push('--commit-hash', COMMIT);
  }

  if (COMMIT_MESSAGE) {
    args.push('--commit-message', COMMIT_MESSAGE);
  }

  args.push('--commit-dirty=true');

  const result = spawnSync(npx, args, { stdio: 'inherit', shell: false });
  process.exit(result.status ?? 1);
}

stageDeploy();
runWranglerDeploy();
