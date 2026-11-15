# Speed and perceived speed: research

**Summary.** Two waits cannot be removed: the model writing the page (several seconds) and the grader (seconds to 45 s). Everything else should answer in under 100 ms. The plan: stream the page into the preview as it is written, show named grading stages with a real progress bar, never lock the screen, and never lose the typed prompt. Static shell, prefetched links and cached lists make the rest instant. Items marked "inference" are my own reasoning, not a source.

## Targets

| Target | Number | Source |
|---|---|---|
| Click or key feels instant | 100 ms or less | NN/g response times |
| Flow of thought kept | 1 s or less | NN/g response times |
| Attention kept without a progress bar | about 10 s; beyond it show percent-done, expected time, and a way to cancel | NN/g response times |
| INP (good) | 200 ms or less (poor above 500 ms), 75th percentile | web.dev/articles/inp |
| LCP (good) | 2.5 s or less | web.dev/articles/vitals |
| CLS (good) | 0.1 or less | web.dev/articles/vitals |
| Small UI animation | about 100 ms; larger changes 200-300 ms; nothing near 500 ms | NN/g animation duration |
| Long task on main thread | over 50 ms counts as long | web.dev optimize-inp |

URLs: https://www.nngroup.com/articles/response-times-3-important-limits/ , https://web.dev/articles/vitals , https://web.dev/articles/inp , https://www.nngroup.com/articles/animation-duration/

## The two waits

**Generation (about 3-10 s, unconfirmed exact length).**
- 0 ms: button shows pressed state at once. Prompt box stays editable.
- under 100 ms: output pane switches to "Writing your page..." (no spinner for the first second, see finding 7).
- first token (about 0.5-2 s): the page appears in the preview and grows as HTML streams in.
- done: a small "Done, grading..." line, then the grading stages start by themselves.

**Grading (about 3-45 s).**
- 0-1 s: stage list appears: Rendering, Checking layout, Comparing to goal, Scoring.
- Each stage ticks off as it finishes. Rendering shows the actual screenshot as soon as it exists.
- Past 10 s: add "Multi-page sites take longer, up to 45 s" and a Cancel button.
- done: score counts up in about 300 ms; feedback items slide in one by one, top issue first.

## Findings

1. **Technique:** Stream model output token by token. **Why:** Streaming shows users chunks as they arrive instead of waiting for the full response (Vercel docs). **For us:** Route handler returns a stream; client appends to a buffer. **Depends on:** any stack. **Source:** https://vercel.com/docs/functions/streaming-functions **Confidence:** sourced. **Cost:** M.

2. **Technique:** Render the partial HTML live in the sandboxed iframe. **Why:** Watching the page build is the best "occupied time" we have. **For us:** Update `srcdoc` every 150-250 ms (not every token), closing open tags first. Browsers repair unclosed HTML. Test that flicker is acceptable; if not, update only at tag boundaries. **Depends on:** any. **Source:** none; inference (NN/g says occupied time feels shorter than unoccupied time, per a secondary summary). **Confidence:** my own inference. **Cost:** M.

3. **Technique:** Named stages for grading. **Why:** Visible, specific work feels purposeful; the "labor illusion" study found visible effort raised perceived value (secondary sources only; original unverified). **For us:** Grader reports stage names; show them as a checklist. If the grader cannot report stages, show estimated stages (label honestly). **Depends on:** any; needs grader to emit events. **Source:** https://www.nngroup.com/articles/response-times-3-important-limits/ (progress feedback). **Confidence:** widely repeated opinion. **Cost:** M.

4. **Technique:** Progress bar over 10 s, with expected time and Cancel. **Why:** NN/g rule for long waits. **For us:** Grader calls over 10 s get a bar plus "usually about N s". Cancel returns the player to editing, keeping the prompt. **Depends on:** any. **Source:** NN/g response times. **Confidence:** sourced. **Cost:** S.

