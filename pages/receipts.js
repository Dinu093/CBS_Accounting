import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FormField, ModalInput, ModalSelect, ModalError, ModalActions, BtnPrimary, BtnSecondary } from '../components/FormField'

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const EMPTY_FORM = {
  supplier_id: '', warehouse_id: '', received_date: new Date().toISOString().split('T')[0],
  reference_number: '', notes: '',
}

export default function Receipts() {
  const [receipts, setReceipts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [lines, setLines] = useState([{ product_id: '', quantity: 1, unit_cost: '', freight_cost: 0, customs_cost: 0 }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    fetchReceipts()
    fetch('/api/suppliers').then(r => r.json()).then(d => setSuppliers(Array.isArray(d) ? d : []))
    fetch('/api/warehouses').then(r => r.json()).then(d => setWarehouses(Array.isArray(d) ? d : []))
    fetch('/api/products').then(r => r.json()).then(d => setProducts(Array.isArray(d) ? d : []))
  }, [])

  async function fetchReceipts() {
    setLoading(true)
    const res = await fetch('/api/receipts')
    const data = await res.json()
    setReceipts(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  function updateLine(idx, field, value) {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l
      if (field === 'product_id') {
        const p = products.find(p => p.id === value)
        return { ...l, product_id: value, unit_cost: p?.unit_cost_avg || '' }
      }
      return { ...l, [field]: value }
    }))
  }

  const totalValue = lines.reduce((s, l) => {
    const unit = parseFloat(l.unit_cost) || 0
    const qty = parseInt(l.quantity) || 0
    const freight = parseFloat(l.freight_cost) || 0
    const customs = parseFloat(l.customs_cost) || 0
    return s + (unit + freight + customs) * qty
  }, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const validLines = lines.filter(l => l.product_id && l.quantity && l.unit_cost)
    if (!validLines.length) { setError('At least one complete line required'); setSaving(false); return }
    const res = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, lines: validLines.map(l => ({ ...l, quantity: parseInt(l.quantity), unit_cost: parseFloat(l.unit_cost), freight_cost: parseFloat(l.freight_cost) || 0, customs_cost: parseFloat(l.customs_cost) || 0 })) })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setOpen(false)
    setForm(EMPTY_FORM)
    setLines([{ product_id: '', quantity: 1, unit_cost: '', freight_cost: 0, customs_cost: 0 }])
    fetchReceipts()
    setSaving(false)
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Stock Receipts</h1>
          <p className="page-sub">{receipts.length} receipt{receipts.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setOpen(true); setError(null) }}>
            + New Receipt
          </button>
        </div>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Receipt #</th>
              <th>Date</th>
              <th>Supplier</th>
              <th>Warehouse</th>
              <th>Reference</th>
              <th style={{ textAlign: 'right' }}>Lines</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>Loading...</td></tr>
            ) : receipts.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>No receipts yet.</td></tr>
            ) : receipts.map(r => (
              <tr key={r.id}>
                <td><strong style={{ fontSize: 13 }}>{r.receipt_number}</strong></td>
                <td style={{ fontSize: 13 }}>{r.received_date}</td>
                <td style={{ fontSize: 13 }}>{r.supplier?.name || '—'}</td>
                <td style={{ fontSize: 13 }}>{r.warehouse?.name || '—'}</td>
                <td style={{ fontSize: 13, color: 'var(--text-3)' }}>{r.reference_number || '—'}</td>
                <td style={{ textAlign: 'right', fontSize: 13 }}>{r.lines?.length || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New Stock Receipt" subtitle="Record incoming inventory" width={700}>
        <form onSubmit={handleSubmit}>
          <ModalError message={error} />

          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Receipt Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Supplier">
              <ModalSelect value={form.supplier_id} onChange={e => f('supplier_id', e.target.value)}>
                <option value="">Select supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </ModalSelect>
            </FormField>
            <FormField label="Warehouse" required>
              <ModalSelect value={form.warehouse_id} onChange={e => f('warehouse_id', e.target.value)} required>
                <option value="">Select warehouse...</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
              </ModalSelect>
            </FormField>
            <FormField label="Received Date" required>
              <ModalInput type="date" value={form.received_date} onChange={e => f('received_date', e.target.value)} required />
            </FormField>
            <FormField label="Reference / PO Number">
              <ModalInput value={form.reference_number} onChange={e => f('reference_number', e.target.value)} placeholder="PO-2024-001" />
            </FormField>
            <div style={{ gridColumn: '1 / -1' }}>
              <FormField label="Notes">
                <ModalInput value={form.notes} onChange={e => f('notes', e.target.value)} />
              </FormField>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Products</div>
            <button type="button" onClick={() => setLines(p => [...p, { product_id: '', quantity: 1, unit_cost: '', freight_cost: 0, customs_cost: 0 }])}
              style={{ fontSize: 12, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', color: 'var(--text-2)' }}>
              + Add line
            </button>
          </div>

          {lines.map((line, idx) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 70px 90px 90px 90px 32px', gap: 6, marginBottom: 6, alignItems: 'end' }}>
              <FormField label={idx === 0 ? 'Product' : ''}>
                <ModalSelect value={line.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)} required>
                  <option value="">Select...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                </ModalSelect>
              </FormField>
              <FormField label={idx === 0 ? 'Qty' : ''}>
                <ModalInput type="number" min="1" value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} required />
              </FormField>
              <FormField label={idx === 0 ? 'Unit Cost ($)' : ''}>
                <ModalInput type="number" step="0.01" value={line.unit_cost} onChange={e => updateLine(idx, 'unit_cost', e.target.value)} placeholder="0.00" required />
              </FormField>
              <FormField label={idx === 0 ? 'Freight ($)' : ''}>
                <ModalInput type="number" step="0.01" value={line.freight_cost} onChange={e => updateLine(idx, 'freight_cost', e.target.value)} placeholder="0.00" />
              </FormField>
              <FormField label={idx === 0 ? 'Customs ($)' : ''}>
                <ModalInput type="number" step="0.01" value={line.customs_cost} onChange={e => updateLine(idx, 'customs_cost', e.target.value)} placeholder="0.00" />
              </FormField>
              <div style={{ paddingBottom: 2 }}>
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines(p => p.filter((_, i) => i !== idx))}
                    style={{ width: 32, height: 38, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, cursor: 'pointer', color: 'var(--red)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                )}
              </div>
            </div>
          ))}

          {totalValue > 0 && (
            <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 15, color: 'var(--green)', marginTop: 8, marginBottom: 4 }}>
              Total landed cost: {fmt(totalValue)}
            </div>
          )}

          <div style={{ background: 'var(--bg)', borderRadius: 10, padding: '0.75rem 1rem', fontSize: 12, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.6 }}>
            Stock levels will be updated automatically. WACOG (weighted average cost) will be recalculated for each product.
          </div>

          <ModalActions>
            <BtnSecondary onClick={() => setOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Receipt'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  )
}
