# 3D grader review (grader 0.7.0), new goals and faults

Five new goals in rising difficulty: mug (mostly curved), rocket (four-fold symmetric), snowman (13 parts, thin arms, tiny eyes and buttons), bookshelf (15 parts, 8 repeated books), bicycle (thin and spindly). Each has 8 attempts plus 8 cheats in all: 47 banded cases. Bands are in `bands.json`. I wrote them after looking at every view (`calibration/out/review/scenes/sheet-*.png`) and before grading anything, and did not change them afterwards. Run with `npx tsx calibration/review/scenes/run.ts`. The graded, lined-up views are in `calibration/out/review/scenes/graded/`.

## Verdict

**NOT SATISFIED.**

1. Only 21 of 47 scores land in the band a fair boss would give, and the misses are large: 14.3 points outside on average, 46 at worst. Most misses are harsh, on the most common kinds of model output: clumsy proportions, a part posed or angled differently, a small detail that rides on a part that moved.
2. A snowman that is exactly right but faces backwards scores 82, with five parts it really has reported as "missing". A blocky slab version of the bicycle scores 74, above the honest crude rebuild.
3. The feedback often names parts as missing when they are present but moved, turned or posed. It repeats a stock "about 40% too short" that is often untrue, so a player would rewrite the wrong part of their prompt.

## Numbers

- In band: **21/47**. Outside: 26 cases, 18 harsh and 8 lenient. Mean distance outside: **14.3**. Worst: **46.3** (x8_bicycle_boxes, lenient) and **45.7** (m3_mediocre, harsh).
- Order checks held: **30/34**. Broken: mug mediocre < poor; snowman slips < sunk; bookshelf block > empty frame; bicycle boxes > poor rebuild.
- Cheats that worked: **2 of 8 clearly** (bicycle boxes 74.3; bookshelf block 39.0, which beats the honest frame), **1 marginal** (rocket billboard 29.4, 7 over its band). The voxel cube cloud was stopped only by engineering: works was 89.4.
- Each goal against itself: exactly 100 (5/5). Every attempt graded twice gave the same total and the same feedback (47/47). No grade took over 5 s (slowest 2.0 s).

## Problems

Ranked by how unfair they would feel to a player.

### 1. Small details count as missing when the part they sit on moves, or when the model is turned (common)

- **Cases**
  - s2_good_slips: band 80-92, scored 64.4 (works 59.5, parts 8/13). The head is 0.15 high and the hat, eyes and nose moved with it. Feedback: "5 parts are missing: the brim, 2 button parts, the eye l and elsewhere".
  - Snowman turn sweep: 90° scores 90.2, then 105° drops to 74.3 (a cliff), then it climbs back to 82.3 at 180°. Every step from 105° on reports the eyes and buttons "missing".
  - Rocket turned 45° to 180°: "The window is missing" every time, though it is there.
  - Hat moved 0.1 sideways (4% of the height): 83.9, "The brim is missing".
  - Head scaled ×1.15: "2 parts are missing: the eye l and the eye r".
- **What a person sees:** the same model, with a slightly higher head or facing another way. Nothing is missing.
- **Mechanism**
  - Parts that sit flush on another part (eyes, buttons, window, band, coffee, thin brim) are never searched for elsewhere: `displaced.ts` `findDisplaced` filters out `parts[i].flush`.
  - `score.ts` `colorTest` looks only at the part's original place, so once its carrier moves the part scores 0 presence.
  - `SCENE_PARTS.power = 3` then makes each such loss cost more than its share.
  - For a body that is nearly the same all the way round (snowman, rocket), `align.ts` `searchPose` fits solids only, and `turnBias` prefers turn 0. A model facing backwards is therefore lined up with its face at the back.

### 2. A part that is present but turned or posed differently is "missing" (common)

- **Cases**
  - s6_arms_raised: band 82-93, scored 61.1. "4 parts are missing: the arm l, the arm r, the eye l and elsewhere".
  - r6_three_fins: band 72-86, scored 56.3, with 2 fins "missing" and a 43° turn charged.
  - k6_bar_rotated: 84.8, inside its band only by luck. The feedback "The handlebar is missing" is untrue.
- **What a person sees:** arms up instead of out; the fins at another angle; the handlebar the wrong way round.
- **Mechanism:** the displaced-part search (`displaced.ts` `findDisplaced`, `Placement` = shift + stretch per axis) tries no rotation. Any part turned in place falls to "missing" at power 3.

### 3. Clumsy proportions collapse instead of costing a little (common)

- **Cases**
  - m3_mediocre: band 58-72, scored 12.3 (works 2.9), below m4_poor at 26.5.
  - m8_half_height: band 38-53, scored 17.5.
  - b8_shallow: band 55-70, scored 38.9.
  - b5_mediocre: band 50-65, scored 31.2.
  - s3_mediocre: band 58-72, scored 40.0.
- **What a person sees:** the right object with the right parts, badly proportioned. The scale says that belongs at 50 to 70.
- **Mechanism:** the whole model is fitted at once (`align.ts` `searchPose`, which starts from the ratio of the box diagonals). Parts that then sit beyond the soft edge are searched only within a 0.6 to 1.7 stretch (`SCENE_DISPLACED`). Flush parts are not searched at all (see problem 1). Everything not found is "missing", and the cube power turns two or three such parts into works near 0.

### 4. One large, thin part missing costs far more than a boss would charge (common)

- **Cases**
  - m7_no_saucer: band 68-82, scored 39.4 (works 36.3).
  - b2_five_books: band 78-90, scored 67.9.
  - bookshelf with one book removed: 86.3, a 13.7-point drop, and the feedback never names the book.
- **What a person sees:** a perfect mug with no saucer under it.
- **Mechanism**
  - A part's weight is its bounding-box diagonal (`config.ts` `SCENE_PARTS`), so a flat saucer is the "biggest" part (about a third of the weight). Then `share³` applies.
  - On top of that, the line-up drifts to fill the goal's box (scale 0.95, off 0.10).
  - The correction in `score.ts` `scoreScene` runs one round and does either a re-shift *or* a rescale, never both.

### 5. Slabs and flattened shapes pass for thin objects (occasional, and exploitable)

- **Cases**
  - x8_bicycle_boxes: band 10-28, scored **74.3**, with 12/12 parts "present".
  - k8_flattened: band 50-66, scored 82.5.
  - k3_mediocre: band 45-62, scored 74.1.
  - k5_disc_wheels: band 60-75, scored 80.6.
- **What a person sees:** square black slabs for wheels and one red slab for the frame. Or a bicycle that is a flat sheet from above.
- **Mechanism:** a part is "present" when the submission's skin lies within the soft edge of the part's cells (`score.ts` `evaluate`, `inPlaceShape` via `solid.ts` `softCredit`). The edge reaches zero only at `SCENE_SHAPE.softZeroShare` = 8% of the goal's longest side. For the bicycle that is about 0.15, six times a tube's thickness, so any slab laid over thin tubes makes every tube present. Extra material only lowers the shape match a little (90.2).

### 6. Many segments on tall parts make the shape vanish (occasional)

- **Case:** rocket with segment counts multiplied. ×8 scores 47.5, then ×16 drops to **12.6**: works 16, "3 parts are missing", a 45° turn. This happens at only 8,720 triangles, far under the 100,000 cap.
- **What a person sees:** a perfect, smooth rocket.
- **Mechanism** (my reading of the code and the probe, not traced step by step): `solid.ts` `sampleTriangles` sets the number of samples per triangle from the longest edge squared, not the area. Long thin slivers, such as the sides of a 512-segment cylinder 2 units tall, cost about 4,500 samples each. That spends the scene's shared `maxSamplesPerScene` (4M) budget, and later triangles are never sampled. Tall cylinders with 128 or more segments in real model output would hit the same problem.

### 7. The engineering curve is steep at the low end (by design, worth a look)

Twice the triangles costs 13.7 points (86.3), and four times costs 40.5 (59.5). The owner asked for bloat to be docked heavily, but a boss would hardly notice ×2 on a 560-triangle model.

## Cheats

