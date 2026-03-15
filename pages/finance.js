import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { CATEGORIES, usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

const PERIODS = [
  { label: 'This month', value: 'month' },
  { label: 'Last month', value: 'lastmonth' },
  { label: 'Quarter', value: 'quarter' },
  { label: 'Year', value: 'year' },
  { label: 'All time', value: 'all' },
]

function getRange(p) {
  const today = new Date().toISOString().split('T')[0]
  const now = new Date()
  switch(p) {
    case 'month': return { from: today.slice(0,7) + '-01', to: today }
    case 'lastmonth': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: d.toISOString().split('T')[0], to: last.toISOString().split('T')[0] }
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      return { from: new Date(now.getFullYear(), q * 3, 1).toISOString().split('T')[0], to: today }
    }
    case 'year': return { from: now.getFullYear() + '-01-01', to: today }
    default: return { from: null, to: null }
  }
}

function WaterfallBar({ items, max }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((item, i) => {
        const pct = max > 0 ? Math.min(100, Math.abs(item.value) / max * 100) : 0
        return (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span style={{ color: item.bold ? 'var(--text)' : 'var(--text-muted)', fontWeight: item.bold ? 600 : 400 }}>{item.label}</span>
              <span style={{ fontWeight: item.bold ? 600 : 400, color: item.color }}>{usd(item.value)}</span>
            </div>
            <div style={{ height: item.bold ? 7 : 5, background: 'var(--cream-dark)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: pct + '%', background: item.color, borderRadius: 3 }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function Finance() {
  const [txs, setTxs] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('year')
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [t, o] = await Promise.all([
        fetch('/api/transactions?t=' + Date.now()).then(r => r.json()),
        fetch('/api/sales?t=' + Date.now()).then(r => r.json()),
      ])
      setTxs(Array.isArray(t) ? t : [])
      setOrders(Array.isArray(o) ? o : [])
      setLastUpdated(new Date())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    load()
    const i = setInterval(load, 30000)
    return () => clearInterval(i)
  }, [load])

  const syncAndLoad = useCallback(async () => {
    await fetch('/api/sync', { method: 'POST' })
    load()
  }, [load])

  const { from, to } = getRange(period)
  const fTxs = txs.filter(t => (!from || t.date >= from) && (!to || t.date <= to))

  const sum = cats => fTxs.filter(t => cats.includes(t.category)).reduce((a, t) => a + +t.amount, 0)
  const rev = sum(['Sales — products', 'Returns & refunds'])
  const cogs = sum(['Inventory / product cost', 'Packaging', 'Shipping (outbound)'])
  const gross = rev - cogs
  const marketing = sum(['Marketing & ads'])
  const tech = sum(['Website & tech'])
  const legal = sum(['Legal & professional fees'])
  const banking = sum(['Bank fees'])
  const shipping = sum(['Shipping (inbound)'])
  const other = sum(['Other expense'])
  const opex = marketing + tech + legal + banking + shipping + other
  const net = gross - opex
  const cap = sum(['Capital contribution'])
  const totalEquity = cap + net
  const grossPct = rev > 0 ? (gross / rev * 100) : 0
  const netPct = rev > 0 ? (net / rev * 100) : 0

  // Monthly revenue trend
  const monthlyMap = {}
  orders.forEach(o => {
    const m = o.date?.slice(0, 7); if (!m) return
    monthlyMap[m] = (monthlyMap[m] || 0) + +o.total_amount
  })
  const monthlyData = Object.entries(monthlyMap).sort().slice(-12)
  const n = monthlyData.length
  let slope = 0, intercept = 0
  if (n >= 2) {
    const xM = (n - 1) / 2
    const yM = monthlyData.reduce((a, [, v]) => a + v, 0) / n
    const num = monthlyData.reduce((a, [, v], i) => a + (i - xM) * (v - yM), 0)
    const den = monthlyData.reduce((a, _, i) => a + Math.pow(i - xM, 2), 0)
    slope = den !== 0 ? num / den : 0
    intercept = yM - slope * xM
  }

  const chartAll = [...monthlyData.map(([m, v], i) => ({ m, v, label: new Date(m + '-01').toLocaleString('en', { month: 'short' }), projected: false }))]
  if (n >= 2) {
    const last = monthlyData[n - 1][0]
    for (let i = 1; i <= 2; i++) {
      const [y, mo] = last.split('-').map(Number)
      const d = new Date(y, mo - 1 + i, 1)
      chartAll.push({ m: d.toISOString().slice(0, 7), v: Math.max(0, intercept + slope * (n - 1 + i)), label: d.toLocaleString('en', { month: 'short' }), projected: true })
    }
  }
  const chartMax = Math.max(...chartAll.map(d => d.v), 1)

  // Expense breakdown for pie
  const expItems = [
    { label: 'Marketing', value: marketing, color: '#6A1B9A' },
    { label: 'COGS', value: cogs, color: '#BA7517' },
    { label: 'Tech', value: tech, color: '#2A6B4A' },
    { label: 'Legal', value: legal, color: '#1C2E4A' },
    { label: 'Bank fees', value: banking, color: '#7BA3BC' },
    { label: 'Shipping', value: shipping, color: '#8B5E1A' },
    { label: 'Other', value: other, color: '#B0ACA8' },
  ].filter(e => e.value > 0)

  const totalExp = cogs + opex

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Finance</h1><p>P&L · Cash flow · Balance sheet · FY 2025</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {PERIODS.map(p => (
              <button key={p.value} onClick={() => setPeriod(p.value)} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 20, background: period === p.value ? 'var(--navy)' : 'var(--white)', color: period === p.value ? 'white' : 'var(--text-muted)', borderColor: period === p.value ? 'var(--navy)' : 'var(--border)' }}>{p.label}</button>
            ))}
          </div>
          <button onClick={syncAndLoad} disabled={loading} style={{ fontSize: 12, padding: '5px 12px' }}>{loading ? '↻' : '↻ Sync'}</button>
        </div>
      </div>

      {loading && txs.length === 0 ? <div className="loading">Loading…</div> : (
        <>
          {/* KPI cards */}
          <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
            {[
              ['Revenue', usd(rev), 'var(--green)'],
              ['Gross profit', usd(gross), gross >= 0 ? 'var(--green)' : 'var(--red)', grossPct.toFixed(1) + '% margin'],
              ['Net income', usd(net), net >= 0 ? 'var(--green)' : 'var(--red)', netPct.toFixed(1) + '% margin'],
              ['Total expenses', usd(totalExp), 'var(--red)'],
              ['Capital', usd(cap), 'var(--navy-mid)'],
              ['Total equity', usd(totalEquity), totalEquity >= 0 ? 'var(--green)' : 'var(--red)'],
            ].map(([l, v, c, sub]) => (
              <div key={l} className="metric-card">
                <div className="label">{l}</div>
                <div className="value" style={{ color: c, fontSize: 20 }}>{v}</div>
                {sub && <div style={{ fontSize: 11, color: c, opacity: 0.7, marginTop: 3 }}>{sub}</div>}
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            {/* Revenue trend chart */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Revenue trend (12 months)</div>
                <span style={{ fontSize: 11, fontWeight: 500, color: slope >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {slope >= 0 ? '↑' : '↓'} trend
                </span>
              </div>
              {chartAll.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '2rem', textAlign: 'center' }}>No data</div> : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 140, marginBottom: 6 }}>
                    {chartAll.map((d, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 3 }}>
                        {d.v > 0 && <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{d.v >= 1000 ? (d.v / 1000).toFixed(1) + 'k' : Math.round(d.v)}</div>}
                        <div style={{ width: '100%', height: Math.max(3, (d.v / chartMax) * 120), background: d.projected ? 'rgba(123,163,188,0.4)' : 'var(--navy)', borderRadius: '3px 3px 0 0', border: d.projected ? '1.5px dashed var(--blue-pearl)' : 'none' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 3, marginBottom: 8 }}>
                    {chartAll.map((d, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: d.projected ? 'var(--blue-pearl)' : 'var(--text-muted)' }}>{d.label}</div>)}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-muted)' }}>
                    <span>▪ Actual</span>
                    <span style={{ color: 'var(--blue-pearl)' }}>▪ Projected</span>
                  </div>
                </>
              )}
            </div>

            {/* P&L waterfall */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>P&L breakdown</div>
              <WaterfallBar max={Math.max(rev, cogs, opex, Math.abs(gross), Math.abs(net), 1)} items={[
                { label: 'Revenue', value: rev, color: 'var(--green)', bold: false },
                { label: 'COGS', value: cogs, color: 'var(--amber)', bold: false },
                { label: 'Gross profit', value: gross, color: gross >= 0 ? 'var(--green)' : 'var(--red)', bold: true },
                { label: 'OpEx', value: opex, color: '#5B3D8A', bold: false },
                { label: 'Net income', value: net, color: net >= 0 ? 'var(--green)' : 'var(--red)', bold: true },
              ]} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            {/* Expense breakdown */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Expense breakdown</div>
              {expItems.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No expenses recorded</div> :
                expItems.map(e => (
                  <div key={e.label} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: e.color }} /><span>{e.label}</span></div>
                      <span style={{ fontWeight: 600 }}>{usd(e.value)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({totalExp > 0 ? (e.value / totalExp * 100).toFixed(0) : 0}%)</span></span>
                    </div>
                    <div style={{ height: 5, background: 'var(--cream-dark)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: totalExp > 0 ? (e.value / totalExp * 100) + '%' : '0%', background: e.color, borderRadius: 3 }} />
                    </div>
                  </div>
                ))
              }
            </div>

            {/* Balance sheet */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Balance sheet</div>
              {[
                { section: 'ASSETS', color: 'var(--navy)', items: [['Cash (estimated)', totalEquity, totalEquity >= 0 ? 'var(--green)' : 'var(--red)']] },
                { section: 'LIABILITIES', color: 'var(--amber)', items: [['Accounts payable', 0, 'var(--text-muted)']] },
                { section: 'EQUITY', color: 'var(--green)', items: [['Capital contributed', cap, 'var(--text)'], ['Net income', net, net >= 0 ? 'var(--green)' : 'var(--red)']] },
              ].map(({ section, color, items }) => (
                <div key={section} style={{ marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color, marginBottom: 5 }}>{section}</div>
                  {items.map(([l, v, c]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'var(--cream)', borderRadius: 6, marginBottom: 3, fontSize: 12 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                      <span style={{ fontWeight: 500, color: c }}>{usd(v)}</span>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 10px', background: 'var(--navy)', borderRadius: 'var(--radius-sm)', fontSize: 13, marginTop: '0.5rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Total equity</span>
                <span style={{ fontWeight: 600, color: totalEquity >= 0 ? '#7BC89A' : '#E88080' }}>{usd(totalEquity)}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: '0.75rem' }}>
                {[['Member 1 (50%)', net * 0.5], ['Member 2 (50%)', net * 0.5]].map(([l, v]) => (
                  <div key={l} style={{ padding: '8px', background: 'var(--cream)', borderRadius: 6, textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: 15, fontWeight: 300, color: v >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(v)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent transactions */}
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Recent transactions
            </div>
            {fTxs.length === 0 ? <div className="empty-state"><p>No transactions in this period</p></div> : (
              <table>
                <thead><tr><th>Date</th><th>Description</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                  {fTxs.slice(0, 10).map(tx => {
                    const type = CATEGORIES[tx.category]
                    const isIn = type === 'revenue' || type === 'capital'
                    return (
                      <tr key={tx.id}>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{tx.date}</td>
                        <td style={{ fontWeight: 500 }}>{tx.description}</td>
                        <td><span className="pill" style={{ fontSize: 11, background: isIn ? 'var(--green-light)' : 'var(--cream-dark)', color: isIn ? 'var(--green)' : 'var(--text-muted)' }}>{tx.category}</span></td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: isIn ? 'var(--green)' : 'var(--red)' }}>{isIn ? '+' : '−'}{usd(tx.amount)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </Layout>
  )
}
