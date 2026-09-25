/**
 * Integration helper: drives the REAL collector (probe engine + reconciliation + audience + events + diagnostics +
 * executive) against a simulated estate and returns the published plane. Governed sources are written to a temp
 * directory so the production loading path (GOLD_SOURCE etc.) is what is exercised.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT, healthyWorld, html, makeClock, makeDeps, registry } from './mission-control-fakes.mjs';
import { runCollection } from '../../tools/mission-control/lib/collect.mjs';
import { confirmFailures, probeEstate } from '../../tools/mission-control/lib/probe.mjs';

export const GA4 = id => '<script async src="https://www.googletagmanager.com/gtag/js?id=' + id + '"></script>';
export const CF_BEACON = token => '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon=\'{"token": "' + token + '"}\'></script>';

/** The governed Traffic Intelligence origin; a `feed` handler in collect() answers for it like the production worker would. */
export const FEED_ORIGIN = 'https://traffic.goodflippindesign.com';

export const newDir = () => mkdtempSync(join(tmpdir(), 'mc-gd031-'));

/** Serves tagged HTML for a host, keeping the property's baseline title. */
export function tagHost(world, host, tags = '') {
  const site = world.sites[host];
  const title = site.title || host;
  world.sites[host] = { ...site, body: html(title, tags), title };
}

/** Writes a JSON document to a temp path and returns the path (read through deps.readFile like production). */
export function writeSource(dir, name, doc) {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(doc));
  return path;
}

export async function collect(dir, { mutate, start = '2026-10-01T12:00:00Z', runId = 'gd031-run', env = {}, secondary = null, dryRun = false, cloudflare = null, feed = null } = {}) {
  const clock = makeClock(Date.parse(start));
  const world = healthyWorld(registry(), clock);
  if (mutate) mutate(world);
  let deps = makeDeps(world);
  if (cloudflare) {
    const web = world.fetchImpl;
    deps = makeDeps(world, { fetchImpl: async (input, init) => (String(input).startsWith('https://api.cloudflare.com/') ? cloudflare(input, init) : web(input, init)) });
  }
  if (feed) {
    const inner = deps.fetchImpl;
    deps = { ...deps, fetchImpl: async (input, init) => (String(input).startsWith(FEED_ORIGIN) ? feed(input, init) : inner(input, init)) };
  }
  let secondaryDir = null;
  if (secondary) {
    secondaryDir = join(dir, 'vantages');
    mkdirSync(secondaryDir, { recursive: true });
    for (const spec of secondary) {
      const otherClock = makeClock(Date.parse(start));
      const otherWorld = healthyWorld(registry(), otherClock);
      if (spec.mutate) spec.mutate(otherWorld);
      const reg = registry();
      reg.probeContract = { ...reg.probeContract, confirmationDelayMs: 1, retryDelaysMs: [0, 1, 1] };
      const otherDeps = makeDeps(otherWorld);
      const first = await probeEstate(reg, otherDeps, { runId: 'secondary-' + spec.id, vantage: spec.id, network: spec.network || 'test network' });
      const run = await confirmFailures(reg, first, otherDeps);
      if (spec.tamper) spec.tamper(run);
      writeFileSync(join(secondaryDir, 'vantage-' + spec.id + '.json'), JSON.stringify(run));
    }
  }
  const result = await runCollection({ root: ROOT, evidenceDir: dir, secondaryDir, dryRun, deps, env, runId, confirmDelayMs: 1, skipInventory: !cloudflare });
  return { ...result, world };
}
