import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const EMPTY_FORM = {
  supplier_id: '',
  warehouse_id: '',
  receipt_date: new Date().toISOString().split('T')[0],
  notes: '',
  lines: [{ product_id: '', quantity_received: 1, unit_cost: 0, freight_cost_alloc: 0, customs_cost_alloc: 0 }]
}

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Receipts() {
  const [receipts, setReceipts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    fetchReceipts()
    fetchSuppliers()
    fetchWarehouses()
    fetchProducts()
  }, [])

  async function fetchReceipts() {
    setLoading(true)
    const res = await fetch('/api/receipts')
    const data = await res.json()
    setReceipts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchSuppliers() {
    const { data } = await (await fetch('/api/suppliers')).json ? 
      { data: [] } : { data: [] }
    // Fetch direct depuis supabase via API dédiée — pour l'instant on charge via receipts
    const res = await fetch('/api/suppliers')
    const json = await res.json()
    setSuppliers(Array.isArray(json) ? json : [])
  }

  async function fetchWarehouses() {
    const res = await fetch('/api/warehouses')
    const json = await res.json()
    setWarehouses(Array.isArray(json) ? json : [])
  }

  async function fetchProducts() {
    const res = await fetch('/api/products?status=active')
    const json = await res.json()
    setProducts(Array.isArray(json) ? json : [])
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { product_id: '', quantity_received: 1, unit_cost: 0, freight_cost_alloc: 0, customs_cost_alloc: 0 }] })
  }

  function removeLine(i) {
    setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) })
  }

  function updateLine(i, field, value) {
    const lines = [...form.lines]
    lines[i] = { ...lines[i], [field]: value }
    setForm({ ...form, lines })
  }

  function landedCost(line) {
    return Number(line.unit_cost) + Number(line.freight_cost_alloc || 0) + Number(line.customs_cost_alloc || 0)
  }

  function lineTotal(line) {
    return landedCost(line) * Number(line.quantity_received)
  }

  const grandTotal = form.lines.reduce((s, l) => s + lineTotal(l), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchReceipts()
    setSaving(false)
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Stock Receipts</h1>
          <p className="page-sub">Incoming stock from suppliers — updates WACOG automatically</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm(true); setError(null) }}>
            + New Receipt
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>New Stock Receipt</h3></div>
          <div className="card-body">
            {error && (
              <div style={{ background: '#fee', color: '#c00', padding: '0.5rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="grid-2" style={{ marginBottom: '1.25rem' }}>
                <div>
                  <label>Supplier *</label>
                  <select value={form.supplier_id} onChange={e => setForm({...form, supplier_id: e.target.value})} required>
                    <option value="">Select supplier...</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Warehouse *</label>
                  <select value={form.warehouse_id} onChange={e => setForm({...form, warehouse_id: e.target.value})} required>
                    <option value="">Select warehouse...</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label>Receipt Date *</label>
                  <input type="date" value={form.receipt_date} onChange={e => setForm({...form, receipt_date: e.target.value})} required />
                </div>
                <div>
                  <label>Notes</label>
                  <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="PO number, shipment ref..." />
                </div>
              </div>

              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: '0.75rem' }}>Products Received</div>
              <table style={{ marginBottom: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit Cost</th>
                    <th>Freight / unit</th>
                    <th>Customs / unit</th>
                    <th>Landed Cost</th>
                    <th>Total</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {form.lines.map((line, i) => (
                    <tr key={i}>
                      <td>
                        <select
                          value={line.product_id}
                          onChange={e => updateLine(i, 'product_id', e.target.value)}
                          required style={{ minWidth: 160 }}
                        >
                          <option value="">Select...</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                        </select>
                      </td>
                      <td>
                        <input type="number" min="1" value={line.quantity_received}
                          onChange={e => updateLine(i, 'quantity_received', parseInt(e.target.value))}
                          style={{ width: 60 }} required />
                      </td>
                      <td>
                        <input type="number" min="0" step="0.0001" value={line.unit_cost}
                          onChange={e => updateLine(i, 'unit_cost', parseFloat(e.target.value))}
                          style={{ width: 80 }} required />
                      </td>
                      <td>
                        <input type="number" min="0" step="0.0001" value={line.freight_cost_alloc}
                          onChange={e => updateLine(i, 'freight_cost_alloc', parseFloat(e.target.value))}
                          style={{ width: 80 }} />
                      </td>
                      <td>
                        <input type="number" min="0" step="0.0001" value={line.customs_cost_alloc}
                          onChange={e => updateLine(i, 'customs_cost_alloc', parseFloat(e.target.value))}
                          style={{ width: 80 }} />
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>
                        {fmt(landedCost(line))}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {fmt(lineTotal(line))}
                      </td>
                      <td>
                        {form.lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(i)}
                            style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 16 }}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <button type="button" className="btn-outline" onClick={addLine}>+ Add Product</button>
                <strong>Total landed value: {fmt(grandTotal)}</strong>
              </div>

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save Receipt'}</button>
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
              <th>Receipt #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Warehouse</th>
              <th>Lines</th>
              <th>Total Value</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : receipts.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No receipts yet.</td></tr>
            ) : receipts.map(r => {
              const total = (r.lines || []).reduce((s, l) => s + Number(l.total_value), 0)
              const isOpen = expanded === r.id
              return (
                <>
                  <tr key={r.id}>
                    <td><strong>{r.receipt_number}</strong></td>
                    <td>{r.receipt_date}</td>
                    <td>{r.supplier?.name || '—'}</td>
                    <td>{r.warehouse?.name || '—'}</td>
                    <td>{r.lines?.length || 0}</td>
                    <td><strong>{fmt(total)}</strong></td>
                    <td style={{ fontSize: 12, color: 'var(--text-2)' }}>{r.notes || '—'}</td>
                    <td>
                      <button
                        className="btn-outline"
                        style={{ padding: '0.2rem 0.6rem', fontSize: 11 }}
                        onClick={() => setExpanded(isOpen ? null : r.id)}
                      >
                        {isOpen ? 'Hide' : 'Detail'}
                      </button>
                    </td>
                  </tr>
                  {isOpen && (r.lines || []).map(l => (
                    <tr key={l.id} style={{ background: 'var(--bg)', fontSize: 13 }}>
                      <td colSpan={2} style={{ paddingLeft: '2rem', color: 'var(--text-2)' }}>↳ {l.product?.sku}</td>
                      <td colSpan={2}>{l.product?.name}</td>
                      <td>Qty: {l.quantity_received}</td>
                      <td>Landed: {fmt(l.total_landed_cost)}/unit</td>
                      <td>Total: {fmt(l.total_value)}</td>
                      <td>
                        <span style={{ fontSize: 11, color: 'var(--text-2)' }}>
                          New avg: {fmt(l.product?.unit_cost_avg)}/unit
                        </span>
                      </td>
                    </tr>
                  ))}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
