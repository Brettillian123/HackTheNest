// Writes the product-detail goal and attempts into ./product/
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), 'product');
mkdirSync(dir, { recursive: true });
const out = (n, h) => writeFileSync(join(dir, n + '.html'), h);

const BAG = (w = 360, body = '#c2410c', strap = '#7c2d12') => `<svg width="${w}" height="${w}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><rect x="70" y="20" width="60" height="30" rx="14" fill="none" stroke="${strap}" stroke-width="8"/><rect x="45" y="40" width="110" height="140" rx="26" fill="${body}"/><rect x="62" y="100" width="76" height="56" rx="10" fill="${strap}" opacity=".55"/><rect x="62" y="96" width="76" height="8" rx="4" fill="#fde68a"/><circle cx="100" cy="70" r="6" fill="#fde68a"/></svg>`;
const SHOE = (w = 360) => `<svg width="${w}" height="${w}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg"><path d="M30 120 L60 70 L95 80 L120 110 L170 120 Q182 124 180 140 L30 140 Z" fill="#c2410c"/><rect x="28" y="140" width="154" height="14" rx="6" fill="#7c2d12"/><path d="M70 85 L92 92 M66 95 L90 101" stroke="#fde68a" stroke-width="5"/></svg>`;

const REVIEWS = [
  ['Daniel K.', '★★★★★', 'Took it on a 9-day trek in the Dolomites. The hip belt carried everything and the roll-top kept my gear dry through two storms.'],
  ['Sofia M.', '★★★★☆', 'Great daily bag. Laptop sleeve fits a 16-inch machine. Wish the side pockets were a little deeper for my bottle.'],
  ['Ravi P.', '★★★★★', 'Third year using it for my commute and it still looks new. The orange is brighter in person.'],
];
const RELATED = [['Ridge 18 Daypack', '$89'], ['Summit Hip Pack', '$45'], ['Trailhead Duffel 40L', '$129'], ['Stormproof Pack Cover', '$24']];

