import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const API =
  'https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800&family=Manrope:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap';

const wanted = (range) => range.includes('U+0400-045F') || range.startsWith('U+0000-00FF');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

const cssText = await (await fetch(API, { headers: { 'User-Agent': UA } })).text();
await mkdir(OUT, { recursive: true });

const faces = [...cssText.matchAll(/@font-face\s*\{([^}]+)\}/g)].map((m) => m[1]);
const out = [];

for (const face of faces) {
  const family = /font-family:\s*'([^']+)'/.exec(face)?.[1];
  const weight = /font-weight:\s*(\d+)/.exec(face)?.[1];
  const range = /unicode-range:\s*([^;]+)/.exec(face)?.[1]?.trim();
  const url = /url\((https:[^)]+\.woff2)\)/.exec(face)?.[1];
  if (!family || !weight || !range || !url || !wanted(range)) continue;

  const subset = range.includes('U+0400-045F') ? 'cyrillic' : 'latin';
  const name = `${slug(family)}-${weight}-${subset}.woff2`;
  const buf = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
  await writeFile(join(OUT, name), buf);
  out.push(
    `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;` +
      `src:url('/assets/fonts/${name}') format('woff2');unicode-range:${range};}`,
  );
  console.log(name, `${Math.round(buf.length / 1024)}KB`);
}

await writeFile(join(OUT, '_faces.css'), `${out.join('\n')}\n`);
console.log(`\n${out.length} faces -> assets/fonts/_faces.css`);
