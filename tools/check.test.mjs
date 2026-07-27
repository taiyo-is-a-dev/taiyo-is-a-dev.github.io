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