function goal(o = {}) {
  const t = Object.assign({ price: '$149.00', img: BAG(), title: 'Alder 28L Roll-Top Pack', cta: 'Add to cart', mirror: false, stock: 'In stock — ships in 1–2 business days' }, o);
  return `<!doctype html><html><head><meta charset="utf-8"><title>${t.title} — Fernpeak Outfitters</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Verdana,Geneva,sans-serif;color:#1c1917;background:#fff}
.nav{display:flex;align-items:center;justify-content:space-between;padding:0 48px;height:68px;border-bottom:1px solid #e7e5e4}
.nav .logo{font:bold 22px Georgia,serif;color:#14532d}
.nav .links a{margin:0 16px;font-size:14px;color:#44403c}
.nav .cart{font-size:14px;color:#14532d;font-weight:bold}
.crumbs{padding:18px 48px;font-size:12px;color:#78716c}
.hero{display:flex;${t.mirror ? 'flex-direction:row-reverse;' : ''}gap:56px;padding:12px 48px 48px}
.pic{width:560px;height:520px;background:#f5f5f4;border-radius:16px;display:flex;align-items:center;justify-content:center}
.buy{flex:1;padding-top:12px}
.buy h1{font:normal 34px Georgia,serif;line-height:1.2}
.rating{margin-top:10px;color:#ca8a04;font-size:16px}.rating span{color:#78716c;font-size:13px;margin-left:8px}
.price{font-size:30px;font-weight:bold;margin-top:20px;color:#14532d}
.blurb{margin-top:16px;font-size:14px;line-height:1.7;color:#44403c}
.lab{margin-top:26px;font-size:12px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;color:#57534e}
.sw{display:flex;gap:12px;margin-top:10px}.sw i{width:34px;height:34px;border-radius:50%;display:block;border:2px solid #fff;box-shadow:0 0 0 1px #d6d3d1}
.sw i.on{box-shadow:0 0 0 2px #1c1917}
.sizes{display:flex;gap:10px;margin-top:10px}.sizes b{width:64px;height:40px;border:1px solid #d6d3d1;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:normal}
.sizes b.on{border:2px solid #1c1917;font-weight:bold}
.cta{margin-top:28px;display:flex;gap:12px}
.cta .add{flex:1;height:52px;background:#14532d;color:#fff;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px;font-weight:bold}
.cta .fav{width:52px;height:52px;border:1px solid #d6d3d1;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:22px;color:#57534e}
.ship{margin-top:16px;font-size:13px;color:#15803d}
.perks{margin-top:22px;border-top:1px solid #e7e5e4;padding-top:16px;font-size:13px;color:#57534e;line-height:2}
.tabs{margin:0 48px;border-bottom:1px solid #e7e5e4;display:flex;gap:36px}
.tabs span{padding:14px 0;font-size:15px;color:#78716c}.tabs span.on{color:#1c1917;font-weight:bold;border-bottom:3px solid #14532d}
.detail{display:flex;gap:56px;padding:32px 48px}
.desc{flex:1;font-size:14px;line-height:1.8;color:#44403c}.desc p+p{margin-top:14px}
table{width:440px;border-collapse:collapse;font-size:14px}
td{padding:10px 0;border-bottom:1px solid #e7e5e4}td:first-child{color:#78716c;width:160px}
.reviews{padding:16px 48px 32px}
h2{font:normal 24px Georgia,serif;margin-bottom:18px}
.rv{display:flex;gap:24px}.rv div{flex:1;background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:20px;font-size:14px;line-height:1.6;color:#44403c}
.rv b{display:block;color:#1c1917}.rv em{display:block;font-style:normal;color:#ca8a04;margin:4px 0 8px}
.related{padding:16px 48px 56px}
.cards{display:flex;gap:24px}.cards div{flex:1}
.cards .ph{height:180px;background:#f5f5f4;border-radius:12px}
.cards p{margin-top:10px;font-size:14px}.cards strong{display:block;font-size:14px;color:#14532d;margin-top:2px}
footer{background:#14532d;color:#dcfce7;padding:28px 48px;font-size:13px;display:flex;justify-content:space-between}
</style></head><body>
<div class="nav"><span class="logo">Fernpeak Outfitters</span><span class="links"><a>Packs</a><a>Tents</a><a>Clothing</a><a>Sale</a></span><span class="cart">Cart (0)</span></div>
<div class="crumbs">Home / Packs / Daypacks / ${t.title}</div>
<div class="hero"><div class="pic">${t.img}</div>
<div class="buy"><h1>${t.title}</h1><div class="rating">★★★★★<span>4.8 · 312 reviews</span></div>
<div class="price">${t.price}</div>
<p class="blurb">A waterproof roll-top pack with a padded 16-inch laptop sleeve, quick-access side pockets and a removable hip belt. Built from recycled 420D nylon.</p>
<div class="lab">Colour: Ember</div><div class="sw"><i class="on" style="background:#c2410c"></i><i style="background:#1e3a8a"></i><i style="background:#3f6212"></i><i style="background:#292524"></i></div>
<div class="lab">Size</div><div class="sizes"><b>S/M</b><b class="on">M/L</b></div>
<div class="cta"><span class="add">${t.cta}</span><span class="fav">♡</span></div>
<p class="ship">${t.stock}</p>
<div class="perks">Free returns within 60 days<br>Lifetime repair guarantee</div></div></div>
<div class="tabs"><span class="on">Description</span><span>Specifications</span><span>Reviews (312)</span></div>
<div class="detail"><div class="desc"><p>The Alder is our everyday pack for people who don't stop at the city limits. The roll-top closure expands from 24 to 28 litres, and welded seams keep rain out.</p><p>Inside, a suspended laptop sleeve keeps your machine off the ground when you set the pack down, and a zip pocket holds keys and passport.</p></div>
<table><tr><td>Volume</td><td>24–28 litres</td></tr><tr><td>Weight</td><td>1.1 kg</td></tr><tr><td>Material</td><td>Recycled 420D nylon, TPU coated</td></tr><tr><td>Laptop sleeve</td><td>Fits up to 16 inches</td></tr><tr><td>Dimensions</td><td>52 × 30 × 17 cm</td></tr></table></div>
<div class="reviews"><h2>What customers say</h2><div class="rv">${REVIEWS.map(([n, s, x]) => `<div><b>${n}</b><em>${s}</em>${x}</div>`).join('')}</div></div>
<div class="related"><h2>You may also like</h2><div class="cards">${RELATED.map(([n, p]) => `<div><div class="ph"></div><p>${n}</p><strong>${p}</strong></div>`).join('')}</div></div>
<footer><span>© 2026 Fernpeak Outfitters</span><span>Shipping · Returns · Contact</span></footer>
</body></html>`;
}
out('goal', goal());

