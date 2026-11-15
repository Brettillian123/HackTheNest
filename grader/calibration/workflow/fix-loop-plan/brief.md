# Plan a capped fix loop with a held-out check

Lesson: 07 loops and graphs. The player prompts a model to plan, as JSON, building `parse_price(text)` in `src/price.py` with a grade-and-fix loop.

- 20 visible tests in `tests/visible/`; 8 held-out tests in `tests/held_out/` that no builder step may read or follow.
- Stages: load the visible tests, build, a grade-and-fix loop (at most 4 rounds, exit test stated, held-out set named), a final held-out check after the loop.
- Every step has an owner, `changes`, `dependsOn`, a proof and a budget.
- Limits: at most 8 steps, 4 owners.
