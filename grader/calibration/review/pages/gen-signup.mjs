// Writes the registration-screen goal (mostly form controls) and attempts into ./signup/
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = join(dirname(fileURLToPath(import.meta.url)), 'signup');
mkdirSync(dir, { recursive: true });
const out = (n, h) => writeFileSync(join(dir, n + '.html'), h);

function goal(o = {}) {
  const t = Object.assign({
    head: 'Create your account', sub: 'Start your 14-day free trial. No credit card required.',
    btn: 'Create account', panel: 'linear-gradient(160deg,#1e3a8a 0%,#2563eb 100%)', btnBg: '#2563eb',
    hint: 'At least 8 characters, with one number and one symbol.', foot: 'Already have an account? <a>Sign in</a>',
    terms: 'I agree to the <a>Terms of Service</a> and <a>Privacy Policy</a>', extra: '',
  }, o);
  return `<!doctype html><html><head><meta charset="utf-8"><title>Sign up — Ledgerly</title><style>
*{box-sizing:border-box;margin:0}
body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;background:#fff;height:920px;display:flex}
.panel{width:520px;background:${t.panel};color:#fff;padding:64px 56px;display:flex;flex-direction:column}
.brand{font-size:24px;font-weight:bold;display:flex;align-items:center;gap:10px}
.mark{width:32px;height:32px;border-radius:8px;background:#fff;color:#1e3a8a;display:flex;align-items:center;justify-content:center;font-size:18px}
.panel h2{font-size:34px;line-height:1.25;margin-top:120px;font-weight:bold}
.panel ul{list-style:none;padding:0;margin-top:32px}
.panel li{font-size:16px;margin-bottom:16px;padding-left:30px;position:relative;color:#dbeafe}
.panel li:before{content:"✓";position:absolute;left:0;top:0;width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.2);color:#fff;font-size:12px;text-align:center;line-height:20px}
.quote{margin-top:auto;font-size:14px;color:#bfdbfe;font-style:italic}
.side{flex:1;display:flex;align-items:center;justify-content:center}
form{width:400px}
h1{font-size:28px}
.sub{color:#64748b;font-size:15px;margin-top:8px;margin-bottom:28px}
label{display:block;font-size:14px;font-weight:bold;margin-bottom:6px;color:#334155}
input[type=text],input[type=email],input[type=password],select{display:block;width:100%;height:42px;border:1px solid #cbd5e1;border-radius:8px;padding:0 12px;font-size:15px;font-family:Arial,sans-serif;color:#0f172a;background:#fff}
.f{margin-bottom:18px}
.hint{font-size:12px;color:#64748b;margin-top:6px}
.check{display:flex;align-items:center;gap:8px;font-size:14px;color:#334155;margin:4px 0 22px}
.check input{width:16px;height:16px}
a{color:#2563eb;text-decoration:none}
button{display:block;width:100%;height:44px;border:0;border-radius:8px;font-size:16px;font-weight:bold;font-family:Arial,sans-serif;cursor:pointer}
.primary{background:${t.btnBg};color:#fff}
.or{display:flex;align-items:center;gap:12px;color:#94a3b8;font-size:13px;margin:20px 0}
.or:before,.or:after{content:"";flex:1;border-top:1px solid #e2e8f0}
.google{background:#fff;border:1px solid #cbd5e1;color:#334155}
.foot{text-align:center;font-size:14px;color:#64748b;margin-top:22px}
</style></head><body>
<div class="panel"><div class="brand"><span class="mark">L</span>Ledgerly</div>
<h2>Bookkeeping that<br>does itself.</h2>
<ul><li>Connect your bank in two minutes</li><li>Receipts matched automatically</li><li>Tax-ready reports every quarter</li></ul>
<p class="quote">“We closed our books in a day instead of a week.” — Priya N., Fernway Studio</p></div>
<div class="side"><form>
<h1>${t.head}</h1><p class="sub">${t.sub}</p>
<div class="f"><label>Full name</label><input type="text" placeholder="Jane Cooper"></div>
<div class="f"><label>Work email</label><input type="email" placeholder="jane@company.com"></div>
<div class="f"><label>Password</label><input type="password" value="secretpass1"><p class="hint">${t.hint}</p></div>
<div class="f"><label>Company size</label><select><option>1–10 employees</option></select></div>
${t.extra}
<div class="check"><input type="checkbox"><span>${t.terms}</span></div>
<button class="primary" type="button">${t.btn}</button>
<div class="or">or</div>
<button class="google" type="button">Continue with Google</button>
<p class="foot">${t.foot}</p>
</form></div>
</body></html>`;
}
out('goal', goal());

