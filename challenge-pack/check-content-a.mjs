// Checks content sheets, briefs and acceptance for three challenge files.
// Run: node challenge-pack/check-content-a.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const files = ["pages-live", "pages", "pages-2/components"].map((d) => path.join(here, d, "challenges.json"));
const banned = ["sidebar", "hero", "card", "cards", "grid", "column", "columns", "left", "right", "top", "bottom", "centre", "center", "centred", "centered", "px", "bold", "highlighted"];
const bannedRe = new RegExp("\\b(" + banned.join("|") + ")\\b", "gi");
const hexRe = /#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g;
const squash = (s) => s.replace(/\s+/g, " ").trim();
const words = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}$%'’.-]+/gu, " ").split(" ").map((w) => w.replace(/^[.'’-]+|[.'’-]+$/g, "")).filter(Boolean);

let errors = 0, entries = 0;
const notes = [];
const fail = (m) => { errors++; console.log("FAIL " + m); };

for (const f of files) {
  const rel = path.relative(here, f);
  let j;
  try { j = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) { fail(`${rel}: JSON does not parse: ${e.message}`); continue; }
  for (const c of j.challenges) {
    entries++;
    const id = `${rel} ${c.slug}`;
    // content
    if (typeof c.content !== "string" || c.content.length < 200) { fail(`${id}: content missing or under 200 characters`); continue; }
    const content = squash(c.content);
    const misses = (c.keyFacts || []).filter((k) => !content.includes(squash(k)));
    if (misses.length > 3) fail(`${id}: ${misses.length} key facts missing from content: ${JSON.stringify(misses)}`);
    else if (misses.length) notes.push(`${id}: key facts left out: ${JSON.stringify(misses)}`);
    // banned words: a banned word that is part of a key fact is allowed (it is client text)
    let stripped = content;
    for (const k of [...(c.keyFacts || [])].sort((x, y) => y.length - x.length)) stripped = stripped.split(squash(k)).join(" ");
    const cb = stripped.match(bannedRe);
    if (cb) fail(`${id}: content uses presentation words: ${[...new Set(cb)].join(", ")}`);
    const allowedInFacts = content.match(bannedRe);
    if (allowedInFacts && !cb) notes.push(`${id}: presentation word inside a key fact (allowed): ${[...new Set(allowedInFacts)].join(", ")}`);
    if (content.match(hexRe)) fail(`${id}: content has a hex colour: ${content.match(hexRe).join(", ")}`);
    // brief
    const b = c.brief || "";
    if (b.length < 300 || b.length > 900) fail(`${id}: brief is ${b.length} characters (300 to 900)`);
    if (!/\breference\b/i.test(b)) fail(`${id}: brief does not mention the reference`);
    const bb = b.match(bannedRe);
    if (bb) fail(`${id}: brief uses presentation words: ${[...new Set(bb)].join(", ")}`);
    if (b.match(hexRe)) fail(`${id}: brief has a hex colour`);
    const req = Array.isArray(c.requirements) ? c.requirements.join(" \n ") : String(c.requirements || "");
    const grams = new Set();
    for (const part of req.split("\n")) { const w = words(part); for (let i = 0; i + 8 <= w.length; i++) grams.add(w.slice(i, i + 8).join(" ")); }
    const bw = words(b);
    for (let i = 0; i + 8 <= bw.length; i++) { const g = bw.slice(i, i + 8).join(" "); if (grams.has(g)) { fail(`${id}: brief shares an 8-word run with requirements: "${g}"`); break; } }
    // acceptance
    const a = c.acceptance;
    if (!Array.isArray(a) || a.length < 3 || a.length > 5) fail(`${id}: acceptance needs 3 to 5 statements`);
    else a.forEach((s, i) => { if (typeof s !== "string" || s.length < 30) fail(`${id}: acceptance ${i + 1} is under 30 characters`); });
  }
}
for (const n of notes) console.log("NOTE " + n);
console.log(errors ? `RESULT: FAIL, ${errors} problem(s) in ${entries} entries` : `RESULT: PASS, ${entries} entries checked`);
process.exit(errors ? 1 : 0);
