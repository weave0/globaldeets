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

test('shared navigation forces legacy raster logo surfaces onto the canonical square mark', () => {
  assert.match(navCss, /\.ecosystem-logo\s*\{[\s\S]*content:\s*url\('\.\.\/assets\/logo-mark\.svg'\)/);
  assert.match(navCss, /\.site-logo-mark\s*\{[\s\S]*width:\s*84px\s*!important;[\s\S]*height:\s*84px\s*!important;/);
  assert.match(navJs, /const canonicalMark = '\/assets\/logo-mark\.svg';/);
  for (const legacyName of ['logo-mark.png', 'logo-vector.png', 'logo-nav.png', 'logo-globe.png']) {
    assert.ok(navJs.includes(`'${legacyName}'`), `legacy logo migration missing ${legacyName}`);
  }
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