5. **Technique:** Make the progress bar move steadily, never stall near the end. **Why:** Studies disagree on the best bar shape; practitioners say late pauses frustrate more than early ones. **For us:** Pace the bar to the stage count, not time; hold at 90% rather than 99% if slow. **Depends on:** any. **Source:** none primary (secondary: uxtigers.com/post/progress-indicators). **Confidence:** widely repeated opinion, unconfirmed. **Cost:** S.

6. **Technique:** Let the player keep working during both waits. **Why:** A locked screen makes waiting feel longer. **For us:** Prompt box, model picker and goal preview stay live. Allow editing the next prompt while grading; "Run" queues or cancels the old run. Goal preview and past attempts stay scrollable. **Depends on:** any. **Source:** none; inference. **Confidence:** my own inference. **Cost:** M.

7. **Technique:** Skeletons for page loads, spinner for single widgets, progress bar for long jobs. **Why:** NN/g: under 1 s use neither; full pages under 10 s use skeletons; modules 2-10 s a spinner; over 10 s a progress bar. **For us:** Skeleton for challenge list and leaderboard; spinner only inside the score card if grading is short; bar for grading. **Depends on:** any. **Source:** https://www.nngroup.com/articles/skeleton-screens/ **Confidence:** sourced. **Cost:** S.

8. **Technique:** Static shell plus `loading.tsx` / Suspense. **Why:** Layout paints at once; dynamic parts stream in independently. **For us:** Nav, challenge-list frame and workspace frame are in the shell; challenge data streams in. Keep LCP elements outside Suspense. **Depends on:** Next.js App Router. On static pages: pre-render list as HTML at build time. **Source:** https://nextjs.org/docs/app/guides/streaming **Confidence:** sourced. **Cost:** S.

9. **Technique:** `<Link>` prefetching and client-side navigation. **Why:** Static routes are prefetched in full when links enter the viewport; navigation keeps layout and state instead of a full reload. Dynamic routes are only partly prefetched, and only if `loading.tsx` exists. **For us:** Use `<Link>` for every in-app link; give `/challenges/[slug]` a `loading.tsx` or use `generateStaticParams`. Add `useLinkStatus` for slow networks. **Depends on:** Next.js. On plain static pages, add `<link rel="prefetch">` or a small hover-prefetch script. **Source:** https://nextjs.org/docs/app/getting-started/linking-and-navigating **Confidence:** sourced. **Cost:** S.

10. **Technique:** Pre-build challenge pages. **Why:** Dynamic segments without `generateStaticParams` fall back to request-time rendering. **For us:** Challenges are fixed content; generate them at build. Goal screenshots are static files. **Depends on:** Next.js. **Source:** same linking-and-navigating page. **Confidence:** sourced. **Cost:** S.

11. **Technique:** Stale-while-revalidate for leaderboard and list. **Why:** Serve cached data now, refresh in the background. **For us:** `use cache` with `cacheLife`, tagged; `revalidateTag(tag, 'max')` after a score is saved. Leaderboard may be seconds stale; the player's own score is shown from the client at once. **Depends on:** Next.js (Cache Components). Static stack: `Cache-Control: s-maxage=30, stale-while-revalidate=300` on the API (header syntax is standard HTTP; not checked in the Vercel docs here). **Source:** https://nextjs.org/docs/app/getting-started/revalidating **Confidence:** sourced (Next.js part). **Cost:** M.

12. **Technique:** Optimistic UI for cheap actions. **Why:** The UI reacts before the server answers. **For us:** Show the player's new best score and rank on the profile and leaderboard immediately; reconcile later. Do not fake the grader result itself. **Depends on:** any (React `useOptimistic` is Next/React). **Source:** none; inference. **Confidence:** my own inference. **Cost:** M.

13. **Technique:** Keep main thread free: keep input responsive. **Why:** INP counts clicks, taps and key presses; tasks over 50 ms delay them. **For us:** Streaming state updates are throttled; no heavy work while typing; syntax highlighting (if any) runs only on small text. Avoid a big code editor library; a plain `<textarea>` is enough for prompts. **Depends on:** any. **Source:** https://web.dev/articles/optimize-inp **Confidence:** sourced (task length); textarea advice is inference. **Cost:** S.

