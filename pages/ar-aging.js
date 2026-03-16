import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const BUCKETS = ['current', '1-30', '31-60', '61-90', '90+']

const BUCKET_COLORS = {
  'current': { bg: '#f0fff4', color: '#276749', label: 'Current' },
  '1-30':    { bg: '#fffbea', color: '#744210', label: '1–30 days' },
  '31-60':   { bg: '#fff5f5', color: '#c05621', label: '31–60 days' },
  '61-90':   { bg: '#fff5f5', color: '#c53030', label: '61–90 days' },
  '90+':     { bg: '#fff5f5', color: '#9b2c2c', label: '90+ days' },
}

const STATUS_COLORS = {
  sent: 'badge-blue',
  partially_paid: 'badge-amber',
  overdue: 'badge-red',
  draft: 'badge-gray',
}

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function ARaging() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('summary') // summary | detail
  const [bucketFilter, setBucketFilter] = useState('')

  useEffect(() => { fetchAging() }, [])

  async function fetchAging() {
    setLoading(true)
    const res = await fetch('/api/ar-aging')
    const json = await res.json()
    setData(json)
    setLoading(false)
  }

  const filteredRows = data?.rows?.filter(r => !bucketFilter || r.bucket === bucketFilter) || []

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>AR Aging</h1>
          <p className="page-sub">Accounts Receivable — open invoices by age</p>
        </div>
        <div className="page-actions">
          <button
            className={view === 'summary' ? 'btn-primary' : 'btn-outline'}
            onClick={() => setView('summary')}
            style={{ padding: '0.3rem 0.8rem', fontSize: 13 }}
          >
            By Customer
          </button>
          <button
            className={view === 'detail' ? 'btn-primary' : 'btn-outline'}
            onClick={() => setView('detail')}
            style={{ padding: '0.3rem 0.8rem', fontSize: 13 }}
          >
            All Invoices
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-2)' }}>Loading...</div>
      ) : !data ? null : (
        <>
          {/* Buckets summary cards */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {BUCKETS.map(b => {
              const { bg, color, label } = BUCKET_COLORS[b]
              const amount = data.summary[b] || 0
              const isSelected = bucketFilter === b
              return (
                <div
                  key={b}
                  onClick={() => setBucketFilter(isSelected ? '' : b)}
                  style={{
                    flex: 1,
                    minWidth: 120,
                    background: bg,
                    border: `2px solid ${isSelected ? color : 'transparent'}`,
                    borderRadius: 10,
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'border 0.15s',
                  }}
                >
                  <div style={{ fontSize: 11, color, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color }}>
                    {fmt(amount)}
                  </div>
                </div>
              )
            })}
            <div style={{
              flex: 1, minWidth: 120,
              background: 'var(--bg-2)',
              borderRadius: 10, padding: '1rem',
              border: '2px solid transparent',
            }}>
              <div style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                Total AR
              </div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>
                {fmt(data.summary.total)}
              </div>
            </div>
          </div>

          {/* Vue par customer */}
          {view === 'summary' && (
            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th style={{ textAlign: 'right', color: BUCKET_COLORS['current'].color }}>Current</th>
                    <th style={{ textAlign: 'right', color: BUCKET_COLORS['1-30'].color }}>1–30</th>
                    <th style={{ textAlign: 'right', color: BUCKET_COLORS['31-60'].color }}>31–60</th>
                    <th style={{ textAlign: 'right', color: BUCKET_COLORS['61-90'].color }}>61–90</th>
                    <th style={{ textAlign: 'right', color: BUCKET_COLORS['90+'].color }}>90+</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_customer.length === 0 ? (
                    <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>
                      No open invoices 🎉
                    </td></tr>
                  ) : data.by_customer.map(c => (
                    <tr key={c.customer_id}>
                      <td><strong>{c.customer_name}</strong></td>
                      {BUCKETS.map(b => (
                        <td key={b} style={{ textAlign: 'right', color: c[b] > 0 ? BUCKET_COLORS[b].color : 'var(--text-2)', fontWeight: c[b] > 0 ? 600 : 400 }}>
                          {c[b] > 0 ? fmt(c[b]) : '—'}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(c.total)}</td>
                    </tr>
                  ))}
                  {/* Total row */}
                  {data.by_customer.length > 0 && (
                    <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                      <td><strong>TOTAL</strong></td>
                      {BUCKETS.map(b => (
                        <td key={b} style={{ textAlign: 'right', fontWeight: 700, color: BUCKET_COLORS[b].color }}>
                          {data.summary[b] > 0 ? fmt(data.summary[b]) : '—'}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(data.summary.total)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Vue détail par invoice */}
          {view === 'detail' && (
            <div className="card">
              {bucketFilter && (
                <div style={{ padding: '0.75rem 1rem', background: BUCKET_COLORS[bucketFilter].bg, borderBottom: '1px solid var(--border)', fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: BUCKET_COLORS[bucketFilter].color, fontWeight: 600 }}>
                    Filtered: {BUCKET_COLORS[bucketFilter].label} — {filteredRows.length} invoice{filteredRows.length !== 1 ? 's' : ''}
                  </span>
                  <button onClick={() => setBucketFilter('')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-2)' }}>
                    Clear filter ✕
                  </button>
                </div>
              )}
              <table>
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Customer</th>
                    <th>Issue Date</th>
                    <th>Due Date</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Paid</th>
                    <th style={{ textAlign: 'right' }}>Balance</th>
                    <th>Age</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No invoices in this bucket.</td></tr>
                  ) : filteredRows.map(r => {
                    const { bg, color } = BUCKET_COLORS[r.bucket]
                    const isOverdue = r.days_overdue > 0
                    return (
                      <tr key={r.invoice_id} style={isOverdue ? { background: bg } : {}}>
                        <td><strong>{r.invoice_number}</strong></td>
                        <td>{r.customer_name}</td>
                        <td style={{ fontSize: 12 }}>{r.issue_date}</td>
                        <td style={{ fontSize: 12, color: isOverdue ? color : 'inherit', fontWeight: isOverdue ? 600 : 400 }}>
                          {r.due_date}
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmt(r.total_due)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmt(r.amount_paid)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(r.balance_due)}</td>
                        <td>
                          <span style={{
                            background: bg, color, padding: '0.15rem 0.5rem',
                            borderRadius: 4, fontSize: 11, fontWeight: 600
                          }}>
                            {r.days_overdue <= 0 ? 'On time' : `${r.days_overdue}d`}
                          </span>
                        </td>
                        <td>
                          <span className={`badge ${isOverdue ? 'badge-red' : STATUS_COLORS[r.status] || 'badge-gray'}`}>
                            {isOverdue ? 'overdue' : r.status}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
