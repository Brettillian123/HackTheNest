import { writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const B = 'https://promptdyno.vercel.app', OUT = process.argv[2], D = process.argv[3];
const runs = [
 ['login-card','lazy-haiku','claude-haiku','make a nice sign in page with the content, centered card, green button'],
 ['profile-card','careful-haiku','claude-haiku','Build a single profile card from the given content, centred horizontally near the top of a pale lavender-blue page. The card is white, about 400px wide, with large rounded corners, generous padding and a very soft shadow, and everything in it is centred. Top to bottom: a circular stand-in for the picture about 110px across, drawn as an inline SVG person silhouette (a head circle and rounded shoulders) in indigo on a lighter lavender circle; the name as a bold heading in near-black; the job title under it in muted grey; then, between two thin light grey horizontal rules, the three figures in one row of three equal columns, each figure bold with its label in small grey text beneath it; then a full-width indigo button with white bold text and rounded corners. Use a plain system sans-serif font. Make the button a real button element that shows a clear focus outline, mark the stats up as a list, set the page language and a viewport meta tag, and keep the CSS short with no unused rules.'],
 ['profile-card','lazy-haiku','claude-haiku','profile card for the person with their stats and a follow button, purple style'],
 ['harbor-landing','careful-openai','openai-mini','Build a one-screen landing page from the given content. Header: a white bar across the top with the company name in bold on the left and the navigation links plus the sign-in link on the right in grey, with a thin light border under it. Hero: on a very light grey page background, centred, a very large bold near-black headline on one line, the subheadline under it in grey at a comfortable reading size, then a solid blue button with white bold text and slightly rounded corners. Below the hero, the three features in one row of three equal white cards with thin light borders, rounded corners and roomy padding, each with its name as a bold heading and its description in grey underneath, left aligned. Footer: a full-width dark navy band at the bottom with the footer line centred in small light text. Keep the content width around 1120px, centred, with generous vertical spacing so it feels calm. On narrow screens stack the cards in one column and let the nav wrap. Use semantic header, main and footer elements, real links, a system sans-serif font, the page language and a viewport meta tag, and short tidy CSS.'],
 ['harbor-landing','lazy-openai','openai-mini','landing page for Harbor with a headline, a button and three feature boxes'],
];
const lines = ['# Real model runs for calibration','','Generated on the live site (promptdyno.vercel.app) by Brett\'s site session, as an anonymous player. The model was given each challenge\'s content sheet automatically. Scores are from the live grader at the time of the run.','','| File | Model | Prompt | Live score | Grader |','|---|---|---|---|---|'];
mkdirSync(`${OUT}/login-card`, { recursive: true });
copyFileSync(`${D}/r3.html`, `${OUT}/login-card/careful-haiku.html`);
lines.push('| login-card/careful-haiku.html | claude-haiku | careful (layout and feel only, no wording) | 97.1 | 0.8.0 |');
for (const [slug, name, model, prompt] of runs) {
  const anon = 'qa' + randomBytes(16).toString('hex');
  const h = { 'Content-Type': 'application/json', 'X-Anon-Id': anon, 'User-Agent': 'site-check' };
  try {
    const r = await fetch(`${B}/api/runs`, { method: 'POST', headers: h, body: JSON.stringify({ slug, prompt, model }) });
    const html = await r.text();
    if (!r.ok) { console.log(slug, name, 'generate', r.status, html.slice(0, 160)); lines.push(`| ${slug}/${name}.html | ${model} | ${name.split('-')[0]} | generate failed (${r.status}) | |`); continue; }
    mkdirSync(`${OUT}/${slug}`, { recursive: true });
    writeFileSync(`${OUT}/${slug}/${name}.html`, html);
    const s = await fetch(`${B}/api/runs/${r.headers.get('x-run-id')}/score`, { method: 'POST', headers: h });
    const j = await s.json(); const res = j.run?.result;
    const p = (res?.pillars || []).map(x => x.value).join(' / ');
    console.log(slug, name, 'TOTAL', res?.total, '| works/eng/looks', p, '|', (res?.costs || []).slice(0, 2).map(c => '-' + c.points + ' ' + c.message.slice(0, 70)).join(' ; '));
    lines.push(`| ${slug}/${name}.html | ${model} | ${name.split('-')[0]} | ${res?.total ?? 'score failed'} (works / engineered / looks: ${p}) | ${res?.graderVersion ?? ''} |`);
  } catch (e) { console.log(slug, name, 'error', e.message); }
}
writeFileSync(`${OUT}/README.md`, lines.join('\n') + '\n');
