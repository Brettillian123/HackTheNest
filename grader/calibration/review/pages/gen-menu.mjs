// Writes the restaurant-menu goal and its attempts into ./menu/
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), 'menu');
mkdirSync(dir, { recursive: true });
const out = (n, h) => writeFileSync(join(dir, n + '.html'), h);

const MENU = [
  ['Antipasti', [
    ['Burrata con pesche', 'Burrata, grilled peaches, basil oil, toasted hazelnuts', '16'],
    ['Carpaccio di manzo', 'Thin-sliced beef, rocket, aged parmesan, lemon', '18'],
    ['Arancini al tartufo', 'Three crisp risotto balls, black truffle, fontina', '14'],
    ['Zuppa di ceci', 'Chickpea soup, rosemary, olive oil crouton', '11'],
  ]],
  ['Primi', [
    ['Tagliatelle al ragù', 'Hand-cut egg pasta, slow-cooked beef and pork ragù', '24'],
    ['Cacio e pepe', 'Tonnarelli, pecorino romano, cracked black pepper', '21'],
    ['Risotto ai funghi', 'Carnaroli rice, wild mushrooms, thyme, mascarpone', '26'],
    ['Ravioli di zucca', 'Roasted squash ravioli, brown butter, sage, amaretti', '23'],
  ]],
  ['Secondi', [
    ['Branzino al forno', 'Whole roasted sea bass, fennel, capers, salsa verde', '34'],
    ['Pollo alla diavola', 'Spatchcocked chicken, chili, garlic, charred lemon', '29'],
    ['Bistecca alla fiorentina', '900 g T-bone for two, rosemary potatoes', '92'],
    ['Melanzane alla parmigiana', 'Layered aubergine, tomato, basil, mozzarella', '25'],
  ]],
  ['Dolci', [
    ['Tiramisù', 'Espresso-soaked savoiardi, mascarpone, cocoa', '12'],
    ['Panna cotta', 'Vanilla cream, blood orange, pistachio crumble', '11'],
    ['Affogato', 'Fior di latte gelato drowned in espresso', '9'],
  ]],
];
const clone = () => JSON.parse(JSON.stringify(MENU));