// EXCELLENT: grid rebuild
out('p_excellent', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:Verdana,sans-serif;color:#1c1917}
header{height:68px;border-bottom:1px solid #e7e5e4;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 48px}
header .l{font:bold 22px Georgia,serif;color:#14532d}header nav span{margin:0 16px;font-size:14px;color:#44403c}header .c{text-align:right;font-weight:bold;font-size:14px;color:#14532d}
.bc{margin:18px 48px;font-size:12px;color:#78716c}
.top{display:grid;grid-template-columns:560px 1fr;gap:56px;margin:0 48px 48px}
.img{height:520px;border-radius:16px;background:#f5f5f4;display:grid;place-items:center}
.info{padding-top:12px}
.info h1{margin:0;font:34px/1.2 Georgia,serif}
.st{margin-top:10px;color:#ca8a04}.st small{color:#78716c;font-size:13px;margin-left:8px}
.pr{margin-top:20px;font-size:30px;font-weight:bold;color:#14532d}
.tx{margin:16px 0 0;font-size:14px;line-height:1.7;color:#44403c}
.k{margin-top:26px;font-size:12px;font-weight:bold;letter-spacing:1px;color:#57534e}
.dots{margin-top:10px;display:flex;gap:12px}.dots span{width:30px;height:30px;border-radius:50%;border:2px solid #fff;outline:1px solid #d6d3d1}.dots span:first-child{outline:2px solid #1c1917}
.sz{margin-top:10px;display:flex;gap:10px}.sz span{width:62px;height:38px;border:1px solid #d6d3d1;border-radius:8px;text-align:center;line-height:38px;font-size:14px}.sz .a{border:2px solid #1c1917;font-weight:bold}
.row{margin-top:28px;display:grid;grid-template-columns:1fr 52px;gap:12px}
.add{height:52px;border-radius:10px;background:#14532d;color:#fff;font-weight:bold;text-align:center;line-height:52px}
.heart{height:50px;border:1px solid #d6d3d1;border-radius:10px;text-align:center;line-height:50px;font-size:22px;color:#57534e}
.ok{margin:16px 0 0;font-size:13px;color:#15803d}
.pk{margin-top:22px;padding-top:16px;border-top:1px solid #e7e5e4;font-size:13px;line-height:2;color:#57534e}
.tb{margin:0 48px;border-bottom:1px solid #e7e5e4}.tb span{display:inline-block;padding:14px 0;margin-right:36px;font-size:15px;color:#78716c}.tb .a{font-weight:bold;color:#1c1917;border-bottom:3px solid #14532d}
.two{display:grid;grid-template-columns:1fr 440px;gap:56px;padding:32px 48px}
.two p{margin:0 0 14px;font-size:14px;line-height:1.8;color:#44403c}
.spec div{display:grid;grid-template-columns:160px 1fr;border-bottom:1px solid #e7e5e4;padding:10px 0;font-size:14px}.spec div span:first-child{color:#78716c}
.sec{padding:16px 48px 32px}.sec h2{margin:0 0 18px;font:normal 24px Georgia,serif}
.three{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.three div{background:#fafaf9;border:1px solid #e7e5e4;border-radius:12px;padding:20px;font-size:14px;line-height:1.6;color:#44403c}
.three b{display:block;color:#1c1917}.three i{display:block;font-style:normal;color:#ca8a04;margin:4px 0 8px}
.four{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}.four .b{height:180px;border-radius:12px;background:#f5f5f4}.four p{margin:10px 0 0;font-size:14px}.four strong{font-size:14px;color:#14532d}
.ft{background:#14532d;color:#dcfce7;padding:28px 48px;font-size:13px;display:flex;justify-content:space-between;margin-top:24px}
</style></head><body>
<header><span class="l">Fernpeak Outfitters</span><nav><span>Packs</span><span>Tents</span><span>Clothing</span><span>Sale</span></nav><span class="c">Cart (0)</span></header>
<div class="bc">Home / Packs / Daypacks / Alder 28L Roll-Top Pack</div>
<div class="top"><div class="img">${BAG(350)}</div><div class="info"><h1>Alder 28L Roll-Top Pack</h1><div class="st">★★★★★<small>4.8 · 312 reviews</small></div><div class="pr">$149.00</div>
<p class="tx">A waterproof roll-top pack with a padded 16-inch laptop sleeve, quick-access side pockets and a removable hip belt. Built from recycled 420D nylon.</p>
<div class="k">COLOUR: EMBER</div><div class="dots"><span style="background:#c2410c"></span><span style="background:#1e3a8a"></span><span style="background:#3f6212"></span><span style="background:#292524"></span></div>
<div class="k">SIZE</div><div class="sz"><span>S/M</span><span class="a">M/L</span></div>
<div class="row"><div class="add">Add to cart</div><div class="heart">♡</div></div><p class="ok">In stock — ships in 1–2 business days</p>
<div class="pk">Free returns within 60 days<br>Lifetime repair guarantee</div></div></div>
<div class="tb"><span class="a">Description</span><span>Specifications</span><span>Reviews (312)</span></div>
<div class="two"><div><p>The Alder is our everyday pack for people who don't stop at the city limits. The roll-top closure expands from 24 to 28 litres, and welded seams keep rain out.</p><p>Inside, a suspended laptop sleeve keeps your machine off the ground when you set the pack down, and a zip pocket holds keys and passport.</p></div>
<div class="spec"><div><span>Volume</span><span>24–28 litres</span></div><div><span>Weight</span><span>1.1 kg</span></div><div><span>Material</span><span>Recycled 420D nylon, TPU coated</span></div><div><span>Laptop sleeve</span><span>Fits up to 16 inches</span></div><div><span>Dimensions</span><span>52 × 30 × 17 cm</span></div></div></div>
<div class="sec"><h2>What customers say</h2><div class="three">${REVIEWS.map(([n, s, x]) => `<div><b>${n}</b><i>${s}</i>${x}</div>`).join('')}</div></div>
<div class="sec"><h2>You may also like</h2><div class="four">${RELATED.map(([n, p]) => `<div><div class="b"></div><p>${n}</p><strong>${p}</strong></div>`).join('')}</div></div>
<div class="ft"><span>© 2026 Fernpeak Outfitters</span><span>Shipping · Returns · Contact</span></div>
</body></html>`);

// GOOD: slips — reviews as a vertical list, related shows 3 cards, image box square-ish, no perks
out('p_good', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:Verdana,sans-serif;color:#222}
.n{display:flex;justify-content:space-between;align-items:center;padding:20px 48px;border-bottom:1px solid #e5e5e5}
.n b{font:bold 22px Georgia,serif;color:#14532d}.n span a{margin:0 14px;font-size:14px}.n i{font-style:normal;font-weight:bold;font-size:14px;color:#14532d}
.c{padding:16px 48px;font-size:12px;color:#777}
.h{display:flex;gap:48px;padding:8px 48px 44px}
.pic{width:520px;height:520px;background:#f4f4f2;border-radius:12px;display:flex;align-items:center;justify-content:center}
.b{flex:1}.b h1{font:normal 34px Georgia,serif;margin:12px 0 8px}
.st{color:#ca8a04}.st small{color:#777;margin-left:8px}
.p{font-size:30px;font-weight:bold;color:#14532d;margin:18px 0}
.b p{font-size:14px;line-height:1.7;color:#444}
.lb{font-size:12px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;color:#555;margin:24px 0 10px}
.sw span{display:inline-block;width:32px;height:32px;border-radius:50%;margin-right:10px}
.sz span{display:inline-block;padding:10px 20px;border:1px solid #ccc;border-radius:8px;margin-right:10px;font-size:14px}.sz .on{border:2px solid #222;font-weight:bold}
.add{margin-top:28px;background:#14532d;color:#fff;text-align:center;padding:16px;border-radius:10px;font-weight:bold}
.ok{color:#15803d;font-size:13px}
.t{margin:0 48px;border-bottom:1px solid #e5e5e5}.t span{display:inline-block;padding:14px 0;margin-right:36px;color:#777}.t .on{color:#222;font-weight:bold;border-bottom:3px solid #14532d}
.d{display:flex;gap:56px;padding:30px 48px}.d .x{flex:1;font-size:14px;line-height:1.8;color:#444}
.d table{width:440px;border-collapse:collapse;font-size:14px}.d td{padding:10px 0;border-bottom:1px solid #e5e5e5}.d td:first-child{color:#777}
h2{font:normal 24px Georgia,serif;margin:0 0 16px}
.rv{padding:16px 48px}.rv div{border-bottom:1px solid #eee;padding:14px 0;font-size:14px;line-height:1.6}.rv em{color:#ca8a04;font-style:normal;margin-left:10px}
.rl{padding:24px 48px 56px;display:block}.rl .g{display:flex;gap:24px}.rl .g div{flex:1}.rl .ph{height:180px;background:#f4f4f2;border-radius:12px}.rl p{font-size:14px;margin:10px 0 2px}.rl strong{font-size:14px;color:#14532d}
footer{background:#14532d;color:#dcfce7;padding:28px 48px;font-size:13px}
</style></head><body>
<div class="n"><b>Fernpeak Outfitters</b><span><a>Packs</a><a>Tents</a><a>Clothing</a><a>Sale</a></span><i>Cart (0)</i></div>
<div class="c">Home / Packs / Daypacks / Alder 28L Roll-Top Pack</div>
<div class="h"><div class="pic">${BAG(340)}</div><div class="b"><h1>Alder 28L Roll-Top Pack</h1><div class="st">★★★★★<small>4.8 · 312 reviews</small></div><div class="p">$149.00</div>
<p>A waterproof roll-top pack with a padded 16-inch laptop sleeve, quick-access side pockets and a removable hip belt. Built from recycled 420D nylon.</p>
<div class="lb">Colour: Ember</div><div class="sw"><span style="background:#c2410c"></span><span style="background:#1e3a8a"></span><span style="background:#3f6212"></span><span style="background:#292524"></span></div>
<div class="lb">Size</div><div class="sz"><span>S/M</span><span class="on">M/L</span></div>
<div class="add">Add to cart</div><p class="ok">In stock — ships in 1–2 business days</p></div></div>
<div class="t"><span class="on">Description</span><span>Specifications</span><span>Reviews (312)</span></div>
<div class="d"><div class="x"><p>The Alder is our everyday pack for people who don't stop at the city limits. The roll-top closure expands from 24 to 28 litres, and welded seams keep rain out.</p><p>Inside, a suspended laptop sleeve keeps your machine off the ground when you set the pack down, and a zip pocket holds keys and passport.</p></div>
<table><tr><td>Volume</td><td>24–28 litres</td></tr><tr><td>Weight</td><td>1.1 kg</td></tr><tr><td>Material</td><td>Recycled 420D nylon, TPU coated</td></tr><tr><td>Laptop sleeve</td><td>Fits up to 16 inches</td></tr><tr><td>Dimensions</td><td>52 × 30 × 17 cm</td></tr></table></div>
<div class="rv"><h2>What customers say</h2>${REVIEWS.map(([n, s, x]) => `<div><b>${n}</b><em>${s}</em><br>${x}</div>`).join('')}</div>
<div class="rl"><h2>You may also like</h2><div class="g">${RELATED.slice(0, 3).map(([n, p]) => `<div><div class="ph"></div><p>${n}</p><strong>${p}</strong></div>`).join('')}</div></div>
<footer>© 2026 Fernpeak Outfitters · Shipping · Returns · Contact</footer>
</body></html>`);

// MEDIOCRE: stacked (image above details, centred), tabs gone, specs as bullet list, price wrong, rating wrong, related missing
out('p_mediocre', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:Arial,sans-serif;color:#333;background:#fafafa}
.top{background:#14532d;color:#fff;padding:18px 40px;font-size:20px;font-weight:bold}
.wrap{max-width:900px;margin:30px auto;background:#fff;padding:30px}
.img{text-align:center;background:#eee;padding:20px}
h1{font-size:30px;margin:24px 0 6px}.price{font-size:26px;color:#14532d;font-weight:bold;margin:10px 0}
.btn{display:inline-block;background:#f97316;color:#fff;padding:14px 40px;border-radius:30px;font-weight:bold;margin:14px 0}
h2{font-size:22px;margin:30px 0 10px}p,li{font-size:15px;line-height:1.6}
.rev{background:#f3f3f3;padding:12px;margin:10px 0;border-radius:6px}
</style></head><body>
<div class="top">Fernpeak Outfitters</div>
<div class="wrap"><div class="img">${BAG(260)}</div>
<h1>Alder 28L Roll-Top Pack</h1><div style="color:#ca8a04">★★★★☆ 4.6 (312 reviews)</div><div class="price">$159.00</div>
<p>A waterproof roll-top pack with a padded 16-inch laptop sleeve, quick-access side pockets and a removable hip belt. Built from recycled 420D nylon.</p>
<p>Colour: Ember · Size: M/L</p><span class="btn">Add to cart</span><p style="color:#15803d">In stock — ships in 1–2 business days</p>
<h2>Description</h2><p>The Alder is our everyday pack for people who don't stop at the city limits. The roll-top closure expands from 24 to 28 litres, and welded seams keep rain out.</p>
<h2>Specifications</h2><ul><li>Volume: 24–28 litres</li><li>Weight: 1.1 kg</li><li>Material: Recycled 420D nylon, TPU coated</li><li>Laptop sleeve: Fits up to 16 inches</li></ul>
<h2>Reviews</h2>${REVIEWS.map(([n, s, x]) => `<div class="rev"><b>${n}</b> ${s}<br>${x}</div>`).join('')}
</div></body></html>`);

// POOR: generic product card, little detail
out('p_poor', `<!doctype html><html><body style="font-family:Arial;padding:30px;background:#fff">
<h1>Backpack</h1><div style="width:200px;height:200px;background:#ddd"></div>
<p><b>Price:</b> $149</p><p>A great waterproof backpack for hiking and commuting.</p><button>Buy now</button>
<h3>Reviews</h3><p>"Great bag!" - Daniel</p></body></html>`);

// PROBE (boss minds a lot, pixels barely): picture is the wrong product (an orange shoe) and price wrong
out('p_wrong_product', goal({ img: SHOE(), price: '$194.00' }));

// PROBE: Add to cart button says "Sold out" and stock line says unavailable (boss minds; pixels barely)
out('p_sold_out', goal({ cta: 'Sold out', stock: 'Currently unavailable — check back soon' }));

// PROBE (boss shrugs-ish, pixels shout): image and details swapped sides
out('p_mirrored', goal({ mirror: true }));

// CHEAT: right boxes and colours but placeholder words everywhere
{
  const g = goal(); const i = g.indexOf('<body>');
  let n = 0; const words = 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor'.split(' ');
  out('cheat_lorem', g.slice(0, i) + g.slice(i).replace(/>([^<>]+)</g, (m, t) => t.trim() ? '>' + t.split(/\s+/).filter(Boolean).map(() => words[n++ % words.length]).join(' ') + '<' : m));
}
console.log('product written');
