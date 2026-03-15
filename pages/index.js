import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

export default function OperationsDashboard() {
  const [products, setProducts] = useState([])
  const [orders, setOrders] = useState([])
  const [shipments, setShipments] = useState([])
  const [distributors, setDistributors] = useState([])
  const [targets, setTargets] = useState([])
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [p, o, s, d, t] = await Promise.all([
        fetch('/api/inventory?t=' + Date.now()).then(r => r.json()),
        fetch('/api/sales?t=' + Date.now()).then(r => r.json()),
        fetch('/api/shipments?t=' + Date.now()).then(r => r.json()),
        fetch('/api/distributors?t=' + Date.now()).then(r => r.json()),
        fetch('/api/gifted?targets=1&t=' + Date.now()).then(r => r.json()),
      ])
      setProducts(Array.isArray(p) ? p : [])
      setOrders(Array.isArray(o) ? o : [])
      setShipments(Array.isArray(s) ? s : [])
      setDistributors(Array.isArray(d) ? d : [])
      setTargets(Array.isArray(t) ? t : [])
      setLastUpdated(new Date())
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(); const i = setInterval(load, 30000); return () => clearInterval(i) }, [load])

  // Current month
  const currentMonth = new Date().toISOString().slice(0, 7)
  const monthOrders = orders.filter(o => o.date?.startsWith(currentMonth))
  const monthEcom = monthOrders.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + +o.total_amount, 0)
  const monthWS = monthOrders.filter(o => o.channel !== 'E-commerce').reduce((a, o) => a + +o.total_amount, 0)
  const totalStock = products.reduce((a, p) => a + (p.quantity_on_hand || 0), 0)
  const stockValue = products.reduce((a, p) => a + (p.quantity_on_hand || 0) * (p.unit_cost || 0), 0)
  const lowStock = products.filter(p => p.quantity_on_hand <= (p.reorder_level || 10))

  // Top products this month
  const productSales = {}
  monthOrders.forEach(o => o.sale_items?.forEach(i => {
    const name = i.inventory?.product_name || i.product_id
    if (!productSales[name]) productSales[name] = { qty: 0, revenue: 0 }
    productSales[name].qty += +i.quantity
    productSales[name].revenue += +i.quantity * +i.unit_price
  }))
  const topProducts = Object.entries(productSales).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5)

  // Distributor vs target
  const monthTargets = targets.filter(t => t.period === currentMonth)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Operations</h1>
          <p>Stock · Sales · Performance · {currentMonth}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={load} disabled={loading} style={{ fontSize: 12, padding: '6px 14px' }}>{loading ? '↻ Loading…' : '↻ Refresh'}</button>
          {lastUpdated && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updated {lastUpdated.toLocaleTimeString()}</span>}
        </div>
      </div>

      {loading && products.length === 0 ? <div className="loading">Loading…</div> : (
        <>
          {/* Metrics */}
          <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
            {[
              ['Units in stock', totalStock, 'var(--navy)'],
              ['Stock value', usd(stockValue), 'var(--amber)'],
              ['E-com this month', usd(monthEcom), '#6A1B9A'],
              ['Wholesale this month', usd(monthWS), 'var(--green)'],
            ].map(([l, v, c]) => (
              <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
            ))}
          </div>

          {lowStock.length > 0 && (
            <div className="alert alert-warning" style={{ marginBottom: '1.25rem' }}>
              ⚠ Low stock alert: {lowStock.map(p => <strong key={p.id}>{p.product_name} ({p.quantity_on_hand})</strong>).reduce((a, b) => [a, ' · ', b])}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            {/* Stock levels */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Stock levels</div>
              {products.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No products yet</div> :
                products.map(p => {
                  const isLow = p.quantity_on_hand <= (p.reorder_level || 10)
                  const pct = p.reorder_level > 0 ? Math.min(100, (p.quantity_on_hand / (p.reorder_level * 3)) * 100) : 50
                  return (
                    <div key={p.id} style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                        <span style={{ fontWeight: 500 }}>{p.product_name}</span>
                        <span style={{ fontWeight: 600, color: isLow ? 'var(--red)' : 'var(--green)' }}>{p.quantity_on_hand} units</span>
                      </div>
                      <div style={{ height: 5, background: 'var(--cream-dark)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: Math.max(2, pct) + '%', background: isLow ? 'var(--red)' : 'var(--green)', borderRadius: 3 }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Reorder at {p.reorder_level || 10} · Cost {usd(p.unit_cost)}</div>
                    </div>
                  )
                })}
            </div>

            {/* Top products */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Top products this month</div>
              {topProducts.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No sales this month yet</div> :
                topProducts.map(([name, data]) => (
                  <div key={name} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <div>
                      <div style={{ fontWeight: 500 }}>{name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{data.qty} units sold</div>
                    </div>
                    <span style={{ fontWeight: 600, color: 'var(--green)' }}>{usd(data.revenue)}</span>
                  </div>
                ))
              }
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            {/* Sales by channel */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Sales by channel — {currentMonth}</div>
              {[
                ['E-commerce', monthEcom, '#6A1B9A'],
                ['Wholesale', monthWS, 'var(--green)'],
              ].map(([l, v, c]) => {
                const total = monthEcom + monthWS
                const pct = total > 0 ? (v / total * 100) : 0
                return (
                  <div key={l} style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                      <span style={{ fontWeight: 500 }}>{l}</span>
                      <span style={{ fontWeight: 600, color: c }}>{usd(v)} <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>({pct.toFixed(0)}%)</span></span>
                    </div>
                    <div style={{ height: 6, background: 'var(--cream-dark)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: pct + '%', background: c, borderRadius: 3 }} />
                    </div>
                  </div>
                )
              })}
              <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: 'var(--text-muted)' }}>Total this month</span>
                <span style={{ fontWeight: 600 }}>{usd(monthEcom + monthWS)}</span>
              </div>
            </div>

            {/* Targets */}
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Distributor targets — {currentMonth}</div>
              {monthTargets.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No targets set for this month</div>
              ) : monthTargets.map(t => {
                const dist = distributors.find(d => d.id === t.distributor_id)
                const achieved = orders.filter(o => o.distributor_id === t.distributor_id && o.date?.startsWith(currentMonth)).reduce((a, o) => a + +o.total_amount, 0)
                const pct = +t.target_amount > 0 ? Math.min(100, achieved / +t.target_amount * 100) : 0
                const met = achieved >= +t.target_amount
                return (
                  <div key={t.id} style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                      <span style={{ fontWeight: 500 }}>{dist?.name || '—'}</span>
                      <span style={{ color: met ? 'var(--green)' : 'var(--amber)', fontWeight: 500 }}>{usd(achieved)} / {usd(t.target_amount)}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--cream-dark)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: pct + '%', background: met ? 'var(--green)' : 'var(--amber)', borderRadius: 3 }} />
                    </div>
                    <div style={{ fontSize: 11, color: met ? 'var(--green)' : 'var(--text-muted)', marginTop: 2 }}>{met ? '✓ Target met!' : pct.toFixed(0) + '% achieved'}</div>
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
