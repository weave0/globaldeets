#!/usr/bin/env node
/**
 * Prints the estate coverage matrix from a published evidence set.
 *
 *   node tools/mission-control/coverage-report.mjs --evidence-dir=.evidence [--json] [--out=path]
 *   node tools/mission-control/coverage-report.mjs --seed            (uses observatory/mission-control)
 *
 * Read-only. The matrix is rebuilt from the published documents, validated, and rendered; nothing is written
 * unless --out is given.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildCoverageMatrix, renderCoverageMarkdown, validateCoverageMatrix } from './lib/coverage-matrix.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = Object.fromEntries(process.argv.slice(2).map(item => { const [key, value] = item.replace(/^--/, '').split('='); return [key, value ?? true]; }));
const dir = args.seed ? join(root, 'observatory', 'mission-control') : join(resolve(String(args['evidence-dir'] || '.evidence')), 'latest');
const read = name => JSON.parse(readFileSync(join(dir, name), 'utf8'));

const estate = read('estate-health.json');
const doc = buildCoverageMatrix({
  registry: JSON.parse(readFileSync(join(root, 'tools', 'mission-control', 'config', 'estate-registry.json'), 'utf8')),
  estate,
  audience: read('audience.json'),
  events: read('business-events.json'),
  diagnostics: read('diagnostics.json'),
  now: estate.generatedAt,
});
const errors = validateCoverageMatrix(doc, { estate });
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
if (args.out) writeFileSync(resolve(String(args.out)), JSON.stringify(doc, null, 2) + '\n');
console.log(args.json ? JSON.stringify(doc, null, 2) : renderCoverageMarkdown(doc));
