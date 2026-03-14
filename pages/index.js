import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { CATEGORIES, usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

function pnlFromTxs(txs) {
  const sum = type => txs.filter(t => CATEGORIES[t.category] === type).reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const rev = sum('revenue'), cogs = sum('cogs'), opex = sum('opex'), cap = sum('capital')
  return { rev, cogs, opex, cap, gross: rev - cogs, net: rev - cogs - opex }
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.abs(value) / max * 100) : 0
  return (
    <div style={{ height: 4, background: 'var(--cream-dark)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
    </div>
  )
}

function RevenueChart({ monthlyData }) {
  if (!monthlyData || monthlyData.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-muted)', fontSize: 13 }}>
      No data yet
    </div>
  )
  const maxVal = Math.max(...monthlyData.map(d => d.rev), 1)
  const n = monthlyData.length
  if (n < 2) return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, paddingBottom: 24 }}>
      {monthlyData.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.rev > 0 ? usd(d.rev) : ''}</div>
          <div style={{ width: '100%', height: Math.max(4, (d.rev / maxVal) * 110), background: 'var(--navy)', borderRadius: '4px 4px 0 0' }} />
          <div style={{ fontSize: 9.5, color: 'var(--text-muted)' }}>{d.label}</div>
        </div>
      ))}
    </div>
  )

  const xMean = (n - 1) / 2
  const yMean = monthlyData.reduce((a, d) => a + d.rev, 0) / n
  const num = monthlyData.reduce((a, d, i) => a + (i - xMean) * (d.rev - yMean), 0)
  const den = monthlyData.reduce((a, _, i) => a + Math.pow(i - xMean, 2), 0)
  const slope = den !== 0 ? num / den : 0
  const intercept = yMean - slope * xMean

  const allData = [...monthlyData]
  const lastMonth = monthlyData[monthlyData.length - 1]?.month || ''
  if (lastMonth) {
    for (let i = 1; i <= 2; i++) {
      const [year, month] = lastMonth.split('-').map(Number)
      const d = new Date(year, month - 1 + i, 1)
      const label = d.toLocaleString('en', { month: 'short' }) + ' ' + d.getFullYear().toString().slice(2)
      allData.push({ month: d.toISOString().slice(0, 7), label, rev: Math.max(0, intercept + slope * (n - 1 + i)), projected: true })
    }
  }

  const allMax = Math.max(...allData.map(d => d.rev), 1)
  const trendColor = slope >= 0 ? 'var(--green)' : 'var(--red)'
  const trendPct = yMean > 0 ? Math.abs(slope / yMean * 100).toFixed(1) : 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, marginBottom: 8 }}>
        {allData.map((d, i) => {
          const h = Math.max(4, (d.rev / allMax) * 120)
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{d.rev > 0 ? (d.rev >= 1000 ? (d.rev / 1000).toFixed(1) + 'k' : usd(d.rev).replace('$', '')) : ''}</div>
              <div style={{ width: '100%', height: h, background: d.projected ? 'rgba(123,163,188,0.3)' : 'var(--navy)', borderRadius: '4px 4px 0 0', border: d.projected ? '1.5px dashed var(--blue-pearl)' : 'none' }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between', marginBottom: 12 }}>
        {allData.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: d.projected ? 'var(--blue-pearl)' : 'var(--text-muted)' }}>{d.label}</div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--navy)' }} />
        <span style={{ color: 'var(--text-muted)' }}>Actual</span>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(123,163,188,0.4)', border: '1.5px dashed var(--blue-pearl)' }} />
        <span style={{ color: 'var(--text-muted)' }}>Projected</span>
        <span style={{ marginLeft: 'auto', color: trendColor, fontWeight: 500 }}>{slope >= 0 ? '↑' : '↓'} Trend {trendPct}%/month</span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [txs, setTxs] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [txRes, ordRes] = await Promise.all([
        fetch('/api/transactions?t=' + Date.now(), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }),
        fetch('/api/sales?t=' + Date.now(), { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } }),
      ])
      const [t, o] = await Promise.all([txRes.json(), ordRes.json()])
      setTxs(Array.isArray(t) ? t : [])
      setOrders(Array.isArray(o) ? o : [])
      setLastUpdated(new Date())
    } catch(e) {
      console.error('Failed to load data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000)
    return () => clearInterval(interval)
  }, [loadData])

  const p = pnlFromTxs(txs)
  const max = Math.max(p.rev, p.cogs, p.opex, Math.abs(p.gross), Math.abs(p.net), 1)

  const monthlyMap = {}
  orders.forEach(o => {
    const m = o.date?.slice(0, 7); if (!m) return
    if (!monthlyMap[m]) monthlyMap[m] = { rev: 0 }
    monthlyMap[m].rev += parseFloat(o.total_amount || 0)
  })
  const monthlyData = Object.entries(monthlyMap).sort().map(([month, v]) => ({
    month, label: new Date(month + '-01').toLocaleString('en', { month: 'short' }) + ' ' + new Date(month + '-01').getFullYear().toString().slice(2), ...v
  }))

  const marginPct = p.rev > 0 ? ((p.gross / p.rev) * 100).toFixed(1) : '0.0'
  const netMarginPct = p.rev > 0 ? ((p.net / p.rev) * 100).toFixed(1) : '0.0'
  const totalEquity = p.cap + p.net
  const recentTxs = [...txs].slice(0, 8)

  const metrics = [
    ['Revenue', p.rev, p.rev >= 0 ? 'var(--green)' : 'var(--red)'],
    ['Cost of goods', p.cogs, 'var(--amber)'],
    ['Gross profit', p.gross, p.gross >= 0 ? 'var(--green)' : 'var(--red)'],
    ['Operating expenses', p.opex, '#5B3D8A'],
    ['Net income', p.net, p.net >= 0 ? 'var(--green)' : 'var(--red)'],
    ['Capital contributed', p.cap, 'var(--navy-mid)'],
  ]

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Clique Beauty Skincare LLC · FY 2025</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={loadData} style={{ fontSize: 12, padding: '6px 14px' }} disabled={loading}>
            {loading ? '↻ Loading…' : '↻ Refresh'}
          </button>
          {lastUpdated && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
        </div>
      </div>

      {loading && txs.length === 0 ? (
        <div className="loading">Loading…</div>
      ) : (
        <>
          {/* Zero state */}
          {txs.length === 0 && orders.length === 0 && (
            <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
              No transactions yet. Start by adding income in <strong>Income</strong> or expenses in <strong>Expenses</strong>.
            </div>
          )}

          <div className="metrics-grid">
            {metrics.map(([l, v, c]) => (
              <div key={l} className="metric-card">
                <div className="label">{l}</div>
                <div className="value" style={{ color: c }}>{usd(v)}</div>
                <MiniBar value={v} max={max} color={c} />
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Revenue trend</div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{monthlyData.length} month{monthlyData.length !== 1 ? 's' : ''} · +2 projected</span>
              </div>
              <RevenueChart monthlyData={monthlyData} />
            </div>

            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Recent transactions</div>
              {recentTxs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: 13 }}>No transactions yet</div>
              ) : (
                <>
                  {recentTxs.map(tx => {
                    const type = CATEGORIES[tx.category]
                    const isIncome = type === 'revenue' || type === 'capital'
                    return (
                      <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{tx.date}</div>
                        </div>
                        <div style={{ fontWeight: 500, fontSize: 13, color: isIncome ? 'var(--green)' : 'var(--red)', marginLeft: 12, whiteSpace: 'nowrap' }}>
                          {isIncome ? '+' : '−'}{usd(tx.amount)}
                        </div>
                      </div>
                    )
                  })}
                  {txs.length > 8 && (
                    <button style={{ marginTop: 12, width: '100%', fontSize: 12, color: 'var(--text-muted)' }} onClick={() => window.location.href = '/expenses'}>
                      View all ({txs.length}) →
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>P&L — Income statement</div>
              {p.rev === 0 && p.cogs === 0 && p.opex === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13, textAlign: 'center', padding: '1rem' }}>No data</div>
              ) : (
                [
                  ['Revenue', p.rev, '#639922', false],
                  ['Cost of goods (COGS)', p.cogs, '#BA7517', false],
                  ['Gross profit', p.gross, p.gross >= 0 ? 'var(--green)' : 'var(--red)', true],
                  ['Operating expenses', p.opex, '#5B3D8A', false],
                  ['Net income', p.net, p.net >= 0 ? 'var(--green)' : 'var(--red)', true],
                ].map(([label, value, color, bold]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontWeight: bold ? 600 : 400 }}>
                    <span style={{ color: bold ? 'var(--text)' : 'var(--text-muted)', fontSize: 13 }}>{label}</span>
                    <span style={{ color, fontSize: 13 }}>{usd(value)}</span>
                  </div>
                ))
              )}
            </div>

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
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Capital contributed</span>
                  <span style={{ fontWeight: 500 }}>{usd(p.cap)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Net income FY 2025</span>
                  <span style={{ fontWeight: 500, color: p.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(p.net)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 10px', background: 'var(--navy)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Total equity</span>
                  <span style={{ fontWeight: 600, color: totalEquity >= 0 ? '#7BC89A' : '#E88080' }}>{usd(totalEquity)}</span>
                </div>
              </div>
              <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[['Gross margin', marginPct + '%', parseFloat(marginPct) >= 0 ? 'var(--green)' : 'var(--red)'], ['Net margin', netMarginPct + '%', parseFloat(netMarginPct) >= 0 ? 'var(--green)' : 'var(--red)']].map(([l, v, c]) => (
                  <div key={l} style={{ padding: '8px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{l}</div>
                    <div style={{ fontSize: 18, fontWeight: 300, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
