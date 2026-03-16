import { useState, useEffect } from 'react'
import Layout from '../components/Layout'

const STATUS_COLORS = {
  draft: 'badge-gray',
  confirmed: 'badge-blue',
  partially_fulfilled: 'badge-amber',
  fulfilled: 'badge-green',
  cancelled: 'badge-red',
  voided: 'badge-red',
}

const CHANNEL_COLORS = {
  wholesale: 'badge-blue',
  ecommerce: 'badge-green',
  sample: 'badge-amber',
  marketing: 'badge-gray',
}

const EMPTY_FORM = {
  customer_id: '',
  channel: 'wholesale',
  order_date: new Date().toISOString().split('T')[0],
  payment_terms_days: 30,
  notes: '',
  lines: [{ product_id: '', quantity_ordered: 1, unit_price: 0 }]
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchOrders()
    fetchCustomers()
    fetchProducts()
  }, [statusFilter, channelFilter])

  async function fetchOrders() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.append('status', statusFilter)
    if (channelFilter) params.append('channel', channelFilter)
    const res = await fetch(`/api/orders?${params}`)
    const data = await res.json()
    setOrders(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchCustomers() {
    const res = await fetch('/api/customers?status=active')
    const data = await res.json()
    setCustomers(Array.isArray(data) ? data : [])
  }

  async function fetchProducts() {
    const res = await fetch('/api/products?status=active')
    const data = await res.json()
    setProducts(Array.isArray(data) ? data : [])
  }

  function addLine() {
    setForm({ ...form, lines: [...form.lines, { product_id: '', quantity_ordered: 1, unit_price: 0 }] })
  }

  function removeLine(i) {
    setForm({ ...form, lines: form.lines.filter((_, idx) => idx !== i) })
  }

  function updateLine(i, field, value) {
    const lines = [...form.lines]
    lines[i] = { ...lines[i], [field]: value }
    // Auto-rempli le prix depuis le produit si dispo
    if (field === 'product_id') {
      const product = products.find(p => p.id === value)
      if (product?.unit_cost_avg) lines[i].unit_price = Number(product.unit_cost_avg)
    }
    setForm({ ...form, lines })
  }

  const orderTotal = form.lines.reduce((s, l) => s + (l.quantity_ordered * l.unit_price), 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setShowForm(false)
    setForm(EMPTY_FORM)
    fetchOrders()
    setSaving(false)
  }

  async function updateStatus(id, status) {
    await fetch('/api/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    })
    fetchOrders()
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p className="page-sub">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setShowForm(true); setError(null) }}>
            + New Order
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="filter-bar">
        <select className="chip" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="partially_fulfilled">Partial</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="chip" value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
          <option value="">All channels</option>
          <option value="wholesale">Wholesale</option>
          <option value="ecommerce">E-commerce</option>
          <option value="sample">Sample</option>
          <option value="marketing">Marketing</option>
        </select>
      </div>

      {/* Formulaire nouvelle commande */}
      {showForm && (
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <div className="card-header"><h3>New Order</h3></div>
          <div className="card-body">
            {error && (
              <div style={{ background: '#fee', color: '#c00', padding: '0.5rem 0.75rem', borderRadius: 6, marginBottom: '1rem', fontSize: 13 }}>
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit}>
              <div className="grid-2" style={{ marginBottom: '1rem' }}>
                <div>
                  <label>Customer *</label>
                  <select value={form.customer_id} onChange={e => setForm({...form, customer_id: e.target.value})} required>
                    <option value="">Select a customer...</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Channel *</label>
                  <select value={form.channel} onChange={e => setForm({...form, channel: e.target.value})}>
                    <option value="wholesale">Wholesale</option>
                    <option value="sample">Sample</option>
                    <option value="marketing">Marketing</option>
                  </select>
                </div>
                <div>
                  <label>Order Date *</label>
                  <input type="date" value={form.order_date} onChange={e => setForm({...form, order_date: e.target.value})} required />
                </div>
                <div>
                  <label>Payment Terms (days)</label>
                  <input type="number" value={form.payment_terms_days} onChange={e => setForm({...form, payment_terms_days: parseInt(e.target.value)})} />
                </div>
              </div>

              {/* Lignes de commande */}
              <div style={{ marginBottom: '0.75rem', fontWeight: 600, fontSize: 13 }}>Order Lines</div>
              <table style={{ marginBottom: '0.75rem' }}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Unit Price</th>
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
                          required
                          style={{ minWidth: 180 }}
                        >
                          <option value="">Select product...</option>
                          {products.map(p => (
                            <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          value={line.quantity_ordered}
                          onChange={e => updateLine(i, 'quantity_ordered', parseInt(e.target.value))}
                          style={{ width: 70 }}
                          required
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unit_price}
                          onChange={e => updateLine(i, 'unit_price', parseFloat(e.target.value))}
                          style={{ width: 90 }}
                          required
                        />
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        ${(line.quantity_ordered * line.unit_price).toFixed(2)}
                      </td>
                      <td>
                        {form.lines.length > 1 && (
                          <button type="button" onClick={() => removeLine(i)} style={{ background: 'none', border: 'none', color: '#c00', cursor: 'pointer', fontSize: 16 }}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <button type="button" className="btn-outline" onClick={addLine}>+ Add Line</button>
                <strong style={{ fontSize: 15 }}>Total: ${orderTotal.toFixed(2)}</strong>
              </div>

              <div>
                <label>Notes</label>
                <input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Optional" />
              </div>

              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Create Order'}</button>
                <button type="button" className="btn-outline" onClick={() => { setShowForm(false); setError(null) }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Channel</th>
              <th>Date</th>
              <th>Lines</th>
              <th>Total</th>
              <th>Invoice</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>Loading...</td></tr>
            ) : orders.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>No orders yet.</td></tr>
            ) : orders.map(o => (
              <tr key={o.id}>
                <td><strong>{o.order_number}</strong></td>
                <td>{o.customer?.name || '—'}</td>
                <td><span className={`badge ${CHANNEL_COLORS[o.channel] || 'badge-gray'}`}>{o.channel}</span></td>
                <td>{o.order_date}</td>
                <td>{o.lines?.length || 0}</td>
                <td>${Number(o.total_amount).toFixed(2)}</td>
                <td>
                  {o.invoice
                    ? <span className={`badge ${o.invoice.status === 'paid' ? 'badge-green' : 'badge-amber'}`}>
                        {o.invoice.invoice_number}
                      </span>
                    : <span style={{ color: 'var(--text-2)', fontSize: 12 }}>—</span>
                  }
                </td>
                <td><span className={`badge ${STATUS_COLORS[o.status] || 'badge-gray'}`}>{o.status}</span></td>
                <td>
                  {o.status === 'draft' && (
                    <button
                      className="btn-primary"
                      style={{ padding: '0.2rem 0.6rem', fontSize: 12 }}
                      onClick={() => updateStatus(o.id, 'confirmed')}
                    >
                      Confirm
                    </button>
                  )}
                  {o.status === 'confirmed' && (
                    <button
                      className="btn-outline"
                      style={{ padding: '0.2rem 0.6rem', fontSize: 12 }}
                      onClick={() => updateStatus(o.id, 'fulfilled')}
                    >
                      Fulfill
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Layout>
  )
}
