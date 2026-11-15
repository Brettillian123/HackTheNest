// Cheats that need the goal screenshots or goal files (run after gen-*.mjs and shots)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const shots = join(here, '..', '..', 'out', 'review', 'pages');
const png = (g) => readFileSync(join(shots, g, 'goal.png')).toString('base64');

// 1. One giant picture of the product goal page, nothing else
writeFileSync(join(here, 'product', 'cheat_picture.html'), `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}img{display:block;width:1280px}</style></head><body><img src="data:image/png;base64,${png('product')}" alt=""></body></html>`);

// 2. Picture of the invoice goal, plus every goal word laid over it in transparent text at the right places
{
  const g = readFileSync(join(here, 'invoice', 'goal.html'), 'utf8');
  writeFileSync(join(here, 'invoice', 'cheat_picture_text.html'), g.replace('</style>', `.sheet,.sheet *{color:transparent!important;background:transparent!important;border-color:transparent!important}
body{background:url(data:image/png;base64,${png('invoice')}) no-repeat 0 0!important}</style>`));
}

// 3. Menu: every goal word in the background colour (invisible), a decoy visible line on top of the page
{
  const g = readFileSync(join(here, 'menu', 'goal.html'), 'utf8');
  writeFileSync(join(here, 'menu', 'cheat_camouflage.html'), g.replace('</style>', `main *,.note,footer,footer *,nav a,.tag{color:#f7f1e3!important;border-color:#f7f1e3!important}footer{background:#f7f1e3!important}
.decoy{position:absolute;top:240px;left:0;right:0;text-align:center;font-size:22px;color:#2f4a3a}</style>`).replace('<body>', '<body><div class="decoy">Our seasonal menu is being printed. See you soon!</div>'));
}
console.log('cheats written');