// ---------------- GOAL ----------------
function goal(menu = MENU, opts = {}) {
  const sections = menu.map(([title, items]) => `
  <section class="course">
    <h2>${title}</h2>
    ${items.map(([n, d, p]) => `<div class="dish"><div class="row"><span class="name">${n}</span><span class="dots"></span><span class="price">${p}</span></div><p class="desc">${d}</p></div>`).join('\n    ')}
  </section>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Osteria Lume — Menu</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#f7f1e3;color:#2b2b25;font-family:Georgia,serif}
header{text-align:center;padding:${opts.headPad || 56}px 24px 32px;border-bottom:1px solid #d8ccb0}
.logo{font-size:52px;color:#2f4a3a;letter-spacing:1px}
.tag{margin-top:8px;font-style:italic;color:#7a6f58;font-size:17px}
nav{margin-top:22px}
nav a{color:#2f4a3a;text-decoration:none;font-family:Arial,sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;margin:0 16px}
nav a.on{border-bottom:2px solid #b5562e;padding-bottom:4px}
main{max-width:760px;margin:0 auto;padding:24px 24px 48px}
.course{margin-top:36px}
.course h2{font-family:Arial,sans-serif;font-size:14px;letter-spacing:4px;text-transform:uppercase;color:#b5562e;text-align:center;margin-bottom:18px;display:flex;align-items:center;gap:16px}
.course h2:before,.course h2:after{content:"";flex:1;border-top:1px solid #d8ccb0}
.dish{margin-bottom:18px}
.row{display:flex;align-items:baseline;gap:8px}
.name{font-size:20px;color:#2b2b25}
.dots{flex:1;border-bottom:2px dotted #c7b994;transform:translateY(-5px)}
.price{font-size:19px;color:#2f4a3a;font-weight:bold}
.desc{font-size:15px;font-style:italic;color:#7a6f58;margin-top:3px}
.note{max-width:760px;margin:0 auto 40px;padding:0 24px;text-align:center;font-size:14px;color:#7a6f58}
footer{background:#2f4a3a;color:#efe7d2;padding:36px 24px;display:flex;justify-content:center;gap:96px;font-family:Arial,sans-serif;font-size:14px;line-height:1.7}
footer h3{font-family:Georgia,serif;font-weight:normal;font-size:18px;color:#fff;margin-bottom:6px}
</style></head><body>
<header><div class="logo">Osteria Lume</div><p class="tag">Cucina di stagione · Est. 2011</p>
<nav><a class="on">Menu</a><a>Wine</a><a>Reservations</a><a>Visit</a></nav></header>
<main>${sections}
</main>
<p class="note">${opts.note || 'A 20% service charge applies to parties of eight or more. Please tell your server about any allergies.'}</p>
<footer><div><h3>Find us</h3>214 Harbour Street<br>Portland, ME 04101</div><div><h3>Hours</h3>Tuesday – Sunday<br>5:00 pm – 11:00 pm</div><div><h3>Book</h3>(207) 555-0148<br>hello@osterialume.com</div></footer>
</body></html>`;
}
out('goal', goal());

// ---------------- EXCELLENT: grid rebuild, tiny spacing drift ----------------
out('m_excellent', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#f8f2e4;font-family:Georgia,'Times New Roman',serif;color:#2a2a24}
.top{text-align:center;padding:54px 20px 30px;border-bottom:1px solid #d6caae}
.top h1{margin:0;font-weight:normal;font-size:52px;color:#2f4a3a;letter-spacing:1px}
.top .sub{margin:8px 0 0;font-style:italic;font-size:17px;color:#7b7059}
.links{margin-top:22px;font-family:Arial,sans-serif;font-size:13px;letter-spacing:2px}
.links span{margin:0 15px;color:#2f4a3a;text-transform:uppercase}
.links .cur{border-bottom:2px solid #b5562e;padding-bottom:4px}
.wrap{width:712px;margin:0 auto;padding:26px 0 46px}
.sec{margin-top:36px}
.sec-t{display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center;font-family:Arial,sans-serif;font-size:14px;letter-spacing:4px;color:#b5562e;text-transform:uppercase;margin:0 0 18px}
.sec-t i{border-top:1px solid #d6caae}
.item{display:grid;grid-template-columns:auto 1fr auto;column-gap:8px;align-items:baseline;margin-bottom:18px}
.item b{font-weight:normal;font-size:20px}
.item u{border-bottom:2px dotted #c6b893;text-decoration:none;position:relative;top:-5px}
.item strong{font-size:19px;color:#2f4a3a}
.item em{grid-column:1/4;font-size:15px;color:#7b7059;margin-top:3px}
.small{text-align:center;font-size:14px;color:#7b7059;margin:0 auto 40px;width:712px}
.foot{background:#2f4a3a;color:#eee6d1;display:flex;justify-content:center;gap:96px;padding:36px 20px;font:14px/1.7 Arial,sans-serif}
.foot h4{margin:0 0 6px;font:18px Georgia,serif;color:#fff}
</style></head><body>
<div class="top"><h1>Osteria Lume</h1><p class="sub">Cucina di stagione · Est. 2011</p>
<div class="links"><span class="cur">Menu</span><span>Wine</span><span>Reservations</span><span>Visit</span></div></div>
<div class="wrap">
${MENU.map(([t, items]) => `<div class="sec"><div class="sec-t"><i></i>${t}<i></i></div>
${items.map(([n, d, p]) => `<div class="item"><b>${n}</b><u></u><strong>${p}</strong><em>${d}</em></div>`).join('\n')}</div>`).join('\n')}
</div>
<p class="small">A 20% service charge applies to parties of eight or more. Please tell your server about any allergies.</p>
<div class="foot"><div><h4>Find us</h4>214 Harbour Street<br>Portland, ME 04101</div><div><h4>Hours</h4>Tuesday – Sunday<br>5:00 pm – 11:00 pm</div><div><h4>Book</h4>(207) 555-0148<br>hello@osterialume.com</div></div>
</body></html>`);

// ---------------- GOOD: honest slips (prices with $, no dotted leaders, one desc changed, footer one column narrower gap) ----------------
{
  const m = clone();
  m[1][1][3][1] = 'Roasted pumpkin ravioli, sage butter, amaretti';
  out('m_good', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#f6efdf;font-family:Georgia,serif;color:#2d2d27}
header{text-align:center;padding:48px 20px 28px;border-bottom:1px solid #d8ccb0}
header h1{margin:0;font-size:48px;font-weight:normal;color:#2f4a3a}
header p{margin:10px 0 0;font-style:italic;color:#7a6f58;font-size:16px}
nav{margin-top:20px}nav a{font:13px Arial,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#2f4a3a;margin:0 14px;text-decoration:none}
nav a:first-child{border-bottom:2px solid #b5562e;padding-bottom:4px}
.menu{max-width:720px;margin:0 auto;padding:20px 20px 44px}
h2{text-align:center;font:bold 14px Arial,sans-serif;letter-spacing:4px;text-transform:uppercase;color:#b5562e;margin:38px 0 18px}
.d{margin-bottom:18px}.d .l{display:flex;justify-content:space-between}
.d .n{font-size:20px}.d .p{font-size:19px;color:#2f4a3a;font-weight:bold}
.d .x{font-size:15px;color:#7a6f58;font-style:italic;margin-top:3px}
.fine{text-align:center;color:#7a6f58;font-size:14px;margin:0 20px 40px}
footer{background:#2f4a3a;color:#efe7d2;padding:34px 20px;display:flex;justify-content:center;gap:72px;font:14px/1.7 Arial,sans-serif}
footer b{display:block;font:18px Georgia,serif;color:#fff;margin-bottom:6px}
</style></head><body>
<header><h1>Osteria Lume</h1><p>Cucina di stagione · Est. 2011</p><nav><a>Menu</a><a>Wine</a><a>Reservations</a><a>Visit</a></nav></header>
<div class="menu">${m.map(([t, it]) => `<h2>${t}</h2>${it.map(([n, d, p]) => `<div class="d"><div class="l"><span class="n">${n}</span><span class="p">$${p}</span></div><div class="x">${d}</div></div>`).join('')}`).join('')}</div>
<p class="fine">A 20% service charge applies to parties of eight or more. Please tell your server about any allergies.</p>
<footer><div><b>Find us</b>214 Harbour Street<br>Portland, ME 04101</div><div><b>Hours</b>Tuesday – Sunday<br>5:00 pm – 11:00 pm</div><div><b>Book</b>(207) 555-0148<br>hello@osterialume.com</div></footer>
</body></html>`);
}

// ---------------- MEDIOCRE: right sections, Arial, two-column dishes, two wrong prices, one dish missing, no footer styling ----------------
{
  const m = clone();
  m[0][1][1][2] = '21'; m[2][1][2][2] = '82';
  m[3][1].splice(2, 1); // Affogato missing
  out('m_mediocre', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#fffaf0;font-family:Arial,sans-serif;color:#333}
.hero{background:#3d5a48;color:#fff;text-align:center;padding:40px 10px}
.hero h1{margin:0;font-size:40px}.hero p{margin:6px 0 14px;font-size:15px}
.hero a{color:#fff;margin:0 10px;font-size:15px}
.c{max-width:1000px;margin:0 auto;padding:10px 30px}
h2{font-size:26px;color:#c0602f;border-bottom:2px solid #c0602f;padding-bottom:6px;margin:30px 0 14px}
.g{display:grid;grid-template-columns:1fr 1fr;gap:16px 40px}
.it h3{margin:0;font-size:17px;display:flex;justify-content:space-between}
.it p{margin:4px 0 0;font-size:14px;color:#777}
.f{text-align:center;padding:30px;font-size:14px;color:#555;border-top:1px solid #ddd;margin-top:30px}
</style></head><body>
<div class="hero"><h1>Osteria Lume</h1><p>Cucina di stagione · Est. 2011</p><a>Menu</a><a>Wine</a><a>Reservations</a><a>Visit</a></div>
<div class="c">${m.map(([t, it]) => `<h2>${t}</h2><div class="g">${it.map(([n, d, p]) => `<div class="it"><h3><span>${n}</span><span>$${p}</span></h3><p>${d}</p></div>`).join('')}</div>`).join('')}
<p style="font-size:13px;color:#888;margin-top:30px">A 20% service charge applies to parties of eight or more.</p></div>
<div class="f">214 Harbour Street, Portland, ME 04101 · Tuesday – Sunday 5:00 pm – 11:00 pm · (207) 555-0148</div>
</body></html>`);
}

// ---------------- POOR: generic default page ----------------
out('m_poor', `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:'Times New Roman';margin:20px">
<h1>Osteria Lume Menu</h1><p>Welcome to our restaurant! Here is our menu.</p>
${MENU.map(([t, it]) => `<h2>${t}</h2><ul>${it.map(([n, d, p], i) => `<li><b>${n}</b>${i % 2 ? '' : ' - $' + p}<br>${d}</li>`).join('')}</ul>`).join('')}
<p>Call us at (207) 555-0148. 214 Harbour Street, Portland.</p></body></html>`);

// ---------------- PROBE: looks identical, six prices wrong (boss minds a lot) ----------------
{
  const m = clone();
  m[0][1][0][2] = '19'; m[1][1][2][2] = '29'; m[1][1][3][2] = '32'; m[2][1][0][2] = '43'; m[2][1][2][2] = '29'; m[3][1][0][2] = '21';
  out('m_prices_wrong', goal(m));
}

// ---------------- PROBE: everything right, header 70px taller so every block sits lower (boss shrugs) ----------------
out('m_shifted', goal(MENU, { headPad: 126 }));

// ---------------- PROBE: courses out of order (Dolci first, Antipasti last) — boss minds ----------------
out('m_course_order', goal([MENU[3], MENU[2], MENU[1], MENU[0]]));

// ---------------- CHEAT: right look, all words present but shuffled within every line ----------------
{
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const sh = (s) => s.split(' ').map((w) => [rnd(), w]).sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(' ');
  // shuffle names, descriptions and prices across dishes too
  const all = MENU.flatMap(([, it]) => it);
  const names = all.map((x) => x[0]).sort(() => rnd() - 0.5), prices = all.map((x) => x[2]).sort(() => rnd() - 0.5);
  let k = 0;
  const m = MENU.map(([t, it]) => [t, it.map(([, d]) => { const r = [sh(names[k]), sh(d), prices[k]]; k++; return r; })]);
  out('cheat_shuffled', goal(m));
}

// ---------------- CHEAT: decoy — a short generic page visible, the goal text in background colour behind ----------------
out('cheat_hidden_text', goal().replace('<body>', '<body><div style="position:absolute;top:0;left:0;right:0;background:#f7f1e3;z-index:5;height:1800px;padding:60px;font-size:30px;text-align:center;color:#2f4a3a">Osteria Lume<br><span style="font-size:16px">Menu coming soon</span></div>'));
console.log('menu written');
