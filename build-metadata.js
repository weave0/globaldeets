#!/usr/bin/env node

const { execFileSync } = require('child_process');
const { writeFileSync } = require('fs');

function git(args, fallback) {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
  } catch {
    return fallback;
  }
}

const commit = process.env.CF_PAGES_COMMIT_SHA || git(['rev-parse', 'HEAD'], 'unknown');
const branch = process.env.CF_PAGES_BRANCH || git(['rev-parse', '--abbrev-ref', 'HEAD'], 'unknown');
const generatedAt = new Date().toISOString();

const metadata = {
  app: 'GlobalDeets',
  environment: process.env.NODE_ENV || 'development',
  branch,
  commit,
  shortCommit: commit === 'unknown' ? 'unknown' : commit.slice(0, 12),
  generatedAt,
};

writeFileSync('deploy-meta.json', `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Wrote deploy-meta.json for ${metadata.shortCommit} on ${branch}`);
