import type { Block, PageSnapshot, RGB } from '../../src/types';
import type { DomFacts } from '../../src/quality/types';

/** A clean, ordinary, well-made page. */
export const CLEAN_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Corner Bakery</title>
<style>
  body { font-family: sans-serif; color: #222; background: #fff; margin: 0; }
  nav a { margin-right: 12px; }
  .btn { padding: 8px 16px; }
  a:hover { text-decoration: underline; }
</style>
</head>
<body>
<header><nav><a href="#menu">Menu</a> <a href="#contact">Contact</a></nav></header>
<main>
  <h1>Corner Bakery</h1>
  <p>Fresh bread every morning.<br>Open daily.<br/>Since 1990.</p>
  <img src="bread.jpg" alt="A loaf of sourdough" width="200" height="100">
  <img src="divider.png" alt="" width="200" height="4">
  <h2 id="menu">Menu</h2>
  <ul><li>Sourdough<li>Rye</ul>
  <h3>Pastries</h3>
  <p>Croissants &amp; buns, AT&T approved, 5 &lt; 6.</p>
  <h2 id="contact">Contact</h2>
  <form action="/send" method="post">
    <label for="email">Email</label> <input id="email" type="email" name="email">
    <label>Message <textarea name="message"></textarea></label>
    <input type="hidden" name="token" value="1">
    <button type="submit" class="btn">Send</button>
  </form>
  <table><tr><td>Mon<td>8-5</tr></table>
  <svg width="20" height="20" role="img" aria-label="Logo"><path d="M0 0L10 10"/></svg>
</main>
<footer><p>&copy; 2026 Corner Bakery</p><a href="/privacy?a=1&b=2">Privacy</a></footer>
</body>
</html>`;

export function textBlock(text: string, color: RGB, behind: RGB, fontSize = 16, bold = false): Block {
  return {
    kind: 'text',
    rect: { x: 0, y: 0, w: 100, h: fontSize * 1.2 },
    behind,
    text,
    textStyle: { color, fontSize, bold, fontClass: 'sans', italic: false, underline: false },
  };
}

export function snapshot(blocks: Block[]): PageSnapshot {
  return {
    width: 800,
    height: 600,
    pageBackground: [255, 255, 255],
    blocks,
    pixels: new Uint8Array(0),
    png: Buffer.alloc(0),
  };
}

/** A readable page: dark text on white. */
export const CLEAN_SNAPSHOT = snapshot([
  textBlock('Corner Bakery', [34, 34, 34], [255, 255, 255], 32, true),
  textBlock('Fresh bread every morning.', [34, 34, 34], [255, 255, 255]),
]);

/** DOM facts of a page with no accessibility problems. */
export function cleanDom(): DomFacts {
  return {
    elementCount: 40,
    lang: 'en',
    title: 'Corner Bakery',
    images: { checked: 2, withoutDescription: 0, examples: [] },
    fields: { checked: 2, withoutLabel: 0, examples: [] },
    controls: { checked: 4, withoutName: 0, examples: [] },
    headingLevels: [1, 2, 3, 2],
    truncated: false,
    errors: 0,
  };
}
