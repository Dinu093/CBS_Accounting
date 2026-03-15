import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd, pct, fdate } from '../lib/constants'
import { useAuth } from '../lib/auth'

export async function getServerSideProps() { return { props: {} } }

const EMPTY = { product_name: '', sku: '', msrp: '', unit_cost: '', quantity_on_hand: 0, reorder_level: '', lead_time_days: 30, notes: '' }

export default function Products() {
  const { isAdmin } = useAuth()
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = () => { setLoading(true); fetch('/api/products').then(r => r.json()).then(d => { setProducts(Array.isArray(d) ? d : []); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (p) => { setEditing(p.id); setForm({ product_name: p.product_name, sku: p.sku || '', msrp: p.msrp || '', unit_cost: p.unit_cost || '', quantity_on_hand: p.quantity_on_hand || 0, reorder_level: p.reorder_level || '', lead_time_days: p.lead_time_days || 30, notes: p.notes || '' }); setShowModal(true) }

  const save = async () => {
    if (!form.product_name) return
    setSaving(true)
    const body = { ...form, msrp: form.msrp ? +form.msrp : null, unit_cost: form.unit_cost ? +form.unit_cost : 0, reorder_level: form.reorder_level ? +form.reorder_level : 0, lead_time_days: +form.lead_time_days || 30 }
    if (editing) { body.id = editing; await fetch('/api/products', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    else { await fetch('/api/products', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    setSaving(false); setShowModal(false); load()
  }

  const del = async (id) => {
    if (!confirm('Delete this product?')) return
    await fetch('/api/products?id=' + id, { method: 'DELETE' }); load()
  }

  const margin = (p) => p.msrp && p.unit_cost ? ((+p.msrp - +p.unit_cost) / +p.msrp * 100) : null
  const lowStock = products.filter(p => +p.quantity_on_hand <= +p.reorder_level && +p.reorder_level > 0)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p>{products.length} products{lowStock.length > 0 ? ` · ${lowStock.length} low stock` : ''}</p>
        </div>
        {isAdmin && <button className="btn btn-primary" onClick={openNew}>+ New product</button>}
      </div>

      {lowStock.length > 0 && (
        <div className="alert alert-warning">⚠ Low stock: {lowStock.map(p => p.product_name).join(', ')}</div>
      )}

      {loading ? <div className="loading">Loading…</div> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="td-right">MSRP</th>
                <th className="td-right">Unit cost (CMP)</th>
                <th className="td-right">Margin</th>
                <th className="td-right">In stock</th>
                <th className="td-right">Reorder at</th>
                <th>Lead time</th>
                <th>Status</th>
                {isAdmin && <th></th>}
              </tr>
            </thead>
            <tbody>
              {products.length === 0 ? (
                <tr><td colSpan={isAdmin ? 10 : 9} style={{ textAlign: 'center', color: 'var(--text-3)', padding: 40 }}>No products yet</td></tr>
              ) : products.map(p => {
                const m = margin(p)
                const isLow = +p.quantity_on_hand <= +p.reorder_level && +p.reorder_level > 0
                const isNeg = +p.quantity_on_hand < 0
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.product_name}</td>
                    <td className="td-muted">{p.sku || '—'}</td>
                    <td className="td-right td-mono">{p.msrp ? usd(p.msrp) : '—'}</td>
                    <td className="td-right td-mono">{usd(p.unit_cost)}</td>
                    <td className="td-right" style={{ color: m ? (m > 50 ? 'var(--green)' : m > 30 ? 'var(--amber)' : 'var(--red)') : 'var(--text-3)' }}>{m !== null ? pct(m) : '—'}</td>
                    <td className="td-right td-mono" style={{ fontWeight: 600, color: isNeg ? 'var(--red)' : isLow ? 'var(--amber)' : 'var(--green)' }}>{p.quantity_on_hand}</td>
                    <td className="td-right td-muted">{p.reorder_level || '—'}</td>
                    <td className="td-muted">{p.lead_time_days ? p.lead_time_days + 'd' : '—'}</td>
                    <td>{isNeg ? <span className="badge badge-red">Negative</span> : isLow ? <span className="badge badge-amber">Low</span> : <span className="badge badge-green">OK</span>}</td>
                    {isAdmin && <td><div style={{ display: 'flex', gap: 6 }}><button className="btn btn-outline btn-sm" onClick={() => openEdit(p)}>Edit</button><button className="btn btn-danger btn-sm" onClick={() => del(p.id)}>Delete</button></div></td>}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>{editing ? 'Edit product' : 'New product'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Product name *</label><input type="text" value={form.product_name} onChange={e => setForm({...form, product_name: e.target.value})} placeholder="Radiance Face Cream" /></div>
                <div className="form-group"><label className="form-label">SKU</label><input type="text" value={form.sku} onChange={e => setForm({...form, sku: e.target.value})} placeholder="RFC-2026" /></div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">MSRP (retail price)</label><input type="number" value={form.msrp} onChange={e => setForm({...form, msrp: e.target.value})} placeholder="90.00" /></div>
                <div className="form-group"><label className="form-label">Unit cost (CMP — auto-updated)</label><input type="number" value={form.unit_cost} onChange={e => setForm({...form, unit_cost: e.target.value})} placeholder="0.00" /></div>
              </div>
              <div className="form-row form-row-3">
                <div className="form-group"><label className="form-label">In stock</label><input type="number" value={form.quantity_on_hand} onChange={e => setForm({...form, quantity_on_hand: e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Reorder at (units)</label><input type="number" value={form.reorder_level} onChange={e => setForm({...form, reorder_level: e.target.value})} placeholder="90" /></div>
                <div className="form-group"><label className="form-label">Lead time (days)</label><input type="number" value={form.lead_time_days} onChange={e => setForm({...form, lead_time_days: e.target.value})} placeholder="30" /></div>
              </div>
              <div className="form-group"><label className="form-label">Notes</label><textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} rows={2} placeholder="Any notes…" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : editing ? 'Update' : 'Create product'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
