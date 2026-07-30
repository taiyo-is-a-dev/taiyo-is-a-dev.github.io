import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/** Hosts the site is allowed to point at. Anything else is a bug. */
export const ALLOWED_HOSTS = [
  'discord.com',
  't.me',
  'tano.pp.ua',
  'taiyo.is-a.dev',
  'spbt.pp.ua',
  /* [redacted] is deliberately absent. The school site is not launched, so no
     page may link to it yet — dropping the host from this list turns that
     decision into something the test suite enforces instead of something a
     future edit can quietly undo. Add it back on launch day. */
  'www.w3.org',
];

/** The closed palette from the design spec, plus the TANO banner exception. */
export const PALETTE = [
  '#050807',
  '#07110C',
  '#E8F2EC',
  '#8FA398',
  '#57C75C',
  '#6EE787',
];

/* Не сторінки сайту: службові теки й чернетки. `.superpowers` — макети
   візуального компаньйона з брейнштормів; вони gitignored і живуть за
   власними правилами, тому під перевірки сайту потрапляти не мають. */
const SKIP = new Set(['.git', 'node_modules', 'docs', 'tools', 'scratch', '.superpowers']);

export function htmlFiles(root, dir = root, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) htmlFiles(root, full, out);
    else if (name.endsWith('.html')) out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

export function readHtml(file, root) {
  return readFileSync(join(root, file), 'utf8');
}

const REF = /(?:href|src|content)\s*=\s*"([^"]+)"/g;

function refs(html) {
  return [...html.matchAll(REF)].map((m) => m[1]);
}

/** Root-absolute site paths, with hash and query stripped. */
export function localRefs(html) {
  return refs(html)
    .filter((r) => r.startsWith('/') && !r.startsWith('//'))
    .map((r) => r.split('#')[0].split('?')[0])
    .filter(Boolean);
}

export function externalRefs(html) {
  return refs(html).filter((r) => /^https?:\/\//i.test(r));
}

export function cssDeclaredVars(css) {
  return [...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]);
}

export function cssUsedVars(css) {
  return [...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
}

export function hexLiterals(css) {
  return [...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toUpperCase());
}
