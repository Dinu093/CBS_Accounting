import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FormField, ModalInput, ModalSelect, ModalError, ModalActions, BtnPrimary, BtnSecondary } from '../components/FormField'

const STATUS_COLORS = { active: 'badge-green', discontinued: 'badge-red', sample_only: 'badge-amber' }

const EMPTY_FORM = {
  sku: '', name: '', family: '', description: '',
  retail_price: '', wholesale_price_default: '',
  replenishment_lead_days: 30, reorder_point_units: 0,
  min_order_qty: 1, weight_oz: '', barcode: '',
  country_of_origin: 'FR', hs_code: '', tags: '',
}

function fmt(n) {
  return n ? '$' + Number(n).toFixed(2) : '—'
}

function getStock(product) {
  if (!product.stock?.length) return { on_hand: 0, committed: 0, available: 0 }
  return product.stock.reduce((acc, s) => ({
    on_hand: acc.on_hand + s.qty_on_hand,
    committed: acc.committed + s.qty_committed,
    available: acc.available + (s.qty_on_hand - s.qty_committed),
  }), { on_hand: 0, committed: 0, available: 0 })
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [familyFilter, setFamilyFilter] = useState('')
  const [open, setOpen] = useState(false)
  const [detailProduct, setDetailProduct] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const families = [...new Set(products.map(p => p.family).filter(Boolean))]

  useEffect(() => { fetchProducts() }, [search, familyFilter])

  async function fetchProducts() {
    setLoading(true)
    const params = new URLSearchParams()
    if (search) params.append('search', search)
    const res = await fetch(`/api/products?${params}`)
    const data = await res.json()
    let result = Array.isArray(data) ? data : []
    if (familyFilter) result = result.filter(p => p.family === familyFilter)
    setProducts(result)
    setLoading(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      ...form,
      retail_price: form.retail_price ? parseFloat(form.retail_price) : null,
      wholesale_price_default: form.wholesale_price_default ? parseFloat(form.wholesale_price_default) : null,
      weight_oz: form.weight_oz ? parseFloat(form.weight_oz) : null,
      replenishment_lead_days: parseInt(form.replenishment_lead_days),
      reorder_point_units: parseInt(form.reorder_point_units),
      min_order_qty: parseInt(form.min_order_qty),
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setOpen(false)
    setForm(EMPTY_FORM)
    fetchProducts()
    setSaving(false)
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p className="page-sub">{products.length} product{products.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setOpen(true); setError(null); setForm(EMPTY_FORM) }}>
            + New Product
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder="Search SKU or name..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="chip" value={familyFilter} onChange={e => setFamilyFilter(e.target.value)}>
          <option value="">All families</option>
          {families.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Modal création */}
      <Modal open={open} onClose={() => setOpen(false)} title="New Product" subtitle="Add a product to your catalog" width={640}>
        <form onSubmit={handleSubmit}>
          <ModalError message={error} />

          {/* Section identité */}
          <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Identity</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="SKU" required>
              <ModalInput value={form.sku} onChange={e => f('sku', e.target.value)} placeholder="CBS-001" required />
            </FormField>
            <FormField label="Family">
              <ModalInput value={form.family} onChange={e => f('family', e.target.value)} placeholder="serum, moisturizer..." />
            </FormField>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Name" required>
                <ModalInput value={form.name} onChange={e => f('name', e.target.value)} placeholder="Brightening Vitamin C Serum" required />
              </FormField>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Description">
                <ModalInput value={form.description} onChange={e => f('description', e.target.value)} placeholder="Short product description..." />
              </FormField>
            </div>
          </div>

          {/* Section pricing */}
          <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pricing</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Retail Price ($)" hint="Default e-commerce price">
              <ModalInput type="number" step="0.01" value={form.retail_price} onChange={e => f('retail_price', e.target.value)} placeholder="45.00" />
            </FormField>
            <FormField label="Wholesale Default ($)" hint="Default wholesale price">
              <ModalInput type="number" step="0.01" value={form.wholesale_price_default} onChange={e => f('wholesale_price_default', e.target.value)} placeholder="22.00" />
            </FormField>
          </div>

          {/* Section logistique */}
          <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Logistics</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Lead Time (days)">
              <ModalInput type="number" value={form.replenishment_lead_days} onChange={e => f('replenishment_lead_days', e.target.value)} />
            </FormField>
            <FormField label="Reorder Point (units)">
              <ModalInput type="number" value={form.reorder_point_units} onChange={e => f('reorder_point_units', e.target.value)} />
            </FormField>
            <FormField label="Min Order Qty">
              <ModalInput type="number" value={form.min_order_qty} onChange={e => f('min_order_qty', e.target.value)} />
            </FormField>
            <FormField label="Weight (oz)">
              <ModalInput type="number" step="0.01" value={form.weight_oz} onChange={e => f('weight_oz', e.target.value)} placeholder="2.5" />
            </FormField>
            <FormField label="Country of Origin">
              <ModalInput value={form.country_of_origin} onChange={e => f('country_of_origin', e.target.value)} placeholder="FR" />
            </FormField>
            <FormField label="HS Code">
              <ModalInput value={form.hs_code} onChange={e => f('hs_code', e.target.value)} placeholder="3304.99" />
            </FormField>
          </div>

          {/* Section autres */}
          <div style={{ marginBottom: '0.5rem', fontSize: 11, fontWeight: 700, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Other</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>
            <FormField label="Barcode / UPC">
              <ModalInput value={form.barcode} onChange={e => f('barcode', e.target.value)} placeholder="012345678901" />
            </FormField>
            <FormField label="Tags" hint="Comma separated: bestseller, new, seasonal">
              <ModalInput value={form.tags} onChange={e => f('tags', e.target.value)} placeholder="bestseller, vitamin-c" />
            </FormField>
          </div>

          <ModalActions>
            <BtnSecondary onClick={() => setOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Product'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>

      {/* Modal détail produit */}
      <Modal open={!!detailProduct} onClose={() => setDetailProduct(null)} title={detailProduct?.name || ''} subtitle={detailProduct?.sku} width={560}>
        {detailProduct && (() => {
          const s = getStock(detailProduct)
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              {[
                ['Family', detailProduct.family || '—'],
                ['Status', detailProduct.status],
                ['Retail Price', fmt(detailProduct.retail_price)],
                ['Wholesale Default', fmt(detailProduct.wholesale_price_default)],
                ['Avg Cost (WACOG)', fmt(detailProduct.unit_cost_avg)],
                ['Retail Margin', detailProduct.retail_price && detailProduct.unit_cost_avg
                  ? ((detailProduct.retail_price - detailProduct.unit_cost_avg) / detailProduct.retail_price * 100).toFixed(1) + '%'
                  : '—'],
                ['On Hand', s.on_hand + ' units'],
                ['Available', s.available + ' units'],
                ['Reorder Point', detailProduct.reorder_point_units + ' units'],
                ['Lead Time', detailProduct.replenishment_lead_days + ' days'],
                ['Min Order Qty', detailProduct.min_order_qty || 1],
                ['Weight', detailProduct.weight_oz ? detailProduct.weight_oz + ' oz' : '—'],
                ['Country of Origin', detailProduct.country_of_origin || '—'],
                ['HS Code', detailProduct.hs_code || '—'],
                ['Barcode', detailProduct.barcode || '—'],
                ['Tags', detailProduct.tags?.join(', ') || '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-2)', marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          )
        })()}
      </Modal>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Family</th>
              <th style={{ textAlign: 'right' }}>Retail</th>
              <th style={{ textAlign: 'right' }}>Wholesale</th>
              <th style={{ textAlign: 'right' }}>Avg Cost</th>
              <th style={{ textAlign: 'right' }}>Available</th>
              <th>Alert</th>
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
                <tr key={p.id} onClick={() => setDetailProduct(p)} style={{ cursor: 'pointer' }}>
                  <td><strong>{p.sku}</strong></td>
                  <td>{p.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.family || '—'}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(p.retail_price)}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(p.wholesale_price_default)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-2)' }}>{fmt(p.unit_cost_avg)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, color: s.available <= 0 ? '#c00' : 'inherit' }}>{s.available}</td>
                  <td>{alert ? <span className="badge badge-red">⚠</span> : <span className="badge badge-green">OK</span>}</td>
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