14. **Technique:** Reserve space so nothing jumps. **Why:** CLS target 0.1. **For us:** Fixed aspect-ratio boxes for goal preview and output preview; skeletons the same size as final content; image width and height set. **Depends on:** any. **Source:** https://web.dev/articles/optimize-cls and the Next.js streaming guide. **Confidence:** sourced. **Cost:** S.

15. **Technique:** `next/font` with one variable font, `next/image` for screenshots. **Why:** Fonts are self-hosted with no layout shift; fewer fonts means fewer downloads. **For us:** One variable font (or system font stack, free and fastest, inference). Goal screenshots through `next/image` with fixed size. **Depends on:** Next.js (static: preload font, `font-display`, width/height by hand). **Source:** https://nextjs.org/docs/app/api-reference/components/font **Confidence:** sourced. **Cost:** S.

16. **Technique:** Keyboard shortcut Ctrl/Cmd+Enter to run. **Why:** Removes the mouse trip; common in editors and chat tools. **For us:** Show the hint on the Run button ("Ctrl+Enter"). Esc cancels a run. **Depends on:** any. **Source:** none; no primary source found. **Confidence:** my own inference. **Cost:** S.

17. **Technique:** Fast animation, ease-out. **Why:** NN/g: about 100 ms for small feedback, 200-300 ms for bigger changes, near 500 ms drags; ease-out feels responsive; entering slightly longer than exiting. **For us:** Buttons 100 ms; panels and toasts 200 ms ease-out; score count-up about 300 ms. Animate `transform` and `opacity` only. **Depends on:** any (Tailwind `duration-100/200/300`, `ease-out`). **Source:** NN/g animation duration; web.dev optimize-cls (transform). **Confidence:** sourced. **Cost:** S.

18. **Technique:** Streaming on Vercel: know the limits. **Why:** Functions stop at a max duration, streamed time included. **For us:** With Fluid compute, Hobby default and max 300 s; Pro 300 s default, 800 s max. A 45 s grade fits. The 4.5 MB body limit does not apply to streamed responses. Edge runtime must start responding within 25 s. Set `export const maxDuration` in the route file. Check the account's actual plan and Fluid setting (unconfirmed for this team). **Depends on:** Vercel (Next.js route handler shown). **Source:** https://vercel.com/docs/functions/limitations **Confidence:** sourced. **Cost:** S.

19. **Technique:** Grading transport: stream or poll. **Why:** Proxy buffering can hold chunks back; Next.js docs warn that CDNs, proxies and compression can buffer streams. **For us:** Simplest reliable option (inference): POST creates a job and returns an id at once; client polls every 1 s (or streams) for stage status. Polling avoids long open connections and survives a refresh. If using SSE, test it on the deployed site, not only on localhost. **Depends on:** any. **Source:** https://nextjs.org/docs/app/guides/streaming (buffering section). **Confidence:** sourced (buffering risk); polling choice is inference. **Cost:** M.

20. **Technique:** Save the draft. **Why:** Lost text is the worst slowdown. **For us:** Keep prompt in state that survives navigation and also in `localStorage` per challenge; restore on return. **Depends on:** any. **Source:** none; inference. **Confidence:** my own inference. **Cost:** S.

## Avoid

- Blocking modals or full-screen overlays during a run (the player cannot edit or read).
- Spinners for waits under 1 s (NN/g: they feel jittery).
- Animations over 300 ms, or ones that delay a click from working.
- Layout jumps when streamed content arrives.
- Full-page reloads (plain `<a>` tags in Next.js skip prefetch and client navigation).
- Clearing the prompt box after Run or after an error.
- A fake progress bar that sits at 99%.
- Dynamic routes with no `loading.tsx` (the click seems ignored).
- Many fonts, large editor libraries, big client bundles (hydration delays prefetching, per the Next.js docs).

## Not confirmed

Real generation and grading times; the team's Vercel plan; labor-illusion and progress-bar studies (only secondary summaries read); keyboard shortcut and `srcdoc` streaming advice (no primary source).
