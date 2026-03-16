import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const CURRENT_YEAR = new Date().getFullYear()

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function MarginBadge({ pct }) {
  const n = Number(pct)
  const color = n >= 50 ? '#276749' : n >= 30 ? '#c07a00' : '#c53030'
  const bg = n >= 50 ? '#f0fff4' : n >= 30 ? '#fffbea' : '#fff5f5'
  return (
    <span style={{ background: bg, color, padding: '0.15rem 0.5rem', borderRadius: 4, fontSize: 12, fontWeight: 600 }}>
      {pct}%
    </span>
  )
}

export default function Reports() {
  const [view, setView] = useState('by_customer')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dateFrom, setDateFrom] = useState(`${CURRENT_YEAR}-01-01`)
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0])

  useEffect(() => { fetchReport() }, [view, dateFrom, dateTo])

  async function fetchReport() {
    setLoading(true)
    const res = await fetch(`/api/reporting?type=${view}&from=${dateFrom}&to=${dateTo}`)
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  const tabs = [
    { key: 'by_customer', label: 'By Distributor' },
    { key: 'by_sku',      label: 'By SKU' },
    { key: 'by_channel',  label: 'By Channel' },
  ]

  const totalRevenue = data?.rows?.reduce((s, r) => s + Number(r.revenue), 0) || 0
  const totalGP = data?.rows?.reduce((s, r) => s + Number(r.gross_profit), 0) || 0

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Sales Reports</h1>
          <p className="page-sub">
            Revenue: <strong>{fmt(totalRevenue)}</strong> &nbsp;·&nbsp;
            Gross Profit: <strong style={{ color: totalGP >= 0 ? 'var(--green)' : '#c00' }}>{fmt(totalGP)}</strong>
          </p>
        </div>
        <div className="page-actions" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="chip" />
          <span style={{ color: 'var(--text-2)', fontSize: 13 }}>→</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="chip" />
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={view === t.key ? 'btn-primary' : 'btn-outline'}
            style={{ padding: '0.35rem 1rem', fontSize: 13 }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-2)' }}>Loading...</div>
      ) : !data?.rows?.length ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-2)' }}>
          No data for this period.
        </div>
      ) : (
        <div className="card">

          {/* BY CUSTOMER */}
          {view === 'by_customer' && (
            <table>
              <thead>
                <tr>
                  <th>Distributor</th>
                  <th style={{ textAlign: 'right' }}>Orders</th>
                  <th style={{ textAlign: 'right' }}>Units</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>COGS</th>
                  <th style={{ textAlign: 'right' }}>Gross Profit</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                  <th style={{ textAlign: 'right' }}>% of Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td><strong>{r.customer_name}</strong></td>
                    <td style={{ textAlign: 'right' }}>{r.order_count}</td>
                    <td style={{ textAlign: 'right' }}>{r.units}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.revenue)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmt(r.cogs)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: r.gross_profit >= 0 ? 'var(--green)' : '#c00' }}>
                      {fmt(r.gross_profit)}
                    </td>
                    <td style={{ textAlign: 'right' }}><MarginBadge pct={r.margin_pct} /></td>
                    <td style={{ textAlign: 'right', color: 'var(--text-2)', fontSize: 13 }}>
                      {totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                  <td><strong>TOTAL</strong></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {data.rows.reduce((s, r) => s + r.order_count, 0)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {data.rows.reduce((s, r) => s + r.units, 0)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(totalRevenue)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-2)' }}>
                    {fmt(data.rows.reduce((s, r) => s + r.cogs, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: totalGP >= 0 ? 'var(--green)' : '#c00' }}>
                    {fmt(totalGP)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <MarginBadge pct={totalRevenue > 0 ? ((totalGP / totalRevenue) * 100).toFixed(1) : '0.0'} />
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>100%</td>
                </tr>
              </tbody>
            </table>
          )}

          {/* BY SKU */}
          {view === 'by_sku' && (
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Units</th>
                  <th style={{ textAlign: 'right' }}>WS Units</th>
                  <th style={{ textAlign: 'right' }}>EC Units</th>
                  <th style={{ textAlign: 'right' }}>Avg Price</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>Gross Profit</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td><strong>{r.sku}</strong></td>
                    <td>{r.product_name}</td>
                    <td style={{ textAlign: 'right' }}>{r.units_sold}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{r.wholesale_units}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{r.ecommerce_units}</td>
                    <td style={{ textAlign: 'right' }}>${r.avg_unit_price}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.revenue)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: r.gross_profit >= 0 ? 'var(--green)' : '#c00' }}>
                      {fmt(r.gross_profit)}
                    </td>
                    <td style={{ textAlign: 'right' }}><MarginBadge pct={r.margin_pct} /></td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                  <td colSpan={2}><strong>TOTAL</strong></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {data.rows.reduce((s, r) => s + r.units_sold, 0)}
                  </td>
                  <td colSpan={3}></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(totalRevenue)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: totalGP >= 0 ? 'var(--green)' : '#c00' }}>
                    {fmt(totalGP)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <MarginBadge pct={totalRevenue > 0 ? ((totalGP / totalRevenue) * 100).toFixed(1) : '0.0'} />
                  </td>
                </tr>
              </tbody>
            </table>
          )}

          {/* BY CHANNEL */}
          {view === 'by_channel' && (
            <table>
              <thead>
                <tr>
                  <th>Channel</th>
                  <th style={{ textAlign: 'right' }}>Orders</th>
                  <th style={{ textAlign: 'right' }}>Revenue</th>
                  <th style={{ textAlign: 'right' }}>% of Total</th>
                  <th style={{ textAlign: 'right' }}>COGS</th>
                  <th style={{ textAlign: 'right' }}>Gross Profit</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span className={`badge ${r.channel === 'wholesale' ? 'badge-blue' : r.channel === 'ecommerce' ? 'badge-green' : 'badge-gray'}`}>
                        {r.channel}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>{r.order_count}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(r.revenue)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>
                      {totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) : 0}%
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmt(r.cogs)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: r.gross_profit >= 0 ? 'var(--green)' : '#c00' }}>
                      {fmt(r.gross_profit)}
                    </td>
                    <td style={{ textAlign: 'right' }}><MarginBadge pct={r.margin_pct} /></td>
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                  <td><strong>TOTAL</strong></td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    {data.rows.reduce((s, r) => s + r.order_count, 0)}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(totalRevenue)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>100%</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-2)' }}>
                    {fmt(data.rows.reduce((s, r) => s + r.cogs, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: totalGP >= 0 ? 'var(--green)' : '#c00' }}>
                    {fmt(totalGP)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <MarginBadge pct={totalRevenue > 0 ? ((totalGP / totalRevenue) * 100).toFixed(1) : '0.0'} />
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}
    </Layout>
  )
}
