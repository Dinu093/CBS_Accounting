import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd, fdate } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

export default function Stock() {
  const [products, setProducts] = useState([])
  const [shipments, setShipments] = useState([])
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')

  useEffect(() => {
    Promise.all([
      fetch('/api/inventory?t=' + Date.now()).then(r => r.json()),
      fetch('/api/shipments?t=' + Date.now()).then(r => r.json()),
      fetch('/api/sales?t=' + Date.now()).then(r => r.json()),
    ]).then(([p, s, o]) => {
      setProducts(Array.isArray(p) ? p : [])
      setShipments(Array.isArray(s) ? s : [])
      setSales(Array.isArray(o) ? o : [])
      setLoading(false)
    })
  }, [])

  // Build stock movements from shipments (IN) and sales (OUT)
  const movements = []

  shipments.forEach(s => {
    ;(s.shipment_items || []).forEach(item => {
      movements.push({
        date: s.date,
        type: 'IN',
        product: item.inventory?.product_name || '—',
        product_id: item.product_id,
        quantity: parseFloat(item.quantity || 0),
        reference: s.reference,
        note: 'Shipment ' + s.reference,
        unit_cost: parseFloat(item.unit_cost || 0),
      })
    })
  })

  sales.forEach(o => {
    ;(o.sale_items || []).forEach(item => {
      movements.push({
        date: o.date,
        type: 'OUT',
        product: item.inventory?.product_name || '—',
        product_id: item.product_id,
        quantity: parseFloat(item.quantity || 0),
        reference: o.reference || o.id?.slice(0, 8),
        note: (o.channel || '') + (o.buyer_name ? ' — ' + o.buyer_name : ''),
        unit_cost: parseFloat(item.unit_cost || 0),
      })
    })
  })

  movements.sort((a, b) => b.date?.localeCompare(a.date))

  const totalIn = movements.filter(m => m.type === 'IN').reduce((a, m) => a + m.quantity, 0)
  const totalOut = movements.filter(m => m.type === 'OUT').reduce((a, m) => a + m.quantity, 0)

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'in', label: 'Stock IN (' + movements.filter(m => m.type === 'IN').length + ')' },
    { id: 'out', label: 'Stock OUT (' + movements.filter(m => m.type === 'OUT').length + ')' },
    { id: 'all', label: 'All movements' },
  ]

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Stock</h1>
          <p>Inventory movements · {totalIn} units in · {totalOut} units out</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={'tab-btn' + (activeTab === t.id ? ' active' : '')}>{t.label}</button>)}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <>
          {activeTab === 'overview' && (
            <div>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                  ['Total units in stock', products.reduce((a, p) => a + (p.quantity_on_hand || 0), 0), 'var(--navy)'],
                  ['Total stock IN', totalIn, 'var(--green)'],
                  ['Total stock OUT', totalOut, 'var(--red)'],
                  ['Stock value', usd(products.reduce((a, p) => a + (p.quantity_on_hand || 0) * (p.unit_cost || 0), 0)), 'var(--amber)'],
                ].map(([l, v, c]) => (
                  <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
                ))}
              </div>

              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Current stock levels</div>
                <table>
                  <thead><tr><th>Product</th><th>SKU</th><th>Supplier</th><th style={{ textAlign: 'right' }}>In stock</th><th style={{ textAlign: 'right' }}>Reorder at</th><th style={{ textAlign: 'right' }}>Unit cost</th><th style={{ textAlign: 'right' }}>Stock value</th><th>Status</th></tr></thead>
                  <tbody>
                    {products.map(p => {
                      const isLow = p.quantity_on_hand <= (p.reorder_level || 10)
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500 }}>{p.product_name}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.sku || '—'}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.supplier || '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: isLow ? 'var(--red)' : 'var(--green)', fontSize: 16 }}>{p.quantity_on_hand}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{p.reorder_level || 10}</td>
                          <td style={{ textAlign: 'right' }}>{usd(p.unit_cost)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{usd((p.quantity_on_hand || 0) * (p.unit_cost || 0))}</td>
                          <td>{isLow ? <span className="pill" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>Low stock</span> : <span className="pill" style={{ background: 'var(--green-light)', color: 'var(--green)' }}>OK</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(activeTab === 'in' || activeTab === 'out' || activeTab === 'all') && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Product</th>
                    <th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Unit cost</th>
                    <th>Reference</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {movements
                    .filter(m => activeTab === 'all' || m.type === activeTab.toUpperCase())
                    .map((m, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(m.date)}</td>
                        <td>
                          <span className="pill" style={{ background: m.type === 'IN' ? 'var(--green-light)' : 'var(--red-light)', color: m.type === 'IN' ? 'var(--green)' : 'var(--red)' }}>
                            {m.type === 'IN' ? '↑ IN' : '↓ OUT'}
                          </span>
                        </td>
                        <td style={{ fontWeight: 500 }}>{m.product}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: m.type === 'IN' ? 'var(--green)' : 'var(--red)', fontSize: 15 }}>
                          {m.type === 'IN' ? '+' : '−'}{m.quantity}
                        </td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{usd(m.unit_cost)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.reference}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.note}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              {movements.filter(m => activeTab === 'all' || m.type === activeTab.toUpperCase()).length === 0 && (
                <div className="empty-state"><p>No movements yet</p></div>
              )}
            </div>
          )}
        </>
      )}
    </Layout>
  )
}
