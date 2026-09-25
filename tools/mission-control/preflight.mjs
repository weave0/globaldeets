#!/usr/bin/env node
/** CLI: credential preflight. Exit 3 when a required capability is missing; prints the exact permission to add. */
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatPreflight, runPreflight } from './lib/authority.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const manifest = JSON.parse(readFileSync(resolve(root, 'tools/mission-control/config/authority-manifest.json'), 'utf8'));

const report = await runPreflight({ manifest, env: process.env, fetchImpl: fetch });
console.log(formatPreflight(report));
for (const item of report.failures) console.log('::error title=Mission Control credential ' + item.id + '::' + (item.detail || item.status) + ' — ' + item.remedy);

if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = report.results.map(item => '| ' + item.id + ' | ' + (item.required ? 'yes' : 'no') + ' | ' + item.status + ' | ' + (item.remedy || item.detail || '').replace(/\|/g, '\\|') + ' |');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, ['## Mission Control credential preflight', '', '| Capability | Required | Status | Detail / fix |', '|---|---|---|---|', ...rows, ''].join('\n'));
}
if (!report.healthy) process.exitCode = 3;