| Cheat | Band | Total | Result |
|---|---|---|---|
| x1 mug outline extruded into a slab | 8-25 | 24.3 | failed (just in band) |
| x2 rocket made of 666 cubes | 20-40 | 33.1 | failed only on engineering; works 89.4, shape 100 |
| x3 rocket crossed cardboard cut-outs | 5-22 | 29.4 | marginal (7 over) |
| x4 snowman as one box | 0-14 | 11.5 | failed |
| x5 snowman crossed cut-outs | 8-25 | 9.2 | failed |
| x6 bookshelf as one box | 10-28 | **39.0** | **worked**: beats the honest empty frame (19.3) |
| x7 bookshelf box with books painted on in vertex colours | 15-32 | 22.5 | failed (engineering, and the shape is a box) |
| x8 bicycle from coloured boxes | 10-28 | **74.3** | **worked**: beats k4_poor (34.9) and nearly k3_mediocre (74.1) |

Invisible geometry, back-facing, colour-write and draw-range tricks are all filtered in `three-runner.ts`, so I did not spend cases on them.

## Consistency

- **Remove parts, snowman:** −armR 80.0; −armR, nose 79.0 (the nose costs 1 point and is never mentioned); −crown as well 48.0. The third step costs **31 points**, because removing the crown also makes the brim and an eye "missing". The fall is not sensible.
- **Remove books:** −1 book 86.3, −2 76.8, −3 72.3. It falls each time, but the first step is the largest, and the first missing book is not named.
- **Move the hat sideways** (snowman height 2.67), at 0.05, 0.1, 0.2, 0.4, 0.6, 0.9: scores 98.9, 83.9, 64.5, 58.8, 53.8, 47.6.
  - It falls every time, with no jump back up.
  - The labels come in the wrong order. The brim is "missing" from 0.1 (4%) onwards, and the crown is first reported as moved ("sits too far right") only at 0.6.
- **Move the nose up** (rocket height 3.0), at 0.05, 0.1, 0.2, 0.4, 0.6: scores 98.0, 91.5, 83.8, 76.3, 55.9.
  - The fall is steady.
  - At 0.6 it says "The band is missing", which is the wrong part, and charges a 17% size change.
- **Scale the head**, at 0.5, 0.7, 0.85, 1.15, 1.4, 2: scores 88.6, 93.6, 99.4, 92.3, 77.3, 27.3.
  - The curve is lopsided: a head 15% small is free, and half size still gets 88.6.
  - At ×2 there is a cliff, to 7 parts "missing".
- **Triangles** at ×1, 2, 4, 8, 16, 32, 64: scores 100, 86.3, 59.5, 47.5, **12.6**, 10.0, 8.1.
  - The score reaches the engineering floor by ×8 and would level off at 47.5.
  - From ×16 it collapses instead (problem 6).
- **Turning the rocket** in 15° steps: 100, 98.4, 96.3, 87.1, 88.4, 90.3, 91.8, 90.3, 88.4, 87.3, 88.5, 90.5, 92.0.
  - The saw-tooth is acceptable: the aligner finds the nearest fin position.
  - But "window missing" appears at every angle of 45° or more.
- **Turning the snowman** in 15° steps: 100, 98.0, 95.6, 93.6, 92.4, 91.3, 90.2, **74.3**, 74.8, 76.9, 78.2, 79.1, 82.3.
  - It is smooth up to 90°.
  - Then there is a 16-point cliff and the curve rises again (problem 1).

## Feedback text

Untrue or misleading lines, quoted exactly:

**Stock "about 40% too short"**

This is the stretch search's limit, printed as if it were measured.
- "The nose is about 40% too short." (r7_no_nose, where the nose is absent; r3_mediocre, where the nose is 43% too *tall*; x3)
- "The nozzle is about 40% too short." (r4_poor, where there is no nozzle)
- "The crown is about 40% too short." (s4_poor, which has no hat; s7_sunk, where the crown is the same size; snowman −crown probe, where the crown was removed)
- "The head is about 40% too short." (s8_floating, where the head is the right size)
- "The arm l is about 40% too short." (s8_floating, where the arms are the right size; s3, where they are 25% short)
- "The body is about 40% too short." (m3, where the body is 23% short; m8, where it is 50% short)

**Present parts reported missing**
- "2 parts are missing: the band and the window" (r7_no_nose; both are there, and the nose, which really is missing, is not named)
- "5 parts are missing: the brim, 2 button parts, the eye l and elsewhere" (s2)
- "4 parts are missing: the arm l, the arm r, the eye l and elsewhere" (s6, where the arms are raised)
- "The handlebar is missing (1 of the goal's 12 parts)." (k6, where it is turned; k8, where it is flattened)
- "The window is missing (1 of the goal's 9 parts)." (rocket turned 45° to 180°, and r5)

**Missing parts described as wrongly shaped**
- "The back does not match the goal's shape." (b4, where the back is missing)
- "The shelf does not match the goal's shape." (b7, where the shelf is missing)

