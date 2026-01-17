(() => {
  const logic = window.AssetTaxCalc
  if (!logic) {
    return
  }

  const {
    parsePositionsCsv,
    parseTradesCsv,
    buildLots,
    computeAllStrategies,
    getOrdinaryBracketRate,
    estimateTax,
    buildLotMatchRows,
    buildSummaryRows,
    buildForm8949Rows,
    toCsv,
    formatDate
  } = logic

  const STRATEGIES = ['FIFO', 'LIFO', 'HIFO', 'LOFO']

  const elements = {
    positionsFile: document.getElementById('positionsFile'),
    tradesFile: document.getElementById('tradesFile'),
    positionsMeta: document.getElementById('positionsMeta'),
    tradesMeta: document.getElementById('tradesMeta'),
    statusTitle: document.getElementById('statusTitle'),
    statusList: document.getElementById('statusList'),
    filingStatus: document.getElementById('filingStatus'),
    bracketMode: document.getElementById('bracketMode'),
    totalIncome: document.getElementById('totalIncome'),
    manualBracket: document.getElementById('manualBracket'),
    incomeField: document.getElementById('incomeField'),
    manualField: document.getElementById('manualField'),
    autoBracketLabel: document.getElementById('autoBracketLabel'),
    longTermRate: document.getElementById('longTermRate'),
    niitToggle: document.getElementById('niitToggle'),
    bestStrategy: document.getElementById('bestStrategy'),
    metricTotalGain: document.getElementById('metricTotalGain'),
    metricShortGain: document.getElementById('metricShortGain'),
    metricLongGain: document.getElementById('metricLongGain'),
    metricTotalTax: document.getElementById('metricTotalTax'),
    metricAfterTax: document.getElementById('metricAfterTax'),
    metricEffectiveRate: document.getElementById('metricEffectiveRate'),
    metricTrades: document.getElementById('metricTrades'),
    strategyTableBody: document.getElementById('strategyTableBody'),
    matchesTableBody: document.getElementById('matchesTableBody'),
    summaryTableBody: document.getElementById('summaryTableBody'),
    loadSampleData: document.getElementById('loadSampleData'),
    clearData: document.getElementById('clearData'),
    exportButtons: document.querySelectorAll('[data-export]')
  }

  const sampleData = {
    positions: `lot_id,asset,acquired_date,quantity,cost_basis_usd,account,notes
lot-1,MSFT,2021-03-18,40,7200,Brokerage 1,Core position
lot-2,GOOGL,2022-08-09,15,1800,Brokerage 1,Long-term lot
lot-3,TSLA,2024-02-02,12,2400,Brokerage 1,Starter lot
`,
    trades: `trade_id,asset,side,trade_date,quantity,price_usd,fees_usd,account,notes
trade-1,MSFT,SELL,2025-02-10,15,410,10,Brokerage 1,Trim position
trade-2,MSFT,SELL,2025-07-21,5,430,6,Brokerage 1,Tax planning
trade-3,GOOGL,BUY,2025-03-05,6,165,4,Brokerage 1,Add shares
trade-4,GOOGL,SELL,2025-10-14,8,175,5,Brokerage 1,Rebalance
trade-5,TSLA,SELL,2025-05-30,6,240,8,Brokerage 1,Cash needs
trade-6,TSLA,BUY,2025-08-18,4,220,5,Brokerage 1,Add on dip
`
  }

  const state = {
    positionsText: '',
    tradesText: '',
    results: null
  }

  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  })

  function formatCurrency (value) {
    return currencyFormatter.format(Number.isFinite(value) ? value : 0)
  }

  function formatRate (value) {
    if (!Number.isFinite(value)) {
      return '0%'
    }
    return `${(value * 100).toFixed(1)}%`
  }

  function escapeHtml (value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function setStatus (title, messages) {
    elements.statusTitle.textContent = title
    elements.statusList.innerHTML = ''
    if (messages.length) {
      messages.forEach((message) => {
        const li = document.createElement('li')
        li.textContent = message
        elements.statusList.appendChild(li)
      })
    }
  }

  function updateBracketMode () {
    const mode = elements.bracketMode.value
    if (mode === 'manual') {
      elements.manualField.classList.remove('is-hidden')
      elements.incomeField.classList.add('is-hidden')
    } else {
      elements.manualField.classList.add('is-hidden')
      elements.incomeField.classList.remove('is-hidden')
    }
  }

  function parseNumberInput (value) {
    const num = Number(String(value || '').replace(/[$,]/g, ''))
    return Number.isFinite(num) ? num : 0
  }

  function getSelectedStrategy () {
    const selected = document.querySelector('input[name="strategy"]:checked')
    return selected ? selected.value : STRATEGIES[0]
  }

  function getProfile () {
    const filingStatus = elements.filingStatus.value
    const bracketMode = elements.bracketMode.value
    const income = parseNumberInput(elements.totalIncome.value)
    const manualRate = Number(elements.manualBracket.value)
    const longTermRate = Number(elements.longTermRate.value)
    const applyNiit = elements.niitToggle.checked

    let ordinaryRate = 0
    let bracketLabel = ''

    if (bracketMode === 'manual') {
      ordinaryRate = manualRate
      bracketLabel = `Manual: ${(manualRate * 100).toFixed(0)}%`
    } else {
      const bracketInfo = getOrdinaryBracketRate(income, filingStatus)
      ordinaryRate = bracketInfo.rate
      const min = bracketInfo.bracket.min.toLocaleString('en-US')
      const max = bracketInfo.bracket.max
      const range = max
        ? `$${min} - $${max.toLocaleString('en-US')}`
        : `$${min}+`
      bracketLabel = `${(ordinaryRate * 100).toFixed(0)}% (${range})`
    }

    elements.autoBracketLabel.textContent = `Bracket: ${bracketLabel}`

    return {
      filingStatus,
      bracketMode,
      income,
      ordinaryRate,
      longTermRate,
      applyNiit
    }
  }

  function renderEmptyTables () {
    elements.strategyTableBody.innerHTML =
      '<tr><td colspan="6">Upload CSVs to see strategy comparisons.</td></tr>'
    elements.matchesTableBody.innerHTML =
      '<tr><td colspan="10">No matches yet.</td></tr>'
    elements.summaryTableBody.innerHTML =
      '<tr><td colspan="6">No summary available.</td></tr>'
  }

  function renderSummary (result, tax) {
    const totals = result.totals
    const totalGain = totals.totalGain
    const totalTax = tax.totalTax
    const afterTax = totalGain - totalTax
    const effectiveRate = totalGain > 0 ? totalTax / totalGain : 0

    elements.metricTotalGain.textContent = formatCurrency(totalGain)
    elements.metricShortGain.textContent = formatCurrency(totals.shortTermGain)
    elements.metricLongGain.textContent = formatCurrency(totals.longTermGain)
    elements.metricTotalTax.textContent = formatCurrency(totalTax)
    elements.metricAfterTax.textContent = formatCurrency(afterTax)
    elements.metricEffectiveRate.textContent = formatRate(effectiveRate)
    elements.metricTrades.textContent = `${totals.trades} trades`
  }

  function renderStrategyTable (results) {
    const rows = STRATEGIES.map((strategy) => {
      const result = results[strategy]
      const totals = result.totals
      const tax = result.tax
      const totalGain = totals.totalGain
      const afterTax = totalGain - tax.totalTax
      return {
        strategy,
        totalGain,
        shortTerm: totals.shortTermGain,
        longTerm: totals.longTermGain,
        totalTax: tax.totalTax,
        afterTax
      }
    })

    let best = rows[0]
    rows.forEach((row) => {
      if (row.totalTax < best.totalTax) {
        best = row
      }
    })

    elements.bestStrategy.textContent = best ? best.strategy : 'N/A'

    elements.strategyTableBody.innerHTML = rows
      .map((row) => {
        const highlight = row.strategy === best.strategy ? ' best' : ''
        return `<tr class="${highlight}">
          <td>${escapeHtml(row.strategy)}</td>
          <td>${formatCurrency(row.totalGain)}</td>
          <td>${formatCurrency(row.shortTerm)}</td>
          <td>${formatCurrency(row.longTerm)}</td>
          <td>${formatCurrency(row.totalTax)}</td>
          <td>${formatCurrency(row.afterTax)}</td>
        </tr>`
      })
      .join('')
  }

  function renderMatches (matches) {
    if (!matches.length) {
      elements.matchesTableBody.innerHTML =
        '<tr><td colspan="10">No matches available.</td></tr>'
      return
    }

    elements.matchesTableBody.innerHTML = matches
      .map((match) => {
        return `<tr>
          <td>${escapeHtml(match.tradeId)}</td>
          <td>${escapeHtml(match.asset)}</td>
          <td>${escapeHtml(match.lotId)}</td>
          <td>${escapeHtml(formatDate(match.acquiredDate))}</td>
          <td>${escapeHtml(formatDate(match.tradeDate))}</td>
          <td>${match.quantity.toFixed(6)}</td>
          <td>${formatCurrency(match.proceeds)}</td>
          <td>${formatCurrency(match.cost)}</td>
          <td>${formatCurrency(match.gain)}</td>
          <td>${escapeHtml(match.term)}</td>
        </tr>`
      })
      .join('')
  }

  function renderSummaryTable (summaryByAsset) {
    const rows = Object.values(summaryByAsset)

    if (!rows.length) {
      elements.summaryTableBody.innerHTML =
        '<tr><td colspan="6">No assets summarized.</td></tr>'
      return
    }

    elements.summaryTableBody.innerHTML = rows
      .map((row) => {
        return `<tr>
          <td>${escapeHtml(row.asset)}</td>
          <td>${formatCurrency(row.shortTermGain)}</td>
          <td>${formatCurrency(row.longTermGain)}</td>
          <td>${formatCurrency(row.totalGain)}</td>
          <td>${formatCurrency(row.proceeds)}</td>
          <td>${formatCurrency(row.cost)}</td>
        </tr>`
      })
      .join('')
  }

  function updateExportState (enabled) {
    elements.exportButtons.forEach((button) => {
      button.disabled = !enabled
    })
  }

  function runCalculation () {
    const profile = getProfile()

    if (!state.positionsText || !state.tradesText) {
      setStatus('Upload both CSV files to begin.', [])
      renderEmptyTables()
      updateExportState(false)
      elements.bestStrategy.textContent = 'N/A'
      elements.metricTotalGain.textContent = '$0'
      elements.metricShortGain.textContent = '$0'
      elements.metricLongGain.textContent = '$0'
      elements.metricTotalTax.textContent = '$0'
      elements.metricAfterTax.textContent = '$0'
      elements.metricEffectiveRate.textContent = '0%'
      elements.metricTrades.textContent = '0 trades'
      return
    }

    const positions = parsePositionsCsv(state.positionsText)
    const trades = parseTradesCsv(state.tradesText)

    const errors = [...positions.errors, ...trades.errors]
    const warnings = [
      ...(positions.warnings || []),
      ...(trades.warnings || [])
    ]

    if (errors.length) {
      setStatus('Fix CSV issues to continue.', errors)
      renderEmptyTables()
      updateExportState(false)
      return
    }

    const lots = buildLots(positions.lots, trades.buys)
    const results = computeAllStrategies(lots, trades.sells, STRATEGIES)

    Object.values(results).forEach((result) => {
      result.tax = estimateTax(result.totals, profile)
      warnings.push(...result.errors)
    })

    setStatus(
      warnings.length ? 'Calculations complete with warnings.' : 'Calculations complete.',
      warnings
    )

    state.results = results

    renderStrategyTable(results)

    const selected = getSelectedStrategy()
    const selectedResult = results[selected]
    renderSummary(selectedResult, selectedResult.tax)
    renderMatches(selectedResult.matches)
    renderSummaryTable(selectedResult.summaryByAsset)
    updateExportState(true)
  }

  async function handleFileChange (target) {
    const file = target.files && target.files[0]
    if (!file) {
      return
    }
    const text = await file.text()
    const rowCount = Math.max(0, text.split(/\r?\n/).length - 1)

    if (target === elements.positionsFile) {
      state.positionsText = text
      elements.positionsMeta.textContent = `${file.name} (${rowCount} rows)`
    } else {
      state.tradesText = text
      elements.tradesMeta.textContent = `${file.name} (${rowCount} rows)`
    }

    runCalculation()
  }

  function clearFiles () {
    elements.positionsFile.value = ''
    elements.tradesFile.value = ''
    elements.positionsMeta.textContent = 'No file loaded'
    elements.tradesMeta.textContent = 'No file loaded'
    state.positionsText = ''
    state.tradesText = ''
    state.results = null
    runCalculation()
  }

  function loadSampleFiles () {
    state.positionsText = sampleData.positions
    state.tradesText = sampleData.trades
    elements.positionsMeta.textContent = 'Sample data loaded'
    elements.tradesMeta.textContent = 'Sample data loaded'
    runCalculation()
  }

  function downloadCsv (filename, rows) {
    const blob = new Blob([toCsv(rows)], { type: 'text/csv' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(link.href)
  }

  function handleExport (type) {
    if (!state.results) {
      return
    }

    const selected = getSelectedStrategy()
    const result = state.results[selected]

    if (type === 'matches') {
      downloadCsv('lot_matches.csv', buildLotMatchRows(result.matches))
    }

    if (type === 'summary') {
      downloadCsv(
        'asset_summary.csv',
        buildSummaryRows(result.summaryByAsset)
      )
    }

    if (type === 'form8949') {
      downloadCsv('form_8949.csv', buildForm8949Rows(result.matches))
    }
  }

  elements.positionsFile.addEventListener('change', (event) => {
    handleFileChange(event.target)
  })

  elements.tradesFile.addEventListener('change', (event) => {
    handleFileChange(event.target)
  })

  elements.loadSampleData.addEventListener('click', () => {
    loadSampleFiles()
  })

  elements.clearData.addEventListener('click', () => {
    clearFiles()
  })

  elements.bracketMode.addEventListener('change', () => {
    updateBracketMode()
    runCalculation()
  })

  elements.filingStatus.addEventListener('change', runCalculation)
  elements.totalIncome.addEventListener('input', runCalculation)
  elements.manualBracket.addEventListener('change', runCalculation)
  elements.longTermRate.addEventListener('change', runCalculation)
  elements.niitToggle.addEventListener('change', runCalculation)

  document.querySelectorAll('input[name="strategy"]').forEach((input) => {
    input.addEventListener('change', runCalculation)
  })

  elements.exportButtons.forEach((button) => {
    button.addEventListener('click', () => {
      handleExport(button.dataset.export)
    })
  })

  document.querySelectorAll('.upload-zone').forEach((zone) => {
    zone.addEventListener('dragover', (event) => {
      event.preventDefault()
      zone.classList.add('is-dragover')
    })

    zone.addEventListener('dragleave', () => {
      zone.classList.remove('is-dragover')
    })

    zone.addEventListener('drop', (event) => {
      event.preventDefault()
      zone.classList.remove('is-dragover')
      const file = event.dataTransfer.files[0]
      if (!file) {
        return
      }

      const targetId = zone.dataset.target
      const input = document.getElementById(targetId)
      if (!input) {
        return
      }

      const dataTransfer = new window.DataTransfer()
      dataTransfer.items.add(file)
      input.files = dataTransfer.files
      handleFileChange(input)
    })
  })

  updateBracketMode()
  renderEmptyTables()
  updateExportState(false)
  setStatus('Upload both CSV files to begin.', [])
})()
