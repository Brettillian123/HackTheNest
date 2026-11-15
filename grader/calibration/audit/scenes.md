# 3D audit: advanced scenes and edge cases

Grader 0.6.0, branch `grader`, 2026-11-15. Three new goals (lamp, car, house), 8 attempts each, and 8 edge-case sets (33 attempts) under `calibration/edge/scenes/`. Bands were written to `scenes.json` after looking at the views and before any grading; none were changed afterwards. Run: `npx tsx calibration/audit/run-scenes.mts shots|grade`.

**Result:** 18 of 56 banded attempts agree; 10 more are within 5 points. Every attempt scored the same twice; every goal scores exactly 100 against itself; nothing took over 15 s (slowest 8.0 s, the infinite loop's time-out). Order checks: 23 of 25 hold. Broken: `house/near` (99.6) is not above `house/missing-part` (99.6), and `turn15` (29.8) scores below `turn90` (59.6).

## Disagreements

Worst first.

### 1. chair-orientation/turn15: band 85-96, grader 29.8 (works 14.7, eng 100, looks 75.1). HARSH by 55
- **What a person sees:** the same chair, turned slightly. You only notice if you compare the two.
- **What the grader charged:** "shape very different", 6 of 8 parts missing, 5 extra parts.
- **Likely cause:** `alignmentFor` in `parts.ts` lines the shapes up by moving them and scaling them evenly. It never tries a turn. `compareShapes` in `voxel.ts` then allows only one voxel of slack, so thin legs that move 2-3 voxels count as missing parts and as extra parts. `scoreScene` multiplies engineering by works (`engineering * works`), so the engineering weight is lost as well. `turn90` scores better (59.6) only because the chair is square from above, so a quarter turn puts the legs back on the same spots.

### 2. chair-extras/ground-plane: band 58-72, grader 5 (works 0, eng 96.9, looks 28.6). HARSH by 53
- **What a person sees:** the right chair, standing on a big floor nobody asked for.
- **What the grader charged:** it shrank the whole scene to the goal's size, so the chair became a speck. Then: all 8 parts missing, "90% shorter", "498% bigger".
- **Likely cause:** `scoreScene` has a leave-one-piece-out try, which was meant for exactly this. Its `tryMatch` still voxelizes every piece, including the piece being left out. Voxels are clamped to the grid edge, not dropped. So in every try the 10 m plane floods the comparison with extra voxels, and lining up on the chair alone never gains the 0.05 it needs. Even if that try won, `fineCand` would still include the plane. Shape credit is shared out by surface area, so one big extra surface wipes out works, when it should cost about one extra part.

### 3. lamp/wrong-proportions: band 60-75, grader 13.9 (works 0). Also car (29.9, HARSH by 28) and house (37.9, HARSH by 20)
- **What a person sees:** every part is there. One dimension is clearly too long: the lower arm, the car body, the walls.
- **What the grader charged:** "shape very different". On the lamp all 3 parts are "missing" and 2 are "extra"; on the car 7 of 12 are missing.
- **Likely cause:** `alignmentFor` scales by the bounding-box diagonal and lines up the box centres. One part that is too long makes the box bigger, so every other part is shrunk and moved. Then, in `compareShapes` and the parts check in `scoreScene`, every part is more than one voxel off. One local error becomes a global miss. Works then multiplies engineering away too.

### 4. lamp-mirror/mirrored: band 80-94, grader 40.5 (works 33.3). HARSH by 39.5
- **What a person sees:** the same lamp, leaning the other way.
- **What the grader charged:** a part missing, 2 extra parts.
- **Likely cause:** same as 1. `alignmentFor` cannot reflect, so the shade of a lopsided object ends up where the goal has empty space. (Whether a mirror image should count fully is the owner's call. Right now it is charged like a different design.)

### 5. chair-visibility/wireframe: band 55-70, grader 100 ("Matches the goal."). LENIENT by 30
- **What a person sees:** in three.js, a see-through wire cage of a chair.
- **What the grader charged:** nothing.
- **Likely cause:** the scene walker in `three-runner.ts` reads colour, opacity and `visible`, but never `material.wireframe`. Every triangle is drawn solid. Line and Points objects are also dropped without a word (`lines-points` came out fine, since a person would barely charge for them).

### 6. box-surface/thin-planes: band 90-100, grader 60.5 (eng -12.8). box-surface/hollow: band 84-96, grader 56 (eng -12.8). HARSH by about 29
- **What a person sees:** the same cube from every angle.
- **What the grader charged:** "6 times as many meshes as the goal". The engineering score goes below zero, and "worst measure wins" makes that the whole engineering score. The hollow box also gets "extra material in the middle" for the inside faces of its slabs, which nobody can see.
- **Likely cause:** `measure` and `ratioCredit` work on raw count ratios. With a 1-mesh goal, a 6-mesh answer gives ratio 3.5 and a negative credit, even though the triangles (12 against 12) and the code are about the same. Mesh count is read as weight when it is mostly how the code is organised. Separately, `compareShapes` compares every surface, inside ones included, not what can be seen from outside.

### 7. house/low-poly (flat slab instead of the gable roof): band 45-62, grader 91.1 (works 90.8). LENIENT by 29
- **What a person sees:** the roof, the house's defining shape, is gone.
- **What the grader charged:** "some of the shape is missing near the top", about 9 points.
- **Likely cause:** shape credit in `compareShapes` is shared out by surface area. The 4 x 4 ground slab and the walls hold most of the surface, so the roof is a small share. The slab also overlaps the bottom of the roof part, which keeps the roof "present" under `SCENE_PARTS.present`.
- **The same cause makes missing parts too cheap:**
  - `house/missing-part` (no door): 99.6, band 68-82. LENIENT by 18. The door stands out from the wall by less than one voxel, so the wall surface "covers" it. Only a little colour changes.
  - `lamp/missing-part` (no shade): 86.7, band 55-70. LENIENT by 17. See 8.

### 8. lamp/missing-part: band 55-70, grader 86.7 (works 88.2). LENIENT by 17
- **What a person sees:** a lamp with no shade.
- **What the grader charged:** "about 11% narrower". It does not say the shade is missing.
- **Likely cause:** `connectedPieces` in `parts.ts` joins pieces that share a single corner. The cylinder cap centres meet exactly at the lamp's joints, and the cone's tip sits on the arm's end. So base + both arms + shade form one "part", and the goal has only 3 parts. Losing the shade is a partial loss of a part that is still "present". The same welding at shared cap centres could merge parts in any jointed model.

### Also outside the band, same family
- **heavy (lamp, car, house): 30 each, band 50-65. HARSH by 20.** `ratioCredit` falls to -1 at the worst ratio, and engineering is 35% of the total. So a model that looks identical but is heavy loses 35 points and lands at 40 + 25 - 35 = 30, below "half right". This is a policy question (the owner wants bloat docked hard), but it puts a perfect-looking model with 60 times the triangles below a lamp with no shade.
- **chair-placement/far-origin: 70 (band 88-99, HARSH by 18). scale100: 70 (band 82-95, HARSH by 12).** The placement factor in `scoreScene` reaches its 30% cap at an offset of half a goal diagonal, or at a 2x size difference. "Charge a little" ends up as the full 30 points for any real move or resize.
- **lamp/low-poly 96.8 (LENIENT by 15), car/low-poly 99.4 (LENIENT by 14).** One voxel of slack at 72 voxels per side hides facets. A pentagon wheel is off by at most about 1.3 voxels. Looks barely moves. This fits "engineering over looks", but the crude shape is close to free.
- **lamp/rebuild-vague 16.8 (HARSH by 21), house/rebuild-vague 14.5 (HARSH by 16):** works is 0 for a recognisable lamp or house of another design. Same mechanism as 3, made worse because works multiplies engineering. **car/rebuild-vague 76 (LENIENT by 16):** a box car is boxy whatever its proportions, so the voxel match stays high.
- **chair-visibility/hidden-leg: 87, band 62-76. LENIENT by 11.** One part in 8 costs only 1/8 of works, and looks hardly sees a thin leg.

## Agreements
- house/rebuild-detailed 95.7 (88-98): looks identical; charged a little for 10 meshes against 7.
- blocks30/instanced 100 (94-103): instancing counted as one mesh with the right triangles.
- blocks30/merged 96 (94-103): identical; charged for longer code.
- box-surface/doubleside-flipped 95.8 (94-100): identical; charged for code length.
- box-surface/non-indexed 100 (96-100).
- chair-extras/hidden-extra 98.8 (88-99): a hidden cube is ignored.
- chair-extras/lines-points 94.3 (85-97): lines and points ignored; charged for code length.
- chair-extras/opacity-zero-extra 98 (86-98): a transparent cube is ignored.
- chair-extras/stray-cube 94.1 (86-97): the leave-one-out try worked; charged as one extra part.
- chair-placement/scene-with-lights 97.4 (96-101): lights and camera ignored.
- chair-failures/defined-twice 100 (88-100): last definition wins.
- chair-failures/nan-vertices 98.4 (88-100): the NaN triangle is dropped.
- chair-failures: returns-nothing, returns-number, throws, infinite-loop, zero-triangles and async all score 0 with a message (see below).

Within 5 points: lamp/near 98.7, lamp/rebuild-detailed 99.8, car/near 99.2, car/rebuild-detailed 99.2, house/near 99.6, car/recoloured 86.7, box-surface/flipped-winding 96.8, chair-extras/copy-inside 85.6, chair-failures/fetch 100, chair-failures/document 100.

## Errors and refusals

| case | message the player gets | time | clear? |
|---|---|---|---|
| returns-nothing | `buildScene did not return a 3D object (a THREE.Scene, Group or Mesh).` | 196 ms | Yes. It could say "returned nothing". |
| returns-number | the same message | 201 ms | Yes. It could name what came back (a number). |
| async | the same message | 241 ms | **Partly.** The player wrote `return chair(THREE)` and is told it returned no object. It should say buildScene must not be `async` (it returned a Promise). |
| throws | `The code stopped with an error: THREE.RoundedBoxGeometry is not a constructor` | 222 ms | Yes. |
| infinite-loop | `Building the scene took longer than 8 seconds.` | 8014 ms | Yes. No hang. |
| zero-triangles | `buildScene returned a scene with no visible meshes in it.` | 189 ms | Yes. |
| huge-400k | `The scene has more than 100,000 triangles, the limit.` | 273 ms | Yes. It is a refusal, not a low score; acceptable. |
| fetch | none: graded 100, "Matches the goal." | 395 ms | The request was blocked or ignored, and the chair was graded. Acceptable, but the network call goes unmentioned. |
| document | none: graded 100 | 445 ms | The page write did not affect the views. Acceptable. |

## Feedback text
Lines that are untrue, misleading, not what a person would mention first, or awkward. Each is quoted exactly, with its attempt.
- **chair-orientation/turn15:** "The shape is very different from the goal." / "6 parts are missing, ..." / "There are 5 extra parts the goal does not have, ...". All untrue; a person says "it is turned slightly". turn90 and turn180 have the same problem: parts reported missing and extra, and no word about the turn.
- **lamp-mirror/mirrored:** "A part is missing near the top left (1 of the goal's 3 parts)." Untrue; it is mirrored.
- **chair-extras/ground-plane:** "The model is about 90% shorter than the goal, compared with its width and depth." / "8 parts are missing, ... (8 of the goal's 8 parts)." / "The model is about 498% bigger than the goal: 2 points." Untrue. The one thing to say is "remove the floor".
- **lamp/wrong-proportions:** "3 parts are missing, near the bottom, near the top right and near the top left (3 of the goal's 3 parts)." / "There are 2 extra parts the goal does not have, ..." Untrue: every part is there. The true line, "about 35% taller", comes third.
- **car/wrong-proportions:** "7 parts are missing, near the top, near the bottom back left, near the bottom back right, near the bottom back right, near the bottom front left, near the bottom front right and near the bottom front right (7 of the goal's 12 parts)." Untrue, the locations repeat, and it is far too long. "24% wider" is right in grader axes, but for a car a person says "too long".
- **car/missing-part:** "2 parts are missing, near the bottom front right and near the bottom front right (2 of the goal's 12 parts)." One wheel reads as two parts (tyre and hub) at the same repeated place. A person says "a wheel is missing".
- **lamp/missing-part:** "The model is about 11% narrower than the goal, compared with its height and depth." Never says the shade is missing.
- **house/missing-part:** "It looks slightly different from the goal in the front view." Never says the door is missing.
- **house/low-poly:** "Some of the shape is missing near the top." / "There is extra material near the top that the goal does not have." Vague; a person says "the roof is flat, not pitched".
- **chair-visibility/wireframe:** "Matches the goal." Untrue in three.js.
- **house/heavy and car/heavy:** "...curved shapes need fewer segments." The house has no curved shapes: its extra triangles come from subdivided boxes. The car's extra triangles come partly from boxes.
- **chair-placement/far-origin:** "The model sits to the right and too far forward, off by about 2965% of the goal's size: 30 points." A percentage in the thousands is unreadable; "about 30 chair-widths away" or "move it to the origin" would work.
- **chair-placement/scale100:** "The model is about 9900% bigger than the goal: 15 points." should read "100 times bigger". "The model sits too high, off by about 3986% of the goal's size: 15 points." is misleading: the chair stands on the floor at the origin. The height offset is only its box centre moving up as it grows.
- **box-surface/hollow:** "There is extra material in the middle that the goal does not have." These are inside faces nobody can see.
- **lamp/recoloured, car/recoloured, house/recoloured:** "Colours differ most in the top view." Every colour is wrong; the feedback should say so, not name a view.
- **lamp/low-poly:** "Some of the shape is missing near the bottom left." A person says "curves are too coarse (hexagon base, pyramid shade)".
- **lamp/near, car/rebuild-detailed:** "The shape differs from the goal in places." Too vague to act on.
- **house/rebuild-vague:** "The model is about 70% taller than the goal, compared with its width and depth." next to "The model is about 35% smaller than the goal". These read as contradicting each other.

## Inside the band but felt unfair
- **blocks30/merged (96):** 1 mesh against 30 earns nothing; it is charged 4 points for code 66% longer. Merging is good engineering.
- **box-surface/doubleside-flipped (95.8), chair-placement/scene-with-lights (97.4):** with tiny goals (177 bytes), a few lines of harmless code already cost 3-4 points.
- **chair-failures/fetch, document (100):** code that reaches for the network or the page gets "Matches the goal." A person would at least mention it.
- **chair-extras/copy-inside (85.6):** fair, but the feedback "curved shapes need fewer segments" misreads what happened (the chair is built twice).

## Full output of `run-scenes.mts grade`

```
lamp/goal-vs-itself total 100
lamp/heavy | band 50-65 | total 30 | works 100 eng -100 looks 100 | bonus 0 | 1165 ms | HARSH by 20
    - Uses 62 times as many triangles as the goal (47,744 against 776); curved shapes need fewer segments.
lamp/low-poly | band 68-82 | total 96.8 | works 97.9 eng 100 looks 93.6 | bonus 0 | 447 ms | LENIENT by 14.8
    - Colours differ most in the top view.
    - Some of the shape is missing near the bottom left.
lamp/missing-part | band 55-70 | total 86.7 | works 88.2 eng 100 looks 82.2 | bonus 0 | 514 ms | LENIENT by 16.7
    - The model is about 11% narrower than the goal, compared with its height and depth.
    - Colours differ most in the top view.
lamp/near | band 85-95 | total 98.7 | works 99.4 eng 100 looks 96.4 | bonus 0 | 462 ms | LENIENT by 3.7
    - Colours differ most in the three-quarter back view.
    - The shape differs from the goal in places.
lamp/rebuild-detailed | band 86-97 | total 99.8 | works 100 eng 100 looks 99.3 | bonus 0 | 446 ms | LENIENT by 2.8
    - It looks slightly different from the goal in the three-quarter back view.
lamp/rebuild-vague | band 38-52 | total 16.8 | works 0 eng 100 looks 67.8 | bonus 0 | 489 ms | HARSH by 21.2
    - The shape is very different from the goal.
    - The model is about 17% shallower (front to back) than the goal, compared with its width and height.
    - 3 parts are missing, near the bottom, near the top right and near the top left (3 of the goal's 3 parts).
    - Colours differ most in the top view.
    - The model is about 6% smaller than the goal: under 1 point.
lamp/recoloured | band 70-84 | total 89.1 | works 100 eng 100 looks 56.2 | bonus 0 | 538 ms | LENIENT by 5.1
    - Colours differ most in the top view.
lamp/wrong-proportions | band 60-75 | total 13.9 | works 0 eng 100 looks 65.1 | bonus 0 | 504 ms | HARSH by 46.1
    - The shape is very different from the goal.
    - The model is about 35% taller than the goal, compared with its width and depth.
    - 3 parts are missing, near the bottom, near the top right and near the top left (3 of the goal's 3 parts).
    - There are 2 extra parts the goal does not have, near the bottom and near the top right.
    - Colours differ most in the three-quarter back view.
    - The model sits to the right and too high, off by about 15% of the goal's size: 1 point.
car/goal-vs-itself total 100
car/heavy | band 50-65 | total 30 | works 100 eng -100 looks 100 | bonus 0 | 833 ms | HARSH by 20
    - Uses 57 times as many triangles as the goal (31,832 against 560); curved shapes need fewer segments.
car/low-poly | band 72-85 | total 99.4 | works 100 eng 100 looks 97.5 | bonus 0 | 465 ms | LENIENT by 14.4
    - Colours differ most in the front view.
car/missing-part | band 62-77 | total 85.4 | works 82.1 eng 100 looks 95.2 | bonus 0 | 470 ms | LENIENT by 8.4
    - 2 parts are missing, near the bottom front right and near the bottom front right (2 of the goal's 12 parts).
    - Colours differ most in the front view.
car/near | band 85-95 | total 99.2 | works 100 eng 100 looks 96.7 | bonus 0 | 471 ms | LENIENT by 4.2
    - Colours differ most in the top view.
car/rebuild-detailed | band 88-98 | total 99.2 | works 99 eng 100 looks 100 | bonus 0 | 452 ms | LENIENT by 1.2
    - The shape differs from the goal in places.
car/rebuild-vague | band 45-60 | total 76 | works 97.2 eng 91.1 looks 50.2 | bonus 0 | 443 ms | LENIENT by 16
    - Colours differ most in the top view.
    - The model is about 20% bigger than the goal: 5 points.
    - Uses 33% more triangles than the goal (744 against 560); curved shapes need fewer segments.
    - The model is about 11% shallower (front to back) than the goal, compared with its width and height.
    - The model sits too high, off by about 6% of the goal's size: 1 point.
car/recoloured | band 70-84 | total 86.7 | works 100 eng 100 looks 46.6 | bonus 0 | 462 ms | LENIENT by 2.7
    - Colours differ most in the three-quarter back view.
car/wrong-proportions | band 58-72 | total 29.9 | works 26.3 eng 100 looks 55.7 | bonus 0 | 469 ms | HARSH by 28.1
    - The model is about 24% wider than the goal, compared with its height and depth.
    - 7 parts are missing, near the top, near the bottom back left, near the bottom back right, near the bottom back right, near the bottom front left, near the bottom front right and near the bottom front right (7 of the goal's 12 parts).
    - There are 2 extra parts the goal does not have, near the back right and near the front right.
    - Colours differ most in the top view.
    - The model sits to the right, off by about 13% of the goal's size: 2 points.
    - The model is about 15% bigger than the goal: 1 point.
house/goal-vs-itself total 100
house/heavy | band 50-65 | total 30 | works 100 eng -100 looks 100 | bonus 0 | 540 ms | HARSH by 20
    - Uses 97 times as many triangles as the goal (7,732 against 80); curved shapes need fewer segments.
house/low-poly | band 45-62 | total 91.1 | works 90.8 eng 100 looks 91.9 | bonus 0 | 433 ms | LENIENT by 29.1
    - Some of the shape is missing near the top.
    - There is extra material near the top that the goal does not have.
    - Colours differ most in the front view.
house/missing-part | band 68-82 | total 99.6 | works 100 eng 100 looks 98.2 | bonus 0 | 417 ms | LENIENT by 17.6
    - It looks slightly different from the goal in the front view.
house/near | band 86-96 | total 99.6 | works 100 eng 100 looks 98.5 | bonus 0 | 451 ms | LENIENT by 3.6
    - It looks slightly different from the goal in the front view.
house/rebuild-detailed | band 88-98 | total 95.7 | works 100 eng 87.8 looks 100 | bonus 0 | 490 ms | ok
    - Uses 43% more meshes than the goal (10 against 7).
house/rebuild-vague | band 30-45 | total 14.5 | works 2.8 eng 100 looks 61.8 | bonus 0 | 610 ms | HARSH by 15.5
    - The shape is very different from the goal.
    - The model is about 70% taller than the goal, compared with its width and depth.
    - 6 parts are missing, near the bottom, near the bottom, near the bottom front right, near the front left, near the right and near the top right (6 of the goal's 7 parts).
    - There are 5 extra parts the goal does not have, near the bottom, near the top, near the bottom front, near the bottom front left and near the bottom front right.
    - Colours differ most in the three-quarter front view.
    - The model is about 35% smaller than the goal: 3 points.
house/recoloured | band 70-84 | total 91.7 | works 100 eng 100 looks 66.7 | bonus 0 | 432 ms | LENIENT by 7.7
    - Colours differ most in the three-quarter back view.
house/wrong-proportions | band 58-72 | total 37.9 | works 27.3 eng 100 looks 76.2 | bonus 0 | 529 ms | HARSH by 20.1
    - The model is about 37% taller than the goal, compared with its width and depth.
    - 2 parts are missing, near the bottom and near the top (2 of the goal's 7 parts).
    - There are 2 extra parts the goal does not have, near the bottom and near the top.
    - Colours differ most in the front view.
    - The model sits too high, off by about 8% of the goal's size: 1 point.
    - The model is about 7% bigger than the goal: under 1 point.
blocks30/goal-vs-itself total 100
blocks30/instanced | band 94-103 | total 100 | works 100 eng 100 looks 100 | bonus 0 | 454 ms | ok
    - Matches the goal.
blocks30/merged | band 94-103 | total 96 | works 100 eng 88.6 looks 100 | bonus 0 | 550 ms | ok
    - The code is 66% longer than the goal's (595 bytes against 358, not counting comments and spacing).
box-surface/goal-vs-itself total 100
box-surface/doubleside-flipped | band 94-100 | total 95.8 | works 100 eng 88.1 looks 100 | bonus 0 | 423 ms | ok
    - The code is 2 times as long as the goal's (354 bytes against 177, not counting comments and spacing).
box-surface/flipped-winding | band 80-94 | total 96.8 | works 100 eng 90.8 looks 100 | bonus 0 | 451 ms | LENIENT by 2.8
    - The code is 86% longer than the goal's (330 bytes against 177, not counting comments and spacing).
box-surface/hollow | band 84-96 | total 56 | works 87.2 eng -12.8 looks 100 | bonus 0 | 558 ms | HARSH by 28
    - Uses 6 times as many meshes as the goal (6 against 1).
    - There is extra material in the middle that the goal does not have.
box-surface/non-indexed | band 96-100 | total 100 | works 100 eng 100 looks 100 | bonus 0 | 449 ms | ok
    - Matches the goal.
box-surface/thin-planes | band 90-100 | total 60.5 | works 100 eng -12.8 looks 100 | bonus 0 | 405 ms | HARSH by 29.5
    - Uses 6 times as many meshes as the goal (6 against 1).
chair-extras/goal-vs-itself total 100
chair-extras/copy-inside | band 70-84 | total 85.6 | works 100 eng 59 looks 100 | bonus 0 | 510 ms | LENIENT by 1.6
    - Uses 2 times as many triangles as the goal (480 against 240); curved shapes need fewer segments.
chair-extras/ground-plane | band 58-72 | total 5 | works 0 eng 96.9 looks 28.6 | bonus 0 | 473 ms | HARSH by 53
    - The shape is very different from the goal.
    - The model is about 90% shorter than the goal, compared with its width and depth.
    - 8 parts are missing, in the middle, near the bottom back left, near the bottom back right, near the bottom front left, near the bottom front right, near the top back left, near the top back right and near the top back (8 of the goal's 8 parts).
    - There are 2 extra parts the goal does not have, in the middle and in the middle.
    - Colours differ most in the top view.
    - The model is about 498% bigger than the goal: 2 points.
chair-extras/hidden-extra | band 88-99 | total 98.8 | works 100 eng 96.5 looks 100 | bonus 0 | 405 ms | ok
    - The code is 29% longer than the goal's (1,162 bytes against 903, not counting comments and spacing).
chair-extras/lines-points | band 85-97 | total 94.3 | works 100 eng 83.8 looks 100 | bonus 0 | 426 ms | ok
    - The code is 60% longer than the goal's (1,445 bytes against 903, not counting comments and spacing).
chair-extras/opacity-zero-extra | band 86-98 | total 98 | works 100 eng 96 looks 97.7 | bonus 0 | 413 ms | ok
    - The code is 30% longer than the goal's (1,172 bytes against 903, not counting comments and spacing).
    - It looks slightly different from the goal in the top view.
chair-extras/stray-cube | band 86-97 | total 94.1 | works 93.6 eng 96.7 looks 100 | bonus 0 | 502 ms | ok
    - There is an extra part near the bottom front right that the goal does not have.
    - The code is 28% longer than the goal's (1,156 bytes against 903, not counting comments and spacing).
chair-failures/goal-vs-itself total 100
chair-failures/async | band 0-5 | total 0 | works 0 eng 0 looks 0 | bonus 0 | 241 ms | ok
    expect: Zero with a message that says buildScene must not be async (or the chair graded if the grader awaits it).
    error: buildScene did not return a 3D object (a THREE.Scene, Group or Mesh).
    - buildScene did not return a 3D object (a THREE.Scene, Group or Mesh).
chair-failures/defined-twice | band 88-100 | total 100 | works 100 eng 100 looks 100 | bonus 0 | 472 ms | ok
    expect: The chair is graded (last definition wins).
    - Matches the goal.
chair-failures/document | band 85-98 | total 100 | works 100 eng 100 looks 100 | bonus 0 | 445 ms | LENIENT by 2
    expect: The page write is harmless or refused with a clear message; never affects the views.
    - Matches the goal.
chair-failures/fetch | band 85-98 | total 100 | works 100 eng 100 looks 100 | bonus 0 | 395 ms | LENIENT by 2
    expect: The request is blocked; the chair is graded normally or the code is refused with a clear message. No network access.
    - Matches the goal.
chair-failures/huge-400k | band - | total 0 | works 0 eng 0 looks 0 | bonus 0 | 273 ms | no band
    expect: A clear size-limit refusal with zero is acceptable; if graded, a person would give 45-60. Must not hang.
    error: The scene has more than 100,000 triangles, the limit.
    - The scene has more than 100,000 triangles, the limit.
chair-failures/infinite-loop | band 0-5 | total 0 | works 0 eng 0 looks 0 | bonus 0 | 8014 ms | ok
    expect: Zero with a time-out message; no hang; under 15 seconds.
    error: Building the scene took longer than 8 seconds.
    - Building the scene took longer than 8 seconds.
chair-failures/nan-vertices | band 88-100 | total 98.4 | works 100 eng 95.5 looks 100 | bonus 0 | 406 ms | ok
    expect: The bad triangle is dropped and the chair graded, or a clear message.
    - The code is 31% longer than the goal's (1,184 bytes against 903, not counting comments and spacing).
chair-failures/returns-nothing | band 0-5 | total 0 | works 0 eng 0 looks 0 | bonus 0 | 196 ms | ok
    expect: Zero with a clear message that buildScene returned nothing; fast.
    error: buildScene did not return a 3D object (a THREE.Scene, Group or Mesh).
    - buildScene did not return a 3D object (a THREE.Scene, Group or Mesh).
chair-failures/returns-number | band 0-5 | total 0 | works 0 eng 0 looks 0 | bonus 0 | 201 ms | ok
    expect: Zero with a clear message that it returned a number, not a 3D object.
    error: buildScene did not return a 3D object (a THREE.Scene, Group or Mesh).
    - buildScene did not return a 3D object (a THREE.Scene, Group or Mesh).
chair-failures/throws | band 0-5 | total 0 | works 0 eng 0 looks 0 | bonus 0 | 222 ms | ok
    expect: Zero with the error text (RoundedBoxGeometry is not a constructor).
    error: The code stopped with an error: THREE.RoundedBoxGeometry is not a constructor
    - The code stopped with an error: THREE.RoundedBoxGeometry is not a constructor
chair-failures/zero-triangles | band 0-5 | total 0 | works 0 eng 0 looks 0 | bonus 0 | 189 ms | ok
    expect: Zero with a message that the scene is empty.
    error: buildScene returned a scene with no visible meshes in it.
    - buildScene returned a scene with no visible meshes in it.
chair-orientation/goal-vs-itself total 100
chair-orientation/turn15 | band 85-96 | total 29.8 | works 14.7 eng 100 looks 75.1 | bonus 0 | 411 ms | HARSH by 55.2
    - The shape is very different from the goal.
    - The model is about 12% shorter than the goal, compared with its width and depth.
    - 6 parts are missing, near the bottom back left, near the bottom back right, near the bottom front left, near the bottom front right, near the top back left and near the top back right (6 of the goal's 8 parts).
    - There are 5 extra parts the goal does not have, near the bottom back left, near the bottom back right, near the bottom front left, near the bottom front right and near the top back left.
    - Colours differ most in the three-quarter back view.
chair-orientation/turn180 | band 70-84 | total 47.4 | works 37.9 eng 100 looks 76.2 | bonus 0 | 412 ms | HARSH by 22.6
    - 3 parts are missing, near the top back left, near the top back right and near the top back (3 of the goal's 8 parts).
    - There are 3 extra parts the goal does not have, near the top front right, near the top front left and near the top front.
    - Colours differ most in the three-quarter front view.
chair-orientation/turn90 | band 70-84 | total 59.6 | works 54.2 eng 100 looks 75.8 | bonus 0 | 417 ms | HARSH by 10.4
    - 2 parts are missing, near the top back right and near the top back (2 of the goal's 8 parts).
    - There are 2 extra parts the goal does not have, near the top front left and near the top left.
    - Colours differ most in the three-quarter back view.
chair-placement/goal-vs-itself total 100
chair-placement/far-origin | band 88-99 | total 70 | works 100 eng 100 looks 100 | bonus 0 | 420 ms | HARSH by 18
    - The model sits to the right and too far forward, off by about 2965% of the goal's size: 30 points.
chair-placement/scale100 | band 82-95 | total 70 | works 100 eng 100 looks 100 | bonus 0 | 365 ms | HARSH by 12
    - The model is about 9900% bigger than the goal: 15 points.
    - The model sits too high, off by about 3986% of the goal's size: 15 points.
chair-placement/scene-with-lights | band 96-101 | total 97.4 | works 100 eng 92.6 looks 100 | bonus 0 | 378 ms | ok
    - The code is 38% longer than the goal's (1,248 bytes against 903, not counting comments and spacing).
chair-visibility/goal-vs-itself total 100
chair-visibility/hidden-leg | band 62-76 | total 87 | works 83.6 eng 100 looks 97.4 | bonus 0 | 408 ms | LENIENT by 11
    - A part is missing near the bottom back left (1 of the goal's 8 parts).
    - Colours differ most in the three-quarter back view.
chair-visibility/wireframe | band 55-70 | total 100 | works 100 eng 100 looks 100 | bonus 0 | 407 ms | LENIENT by 30
    - Matches the goal.
lamp-mirror/goal-vs-itself total 100
lamp-mirror/mirrored | band 80-94 | total 40.5 | works 33.3 eng 100 looks 65.1 | bonus 0 | 401 ms | HARSH by 39.5
    - A part is missing near the top left (1 of the goal's 3 parts).
    - There are 2 extra parts the goal does not have, near the top left and near the top right.
    - Colours differ most in the top view.
    - The model sits to the right, off by about 6% of the goal's size: 1 point.
order lamp/near (98.7) > lamp/missing-part (86.7): ok
order lamp/near (98.7) > lamp/wrong-proportions (13.9): ok
order lamp/near (98.7) > lamp/heavy (30): ok
order lamp/near (98.7) > lamp/recoloured (89.1): ok
order lamp/rebuild-detailed (99.8) > lamp/rebuild-vague (16.8): ok
order lamp/low-poly (96.8) > lamp/heavy (30): ok
order lamp/missing-part (86.7) > lamp/rebuild-vague (16.8): ok
order car/near (99.2) > car/missing-part (85.4): ok
order car/near (99.2) > car/wrong-proportions (29.9): ok
order car/near (99.2) > car/heavy (30): ok
order car/near (99.2) > car/recoloured (86.7): ok
order car/rebuild-detailed (99.2) > car/rebuild-vague (76): ok
order car/low-poly (99.4) > car/heavy (30): ok
order house/near (99.6) > house/missing-part (99.6): BROKEN
order house/near (99.6) > house/wrong-proportions (37.9): ok
order house/near (99.6) > house/heavy (30): ok
order house/near (99.6) > house/recoloured (91.7): ok
order house/rebuild-detailed (95.7) > house/rebuild-vague (14.5): ok
order house/missing-part (99.6) > house/low-poly (91.1): ok
order house/low-poly (91.1) > house/rebuild-vague (14.5): ok
order chair-orientation/turn15 (29.8) > chair-orientation/turn90 (59.6): BROKEN
order chair-extras/stray-cube (94.1) > chair-extras/ground-plane (5): ok
order chair-extras/hidden-extra (98.8) > chair-extras/copy-inside (85.6): ok
order box-surface/non-indexed (100) > box-surface/hollow (56): ok
order chair-placement/scene-with-lights (97.4) > chair-placement/scale100 (70): ok
```
