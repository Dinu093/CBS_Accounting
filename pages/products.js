import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const STATUS_COLORS = {
  active: 'badge-green',
  discontinued: 'badge-red',
  sample_only: 'badge-amber',
}

const EMPTY_FORM = {
  sku: '', name: '', family: '', description: '',
  replenishment_lead_days: 30, reorder_point_units: 0
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchProducts() }, [search])

  async function fetchProducts() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    const res = await fetch(`/api/products?${params}`)
    const data = await res.json()
    setProducts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchProducts()
    setSaving(false)
  }

  // Calcule stock disponible toutes warehouses confondues
  function getStock(product) {
    if (!product.stock?.length) return { on_hand: 0, committed: 0, available: 0 }
    return product.stock.reduce((acc, s) => ({
      on_hand: acc.on_hand + s.qty_on_hand,
      committed: acc.committed + s.qty_committed,
      available: acc.available + (s.qty_on_hand - s.qty_committed),
    }), { on_hand: 0, committed: 0, available: 0 })
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p className="page-sub">{products.length} product{products.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm(true); setError(null) }}>
            + New Product
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input
          className="search-input"
          placeholder="Search by SKU or name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>New Product</h3></div>
          <div className="card-body">
            {error && <div className="badge-red" style={{ marginBottom: '1rem', padding: '0.5rem 0.75rem', borderRadius: 6 }}>{error}</div>}
            <form onSubmit={handleSubmit}>
              <div className="grid-2">
                <div>
                  <label>SKU *</label>
                  <input value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} required placeholder="CBS-001" />
                </div>
                <div>
                  <label>Name *</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required />
                </div>
                <div>
                  <label>Family</label>
                  <input value={form.family} onChange={e => setForm({...form, family: e.target.value})} placeholder="serum, moisturizer..." />
                </div>
                <div>
                  <label>Description</label>
                  <input value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
                </div>
                <div>
                  <label>Lead Time (days)</label>
                  <input type="number" value={form.replenishment_lead_days} onChange={e => setForm({...form, replenishment_lead_days: parseInt(e.target.value)})} />
                </div>
                <div>
                  <label>Reorder Point (units)</label>
                  <input type="number" value={form.reorder_point_units} onChange={e => setForm({...form, reorder_point_units: parseInt(e.target.value)})} />
                </div>
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Product'}</button>
                <button type="button" className="btn-outline" onClick={() => { setShowForm(false); setError(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Family</th>
              <th>Avg Cost</th>
              <th>On Hand</th>
              <th>Committed</th>
              <th>Available</th>
              <th>Reorder Alert</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No products yet.</td></tr>
            ) : products.map(p => {
              const s = getStock(p)
              const alert = p.reorder_point_units && s.available <= p.reorder_point_units
              return (
                <tr key={p.id}>
                  <td><strong>{p.sku}</strong></td>
                  <td>{p.name}</td>
                  <td>{p.family || '—'}</td>
                  <td>{p.unit_cost_avg ? `$${Number(p.unit_cost_avg).toFixed(2)}` : '—'}</td>
                  <td>{s.on_hand}</td>
                  <td>{s.committed}</td>
                  <td><strong>{s.available}</strong></td>
                  <td>{alert ? <span className="badge badge-red">⚠ Reorder</span> : <span className="badge badge-green">OK</span>}</td>
                  <td><span className={`badge ${STATUS_COLORS[p.status] || 'badge-gray'}`}>{p.status}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
