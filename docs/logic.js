(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory()
  } else {
    root.AssetTaxCalc = factory()
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  const DAY_MS = 24 * 60 * 60 * 1000

  const TAX_BRACKETS_2025 = (() => {
    const single = [
      { rate: 0.1, min: 0, max: 11925 },
      { rate: 0.12, min: 11925, max: 48475 },
      { rate: 0.22, min: 48475, max: 103350 },
      { rate: 0.24, min: 103350, max: 197300 },
      { rate: 0.32, min: 197300, max: 250525 },
      { rate: 0.35, min: 250525, max: 626350 },
      { rate: 0.37, min: 626350, max: null }
    ]

    const marriedJoint = [
      { rate: 0.1, min: 0, max: 23850 },
      { rate: 0.12, min: 23850, max: 96950 },
      { rate: 0.22, min: 96950, max: 206700 },
      { rate: 0.24, min: 206700, max: 394600 },
      { rate: 0.32, min: 394600, max: 501050 },
      { rate: 0.35, min: 501050, max: 751600 },
      { rate: 0.37, min: 751600, max: null }
    ]

    const headOfHousehold = [
      { rate: 0.1, min: 0, max: 17000 },
      { rate: 0.12, min: 17000, max: 64850 },
      { rate: 0.22, min: 64850, max: 103350 },
      { rate: 0.24, min: 103350, max: 197300 },
      { rate: 0.32, min: 197300, max: 250500 },
      { rate: 0.35, min: 250500, max: 626350 },
      { rate: 0.37, min: 626350, max: null }
    ]

    const marriedSeparate = marriedJoint.map((bracket) => ({
      rate: bracket.rate,
      min: bracket.min / 2,
      max: bracket.max === null ? null : bracket.max / 2
    }))

    return {
      single,
      married_joint: marriedJoint,
      married_separate: marriedSeparate,
      head_of_household: headOfHousehold
    }
  })()

  function normalizeHeader (header) {
    return String(header || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  }

  function parseCsv (text) {
    const rows = []
    let row = []
    let value = ''
    let inQuotes = false
    const cleanText = String(text || '').replace(/^\ufeff/, '')

    for (let i = 0; i < cleanText.length; i += 1) {
      const char = cleanText[i]

      if (inQuotes) {
        if (char === '"') {
          if (cleanText[i + 1] === '"') {
            value += '"'
            i += 1
          } else {
            inQuotes = false
          }
        } else {
          value += char
        }
        continue
      }

      if (char === '"') {
        inQuotes = true
        continue
      }

      if (char === ',') {
        row.push(value)
        value = ''
        continue
      }

      if (char === '\n') {
        row.push(value)
        rows.push(row)
        row = []
        value = ''
        continue
      }

      if (char === '\r') {
        if (cleanText[i + 1] === '\n') {
          i += 1
        }
        row.push(value)
        rows.push(row)
        row = []
        value = ''
        continue
      }

      value += char
    }

    if (value.length || row.length) {
      row.push(value)
      rows.push(row)
    }

    return rows
  }

  function parseCsvRecords (text) {
    const rows = parseCsv(text)
    const errors = []

    if (!rows.length) {
      return { headers: [], records: [], errors: ['CSV is empty.'] }
    }

    const rawHeaders = rows[0]
    const headers = rawHeaders.map(normalizeHeader)

    const records = []
    for (let i = 1; i < rows.length; i += 1) {
      const row = rows[i]
      const isEmpty = row.every((cell) => String(cell || '').trim() === '')
      if (isEmpty) {
        continue
      }
      const record = {}
      for (let j = 0; j < headers.length; j += 1) {
        const key = headers[j]
        if (!key) {
          continue
        }
        record[key] = String(row[j] || '').trim()
      }
      records.push(record)
    }

    if (!headers.some((header) => header)) {
      errors.push('CSV headers are missing.')
    }

    return { headers, records, errors }
  }

  function parseNumber (value) {
    if (value === undefined || value === null) {
      return null
    }
    const cleaned = String(value).replace(/[$,]/g, '').trim()
    if (!cleaned) {
      return null
    }
    const num = Number(cleaned)
    if (!Number.isFinite(num)) {
      return null
    }
    return num
  }

  function parseDate (value) {
    if (value === undefined || value === null) {
      return null
    }
    const trimmed = String(value).trim()
    if (!trimmed) {
      return null
    }

    let year
    let month
    let day

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [y, m, d] = trimmed.split('-')
      year = Number(y)
      month = Number(m)
      day = Number(d)
    } else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmed)) {
      const [m, d, y] = trimmed.split('/')
      year = Number(y)
      month = Number(m)
      day = Number(d)
    } else {
      return null
    }

    const date = new Date(Date.UTC(year, month - 1, day))
    if (Number.isNaN(date.getTime())) {
      return null
    }
    return date
  }

  function formatDate (date) {
    if (!(date instanceof Date)) {
      return ''
    }
    const year = date.getUTCFullYear()
    const month = String(date.getUTCMonth() + 1).padStart(2, '0')
    const day = String(date.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  function normalizeAsset (value) {
    return String(value || '').trim().toUpperCase()
  }

  function parsePositionsCsv (text) {
    const { headers, records, errors } = parseCsvRecords(text)
    const warnings = []
    const required = [
      'lot_id',
      'asset',
      'acquired_date',
      'quantity',
      'cost_basis_usd'
    ]

    const headerSet = new Set(headers)
    const missing = required.filter((key) => !headerSet.has(key))
    if (missing.length) {
      errors.push(`Missing headers: ${missing.join(', ')}.`)
    }

    const lots = []

    records.forEach((record, index) => {
      const rowNumber = index + 2
      const lotId = String(record.lot_id || '').trim()
      const asset = normalizeAsset(record.asset)
      const acquiredDate = parseDate(record.acquired_date)
      const quantity = parseNumber(record.quantity)
      let costBasis = parseNumber(record.cost_basis_usd)

      if (!lotId || !asset) {
        errors.push(`Row ${rowNumber}: lot_id and asset are required.`)
        return
      }
      if (!acquiredDate) {
        errors.push(`Row ${rowNumber}: acquired_date is invalid.`)
        return
      }
      if (!quantity || quantity <= 0) {
        errors.push(`Row ${rowNumber}: quantity must be greater than 0.`)
        return
      }
      if (costBasis === null) {
        errors.push(`Row ${rowNumber}: cost_basis_usd must be 0 or more.`)
        return
      }
      if (costBasis < 0) {
        warnings.push(
          `Row ${rowNumber}: cost_basis_usd was negative and was set to 0.`
        )
        costBasis = 0
      }

      lots.push({
        lotId,
        asset,
        acquiredDate,
        quantityRemaining: quantity,
        costPerUnit: costBasis / quantity,
        source: 'initial'
      })
    })

    return { lots, errors, warnings }
  }

  function parseTradesCsv (text) {
    const { headers, records, errors } = parseCsvRecords(text)
    const required = [
      'trade_id',
      'asset',
      'side',
      'trade_date',
      'quantity',
      'price_usd',
      'fees_usd'
    ]

    const headerSet = new Set(headers)
    const missing = required.filter((key) => !headerSet.has(key))
    if (missing.length) {
      errors.push(`Missing headers: ${missing.join(', ')}.`)
    }

    const buys = []
    const sells = []

    records.forEach((record, index) => {
      const rowNumber = index + 2
      const tradeId = String(record.trade_id || '').trim()
      const asset = normalizeAsset(record.asset)
      const side = String(record.side || '').trim().toUpperCase()
      const tradeDate = parseDate(record.trade_date)
      const quantity = parseNumber(record.quantity)
      const priceUsd = parseNumber(record.price_usd)
      const feesUsd = parseNumber(record.fees_usd) ?? 0

      if (!tradeId || !asset) {
        errors.push(`Row ${rowNumber}: trade_id and asset are required.`)
        return
      }
      if (!tradeDate) {
        errors.push(`Row ${rowNumber}: trade_date is invalid.`)
        return
      }
      if (side !== 'BUY' && side !== 'SELL') {
        errors.push(`Row ${rowNumber}: side must be BUY or SELL.`)
        return
      }
      if (!quantity || quantity <= 0) {
        errors.push(`Row ${rowNumber}: quantity must be greater than 0.`)
        return
      }
      if (priceUsd === null || priceUsd < 0) {
        errors.push(`Row ${rowNumber}: price_usd must be 0 or more.`)
        return
      }
      if (feesUsd === null || feesUsd < 0) {
        errors.push(`Row ${rowNumber}: fees_usd must be 0 or more.`)
        return
      }

      const trade = {
        tradeId,
        asset,
        side,
        tradeDate,
        quantity,
        priceUsd,
        feesUsd
      }

      if (side === 'BUY') {
        buys.push(trade)
      } else {
        sells.push(trade)
      }
    })

    return { buys, sells, errors }
  }

  function buildLots (initialLots, buyTrades) {
    const lots = initialLots.map((lot) => ({ ...lot }))

    buyTrades.forEach((trade) => {
      const costPerUnit = (trade.quantity * trade.priceUsd + trade.feesUsd) /
        trade.quantity
      lots.push({
        lotId: trade.tradeId,
        asset: trade.asset,
        acquiredDate: trade.tradeDate,
        quantityRemaining: trade.quantity,
        costPerUnit,
        source: 'buy'
      })
    })

    return lots
  }

  function sortLots (lots, strategy) {
    const sorted = lots.slice()
    if (strategy === 'FIFO') {
      sorted.sort((a, b) => a.acquiredDate - b.acquiredDate)
    } else if (strategy === 'LIFO') {
      sorted.sort((a, b) => b.acquiredDate - a.acquiredDate)
    } else if (strategy === 'HIFO') {
      sorted.sort((a, b) => b.costPerUnit - a.costPerUnit)
    } else if (strategy === 'LOFO') {
      sorted.sort((a, b) => a.costPerUnit - b.costPerUnit)
    }
    return sorted
  }

  function matchTrades (lots, sells, strategy) {
    const workingLots = lots.map((lot) => ({ ...lot }))
    const matches = []
    const errors = []

    const sortedSells = sells
      .slice()
      .sort((a, b) => a.tradeDate - b.tradeDate)

    sortedSells.forEach((sell) => {
      let remainingQty = sell.quantity

      const candidates = workingLots.filter(
        (lot) =>
          lot.asset === sell.asset &&
          lot.quantityRemaining > 0 &&
          lot.acquiredDate <= sell.tradeDate
      )

      if (!candidates.length) {
        errors.push(
          `Trade ${sell.tradeId}: no lots available for ${sell.asset}.`
        )
        return
      }

      const orderedLots = sortLots(candidates, strategy)

      for (const lot of orderedLots) {
        if (remainingQty <= 0) {
          break
        }

        const qty = Math.min(remainingQty, lot.quantityRemaining)
        if (qty <= 0) {
          continue
        }

        lot.quantityRemaining -= qty
        remainingQty -= qty

        const proceeds = qty * sell.priceUsd - sell.feesUsd * (qty / sell.quantity)
        const cost = qty * lot.costPerUnit
        const gain = proceeds - cost
        const holdingDays = Math.floor(
          (sell.tradeDate - lot.acquiredDate) / DAY_MS
        )
        const term = holdingDays >= 365 ? 'Long-term' : 'Short-term'

        matches.push({
          tradeId: sell.tradeId,
          lotId: lot.lotId,
          asset: sell.asset,
          acquiredDate: lot.acquiredDate,
          tradeDate: sell.tradeDate,
          quantity: qty,
          proceeds,
          cost,
          gain,
          holdingDays,
          term
        })
      }

      if (remainingQty > 1e-6) {
        errors.push(
          `Trade ${sell.tradeId}: insufficient lots to cover ${remainingQty.toFixed(
            6
          )} ${sell.asset}.`
        )
      }
    })

    return { matches, errors }
  }

  function summarizeMatches (matches) {
    const summaryByAsset = {}
    const totals = {
      shortTermGain: 0,
      longTermGain: 0,
      totalGain: 0,
      proceeds: 0,
      cost: 0,
      trades: new Set()
    }

    matches.forEach((match) => {
      const asset = match.asset
      if (!summaryByAsset[asset]) {
        summaryByAsset[asset] = {
          asset,
          shortTermGain: 0,
          longTermGain: 0,
          totalGain: 0,
          proceeds: 0,
          cost: 0
        }
      }

      const bucket = summaryByAsset[asset]
      if (match.term === 'Long-term') {
        bucket.longTermGain += match.gain
        totals.longTermGain += match.gain
      } else {
        bucket.shortTermGain += match.gain
        totals.shortTermGain += match.gain
      }

      bucket.totalGain += match.gain
      bucket.proceeds += match.proceeds
      bucket.cost += match.cost

      totals.totalGain += match.gain
      totals.proceeds += match.proceeds
      totals.cost += match.cost
      totals.trades.add(match.tradeId)
    })

    totals.trades = totals.trades.size

    return { summaryByAsset, totals }
  }

  function computeStrategy (lots, sells, strategy) {
    const { matches, errors } = matchTrades(lots, sells, strategy)
    const { summaryByAsset, totals } = summarizeMatches(matches)

    return {
      strategy,
      matches,
      summaryByAsset,
      totals,
      errors
    }
  }

  function computeAllStrategies (lots, sells, strategies) {
    const results = {}
    strategies.forEach((strategy) => {
      results[strategy] = computeStrategy(lots, sells, strategy)
    })
    return results
  }

  function getOrdinaryBracketRate (income, status) {
    const brackets = TAX_BRACKETS_2025[status] || TAX_BRACKETS_2025.single
    const value = Number.isFinite(income) ? income : 0

    for (const bracket of brackets) {
      if (value >= bracket.min && (bracket.max === null || value <= bracket.max)) {
        return { rate: bracket.rate, bracket }
      }
    }

    const last = brackets[brackets.length - 1]
    return { rate: last.rate, bracket: last }
  }

  function estimateTax (totals, profile) {
    const shortTermGain = totals.shortTermGain || 0
    const longTermGain = totals.longTermGain || 0
    const ordinaryRate = profile.ordinaryRate || 0
    const longTermRate = profile.longTermRate || 0
    const applyNiit = profile.applyNiit

    const shortTermTax = Math.max(0, shortTermGain) * ordinaryRate
    const longTermTax = Math.max(0, longTermGain) * longTermRate
    const niitTax = applyNiit
      ? Math.max(0, shortTermGain + longTermGain) * 0.038
      : 0

    return {
      shortTermTax,
      longTermTax,
      niitTax,
      totalTax: shortTermTax + longTermTax + niitTax
    }
  }

  function escapeCsvValue (value) {
    if (value === null || value === undefined) {
      return ''
    }
    const str = String(value)
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  function toCsv (rows) {
    return rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')
  }

  function buildLotMatchRows (matches) {
    const rows = [
      [
        'trade_id',
        'lot_id',
        'asset',
        'acquired_date',
        'trade_date',
        'quantity',
        'proceeds',
        'cost',
        'gain',
        'holding_days',
        'term'
      ]
    ]

    matches.forEach((match) => {
      rows.push([
        match.tradeId,
        match.lotId,
        match.asset,
        formatDate(match.acquiredDate),
        formatDate(match.tradeDate),
        match.quantity,
        match.proceeds.toFixed(2),
        match.cost.toFixed(2),
        match.gain.toFixed(2),
        match.holdingDays,
        match.term
      ])
    })

    return rows
  }

  function buildSummaryRows (summaryByAsset) {
    const rows = [
      [
        'asset',
        'short_term_gain',
        'long_term_gain',
        'total_gain',
        'proceeds',
        'cost'
      ]
    ]

    Object.values(summaryByAsset).forEach((summary) => {
      rows.push([
        summary.asset,
        summary.shortTermGain.toFixed(2),
        summary.longTermGain.toFixed(2),
        summary.totalGain.toFixed(2),
        summary.proceeds.toFixed(2),
        summary.cost.toFixed(2)
      ])
    })

    return rows
  }

  function buildForm8949Rows (matches) {
    const rows = [
      [
        'Description',
        'Date Acquired',
        'Date Sold',
        'Proceeds',
        'Cost Basis',
        'Gain/Loss'
      ]
    ]

    matches.forEach((match) => {
      const description = `${match.asset} (${match.quantity})`
      rows.push([
        description,
        formatDate(match.acquiredDate),
        formatDate(match.tradeDate),
        match.proceeds.toFixed(2),
        match.cost.toFixed(2),
        match.gain.toFixed(2)
      ])
    })

    return rows
  }

  return {
    TAX_BRACKETS_2025,
    parseCsv,
    parseCsvRecords,
    parsePositionsCsv,
    parseTradesCsv,
    buildLots,
    matchTrades,
    summarizeMatches,
    computeStrategy,
    computeAllStrategies,
    getOrdinaryBracketRate,
    estimateTax,
    buildLotMatchRows,
    buildSummaryRows,
    buildForm8949Rows,
    toCsv,
    formatDate
  }
})
