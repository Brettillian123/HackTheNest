# 02 - ICP and engagement research

**Summary.** There are no real users yet, so everything about the ICP is a hypothesis. Our best guess for the primary segment is working developers and CS students who already use AI coding tools and want to get better at prompting. Comparable sites (LeetCode, Codewars, CSSBattle, Frontend Mentor, chess.com) all keep play free and charge for extras: more attempts, deeper feedback, premium content, team use. The strongest evidence says to let people play before sign-up, give fast feedback, and make results shareable. The weakest evidence is about streaks and leaderboards, which help some people and push others away. For the hackathon, judges and students need the first two minutes to work with no sign-in. Pricing can wait.

## ICP (hypothesis, unconfirmed)

| Segment | Who | Wants | Comes back for | Would pay for |
|---|---|---|---|---|
| **Primary: developers using AI tools (students and working)** | CS students, job seekers, working devs who prompt daily | Prove and improve prompting skill; a score to show | New challenges, beating own score, rank by prompt count | More runs, stronger models (credits), detailed feedback |
| Secondary: non-developer "vibe coders" | Makers building with AI, no CS background | Get better results with fewer prompts | Easy challenges, visible progress | Credits; lower price tolerance |
| Secondary: teams and educators | Bootcamps, courses, hiring teams | Assess prompting skill fairly | Cohort results | Seats, private challenges (as HackerRank and Frontend Mentor Teams sell) |

