#!/usr/bin/env node

const { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } = require('fs');
const { extname, join } = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, 'dist');

const ROOT_STATIC_FILES = new Set([
  'manifest.json',
  'deploy-meta.json',
  'robots.txt',
  'sitemap.xml',
  '_headers',
]);

const PUBLIC_DIRECTORIES = ['assets', 'data', 'functions', 'shared'];

const EXCLUDED_ROOT_JS = new Set([
  'build-assets.js',
  'build-metadata.js',
  'generate-icons.js',
  'health-prod.js',
  'PROJECT_TEMPLATE.js',
  'QUICK_REFERENCE.js',
  'playwright.config.js',
  'eslint.config.mjs',
]);

const FORBIDDEN_SEGMENTS = [
  '_SECURE_KEYS',
  'node_modules',
  '.git',
  '.github',
  '.wrangler',
  '.netlify',
  'tests',
  'test-results',
  'playwright-report',
];

const FORBIDDEN_FILES = new Set([
  'package.json',
  'package-lock.json',
  'wrangler.toml',
  'playwright.config.js',
  'eslint.config.mjs',
]);

function copyFile(name) {
  const source = join(ROOT, name);
  if (!existsSync(source)) return;
  cpSync(source, join(OUT_DIR, name), { force: true });
}

function copyDirectory(name) {
  const source = join(ROOT, name);
  if (!existsSync(source)) return;
  cpSync(source, join(OUT_DIR, name), { recursive: true, force: true });
}

function getRootPublicFiles() {
  return readdirSync(ROOT).filter(name => {
    const source = join(ROOT, name);
    if (!statSync(source).isFile()) return false;

    if (ROOT_STATIC_FILES.has(name)) return true;
    if (extname(name) === '.html') return true;
    if (extname(name) === '.css') return true;
    if (extname(name) === '.js') return !EXCLUDED_ROOT_JS.has(name);

    return false;
  });
}

function walkFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

function relativeParts(fullPath) {
  return fullPath.slice(OUT_DIR.length + 1).split(/[\\/]+/);
}

function assertCleanArtifact() {
  const forbidden = walkFiles(OUT_DIR).filter(fullPath => {
    const parts = relativeParts(fullPath);
    const fileName = parts[parts.length - 1];
    return parts.some(part => FORBIDDEN_SEGMENTS.includes(part)) || FORBIDDEN_FILES.has(fileName);
  });

  if (forbidden.length > 0) {
    console.error('Refusing to deploy artifact with forbidden files:');
    for (const file of forbidden) console.error(`- ${file}`);
    process.exit(1);
  }
}

function runMetadata() {
  execFileSync(process.execPath, ['build-metadata.js'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, NODE_ENV: process.env.NODE_ENV || 'production' },
  });
}

function stageDeploy() {
  runMetadata();

  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  for (const file of getRootPublicFiles()) copyFile(file);
  for (const directory of PUBLIC_DIRECTORIES) copyDirectory(directory);

  assertCleanArtifact();
  console.log(`Staged Cloudflare Pages artifact in ${OUT_DIR}`);
}

if (require.main === module) {
  stageDeploy();
}

module.exports = { stageDeploy };
