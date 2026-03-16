import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const TYPE_COLORS = { retail: 'badge-green', wholesale: 'badge-blue' }

const EMPTY_FORM = {
  name: '',
  type: 'wholesale',
  effective_date: new Date().toISOString().split('T')[0],
  is_default: false,
}

function fmt(n) {
  return n !== null && n !== undefined
    ? '$' + Number(n).toFixed(2)
    : '—'
}

function margin(price, cost) {
  if (!price || !cost || cost === 0) return null
  return ((price - cost) / price * 100).toFixed(1)
}

export default function PriceLists() {
  const [priceLists, setPriceLists] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null) // price list sélectionnée pour édition
  const [editPrice, setEditPrice] = useState({}) // { product_id: price }

  useEffect(() => {
    fetchPriceLists()
    fetchProducts()
  }, [])

  async function fetchPriceLists() {
    setLoading(true)
    const res = await fetch('/api/price-lists')
    const data = await res.json()
    setPriceLists(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchProducts() {
    const res = await fetch('/api/products?status=active')
    const data = await res.json()
    setProducts(Array.isArray(data) ? data : [])
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/price-lists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchPriceLists()
    setSaving(false)
  }

  async function savePrice(priceListId, productId) {
    const price = editPrice[productId]
    if (!price && price !== 0) return
    await fetch('/api/price-lists', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ price_list_id: priceListId, product_id: productId, unit_price: parseFloat(price) })
    })
    setEditPrice(prev => { const n = {...prev}; delete n[productId]; return n })
    fetchPriceLists()
  }

  function getPrice(pl, productId) {
    return pl.items?.find(i => i.product_id === productId)?.unit_price
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Price Lists</h1>
          <p className="page-sub">{priceLists.length} price list{priceLists.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm(true); setError(null) }}>
            + New Price List
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>New Price List</h3></div>
          <div className="card-body">
            {error && <div style={{ background: '#fee', color: '#c00', padding: '0.5rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>{error}</div>}
            <form onSubmit={handleCreate}>
              <div className="grid-2" style={{ marginBottom: '1rem' }}>
                <div>
                  <label>Name *</label>
                  <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} required placeholder="Wholesale Standard, Retail..." />
                </div>
                <div>
                  <label>Type *</label>
                  <select value={form.type} onChange={e => setForm({...form, type: e.target.value})}>
                    <option value="wholesale">Wholesale</option>
                    <option value="retail">Retail</option>
                  </select>
                </div>
                <div>
                  <label>Effective Date *</label>
                  <input type="date" value={form.effective_date} onChange={e => setForm({...form, effective_date: e.target.value})} required />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingTop: '1.5rem' }}>
                  <input type="checkbox" id="is_default" checked={form.is_default} onChange={e => setForm({...form, is_default: e.target.checked})} />
                  <label htmlFor="is_default" style={{ margin: 0, cursor: 'pointer' }}>Set as default for this type</label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create Price List'}</button>
                <button type="button" className="btn-outline" onClick={() => { setShowForm(false); setError(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</div>
      ) : priceLists.length === 0 ? (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-2)' }}>
          No price lists yet.
        </div>
      ) : priceLists.map(pl => (
        <div key={pl.id} style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{pl.name}</span>
            <span className={`badge ${TYPE_COLORS[pl.type]}`}>{pl.type}</span>
            {pl.is_default && <span className="badge badge-green">Default</span>}
            <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Effective: {pl.effective_date}</span>
            <button
              className="btn-outline"
              style={{ marginLeft: 'auto', padding: '0.2rem 0.6rem', fontSize: 12 }}
              onClick={() => setSelected(selected?.id === pl.id ? null : pl)}
            >
              {selected?.id === pl.id ? 'Close' : 'Edit Prices'}
            </button>
          </div>

          <div className="card">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Avg Cost</th>
                  <th style={{ textAlign: 'right' }}>Price</th>
                  <th style={{ textAlign: 'right' }}>Margin</th>
                  {selected?.id === pl.id && <th>Edit</th>}
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-2)', fontSize: 13 }}>No products yet.</td></tr>
                ) : products.map(p => {
                  const price = getPrice(pl, p.id)
                  const mgn = margin(price, p.unit_cost_avg)
                  const isEditing = selected?.id === pl.id
                  const editVal = editPrice[p.id]

                  return (
                    <tr key={p.id}>
                      <td><strong>{p.sku}</strong></td>
                      <td>{p.name}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmt(p.unit_cost_avg)}</td>
                      <td style={{ textAlign: 'right', fontWeight: price ? 600 : 400, color: price ? 'var(--text-1)' : 'var(--text-2)' }}>
                        {fmt(price)}
                      </td>
                      <td style={{ textAlign: 'right', color: mgn ? (Number(mgn) > 50 ? 'var(--green)' : Number(mgn) > 30 ? '#c07a00' : '#c00') : 'var(--text-2)' }}>
                        {mgn ? `${mgn}%` : '—'}
                      </td>
                      {isEditing && (
                        <td style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder={price || '0.00'}
                            value={editVal !== undefined ? editVal : ''}
                            onChange={e => setEditPrice({ ...editPrice, [p.id]: e.target.value })}
                            style={{ width: 80 }}
                          />
                          <button
                            className="btn-primary"
                            style={{ padding: '0.2rem 0.5rem', fontSize: 11 }}
                            onClick={() => savePrice(pl.id, p.id)}
                            disabled={editVal === undefined || editVal === ''}
                          >
                            Save
                          </button>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </Layout>
  )
}