Why developers first: 84% of Stack Overflow 2025 respondents use or plan to use AI tools, and 47.1% use them daily, yet only 33% trust the output ([survey](https://survey.stackoverflow.co/2025/ai)). Skill and verification are a felt gap. That is an inference about demand, not proof.

**What would confirm it:** the share of first-time visitors who submit a prompt; who returns within 7 days; who shares a result; who clicks a "pay" or "team" prompt. Ask five users from each segment what they would pay for. I found no public demographic data on LeetCode, CSSBattle or Codewars users. Unconfirmed.

## What comparable products charge for

| Product | Free | Paid gates | Source |
|---|---|---|---|
| LeetCode | Core problems | Company-tagged lists, mock interviews, video solutions. Third-party trackers list $35/month or $159/year (unconfirmed, check the vendor) | [designgurus](https://www.designgurus.io/answers/detail/is-leetcode-paid-or-free), [prachub](https://prachub.com/resources/leetcode-pricing) |
| CSSBattle | "Free and always free to play" | Cosmetic and editor extras (badge, VS Code-style editor). Current price unconfirmed | [cssbattle.dev/pro](https://cssbattle.dev/pro) |
| Frontend Mentor | Free challenges | Premium challenges, AI code review, Figma files, private solutions; separate Teams product by seat | [FM pro](https://www.frontendmentor.io/guides/whats-included-with-pro), [Teams](https://teams.frontendmentor.io/pricing) |
| Codewars | All kata | Ad-free, stats, badge. Aggregators say $5/month or $40/year (unconfirmed) | [toolradar](https://toolradar.com/tools/codewars/pricing) |
| chess.com | 3 puzzles a day (official help page) | Unlimited puzzles, Puzzle Rush | [support](https://support.chess.com/en/articles/8608686-how-do-puzzles-work) |
| HackerRank | Practice | Employer assessments. Price figures conflict across sites; unconfirmed | [G2](https://www.g2.com/products/hackerrank/pricing) |

Pattern: play is free; money comes from depth (feedback, content), volume caps, and employers.

## Elements

1. **Play before sign-up.** Element: one demo challenge runnable with no account. Why: shows value fast. Site: landing page embeds the workspace on a starter challenge; sign-in asked only to save or submit to the leaderboard. Stage: activate. Source: [GGV essay](https://medium.com/@GGVCapital/to-wall-or-not-to-wall-the-user-sign-up-question-3caa2a729adc). Confidence: widely repeated opinion (anecdotes, no controlled study found). Cost: M.

2. **Score with plain-words breakdown.** Why: the "why did I lose points" list is the learning loop and our difference from a bare number. Site: score panel listing each cost in points. Stage: activate/retain. Source: none found for this exact design; own inference, supported by Frontend Mentor selling AI review ([FM](https://www.frontendmentor.io/guides/whats-included-with-pro)). Confidence: my own inference. Cost: S (grader exists).

3. **Goal and output side by side.** Why: CSSBattle's core loop is visual match against a target. Site: workspace shows goal preview and output preview together with the score. Stage: activate. Source: [cssbattle.dev](https://cssbattle.dev/pro). Confidence: my own inference from the product. Cost: S.

4. **Easy first challenges, then a ramp.** Why: early wins keep new users; Duolingo reports the first 7 days matter most. Site: challenge list with difficulty tags and a recommended first challenge. Stage: activate. Source: [Duolingo PM talk summary](https://www.recall.it/summary/lennys-podcast/behind-the-product-duolingo-streaks-or-jackson-shuttleworth-group-pm-retention-team). Confidence: sourced (company claim). Cost: S.

5. **Leaderboards split by prompt count (already planned).** Why: a new player is not crushed by experts; "fewer prompts" is our own skill. Site: tabs 1, 2, 3-5, 6-10, 11+. Stage: retain. Source: research favors relative or segmented boards over one global list ([Chou](https://yukaichou.com/gamification-study/why-most-leaderboards-fail-and-how-to-fix-yours-in-5-steps/), [study](https://www.emerald.com/insight/content/doi/10.1108/intr-12-2021-0897/full/html)). Confidence: sourced, but findings are mixed. Cost: S.

6. **Show "your rank and neighbors", not the bottom.** Why: studies suggest limiting public bottom rankings. Site: leaderboard centers on the player, plus a "personal best" line. Stage: retain. Source: same Emerald study. Confidence: sourced (mixed evidence). Cost: S.

7. **Shareable result card.** Why: Wordle's spoiler-free grid drove its spread. Site: after scoring, a "copy result" with score, prompt count and a small image; no prompt text, so others can still try. Stage: attract. Source: [Wikipedia mirror](https://wikipedia.com/wiki/Wordle), [Smithsonian](https://www.smithsonianmag.com/smart-news/heres-why-the-word-game-wordle-went-viral-180979439/). Confidence: sourced. Cost: M.

8. **Daily challenge.** Why: one shared puzzle gives a reason to return and something to talk about (Wordle). Site: "Today's challenge" on the landing page and list. Stage: retain. Source: same as 7. Confidence: sourced for Wordle; unproven for us. Cost: M (needs content supply).

9. **Streaks, soft version.** Why: Duolingo credits streaks for daily retention, but the causal link is hard to isolate and an easier-streak test did not raise daily users. Site: small streak count on profile, with a free "freeze". Stage: retain. Source: [pulse2](https://pulse2.com/duolingo-daily-active-users-reach-58-7-million-as-retention-hits-record-84-and-social-accounts-top-1-billion-organic-impressions/), [Business of Apps](https://www.businessofapps.com/news/duolingos-streak-feature-drives-record-17-million-daus). Confidence: sourced (company-reported). Cost: S. Optional.

10. **Profile as proof of skill.** Why: job seekers and devs want something to show. Site: public profile with solved challenges, best scores, a badge row, and a link to share. GitHub sign-in makes it easy to link. Stage: retain/attract. Source: none found; own inference from LeetCode and Codewars profiles. Confidence: my own inference. Cost: M.

11. **Fewer-prompts as the headline skill.** Why: it is what a prompting skill actually means and nobody else ranks it. Site: "solved in 2 prompts" badge on results and profile. Stage: retain. Source: none. Confidence: my own inference. Cost: S.

12. **Free tier with a daily cap on runs.** Why: chess.com gives 3 puzzles a day free and sells unlimited. Our runs cost real model money, so a cap is natural. Site: "3 of 5 free runs left today" in the workspace. Stage: pay. Source: [chess.com support](https://support.chess.com/en/articles/8608686-how-do-puzzles-work). Confidence: sourced for chess.com. Cost: S.

13. **Paid depth, not paid access.** Why: CSSBattle and Codewars stay free to play; Frontend Mentor and LeetCode gate premium content and deeper feedback. Site: free = play and score; paid = stronger models, more runs, extra detailed review, premium challenges. Stage: pay. Source: table above. Confidence: sourced. Cost: M.

14. **Credits that are predictable.** Why: metered AI billing drew backlash (Cursor, GitHub Copilot) over surprise cost. Site: show the credit cost before each run; hard cap; no surprise charges. Stage: pay. Source: [The Register](https://www.theregister.com/ai-and-ml/2026/06/02/github-copilot-users-threaten-exit-as-metered-billing-kicks-in/5249826), [Autumn](https://useautumn.com/blog/usage-billing-bad). Confidence: widely repeated opinion plus news reports. Cost: M.

15. **Team and classroom view.** Why: Frontend Mentor and HackerRank both sell to teams. Site: later; private challenge set and a cohort leaderboard. Stage: pay. Source: [FM Teams](https://teams.frontendmentor.io/pricing). Confidence: sourced for the pattern. Cost: L. Not for the hackathon.

16. **Gandalf-style "beat the level" progression.** Why: Lakera's game reportedly drew hundreds of thousands of players and 40 million prompts through numbered levels (third-party figures). Site: an ordered "path" of challenges that unlock in sequence. Stage: activate/retain. Source: [Zilliz](https://zilliz.com/blog/insights-into-llm-security-from-the-worlds-largest-red-team.md). Confidence: sourced (third-party, unverified counts). Cost: S.

17. **Fast first result.** Why: time to first value is the main activation metric per practitioners. Site: first run returns a score in seconds, with a visible progress state. Stage: activate. Source: [onboarding sources via search](https://appcues.com/blog/how-to-launch-a-free-trial). Confidence: widely repeated opinion. Cost: M.

18. **Analytics from day one.** Why: we cannot confirm the ICP without it. Site: log first submit, return day 7, share clicks, pay clicks. Stage: all. Source: none; own inference. Confidence: my own inference. Cost: S.

## Avoid

- **Forced sign-up before any play.** Sources report lost conversion, but all are anecdotes ([Indie Hackers](https://www.indiehackers.com/post/we-removed-the-login-wall-cpa-dropped-50-overnight-7fb2d1c5c1)).
- **Streak anxiety.** Critics say users do one lesson only to save a streak, not to learn ([Business of Apps](https://www.businessofapps.com/news/duolingos-streak-feature-drives-record-17-million-daus)). Do not use loss-aversion guilt copy.
- **One global leaderboard that shows new players at the bottom.** Studies say low ranks can drive people away.
- **Surprise charges or opaque credit units.** The main complaint in the Cursor and Copilot reports.
- **Share cards that leak the answer.** Wordle shows the grid must be spoiler-free; "Not Wordle" backlash shows over-sharing can annoy.
- **Chasing numbers we cannot source.** Several viral growth figures (for example Wordle daily players, "3.6x" streak return) are unverified.

## Not found

User demographics for LeetCode, CSSBattle, Codewars, Kaggle, Advent of Code and Monkeytype; current CSSBattle, LeetCode and Codewars prices from the vendors themselves.
