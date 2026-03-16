import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { FormField, ModalInput, ModalSelect, ModalError, ModalActions, BtnPrimary, BtnSecondary } from '../components/FormField'

function fmt(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseDec(val) {
  // Gère les formats FR (virgule) et EN (point)
  if (typeof val === 'number') return val
  return parseFloat(String(val).replace(',', '.')) || 0
}

const EMPTY_FORM = {
  supplier_id: '',
  warehouse_id: '',
  received_date: new Date().toISOString().split('T')[0],
  reference_number: '',
  payment_due_date: '',
  notes: '',
}

const EMPTY_LINE = { product_id: '', quantity: '', unit_cost: '' }

const PAYMENT_COLORS = { paid: 'badge-green', unpaid: 'badge-amber' }

export default function Receipts() {
  const [receipts, setReceipts] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [warehouses, setWarehouses] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [lines, setLines] = useState([{ ...EMPTY_LINE }])
  // Frais partagés pour tout le shipment — pas par unité
  const [totalFreight, setTotalFreight] = useState('')
  const [totalCustoms, setTotalCustoms] = useState('')
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

  // Calcul du coût de revient total
  // Freight et Customs sont des montants TOTAUX pour tout le shipment
  const totalQty = lines.reduce((s, l) => s + (parseInt(l.quantity) || 0), 0)
  const freight = parseDec(totalFreight)
  const customs = parseDec(totalCustoms)

  const lineDetails = lines.map(l => {
    const qty = parseInt(l.quantity) || 0
    const unitCost = parseDec(l.unit_cost)
    // Allocation proportionnelle au nombre d'unités
    const freightPerUnit = totalQty > 0 ? (freight * qty / totalQty) / Math.max(qty, 1) : 0
    const customsPerUnit = totalQty > 0 ? (customs * qty / totalQty) / Math.max(qty, 1) : 0
    const landedUnitCost = unitCost + freightPerUnit + customsPerUnit
    return { qty, unitCost, freightPerUnit, customsPerUnit, landedUnitCost, lineTotal: landedUnitCost * qty }
  })

  const grandTotal = lineDetails.reduce((s, l) => s + l.lineTotal, 0)

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    if (!form.warehouse_id) { setError('Please select a warehouse'); setSaving(false); return }
    const validLines = lines.filter(l => l.product_id && l.quantity && l.unit_cost)
    if (!validLines.length) { setError('At least one complete product line required'); setSaving(false); return }

    const res = await fetch('/api/receipts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        lines: validLines.map((l, idx) => ({
          product_id: l.product_id,
          quantity: parseInt(l.quantity),
          unit_cost: parseDec(l.unit_cost),
          // Allocation proportionnelle du freight et customs par ligne
          freight_cost: totalQty > 0 ? freight * (parseInt(l.quantity) || 0) / totalQty : 0,
          customs_cost: totalQty > 0 ? customs * (parseInt(l.quantity) || 0) / totalQty : 0,
        }))
      })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }
    setOpen(false)
    setForm(EMPTY_FORM)
    setLines([{ ...EMPTY_LINE }])
    setTotalFreight('')
    setTotalCustoms('')
    fetchReceipts()
    setSaving(false)
  }

  async function markPaid(id) {
    if (!confirm('Mark this receipt as paid to supplier?')) return
    await fetch('/api/receipts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, payment_status: 'paid' })
    })
    fetchReceipts()
  }

  const totalUnpaid = receipts
    .filter(r => r.payment_status === 'unpaid')
    .reduce((s, r) => s + (r.lines || []).reduce((ls, l) => ls + Number(l.total_landed_cost || 0), 0), 0)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Stock Receipts</h1>
          <p className="page-sub">
            {receipts.length} receipt{receipts.length !== 1 ? 's' : ''}
            {totalUnpaid > 0 && <span style={{ color: 'var(--amber)', marginLeft: 8 }}>· AP to pay: <strong>{fmt(totalUnpaid)}</strong></span>}
          </p>
        </div>
        <div className="page-actions">
          <button className="btn-primary" onClick={() => { setOpen(true); setError(null); setForm(EMPTY_FORM); setLines([{ ...EMPTY_LINE }]); setTotalFreight(''); setTotalCustoms('') }}>
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
              <th>Payment Due</th>
              <th>Supplier Payment</th>
              <th style={{ textAlign: 'right' }}>Lines</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>Loading...</td></tr>
            ) : receipts.length === 0 ? (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)', fontSize: 13 }}>No receipts yet.</td></tr>
            ) : receipts.map(r => {
              const isPastDue = r.payment_status === 'unpaid' && r.payment_due_date && new Date(r.payment_due_date) < new Date()
              return (
                <tr key={r.id}>
                  <td><strong style={{ fontSize: 13 }}>{r.receipt_number}</strong></td>
                  <td style={{ fontSize: 13 }}>{r.receipt_date}</td>
                  <td style={{ fontSize: 13 }}>{r.supplier?.name || <span style={{ color: 'var(--text-3)' }}>—</span>}</td>
                  <td style={{ fontSize: 13 }}>{r.warehouse?.name || '—'}</td>
                  <td style={{ fontSize: 13, color: 'var(--text-3)' }}>{r.reference_number || '—'}</td>
                  <td style={{ fontSize: 13, color: isPastDue ? 'var(--red)' : 'var(--text-3)', fontWeight: isPastDue ? 600 : 400 }}>
                    {r.payment_due_date || '—'}
                    {isPastDue && <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, textTransform: 'uppercase' }}>Overdue</span>}
                  </td>
                  <td><span className={`badge ${PAYMENT_COLORS[r.payment_status] || 'badge-gray'}`} style={{ fontSize: 11 }}>{r.payment_status}</span></td>
                  <td style={{ textAlign: 'right', fontSize: 13 }}>{r.lines?.length || 0}</td>
                  <td>
                    {r.payment_status === 'unpaid' && (
                      <button onClick={() => markPaid(r.id)} style={{ fontSize: 11, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.2rem 0.55rem', cursor: 'pointer', color: 'var(--green)' }}>
                        Mark Paid
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="New Stock Receipt" subtitle="Record incoming inventory" width={720}>
        <form onSubmit={handleSubmit}>
          {error && <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', color: '#c53030', borderRadius: 8, padding: '0.6rem 0.875rem', fontSize: 13, marginBottom: '1rem' }}>{error}</div>}

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
            <FormField label="Supplier Payment Due" hint="When do you owe the supplier?">
              <ModalInput type="date" value={form.payment_due_date} onChange={e => f('payment_due_date', e.target.value)} />
            </FormField>
            <FormField label="Notes">
              <ModalInput value={form.notes} onChange={e => f('notes', e.target.value)} />
            </FormField>
          </div>

          {/* Frais de transport et douanes — MONTANTS TOTAUX pour tout le shipment */}
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Shipment Costs (total for entire shipment)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem', marginBottom: '1.25rem' }}>
            <FormField label="Total Freight ($)" hint="Will be split proportionally across all products">
              <ModalInput type="text" value={totalFreight} onChange={e => setTotalFreight(e.target.value)} placeholder="0.00" />
            </FormField>
            <FormField label="Total Customs / Tariffs ($)" hint="Paid to customs to release the palette">
              <ModalInput type="text" value={totalCustoms} onChange={e => setTotalCustoms(e.target.value)} placeholder="0.00" />
            </FormField>
          </div>

          {/* Lines */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Products</div>
            <button type="button" onClick={() => setLines(p => [...p, { ...EMPTY_LINE }])}
              style={{ fontSize: 12, fontWeight: 500, background: 'none', border: '1px solid var(--border-2)', borderRadius: 6, padding: '0.25rem 0.6rem', cursor: 'pointer', color: 'var(--text-2)' }}>
              + Add line
            </button>
          </div>

          {/* Headers */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 120px 32px', gap: 8, marginBottom: 4, paddingLeft: 2 }}>
            {['Product', 'Qty', 'Unit Cost ($)', 'Landed/unit', ''].map(h => (
              <span key={h} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
            ))}
          </div>

          {lines.map((line, idx) => {
            const detail = lineDetails[idx]
            return (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 100px 120px 32px', gap: 8, marginBottom: 6, alignItems: 'center' }}>
                <ModalSelect value={line.product_id} onChange={e => updateLine(idx, 'product_id', e.target.value)} required>
                  <option value="">Select product...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                </ModalSelect>
                <ModalInput type="number" min="1" value={line.quantity} onChange={e => updateLine(idx, 'quantity', e.target.value)} placeholder="0" required />
                <ModalInput type="text" value={line.unit_cost} onChange={e => updateLine(idx, 'unit_cost', e.target.value)} placeholder="0.00" required />
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.55rem 0.75rem', fontSize: 13, fontWeight: 600, color: 'var(--green)', textAlign: 'right' }}>
                  {detail && detail.landedUnitCost > 0 ? fmt(detail.landedUnitCost) : '—'}
                </div>
                <div>
                  {lines.length > 1 && (
                    <button type="button" onClick={() => setLines(p => p.filter((_, i) => i !== idx))}
                      style={{ width: 32, height: 38, background: 'none', border: '1.5px solid #fed7d7', borderRadius: 6, cursor: 'pointer', color: '#c53030', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                  )}
                </div>
              </div>
            )
          })}

          {grandTotal > 0 && (
            <div style={{ marginTop: 12, background: 'var(--bg)', borderRadius: 10, padding: '0.875rem 1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                <span style={{ color: 'var(--text-3)' }}>Product cost</span>
                <span>{fmt(lines.reduce((s, l) => s + parseDec(l.unit_cost) * (parseInt(l.quantity) || 0), 0))}</span>
              </div>
              {freight > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-3)' }}>Freight</span>
                  <span>{fmt(freight)}</span>
                </div>
              )}
              {customs > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-3)' }}>Customs / Tariffs</span>
                  <span>{fmt(customs)}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 15, borderTop: '1px solid var(--border)', paddingTop: 8, marginTop: 4 }}>
                <span>Total Landed Cost</span>
                <span style={{ color: 'var(--green)' }}>{fmt(grandTotal)}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>
                WACOG will be recalculated automatically for each product
              </div>
            </div>
          )}

          <ModalActions>
            <BtnSecondary onClick={() => setOpen(false)}>Cancel</BtnSecondary>
            <BtnPrimary type="submit" disabled={saving}>{saving ? 'Saving…' : 'Create Receipt'}</BtnPrimary>
          </ModalActions>
        </form>
      </Modal>
    </Layout>
  )
}
