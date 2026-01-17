const test = require('node:test')
const assert = require('node:assert/strict')

const {
  parseCsv,
  parsePositionsCsv,
  parseTradesCsv,
  buildLots,
  computeStrategy,
  getOrdinaryBracketRate,
  estimateTax
} = require('../docs/logic.js')

const positionsCsv = `lot_id,asset,acquired_date,quantity,cost_basis_usd
lot-1,ABC,2024-01-01,10,1000
lot-2,ABC,2024-06-01,5,800
`

const tradesCsv = `trade_id,asset,side,trade_date,quantity,price_usd,fees_usd
sell-1,ABC,SELL,2025-01-02,12,150,12
`

test('parseCsv handles quoted commas', () => {
  const rows = parseCsv('name,amount\n"AAPL, Inc",100')
  assert.equal(rows.length, 2)
  assert.equal(rows[1][0], 'AAPL, Inc')
  assert.equal(rows[1][1], '100')
})

test('parsePositionsCsv returns lots', () => {
  const result = parsePositionsCsv(positionsCsv)
  assert.equal(result.errors.length, 0)
  assert.equal(result.lots.length, 2)
  assert.equal(result.lots[0].asset, 'ABC')
})

test('parsePositionsCsv clamps negative cost basis to 0', () => {
  const result = parsePositionsCsv(
    'lot_id,asset,acquired_date,quantity,cost_basis_usd\n' +
      'lot-1,ABC,2024-01-01,10,-500\n'
  )
  assert.equal(result.errors.length, 0)
  assert.equal(result.warnings.length, 1)
  assert.equal(result.lots[0].costPerUnit, 0)
})

test('parseTradesCsv returns sells', () => {
  const result = parseTradesCsv(tradesCsv)
  assert.equal(result.errors.length, 0)
  assert.equal(result.sells.length, 1)
  assert.equal(result.sells[0].tradeId, 'sell-1')
})

test('FIFO vs LIFO produces different gains', () => {
  const positions = parsePositionsCsv(positionsCsv)
  const trades = parseTradesCsv(tradesCsv)
  const lots = buildLots(positions.lots, trades.buys)

  const fifo = computeStrategy(lots, trades.sells, 'FIFO')
  const lifo = computeStrategy(lots, trades.sells, 'LIFO')

  assert.equal(fifo.errors.length, 0)
  assert.equal(lifo.errors.length, 0)

  assert.ok(Math.abs(fifo.totals.totalGain - 468) < 0.01)
  assert.ok(Math.abs(fifo.totals.shortTermGain - -22) < 0.01)
  assert.ok(Math.abs(fifo.totals.longTermGain - 490) < 0.01)

  assert.ok(Math.abs(lifo.totals.totalGain - 288) < 0.01)
  assert.ok(Math.abs(lifo.totals.shortTermGain - -55) < 0.01)
  assert.ok(Math.abs(lifo.totals.longTermGain - 343) < 0.01)
})

test('getOrdinaryBracketRate matches 2025 thresholds', () => {
  const single = getOrdinaryBracketRate(50000, 'single')
  assert.equal(single.rate, 0.22)

  const hoh = getOrdinaryBracketRate(17000, 'head_of_household')
  assert.equal(hoh.rate, 0.1)
})

test('estimateTax applies ordinary and long-term rates', () => {
  const totals = { shortTermGain: -22, longTermGain: 490 }
  const profile = { ordinaryRate: 0.22, longTermRate: 0.15, applyNiit: false }
  const tax = estimateTax(totals, profile)

  assert.ok(Math.abs(tax.shortTermTax - 0) < 0.001)
  assert.ok(Math.abs(tax.longTermTax - 73.5) < 0.001)
  assert.ok(Math.abs(tax.totalTax - 73.5) < 0.001)
})
