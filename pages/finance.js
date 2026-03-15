import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { CATEGORIES, usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

function pnl(txs) {
  const sum = cats => txs.filter(t => cats.includes(t.category)).reduce((a, t) => a + +t.amount, 0)
  const rev = sum(['Sales — products', 'Returns & refunds'])
  const cogs = sum(['Inventory / product cost', 'Packaging', 'Shipping (outbound)'])
  const opex = sum(['Marketing & ads', 'Website & tech', 'Legal & professional fees', 'Bank fees', 'Shipping (inbound)', 'Other expense'])
  const cap = sum(['Capital contribution', 'Member distribution'])
  return { rev, cogs, opex, cap, gross: rev - cogs, net: rev - cogs - opex }
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.abs(value) / max * 100) : 0
  return <div style={{ height: 4, background: 'var(--cream-dark)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}><div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 2 }} /></div>
}

export default function Finance() {
  const [txs, setTxs] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
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

  const p = pnl(txs)
  const max = Math.max(p.rev, p.cogs, p.opex, Math.abs(p.gross), Math.abs(p.net), 1)
  const totalEquity = p.cap + p.net
  const grossPct = p.rev > 0 ? (p.gross / p.rev * 100).toFixed(1) : '0.0'
  const netPct = p.rev > 0 ? (p.net / p.rev * 100).toFixed(1) : '0.0'

  // Monthly revenue
  const monthlyMap = {}
  orders.forEach(o => {
    const m = o.date?.slice(0, 7); if (!m) return
    if (!monthlyMap[m]) monthlyMap[m] = 0
    monthlyMap[m] += +o.total_amount
  })
  const monthlyData = Object.entries(monthlyMap).sort().map(([month, rev]) => ({
    month, rev,
    label: new Date(month + '-01').toLocaleString('en', { month: 'short' }) + ' ' + new Date(month + '-01').getFullYear().toString().slice(2)
  }))

  // Linear regression projection
  const n = monthlyData.length
  const slope = n >= 2 ? (() => {
    const xM = (n - 1) / 2, yM = monthlyData.reduce((a, d) => a + d.rev, 0) / n
    const num = monthlyData.reduce((a, d, i) => a + (i - xM) * (d.rev - yM), 0)
    const den = monthlyData.reduce((a, _, i) => a + Math.pow(i - xM, 2), 0)
    return den !== 0 ? num / den : 0
  })() : 0
  const yMean = n > 0 ? monthlyData.reduce((a, d) => a + d.rev, 0) / n : 0
  const intercept = yMean - slope * ((n - 1) / 2)

  const chartData = [...monthlyData]
  if (n >= 2 && monthlyData.length > 0) {
    const last = monthlyData[n - 1].month
    for (let i = 1; i <= 2; i++) {
      const [y, m] = last.split('-').map(Number)
      const d = new Date(y, m - 1 + i, 1)
      chartData.push({ month: d.toISOString().slice(0, 7), rev: Math.max(0, intercept + slope * (n - 1 + i)), label: d.toLocaleString('en', { month: 'short' }) + ' ' + d.getFullYear().toString().slice(2), projected: true })
    }
  }
  const chartMax = Math.max(...chartData.map(d => d.rev), 1)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Finance</h1><p>P&L · Balance sheet · Cash flow · FY 2025</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={syncAndLoad} disabled={loading} style={{ fontSize: 12, padding: '6px 14px' }}>{loading ? '↻ Syncing…' : '↻ Sync & Refresh'}</button>
          {lastUpdated && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
        </div>
      </div>

      {loading && txs.length === 0 ? <div className="loading">Loading…</div> : (
        <>
          {txs.length === 0 && <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>No transactions yet. Start by recording sales in <strong>Income</strong> or expenses in <strong>Expenses</strong>.</div>}

          <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
            {[
              ['Revenue', p.rev, p.rev >= 0 ? 'var(--green)' : 'var(--red)'],
              ['Cost of goods', p.cogs, 'var(--amber)'],
              ['Gross profit', p.gross, p.gross >= 0 ? 'var(--green)' : 'var(--red)'],
              ['Operating expenses', p.opex, '#5B3D8A'],
              ['Net income', p.net, p.net >= 0 ? 'var(--green)' : 'var(--red)'],
              ['Capital contributed', p.cap, 'var(--navy-mid)'],
            ].map(([l, v, c]) => (
              <div key={l} className="metric-card">
                <div className="label">{l}</div>
                <div className="value" style={{ color: c }}>{usd(v)}</div>
                <MiniBar value={v} max={max} color={c} />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            {/* Revenue trend */}
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Revenue trend</div>
                <span style={{ fontSize: 11, color: slope >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 500 }}>
                  {slope >= 0 ? '↑' : '↓'} {yMean > 0 ? Math.abs(slope / yMean * 100).toFixed(1) : 0}%/month
                </span>
              </div>
              {chartData.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '2rem' }}>No data yet</div> : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 130, marginBottom: 6 }}>
                    {chartData.map((d, i) => (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 3 }}>
                        <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{d.rev >= 1000 ? (d.rev / 1000).toFixed(1) + 'k' : d.rev > 0 ? Math.round(d.rev) : ''}</div>
                        <div style={{ width: '100%', height: Math.max(3, (d.rev / chartMax) * 110), background: d.projected ? 'rgba(123,163,188,0.35)' : 'var(--navy)', borderRadius: '3px 3px 0 0', border: d.projected ? '1.5px dashed var(--blue-pearl)' : 'none' }} />
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {chartData.map((d, i) => <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: d.projected ? 'var(--blue-pearl)' : 'var(--text-muted)' }}>{d.label}</div>)}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--text-muted)', marginTop: 10 }}>
                    <span>▪ Actual</span>
                    <span style={{ color: 'var(--blue-pearl)' }}>▪ Projected</span>
                  </div>
                </>
              )}
            </div>

            {/* Recent transactions */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Recent transactions</div>
              {txs.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '2rem' }}>No transactions yet</div> :
                txs.slice(0, 8).map(tx => {
                  const type = CATEGORIES[tx.category]
                  const isIn = type === 'revenue' || type === 'capital'
                  return (
                    <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{tx.date}</div>
                      </div>
                      <div style={{ fontWeight: 500, fontSize: 13, color: isIn ? 'var(--green)' : 'var(--red)', marginLeft: 12, whiteSpace: 'nowrap' }}>{isIn ? '+' : '−'}{usd(tx.amount)}</div>
                    </div>
                  )
                })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            {/* P&L */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>P&L — Income statement</div>
              {[
                ['Revenue', p.rev, '#639922', false],
                ['Cost of goods (COGS)', p.cogs, '#BA7517', false],
                ['Gross profit', p.gross, p.gross >= 0 ? 'var(--green)' : 'var(--red)', true, grossPct + '%'],
                ['Operating expenses', p.opex, '#5B3D8A', false],
                ['Net income', p.net, p.net >= 0 ? 'var(--green)' : 'var(--red)', true, netPct + '%'],
              ].map(([label, value, color, bold, margin]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)', fontWeight: bold ? 600 : 400 }}>
                  <span style={{ color: bold ? 'var(--text)' : 'var(--text-muted)', fontSize: 13 }}>{label}</span>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ color, fontSize: 13 }}>{usd(value)}</span>
                    {margin && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 6 }}>({margin})</span>}
                  </div>
                </div>
              ))}
              <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[['Gross margin', grossPct + '%', parseFloat(grossPct) >= 0 ? 'var(--green)' : 'var(--red)'], ['Net margin', netPct + '%', parseFloat(netPct) >= 0 ? 'var(--green)' : 'var(--red)']].map(([l, v, c]) => (
                  <div key={l} style={{ padding: '8px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{l}</div>
                    <div style={{ fontSize: 20, fontWeight: 300, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Balance sheet */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1.25rem' }}>Balance sheet · Dec 31, 2025</div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy)', marginBottom: 8 }}>Assets</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Cash (estimated)</span>
                  <span style={{ fontWeight: 500, color: totalEquity >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(totalEquity)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Accounts receivable</span>
                  <span style={{ fontSize: 12, color: 'var(--blue-pearl)', cursor: 'pointer' }} onClick={() => window.location.href = '/cashflow'}>→ See AP/AR</span>
                </div>
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--amber)', marginBottom: 8 }}>Liabilities</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Accounts payable</span>
                  <span style={{ fontSize: 12, color: 'var(--blue-pearl)', cursor: 'pointer' }} onClick={() => window.location.href = '/cashflow'}>→ See AP/AR</span>
                </div>
              </div>
              <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--green)', marginBottom: 8 }}>Equity</div>
                {[['Capital contributed', p.cap, null], ['Net income FY 2025', p.net, p.net >= 0 ? 'var(--green)' : 'var(--red)']].map(([l, v, c]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: 13 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                    <span style={{ fontWeight: 500, color: c || 'var(--text)' }}>{usd(v)}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 10px', background: 'var(--navy)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Total equity</span>
                  <span style={{ fontWeight: 600, color: totalEquity >= 0 ? '#7BC89A' : '#E88080' }}>{usd(totalEquity)}</span>
                </div>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: 8 }}>
                <div style={{ flex: 1, padding: '8px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Member 1</div>
                  <div style={{ fontSize: 16, fontWeight: 300, color: p.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(p.net * 0.5)}</div>
                </div>
                <div style={{ flex: 1, padding: '8px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Member 2</div>
                  <div style={{ fontSize: 16, fontWeight: 300, color: p.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(p.net * 0.5)}</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
