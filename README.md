# Asset Tax Calculator

Static web app to compare tax outcomes for asset sales based on holding period,
cost-basis strategy, and tax bracket.

## Quick start

- Run a local server from `docs/`:
  - `python3 -m http.server --directory docs 8000`
  - Visit `http://localhost:8000`

## GitHub Pages

- The site deploys from `docs/` using `.github/workflows/pages.yml`.

## App files

- `docs/index.html`: UI markup.
- `docs/styles.css`: Styles and layout.
- `docs/logic.js`: CSV parsing + cost-basis engine.
- `docs/app.js`: UI wiring and rendering.

## CSV templates

- `docs/samples/initial_positions.template.csv`
- `docs/samples/last_year_trades.template.csv`

## Tests

```
node --test tests/logic.test.js
```
