// Writes the invoice goal (mostly data) and attempts into ./invoice/
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), 'invoice');
mkdirSync(dir, { recursive: true });
const out = (n, h) => writeFileSync(join(dir, n + '.html'), h);

const LINES = [
  ['Business cards, 16pt matte, double-sided', 'BC-216', '2,000', '$0.09', '$180.00'],
  ['Tri-fold brochure, A4, 150gsm gloss', 'BR-310', '1,500', '$0.62', '$930.00'],
  ['Pull-up banner, 850 × 2000 mm, with stand', 'PB-085', '4', '$145.00', '$580.00'],
  ['Letterhead, 120gsm uncoated', 'LH-120', '2,500', '$0.11', '$275.00'],
  ['Presentation folder with pocket', 'PF-400', '600', '$1.35', '$810.00'],
  ['Vinyl window decal, custom cut', 'VD-022', '6', '$68.00', '$408.00'],
  ['Design proof revisions (hours)', 'SV-001', '5', '$75.00', '$375.00'],
  ['Courier delivery, next day', 'SH-NXT', '1', '$42.00', '$42.00'],
];
const TOT = { sub: '$3,600.00', disc: '−$180.00', tax: '$171.00', total: '$3,591.00' };
const clone = () => JSON.parse(JSON.stringify(LINES));

