# Asset Tax Calculator Plan

## Goal

Build a single-page static web app that accepts two properly formatted CSVs,
applies selectable cost-basis strategies (FIFO, LIFO, HIFO, etc.), and outputs
tax-ready summaries plus downloadable CSV exports.

## Input model (two CSV uploads)

### 1) `initial_positions.csv`

One row per open lot at the start of the tax year.

Required headers (exact):

- `lot_id` (string, unique per row)
- `asset` (string, ticker or symbol)
- `acquired_date` (YYYY-MM-DD)
- `quantity` (number)
- `cost_basis_usd` (number, total for the lot)

Optional headers:

- `account`
- `notes`

### 2) `last_year_trades.csv`

All trades for the tax year (buys and sells). Buys add lots; sells consume lots.

Required headers (exact):

- `trade_id` (string, unique per row)
- `asset` (string, ticker or symbol)
- `side` (BUY or SELL)
- `trade_date` (YYYY-MM-DD)
- `quantity` (number)
- `price_usd` (number, per-unit trade price)
- `fees_usd` (number, per trade, can be 0)

Optional headers:

- `account`
- `notes`

## Output model

- Per-trade lot matching (one sell can map to multiple lots).
- Short-term vs long-term gain/loss totals.
- Summary by asset and by holding period.
- Downloadable exports:
  - `lot_matches.csv` (trade_id, lot_id, qty, proceeds, cost, gain, holding_days)
  - `summary.csv` (asset, short_term_gain, long_term_gain, total_gain)
  - `form_8949.csv` (Description, Date Acquired, Date Sold, Proceeds, Cost Basis, Gain/Loss)

## Strategy toggles

Implement the following cost-basis methods:

- FIFO: oldest lots consumed first by acquired_date.
- LIFO: newest lots consumed first by acquired_date.
- HIFO: highest cost_basis_per_unit consumed first.
- LOFO (optional): lowest cost_basis_per_unit consumed first.
- Specific ID (optional later): user picks lot_id for each sell.

## Tax profile (2025 brackets)

- Collect filing status plus either total taxable income (auto bracket) or a
  manual bracket selection.
- Use 2025 federal ordinary income brackets (IRS Rev. Proc. 2024-40).
- Married filing separately uses half of the joint brackets unless the user
  selects manual mode.
- Long-term gains use a user-selected rate (0%, 15%, 20%) plus optional NIIT.

2025 ordinary income brackets:

- Single: 10% (0-11,925), 12% (11,925-48,475), 22% (48,475-103,350), 24%
  (103,350-197,300), 32% (197,300-250,525), 35% (250,525-626,350), 37%
  (626,350+).
- Married filing jointly: 10% (0-23,850), 12% (23,850-96,950), 22%
  (96,950-206,700), 24% (206,700-394,600), 32% (394,600-501,050), 35%
  (501,050-751,600), 37% (751,600+).
- Head of household: 10% (0-17,000), 12% (17,000-64,850), 22%
  (64,850-103,350), 24% (103,350-197,300), 32% (197,300-250,500), 35%
  (250,500-626,350), 37% (626,350+).

## UI layout (single page)

1. Upload section
   - Two file inputs with drag/drop targets and "Download template" links.
   - Show parsed row counts and any invalid row count.

2. Strategy toggle
   - Radio buttons for FIFO, LIFO, HIFO, LOFO.
   - Recompute on change.

3. Results overview
   - KPI cards: total gain, short-term gain, long-term gain, effective rate (placeholder).

4. Details tables
   - Sell-by-sell breakdown with expandable lot matches.
   - Asset summary table.

5. Downloads
   - Buttons for CSV exports and (optional) Form 8949 CSV.

## Data parsing + normalization

- Use `FileReader` to read CSVs as text.
- Build a lightweight CSV parser that respects quoted fields.
- Map headers to expected keys and trim whitespace.
- Parse numbers with `Number()` after removing commas.
- Validate:
  - All required headers present.
  - Dates parse to valid Date objects.
  - quantity > 0.
  - For sells, enough lots exist to cover quantity (otherwise flag error).

## Calculation pipeline

1. Parse `initial_positions.csv` into lots:
   - lot = { lotId, asset, acquiredDate, quantityRemaining, costPerUnit }
2. Parse `last_year_trades.csv`, split into buys and sells.
3. Add BUY trades as new lots (use trade_id as lot_id).
4. Sort SELL trades by trade_date ascending.
5. For each SELL:
   - Select candidate lots for that asset.
   - Order lots per strategy.
   - Consume lots until sell quantity is fulfilled (split lots when partial).
   - For each match:
     - cost = qty \* costPerUnit
     - proceeds = qty _ price_usd - (fees_usd _ qty / sell_qty)
     - holding_days = sell_date - acquired_date
     - term = short if holding_days < 365, else long
6. Aggregate totals by term and asset.
7. Estimate taxes:
   - Ordinary bracket rate from 2025 brackets + income input.
   - Short-term gains taxed at ordinary rate.
   - Long-term gains taxed at selected rate (0/15/20) plus optional NIIT.

## Sample files + downloads

- Create `docs/samples/` with sanitized templates:
  - `initial_positions.template.csv`
  - `last_year_trades.template.csv`
- Optional: include previous tax docs (from `tmp/2024 taxes/`) as examples for download
  after confirming which files are safe to publish.

## Implementation steps

1. Update `docs/index.html` with:
   - Two upload inputs, template download links, strategy toggle, and result tables.
2. Add `docs/samples/` templates and hook "Download template" buttons.
3. Implement CSV parsing + validation in `docs/app.js`.
4. Implement cost-basis engine with FIFO/LIFO/HIFO/LOFO.
5. Render results into summary cards and tables.
6. Wire exports: generate CSV blobs and download links.
7. Add sample data loader for quick demo mode.
8. Verify with a known dataset and cross-check totals.
9. Add unit tests for CSV parsing, lot matching, and bracket selection.
