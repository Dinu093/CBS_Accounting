import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FormField, ModalInput, ModalSelect, ModalError, ModalActions, BtnPrimary, BtnSecondary } from '../components/FormField'

const STATUS_COLORS = {
  draft: 'badge-gray', confirmed: 'badge-blue',
  partially_fulfilled: 'badge-amber', fulfilled: 'badge-green',
  cancelled: 'badge-red',
}
const CHANNEL_COLORS = { wholesale: 'badge-blue', ecommerce: 'badge-green' }

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function Orders() {
  const [orders, setOrders] = useState([])
  const [customers, setCustomers] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [channelFilter, setChannelFilter] = useState('')
  const [search, setSearch] = useState('')

  // New order modal
  const [newOpen, setNewOpen] = useState(false)
  const [newForm, setNewForm] = useState({ customer_id: '', order_date: new Date().toISOString().split('T')[0], payment_terms_days: 30, notes: '' })
  const [newLines, setNewLines] = useState([{ product_id: '', sku: '', product_name: '', quantity_ordered: 1, unit_price: '' }])
  const [newSaving, setNewSaving] = useState(false)
  const [newError, setNewError] = useState(null)

  // Import past order modal (manual)
  const [importOpen, setImportOpen] = useState(false)
  const [importForm, setImportForm] = useState({ customer_id: '', channel: 'wholesale', order_date: '', order_number_override: '', payment_status: 'paid', notes: '' })
  const [importLines, setImportLines] = useState([{ product_id: '', sku: '', product_name: '', quantity_ordered: 1, unit_price: '' }])
  const [importSaving, setImportSaving] = useState(false)
  const [importError, setImportError] = useState(null)

  // AI file upload
  const [aiOpen, setAiOpen] = useState(false)
  const [aiParsing, setAiParsing] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [aiResult, setAiResult] = useState(null) // parsed invoice data
  const [aiConfirmOpen, setAiConfirmOpen] = useState(false)
  const [aiForm, setAiForm] = useState({ customer_id: '', channel: 'wholesale', order_date: '', order_number_override: '', payment_status: 'paid', notes: '' })
  const [aiLines, setAiLines] = useState([])
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSaveError, setAiSaveError] = useState(null)
  const fileRef = useRef(null)

  // Status actions
  const [actioning, setActioning] = useState(null)

  useEffect(() => { fetchOrders(); fetchCustomers(); fetchProducts() }, [statusFilter, channelFilter])

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
    const res = await fetch('/api/customers')
    const data = await res.json()
    setCustomers(Array.isArray(data) ? data : [])
  }

  async function fetchProducts() {
    const res = await fetch('/api/products')
    const data = await res.json()
    setProducts(Array.isArray(data) ? data : [])
  }

  // ─── New order ──────────────────────────────────────────────────────────────
  function updateNewLine(idx, field, value) {
    setNewLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (field === 'product_id') {
        const p = products.find(p => p.id === value)
        return { ...l, product_id: value, sku: p?.sku || '', product_name: p?.name || '', unit_price: p?.retail_price || '' }
      }
      return { ...l, [field]: value }
    }))
  }

  async function handleNew(e) {
    e.preventDefault()
    setNewSaving(true); setNewError(null)
    const validLines = newLines.filter(l => l.product_id && l.quantity_ordered && l.unit_price)
    if (!validLines.length) { setNewError('Add at least one complete line'); setNewSaving(false); return }
    const res = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newForm, lines: validLines }) })
    const data = await res.json()
    if (!res.ok) { setNewError(data.error); setNewSaving(false); return }
    setNewOpen(false)
    setNewForm({ customer_id: '', order_date: new Date().toISOString().split('T')[0], payment_terms_days: 30, notes: '' })
    setNewLines([{ product_id: '', sku: '', product_name: '', quantity_ordered: 1, unit_price: '' }])
    fetchOrders(); setNewSaving(false)
  }

  const newTotal = newLines.reduce((s, l) => s + (parseFloat(l.unit_price) || 0) * (parseInt(l.quantity_ordered) || 0), 0)

  // ─── Import past order (manual) ─────────────────────────────────────────────
  function updateImportLine(idx, field, value) {
    setImportLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (field === 'product_id') {
        const p = products.find(p => p.id === value)
        return { ...l, product_id: value, sku: p?.sku || '', product_name: p?.name || '', unit_price: p?.retail_price || '' }
      }
      return { ...l, [field]: value }
    }))
  }

  async function handleImport(e) {
    e.preventDefault()
    setImportSaving(true); setImportError(null)
    const validLines = importLines.filter(l => l.product_id && l.quantity_ordered && l.unit_price)
    if (!validLines.length) { setImportError('Add at least one complete line'); setImportSaving(false); return }
    const res = await fetch('/api/import-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...importForm, lines: validLines }) })
    const data = await res.json()
    if (!res.ok) { setImportError(data.error); setImportSaving(false); return }
    setImportOpen(false)
    setImportForm({ customer_id: '', channel: 'wholesale', order_date: '', order_number_override: '', payment_status: 'paid', notes: '' })
    setImportLines([{ product_id: '', sku: '', product_name: '', quantity_ordered: 1, unit_price: '' }])
    fetchOrders(); setImportSaving(false)
  }

  const importTotal = importLines.reduce((s, l) => s + (parseFloat(l.unit_price) || 0) * (parseInt(l.quantity_ordered) || 0), 0)

  // ─── AI Invoice Upload ───────────────────────────────────────────────────────
  async function handleFileUpload(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setAiParsing(true); setAiError(null); setAiResult(null)

    // Convert to base64
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result.split(',')[1])
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

    const res = await fetch('/api/parse-invoice', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_base64: base64, file_type: file.type, customers })
    })

    const data = await res.json()
    setAiParsing(false)

    if (!res.ok) { setAiError(data.error); return }

    // Match customer
    const matchedCustomer = customers.find(c =>
      c.name.toLowerCase() === data.customer_name?.toLowerCase() ||
      c.name.toLowerCase().includes(data.customer_name?.toLowerCase() || '') ||
      data.customer_name?.toLowerCase().includes(c.name.toLowerCase())
    )

    // Match products
    const matchedLines = (data.lines || []).map(l => {
      const match = products.find(p =>
        p.sku?.toLowerCase() === l.sku?.toLowerCase() ||
        p.name?.toLowerCase().includes(l.product_name?.toLowerCase() || '') ||
        l.product_name?.toLowerCase().includes(p.name?.toLowerCase() || '')
      )
      return { ...l, product_id: match?.id || '', matched_product: match }
    })

    setAiResult(data)
    setAiForm({
      customer_id: matchedCustomer?.id || '',
      channel: data.channel || 'wholesale',
      order_date: data.order_date || '',
      order_number_override: data.order_number || '',
      payment_status: data.payment_status || 'paid',
      notes: data.notes || '',
    })
    setAiLines(matchedLines.map(l => ({
      product_id: l.product_id,
      sku: l.sku || l.matched_product?.sku || '',
      product_name: l.product_name,
      quantity_ordered: l.quantity_ordered,
      unit_price: l.unit_price,
    })))
    setAiOpen(false)
    setAiConfirmOpen(true)
    if (fileRef.current) fileRef.current.value = ''
  }

  function updateAiLine(idx, field, value) {
    setAiLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (field === 'product_id') {
        const p = products.find(p => p.id === value)
        return { ...l, product_id: value, sku: p?.sku || l.sku, product_name: p?.name || l.product_name }
      }
      return { ...l, [field]: value }
    }))
  }

  async function handleAiConfirm(e) {
    e.preventDefault()
    setAiSaving(true); setAiSaveError(null)
    const validLines = aiLines.filter(l => l.quantity_ordered && l.unit_price)
    if (!validLines.length) { setAiSaveError('At least one line required'); setAiSaving(false); return }

    // Lines without product_id use product_name directly
    const linesWithNames = validLines.map(l => ({
      ...l,
      product_id: l.product_id || null,
      product_name: l.product_name,
      sku: l.sku || '',
    }))

    const res = await fetch('/api/import-order', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...aiForm, lines: linesWithNames }) })
    const data = await res.json()
    if (!res.ok) { setAiSaveError(data.error); setAiSaving(false); return }
    setAiConfirmOpen(false); setAiResult(null); fetchOrders(); setAiSaving(false)
  }

  const aiTotal = aiLines.reduce((s, l) => s + (parseFloat(l.unit_price) || 0) * (parseInt(l.quantity_ordered) || 0), 0)

  // ─── Status update ───────────────────────────────────────────────────────────
  async function updateStatus(orderId, status) {
    setActioning(orderId)
    await fetch('/api/orders', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: orderId, status }) })
    setActioning(null); fetchOrders()
  }

  const filtered = orders.filter(o =>
    !search || o.order_number?.toLowerCase().includes(search.toLowerCase()) || o.customer?.name?.toLowerCase().includes(search.toLowerCase())
  )
  const totalValue = filtered.reduce((s, o) => s + Number(o.total_amount || 0), 0)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p className="page-sub">{filtered.length} order{filtered.length !== 1 ? 's' : ''} · <strong>{fmt(totalValue)}</strong></p>
        </div>
        <div className="page-actions">
          <button className="btn-outline" onClick={() => { setAiOpen(true); setAiError(null) }}>
            AI Import
          </button>
          <button className="btn-outline" onClick={() => { setImportOpen(true); setImportError(null) }}>
            Manual Import
          </button>
          <button className="btn-primary" onClick={() => { setNewOpen(true); setNewError(null) }}>
            + New Order
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder="Search order # or customer..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="chip" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="confirmed">Confirmed</option>
          <option value="partially_fulfilled">Partially fulfilled</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="chip" value={channelFilter} onChange={e => setChannelFilter(e.target.value)}>
          <option value="">All channels</option>
          <option value="wholesale">Wholesale</option>
          <option value="ecommerce">E-commerce</option>
        </select>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Order #</th><th>Date</th><th>Customer</th><th>Channel</th>
              <th style={{ textAlign: 'right' }}>Total</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>No orders yet.</td></tr>
            ) : filtered.map(o => (
              <tr key={o.id}>
                <td><strong style={{ fontSize: 13 }}>{o.order_number}</strong></td>
                <td style={{ fontSize: 13 }}>{o.order_date}</td>
                <td style={{ fontSize: 13 }}>{o.customer?.name || '—'}</td>
                <td><span className={`badge ${CHANNEL_COLORS[o.channel] || 'badge-gray'}`} style={{ fontSize: 11 }}>{o.channel}</span></td>
                <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 13 }}>{fmt(o.total_amount)}</td>
                <td><span className={`badge ${STATUS_COLORS[o.status] || 'badge-gray'}`} style={{ fontSize: 11 }}>{o.status}</span></td>
                <td>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {o.status === 'draft' && <button onClick={() => updateStatus(o.id, 'confirmed')} disabled={actioning === o.id} style={{ fontSize: 11, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.2rem 0.55rem', cursor: 'pointer', color: 'var(--blue)' }}>Confirm</button>}
                    {(o.status === 'confirmed' || o.status === 'partially_fulfilled') && <button onClick={() => updateStatus(o.id, 'fulfilled')} disabled={actioning === o.id} style={{ fontSize: 11, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.2rem 0.55rem', cursor: 'pointer', color: 'var(--green)' }}>Fulfill</button>}
                    {(o.status === 'draft' || o.status === 'confirmed') && <button onClick={() => updateStatus(o.id, 'cancelled')} disabled={actioning === o.id} style={{ fontSize: 11, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.2rem 0.55rem', cursor: 'pointer', color: 'var(--red)' }}>Cancel</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── Modal AI Import ──────────────────────────────────────────────────── */}
      <Modal open={aiOpen} onClose={() => setAiOpen(false)} title="AI Invoice Import" subtitle="Upload a PDF or image — Claude will read it automatically" width={500}>
        <input ref={fileRef} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: 'none' }} onChange={handleFileUpload} />

        {aiParsing ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Reading your invoice...</div>
            <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Claude is extracting all data automatically</div>
          </div>
        ) : (
          <>
            {aiError && <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', color: '#c53030', borderRadius: 8, padding: '0.75rem', fontSize: 13, marginBottom: '1rem' }}>{aiError}</div>}

            <div
              onClick={() => fileRef.current?.click()}
              style={{ border: '2px dashed var(--border-2)', borderRadius: 12, padding: '2.5rem', textAlign: 'center', cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-2)'; e.currentTarget.style.background = 'var(--bg)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>📄</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Drop your invoice here</div>
              <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>PDF, PNG, JPG, WEBP supported</div>
              <div style={{ display: 'inline-block', padding: '0.5rem 1.25rem', background: 'var(--text-1)', color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
                Browse files
              </div>
            </div>

            <div style={{ marginTop: '1rem', background: 'var(--bg)', borderRadius: 10, padding: '0.75rem 1rem', fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6 }}>
              Claude will automatically identify the customer, date, products, quantities, prices and payment status. You will review everything before confirming.
            </div>
          </>
        )}
      </Modal>

      {/* ─── Modal AI Confirm ─────────────────────────────────────────────────── */}
      <Modal open={aiConfirmOpen} onClose={() => setAiConfirmOpen(false)} title="Review Extracted Data" subtitle="Verify and correct before importing" width={720}>
        <form onSubmit={handleAiConfirm}>
          {aiSaveError && <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', color: '#c53030', borderRadius: 8, padding: '0.75rem', fontSize: 13, marginBottom: '1rem' }}>{aiSaveError}</div>}

          {/* Confidence + warnings */}
          {aiResult && (
            <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
              <span className={`badge ${aiResult.confidence === 'high' ? 'badge-green' : aiResult.confidence === 'medium' ? 'badge-amber' : 'badge-red'}`}>
                {aiResult.confidence === 'high' ? '✓ High confidence' : aiResult.confidence === 'medium' ? '⚠ Medium confidence' : '⚠ Low confidence — please verify'}
              </span>
              {(aiResult.warnings || []).map((w, i) => (
                <span key={i} className="badge badge-amber" style={{ fontSize: 11 }}>{w}</span>
              ))}
            </div>
          )}

          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Order Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Customer" required>
              <ModalSelect value={aiForm.customer_id} onChange={e => setAiForm(p => ({ ...p, customer_id: e.target.value }))} required>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </ModalSelect>
            </FormField>
            <FormField label="Channel">
              <ModalSelect value={aiForm.channel} onChange={e => setAiForm(p => ({ ...p, channel: e.target.value }))}>
                <option value="wholesale">Wholesale</option>
                <option value="ecommerce">E-commerce</option>
              </ModalSelect>
            </FormField>
            <FormField label="Order Date" required>
              <ModalInput type="date" value={aiForm.order_date} onChange={e => setAiForm(p => ({ ...p, order_date: e.target.value }))} required />
            </FormField>
            <FormField label="Payment Status">
              <ModalSelect value={aiForm.payment_status} onChange={e => setAiForm(p => ({ ...p, payment_status: e.target.value }))}>
                <option value="paid">Already paid</option>
                <option value="unpaid">Not yet paid</option>
              </ModalSelect>
            </FormField>
            <FormField label="Order Number">
              <ModalInput value={aiForm.order_number_override} onChange={e => setAiForm(p => ({ ...p, order_number_override: e.target.value }))} />
            </FormField>
            <FormField label="Notes">
              <ModalInput value={aiForm.notes} onChange={e => setAiForm(p => ({ ...p, notes: e.target.value }))} />
            </FormField>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lines ({aiLines.length})</div>
            <button type="button" onClick={() => setAiLines(p => [...p, { product_id: '', sku: '', product_name: '', quantity_ordered: 1, unit_price: '' }])}
              style={{ fontSize: 12, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', color: 'var(--text-2)' }}>
              + Add line
            </button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            {aiLines.map((line, idx) => (
              <div key={idx} style={{ background: 'var(--bg)', borderRadius: 10, padding: '0.75rem', marginBottom: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8, marginBottom: 6 }}>
                  <FormField label="Product in catalog">
                    <ModalSelect value={line.product_id} onChange={e => updateAiLine(idx, 'product_id', e.target.value)}>
                      <option value="">— Not in catalog —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                    </ModalSelect>
                  </FormField>
                  <FormField label="Name on invoice">
                    <ModalInput value={line.product_name} onChange={e => updateAiLine(idx, 'product_name', e.target.value)} />
                  </FormField>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '80px 100px 32px', gap: 8 }}>
                  <FormField label="Qty">
                    <ModalInput type="number" min="1" value={line.quantity_ordered} onChange={e => updateAiLine(idx, 'quantity_ordered', e.target.value)} />
                  </FormField>
                  <FormField label="Unit Price ($)">
                    <ModalInput type="number" step="0.01" value={line.unit_price} onChange={e => updateAiLine(idx, 'unit_price', e.target.value)} />
                  </FormField>
                  <div style={{ paddingTop: 22 }}>
                    {aiLines.length > 1 && (
                      <button type="button" onClick={() => setAiLines(p => p.filter((_, i) => i !== idx))}
                        style={{ width: 32, height: 38, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, cursor: 'pointer', color: 'var(--red)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {aiTotal > 0 && (
              <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: 'var(--green)', marginTop: 8 }}>
                Total: {fmt(aiTotal)}
              </div>
            )}
          </div>

          <ModalActions>
            <BtnSecondary onClick={() => { setAiConfirmOpen(false); setAiOpen(true) }}>← Re-upload</BtnSecondary>
            <BtnPrimary type="submit" disabled={aiSaving}>{aiSaving ? 'Importing…' : 'Confirm & Import'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>

      {/* ─── Modal New Order ─────────────────────────────────────────────────── */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="New Wholesale Order" subtitle="Create a draft order" width={680}>
        <form onSubmit={handleNew}>
          <ModalError message={newError} />
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Order Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Customer" required>
              <ModalSelect value={newForm.customer_id} onChange={e => setNewForm(p => ({ ...p, customer_id: e.target.value }))} required>
                <option value="">Select customer...</option>
                {customers.filter(c => c.type !== 'ecommerce' && c.type !== 'retail').map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </ModalSelect>
            </FormField>
            <FormField label="Order Date" required>
              <ModalInput type="date" value={newForm.order_date} onChange={e => setNewForm(p => ({ ...p, order_date: e.target.value }))} required />
            </FormField>
            <FormField label="Payment Terms (days)">
              <ModalInput type="number" value={newForm.payment_terms_days} onChange={e => setNewForm(p => ({ ...p, payment_terms_days: parseInt(e.target.value) }))} />
            </FormField>
            <FormField label="Notes">
              <ModalInput value={newForm.notes} onChange={e => setNewForm(p => ({ ...p, notes: e.target.value }))} />
            </FormField>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lines</div>
            <button type="button" onClick={() => setNewLines(p => [...p, { product_id: '', sku: '', product_name: '', quantity_ordered: 1, unit_price: '' }])}
              style={{ fontSize: 12, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', color: 'var(--text-2)' }}>+ Add line</button>
          </div>
          {newLines.map((line, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 110px 32px', gap: 6, marginBottom: 6, alignItems: 'end' }}>
              <FormField label={idx === 0 ? 'Product' : ''}>
                <ModalSelect value={line.product_id} onChange={e => updateNewLine(idx, 'product_id', e.target.value)} required>
                  <option value="">Select product...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                </ModalSelect>
              </FormField>
              <FormField label={idx === 0 ? 'Qty' : ''}>
                <ModalInput type="number" min="1" value={line.quantity_ordered} onChange={e => updateNewLine(idx, 'quantity_ordered', e.target.value)} required />
              </FormField>
              <FormField label={idx === 0 ? 'Unit Price ($)' : ''}>
                <ModalInput type="number" step="0.01" value={line.unit_price} onChange={e => updateNewLine(idx, 'unit_price', e.target.value)} placeholder="0.00" required />
              </FormField>
              <div style={{ paddingBottom: 2 }}>
                {newLines.length > 1 && <button type="button" onClick={() => setNewLines(p => p.filter((_, i) => i !== idx))} style={{ width: 32, height: 38, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, cursor: 'pointer', color: 'var(--red)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>}
              </div>
            </div>
          ))}
          {newTotal > 0 && <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: 'var(--green)', marginTop: 8, marginBottom: 4 }}>Total: {fmt(newTotal)}</div>}
          <ModalActions>
            <BtnSecondary onClick={() => setNewOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={newSaving}>{newSaving ? 'Creating…' : 'Create Order'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>

      {/* ─── Modal Manual Import ─────────────────────────────────────────────── */}
      <Modal open={importOpen} onClose={() => setImportOpen(false)} title="Manual Import" subtitle="Record a past sale manually" width={680}>
        <form onSubmit={handleImport}>
          <ModalError message={importError} />
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Order Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Customer" required>
              <ModalSelect value={importForm.customer_id} onChange={e => setImportForm(p => ({ ...p, customer_id: e.target.value }))} required>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </ModalSelect>
            </FormField>
            <FormField label="Channel">
              <ModalSelect value={importForm.channel} onChange={e => setImportForm(p => ({ ...p, channel: e.target.value }))}>
                <option value="wholesale">Wholesale</option>
                <option value="ecommerce">E-commerce</option>
              </ModalSelect>
            </FormField>
            <FormField label="Order Date" required>
              <ModalInput type="date" value={importForm.order_date} onChange={e => setImportForm(p => ({ ...p, order_date: e.target.value }))} required />
            </FormField>
            <FormField label="Payment Status">
              <ModalSelect value={importForm.payment_status} onChange={e => setImportForm(p => ({ ...p, payment_status: e.target.value }))}>
                <option value="paid">Already paid</option>
                <option value="unpaid">Not yet paid</option>
              </ModalSelect>
            </FormField>
            <FormField label="Order Number" hint="Optional">
              <ModalInput value={importForm.order_number_override} onChange={e => setImportForm(p => ({ ...p, order_number_override: e.target.value }))} placeholder="CBS-WS-00001" />
            </FormField>
            <FormField label="Notes">
              <ModalInput value={importForm.notes} onChange={e => setImportForm(p => ({ ...p, notes: e.target.value }))} />
            </FormField>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lines</div>
            <button type="button" onClick={() => setImportLines(p => [...p, { product_id: '', sku: '', product_name: '', quantity_ordered: 1, unit_price: '' }])}
              style={{ fontSize: 12, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', color: 'var(--text-2)' }}>+ Add line</button>
          </div>
          {importLines.map((line, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 110px 32px', gap: 6, marginBottom: 6, alignItems: 'end' }}>
              <FormField label={idx === 0 ? 'Product' : ''}>
                <ModalSelect value={line.product_id} onChange={e => updateImportLine(idx, 'product_id', e.target.value)} required>
                  <option value="">Select product...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                </ModalSelect>
              </FormField>
              <FormField label={idx === 0 ? 'Qty' : ''}>
                <ModalInput type="number" min="1" value={line.quantity_ordered} onChange={e => updateImportLine(idx, 'quantity_ordered', e.target.value)} required />
              </FormField>
              <FormField label={idx === 0 ? 'Unit Price ($)' : ''}>
                <ModalInput type="number" step="0.01" value={line.unit_price} onChange={e => updateImportLine(idx, 'unit_price', e.target.value)} placeholder="0.00" required />
              </FormField>
              <div style={{ paddingBottom: 2 }}>
                {importLines.length > 1 && <button type="button" onClick={() => setImportLines(p => p.filter((_, i) => i !== idx))} style={{ width: 32, height: 38, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, cursor: 'pointer', color: 'var(--red)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>}
              </div>
            </div>
          ))}
          {importTotal > 0 && <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: 'var(--green)', marginTop: 8, marginBottom: 4 }}>Total: {fmt(importTotal)}</div>}
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '0.75rem 1rem', fontSize: 12, color: 'var(--text-3)', marginBottom: '0.5rem', lineHeight: 1.6 }}>
            Creates a fulfilled order, updates inventory, generates an invoice marked as <strong>{importForm.payment_status === 'paid' ? 'paid' : 'pending'}</strong>.
          </div>
          <ModalActions>
            <BtnSecondary onClick={() => setImportOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={importSaving}>{importSaving ? 'Importing…' : 'Import Order'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  )
}
