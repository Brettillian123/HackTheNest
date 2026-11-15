// Consistency probes (graded, not banded). Writes ./probes/*.html and ./probes/manifest.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, 'probes'); mkdirSync(dir, { recursive: true });
const read = (p) => readFileSync(join(here, p), 'utf8');
const man = [];
const put = (group, goalName, name, html, label) => { writeFileSync(join(dir, name + '.html'), html); man.push({ group, goal: 'probes/' + goalName + '.html', attempt: 'probes/' + name + '.html', label }); };
const goalPut = (name, html) => writeFileSync(join(dir, name + '.html'), html);

// ---- menu at three lengths ----
const menu = read('menu/goal.html');
const parts = menu.split('<section class="course">');
const head = parts[0], secs = parts.slice(1).map((s) => '<section class="course">' + s.replace(/\n<\/main>[\s\S]*$/, ''));
const tail = menu.slice(menu.indexOf('\n</main>'));
const shortMenu = head + secs.slice(0, 2).join('') + tail;
const rename = (s, k) => s.replace(/<h2>(\w+)<\/h2>/, (m, t) => `<h2>${t} ${['II', 'III'][k]}</h2>`).replace(/<span class="name">([^<]+)<\/span>/g, (m, n) => `<span class="name">${n} ${['della casa', 'speciale'][k]}</span>`);
const longMenu = head + secs.join('') + secs.map((s) => rename(s, 0)).join('') + tail; // 8 courses
goalPut('menu_short_goal', shortMenu); goalPut('menu_full_goal', menu); goalPut('menu_long_goal', longMenu);
// one wrong price on the same dish (Carpaccio 18 -> 81) at each length
const carp = (h) => h.replace('<span class="name">Carpaccio di manzo</span><span class="dots"></span><span class="price">18</span>', '<span class="name">Carpaccio di manzo</span><span class="dots"></span><span class="price">81</span>');
put('length:one wrong price', 'menu_short_goal', 'menu_short_price', carp(shortMenu), 'short menu (2 courses)');
put('length:one wrong price', 'menu_full_goal', 'menu_full_price', carp(menu), 'full menu (4 courses)');
put('length:one wrong price', 'menu_long_goal', 'menu_long_price', carp(longMenu), 'long menu (8 courses)');
// one missing dish (Cacio e pepe) at each length
const noCacio = (h) => h.replace(/<div class="dish"><div class="row"><span class="name">Cacio e pepe<\/span>.*?<\/p><\/div>/, '');
put('length:one missing dish', 'menu_short_goal', 'menu_short_nodish', noCacio(shortMenu), 'short menu');
put('length:one missing dish', 'menu_full_goal', 'menu_full_nodish', noCacio(menu), 'full menu');
put('length:one missing dish', 'menu_long_goal', 'menu_long_nodish', noCacio(longMenu), 'long menu');

// ---- product short vs long: missing Add to cart button ----
const prod = read('product/goal.html');
const shortProd = prod.replace(/<div class="reviews">[\s\S]*?<footer>/, '<footer>');
goalPut('product_short_goal', shortProd); goalPut('product_full_goal', prod);
const noCart = (h) => h.replace(/<span class="add">[^<]*<\/span>/, '');
put('length:missing Add to cart', 'product_short_goal', 'product_short_nocart', noCart(shortProd), 'short product page');
put('length:missing Add to cart', 'product_full_goal', 'product_full_nocart', noCart(prod), 'full product page');

// ---- 1, 2, 4, 8 of the same small fault (full menu) ----
const priceRe = /<span class="price">(\d+)<\/span>/g;
const wrongPrices = (n) => { let k = 0; return menu.replace(priceRe, (m, p) => (k++ % 2 === 0 && k <= 2 * n ? `<span class="price">${Number(p) + 3}</span>` : m)); };
for (const n of [1, 2, 4, 8]) put('count:wrong prices', 'menu_full_goal', `menu_prices_${n}`, wrongPrices(n), `${n} wrong price(s)`);
const nameRe = /<span class="name">([^<]+)<\/span>/g;
const typos = (n) => { let k = 0; return menu.replace(nameRe, (m, t) => (k++ % 2 === 0 && k <= 2 * n ? `<span class="name">${t[0] + t.slice(2)}</span>` : m)); };
for (const n of [1, 2, 4, 8]) put('count:name typos', 'menu_full_goal', `menu_typos_${n}`, typos(n), `${n} typo(s) in dish names`);
// 1,2,4,8 small visual faults: dishes whose name is set in Arial instead of Georgia
const fontSlip = (n) => { let k = 0; return menu.replace(/<span class="name">/g, (m) => (k++ % 2 === 0 && k <= 2 * n ? '<span class="name" style="font-family:Arial">' : m)); };
for (const n of [1, 2, 4, 8]) put('count:font slips', 'menu_full_goal', `menu_font_${n}`, fontSlip(n), `${n} dish name(s) in Arial`);

// ---- strictly worse chains ----
const a1 = carp(menu);
const a2 = noCacio(a1);
const a3 = a2.replace(/<footer>[\s\S]*?<\/footer>/, '');
put('chain:menu', 'menu_full_goal', 'chain_menu_1', a1, '1 wrong price');
put('chain:menu', 'menu_full_goal', 'chain_menu_2', a2, '+ missing dish');
put('chain:menu', 'menu_full_goal', 'chain_menu_3', a3, '+ footer gone');
const inv = read('invoice/goal.html'); goalPut('invoice_goal', inv);
const roomy = read('invoice/i_roomy.html');
put('chain:invoice', 'invoice_goal', 'chain_inv_1', roomy, 'roomy rows');
put('chain:invoice', 'invoice_goal', 'chain_inv_2', roomy.replace('<span>$3,591.00</span></div></div>', '<span>$3,951.00</span></div></div>'), '+ total due wrong');
put('chain:invoice', 'invoice_goal', 'chain_inv_3', roomy.replace('<span>$3,591.00</span></div></div>', '<span>$3,951.00</span></div></div>').replace(/<tr><td>Courier delivery[\s\S]*?<\/tr>/, ''), '+ one line item gone');
const mir = read('product/p_mirrored.html');
put('chain:product', 'product_full_goal', 'chain_prod_1', mir, 'mirrored');
put('chain:product', 'product_full_goal', 'chain_prod_2', mir.replace('<div class="price">$149.00</div>', '<div class="price">$194.00</div>'), '+ price wrong');
put('chain:product', 'product_full_goal', 'chain_prod_3', mir.replace('<div class="price">$149.00</div>', '<div class="price">$194.00</div>').replace(/<div class="related">[\s\S]*?<footer>/, '<footer>'), '+ related products gone');
const sg = read('signup/goal.html'); goalPut('signup_goal', sg);
const good = read('signup/s_good.html');
put('chain:signup', 'signup_goal', 'chain_sig_1', good, 's_good');
put('chain:signup', 'signup_goal', 'chain_sig_2', good.replace('<label>Password</label><input type="password" value="password12">', ''), '+ password field gone');
put('chain:signup', 'signup_goal', 'chain_sig_3', good.replace('<label>Password</label><input type="password" value="password12">', '').replace('<button class="g">Continue with Google</button>', ''), '+ Google button gone');

writeFileSync(join(dir, 'manifest.json'), JSON.stringify(man, null, 1));
console.log('probes', man.length);
