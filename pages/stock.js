import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FormField, ModalInput, ModalSelect, ModalError, ModalActions, BtnPrimary, BtnSecondary } from '../components/FormField'

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Stock() {
  const router = useRouter()
  const [stock, setStock] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [reorderOnly, setReorderOnly] = useState(false)
  const [adjustOpen, setAdjustOpen] = useState(false)
  const [products, setProducts] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [adjForm, setAdjForm] = useState({ product_id: '', warehouse_id: '', quantity: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const f = (k, v) => setAdjForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    fetchStock()
    fetch('/api/products').then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : []))
    fetch('/api/warehouses').then(r => r.json()).then(d => setWarehouses(Array.isArray(d) ? d : []))
  }, [reorderOnly])

  async function fetchStock() {
    setLoading(true)
    const params = new URLSearchParams()
    if (reorderOnly) params.append('reorder_only', 'true')
    const res = await fetch(`/api/stock?${params}`)
    const data = await res.json()
    setStock(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function handleAdjust(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const qty = parseInt(adjForm.quantity)
    if (isNaN(qty) || qty === 0) { setError('Quantity cannot be zero'); setSaving(false); return }
    const res = await fetch('/api/stock-adjustment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...adjForm, quantity: qty })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setAdjustOpen(false)
    setAdjForm({ product_id: '', warehouse_id: '', quantity: '', notes: '' })
    fetchStock()
    setSaving(false)
  }

  const filtered = stock.filter(s =>
    !search ||
    s.sku?.toLowerCase().includes(search.toLowerCase()) ||
    s.product_name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalValue = filtered.reduce((s, r) => s + Number(r.inventory_value || 0), 0)
  const alerts = filtered.filter(r => r.reorder_alert).length

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Stock</h1>
          <p className="page-sub">
            Inventory value: <strong>{fmt(totalValue)}</strong>
            {alerts > 0 && <span style={{ color: 'var(--red)', marginLeft: 8 }}>⚠ {alerts} reorder alert{alerts > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => setAdjustOpen(true)}>
            ± Adjust
          </button>
          <button className="btn-primary" onClick={() => router.push('/receipts')}>
            + Receive Stock
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder="Search SKU or product..." value={search} onChange={e => setSearch(e.target.value)} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-2)' }}>
          <input type="checkbox" checked={reorderOnly} onChange={e => setReorderOnly(e.target.checked)} />
          Reorder alerts only
        </label>
      </div>

      {/* KPIs */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { label: 'Total SKUs', value: filtered.length },
          { label: 'Total On Hand', value: filtered.reduce((s, r) => s + (r.qty_on_hand || 0), 0) + ' units' },
          { label: 'Committed', value: filtered.reduce((s, r) => s + (r.qty_committed || 0), 0) + ' units' },
          { label: 'Available', value: filtered.reduce((s, r) => s + (r.qty_available || 0), 0) + ' units' },
          { label: 'Inventory Value', value: fmt(totalValue) },
        ].map(kpi => (
          <div key={kpi.label} className="card" style={{ flex: 1, minWidth: 120, padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{kpi.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{kpi.value}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Product</th>
              <th>Family</th>
              <th style={{ textAlign: 'right' }}>On Hand</th>
              <th style={{ textAlign: 'right' }}>Committed</th>
              <th style={{ textAlign: 'right' }}>Available</th>
              <th style={{ textAlign: 'right' }}>Avg Cost</th>
              <th style={{ textAlign: 'right' }}>Value</th>
              <th>Alert</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>No stock data. Receive stock first.</td></tr>
            ) : filtered.map((s, i) => (
              <tr key={i} style={s.reorder_alert ? { background: '#fff8f8' } : {}}>
                <td><strong style={{ fontSize: 13 }}>{s.sku}</strong></td>
                <td style={{ fontSize: 13 }}>{s.product_name}</td>
                <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{s.family || '—'}</td>
                <td style={{ textAlign: 'right', fontSize: 13 }}>{s.qty_on_hand}</td>
                <td style={{ textAlign: 'right', fontSize: 13, color: s.qty_committed > 0 ? 'var(--amber)' : 'inherit' }}>{s.qty_committed}</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: s.qty_available <= 0 ? 'var(--red)' : 'inherit' }}>{s.qty_available}</td>
                <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-3)' }}>{s.unit_cost_avg ? fmt(s.unit_cost_avg) : '—'}</td>
                <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(s.inventory_value)}</td>
                <td>
                  {s.reorder_alert
                    ? <span className="badge badge-red" style={{ fontSize: 11 }}>⚠ Reorder</span>
                    : <span className="badge badge-green" style={{ fontSize: 11 }}>OK</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={adjustOpen} onClose={() => setAdjustOpen(false)} title="Stock Adjustment" subtitle="Correct inventory for damage, loss or counting errors">
        <form onSubmit={handleAdjust}>
          {error && <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', color: '#c53030', borderRadius: 8, padding: '0.6rem', fontSize: 13, marginBottom: '1rem' }}>{error}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            <FormField label="Product" required>
              <ModalSelect value={adjForm.product_id} onChange={e => f('product_id', e.target.value)} required>
                <option value="">Select product...</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
              </ModalSelect>
            </FormField>
            <FormField label="Warehouse" required>
              <ModalSelect value={adjForm.warehouse_id} onChange={e => f('warehouse_id', e.target.value)} required>
                <option value="">Select warehouse...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </ModalSelect>
            </FormField>
            <FormField label="Quantity" required hint="Positive to add, negative to remove (e.g. -5 for shrinkage)">
              <ModalInput type="number" value={adjForm.quantity} onChange={e => f('quantity', e.target.value)} placeholder="-5 or +10" required />
            </FormField>
            <FormField label="Reason" required>
              <ModalInput value={adjForm.notes} onChange={e => f('notes', e.target.value)} placeholder="Damaged, counting correction..." required />
            </FormField>
          </div>
          <ModalActions>
            <BtnSecondary onClick={() => setAdjustOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Apply Adjustment'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  )
}