// EXCELLENT: grid rebuild, same look
out('s_excellent', `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:920px}
body{display:grid;grid-template-columns:520px 1fr;font-family:Arial,sans-serif;color:#0f172a}
aside{background:linear-gradient(160deg,#1f3b8c,#2563eb);color:#fff;padding:64px 56px;position:relative}
.logo{display:flex;gap:10px;align-items:center;font-weight:bold;font-size:24px}
.logo i{font-style:normal;width:32px;height:32px;border-radius:8px;background:#fff;color:#1e3a8a;text-align:center;line-height:32px;font-size:18px}
aside h2{margin:120px 0 0;font-size:34px;line-height:1.25}
.pts{margin:32px 0 0;padding:0;list-style:none}
.pts li{margin-bottom:16px;font-size:16px;color:#dbeafe}
.pts li b{display:inline-block;width:20px;height:20px;border-radius:10px;background:rgba(255,255,255,.2);color:#fff;font-size:12px;text-align:center;line-height:20px;margin-right:10px}
.q{position:absolute;bottom:64px;left:56px;right:56px;margin:0;font-size:14px;font-style:italic;color:#bfdbfe}
main{display:flex;align-items:center;justify-content:center}
.card{width:400px}
.card h1{margin:0;font-size:28px}
.lead{margin:8px 0 28px;color:#64748b;font-size:15px}
.fld{margin-bottom:18px}
.fld span{display:block;font-weight:bold;font-size:14px;color:#334155;margin-bottom:6px}
.box{height:42px;border:1px solid #cbd5e1;border-radius:8px;padding:0 12px;font-size:15px;line-height:42px;color:#94a3b8}
.box.v{color:#0f172a;letter-spacing:2px}
.box.sel{color:#0f172a;position:relative}.box.sel:after{content:"▾";position:absolute;right:12px;color:#334155}
.help{font-size:12px;color:#64748b;margin-top:6px}
.agree{display:flex;gap:8px;align-items:center;font-size:14px;color:#334155;margin:4px 0 22px}
.agree i{width:14px;height:14px;border:1px solid #767676;border-radius:3px}
.agree a,.alt a{color:#2563eb}
.btn{height:44px;border-radius:8px;text-align:center;line-height:44px;font-weight:bold;font-size:16px}
.blue{background:#2563eb;color:#fff}
.sep{display:flex;align-items:center;gap:12px;margin:20px 0;color:#94a3b8;font-size:13px}.sep hr{flex:1;border:0;border-top:1px solid #e2e8f0;margin:0}
.ghost{border:1px solid #cbd5e1;color:#334155}
.alt{text-align:center;margin-top:22px;font-size:14px;color:#64748b}
</style></head><body>
<aside><div class="logo"><i>L</i>Ledgerly</div><h2>Bookkeeping that<br>does itself.</h2>
<ul class="pts"><li><b>✓</b>Connect your bank in two minutes</li><li><b>✓</b>Receipts matched automatically</li><li><b>✓</b>Tax-ready reports every quarter</li></ul>
<p class="q">“We closed our books in a day instead of a week.” — Priya N., Fernway Studio</p></aside>
<main><div class="card"><h1>Create your account</h1><p class="lead">Start your 14-day free trial. No credit card required.</p>
<div class="fld"><span>Full name</span><div class="box">Jane Cooper</div></div>
<div class="fld"><span>Work email</span><div class="box">jane@company.com</div></div>
<div class="fld"><span>Password</span><div class="box v">•••••••••••</div><div class="help">At least 8 characters, with one number and one symbol.</div></div>
<div class="fld"><span>Company size</span><div class="box sel">1–10 employees</div></div>
<div class="agree"><i></i>I agree to the <a>Terms of Service</a> and <a>Privacy Policy</a></div>
<div class="btn blue">Create account</div><div class="sep"><hr>or<hr></div><div class="btn ghost">Continue with Google</div>
<p class="alt">Already have an account? <a>Sign in</a></p></div></main>
</body></html>`);

