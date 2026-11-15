// Makes one contact sheet per goal from the review screenshots (for looking only)
import { chromium } from 'playwright';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
const root = 'calibration/out/review/pages';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1640, height: 800 } });
for (const g of ['menu', 'signup', 'invoice', 'product']) {
  const files = readdirSync(join(root, g)).filter((f) => f.endsWith('.png')).sort((a, c) => (a === 'goal.png' ? -1 : c === 'goal.png' ? 1 : a.localeCompare(c)));
  const extra = readdirSync(join(root, 'cheats')).filter((f) => f.endsWith('.png') && f.includes(g === 'menu' ? 'camouflage' : g === 'product' ? 'cheat_picture.' : g === 'invoice' ? 'picture_text' : 'zzz'));
  const cells = [...files.map((f) => join(root, g, f)), ...extra.map((f) => join(root, 'cheats', f))].map((f) => `<div><b>${f.split(/[\/]/).pop()}</b><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"></div>`).join('');
  await p.setContent(`<style>body{margin:0;display:flex;flex-wrap:wrap;gap:8px;font:14px Arial;background:#888}div{width:400px;background:#fff}img{width:400px;display:block;border:1px solid #000}</style>${cells}`);
  await p.screenshot({ path: join(root, `sheet-${g}.png`), fullPage: true });
}
await b.close();
