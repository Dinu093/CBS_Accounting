import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FormField, ModalInput, ModalSelect, ModalError, ModalActions, BtnPrimary, BtnSecondary } from '../components/FormField'

const STATUS_COLORS = {
  draft: 'badge-gray', sent: 'badge-blue',
  partially_paid: 'badge-amber', paid: 'badge-green', void: 'badge-red',
}

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const EMPTY_FORM = {
  customer_id: '', issue_date: new Date().toISOString().split('T')[0],
  due_date: '', channel: 'wholesale', notes: '',
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([])
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')

  // Create invoice modal
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [lines, setLines] = useState([{ description: '', quantity: 1, unit_price: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Payment modal
  const [payOpen, setPayOpen] = useState(false)
  const [payInvoice, setPayInvoice] = useState(null)
  const [payAmount, setPayAmount] = useState('')
  const [paySaving, setPaySaving] = useState(false)

  useEffect(() => { fetchInvoices(); fetchCustomers() }, [statusFilter])

  async function fetchInvoices() {
    setLoading(true)
    const params = new URLSearchParams()
    if (statusFilter) params.append('status', statusFilter)
    const res = await fetch(`/api/invoices?${params}`)
    const data = await res.json()
    setInvoices(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  async function fetchCustomers() {
    const res = await fetch('/api/customers')
    const data = await res.json()
    setCustomers(Array.isArray(data) ? data : [])
  }

  function updateLine(idx, field, value) {
    setLines(prev => prev.map((l, i) => i !== idx ? l : { ...l, [field]: value }))
  }

  const lineTotal = lines.reduce((s, l) => s + (parseFloat(l.unit_price) || 0) * (parseInt(l.quantity) || 0), 0)

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true); setError(null)
    const validLines = lines.filter(l => l.description && l.unit_price)
    if (!validLines.length) { setError('At least one line required'); setSaving(false); return }
    if (!form.customer_id || !form.issue_date) { setError('Customer and issue date required'); setSaving(false); return }

    const computedLines = validLines.map(l => ({
      ...l, quantity: parseInt(l.quantity) || 1, unit_price: parseFloat(l.unit_price), line_total: (parseInt(l.quantity) || 1) * parseFloat(l.unit_price),
    }))
    const subtotal = computedLines.reduce((s, l) => s + l.line_total, 0)

    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: form.customer_id,
        issue_date: form.issue_date,
        due_date: form.due_date || null,
        channel: form.channel,
        notes: form.notes,
        subtotal,
        total_due: subtotal,
        lines: computedLines,
        manual: true,
      })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setCreateOpen(false)
    setForm(EMPTY_FORM)
    setLines([{ description: '', quantity: 1, unit_price: '' }])
    fetchInvoices(); setSaving(false)
  }

  async function markSent(id) {
    await fetch('/api/invoices', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'sent' }) })
    fetchInvoices()
  }

  async function handlePay(e) {
    e.preventDefault()
    setPaySaving(true)
    await fetch('/api/invoices', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: payInvoice.id, payment_amount: parseFloat(payAmount) }) })
    setPayOpen(false); setPayInvoice(null); setPayAmount(''); setPaySaving(false); fetchInvoices()
  }

  const filtered = invoices.filter(inv =>
    !search ||
    inv.invoice_number?.toLowerCase().includes(search.toLowerCase()) ||
    inv.customer?.name?.toLowerCase().includes(search.toLowerCase())
  )

  const totalOutstanding = filtered
    .filter(i => ['sent', 'partially_paid'].includes(i.status))
    .reduce((s, i) => s + (Number(i.total_due) - Number(i.amount_paid)), 0)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Invoices</h1>
          <p className="page-sub">
            {filtered.length} invoice{filtered.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
            Outstanding: <strong style={{ color: totalOutstanding > 0 ? 'var(--red)' : 'inherit' }}>{fmt(totalOutstanding)}</strong>
          </p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setCreateOpen(true); setError(null); setForm(EMPTY_FORM); setLines([{ description: '', quantity: 1, unit_price: '' }]) }}>
            + New Invoice
          </button>
        </div>
      </div>

      <div className="filter-bar">
        <input className="search-input" placeholder="Search invoice # or customer..." value={search} onChange={e => setSearch(e.target.value)} />
        <select className="chip" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="sent">Sent</option>
          <option value="partially_paid">Partially paid</option>
          <option value="paid">Paid</option>
          <option value="void">Void</option>
        </select>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Invoice #</th><th>Customer</th><th>Issue Date</th><th>Due Date</th>
              <th style={{ textAlign: 'right' }}>Amount</th><th style={{ textAlign: 'right' }}>Paid</th>
              <th style={{ textAlign: 'right' }}>Balance</th><th>Status</th><th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>No invoices yet.</td></tr>
            ) : filtered.map(inv => {
              const balance = Number(inv.total_due) - Number(inv.amount_paid)
              return (
                <tr key={inv.id}>
                  <td><strong style={{ fontSize: 13 }}>{inv.invoice_number}</strong></td>
                  <td style={{ fontSize: 13 }}>{inv.customer?.name || '—'}</td>
                  <td style={{ fontSize: 13 }}>{inv.issue_date}</td>
                  <td style={{ fontSize: 13, color: inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== 'paid' ? 'var(--red)' : 'var(--text-3)' }}>{inv.due_date || '—'}</td>
                  <td style={{ textAlign: 'right', fontSize: 13 }}>{fmt(inv.total_due)}</td>
                  <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--green)' }}>{fmt(inv.amount_paid)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 13, color: balance > 0 ? 'var(--red)' : 'var(--green)' }}>{fmt(balance)}</td>
                  <td><span className={`badge ${STATUS_COLORS[inv.status] || 'badge-gray'}`} style={{ fontSize: 11 }}>{inv.status}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 4 }}>
                      {inv.status === 'draft' && (
                        <button onClick={() => markSent(inv.id)} style={{ fontSize: 11, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.2rem 0.55rem', cursor: 'pointer', color: 'var(--blue)' }}>Mark Sent</button>
                      )}
                      {['sent', 'partially_paid'].includes(inv.status) && (
                        <button onClick={() => { setPayInvoice(inv); setPayAmount(String(balance.toFixed(2))); setPayOpen(true) }}
                          style={{ fontSize: 11, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.2rem 0.55rem', cursor: 'pointer', color: 'var(--green)' }}>
                          Apply Payment
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Modal Create Invoice ──────────────────────────────────────────────── */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Invoice" subtitle="Create a standalone invoice" width={660}>
        <form onSubmit={handleCreate}>
          <ModalError message={error} />
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Customer" required>
              <ModalSelect value={form.customer_id} onChange={e => f('customer_id', e.target.value)} required>
                <option value="">Select customer...</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </ModalSelect>
            </FormField>
            <FormField label="Channel">
              <ModalSelect value={form.channel} onChange={e => f('channel', e.target.value)}>
                <option value="wholesale">Wholesale</option>
                <option value="ecommerce">E-commerce</option>
              </ModalSelect>
            </FormField>
            <FormField label="Issue Date" required>
              <ModalInput type="date" value={form.issue_date} onChange={e => f('issue_date', e.target.value)} required />
            </FormField>
            <FormField label="Due Date">
              <ModalInput type="date" value={form.due_date} onChange={e => f('due_date', e.target.value)} />
            </FormField>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Notes"><ModalInput value={form.notes} onChange={e => f('notes', e.target.value)} /></FormField>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Lines</div>
            <button type="button" onClick={() => setLines(p => [...p, { description: '', quantity: 1, unit_price: '' }])}
              style={{ fontSize: 12, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', color: 'var(--text-2)' }}>+ Add line</button>
          </div>

          {lines.map((line, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '3fr 70px 100px 32px', gap: 6, marginBottom: 6, alignItems: 'end' }}>
              <FormField label={idx === 0 ? 'Description' : ''}>
                <ModalInput value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} placeholder="Product or service description" required />
              </FormField>
              <FormField label={idx === 0 ? 'Qty' : ''}>
                <ModalInput type="number" min="1" value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} />
              </FormField>
              <FormField label={idx === 0 ? 'Unit Price ($)' : ''}>
                <ModalInput type="number" step="0.01" value={line.unit_price} onChange={e => updateLine(idx, 'unit_price', e.target.value)} placeholder="0.00" required />
              </FormField>
              <div style={{ paddingBottom: 2 }}>
                {lines.length > 1 && <button type="button" onClick={() => setLines(p => p.filter((_, i) => i !== idx))} style={{ width: 32, height: 38, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, cursor: 'pointer', color: 'var(--red)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>}
              </div>
            </div>
          ))}
          {lineTotal > 0 && <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: 'var(--green)', marginTop: 8, marginBottom: 4 }}>Total: {fmt(lineTotal)}</div>}

          <ModalActions>
            <BtnSecondary onClick={() => setCreateOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Invoice'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>

      {/* ─── Modal Apply Payment ──────────────────────────────────────────────── */}
      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Apply Payment" subtitle={payInvoice?.invoice_number} width={420}>
        <form onSubmit={handlePay}>
          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: 13 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-3)' }}>Total due</span>
              <strong>{fmt(payInvoice?.total_due)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              <span style={{ color: 'var(--text-3)' }}>Already paid</span>
              <strong style={{ color: 'var(--green)' }}>{fmt(payInvoice?.amount_paid)}</strong>
            </div>
          </div>
          <FormField label="Payment Amount ($)" required>
            <ModalInput type="number" step="0.01" min="0" value={payAmount} onChange={e => setPayAmount(e.target.value)} required />
          </FormField>
          <ModalActions>
            <BtnSecondary onClick={() => setPayOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={paySaving}>{paySaving ? 'Saving…' : 'Apply Payment'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  )
}
