# AGENTS.md

## Project Overview

Asset Tax Calculator is a static site that gathers asset sale details and tax
profile inputs to compare FIFO/LIFO/HIFO outcomes and estimate taxes using 2025
brackets.

## Development Commands

```bash
# Run the local server
python3 -m http.server --directory docs 8000

# Run unit tests
node --test tests/logic.test.js
```

## Formatting

Run `ffx` to auto-format all files after every code change. Don't manually
format code.

## Project Conventions

- Keep the site static (no build step). Avoid adding dependencies unless
  required.
- Store the hosted site in `docs/` and keep `docs/CNAME` up to date.
- Prefer accessible, labeled inputs and mobile-friendly layouts.
- Keep tax logic deterministic and well-covered by tests.
