import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import DateFilter, { filterByDate } from '../components/DateFilter'
import { CATEGORIES, usd } from '../lib/constants'
import * as XLSX from 'xlsx'

export async function getServerSideProps() { return { props: {} } }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <div className="section-title" style={{ marginBottom: '0.75rem' }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, value, bold, indent, color, topBorder, pct }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: indent ? '8px 0 8px 20px' : '9px 0', borderTop: topBorder ? '2px solid var(--border)' : '1px solid var(--border)', fontWeight: bold ? 600 : 400 }}>
      <span style={{ color: bold ? 'var(--text)' : 'var(--text-muted)', fontSize: 13 }}>{label}</span>
      <div style={{ textAlign: 'right' }}>
        <span style={{ color: color || (bold ? 'var(--text)' : 'var(--text-muted)'), fontSize: 13 }}>{usd(value)}</span>
        {pct !== undefined && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>({pct.toFixed(1)}%)</span>}
      </div>
    </div>
  )
}

export default function Reports() {
  const [txs, setTxs] = useState([])
  const [sales, setSales] = useState([])
  const [payables, setPayables] = useState([])
  const [receivables, setReceivables] = useState([])
  const [gifted, setGifted] = useState([])
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [dateRange, setDateRange] = useState({ from: null, to: null })
  const [activeTab, setActiveTab] = useState('pnl')

  useEffect(() => {
    Promise.all([
      fetch('/api/transactions?t=' + Date.now()).then(r => r.json()),
      fetch('/api/sales?t=' + Date.now()).then(r => r.json()),
      fetch('/api/payables?t=' + Date.now()).then(r => r.json()),
      fetch('/api/receivables?t=' + Date.now()).then(r => r.json()),
      fetch('/api/gifted?t=' + Date.now()).then(r => r.json()),
    ]).then(([t, s, p, r, g]) => {
      setTxs(Array.isArray(t) ? t : [])
      setSales(Array.isArray(s) ? s : [])
      setPayables(Array.isArray(p) ? p : [])
      setReceivables(Array.isArray(r) ? r : [])
      setGifted(Array.isArray(g) ? g : [])
      setLoading(false)
    })
  }, [])

  // Filter by date
  const fTxs = filterByDate(txs, 'date', dateRange)
  const fSales = filterByDate(sales, 'date', dateRange)
  const fGifted = filterByDate(gifted, 'date', dateRange)

  // P&L
  const sum = cats => fTxs.filter(t => cats.includes(t.category)).reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const revenue = sum(['Sales — products', 'Returns & refunds'])
  const cogs = sum(['Inventory / product cost', 'Packaging', 'Shipping (outbound)'])
  const gross = revenue - cogs
  const grossPct = revenue > 0 ? gross / revenue * 100 : 0
  const marketing = sum(['Marketing & ads'])
  const tech = sum(['Website & tech'])
  const legal = sum(['Legal & professional fees'])
  const banking = sum(['Bank fees'])
  const shippingIn = sum(['Shipping (inbound)'])
  const other = sum(['Other expense'])
  const opex = marketing + tech + legal + banking + shippingIn + other
  const netIncome = gross - opex
  const netPct = revenue > 0 ? netIncome / revenue * 100 : 0
  const capital = sum(['Capital contribution'])
  const equity = capital + netIncome

  // Sales by channel
  const ecomSales = fSales.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const wsSales = fSales.filter(o => o.channel !== 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)

  // Gifted cost
  const giftedCost = fGifted.reduce((a, g) => a + (g.gifted_item_lines?.reduce((b, l) => b + parseFloat(l.quantity || 0) * parseFloat(l.unit_cost || 0), 0) || 0), 0)

  // AP/AR
  const totalAP = payables.filter(p => p.status !== 'paid').reduce((a, p) => a + parseFloat(p.amount || 0), 0)
  const totalAR = receivables.filter(r => r.status !== 'paid').reduce((a, r) => a + parseFloat(r.amount || 0), 0)

  // Sales by state
  const salesByState = {}
  fSales.forEach(o => {
    if (!o.buyer_state) return
    if (!salesByState[o.buyer_state]) salesByState[o.buyer_state] = 0
    salesByState[o.buyer_state] += parseFloat(o.total_amount || 0)
  })

  // Vendors
  const vendors = {}
  fTxs.filter(t => CATEGORIES[t.category] === 'opex' || CATEGORIES[t.category] === 'cogs').forEach(t => {
    const v = t.note || t.description
    if (!vendors[v]) vendors[v] = 0
    vendors[v] += parseFloat(t.amount || 0)
  })

  // Excel export
  const exportExcel = async () => {
    setExporting(true)
    try {
      const wb = XLSX.utils.book_new()
      const USD = '$#,##0.00;($#,##0.00);"-"'
      const PCT = '0.0%'

      const addSheet = (name, data, cols) => {
        const ws = XLSX.utils.aoa_to_sheet(data)
        if (cols) ws['!cols'] = cols.map(w => ({ wch: w }))
        XLSX.utils.book_append_sheet(wb, ws, name)
        return ws
      }

      const periodLabel = (dateRange.from || 'All') + ' — ' + (dateRange.to || 'Present')

      // ── 1. P&L / Form 1065 Prep ──────────────────────────────────
      const pnlData = [
        ['CLIQUE BEAUTY SKINCARE LLC'],
        ['Form 1065 — Partnership Return Preparation'],
        ['Period: ' + periodLabel],
        [''],
        ['INCOME STATEMENT (P&L)', ''],
        ['', ''],
        ['REVENUE', ''],
        ['  Gross sales', revenue],
        ['  Cost of goods sold (COGS)', cogs],
        ['  Gross profit', gross],
        ['  Gross margin %', grossPct / 100],
        [''],
        ['OPERATING EXPENSES', ''],
        ['  Marketing & advertising', marketing],
        ['  Website & technology', tech],
        ['  Legal & professional fees', legal],
        ['  Bank fees', banking],
        ['  Shipping (inbound)', shippingIn],
        ['  Other expenses', other],
        ['  Total operating expenses', opex],
        [''],
        ['NET INCOME (LOSS)', netIncome],
        ['  Net margin %', netPct / 100],
        [''],
        ['PARTNERSHIP ALLOCATION (50/50)', ''],
        ['  Member 1 — 50% share', netIncome * 0.5],
        ['  Member 2 — 50% share', netIncome * 0.5],
        [''],
        ['BALANCE SHEET SUMMARY', ''],
        ['  Capital contributed', capital],
        ['  Net income', netIncome],
        ['  Total equity', equity],
        ['  Accounts receivable (AR)', totalAR],
        ['  Accounts payable (AP)', totalAP],
      ]
      const pnlWs = addSheet('Form 1065 Prep', pnlData, [40, 18])
      // Format currency cells
      const currRows = [8, 9, 10, 14, 15, 16, 17, 18, 19, 20, 22, 26, 27, 31, 32, 33, 34, 35]
      currRows.forEach(r => {
        const cell = pnlWs['B' + r]
        if (cell) cell.z = USD
      })
      pnlWs['B11'] && (pnlWs['B11'].z = PCT)
      pnlWs['B24'] && (pnlWs['B24'].z = PCT)

      // ── 2. Schedule K-1 ──────────────────────────────────────────
      const k1Data = [
        ['SCHEDULE K-1 — PARTNER\'S SHARE OF INCOME'],
        ['Clique Beauty Skincare LLC · ' + periodLabel],
        [''],
        ['LINE', 'DESCRIPTION', 'MEMBER 1 (50%)', 'MEMBER 2 (50%)'],
        ['1', 'Ordinary business income (loss)', netIncome * 0.5, netIncome * 0.5],
        ['2', 'Net rental real estate income', 0, 0],
        ['4', 'Guaranteed payments', 0, 0],
        ['6a', 'Ordinary dividends', 0, 0],
        ['9a', 'Net long-term capital gain', 0, 0],
        ['13', 'Other deductions — Marketing', marketing * 0.5, marketing * 0.5],
        ['', 'Other deductions — Professional fees', legal * 0.5, legal * 0.5],
        [''],
        ['NOTE: File with personal Form 1040. Deadline: March 15 (extension to Sept 15)'],
        ['Kentucky residents also file Form 765'],
      ]
      const k1Ws = addSheet('Schedule K-1', k1Data, [8, 42, 18, 18])
      ;['C5','D5','C10','D10','C11','D11'].forEach(c => { if (k1Ws[c]) k1Ws[c].z = USD })

      // ── 3. Sales Detail ──────────────────────────────────────────
      const salesData = [
        ['SALES DETAIL — ' + periodLabel],
        [''],
        ['SUMMARY BY CHANNEL', ''],
        ['E-commerce', ecomSales],
        ['Wholesale', wsSales],
        ['Total', ecomSales + wsSales],
        [''],
        ['DATE', 'REFERENCE', 'CHANNEL', 'DISTRIBUTOR', 'BUYER', 'STATE', 'PRODUCTS', 'AMOUNT', 'PAYMENT STATUS'],
        ...fSales.map(o => [
          o.date, o.reference || '', o.channel,
          o.distributors?.name || '',
          o.buyer_name || '',
          o.buyer_state || '',
          o.sale_items?.map(i => i.inventory?.product_name + ' ×' + i.quantity).join(', ') || '',
          parseFloat(o.total_amount || 0),
          o.payment_status || 'paid'
        ])
      ]
      const salesWs = addSheet('Sales Detail', salesData, [12, 16, 18, 20, 22, 8, 35, 14, 14])
      for (let i = 9; i <= 9 + fSales.length; i++) {
        if (salesWs['H' + i]) salesWs['H' + i].z = USD
      }

      // ── 4. Sales Tax by State ─────────────────────────────────────
      const stateData = [
        ['SALES TAX SUMMARY BY STATE — ' + periodLabel],
        ['NOTE: Consult your CPA for nexus and collection requirements per state'],
        [''],
        ['STATE', 'ORDERS', 'TOTAL SALES', 'NOTES'],
        ...Object.entries(salesByState).sort((a, b) => b[1] - a[1]).map(([state, total]) => [
          state,
          fSales.filter(o => o.buyer_state === state).length,
          total,
          total > 100000 ? '⚠ Check nexus obligations' : ''
        ]),
        [''],
        ['TOTAL', fSales.length, ecomSales + wsSales, ''],
      ]
      const stateWs = addSheet('Sales Tax by State', stateData, [12, 10, 16, 30])
      for (let i = 5; i <= 5 + Object.keys(salesByState).length + 1; i++) {
        if (stateWs['C' + i]) stateWs['C' + i].z = USD
      }

      // ── 5. Expenses Detail ───────────────────────────────────────
      const expData = [
        ['EXPENSES DETAIL — ' + periodLabel],
        [''],
        ['CATEGORY SUMMARY', ''],
        ...Object.entries(
          fTxs.filter(t => CATEGORIES[t.category] === 'opex' || CATEGORIES[t.category] === 'cogs')
            .reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + parseFloat(t.amount || 0); return acc }, {})
        ).sort((a, b) => b[1] - a[1]).map(([cat, total]) => [cat, total]),
        ['TOTAL', opex + cogs],
        [''],
        ['DATE', 'DESCRIPTION', 'CATEGORY', 'AMOUNT', 'NOTE'],
        ...fTxs.filter(t => CATEGORIES[t.category] === 'opex' || CATEGORIES[t.category] === 'cogs')
          .map(t => [t.date, t.description, t.category, parseFloat(t.amount || 0), t.note || ''])
      ]
      const expWs = addSheet('Expenses Detail', expData, [12, 38, 28, 14, 25])

      // ── 6. 1099 Prep ─────────────────────────────────────────────
      const v1099 = Object.entries(vendors).filter(([, v]) => v >= 600).sort((a, b) => b[1] - a[1])
      const data1099 = [
        ['1099-NEC / 1099-MISC PREPARATION — ' + periodLabel],
        ['Vendors/contractors paid $600 or more — may require 1099 filing'],
        ['IMPORTANT: Verify with your CPA which vendors require 1099'],
        [''],
        ['VENDOR / DESCRIPTION', 'TOTAL PAID', 'FORM REQUIRED', 'NOTES'],
        ...v1099.map(([name, total]) => [
          name, total,
          total >= 600 ? '1099-NEC or MISC' : '',
          'Verify if incorporated (corps generally exempt)'
        ]),
        [''],
        ['TOTAL POTENTIALLY REPORTABLE', v1099.reduce((a, [, v]) => a + v, 0), '', ''],
      ]
      const ws1099 = addSheet('1099 Prep', data1099, [40, 16, 20, 38])
      for (let i = 6; i <= 6 + v1099.length + 1; i++) {
        if (ws1099['B' + i]) ws1099['B' + i].z = USD
      }

      // ── 7. Gifted & Marketing ─────────────────────────────────────
      const giftData = [
        ['GIFTED PRODUCTS & MARKETING SPEND — ' + periodLabel],
        [''],
        ['SUMMARY', ''],
        ['Marketing & advertising', marketing],
        ['Gifted products (at cost)', giftedCost],
        ['Total marketing spend', marketing + giftedCost],
        [''],
        ['GIFTED DETAIL', ''],
        ['DATE', 'RECIPIENT', 'OCCASION', 'PRODUCTS', 'COST'],
        ...fGifted.map(g => {
          const cost = g.gifted_item_lines?.reduce((a, l) => a + parseFloat(l.quantity || 0) * parseFloat(l.unit_cost || 0), 0) || 0
          return [g.date, g.recipient, g.occasion || '', g.gifted_item_lines?.map(l => l.inventory?.product_name + ' ×' + l.quantity).join(', ') || '', cost]
        })
      ]
      addSheet('Gifted & Marketing', giftData, [12, 28, 20, 38, 14])

      // ── 8. Transactions Journal ───────────────────────────────────
      const journalData = [
        ['TRANSACTIONS JOURNAL — ' + periodLabel],
        [''],
        ['DATE', 'DESCRIPTION', 'CATEGORY', 'TYPE', 'AMOUNT', 'NOTE'],
        ...fTxs.map(t => [t.date, t.description, t.category, CATEGORIES[t.category] || '', parseFloat(t.amount || 0), t.note || ''])
      ]
      const jWs = addSheet('Transactions Journal', journalData, [12, 40, 28, 12, 14, 25])
      for (let i = 4; i <= 4 + fTxs.length; i++) {
        if (jWs['E' + i]) jWs['E' + i].z = USD
      }

      // Download
      const filename = 'CliqueBeatuy_Tax_' + (dateRange.from || 'All') + '.xlsx'
      XLSX.writeFile(wb, filename)
    } catch (err) {
      alert('Export error: ' + err.message)
    } finally {
      setExporting(false)
    }
  }

  const TABS = [
    { id: 'pnl', label: 'P&L' },
    { id: 'cashflow', label: 'Cash Flow' },
    { id: 'channels', label: 'Sales by Channel' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'gifted', label: 'Gifted & Marketing' },
    { id: 'tax', label: 'Tax Prep' },
  ]

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Financial statements · Tax preparation · FY 2025</p>
        </div>
        <button className="primary" onClick={exportExcel} disabled={exporting} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {exporting ? '⏳ Generating…' : '⬇ Export Excel (Tax Package)'}
        </button>
      </div>

      <DateFilter onChange={setDateRange} />

      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={'tab-btn' + (activeTab === t.id ? ' active' : '')}>{t.label}</button>)}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <>
          {/* P&L */}
          {activeTab === 'pnl' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.5rem' }}>Income Statement</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: '1rem' }}>Clique Beauty Skincare LLC · {dateRange.from || 'All'} — {dateRange.to || 'Present'}</div>
                <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '8px 0 4px' }}>Revenue</div>
                <Row label="Gross sales" value={revenue} color="var(--green)" />
                <Row label="Cost of goods sold" value={cogs} color="var(--amber)" />
                <Row label="Gross profit" value={gross} bold topBorder color={gross >= 0 ? 'var(--green)' : 'var(--red)'} pct={grossPct} />
                <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '12px 0 4px' }}>Operating Expenses</div>
                <Row label="Marketing & advertising" value={marketing} indent />
                <Row label="Website & technology" value={tech} indent />
                <Row label="Legal & professional fees" value={legal} indent />
                <Row label="Bank fees" value={banking} indent />
                <Row label="Shipping (inbound)" value={shippingIn} indent />
                <Row label="Other expenses" value={other} indent />
                <Row label="Total operating expenses" value={opex} bold topBorder />
                <Row label="Net income" value={netIncome} bold topBorder color={netIncome >= 0 ? 'var(--green)' : 'var(--red)'} pct={netPct} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div className="card">
                  <div className="section-title" style={{ marginBottom: '0.75rem' }}>Key Ratios</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[['Gross margin', grossPct.toFixed(1) + '%', grossPct >= 0 ? 'var(--green)' : 'var(--red)'],
                      ['Net margin', netPct.toFixed(1) + '%', netPct >= 0 ? 'var(--green)' : 'var(--red)'],
                      ['Total revenue', usd(revenue), 'var(--green)'],
                      ['Net income', usd(netIncome), netIncome >= 0 ? 'var(--green)' : 'var(--red)']
                    ].map(([l, v, c]) => (
                      <div key={l} style={{ padding: '10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{l}</div>
                        <div style={{ fontSize: 20, fontWeight: 300, color: c }}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div className="section-title" style={{ marginBottom: '0.75rem' }}>Partnership Allocation (50/50)</div>
                  {[['Member 1', netIncome * 0.5], ['Member 2', netIncome * 0.5]].map(([name, share]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{name} — 50%</span>
                      <span style={{ fontWeight: 600, color: share >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(share)}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: '0.75rem', fontSize: 12, color: 'var(--text-muted)', background: 'var(--blue-light)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                    Report on Schedule K-1 · Due March 15, 2026 · Extension available
                  </div>
                </div>

                <div className="card">
                  <div className="section-title" style={{ marginBottom: '0.75rem' }}>Equity Summary</div>
                  <Row label="Capital contributed" value={capital} />
                  <Row label="Net income" value={netIncome} />
                  <Row label="Total equity" value={equity} bold topBorder color={equity >= 0 ? 'var(--green)' : 'var(--red)'} />
                </div>
              </div>
            </div>
          )}

          {/* Cash Flow */}
          {activeTab === 'cashflow' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>Cash Flow Statement</div>
                <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--navy)', textTransform: 'uppercase', margin: '8px 0 4px' }}>Operating Activities</div>
                <Row label="Net income" value={netIncome} />
                <Row label="Changes in AR" value={-totalAR} indent color={-totalAR >= 0 ? 'var(--green)' : 'var(--red)'} />
                <Row label="Changes in AP" value={totalAP} indent color={totalAP >= 0 ? 'var(--green)' : 'var(--red)'} />
                <Row label="Net cash from operations" value={netIncome - totalAR + totalAP} bold topBorder color={netIncome - totalAR + totalAP >= 0 ? 'var(--green)' : 'var(--red)'} />
                <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--navy)', textTransform: 'uppercase', margin: '12px 0 4px' }}>Financing Activities</div>
                <Row label="Capital contributions" value={capital} />
                <Row label="Net cash from financing" value={capital} bold topBorder color="var(--green)" />
                <Row label="Net change in cash" value={netIncome - totalAR + totalAP + capital} bold topBorder color={(netIncome - totalAR + totalAP + capital) >= 0 ? 'var(--green)' : 'var(--red)'} />
              </div>
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>Working Capital</div>
                {[
                  ['Accounts receivable (AR)', totalAR, 'var(--green)'],
                  ['Accounts payable (AP)', totalAP, 'var(--red)'],
                  ['Net working capital', totalAR - totalAP, (totalAR - totalAP) >= 0 ? 'var(--green)' : 'var(--red)'],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                    <span style={{ fontWeight: 600, color: c }}>{usd(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sales by Channel */}
          {activeTab === 'channels' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>Revenue by Channel</div>
                {[['E-commerce', ecomSales, '#6A1B9A'], ['Wholesale', wsSales, 'var(--green)'], ['Total', ecomSales + wsSales, 'var(--navy)']].map(([l, v, c]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                    <div>
                      <span style={{ fontWeight: 600, color: c }}>{usd(v)}</span>
                      {(ecomSales + wsSales) > 0 && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>({(v / (ecomSales + wsSales) * 100).toFixed(1)}%)</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>Sales by State</div>
                {Object.keys(salesByState).length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No state data — add buyer addresses to your sales</div> :
                  Object.entries(salesByState).sort((a, b) => b[1] - a[1]).map(([state, total]) => (
                    <div key={state} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <span style={{ fontWeight: 600 }}>{state}</span>
                      <span style={{ color: 'var(--green)' }}>{usd(total)}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}

          {/* Expenses */}
          {activeTab === 'expenses' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Expenses by Category</span>
                <span style={{ fontWeight: 600, color: 'var(--red)' }}>{usd(opex + cogs)} total</span>
              </div>
              <table>
                <thead><tr><th>Category</th><th>Type</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>% of Revenue</th></tr></thead>
                <tbody>
                  {Object.entries(
                    fTxs.filter(t => CATEGORIES[t.category] === 'opex' || CATEGORIES[t.category] === 'cogs')
                      .reduce((acc, t) => { acc[t.category] = (acc[t.category] || 0) + parseFloat(t.amount || 0); return acc }, {})
                  ).sort((a, b) => b[1] - a[1]).map(([cat, total]) => (
                    <tr key={cat}>
                      <td style={{ fontWeight: 500 }}>{cat}</td>
                      <td><span className="pill" style={{ background: CATEGORIES[cat] === 'cogs' ? 'var(--amber-light)' : '#F3EEF8', color: CATEGORIES[cat] === 'cogs' ? 'var(--amber)' : '#5B3D8A', fontSize: 11 }}>{CATEGORIES[cat] === 'cogs' ? 'COGS' : 'OpEx'}</span></td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--red)' }}>{usd(total)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{revenue > 0 ? (total / revenue * 100).toFixed(1) + '%' : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Gifted & Marketing */}
          {activeTab === 'gifted' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>Marketing Spend</div>
                {[['Paid marketing (ads, fees)', marketing, 'var(--red)'], ['Gifted products (at cost)', giftedCost, 'var(--amber)'], ['Total marketing investment', marketing + giftedCost, 'var(--navy)']].map(([l, v, c]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 6, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                    <span style={{ fontWeight: 600, color: c }}>{usd(v)}</span>
                  </div>
                ))}
                {revenue > 0 && <div style={{ marginTop: '0.75rem', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>Marketing as % of revenue: <strong>{((marketing + giftedCost) / revenue * 100).toFixed(1)}%</strong></div>}
              </div>
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>Gifted Shipments</div>
                {fGifted.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No gifted items recorded</div> :
                  fGifted.map(g => {
                    const cost = g.gifted_item_lines?.reduce((a, l) => a + parseFloat(l.quantity || 0) * parseFloat(l.unit_cost || 0), 0) || 0
                    return (
                      <div key={g.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <div><div style={{ fontWeight: 500 }}>{g.recipient}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{g.date} · {g.occasion}</div></div>
                        <span style={{ fontWeight: 600, color: 'var(--red)' }}>{usd(cost)}</span>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Tax Prep */}
          {activeTab === 'tax' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>Filing Checklist — FY 2025</div>
                {[
                  ['Form 1065', 'Partnership Return', 'March 15, 2026', true],
                  ['Schedule K-1 (×2)', 'One per member', 'March 15, 2026', true],
                  ['Kentucky Form 765', 'State Partnership Return', 'March 15, 2026', true],
                  ['Form 7004', 'Extension (if needed)', 'March 15, 2026', false],
                  ['1099-NEC', 'Contractors paid >$600', 'January 31, 2026', false],
                ].map(([form, desc, due, required]) => (
                  <div key={form} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span style={{ minWidth: 8, height: 8, width: 8, borderRadius: '50%', background: required ? 'var(--red)' : 'var(--amber)', marginTop: 4, flexShrink: 0 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{form}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{due}</div>
                  </div>
                ))}
              </div>
              <div className="card">
                <div className="section-title" style={{ marginBottom: '0.75rem' }}>1099 Candidates (>$600)</div>
                {Object.entries(vendors).filter(([, v]) => v >= 600).length === 0 ?
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No vendors over $600 yet</div> :
                  Object.entries(vendors).filter(([, v]) => v >= 600).sort((a, b) => b[1] - a[1]).map(([name, total]) => (
                    <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <div><div style={{ fontWeight: 500 }}>{name}</div><div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Verify if 1099 required</div></div>
                      <span style={{ fontWeight: 600, color: 'var(--amber)' }}>{usd(total)}</span>
                    </div>
                  ))
                }
                <div style={{ marginTop: '0.75rem', fontSize: 11, color: 'var(--text-muted)', background: 'var(--amber-light)', padding: '8px 12px', borderRadius: 'var(--radius-sm)' }}>
                  ⚠ Corporations are generally exempt. Confirm with your CPA.
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
