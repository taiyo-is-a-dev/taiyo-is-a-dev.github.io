/**
 * Full-page screenshots over the Chrome DevTools Protocol — dev tool only,
 * never shipped. Plain `chrome --screenshot` cannot capture past the
 * viewport, and a tall window breaks any `100svh` hero.
 *
 *   node tools/shot.mjs <outDir> <width>x<height> <url> [url...]
 *
 * Pass --motion to keep animations live; the default emulates
 * `prefers-reduced-motion: reduce` so scroll-revealed content is visible
 * in a static capture (and the reduced-motion path gets exercised).
 */
import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 9333;

const argv = process.argv.slice(2);
const motion = argv.includes('--motion');
const [outDir, size, ...urls] = argv.filter((a) => a !== '--motion');
const [width, height] = size.split('x').map(Number);

const sleep = (ms) => new Promise((r) => { setTimeout(r, ms); });

const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${join(outDir, '_cdp-profile')}`,
  'about:blank',
], { stdio: 'ignore' });

async function targetWs() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* chrome not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome did not expose a debuggable page');
}

const ws = new WebSocket(await targetWs());
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

let seq = 0;
const pending = new Map();
const events = new Map();

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(msg.error.message));
    else resolve(msg.result);
  } else if (msg.method && events.has(msg.method)) {
    events.get(msg.method)();
    events.delete(msg.method);
  }
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  seq += 1;
  pending.set(seq, { resolve, reject });
  ws.send(JSON.stringify({ id: seq, method, params }));
});

const once = (method) => new Promise((r) => events.set(method, r));

await mkdir(outDir, { recursive: true });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width, height, deviceScaleFactor: 1, mobile: width < 700,
});
if (!motion) {
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  });
}

for (const url of urls) {
  const name = `${url.replace(/^https?:\/\/[^/]+\/?/, '').replace(/[^\w-]+/g, '_') || 'index'}.png`;
  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url });
  await loaded;
  // captureBeyondViewport does not trigger lazy images, so force them in and
  // wait for the whole set to settle before shooting.
  await send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `(async () => {
      document.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });
      await Promise.all([...document.images].map((i) => (i.complete
        ? null
        : new Promise((r) => { i.onload = r; i.onerror = r; }))));
    })()`,
  });
  await sleep(900);
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
  });
  await writeFile(join(outDir, name), Buffer.from(data, 'base64'));
  console.log(name);
}

ws.close();
chrome.kill();
