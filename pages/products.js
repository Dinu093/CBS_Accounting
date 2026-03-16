import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FormField, ModalInput, ModalSelect, ModalError, ModalActions, BtnPrimary, BtnSecondary } from '../components/FormField'

const STATUS_COLORS = { active: 'badge-green', discontinued: 'badge-red', sample_only: 'badge-amber' }
const STATUS_OPTIONS = ['active', 'discontinued', 'sample_only']

function fmt(n) {
  return n !== null && n !== undefined ? '$' + Number(n).toFixed(2) : '—'
}

function getStock(product) {
  if (!product.stock?.length) return { on_hand: 0, committed: 0, available: 0 }
  return product.stock.reduce((acc, s) => ({
    on_hand: acc.on_hand + (s.qty_on_hand || 0),
    committed: acc.committed + (s.qty_committed || 0),
    available: acc.available + ((s.qty_on_hand || 0) - (s.qty_committed || 0)),
  }), { on_hand: 0, committed: 0, available: 0 })
}

const EMPTY_FORM = {
  sku: '', name: '', family: '', description: '',
  retail_price: '', replenishment_lead_days: 30,
  reorder_point_units: 0, weight_oz: '', tags: '', status: 'active',
}

function ProductForm({ form, setForm, families, onAddFamily }) {
  const [newFamily, setNewFamily] = useState('')
  const [addingFamily, setAddingFamily] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  async function handleAddFamily() {
    if (!newFamily.trim()) return
    await onAddFamily(newFamily.trim())
    f('family', newFamily.trim())
    setNewFamily('')
    setAddingFamily(false)
  }

  return (
    <>
      {/* Identité */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Identity</div>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
        <FormField label="SKU" required>
          <ModalInput value={form.sku} onChange={e => f('sku', e.target.value.toUpperCase())} placeholder="CBS-001" required />
        </FormField>
        <FormField label="Name" required>
          <ModalInput value={form.name} onChange={e => f('name', e.target.value)} placeholder="Brightening Vitamin C Serum" required />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
        <FormField label="Family">
          <div style={{ display: 'flex', gap: 6 }}>
            {addingFamily ? (
              <>
                <ModalInput value={newFamily} onChange={e => setNewFamily(e.target.value)} placeholder="New family name" style={{ flex: 1 }} />
                <button type="button" onClick={handleAddFamily} style={{ padding: '0.55rem 0.75rem', background: 'var(--text-1)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>Add</button>
                <button type="button" onClick={() => setAddingFamily(false)} style={{ padding: '0.55rem 0.6rem', background: 'none', border: '1.5px solid var(--border-2)', borderRadius: 8, fontSize: 13, cursor: 'pointer', color: 'var(--text-2)' }}>✕</button>
              </>
            ) : (
              <>
                <ModalSelect value={form.family} onChange={e => f('family', e.target.value)} style={{ flex: 1 }}>
                  <option value="">No family</option>
                  {families.map(fam => <option key={fam.id} value={fam.name}>{fam.name}</option>)}
                </ModalSelect>
                <button type="button" onClick={() => setAddingFamily(true)} style={{ padding: '0.55rem 0.75rem', background: 'none', border: '1.5px solid var(--border-2)', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>+ New</button>
              </>
            )}
          </div>
        </FormField>
        <FormField label="Status">
          <ModalSelect value={form.status} onChange={e => f('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="discontinued">Discontinued</option>
            <option value="sample_only">Sample only</option>
          </ModalSelect>
        </FormField>
        <div style={{ gridColumn: '1 / -1' }}>
          <FormField label="Description">
            <ModalInput value={form.description} onChange={e => f('description', e.target.value)} placeholder="Short product description..." />
          </FormField>
        </div>
      </div>

      {/* Pricing */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Pricing</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
        <FormField label="Retail Price ($)" hint="Default e-commerce price">
          <ModalInput type="number" step="0.01" value={form.retail_price} onChange={e => f('retail_price', e.target.value)} placeholder="45.00" />
        </FormField>
        <FormField label="Weight (oz)">
          <ModalInput type="number" step="0.01" value={form.weight_oz} onChange={e => f('weight_oz', e.target.value)} placeholder="2.5" />
        </FormField>
      </div>

      {/* Inventory */}
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Inventory</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
        <FormField label="Reorder Point (units)">
          <ModalInput type="number" value={form.reorder_point_units} onChange={e => f('reorder_point_units', parseInt(e.target.value) || 0)} />
        </FormField>
        <FormField label="Lead Time (days)">
          <ModalInput type="number" value={form.replenishment_lead_days} onChange={e => f('replenishment_lead_days', parseInt(e.target.value) || 30)} />
        </FormField>
        <FormField label="Tags" hint="Comma separated">
          <ModalInput value={form.tags} onChange={e => f('tags', e.target.value)} placeholder="bestseller, vitamin-c" />
        </FormField>
      </div>
    </>
  )
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [families, setFamilies] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [familyFilter, setFamilyFilter] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editProduct, setEditProduct] = useState(null)
  const [detailProduct, setDetailProduct] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editForm, setEditForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => { fetchProducts(); fetchFamilies() }, [])

  async function fetchProducts() {
    setLoading(true)
    const res = await fetch(`/api/products${search ? `?search=${search}` : ''}`)
    const data = await res.json()
    setProducts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchFamilies() {
    const res = await fetch('/api/product-families')
    const data = await res.json()
    setFamilies(Array.isArray(data) ? data : [])
  }

  async function addFamily(name) {
    await fetch('/api/product-families', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    })
    fetchFamilies()
  }

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      ...form,
      retail_price: form.retail_price ? parseFloat(form.retail_price) : null,
      weight_oz: form.weight_oz ? parseFloat(form.weight_oz) : null,
      reorder_point_units: parseInt(form.reorder_point_units) || 0,
      replenishment_lead_days: parseInt(form.replenishment_lead_days) || 30,
      tags: form.tags ? form.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
    }
    const res = await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setCreateOpen(false); setForm(EMPTY_FORM); fetchProducts(); setSaving(false)
  }

  async function handleEdit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const payload = {
      id: editProduct.id,
      ...editForm,
      retail_price: editForm.retail_price ? parseFloat(editForm.retail_price) : null,
      weight_oz: editForm.weight_oz ? parseFloat(editForm.weight_oz) : null,
      reorder_point_units: parseInt(editForm.reorder_point_units) || 0,
      replenishment_lead_days: parseInt(editForm.replenishment_lead_days) || 30,
      tags: typeof editForm.tags === 'string'
        ? editForm.tags.split(',').map(t => t.trim()).filter(Boolean)
        : editForm.tags || [],
    }
    const res = await fetch('/api/products', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setEditProduct(null); fetchProducts(); setSaving(false)
  }

  function openEdit(product, e) {
    e?.stopPropagation()
    setEditProduct(product)
    setError(null)
    setEditForm({
      sku: product.sku || '',
      name: product.name || '',
      family: product.family || '',
      description: product.description || '',
      retail_price: product.retail_price || '',
      replenishment_lead_days: product.replenishment_lead_days || 30,
      reorder_point_units: product.reorder_point_units || 0,
      weight_oz: product.weight_oz || '',
      tags: Array.isArray(product.tags) ? product.tags.join(', ') : (product.tags || ''),
      status: product.status || 'active',
    })
  }

  const filtered = products.filter(p =>
    (!search || p.sku?.toLowerCase().includes(search.toLowerCase()) || p.name?.toLowerCase().includes(search.toLowerCase())) &&
    (!familyFilter || p.family === familyFilter)
  )

  const existingFamilies = [...new Set(products.map(p => p.family).filter(Boolean))]

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p className="page-sub">{filtered.length} product{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setCreateOpen(true); setError(null); setForm(EMPTY_FORM) }}>
            + New Product
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder="Search SKU or name..." value={search} onChange={e => { setSearch(e.target.value); fetchProducts() }} />
        <select className="chip" value={familyFilter} onChange={e => setFamilyFilter(e.target.value)}>
          <option value="">All families</option>
          {families.filter(f => existingFamilies.includes(f.name)).map(f => (
            <option key={f.id} value={f.name}>{f.name}</option>
          ))}
        </select>
      </div>

      {/* Modal création */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Product" subtitle="Add a product to your catalog" width={600}>
        <form onSubmit={handleCreate}>
          <ModalError message={error} />
          <ProductForm form={form} setForm={setForm} families={families} onAddFamily={addFamily} />
          <ModalActions>
            <BtnSecondary onClick={() => setCreateOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Product'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>

      {/* Modal édition */}
      <Modal open={!!editProduct} onClose={() => setEditProduct(null)} title="Edit Product" subtitle={editProduct?.sku} width={600}>
        <form onSubmit={handleEdit}>
          <ModalError message={error} />
          <ProductForm form={editForm} setForm={setEditForm} families={families} onAddFamily={addFamily} />
          <ModalActions>
            <BtnSecondary onClick={() => setEditProduct(null)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save Changes'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>

      {/* Modal détail */}
      <Modal open={!!detailProduct} onClose={() => setDetailProduct(null)} title={detailProduct?.name || ''} subtitle={detailProduct?.sku} width={520}>
        {detailProduct && (() => {
          const s = getStock(detailProduct)
          return (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {[
                ['Family', detailProduct.family || '—'],
                ['Status', detailProduct.status],
                ['Retail Price', fmt(detailProduct.retail_price)],
                ['Avg Cost (WACOG)', fmt(detailProduct.unit_cost_avg)],
                ['Margin', detailProduct.retail_price && detailProduct.unit_cost_avg
                  ? ((detailProduct.retail_price - detailProduct.unit_cost_avg) / detailProduct.retail_price * 100).toFixed(1) + '%' : '—'],
                ['Weight', detailProduct.weight_oz ? `${detailProduct.weight_oz} oz` : '—'],
                ['On Hand', `${s.on_hand} units`],
                ['Committed', `${s.committed} units`],
                ['Available', `${s.available} units`],
                ['Reorder Point', `${detailProduct.reorder_point_units || 0} units`],
                ['Lead Time', `${detailProduct.replenishment_lead_days || 30} days`],
                ['Tags', Array.isArray(detailProduct.tags) ? detailProduct.tags.join(', ') || '—' : '—'],
              ].map(([label, value]) => (
                <div key={label} style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
                </div>
              ))}
            </div>
          )
        })()}
        <ModalActions>
          <BtnSecondary onClick={() => setDetailProduct(null)}>Close</BtnSecondary>
          <BtnPrimary onClick={() => { openEdit(detailProduct); setDetailProduct(null) }}>Edit</BtnPrimary>
        </ModalActions>
      </Modal>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Family</th>
              <th style={{ textAlign: 'right' }}>Retail</th>
              <th style={{ textAlign: 'right' }}>Avg Cost</th>
              <th style={{ textAlign: 'right' }}>Available</th>
              <th>Alert</th>
              <th>Status</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>No products yet.</td></tr>
            ) : filtered.map(p => {
              const s = getStock(p)
              const alert = p.reorder_point_units > 0 && s.available <= p.reorder_point_units
              return (
                <tr key={p.id} onClick={() => setDetailProduct(p)} style={{ cursor: 'pointer' }}>
                  <td><strong style={{ fontSize: 13 }}>{p.sku}</strong></td>
                  <td style={{ fontSize: 13 }}>{p.name}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{p.family || '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(p.retail_price)}</td>
                  <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--text-3)' }}>{fmt(p.unit_cost_avg)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: s.available <= 0 ? 'var(--red)' : 'inherit' }}>{s.available}</td>
                  <td>{alert ? <span className="badge badge-red" style={{ fontSize: 11 }}>⚠ Reorder</span> : <span className="badge badge-green" style={{ fontSize: 11 }}>OK</span>}</td>
                  <td><span className={`badge ${STATUS_COLORS[p.status] || 'badge-gray'}`} style={{ fontSize: 11 }}>{p.status}</span></td>
                  <td onClick={e => e.stopPropagation()}>
                    <button
                      onClick={e => openEdit(p, e)}
                      style={{ fontSize: 12, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', color: 'var(--text-2)' }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