// GOOD: slips — no quote, panel solid colour, button green-ish? (no: indigo), hint missing, inputs taller
out('s_good', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;font-family:Arial,sans-serif;display:flex;min-height:920px;color:#111827}
.l{width:500px;background:#1d4ed8;color:#fff;padding:60px 52px;box-sizing:border-box}
.l .b{font-size:24px;font-weight:bold}.l .b span{background:#fff;color:#1d4ed8;border-radius:8px;padding:2px 9px;margin-right:8px}
.l h2{font-size:34px;line-height:1.25;margin:120px 0 30px}
.l p{margin:0 0 16px;font-size:16px;color:#dbeafe}
.r{flex:1;display:flex;align-items:center;justify-content:center}
.fm{width:400px}
.fm h1{font-size:28px;margin:0}.fm .s{color:#6b7280;margin:8px 0 26px;font-size:15px}
.fm label{display:block;font-weight:bold;font-size:14px;margin:0 0 6px;color:#374151}
.fm input,.fm select{width:100%;box-sizing:border-box;height:46px;border:1px solid #d1d5db;border-radius:6px;padding:0 12px;font-size:15px;margin-bottom:18px;font-family:Arial,sans-serif}
.fm .c{font-size:14px;margin:0 0 22px;display:flex;gap:8px;align-items:center}
.fm .c input{width:16px;height:16px;margin:0}
.fm button{width:100%;height:44px;border-radius:6px;font-size:16px;font-weight:bold;border:0;font-family:Arial,sans-serif}
.fm .p{background:#4f46e5;color:#fff}.fm .g{background:#fff;border:1px solid #d1d5db;color:#374151}
.fm .o{text-align:center;color:#9ca3af;font-size:13px;margin:18px 0}
.fm .f{text-align:center;font-size:14px;color:#6b7280;margin-top:22px}.fm a{color:#4f46e5}
</style></head><body>
<div class="l"><div class="b"><span>L</span>Ledgerly</div><h2>Bookkeeping that does itself.</h2>
<p>✓ Connect your bank in two minutes</p><p>✓ Receipts matched automatically</p><p>✓ Tax-ready reports every quarter</p></div>
<div class="r"><div class="fm"><h1>Create your account</h1><p class="s">Start your 14-day free trial. No credit card required.</p>
<label>Full name</label><input placeholder="Jane Cooper"><label>Work email</label><input placeholder="jane@company.com">
<label>Password</label><input type="password" value="password12"><label>Company size</label><select><option>1–10 employees</option></select>
<div class="c"><input type="checkbox">I agree to the <a>Terms of Service</a> and <a>Privacy Policy</a></div>
<button class="p">Create account</button><div class="o">— or —</div><button class="g">Continue with Google</button>
<p class="f">Already have an account? <a>Sign in</a></p></div></div></body></html>`);

// MEDIOCRE: centred card on grey, brand panel reduced to a top bar, labels as placeholders, one field missing (company size), wrong trial length
out('s_mediocre', `<!doctype html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#eef2f7;font-family:Verdana,sans-serif}
.bar{background:#2563eb;color:#fff;padding:18px 30px;font-size:20px;font-weight:bold}
.card{width:460px;margin:50px auto;background:#fff;border-radius:12px;padding:36px;box-shadow:0 4px 20px rgba(0,0,0,.08)}
h1{margin:0 0 6px;font-size:24px;text-align:center}.s{text-align:center;color:#666;font-size:13px;margin:0 0 24px}
input{width:100%;box-sizing:border-box;padding:14px;margin-bottom:14px;border:1px solid #ccc;border-radius:4px;font-size:14px}
.c{font-size:12px;margin-bottom:18px}
button{width:100%;padding:14px;background:#2563eb;color:#fff;border:0;border-radius:4px;font-size:15px;margin-bottom:10px}
.g{background:#fff;color:#333;border:1px solid #ccc}
p.f{text-align:center;font-size:13px}
ul{font-size:13px;color:#555;margin:20px 0 0}
</style></head><body>
<div class="bar">Ledgerly — Bookkeeping that does itself.</div>
<div class="card"><h1>Create your account</h1><p class="s">Start your 30-day free trial. No credit card required.</p>
<input placeholder="Full name"><input placeholder="Work email"><input placeholder="Password" type="password">
<div class="c"><input type="checkbox" style="width:auto;margin:0 6px 0 0">I agree to the Terms of Service and Privacy Policy</div>
<button>Create account</button><button class="g">Continue with Google</button>
<p class="f">Already have an account? Sign in</p>
<ul><li>Connect your bank in two minutes</li><li>Receipts matched automatically</li><li>Tax-ready reports every quarter</li></ul></div>
</body></html>`);

// POOR: browser-default form, no styling
out('s_poor', `<!doctype html><html><body>
<h1>Sign Up</h1><p>Ledgerly bookkeeping software</p>
<form><p>Name: <input></p><p>Email: <input></p><p>Password: <input type="password"></p>
<p><input type="checkbox"> I agree to the terms</p><p><input type="submit" value="Submit"></p></form>
<p>Already registered? Log in</p></body></html>`);

// PROBE (boss minds, pixels barely): a login screen instead of sign-up — heading, button and footer say sign in
out('s_wrong_purpose', goal({ head: 'Welcome back', sub: 'Sign in to continue to your Ledgerly books.', btn: 'Sign in', foot: 'New to Ledgerly? <a>Create an account</a>' }));

// PROBE (boss shrugs, pixels shout): gradient a different blue family (teal-ish navy) and runs the other way
out('s_other_blue', goal({ panel: 'linear-gradient(20deg,#0e7490 0%,#1e40af 100%)', btnBg: '#1d4ed8' }));

// PROBE (boss minds a lot): password field missing (label and box gone), everything else right
out('s_no_password', goal().replace(/<div class="f"><label>Password<\/label>.*?<\/div>\n/, ''));

// CHEAT: page duplicated (stacked twice)
{
  const g = goal();
  const body = g.slice(g.indexOf('<body>') + 6, g.indexOf('</body>'));
  out('cheat_duplicated', g.replace('height:920px;display:flex}', 'display:flex;flex-wrap:wrap}').replace('.panel{', '.panel{height:920px;').replace('.side{', '.side{height:920px;min-width:760px;').replace('</body>', body + '</body>'));
}

// CHEAT: right boxes and colours, no real words (every text replaced by grey bars)
{
  const g = goal(); const i = g.indexOf('<body>');
  const bars = (s) => s.replace(/>([^<>]{2,})</g, (m, t) => t.trim() ? `><span style="display:inline-block;width:${Math.min(t.length * 8, 380)}px;height:0.8em;background:currentColor;opacity:.35;border-radius:3px"></span><` : m).replace(/placeholder="[^"]*"/g, '').replace(/value="[^"]*"/g, '');
  out('cheat_boxes', g.slice(0, i) + bars(g.slice(i)));
}
console.log('signup written');
