# AGENTS.md for invoice-tool

How a coding agent works safely on invoice-tool, a small Python project.

## Overview

invoice-tool is a small Python package with its tests alongside. Read this file before changing anything.

## Commands

Run these from the repository root:

```bash
pip install -e .[dev]   # install the package and its dev tools
pytest                  # run the tests
ruff check .            # lint the code
```

## Layout

- `src/invoice_tool/`: the package code.
- `tests/`: the tests that pytest runs.
- `data/samples/`: sample data, read only.

## Rules

- Never change anything in `data/samples/`.
- Never read `.env`; it holds secrets.
- Ask before adding a new dependency.

## Done means

1. `pytest` passes.
2. `ruff check .` reports no problems.
3. Nothing in `data/samples/` has changed.