**Wrong diagnosis**
- "Curved parts look faceted: there are hard edges and flat bands where the goal is smooth; use more segments." (b6_poor, a box frame with no curves; x5)
- "Curves are too coarse: curved parts need more segments to match the goal." (x8, which is boxes; k5, which uses 48 segments, the same as the goal)
- "The surfaces are lit differently from the goal's (faces turned or shown from the other side), most in the front view." (k5: the real fault is solid discs instead of tyres)
- "The model is a mirror image of the goal: 4 points." (x6 and x7, a symmetric box)
- "The model is about 60% bigger than the goal: 1 point." (x4, a box exactly the goal's size)
- "The model stands about 10% of the goal's size from where the goal stands (to the left): 1 point." (snowman −armR: nothing moved; the box shrank)

**Colour lines about unchanged parts**
- "Colours differ from the goal: 3 parts are a different colour, the chain stay, the seat stay and the fork." (k5, where these parts did not change)
- "Colours differ from the goal: 3 parts are a slightly different colour, the top tube, the chainring and the front wheel." (k6)
- "Colours differ from the goal: the brim is a different colour." (s8)
- "Colours differ from the goal: the coffee is a different colour." (m4, which has no coffee at all)

**Bad English**
- "the eye l", "the arm r", "the side l" (`tidyName` keeps the L/R suffix as a word)
- "... and elsewhere (5 of the goal's 13 parts)"

**Not what a person would say first**
- The bookshelf with one book removed gets only "Some of the goal's edges and corners are missing or in other places, most in the top view."
- Nothing ever says "the arms are raised", "the bike is flat", "the wheels are solid", or "the frame is a solid slab".

**Overall:** naming parts is the right idea, and on simple faults it helps ("The window is missing", "The handle sits too far right", "proportions are off: about 10% taller"). But on the commonest faults it names the wrong part or the wrong fault. A player following it would fix things that are not broken.

## What is good

- Determinism is complete: self-grades are exactly 100, repeats are identical, and every grade takes under 2.1 s.
- Excellent fresh rebuilds score 98.5 to 100.2, and the only bonus went to the leaner, identical bookshelf (0.4).
- Small honest differences are judged well: books swapped 97.7, fins at 45° 86.9, handle on the other side 90.0 (a fair 10-point mirror charge), good slips on the rocket and bicycle near or in band.
- Bloat is docked as the owner asked: ×24 triangles scored 47.4, with a clear, correct line.
- Most cheats fail: blocks, cut-outs, extruded outlines, painted boxes, and invisible or back-facing tricks.
- The rocket turn sweep handles four-fold symmetry sensibly, apart from the window.
- Engineering never rewards slop, and the "worst measure wins" rule shows clearly in the details.

## Runner output (full)

```
# Review run

## mug: goal 1600 triangles, 4 meshes, 898 bytes
self: total 100.0 | works 100.0 eng 100.0 looks 100.0 bonus 0.0 | shape 100 parts 4/4 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]  (exactly 100: ok)

mug/m1_excellent  band 93-103  ok  837 ms
  fresh rebuild: lathe body, circle for the coffee, fewer segments, near-identical sizes and colours
  total 99.1 | works 100.0 eng 100.0 looks 96.4 bonus 0.0 | shape 100 parts 4/4 miss 0 extra 0 credit 100 scale 0.98 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - Some of the goal's edges and corners are missing or in other places, most in the top view.

mug/m2_good_slips  band 82-94  HARSH by 2.7  880 ms
  fresh rebuild with slips: straight-sided body a little taller, handle a little small, coffee too light, saucer not tapered
  total 79.3 | works 85.8 eng 100.0 looks 59.6 bonus 0.0 | shape 98.3 parts 4/4 miss 0 extra 0 credit 87.9 scale 1.04 off 0.01 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The model's proportions are off: about 10% taller than the goal, compared with its width and depth.
  - Some of the goal's edges and corners are missing or in other places, most in the front view.

mug/m3_mediocre  band 58-72  HARSH by 45.7  2014 ms
  fresh rebuild, right parts, clumsy proportions: squat wide body, chunky full-ring handle, small saucer
  total 12.3 | works 2.9 eng 100.0 looks 43.5 bonus 0.0 | shape 63.9 parts 2/4 miss 2 extra 0 credit 5.9 scale 1.29 off 0.13 turn 0 factor 0.95 eng[tri 100 mesh 100 src 100]
  - The shape is very different from the goal.
  - 2 parts are missing: the saucer and the coffee (2 of the goal's 4 parts).
  - The body is about 40% too short.

mug/m4_poor  band 36-50  HARSH by 9.5  1103 ms
  right idea, few parts: a blue cylinder and a box for a handle, no saucer, no coffee
  total 26.5 | works 24.4 eng 100.0 looks 33.5 bonus 0.0 | shape 84.1 parts 3/4 miss 1 extra 0 credit 31.5 scale 0.99 off 0.06 turn 0 factor 0.99 eng[tri 100 mesh 100 src 100]
  - The shape is very different from the goal.
  - The saucer is missing (1 of the goal's 4 parts).
  - Colours differ from the goal: the coffee is a different colour.

mug/m5_handle_left  band 87-100  ok  835 ms
  the goal exactly, but the handle on the left: the same mug turned half round
  total 90.0 | works 100.0 eng 100.0 looks 100.0 bonus 0.0 | shape 100 parts 4/4 miss 0 extra 0 credit 100 scale 1.00 off 0.02 turn 0 MIRROR factor 0.90 eng[tri 100 mesh 100 src 100]
  - The model is a mirror image of the goal: 10 points.

mug/m6_handle_floating  band 70-84  ok  951 ms
  the goal, but the handle floats 0.25 away from the body
  total 77.8 | works 86.3 eng 100.0 looks 55.4 bonus 0.0 | shape 98.6 parts 4/4 miss 0 extra 0 credit 88.1 scale 1.04 off 0.08 turn 0 factor 0.99 eng[tri 100 mesh 100 src 100]
  - The handle sits too far right, by about 11% of the model's size.
  - The model stands about 8% of the goal's size from where the goal stands (to the right): 1 point.

mug/m7_no_saucer  band 68-82  HARSH by 28.6  1149 ms
  the goal without the saucer (the widest part)
  total 39.4 | works 36.3 eng 100.0 looks 51.1 bonus 0.0 | shape 83.8 parts 3/4 miss 1 extra 0 credit 47.3 scale 0.95 off 0.10 turn 1 factor 0.98 eng[tri 100 mesh 100 src 100]
  - The saucer is missing (1 of the goal's 4 parts).
  - The model stands about 10% of the goal's size from where the goal stands (to the right and too high): 1 point.

mug/m8_half_height  band 38-53  HARSH by 20.5  1534 ms
  the goal squashed to half its height (handle too)
  total 17.5 | works 12.7 eng 100.0 looks 32.1 bonus 0.0 | shape 82.3 parts 2/4 miss 2 extra 0 credit 16.9 scale 0.94 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The shape is very different from the goal.
  - 2 parts are missing: the coffee and the handle (2 of the goal's 4 parts).
  - The body is about 40% too short.

mug/x1_mug_extruded_outline  band 8-25  ok  1345 ms
  CHEAT: the front outline (saucer, body, handle) extruded into a slab as deep as the mug
  total 24.3 | works 22.7 eng 100.0 looks 32.3 bonus 0.0 | shape 85.5 parts 3/4 miss 1 extra 0 credit 28.7 scale 1.10 off 0.00 turn 26 factor 0.97 eng[tri 100 mesh 100 src 100]
  - The shape is very different from the goal.
  - The coffee is missing (1 of the goal's 4 parts).
  - The saucer is about 40% too short.
  - The body is about 16% too short.
  - The model is turned about 26 degrees from the goal's facing: 1 point.

## rocket: goal 560 triangles, 9 meshes, 1362 bytes
self: total 100.0 | works 100.0 eng 100.0 looks 100.0 bonus 0.0 | shape 100 parts 9/9 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]  (exactly 100: ok)

rocket/r1_excellent  band 93-103  ok  527 ms
  fresh rebuild with a helper, 24 segments, sizes within a few percent
  total 99.1 | works 100.0 eng 100.0 looks 96.5 bonus 0.0 | shape 100 parts 9/9 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The outline differs from the goal, most in the top view.

rocket/r2_good_slips  band 80-92  ok  569 ms
  the goal with slips: nose a little short with a small gap above the body, band orange, window missing
  total 88.3 | works 88.9 eng 100.0 looks 86.5 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 88.9 scale 0.98 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The window is missing (1 of the goal's 9 parts).
  - The surfaces show edges and shading the goal does not have, most in the front view.
  - Colours differ from the goal: the band is a different colour.

rocket/r3_mediocre  band 50-65  LENIENT by 1.0  675 ms
  fresh rebuild, clumsy: fat short body, tall nose, small fins, no band or window
  total 66.0 | works 76.1 eng 100.0 looks 36.0 bonus 0.0 | shape 95.5 parts 9/9 miss 0 extra 0 credit 81.3 scale 1.05 off 0.02 turn 4 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The nose is about 40% too short.
  - Colours differ from the goal: one part is a slightly different colour.

rocket/r4_poor  band 34-50  ok  734 ms
  right idea, few parts: a white cylinder and a red cone, no fins, nozzle, band or window
  total 38.6 | works 31.6 eng 100.0 looks 67.5 bonus 0.0 | shape 96.5 parts 7/9 miss 2 extra 0 credit 33.3 scale 0.94 off 0.02 turn 45 factor 0.95 eng[tri 100 mesh 100 src 100]
  - 2 parts are missing: the band and the window (2 of the goal's 9 parts).
  - The nozzle is about 40% too short.
  - The model is turned about 45 degrees from the goal's facing: 2 points.

rocket/r5_fins_45  band 86-97  ok  584 ms
  the goal, but the fins turned 45 degrees about the body (window still faces the front)
  total 86.9 | works 89.4 eng 100.0 looks 96.9 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 0.99 off 0.00 turn 45 factor 0.95 eng[tri 100 mesh 100 src 100]
  - The window is missing (1 of the goal's 9 parts).
  - The model is turned about 45 degrees from the goal's facing: 4 points.

rocket/r6_three_fins  band 72-86  HARSH by 15.7  839 ms
  the goal with three fins at 120 degrees instead of four
  total 56.3 | works 60.0 eng 100.0 looks 56.7 bonus 0.0 | shape 96.3 parts 6/9 miss 3 extra 0 credit 63.3 scale 1.02 off 0.05 turn 43 factor 0.95 eng[tri 100 mesh 100 src 100]
  - 3 parts are missing: the window and 2 fin parts (3 of the goal's 9 parts).
  - The model is turned about 43 degrees from the goal's facing: 3 points.

rocket/r7_no_nose  band 62-78  HARSH by 6.1  748 ms
  the goal without the nose cone: a flat-topped tube
  total 55.9 | works 54.9 eng 100.0 looks 60.0 bonus 0.0 | shape 98.6 parts 7/9 miss 2 extra 0 credit 56 scale 0.93 off 0.00 turn 2 factor 1.00 eng[tri 100 mesh 100 src 100]
  - 2 parts are missing: the band and the window (2 of the goal's 9 parts).
  - The nose is about 40% too short.

rocket/x2_rocket_cube_cloud  band 20-40  ok  726 ms
  CHEAT: ~700 small cubes filling the rocket volume, coloured by region
  total 33.1 | works 89.4 eng -50.0 looks 52.0 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 0.99 off 0.02 turn 0 factor 1.00 eng[tri -100 mesh -100 src 100]
  - Uses 14 times as many triangles as the goal (7,992 against 560); the extra triangles are on flat faces, which need only a few each.
  - The surfaces show edges and shading the goal does not have, most in the three-quarter front view.
  - The window is missing (1 of the goal's 9 parts).
  - Colours differ from the goal: 2 parts are a slightly different colour, the body and the fin.

rocket/x3_rocket_billboard  band 5-22  LENIENT by 7.4  1115 ms
  CHEAT: two crossed flat cut-outs of the rocket outline (fins included), like a cardboard model
  total 29.4 | works 30.5 eng 100.0 looks 26.8 bonus 0.0 | shape 82.3 parts 7/9 miss 2 extra 0 credit 40.9 scale 0.90 off 0.00 turn 0 factor 0.99 eng[tri 100 mesh 100 src 100]
  - 2 parts are missing: the band and the window (2 of the goal's 9 parts).
  - The body is about 40% too narrow.
  - The nose is about 40% too short.
  - The colours are different throughout.

## snowman: goal 4072 triangles, 13 meshes, 1654 bytes
self: total 100.0 | works 100.0 eng 100.0 looks 100.0 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]  (exactly 100: ok)

snowman/s1_excellent  band 93-103  ok  571 ms
  fresh rebuild: loops, hat as a group, radii within 0.01, all small parts present
  total 98.5 | works 99.3 eng 100.0 looks 96.0 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 99.3 scale 0.99 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The outline differs from the goal, most in the front view.

snowman/s2_good_slips  band 80-92  HARSH by 15.6  793 ms
  fresh rebuild with slips: arms short (0.6), head sits 0.15 high with a small gap, nose red, two buttons
  total 64.4 | works 59.5 eng 100.0 looks 79.3 bonus 0.0 | shape 99.4 parts 8/13 miss 5 extra 0 credit 60 scale 1.01 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - 5 parts are missing: the brim, 2 button parts, the eye l and elsewhere (5 of the goal's 13 parts).
  - The arm l is about 40% too short.
  - The arm r is about 40% too short.

snowman/s3_mediocre  band 58-72  HARSH by 18.0  1517 ms
  fresh rebuild, clumsy: three nearly equal balls, oversized hat, arms straight out, no eyes
  total 40.0 | works 35.7 eng 100.0 looks 53.1 bonus 0.0 | shape 85.3 parts 10/13 miss 3 extra 0 credit 45.3 scale 1.06 off 0.03 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - 3 parts are missing: the button, the eye l and the eye r (3 of the goal's 13 parts).
  - The arm r is about 40% too short.
  - The arm l is about 40% too short.

snowman/s4_poor  band 35-50  ok  1038 ms
  right idea, few parts: three white balls and a carrot nose; no hat, arms, eyes or buttons
  total 35.0 | works 25.2 eng 100.0 looks 65.9 bonus 0.0 | shape 97.1 parts 5/13 miss 8 extra 0 credit 26.3 scale 0.92 off 0.00 turn 7 factor 0.99 eng[tri 100 mesh 100 src 100]
  - 8 parts are missing: the brim, the arm l, the arm r and elsewhere (8 of the goal's 13 parts).
  - The crown is about 40% too short.

snowman/s5_hat_beside  band 68-82  HARSH by 15.8  998 ms
  the goal, but the hat floats beside the head instead of on it
  total 52.2 | works 50.3 eng 100.0 looks 57.7 bonus 0.0 | shape 91.9 parts 10/13 miss 3 extra 0 credit 56.9 scale 0.99 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - 3 parts are missing: the brim, the crown and the eye l (3 of the goal's 13 parts).

snowman/s6_arms_raised  band 82-93  HARSH by 20.9  800 ms
  the goal posed differently: both arms raised nearly straight up
  total 61.1 | works 58.3 eng 100.0 looks 69.4 bonus 0.0 | shape 97.3 parts 9/13 miss 4 extra 0 credit 60.6 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - 4 parts are missing: the arm l, the arm r, the eye l and elsewhere (4 of the goal's 13 parts).

snowman/s7_sunk  band 60-75  ok  781 ms
  the goal with the balls sunk deep into each other (middle 0.2 lower, head 0.33 lower), everything on them follows
  total 67.6 | works 68.7 eng 100.0 looks 64.4 bonus 0.0 | shape 98 parts 10/13 miss 3 extra 0 credit 70.7 scale 0.95 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - 3 parts are missing: 3 button parts (3 of the goal's 13 parts).
  - The nose is about 40% too short.
  - The crown is about 40% too short.

snowman/s8_floating  band 62-78  HARSH by 13.6  1032 ms
  the goal with the balls floating apart (gaps of about 0.15), everything on them follows
  total 48.4 | works 48.6 eng 100.0 looks 49.1 bonus 0.0 | shape 90.2 parts 9/13 miss 4 extra 0 credit 56.5 scale 1.10 off 0.00 turn 0 factor 0.99 eng[tri 100 mesh 100 src 100]
  - 4 parts are missing: the nose, the button, the eye l and elsewhere (4 of the goal's 13 parts).
  - The head is about 40% too short.
  - The arm l is about 40% too short.
  - Colours differ from the goal: the brim is a different colour.

snowman/x4_snowman_block  band 0-14  ok  1488 ms
  CHEAT: one white box the size of the snowman's bounding box
  total 11.5 | works 4.0 eng 100.0 looks 38.7 bonus 0.0 | shape 64.5 parts 3/13 miss 10 extra 0 credit 8.1 scale 1.60 off 0.00 turn 27 factor 0.91 eng[tri 100 mesh 100 src 100]
  - The shape is very different from the goal.
  - 10 parts are missing: the head, the brim, the crown and elsewhere (10 of the goal's 13 parts).
  - The arm r is about 40% too short.
  - The middle is about 40% too short.
  - The model is about 60% bigger than the goal: 1 point.

snowman/x5_snowman_cutout  band 8-25  ok  1753 ms
  CHEAT: two crossed flat cut-outs (discs and hat rectangles) plus a flat strip for arms
  total 9.2 | works 3.4 eng 100.0 looks 28.9 bonus 0.0 | shape 53.1 parts 6/13 miss 7 extra 0 credit 10.5 scale 0.64 off 0.00 turn 0 factor 0.94 eng[tri 100 mesh 100 src 100]
  - The shape is very different from the goal.
  - 7 parts are missing: the base, the brim, 3 button parts and elsewhere (7 of the goal's 13 parts).
  - The crown is about 40% too short.
  - The head is about 40% too short.
  - Curved parts look faceted: there are hard edges and flat bands where the goal is smooth; use more segments.
  - The model is about 36% smaller than the goal: 1 point.

## bookshelf: goal 180 triangles, 15 meshes, 1153 bytes
self: total 100.0 | works 100.0 eng 100.0 looks 100.0 bonus 0.0 | shape 100 parts 15/15 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]  (exactly 100: ok)

bookshelf/b1_excellent  band 93-103  ok  618 ms
  fresh rebuild with loops; book heights and depths within 0.01
  total 100.2 | works 99.8 eng 100.0 looks 99.9 bonus 0.4 | shape 100 parts 15/15 miss 0 extra 0 credit 99.8 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - Matches the goal exactly while using about 2% less on average: 0.4 bonus points.

bookshelf/b2_five_books  band 78-90  HARSH by 10.1  775 ms
  the goal with five books instead of eight (green, yellow and orange left out, gaps where they were)
  total 67.9 | works 74.2 eng 100.0 looks 49.0 bonus 0.0 | shape 99.4 parts 12/15 miss 3 extra 0 credit 74.9 scale 0.97 off 0.00 turn 1 factor 1.00 eng[tri 100 mesh 100 src 100]
  - 3 parts are missing: 3 book parts (3 of the goal's 15 parts).

bookshelf/b3_books_swapped  band 88-98  ok  619 ms
  the goal with the red and yellow books swapped (heights 0.42 and 0.44)
  total 97.7 | works 98.5 eng 100.0 looks 95.1 bonus 0.0 | shape 100 parts 15/15 miss 0 extra 0 credit 98.5 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - Colours differ from the goal: 2 parts are a different colour, 2 book parts.

bookshelf/b4_no_back  band 68-82  HARSH by 3.8  920 ms
  the goal without the back panel (seen through from the front, missing from the back)
  total 64.2 | works 71.8 eng 100.0 looks 41.2 bonus 0.0 | shape 90.9 parts 15/15 miss 0 extra 0 credit 82.5 scale 1.04 off 0.01 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The back does not match the goal's shape.
  - The surfaces show edges and shading the goal does not have, most in the three-quarter back view.

bookshelf/b5_mediocre  band 50-65  HARSH by 18.8  1047 ms
  fresh rebuild, clumsy: deep thick boards, shelves at the wrong heights, eight identical brown books all on the bottom
  total 31.2 | works 31.4 eng 100.0 looks 30.4 bonus 0.0 | shape 89.4 parts 10/15 miss 5 extra 0 credit 37 scale 1.03 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - 5 parts are missing: 5 book parts (5 of the goal's 15 parts).
  - The book is about 40% too short.
  - The shelf is about 27% too short.

bookshelf/b6_poor  band 25-42  HARSH by 5.7  690 ms
  right idea, few parts: an empty frame (sides, top, bottom); no shelves, back or books
  total 19.3 | works 10.4 eng 100.0 looks 45.9 bonus 0.0 | shape 70.6 parts 4/15 miss 11 extra 0 credit 18 scale 1.04 off 0.01 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The shape is very different from the goal.
  - 11 parts are missing: 2 shelf parts, the back and 8 book parts (11 of the goal's 15 parts).
  - Curved parts look faceted: there are hard edges and flat bands where the goal is smooth; use more segments.

bookshelf/b7_good_slips  band 76-88  ok  764 ms
  the goal with slips: upper shelf missing, two book colours off, top board 0.03 above the sides
  total 77.6 | works 85.2 eng 100.0 looks 54.7 bonus 0.0 | shape 97.6 parts 15/15 miss 0 extra 0 credit 88.2 scale 1.00 off 0.00 turn 1 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The shelf does not match the goal's shape.
  - Some of the goal's edges and corners are missing or in other places, most in the top view.

bookshelf/b8_shallow  band 55-70  HARSH by 16.1  1330 ms
  the goal with the right front but less than half the depth (0.15 instead of 0.35), books shallower too
  total 38.9 | works 35.3 eng 100.0 looks 49.9 bonus 0.0 | shape 91.3 parts 13/15 miss 2 extra 0 credit 40.2 scale 0.95 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - 2 parts are missing: 2 book parts (2 of the goal's 15 parts).
  - The top is about 40% too shallow.
  - The side l is about 40% too shallow.

bookshelf/x6_bookshelf_block  band 10-28  LENIENT by 11.0  986 ms
  CHEAT: one wood-coloured box the size of the bookshelf
  total 39.0 | works 34.3 eng 100.0 looks 70.4 bonus 0.0 | shape 91.1 parts 9/15 miss 6 extra 0 credit 39.2 scale 1.04 off 0.00 turn 2 MIRROR factor 0.90 eng[tri 100 mesh 100 src 100]
  - 6 parts are missing: 6 book parts (6 of the goal's 15 parts).
  - The shelf is about 40% too short.
  - The shelf is about 40% too shallow.
  - The model is a mirror image of the goal: 4 points.

bookshelf/x7_bookshelf_painted_block  band 15-32  ok  1407 ms
  CHEAT: the same box with the shelves, opening and books painted on its front with vertex colours
  total 22.5 | works 33.6 eng -50.0 looks 70.0 bonus 0.0 | shape 91.1 parts 9/15 miss 6 extra 0 credit 38.4 scale 1.04 off 0.00 turn 2 MIRROR factor 0.90 eng[tri -100 mesh 100 src 100]
  - 6 parts are missing: 6 book parts (6 of the goal's 15 parts).
  - The shelf is about 40% too short.
  - The shelf is about 40% too shallow.
  - Uses 101 times as many triangles as the goal (18,224 against 180); the extra triangles are on flat faces, which need only a few each.
  - The model is a mirror image of the goal: 3 points.

## bicycle: goal 2796 triangles, 12 meshes, 1860 bytes
self: total 100.0 | works 100.0 eng 100.0 looks 100.0 bonus 0.0 | shape 100 parts 12/12 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]  (exactly 100: ok)

bicycle/k1_excellent  band 93-103  ok  525 ms
  fresh rebuild with lookAt rods, 10-sided tubes, wheel and tube sizes within 0.01
  total 98.9 | works 100.0 eng 100.0 looks 95.4 bonus 0.0 | shape 100 parts 12/12 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The outline differs from the goal, most in the front view.

bicycle/k2_good_slips  band 82-93  LENIENT by 1.6  528 ms
  the goal with slips: wheels a little small (0.32, so they float 0.03), seat 0.06 high off its tube, handlebar black
  total 94.6 | works 99.6 eng 100.0 looks 79.7 bonus 0.0 | shape 99.7 parts 12/12 miss 0 extra 0 credit 100 scale 0.97 off 0.02 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The outline differs from the goal, most in the front view.
  - Colours differ from the goal: 3 parts are a slightly different colour, the front wheel, the seat and the rear wheel.

bicycle/k3_mediocre  band 45-62  LENIENT by 12.1  883 ms
  fresh rebuild, clumsy: small wheels, thick tubes at rough angles, no seat stay or chainring
  total 74.1 | works 81.1 eng 100.0 looks 55.4 bonus 0.0 | shape 94.9 parts 11/12 miss 1 extra 0 credit 87.5 scale 0.91 off 0.00 turn 0 factor 0.99 eng[tri 100 mesh 100 src 100]
  - The chainring is missing (1 of the goal's 12 parts).
  - The handlebar sits too far right, by about 7% of the model's size.
  - Colours differ from the goal: the fork is a different colour.
  - The model is about 9% smaller than the goal: 1 point.

bicycle/k4_poor  band 25-42  ok  808 ms
  right idea, few parts: two wheels joined by one red bar
  total 34.9 | works 23.9 eng 100.0 looks 67.7 bonus 0.0 | shape 86.8 parts 6/12 miss 6 extra 0 credit 29.5 scale 0.99 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The shape is very different from the goal.
  - 6 parts are missing: the chain stay, the fork, the stem and elsewhere (6 of the goal's 12 parts).
  - The top tube is about 40% too short.

bicycle/k5_disc_wheels  band 60-75  LENIENT by 5.6  955 ms
  the goal with solid disc wheels (cylinders) instead of tyres
  total 80.6 | works 89.6 eng 100.0 looks 53.7 bonus 0.0 | shape 92.7 parts 12/12 miss 0 extra 0 credit 100 scale 0.96 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The surfaces are lit differently from the goal's (faces turned or shown from the other side), most in the front view.
  - Curves are too coarse: curved parts need more segments to match the goal.
  - Colours differ from the goal: 3 parts are a different colour, the chain stay, the seat stay and the fork.

bicycle/k6_bar_rotated  band 84-94  ok  622 ms
  the goal with the handlebar turned 90 degrees in place (along the bike instead of across it)
  total 84.8 | works 87.3 eng 100.0 looks 77.3 bonus 0.0 | shape 99.3 parts 11/12 miss 1 extra 0 credit 88.2 scale 1.03 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The handlebar is missing (1 of the goal's 12 parts).
  - Colours differ from the goal: 3 parts are a slightly different colour, the top tube, the chainring and the front wheel.

bicycle/k7_bloat  band 50-65  HARSH by 2.6  1111 ms
  the goal at very high detail: tyres 40x400, tubes 96-sided (about 24 times the triangles)
  total 47.4 | works 100.0 eng -50.0 looks 99.6 bonus 0.0 | shape 100 parts 12/12 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri -100 mesh 100 src 100]
  - Uses 24 times as many triangles as the goal (67,852 against 2,796); curved shapes need fewer segments.

bicycle/k8_flattened  band 50-66  LENIENT by 16.5  592 ms
  the goal squashed to 5% of its depth: right from the side, a flat sheet from above
  total 82.5 | works 86.6 eng 100.0 looks 70.4 bonus 0.0 | shape 98.8 parts 11/12 miss 1 extra 0 credit 88 scale 0.98 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - The handlebar is missing (1 of the goal's 12 parts).

bicycle/x8_bicycle_boxes  band 10-28  LENIENT by 46.3  903 ms
  CHEAT: a box per region in the right colours (square slabs for wheels, one slab for the frame)
  total 74.3 | works 84.2 eng 100.0 looks 44.3 bonus 0.0 | shape 90.2 parts 12/12 miss 0 extra 0 credit 97.9 scale 1.04 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
  - Curves are too coarse: curved parts need more segments to match the goal.
  - Some of the goal's edges and corners are missing or in other places, most in the front view.
  - Colours differ from the goal: 3 parts are a different colour, the chain stay, the seat stay and the fork.

## Order checks
held   mug/m1_excellent 99.1 > mug/m2_good_slips 79.3
held   mug/m2_good_slips 79.3 > mug/m3_mediocre 12.3
BROKEN mug/m3_mediocre 12.3 > mug/m4_poor 26.5
held   mug/m5_handle_left 90.0 > mug/m6_handle_floating 77.8
held   mug/m2_good_slips 79.3 > mug/m7_no_saucer 39.4
held   mug/m7_no_saucer 39.4 > mug/m8_half_height 17.5
held   mug/m4_poor 26.5 > mug/x1_mug_extruded_outline 24.3
held   rocket/r1_excellent 99.1 > rocket/r2_good_slips 88.3
held   rocket/r2_good_slips 88.3 > rocket/r3_mediocre 66.0
held   rocket/r3_mediocre 66.0 > rocket/r4_poor 38.6
held   rocket/r5_fins_45 86.9 > rocket/r6_three_fins 56.3
held   rocket/r6_three_fins 56.3 > rocket/r7_no_nose 55.9
held   rocket/r4_poor 38.6 > rocket/x3_rocket_billboard 29.4
held   rocket/r3_mediocre 66.0 > rocket/x2_rocket_cube_cloud 33.1
held   snowman/s1_excellent 98.5 > snowman/s2_good_slips 64.4
held   snowman/s2_good_slips 64.4 > snowman/s3_mediocre 40.0
held   snowman/s3_mediocre 40.0 > snowman/s4_poor 35.0
held   snowman/s6_arms_raised 61.1 > snowman/s5_hat_beside 52.2
BROKEN snowman/s2_good_slips 64.4 > snowman/s7_sunk 67.6
held   snowman/s4_poor 35.0 > snowman/x4_snowman_block 11.5
held   snowman/s4_poor 35.0 > snowman/x5_snowman_cutout 9.2
held   bookshelf/b1_excellent 100.2 > bookshelf/b3_books_swapped 97.7
held   bookshelf/b3_books_swapped 97.7 > bookshelf/b2_five_books 67.9
held   bookshelf/b2_five_books 67.9 > bookshelf/b5_mediocre 31.2
held   bookshelf/b5_mediocre 31.2 > bookshelf/b6_poor 19.3
held   bookshelf/b3_books_swapped 97.7 > bookshelf/b4_no_back 64.2
BROKEN bookshelf/b6_poor 19.3 > bookshelf/x6_bookshelf_block 39.0
held   bookshelf/b5_mediocre 31.2 > bookshelf/x7_bookshelf_painted_block 22.5
held   bicycle/k1_excellent 98.9 > bicycle/k2_good_slips 94.6
held   bicycle/k2_good_slips 94.6 > bicycle/k3_mediocre 74.1
held   bicycle/k3_mediocre 74.1 > bicycle/k4_poor 34.9
held   bicycle/k6_bar_rotated 84.8 > bicycle/k5_disc_wheels 80.6
held   bicycle/k2_good_slips 94.6 > bicycle/k7_bloat 47.4
BROKEN bicycle/k4_poor 34.9 > bicycle/x8_bicycle_boxes 74.3

## Summary
in band 21/47; outside: 26, mean distance 14.3, worst 46.3; order 30/34
grades over 5 s: none

## Probe: remove parts (snowman)
snowman -armR              total 80.0 | works 79.2 eng 100.0 looks 86.7 bonus 0.0 | shape 99.2 parts 12/13 miss 1 extra 0 credit 80.2 scale 0.99 off 0.10 turn 0 factor 0.99 eng[tri 100 mesh 100 src 100]
                           feedback: The arm r is missing (1 of the goal's 13 parts). | The model stands about 10% of the goal's size from where the goal stands (to the left): 1 point.
snowman -armR,nose         total 79.0 | works 77.9 eng 100.0 looks 86.6 bonus 0.0 | shape 99.1 parts 12/13 miss 1 extra 0 credit 78.9 scale 0.99 off 0.10 turn 0 factor 0.99 eng[tri 100 mesh 100 src 100]
                           feedback: The arm r is missing (1 of the goal's 13 parts). | The model stands about 10% of the goal's size from where the goal stands (to the left): 1 point. | Colours differ from the goal: 3 parts are a different colour, 2 button parts and the eye l.
snowman -armR,nose,crown   total 48.0 | works 41.4 eng 100.0 looks 71.2 bonus 0.0 | shape 97.5 parts 9/13 miss 4 extra 0 credit 42.9 scale 0.94 off 0.10 turn 1 factor 0.98 eng[tri 100 mesh 100 src 100]
                           feedback: 4 parts are missing: the brim, the arm r, the eye l and elsewhere (4 of the goal's 13 parts). | The crown is about 40% too short. | The model stands about 10% of the goal's size from where the goal stands (to the left): 1 point.

## Probe: remove parts (bookshelf books)
bookshelf -book8           total 86.3 | works 97.6 eng 100.0 looks 52.7 bonus 0.0 | shape 99.8 parts 15/15 miss 0 extra 0 credit 97.8 scale 0.97 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: Some of the goal's edges and corners are missing or in other places, most in the top view.
bookshelf -book8,book7     total 76.8 | works 85.6 eng 100.0 looks 50.6 bonus 0.0 | shape 99.4 parts 14/15 miss 1 extra 0 credit 86.3 scale 1.01 off 0.00 turn 1 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: The book is missing (1 of the goal's 15 parts).
bookshelf -book8,book7,book6 total 72.3 | works 80.1 eng 100.0 looks 48.9 bonus 0.0 | shape 98.8 parts 14/15 miss 1 extra 0 credit 81.5 scale 1.02 off 0.00 turn 1 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: The book is missing (1 of the goal's 15 parts).

## Probe: move the hat sideways (snowman height 2.67)
hat +x 0.05                total 98.9 | works 99.8 eng 100.0 looks 96.0 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 99.8 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: Some of the goal's edges and corners are missing or in other places, most in the front view.
hat +x 0.1                 total 83.9 | works 82.3 eng 100.0 looks 88.5 bonus 0.0 | shape 99.7 parts 12/13 miss 1 extra 0 credit 82.7 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: The brim is missing (1 of the goal's 13 parts).
hat +x 0.2                 total 64.5 | works 62.7 eng 100.0 looks 69.8 bonus 0.0 | shape 98.8 parts 11/13 miss 2 extra 0 credit 63.8 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: 2 parts are missing: the brim and the eye l (2 of the goal's 13 parts). | Colours differ from the goal: 3 parts are a slightly different colour, the eye r, the button and the arm l.
hat +x 0.4                 total 58.8 | works 58.3 eng 100.0 looks 60.2 bonus 0.0 | shape 96.6 parts 11/13 miss 2 extra 0 credit 61.3 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: 2 parts are missing: the brim and the eye l (2 of the goal's 13 parts). | The crown is about 27% too short. | Colours differ from the goal: 4 parts are a different colour, 3 button parts and the eye r.
hat +x 0.6                 total 53.8 | works 52.5 eng 100.0 looks 57.4 bonus 0.0 | shape 93.2 parts 11/13 miss 2 extra 0 credit 58.2 scale 0.99 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: 2 parts are missing: the brim and the eye l (2 of the goal's 13 parts). | The crown sits too far right, by about 20% of the model's size.
hat +x 0.9                 total 47.6 | works 45.4 eng 100.0 looks 54.7 bonus 0.0 | shape 91.6 parts 10/13 miss 3 extra 0 credit 51.6 scale 0.94 off 0.03 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: 3 parts are missing: the brim, the eye l and the eye r (3 of the goal's 13 parts). | The crown is about 40% too short. | The surfaces show edges and shading the goal does not have, most in the three-quarter front view.

## Probe: move the nose cone up (rocket height 3.0)
nose +y 0.05               total 98.0 | works 100.0 eng 100.0 looks 92.1 bonus 0.0 | shape 100 parts 9/9 miss 0 extra 0 credit 100 scale 1.01 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: The surfaces show edges and shading the goal does not have, most in the front view.
nose +y 0.1                total 91.5 | works 98.8 eng 100.0 looks 69.6 bonus 0.0 | shape 99.5 parts 9/9 miss 0 extra 0 credit 99.5 scale 0.99 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: The surfaces show edges and shading the goal does not have, most in the front view.
nose +y 0.2                total 83.8 | works 87.0 eng 100.0 looks 74.2 bonus 0.0 | shape 99 parts 9/9 miss 0 extra 0 credit 88.2 scale 1.01 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: The band does not match the goal's shape. | The surfaces show edges and shading the goal does not have, most in the front view.
nose +y 0.4                total 76.3 | works 82.9 eng 100.0 looks 59.9 bonus 0.0 | shape 98.9 parts 9/9 miss 0 extra 0 credit 84.2 scale 1.10 off 0.00 turn 6 factor 0.99 eng[tri 100 mesh 100 src 100]
                           feedback: The nose sits too high, by about 6% of the model's size. | Colours differ from the goal: 3 parts are a slightly different colour, the band, the nozzle and the body. | The model is about 10% bigger than the goal: 1 point.
nose +y 0.6                total 55.9 | works 56.2 eng 100.0 looks 58.6 bonus 0.0 | shape 96.3 parts 8/9 miss 1 extra 0 credit 59.3 scale 1.17 off 0.00 turn 1 factor 0.98 eng[tri 100 mesh 100 src 100]
                           feedback: The band is missing (1 of the goal's 9 parts). | The nose sits too high, by about 6% of the model's size. | The model is about 17% bigger than the goal: 1 point. | Colours differ from the goal: the window is a different colour.

## Probe: scale the head (snowman)
head x0.5                  total 88.6 | works 92.2 eng 100.0 looks 78.0 bonus 0.0 | shape 98.2 parts 13/13 miss 0 extra 0 credit 94.7 scale 0.96 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: The head is about 40% too short.
head x0.7                  total 93.6 | works 97.9 eng 100.0 looks 80.4 bonus 0.0 | shape 99.4 parts 13/13 miss 0 extra 0 credit 98.7 scale 0.96 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: Some of the goal's edges and corners are missing or in other places, most in the front view.
head x0.85                 total 99.4 | works 100.0 eng 100.0 looks 97.6 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: Some of the goal's edges and corners are missing or in other places, most in the three-quarter back view.
head x1.15                 total 92.3 | works 91.0 eng 100.0 looks 96.3 bonus 0.0 | shape 100 parts 11/13 miss 2 extra 0 credit 91 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: 2 parts are missing: the eye l and the eye r (2 of the goal's 13 parts).
head x1.4                  total 77.3 | works 80.8 eng 100.0 looks 66.6 bonus 0.0 | shape 98.1 parts 11/13 miss 2 extra 0 credit 83.1 scale 1.04 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: 2 parts are missing: the eye l and the eye r (2 of the goal's 13 parts). | The head is about 40% too short. | Colours differ from the goal: the brim is a different colour.
head x2                    total 27.3 | works 19.7 eng 100.0 looks 51.2 bonus 0.0 | shape 83.6 parts 6/13 miss 7 extra 0 credit 25.7 scale 1.12 off 0.00 turn 0 factor 0.99 eng[tri 100 mesh 100 src 100]
                           feedback: The shape is very different from the goal. | 7 parts are missing: the head, the brim, 3 button parts and elsewhere (7 of the goal's 13 parts). | The middle is about 35% too long. | The nose is about 40% too narrow.

## Probe: triangle count (rocket, segments multiplied)
segments x1                total 100.0 | works 100.0 eng 100.0 looks 100.0 bonus 0.0 | shape 100 parts 9/9 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: Matches the goal.
segments x2                total 86.3 | works 100.0 eng 61.0 looks 99.9 bonus 0.0 | shape 100 parts 9/9 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 61 mesh 100 src 100]
                           feedback: Uses 2 times as many triangles as the goal (1,104 against 560); curved shapes need fewer segments.
segments x4                total 59.5 | works 100.0 eng -15.5 looks 99.9 bonus 0.0 | shape 100 parts 9/9 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri -15.5 mesh 100 src 100]
                           feedback: Uses 4 times as many triangles as the goal (2,192 against 560); curved shapes need fewer segments.
segments x8                total 47.5 | works 100.0 eng -50.0 looks 99.9 bonus 0.0 | shape 100 parts 9/9 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri -71.6 mesh 100 src 100]
                           feedback: Uses 8 times as many triangles as the goal (4,368 against 560); curved shapes need fewer segments.
segments x16               total 12.6 | works 16.4 eng -50.0 looks 38.8 bonus 0.0 | shape 86.8 parts 6/9 miss 3 extra 0 credit 20.1 scale 0.88 off 0.00 turn 45 factor 0.94 eng[tri -100 mesh 100 src 100]
                           feedback: The shape is very different from the goal. | 3 parts are missing: the nose, the window and the fin (3 of the goal's 9 parts). | The body is about 25% too deep. | The surfaces show edges and shading the goal does not have, most in the three-quarter back view. | Uses 16 times as many triangles as the goal (8,720 against 560); curved shapes need fewer segments. | The model is turned about 45 degrees from the goal's facing: 1 point.
segments x32               total 10.0 | works 2.9 eng -50.0 looks 39.4 bonus 0.0 | shape 64.2 parts 3/9 miss 6 extra 0 credit 5.9 scale 0.85 off 0.00 turn 28 factor 0.95 eng[tri -100 mesh 100 src 100]
                           feedback: The shape is very different from the goal. | 6 parts are missing: the nose, the band and 4 fin parts (6 of the goal's 9 parts). | The body is about 40% too narrow. | The surfaces show edges and shading the goal does not have, most in the front view. | Uses 31 times as many triangles as the goal (17,424 against 560); curved shapes need fewer segments.
segments x64               total 8.1 | works 1.3 eng -50.0 looks 34.3 bonus 0.0 | shape 56.1 parts 3/9 miss 6 extra 0 credit 3.4 scale 0.73 off 0.00 turn 47 factor 0.91 eng[tri -100 mesh 100 src 100]
                           feedback: The shape is very different from the goal. | 6 parts are missing: the band, the window and 4 fin parts (6 of the goal's 9 parts). | The body is about 40% too narrow. | The nose is about 40% too short. | The surfaces show edges and shading the goal does not have, most in the three-quarter front view. | Uses 62 times as many triangles as the goal (34,832 against 560); curved shapes need fewer segments.

## Probe: turn the rocket about the up axis
rocket turn 0              total 100.0 | works 100.0 eng 100.0 looks 100.0 bonus 0.0 | shape 100 parts 9/9 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: Matches the goal.
rocket turn 15             total 98.4 | works 100.0 eng 100.0 looks 99.0 bonus 0.0 | shape 100 parts 9/9 miss 0 extra 0 credit 100 scale 0.99 off 0.00 turn 15 factor 0.99 eng[tri 100 mesh 100 src 100]
                           feedback: The model is turned about 15 degrees from the goal's facing: 1 point.
rocket turn 30             total 96.3 | works 100.0 eng 100.0 looks 97.3 bonus 0.0 | shape 100 parts 9/9 miss 0 extra 0 credit 100 scale 1.02 off 0.00 turn 30 factor 0.97 eng[tri 100 mesh 100 src 100]
                           feedback: The model is turned about 30 degrees from the goal's facing: 3 points. | The outline differs from the goal, most in the front view.
rocket turn 45             total 87.1 | works 89.4 eng 100.0 looks 97.5 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 0.99 off 0.00 turn 45 factor 0.95 eng[tri 100 mesh 100 src 100]
                           feedback: The window is missing (1 of the goal's 9 parts). | The model is turned about 45 degrees from the goal's facing: 4 points.
rocket turn 60             total 88.4 | works 89.4 eng 100.0 looks 96.5 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 1.02 off 0.00 turn 30 factor 0.97 eng[tri 100 mesh 100 src 100]
                           feedback: The window is missing (1 of the goal's 9 parts). | The model is turned about 30 degrees from the goal's facing: 3 points.
rocket turn 75             total 90.3 | works 89.4 eng 100.0 looks 98.0 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 0.99 off 0.00 turn 15 factor 0.99 eng[tri 100 mesh 100 src 100]
                           feedback: The window is missing (1 of the goal's 9 parts). | The model is turned about 15 degrees from the goal's facing: 1 point.
rocket turn 90             total 91.8 | works 89.4 eng 100.0 looks 98.9 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: The window is missing (1 of the goal's 9 parts).
rocket turn 105            total 90.3 | works 89.4 eng 100.0 looks 98.0 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 0.99 off 0.00 turn 15 factor 0.99 eng[tri 100 mesh 100 src 100]
                           feedback: The window is missing (1 of the goal's 9 parts). | The model is turned about 15 degrees from the goal's facing: 1 point.
rocket turn 120            total 88.4 | works 89.4 eng 100.0 looks 96.5 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 1.02 off 0.00 turn 30 factor 0.97 eng[tri 100 mesh 100 src 100]
                           feedback: The window is missing (1 of the goal's 9 parts). | The model is turned about 30 degrees from the goal's facing: 3 points.
rocket turn 135            total 87.3 | works 89.4 eng 100.0 looks 98.3 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 0.99 off 0.00 turn 45 factor 0.95 eng[tri 100 mesh 100 src 100]
                           feedback: The window is missing (1 of the goal's 9 parts). | The model is turned about 45 degrees from the goal's facing: 4 points.
rocket turn 150            total 88.5 | works 89.4 eng 100.0 looks 97.1 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 1.02 off 0.00 turn 30 factor 0.97 eng[tri 100 mesh 100 src 100]
                           feedback: The window is missing (1 of the goal's 9 parts). | The model is turned about 30 degrees from the goal's facing: 3 points.
rocket turn 165            total 90.5 | works 89.4 eng 100.0 looks 98.8 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 0.99 off 0.00 turn 15 factor 0.99 eng[tri 100 mesh 100 src 100]
                           feedback: The window is missing (1 of the goal's 9 parts). | The model is turned about 15 degrees from the goal's facing: 1 point.
rocket turn 180            total 92.0 | works 89.4 eng 100.0 looks 99.8 bonus 0.0 | shape 100 parts 8/9 miss 1 extra 0 credit 89.4 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: The window is missing (1 of the goal's 9 parts).

## Probe: turn the snowman about the up axis
snowman turn 0             total 100.0 | works 100.0 eng 100.0 looks 100.0 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: Matches the goal.
snowman turn 15            total 98.0 | works 99.6 eng 100.0 looks 98.6 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 99.6 scale 0.99 off 0.00 turn 15 factor 0.99 eng[tri 100 mesh 100 src 100]
                           feedback: The model is turned about 15 degrees from the goal's facing: 1 point.
snowman turn 30            total 95.6 | works 99.5 eng 100.0 looks 95.9 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 99.5 scale 1.00 off 0.00 turn 30 factor 0.97 eng[tri 100 mesh 100 src 100]
                           feedback: The model is turned about 30 degrees from the goal's facing: 3 points. | The outline differs from the goal, most in the front view.
snowman turn 45            total 93.6 | works 99.5 eng 100.0 looks 94.6 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 99.5 scale 0.99 off 0.00 turn 45 factor 0.95 eng[tri 100 mesh 100 src 100]
                           feedback: The model is turned about 45 degrees from the goal's facing: 5 points. | Colours differ from the goal: 2 parts are a different colour, the eye l and the eye r. | The outline differs from the goal, most in the front view.
snowman turn 60            total 92.4 | works 99.6 eng 100.0 looks 96.3 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 99.6 scale 0.99 off 0.00 turn 60 factor 0.94 eng[tri 100 mesh 100 src 100]
                           feedback: The model is turned about 60 degrees from the goal's facing: 6 points. | The outline differs from the goal, most in the front view.
snowman turn 75            total 91.3 | works 99.6 eng 100.0 looks 98.6 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 99.6 scale 0.99 off 0.00 turn 75 factor 0.92 eng[tri 100 mesh 100 src 100]
                           feedback: The model is turned about 75 degrees from the goal's facing: 8 points.
snowman turn 90            total 90.2 | works 100.0 eng 100.0 looks 100.0 bonus 0.0 | shape 100 parts 13/13 miss 0 extra 0 credit 100 scale 1.00 off 0.00 turn 90 factor 0.90 eng[tri 100 mesh 100 src 100]
                           feedback: The model is turned about 90 degrees from the goal's facing: 10 points.
snowman turn 105           total 74.3 | works 78.0 eng 100.0 looks 89.7 bonus 0.0 | shape 99.9 parts 8/13 miss 5 extra 0 credit 78.1 scale 1.01 off 0.00 turn 75 factor 0.92 eng[tri 100 mesh 100 src 100]
                           feedback: 5 parts are missing: 3 button parts, the eye l and the eye r (5 of the goal's 13 parts). | The nose is about 40% too narrow. | The model is turned about 75 degrees from the goal's facing: 7 points.
snowman turn 120           total 74.8 | works 76.9 eng 100.0 looks 88.7 bonus 0.0 | shape 99.8 parts 8/13 miss 5 extra 0 credit 77.1 scale 1.01 off 0.00 turn 60 factor 0.94 eng[tri 100 mesh 100 src 100]
                           feedback: 5 parts are missing: 3 button parts, the eye l and the eye r (5 of the goal's 13 parts). | The nose is about 40% too short. | The model is turned about 60 degrees from the goal's facing: 5 points.
snowman turn 135           total 76.9 | works 77.9 eng 100.0 looks 89.3 bonus 0.0 | shape 99.9 parts 8/13 miss 5 extra 0 credit 78 scale 1.01 off 0.00 turn 45 factor 0.95 eng[tri 100 mesh 100 src 100]
                           feedback: 5 parts are missing: 3 button parts, the eye l and the eye r (5 of the goal's 13 parts). | The nose is about 40% too short. | The model is turned about 45 degrees from the goal's facing: 4 points.
snowman turn 150           total 78.2 | works 77.8 eng 100.0 looks 89.2 bonus 0.0 | shape 99.9 parts 8/13 miss 5 extra 0 credit 78 scale 1.01 off 0.00 turn 30 factor 0.97 eng[tri 100 mesh 100 src 100]
                           feedback: 5 parts are missing: 3 button parts, the eye l and the eye r (5 of the goal's 13 parts). | The nose is about 40% too short. | The model is turned about 30 degrees from the goal's facing: 2 points.
snowman turn 165           total 79.1 | works 77.8 eng 100.0 looks 87.4 bonus 0.0 | shape 99.9 parts 8/13 miss 5 extra 0 credit 77.9 scale 1.01 off 0.00 turn 15 factor 0.99 eng[tri 100 mesh 100 src 100]
                           feedback: 5 parts are missing: 3 button parts, the eye l and the eye r (5 of the goal's 13 parts). | The nose is about 40% too narrow. | The model is turned about 15 degrees from the goal's facing: 1 point. | Colours differ from the goal: 2 parts are a slightly different colour, the arm l and the arm r.
snowman turn 180           total 82.3 | works 77.2 eng 100.0 looks 97.6 bonus 0.0 | shape 99.8 parts 8/13 miss 5 extra 0 credit 77.4 scale 1.00 off 0.00 turn 0 factor 1.00 eng[tri 100 mesh 100 src 100]
                           feedback: 5 parts are missing: 3 button parts, the eye l and the eye r (5 of the goal's 13 parts). | The nose is about 40% too short.
```