function goal(lines = LINES, o = {}) {
  const t = Object.assign({}, TOT, o);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Invoice INV-2026-0418</title><style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#eef0f3;font-family:Arial,Helvetica,sans-serif;color:#1f2933;padding:40px 0}
.sheet{width:880px;margin:0 auto;background:#fff;padding:56px 64px;border-top:6px solid #0f766e}
.top{display:flex;justify-content:space-between;align-items:flex-start}
.co{display:flex;gap:14px;align-items:center}
.logo{width:48px;height:48px;border-radius:50%;background:#0f766e;color:#fff;font:bold 20px Georgia,serif;display:flex;align-items:center;justify-content:center}
.co b{display:block;font-size:20px}.co span{font-size:13px;color:#52606d}
.inv{text-align:right}
.inv h1{font-size:34px;letter-spacing:6px;color:#0f766e;font-weight:normal}
.inv p{font-size:13px;color:#52606d;margin-top:4px}
.meta{display:flex;justify-content:space-between;margin-top:44px;font-size:14px;line-height:1.6}
.meta h3{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7b8794;margin-bottom:6px}
.meta .dates td{padding:2px 0 2px 24px}.meta .dates td:first-child{color:#7b8794;padding-left:0}
.status{display:inline-block;background:#fef3c7;color:#92400e;font-size:12px;font-weight:bold;padding:4px 10px;border-radius:12px;margin-top:8px}
table.items{width:100%;border-collapse:collapse;margin-top:40px;font-size:14px}
.items th{text-align:left;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#52606d;background:#f5f7fa;padding:10px 12px;border-bottom:2px solid #cbd2d9}
.items td{padding:12px;border-bottom:1px solid #e4e7eb}
.items .n{text-align:right}
.items td.code{color:#7b8794;font-family:'Courier New',monospace;font-size:13px}
.totals{width:320px;margin-left:auto;margin-top:20px;font-size:14px}
.totals div{display:flex;justify-content:space-between;padding:7px 12px}
.totals .grand{border-top:2px solid #1f2933;margin-top:6px;padding-top:12px;font-size:20px;font-weight:bold;color:#0f766e}
.notes{display:flex;gap:48px;margin-top:48px;font-size:13px;line-height:1.6;color:#52606d}
.notes h3{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#7b8794;margin-bottom:6px}
.thanks{margin-top:44px;padding-top:20px;border-top:1px solid #e4e7eb;text-align:center;font-size:13px;color:#7b8794}
</style></head><body><div class="sheet">
<div class="top"><div class="co"><div class="logo">N</div><div><b>Northwind Print Co.</b><span>88 Mill Lane, Leeds LS1 4BX · VAT GB 284 1193 56</span></div></div>
<div class="inv"><h1>INVOICE</h1><p>No. INV-2026-0418</p></div></div>
<div class="meta">
<div><h3>Bill to</h3><b>Harbourlight Events Ltd</b><br>Attn: Marcus Ode<br>12 Quayside Walk<br>Newcastle NE1 3DX</div>
<div><h3>Ship to</h3>Harbourlight Events Ltd<br>Unit 4, Baltic Works<br>Gateshead NE8 2BA</div>
<div><table class="dates"><tr><td>Issued</td><td>3 November 2026</td></tr><tr><td>Due</td><td>3 December 2026</td></tr><tr><td>PO number</td><td>HL-7731</td></tr></table><span class="status">Awaiting payment</span></div>
</div>
<table class="items"><thead><tr><th>Description</th><th>Code</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">Amount</th></tr></thead><tbody>
${lines.map(([d, c, q, u, a]) => `<tr><td>${d}</td><td class="code">${c}</td><td class="n">${q}</td><td class="n">${u}</td><td class="n">${a}</td></tr>`).join('\n')}
</tbody></table>
<div class="totals"><div><span>Subtotal</span><span>${t.sub}</span></div><div><span>Loyalty discount (5%)</span><span>${t.disc}</span></div><div><span>VAT (5%)</span><span>${t.tax}</span></div><div class="grand"><span>Total due</span><span>${t.total}</span></div></div>
<div class="notes"><div><h3>Payment</h3>Bank transfer to Northwind Print Co.<br>Sort code 40-12-76 · Account 31926819<br>Reference: INV-2026-0418</div><div><h3>Terms</h3>Payment due within 30 days. A late fee of 2% per month applies to overdue balances.</div></div>
<p class="thanks">Thank you for your business — questions? accounts@northwindprint.co.uk · 0113 496 0021</p>
</div></body></html>`;
}
out('goal', goal());

// EXCELLENT: divs + grid rebuild of table
out('i_excellent', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#edf0f3;padding:40px 0;font-family:Arial,sans-serif;color:#1f2933}
.page{width:752px;margin:0 auto;background:#fff;padding:56px 64px;border-top:6px solid #0f766e}
.hd{display:flex;justify-content:space-between}
.brand{display:flex;align-items:center;gap:14px}
.dot{width:48px;height:48px;border-radius:24px;background:#0f766e;color:#fff;text-align:center;line-height:48px;font:bold 20px/48px Georgia,serif}
.brand strong{display:block;font-size:20px}.brand small{font-size:13px;color:#52606d}
.ttl{text-align:right}.ttl div{font-size:34px;letter-spacing:6px;color:#0f766e}.ttl small{display:block;font-size:13px;color:#52606d;margin-top:4px}
.three{display:grid;grid-template-columns:1fr 1fr auto;margin-top:44px;font-size:14px;line-height:1.6}
.cap{font-size:11px;letter-spacing:2px;color:#7b8794;margin-bottom:6px;text-transform:uppercase}
.kv{display:grid;grid-template-columns:auto auto;column-gap:24px}.kv span:nth-child(odd){color:#7b8794}
.pill{display:inline-block;margin-top:8px;padding:4px 10px;border-radius:12px;background:#fef3c7;color:#92400e;font-weight:bold;font-size:12px}
.grid{margin-top:40px;font-size:14px}
.r{display:grid;grid-template-columns:1fr 80px 70px 90px 100px;border-bottom:1px solid #e4e7eb}
.r>div{padding:12px}.r>div:nth-child(n+3){text-align:right}
.r.h{background:#f5f7fa;border-bottom:2px solid #cbd2d9;font-size:11px;letter-spacing:1px;color:#52606d;font-weight:bold;text-transform:uppercase}.r.h>div{padding:10px 12px}
.c2{color:#7b8794;font-family:'Courier New',monospace;font-size:13px}
.sum{width:320px;margin:20px 0 0 auto;font-size:14px}
.sum p{margin:0;display:flex;justify-content:space-between;padding:7px 12px}
.sum .big{border-top:2px solid #1f2933;margin-top:6px;padding-top:12px;font-size:20px;font-weight:bold;color:#0f766e}
.foot2{display:flex;gap:48px;margin-top:48px;font-size:13px;line-height:1.6;color:#52606d}
.end{margin:44px 0 0;padding-top:20px;border-top:1px solid #e4e7eb;text-align:center;font-size:13px;color:#7b8794}
</style></head><body><div class="page">
<div class="hd"><div class="brand"><div class="dot">N</div><div><strong>Northwind Print Co.</strong><small>88 Mill Lane, Leeds LS1 4BX · VAT GB 284 1193 56</small></div></div><div class="ttl"><div>INVOICE</div><small>No. INV-2026-0418</small></div></div>
<div class="three"><div><div class="cap">Bill to</div><b>Harbourlight Events Ltd</b><br>Attn: Marcus Ode<br>12 Quayside Walk<br>Newcastle NE1 3DX</div>
<div><div class="cap">Ship to</div>Harbourlight Events Ltd<br>Unit 4, Baltic Works<br>Gateshead NE8 2BA</div>
<div><div class="kv"><span>Issued</span><span>3 November 2026</span><span>Due</span><span>3 December 2026</span><span>PO number</span><span>HL-7731</span></div><span class="pill">Awaiting payment</span></div></div>
<div class="grid"><div class="r h"><div>Description</div><div>Code</div><div>Qty</div><div>Unit price</div><div>Amount</div></div>
${LINES.map(([d, c, q, u, a]) => `<div class="r"><div>${d}</div><div class="c2">${c}</div><div>${q}</div><div>${u}</div><div>${a}</div></div>`).join('')}</div>
<div class="sum"><p><span>Subtotal</span><span>$3,600.00</span></p><p><span>Loyalty discount (5%)</span><span>−$180.00</span></p><p><span>VAT (5%)</span><span>$171.00</span></p><p class="big"><span>Total due</span><span>$3,591.00</span></p></div>
<div class="foot2"><div><div class="cap">Payment</div>Bank transfer to Northwind Print Co.<br>Sort code 40-12-76 · Account 31926819<br>Reference: INV-2026-0418</div><div><div class="cap">Terms</div>Payment due within 30 days. A late fee of 2% per month applies to overdue balances.</div></div>
<p class="end">Thank you for your business — questions? accounts@northwindprint.co.uk · 0113 496 0021</p></div></body></html>`);

// GOOD: slips — dates numeric, "Price" header, no status pill, logo square
{
  out('i_good', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#eceff2;padding:36px 0;font-family:Arial,sans-serif;color:#222}
.w{width:880px;box-sizing:border-box;margin:0 auto;background:#fff;padding:52px 60px;border-top:6px solid #0f766e}
.a{display:flex;justify-content:space-between}
.lg{display:inline-block;width:46px;height:46px;background:#0f766e;color:#fff;border-radius:6px;text-align:center;line-height:46px;font-weight:bold;font-size:20px;vertical-align:middle;margin-right:12px}
.nm{display:inline-block;vertical-align:middle}.nm b{font-size:20px;display:block}.nm span{font-size:13px;color:#666}
h1{margin:0;font-size:32px;color:#0f766e;letter-spacing:5px;font-weight:normal;text-align:right}.no{text-align:right;font-size:13px;color:#666;margin:4px 0 0}
.m{display:flex;justify-content:space-between;margin-top:40px;font-size:14px;line-height:1.6}
.m h4{margin:0 0 6px;font-size:11px;letter-spacing:2px;color:#888;text-transform:uppercase}
table{width:100%;border-collapse:collapse;margin-top:38px;font-size:14px}
th{background:#f4f6f8;font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#555;text-align:left;padding:10px 12px;border-bottom:2px solid #ccd}
td{padding:12px;border-bottom:1px solid #e6e6e6}.r{text-align:right}
.t{width:320px;margin:18px 0 0 auto;font-size:14px}.t div{display:flex;justify-content:space-between;padding:7px 12px}
.t .g{border-top:2px solid #222;font-size:20px;font-weight:bold;color:#0f766e;padding-top:12px;margin-top:6px}
.n{display:flex;gap:48px;margin-top:46px;font-size:13px;color:#555;line-height:1.6}.n h4{margin:0 0 6px;font-size:11px;letter-spacing:2px;color:#888;text-transform:uppercase}
.e{margin-top:40px;border-top:1px solid #e6e6e6;padding-top:20px;text-align:center;font-size:13px;color:#888}
</style></head><body><div class="w">
<div class="a"><div><span class="lg">N</span><span class="nm"><b>Northwind Print Co.</b><span>88 Mill Lane, Leeds LS1 4BX · VAT GB 284 1193 56</span></span></div><div><h1>INVOICE</h1><p class="no">No. INV-2026-0418</p></div></div>
<div class="m"><div><h4>Bill to</h4><b>Harbourlight Events Ltd</b><br>Attn: Marcus Ode<br>12 Quayside Walk<br>Newcastle NE1 3DX</div><div><h4>Ship to</h4>Harbourlight Events Ltd<br>Unit 4, Baltic Works<br>Gateshead NE8 2BA</div>
<div>Issued: 03/11/2026<br>Due: 03/12/2026<br>PO number: HL-7731</div></div>
<table><tr><th>Description</th><th>Code</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr>
${LINES.map(([d, c, q, u, a]) => `<tr><td>${d}</td><td style="color:#888;font-family:'Courier New';font-size:13px">${c}</td><td class="r">${q}</td><td class="r">${u}</td><td class="r">${a}</td></tr>`).join('')}</table>
<div class="t"><div><span>Subtotal</span><span>$3,600.00</span></div><div><span>Loyalty discount (5%)</span><span>−$180.00</span></div><div><span>VAT (5%)</span><span>$171.00</span></div><div class="g"><span>Total due</span><span>$3,591.00</span></div></div>
<div class="n"><div><h4>Payment</h4>Bank transfer to Northwind Print Co.<br>Sort code 40-12-76 · Account 31926819<br>Reference: INV-2026-0418</div><div><h4>Terms</h4>Payment due within 30 days. A late fee of 2% per month applies to overdue balances.</div></div>
<p class="e">Thank you for your business — questions? accounts@northwindprint.co.uk · 0113 496 0021</p></div></body></html>`);
}

// MEDIOCRE: full-width white page, no grey frame, code column missing, ship-to missing, one line missing, totals wrong, bigger fonts
{
  const l = clone(); l.splice(5, 1);
  out('i_mediocre', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;padding:40px 60px;font-family:Verdana,sans-serif;color:#333}
h1{color:#0f766e;font-size:40px;margin:0}.co{font-size:22px;font-weight:bold;margin:20px 0 4px}
.s{color:#666;font-size:14px}
.b{margin:30px 0;font-size:15px;line-height:1.5}
table{width:100%;border-collapse:collapse;font-size:15px}th{background:#0f766e;color:#fff;padding:12px;text-align:left}td{padding:14px 12px;border-bottom:1px solid #ddd}
.tot{margin-top:24px;font-size:16px;line-height:1.8}.tot b{font-size:22px;color:#0f766e}
p{font-size:13px;color:#666}
</style></head><body>
<h1>INVOICE #INV-2026-0418</h1><div class="co">Northwind Print Co.</div><div class="s">88 Mill Lane, Leeds LS1 4BX</div>
<div class="b"><b>Bill to:</b> Harbourlight Events Ltd, Attn: Marcus Ode, 12 Quayside Walk, Newcastle NE1 3DX<br><b>Issued:</b> 3 November 2026 &nbsp; <b>Due:</b> 3 December 2026 &nbsp; <b>PO:</b> HL-7731</div>
<table><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Amount</th></tr>
${l.map(([d, , q, u, a]) => `<tr><td>${d}</td><td>${q}</td><td>${u}</td><td>${a}</td></tr>`).join('')}</table>
<div class="tot">Subtotal: $3,600.00<br>Discount: −$180.00<br>VAT (5%): $171.00<br><b>Total due: $3,591.00</b></div>
<p>Payment due within 30 days. Bank transfer: Sort code 40-12-76, Account 31926819.</p><p>Thank you for your business!</p>
</body></html>`);
}

// POOR: plain generic table, no styling
out('i_poor', `<!doctype html><html><body style="font-family:Arial">
<h2>Invoice</h2><p>From: Northwind Print<br>To: Harbourlight Events</p>
<table border="1" cellpadding="4"><tr><th>Item</th><th>Qty</th><th>Total</th></tr>
${LINES.slice(0, 5).map(([d, , q, , a]) => `<tr><td>${d}</td><td>${q}</td><td>${a}</td></tr>`).join('')}</table>
<p>Total: $3,591.00</p></body></html>`);

// PROBE (boss minds a lot, pixels barely): total due and two amounts wrong
{
  const l = clone(); l[1][4] = '$390.00'; l[4][4] = '$1,810.00';
  out('i_numbers_wrong', goal(l, { total: '$5,391.00' }));
}

// PROBE (boss shrugs, pixels shout): roomier rows (table 120px taller, everything below shifts) + header band teal
out('i_roomy', goal().replace('.items td{padding:12px;', '.items td{padding:19px 12px;').replace('background:#f5f7fa;padding:10px 12px', 'background:#ccfbf1;padding:14px 12px'));

// PROBE: Qty and Unit price columns swapped (values follow headers) — boss minds a little
out('i_cols_swapped', goal().replace('<th class="n">Qty</th><th class="n">Unit price</th>', '<th class="n">Unit price</th><th class="n">Qty</th>').replace(/<td class="n">([^<]*)<\/td><td class="n">([^<]*)<\/td><td class="n">/g, '<td class="n">$2</td><td class="n">$1</td><td class="n">'));

// CHEAT: right top of the page (header + addresses), nothing below
{
  const g = goal(); out('cheat_top_only', g.slice(0, g.indexOf('<table class="items">')) + '</div></body></html>');
}

// CHEAT: the goal's words present but in 2px text clipped into a strip, with the frame and teal bar right
{
  const g = goal();
  out('cheat_tiny_text', g.replace('.sheet{', '.sheet{font-size:2px!important;').replace('</style>', '.sheet *{font-size:2px!important;line-height:2px!important;padding-top:0!important;padding-bottom:0!important;margin-top:0!important}</style>'));
}
console.log('invoice written');
