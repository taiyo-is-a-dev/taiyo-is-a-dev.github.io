import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  htmlFiles,
  readHtml,
  localRefs,
  externalRefs,
  cssDeclaredVars,
  cssUsedVars,
  hexLiterals,
  ALLOWED_HOSTS,
  PALETTE,
} from './check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = () => htmlFiles(ROOT);

test('required root files exist', () => {
  for (const f of ['.nojekyll', 'CNAME', 'robots.txt']) {
    assert.ok(existsSync(join(ROOT, f)), `missing ${f}`);
  }
});

test('CNAME points at taiyo.is-a.dev', () => {
  assert.equal(readFileSync(join(ROOT, 'CNAME'), 'utf8').trim(), 'taiyo.is-a.dev');
});

test('every local reference resolves on disk', () => {
  for (const file of pages()) {
    for (const ref of localRefs(readHtml(file, ROOT))) {
      const target = ref.endsWith('/') ? join(ROOT, ref, 'index.html') : join(ROOT, ref);
      assert.ok(existsSync(target), `${file} -> ${ref} not found`);
    }
  }
});

test('no unapproved external references', () => {
  for (const file of pages()) {
    for (const url of externalRefs(readHtml(file, ROOT))) {
      const { host } = new URL(url);
      assert.ok(ALLOWED_HOSTS.includes(host), `${file} references ${host}`);
    }
  }
});

const CSS_DIR = join(ROOT, 'assets/css');
const css = (name) => readFileSync(join(CSS_DIR, name), 'utf8');
const allCss = () => readdirSync(CSS_DIR).map(css).join('\n');

test('base.css declares the full palette', () => {
  const vars = cssDeclaredVars(css('base.css'));
  for (const v of [
    '--bg', '--bg-soft', '--surface', '--border',
    '--text', '--muted', '--green', '--green-hi',
  ]) {
    assert.ok(vars.includes(v), `missing token ${v}`);
  }
});

test('no hex literal outside the approved palette', () => {
  for (const name of readdirSync(CSS_DIR)) {
    for (const hex of hexLiterals(css(name))) {
      assert.ok(PALETTE.includes(hex), `${name} uses off-palette ${hex}`);
    }
  }
});

test('every var() used is declared somewhere', () => {
  const all = allCss();
  const declared = new Set(cssDeclaredVars(all));
  for (const used of cssUsedVars(all)) {
    assert.ok(declared.has(used), `undeclared ${used}`);
  }
});

test('image assets exist and stay within budget (KB)', () => {
  const budget = {
    'avatar.png': 260,
    'tano-banner.png': 300,
    'ftl-shot.jpg': 140,
    'deck-shot.jpg': 140,
    'og.png': 220,
    'tano-logo.svg': 8,
    'favicon.svg': 8,
  };
  for (const [name, kb] of Object.entries(budget)) {
    const p = join(ROOT, 'assets/img', name);
    assert.ok(existsSync(p), `missing ${name}`);
    const got = Math.round(statSync(p).size / 1024);
    assert.ok(got <= kb, `${name} is ${got}KB, budget ${kb}KB`);
  }
});

test('no stray raw screenshots left in assets', () => {
  const stray = readdirSync(join(ROOT, 'assets/img')).filter((f) => f.includes('-raw.'));
  assert.deepEqual(stray, [], `delete ${stray.join(', ')}`);
});

test('fonts are self-hosted', () => {
  const files = readdirSync(join(ROOT, 'assets/fonts'));
  const woff2 = files.filter((f) => f.endsWith('.woff2'));
  assert.ok(woff2.length >= 6, `expected >= 6 woff2 subsets, got ${woff2.length}`);
  assert.ok(!allCss().includes('fonts.googleapis.com'), 'CSS must not hit Google Fonts');
  assert.ok(!allCss().includes('fonts.gstatic.com'), 'CSS must not hit gstatic');
});
