import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

const EMPTY_FORM = {
  product_name: '', sku: '', supplier: '',
  prod_cost: '', freight_cost: '', tariff_cost: '',
  msrp: '', reorder_level: 10, quantity_on_hand: 0
}

export default function Products() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/inventory?t=' + Date.now())
      .then(r => r.json())
      .then(d => { setProducts(Array.isArray(d) ? d : []); setLoading(false) })
  }
  useEffect(() => { load() }, [])

  const unitCost = (f) => {
    const p = parseFloat(f.prod_cost) || 0
    const fr = parseFloat(f.freight_cost) || 0
    const t = parseFloat(f.tariff_cost) || 0
    return p + fr + t
  }

  const save = async () => {
    if (!form.product_name) return
    setSaving(true)
    const body = {
      ...form,
      unit_cost: unitCost(form),
      prod_cost: parseFloat(form.prod_cost) || 0,
      freight_cost: parseFloat(form.freight_cost) || 0,
      tariff_cost: parseFloat(form.tariff_cost) || 0,
      msrp: parseFloat(form.msrp) || null,
      reorder_level: parseInt(form.reorder_level) || 10,
      quantity_on_hand: parseInt(form.quantity_on_hand) || 0,
    }
    if (editing) {
      await fetch('/api/inventory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: editing, ...body }) })
    } else {
      await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    }
    setSaving(false); setShowModal(false); setEditing(null); setForm(EMPTY_FORM); load()
  }

  const del = async (id) => {
    if (!confirm('Delete this product?')) return
    await fetch('/api/inventory?id=' + id, { method: 'DELETE' }); load()
  }

  const lowStock = products.filter(p => p.quantity_on_hand <= (p.reorder_level || 10))

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p>{products.length} product{products.length !== 1 ? 's' : ''} · {lowStock.length > 0 ? <span style={{ color: 'var(--red)' }}>{lowStock.length} low stock</span> : 'All stocked'}</p>
        </div>
        <button className="primary" onClick={() => { setForm(EMPTY_FORM); setEditing(null); setShowModal(true) }}>+ New product</button>
      </div>

      {lowStock.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '1.25rem' }}>
          ⚠ Low stock: {lowStock.map(p => p.product_name + ' (' + p.quantity_on_hand + ' units)').join(' · ')}
        </div>
      )}

      {loading ? <div className="loading">Loading…</div> : products.length === 0 ? (
        <div className="card"><div className="empty-state"><div style={{ fontSize: 36 }}>📦</div><p>No products yet</p><button className="primary" style={{ marginTop: 12 }} onClick={() => setShowModal(true)}>+ Add your first product</button></div></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
          {products.map(p => {
            const uc = parseFloat(p.unit_cost) || 0
            const msrp = parseFloat(p.msrp) || 0
            const margin = msrp > 0 ? ((msrp - uc) / msrp * 100) : 0
            const isLow = p.quantity_on_hand <= (p.reorder_level || 10)
            return (
              <div key={p.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{p.product_name}</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {p.sku && <span className="pill" style={{ background: 'var(--blue-light)', color: 'var(--navy-mid)', fontSize: 11 }}>{p.sku}</span>}
                      {p.supplier && <span className="pill" style={{ background: 'var(--cream-dark)', color: 'var(--text-muted)', fontSize: 11 }}>{p.supplier}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => { setForm({ product_name: p.product_name, sku: p.sku || '', supplier: p.supplier || '', prod_cost: p.prod_cost || '', freight_cost: p.freight_cost || '', tariff_cost: p.tariff_cost || '', msrp: p.msrp || '', reorder_level: p.reorder_level || 10, quantity_on_hand: p.quantity_on_hand || 0 }); setEditing(p.id); setShowModal(true) }} style={{ border: 'none', background: 'none', color: 'var(--blue-pearl)', cursor: 'pointer', fontSize: 12 }}>Edit</button>
                    <button onClick={() => del(p.id)} style={{ border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
                  </div>
                </div>

                {/* Stock level */}
                <div style={{ padding: '10px 12px', background: isLow ? 'var(--red-light)' : 'var(--green-light)', borderRadius: 'var(--radius-sm)', marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: isLow ? 'var(--red)' : 'var(--green)', fontWeight: 500 }}>{isLow ? '⚠ Low stock' : '✓ In stock'}</span>
                    <span style={{ fontSize: 20, fontWeight: 300, color: isLow ? 'var(--red)' : 'var(--green)' }}>{p.quantity_on_hand}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Reorder at {p.reorder_level || 10} units</div>
                </div>

                {/* Cost breakdown */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-muted)', marginBottom: 6 }}>Cost breakdown</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                    {[['Production', p.prod_cost], ['Freight', p.freight_cost], ['Tariffs', p.tariff_cost]].map(([l, v]) => (
                      <div key={l} style={{ padding: '6px 8px', background: 'var(--cream)', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>{l}</div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{usd(v || 0)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Totals */}
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div style={{ textAlign: 'center', padding: '6px', background: 'var(--cream)', borderRadius: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Unit cost</div>
                    <div style={{ fontSize: 16, fontWeight: 400, color: 'var(--red)', marginTop: 2 }}>{usd(uc)}</div>
                  </div>
                  {msrp > 0 && (
                    <div style={{ textAlign: 'center', padding: '6px', background: 'var(--cream)', borderRadius: 6 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>MSRP margin</div>
                      <div style={{ fontSize: 16, fontWeight: 400, color: margin >= 0 ? 'var(--green)' : 'var(--red)', marginTop: 2 }}>{margin.toFixed(1)}%</div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <h2>{editing ? 'Edit product' : 'New product'}</h2>
            <div className="form-row">
              <div className="form-group"><label>Product name *</label><input type="text" placeholder="Radiance Face Cream" value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} /></div>
              <div className="form-group"><label>SKU / Reference</label><input type="text" placeholder="RFC-001" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Supplier</label><input type="text" placeholder="The French Lab" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} /></div>
              <div className="form-group"><label>MSRP ($)</label><input type="number" placeholder="90.00" value={form.msrp} onChange={e => setForm({ ...form, msrp: e.target.value })} /></div>
            </div>

            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '1rem 0 8px', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>Cost breakdown</div>
            <div className="form-row">
              <div className="form-group"><label>Production cost ($)</label><input type="number" placeholder="0.00" value={form.prod_cost} onChange={e => setForm({ ...form, prod_cost: e.target.value })} /></div>
              <div className="form-group"><label>Freight cost ($)</label><input type="number" placeholder="0.00" value={form.freight_cost} onChange={e => setForm({ ...form, freight_cost: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Tariff / customs ($)</label><input type="number" placeholder="0.00" value={form.tariff_cost} onChange={e => setForm({ ...form, tariff_cost: e.target.value })} /></div>
              <div className="form-group">
                <label>Total unit cost</label>
                <div style={{ padding: '9px 12px', background: 'var(--cream)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: 14, fontWeight: 600, color: 'var(--red)' }}>{usd(unitCost(form))}</div>
              </div>
            </div>

            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '1rem 0 8px', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>Stock</div>
            <div className="form-row">
              <div className="form-group"><label>Current stock</label><input type="number" placeholder="0" value={form.quantity_on_hand} onChange={e => setForm({ ...form, quantity_on_hand: e.target.value })} /></div>
              <div className="form-group"><label>Reorder alert level</label><input type="number" placeholder="10" value={form.reorder_level} onChange={e => setForm({ ...form, reorder_level: e.target.value })} /></div>
            </div>

            <div className="form-actions">
              <button className="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Save changes' : 'Add product'}</button>
              <button onClick={() => { setShowModal(false); setEditing(null); setForm(EMPTY_FORM) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
