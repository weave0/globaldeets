import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const read = relativePath => readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), 'utf8');

const mark = read('assets/logo-mark.svg');
const navCss = read('shared/ecosystem-nav.css');
const navJs = read('shared/ecosystem-nav.js');
const manifest = JSON.parse(read('manifest.json'));

test('canonical GlobalDeets mark is a transparent square SVG with no raster or background canvas', () => {
  assert.match(mark, /<svg[^>]+viewBox="0 0 256 256"/);
  assert.match(mark, /GlobalDeets GD moon mark/);
  assert.equal(/<rect\b/i.test(mark), false);
  assert.equal(/<image\b/i.test(mark), false);
  assert.equal(/(?:fill|stop-color)="(?:#000000|#000|black)"/i.test(mark), false);
  assert.match(mark, /stroke="url\(#gd\)"/);
});

test('shared navigation uses the canonical compact square mark', () => {
  assert.ok(navCss.includes("content: url('../assets/logo-mark.svg')"));
  assert.ok(navCss.includes('width: 44px !important'));
  assert.ok(navCss.includes('height: 44px !important'));
  assert.match(navJs, /const canonicalMark = '\/assets\/logo-mark\.svg';/);
  for (const legacyName of ['logo-mark.png', 'logo-vector.png', 'logo-nav.png', 'logo-globe.png']) {
    assert.ok(navJs.includes(`'${legacyName}'`), `legacy logo migration missing ${legacyName}`);
  }
});

test('shared navigation stays compact and stacks product navigation below the ecosystem strip', () => {
  assert.ok(navCss.includes('--gfd-ecosystem-nav-height: 46px'));
  assert.ok(navCss.includes('top: var(--gfd-ecosystem-nav-height) !important'));
  assert.ok(navCss.includes('gap: 0.5rem !important'));
  assert.ok(navCss.includes('margin-top: 0 !important'));
  assert.ok(navCss.includes('width: 42px !important'));
  assert.ok(navCss.includes('width: min(720px, calc(100vw - 2rem))'));
});

test('web app manifest prefers the scalable transparent mark while retaining maskable fallbacks', () => {
  const vectorIcon = manifest.icons.find(icon => icon.src === 'assets/logo-mark.svg');
  assert.deepEqual(vectorIcon, {
    src: 'assets/logo-mark.svg',
    sizes: 'any',
    type: 'image/svg+xml',
    purpose: 'any',
  });
  assert.ok(manifest.icons.some(icon => icon.type === 'image/png' && icon.purpose === 'maskable'));
});
