# promptdyno web

Plain static HTML, CSS and ES modules. No framework, no build step. The look is
`design/templates/workspace-v8.html`, turned into shared pieces.

## Layout
- `css/tokens.css`: every colour, font, size, radius, spacing step and shadow. Change the look here only.
- `css/base.css`: reset, type roles (`.h`, `.title`, `.note`, `.mono`), links, focus ring, app frame, layout (`.split`, `.col`, `.pair`, `.stack`).
- `css/components.css`: all components. The comment index at the top lists each class and its minimal HTML.
- `js/shell.js`: `mountShell({ active, user, crumb })` fills the rail and top nav.
- `js/ui.js`: `dropdown`, `tabs`, `toast`, `fitFrames`, `lineNumbers`, `levelClass`, `esc`.
- `dev/serve.mjs`: static server. `dev/kitchen.html`: every component on one page.
- Pages (`index.html`, `workspace.html`, ...) sit at the top of `web/` and link relatively.

## Run
    node web/dev/serve.mjs
Then open http://localhost:4173/ or http://localhost:4173/dev/kitchen.html

## Modes
- Mock on localhost and under node; live on any other host (`js/config.js`). `?mock=1` or `?live=1` overrides for the tab.
- Live: auth uses `/api/auth/*`; every other endpoint falls back to mock until the server has it.
  Simulated data is labelled with `demoTag()` / `simNote()` from `js/ui.js` when `api.isSimulated(kind)` is true.
- Narrow screens: `css/responsive.css`, loaded last on every page. `dev/frame.html` shows a page at phone width for screenshots.

## Page skeleton
    <link rel="stylesheet" href="css/tokens.css">
    <link rel="stylesheet" href="css/base.css">
    <link rel="stylesheet" href="css/components.css">
    <body>
      <aside id="rail"></aside>
      <header id="nav"></header>
      <main class="page">...</main>
      <script type="module">
        import { mountShell } from './js/shell.js';
        mountShell({ active: 'challenges', user: null });
      </script>

## Rules
- Pages use only token variables and component classes. No hard-coded colours or font sizes.
- New component? Add it to `components.css` and its index, in v8's language, and show it in `kitchen.html`.
- Icons are inline SVG strokes (20px rail, 13 to 15px elsewhere). No emoji.
