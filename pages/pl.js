import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const CURRENT_YEAR = new Date().getFullYear()

function KPI({ label, value, sub, color }) {
  return (
    <div className="card" style={{ flex: 1 }}>
      <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color || 'var(--text-1)' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

function Bar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div style={{ marginBottom: '0.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
        <span>{label}</span>
        <strong>${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</strong>
      </div>
      <div style={{ background: 'var(--bg)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color || 'var(--accent)', borderRadius: 4, transition: 'width 0.4s' }} />
      </div>
    </div>
  )
}

export default function PL() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateFrom, setDateFrom] = useState(`${CURRENT_YEAR}-01-01`)
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { fetchPL() }, [dateFrom, dateTo])

  async function fetchPL() {
    setLoading(true)
    const res = await fetch(`/api/pl?from=${dateFrom}&to=${dateTo}`)
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  const fmt = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
  const pct = (n) => Number(n || 0).toFixed(1) + '%'

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>P&L</h1>
          <p className="page-sub">Profit & Loss Statement</p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="chip" />
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="chip" />
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-2)' }}>Loading...</div>
      ) : !data ? null : (
        <>
          {/* KPIs */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <KPI
              label="Net Revenue"
              value={fmt(data.revenue.total)}
              sub={`WS: ${fmt(data.revenue.wholesale)} · EC: ${fmt(data.revenue.ecommerce)}`}
            />
            <KPI
              label="Gross Profit"
              value={fmt(data.gross_profit)}
              sub={`Margin: ${pct(data.gross_margin_pct)}`}
              color={data.gross_profit >= 0 ? 'var(--green)' : '#c00'}
            />
            <KPI
              label="COGS"
              value={fmt(data.cogs)}
              sub="Cost of goods sold"
              color="#c00"
            />
            <KPI
              label="EBITDA"
              value={fmt(data.ebitda)}
              sub="Gross profit (OpEx TBD)"
              color={data.ebitda >= 0 ? 'var(--green)' : '#c00'}
            />
          </div>

          {/* Revenue breakdown */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <div className="card-header"><h3>Revenue by Channel</h3></div>
              <div className="card-body">
                <Bar label="Wholesale" value={data.revenue.wholesale} max={data.revenue.total} color="#4F8EF7" />
                <Bar label="Ecommerce" value={data.revenue.ecommerce} max={data.revenue.total} color="#48BB78" />
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem', marginTop: '0.75rem', display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>Total</span>
                  <span>{fmt(data.revenue.total)}</span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h3>Gross Margin Summary</h3></div>
              <div className="card-body">
                <table style={{ width: '100%' }}>
                  <tbody>
                    {[
                      { label: 'Revenue', value: fmt(data.revenue.total), bold: false },
                      { label: 'COGS', value: `(${fmt(data.cogs)})`, bold: false, color: '#c00' },
                      { label: 'Gross Profit', value: fmt(data.gross_profit), bold: true, color: data.gross_profit >= 0 ? 'var(--green)' : '#c00' },
                      { label: 'Gross Margin %', value: pct(data.gross_margin_pct), bold: true, color: 'var(--text-2)' },
                    ].map((row, i) => (
                      <tr key={i} style={row.bold ? { borderTop: '2px solid var(--border)' } : {}}>
                        <td style={{ padding: '0.5rem 0', fontSize: 14 }}>{row.label}</td>
                        <td style={{ padding: '0.5rem 0', textAlign: 'right', fontWeight: row.bold ? 700 : 400, color: row.color || 'var(--text-1)', fontSize: 14 }}>
                          {row.value}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Monthly trend */}
          {data.monthly?.length > 0 && (
            <div className="card">
              <div className="card-header"><h3>Monthly Trend</h3></div>
              <div className="card-body">
                <table>
                  <thead>
                    <tr>
                      <th>Month</th>
                      <th style={{ textAlign: 'right' }}>Wholesale</th>
                      <th style={{ textAlign: 'right' }}>Ecommerce</th>
                      <th style={{ textAlign: 'right' }}>Total Revenue</th>
                      <th style={{ textAlign: 'right' }}>COGS</th>
                      <th style={{ textAlign: 'right' }}>Gross Profit</th>
                      <th style={{ textAlign: 'right' }}>Margin %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly.map((m, i) => {
                      const rev = m.wholesale + m.ecommerce
                      const gp = rev - m.cogs
                      const margin = rev > 0 ? (gp / rev) * 100 : 0
                      return (
                        <tr key={i}>
                          <td><strong>{m.month}</strong></td>
                          <td style={{ textAlign: 'right' }}>{fmt(m.wholesale)}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(m.ecommerce)}</td>
                          <td style={{ textAlign: 'right' }}><strong>{fmt(rev)}</strong></td>
                          <td style={{ textAlign: 'right', color: '#c00' }}>{fmt(m.cogs)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700, color: gp >= 0 ? 'var(--green)' : '#c00' }}>{fmt(gp)}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{margin.toFixed(1)}%</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
