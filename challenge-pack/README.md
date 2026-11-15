# Challenge pack: multi-page sites and 3D models

Twenty-five challenges for multi-page sites and 3D models. The ten new scene challenges include one guided tutorial and three challenges at each level. Each scene target is a self-contained `buildScene(THREE)` reference in plain JavaScript.

| Slug | Kind | Level |
| --- | --- | --- |
| bike-builder-site | site | 1 Easy (3 pages) |
| restaurant-site | site | 2 Medium (4 pages) |
| shop-site | site | 2 Medium (5 pages) |
| docs-site | site | 2 Medium (6 pages) |
| portfolio-site | site | 3 Hard (8 pages) |
| conference-site | site | 3 Hard (11 pages) |
| mug-3d | scene | 1 Easy |
| house-3d | scene | 1 Easy |
| chair-3d | scene | 2 Medium |
| desk-lamp-3d | scene | 2 Medium |
| car-3d | scene | 2 Medium |
| rocket-3d | scene | 2 Medium |
| snowman-3d | scene | 3 Hard |
| bookshelf-3d | scene | 3 Hard |
| bicycle-3d | scene | 3 Hard |
| tutorial-first-shape-3d | scene | 1 Tutorial |
| traffic-cone-3d | scene | 1 Easy |
| cactus-pot-3d | scene | 1 Easy |
| wooden-stool-3d | scene | 1 Easy |
| lighthouse-3d | scene | 2 Medium |
| treasure-chest-3d | scene | 2 Medium |
| windmill-3d | scene | 2 Medium |
| sailing-boat-3d | scene | 3 Hard |
| robot-3d | scene | 3 Hard |
| castle-3d | scene | 3 Hard |

## Files

- `sites/challenges.json`, `scenes/challenges.json`: entries in the site's format (`slug, title, level, brief, spec`) plus `kind` and `goal` (the goal's path in this folder).
- `sites/goals/<slug>/`: the goal site's files. `scenes/goals/<slug>.js`: the goal's `buildScene(THREE)`.
- `sites/build-site-specs.mjs` and `sites/site-meta.json`: the site specs are generated from the goal HTML and CSS, so every text, link, form field and CSS value is read from the code. Rerun with `node challenge-pack/sites/build-site-specs.mjs` after a goal changes. The scene specs were written by hand from the goal code.
- `check-sites-scenes.mjs`: `node challenge-pack/check-sites-scenes.mjs` checks the JSON, slugs, goal files, page and file lists, part names and hex colours.

## Installing (not done)

Append the entries to `web/data/challenges.json` and copy each goal to wherever the run flow loads goals from. **Unconfirmed:** the live site's run flow may not support the `site` and `scene` kinds yet. It may need a multi-file output, the site grader and the 3D grader wired in before these can be played.
