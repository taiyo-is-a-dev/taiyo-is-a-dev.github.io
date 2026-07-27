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

test('every page carries required metadata', () => {
  for (const file of pages()) {
    const html = readHtml(file, ROOT);
    assert.match(html, /<html[^>]+lang="uk"/, `${file}: lang`);
    assert.match(html, /<title>[^<]{10,}<\/title>/, `${file}: title`);
    assert.match(html, /name="description"\s+content="[^"]{40,}"/, `${file}: description`);
    assert.match(html, /property="og:image"\s+content="[^"]+"/, `${file}: og:image`);
    assert.match(html, /name="twitter:card"/, `${file}: twitter:card`);
    assert.match(html, /rel="icon"/, `${file}: favicon`);
  }
});

test('every img has non-empty alt or is decorative', () => {
  for (const file of pages()) {
    for (const tag of readHtml(file, ROOT).match(/<img\b[^>]*>/g) ?? []) {
      const decorative = tag.includes('aria-hidden="true"') && /alt=""/.test(tag);
      assert.ok(decorative || /alt="[^"]+"/.test(tag), `${file}: ${tag.slice(0, 70)}`);
    }
  }
});

test('external links open safely', () => {
  for (const file of pages()) {
    for (const tag of readHtml(file, ROOT).match(/<a\b[^>]*>/g) ?? []) {
      if (!/href="https?:\/\//.test(tag)) continue;
      assert.match(tag, /target="_blank"/, `${file}: external link needs target: ${tag.slice(0, 70)}`);
      assert.match(tag, /rel="noopener"/, `${file}: external link needs rel=noopener: ${tag.slice(0, 70)}`);
    }
  }
});

test('a JS failure cannot blank the page', () => {
  for (const file of pages()) {
    const html = readHtml(file, ROOT);
    assert.match(html, /classList\.add\('js'\)/, `${file}: missing the inline js flag`);
    assert.match(html, /__taiyoFailsafe/, `${file}: missing the reveal failsafe`);
  }
  const comp = readFileSync(join(ROOT, 'assets/css/components.css'), 'utf8');
  assert.match(comp, /\.js \[data-reveal\]\{\s*opacity:0/, 'reveal must hide only under .js');
  assert.match(comp, /\.js-stalled \[data-reveal\]/, 'missing the .js-stalled escape hatch');
  const layout = readFileSync(join(ROOT, 'assets/css/layout.css'), 'utf8');
  assert.ok(!/no-cursor-fx/.test(layout), 'cursor hiding must be opt-in, not opt-out');
  assert.match(layout, /body\.cursor-fx[\s\S]{0,80}cursor:none/, 'cursor:none must require .cursor-fx');
});

test('counters ship their final value in markup', () => {
  for (const file of pages()) {
    for (const tag of readHtml(file, ROOT).match(/<dd data-counter="\d+">\d+<\/dd>/g) ?? []) {
      const [, attr, text] = /data-counter="(\d+)">(\d+)</.exec(tag);
      assert.equal(text, attr, `${file}: ${tag} must render ${attr} without JS`);
    }
  }
});

test('sitemap lists every indexable page', () => {
  const xml = readFileSync(join(ROOT, 'sitemap.xml'), 'utf8');
  for (const path of ['/', '/tano/', '/ftl/', '/decks/']) {
    assert.ok(xml.includes(`https://taiyo.is-a.dev${path}</loc>`), `sitemap missing ${path}`);
  }
  assert.ok(!xml.includes('404'), 'sitemap must not list 404');
});

test('404 page is excluded from indexing', () => {
  assert.match(readHtml('404.html', ROOT), /name="robots"\s+content="noindex"/);
});

test('decks page keeps the Olena Kobzar consent credit', () => {
  const html = readHtml('decks/index.html', ROOT);
  assert.match(html, /Olena Kobzar/);
  assert.match(html, /за її згодою/);
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
