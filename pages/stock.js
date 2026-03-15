import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd, fdate } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

const EMPTY_SHIPMENT = {
  reference: '', date: new Date().toISOString().split('T')[0],
  supplier: '', freight_cost: '', customs_cost: '', packaging_cost: '', note: '',
  // Payment status per cost type
  prod_paid: false, prod_due: '',
  freight_paid: false, freight_due: '',
  customs_paid: true, customs_due: '',  // customs usually paid at import
}

export default function Stock() {
  const [products, setProducts] = useState([])
  const [shipments, setShipments] = useState([])
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [showShipModal, setShowShipModal] = useState(false)
  const [shipForm, setShipForm] = useState(EMPTY_SHIPMENT)
  const [shipLines, setShipLines] = useState([{ product_id: '', quantity: '', unit_cost: '' }])
  const [deletingId, setDeletingId] = useState(null)
  const [editingShipment, setEditingShipment] = useState(null)

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/inventory?t=' + Date.now()).then(r => r.json()),
      fetch('/api/shipments?t=' + Date.now()).then(r => r.json()),
      fetch('/api/sales?t=' + Date.now()).then(r => r.json()),
    ]).then(([p, s, o]) => {
      setProducts(Array.isArray(p) ? p : [])
      setShipments(Array.isArray(s) ? s : [])
      setSales(Array.isArray(o) ? o : [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  // Build movements
  const movements = []
  shipments.forEach(s => {
    ;(s.shipment_items || []).forEach(item => {
      movements.push({
        date: s.date, type: 'IN',
        product: item.inventory?.product_name || '—',
        product_id: item.product_id,
        quantity: parseFloat(item.quantity || 0),
        reference: s.reference,
        note: 'Shipment · ' + (s.supplier || ''),
        unit_cost: parseFloat(item.unit_cost || 0),
        shipment_id: s.id,
      })
    })
  })
  sales.forEach(o => {
    ;(o.sale_items || []).forEach(item => {
      movements.push({
        date: o.date, type: 'OUT',
        product: item.inventory?.product_name || '—',
        product_id: item.product_id,
        quantity: parseFloat(item.quantity || 0),
        reference: o.reference || o.id?.slice(0, 8),
        note: (o.channel || '') + (o.buyer_name ? ' — ' + o.buyer_name : ''),
        unit_cost: parseFloat(item.unit_cost || 0),
      })
    })
  })
  movements.sort((a, b) => (b.date || '').localeCompare(a.date || ''))

  const totalIn = movements.filter(m => m.type === 'IN').reduce((a, m) => a + m.quantity, 0)
  const totalOut = movements.filter(m => m.type === 'OUT').reduce((a, m) => a + m.quantity, 0)

  // Shipment cost preview
  const totalQty = shipLines.reduce((a, l) => a + (parseFloat(l.quantity) || 0), 0)
  const totalProdCost = shipLines.reduce((a, l) => a + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0), 0)
  const freight = parseFloat(shipForm.freight_cost) || 0
  const customs = parseFloat(shipForm.customs_cost) || 0
  const packaging = parseFloat(shipForm.packaging_cost) || 0
  const totalAncillary = freight + customs + packaging
  const totalCost = totalProdCost + totalAncillary
  const freightPerUnit = totalQty > 0 ? totalAncillary / totalQty : 0

  const lineWithCost = shipLines.map(l => {
    const qty = parseFloat(l.quantity) || 0
    const prodUnit = parseFloat(l.unit_cost) || 0
    const ancillaryUnit = totalQty > 0 ? (qty / totalQty) * totalAncillary / Math.max(qty, 1) : 0
    return { ...l, totalUnitCost: prodUnit + ancillaryUnit, qty }
  })

  const openEdit = async (s) => {
    // Pre-delete AP entries linked to this shipment reference
    if (s.reference) {
      const apRes = await fetch('/api/payables').then(r => r.json())
      const linked = Array.isArray(apRes) ? apRes.filter(p => p.note && p.note.includes(s.reference)) : []
      for (const ap of linked) {
        await fetch('/api/payables?id=' + ap.id, { method: 'DELETE' })
      }
    }
    setEditingShipment(s.id)
    setShipForm({
      reference: s.reference || '',
      date: s.date || new Date().toISOString().split('T')[0],
      supplier: s.supplier || '',
      note: s.note || '',
      freight_cost: s.freight_cost || '',
      customs_cost: s.customs_cost || '',
      packaging_cost: s.packaging_cost || '',
      prod_paid: false, prod_due: '',
      freight_paid: !!s.freight_cost, freight_due: '',
      customs_paid: true, customs_due: '',
    })
    setShipLines((s.shipment_items || []).map(i => ({
      product_id: i.product_id || '',
      quantity: i.quantity?.toString() || '',
      unit_cost: i.unit_purchase_price?.toString() || i.unit_cost?.toString() || '',
    })))
    setShowShipModal(true)
  }

  const addLine = () => setShipLines([...shipLines, { product_id: '', quantity: '', unit_cost: '' }])
  const removeLine = i => setShipLines(shipLines.filter((_, xi) => xi !== i))
  const updateLine = (i, f, v) => setShipLines(shipLines.map((l, xi) => xi === i ? { ...l, [f]: v } : l))

  // Auto-fill unit cost from product
  const handleProductChange = (i, productId) => {
    const prod = products.find(p => p.id === productId)
    const unitCostVal = prod?.prod_cost || prod?.unit_cost || ''
    setShipLines(prev => prev.map((l, xi) => xi === i ? { ...l, product_id: productId, unit_cost: unitCostVal } : l))
  }

  const saveShipment = async () => {
    if (editingShipment) {
      // Delete old shipment first, then re-create
      await fetch('/api/shipments?id=' + editingShipment, { method: 'DELETE' })
      setEditingShipment(null)
    }
    const validLines = shipLines.filter(l => l.product_id && l.quantity)
    if (!shipForm.date || validLines.length === 0) { alert('Please fill date and at least one product'); return }
    setSaving(true)
    const items = validLines.map(l => ({
      product_id: l.product_id,
      quantity: parseFloat(l.quantity),
      unit_purchase_price: parseFloat(l.unit_cost) || 0,
      unit_cost_with_ancillary: lineWithCost.find(lc => lc.product_id === l.product_id)?.totalUnitCost || 0,
    }))
    const resp = await fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        shipment: {
          date: shipForm.date,
          reference: shipForm.reference || 'RFC-' + new Date().toISOString().slice(0,10),
          supplier: shipForm.supplier || '',
          note: shipForm.note || '',
          freight_cost: freight,
          customs_cost: customs,
          packaging_cost: packaging,
          total_cost: totalCost,
          total_product_cost: totalProdCost,
        },
        items: items.map(i => ({ ...i, unit_purchase_price: parseFloat(i.unit_cost) || 0 })),
      })
    })
    const data = await resp.json()
    if (data.error) { setSaving(false); alert('Error: ' + data.error); return }

    // Create AP entries for unpaid costs
    const ref = shipForm.reference || data.shipment_id?.slice(0, 8)
    const apEntries = []
    if (!shipForm.prod_paid && totalProdCost > 0) {
      apEntries.push({ vendor: shipForm.supplier || 'Supplier', amount: totalProdCost, due_date: shipForm.prod_due || null, note: 'Merchandise — ' + ref, status: 'pending' })
    }
    if (!shipForm.freight_paid && freight > 0) {
      apEntries.push({ vendor: 'Freight / Transport', amount: freight, due_date: shipForm.freight_due || null, note: 'Freight — ' + ref, status: 'pending' })
    }
    if (!shipForm.customs_paid && customs > 0) {
      apEntries.push({ vendor: 'Customs / Duties', amount: customs, due_date: shipForm.customs_due || null, note: 'Customs — ' + ref, status: 'pending' })
    }
    for (const entry of apEntries) {
      await fetch('/api/payables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(entry) })
    }
    if (apEntries.length > 0) {
      alert(apEntries.length + ' AP entr' + (apEntries.length > 1 ? 'ies' : 'y') + ' created in Cash Flow AP/AR')
    }
    setSaving(false)
    setShowShipModal(false)
    setEditingShipment(null)
    setShipForm(EMPTY_SHIPMENT)
    setShipLines([{ product_id: '', quantity: '', unit_cost: '' }])
    load()
  }

  const deleteShipment = async (id) => {
    if (!confirm('Delete this shipment? Stock will be adjusted.')) return
    setDeletingId(id)
    await fetch('/api/shipments?id=' + id, { method: 'DELETE' })
    setDeletingId(null)
    load()
  }

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'in', label: '↑ Stock IN (' + shipments.length + ')' },
    { id: 'out', label: '↓ Stock OUT (' + movements.filter(m => m.type === 'OUT').length + ')' },
    { id: 'movements', label: 'All movements' },
  ]

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Stock</h1>
          <p>{totalIn} units in · {totalOut} units out · {movements.length} movements</p>
        </div>
        {activeTab === 'in' && (
          <button className="primary" onClick={() => setShowShipModal(true)}>+ New shipment</button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={'tab-btn' + (activeTab === t.id ? ' active' : '')}>{t.label}</button>)}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <>
          {/* OVERVIEW */}
          {activeTab === 'overview' && (
            <div>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                  ['Units in stock', products.reduce((a, p) => a + (p.quantity_on_hand || 0), 0), 'var(--navy)'],
                  ['Stock IN', totalIn, 'var(--green)'],
                  ['Stock OUT', totalOut, 'var(--red)'],
                  ['Stock value (cost)', usd(products.reduce((a, p) => a + (p.quantity_on_hand || 0) * (p.unit_cost || 0), 0)), 'var(--amber)'],
                  ['Stock value (MSRP)', usd(products.reduce((a, p) => a + (p.quantity_on_hand || 0) * (parseFloat(p.msrp) || 0), 0)), 'var(--green)'],
                ].map(([l, v, c]) => (
                  <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
                ))}
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Current stock levels
                </div>
                <table>
                  <thead><tr><th>Product</th><th>SKU</th><th>Supplier</th><th style={{ textAlign: 'right' }}>In stock</th><th style={{ textAlign: 'right' }}>Reorder at</th><th style={{ textAlign: 'right' }}>Unit cost</th><th style={{ textAlign: 'right' }}>Value (cost)</th><th style={{ textAlign: 'right' }}>Value (MSRP)</th><th>Status</th></tr></thead>
                  <tbody>
                    {products.map(p => {
                      const isLow = p.quantity_on_hand <= (p.reorder_level || 10)
                      return (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500 }}>{p.product_name}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.sku || '—'}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.supplier || '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: isLow ? 'var(--red)' : 'var(--green)', fontSize: 16 }}>{p.quantity_on_hand}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{p.reorder_level || 10}</td>
                          <td style={{ textAlign: 'right' }}>{usd(p.unit_cost)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{usd((p.quantity_on_hand || 0) * (p.unit_cost || 0))}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500, color: 'var(--green)' }}>{p.msrp ? usd((p.quantity_on_hand || 0) * parseFloat(p.msrp)) : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>No MSRP</span>}</td>
                          <td>{isLow ? <span className="pill" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>⚠ Low</span> : <span className="pill" style={{ background: 'var(--green-light)', color: 'var(--green)' }}>OK</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STOCK IN — Shipments */}
          {activeTab === 'in' && (
            <div>
              {shipments.length === 0 ? (
                <div className="card"><div className="empty-state"><div style={{ fontSize: 36 }}>🚢</div><p>No shipments yet</p><button className="primary" style={{ marginTop: 12 }} onClick={() => setShowShipModal(true)}>+ New shipment</button></div></div>
              ) : shipments.map(s => {
                const totalUnits = s.shipment_items?.reduce((a, i) => a + parseFloat(i.quantity || 0), 0) || 0
                const totalCostS = parseFloat(s.total_cost || 0)
                return (
                  <div key={s.id} className="card" style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{s.reference}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{fdate(s.date)} · {s.supplier || 'Unknown supplier'} · {totalUnits} units</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ fontWeight: 600, fontSize: 18, color: 'var(--red)' }}>{usd(totalCostS)}</div>
                        <button onClick={() => openEdit(s)} style={{ fontSize: 12, padding: '5px 10px', color: 'var(--blue-pearl)', borderColor: 'var(--blue-pearl)', background: 'var(--blue-light)' }}>Edit</button>
                      <button onClick={() => deleteShipment(s.id)} disabled={deletingId === s.id} className="danger" style={{ fontSize: 12, padding: '5px 10px' }}>{deletingId === s.id ? '…' : 'Delete'}</button>
                      </div>
                    </div>

                    {/* Cost breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: '1rem' }}>
                      {[
                        ['Products', s.total_product_cost, '#639922'],
                        ['Freight', s.freight_cost, 'var(--blue-pearl)'],
                        ['Customs', s.customs_cost, '#5B3D8A'],
                        ['Packaging', s.packaging_cost, 'var(--amber)'],
                      ].map(([l, v, c]) => (
                        <div key={l} style={{ padding: '8px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{l}</div>
                          <div style={{ fontWeight: 500, color: c }}>{usd(v || 0)}</div>
                        </div>
                      ))}
                    </div>

                    {/* Items */}
                    <table style={{ fontSize: 13 }}>
                      <thead><tr><th>Product</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Prod cost/u</th><th style={{ textAlign: 'right' }}>Allocated/u</th><th style={{ textAlign: 'right' }}>Total cost/u</th></tr></thead>
                      <tbody>
                        {s.shipment_items?.map((item, i) => {
                          const prodUnit = parseFloat(item.unit_cost || 0)
                          const allocated = totalUnits > 0 ? ((parseFloat(s.freight_cost || 0) + parseFloat(s.customs_cost || 0) + parseFloat(s.packaging_cost || 0)) / totalUnits) : 0
                          const totalUnit = prodUnit + allocated
                          return (
                            <tr key={i}>
                              <td style={{ fontWeight: 500 }}>{item.inventory?.product_name || '—'}</td>
                              <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                              <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{usd(prodUnit)}</td>
                              <td style={{ textAlign: 'right', color: 'var(--blue-pearl)' }}>+{usd(allocated)}</td>
                              <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--red)' }}>{usd(totalUnit)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )
              })}
            </div>
          )}

          {/* STOCK OUT */}
          {activeTab === 'out' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {movements.filter(m => m.type === 'OUT').length === 0 ? <div className="empty-state"><p>No sales recorded yet</p></div> : (
                <table>
                  <thead><tr><th>Date</th><th>Product</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Unit cost</th><th>Reference</th><th>Channel</th></tr></thead>
                  <tbody>
                    {movements.filter(m => m.type === 'OUT').map((m, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(m.date)}</td>
                        <td style={{ fontWeight: 500 }}>{m.product}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--red)' }}>−{m.quantity}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{usd(m.unit_cost)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.reference}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* ALL MOVEMENTS */}
          {activeTab === 'movements' && (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {movements.length === 0 ? <div className="empty-state"><p>No movements yet</p></div> : (
                <table>
                  <thead><tr><th>Date</th><th>Type</th><th>Product</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Unit cost</th><th>Reference</th><th>Note</th></tr></thead>
                  <tbody>
                    {movements.map((m, i) => (
                      <tr key={i}>
                        <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(m.date)}</td>
                        <td><span className="pill" style={{ background: m.type === 'IN' ? 'var(--green-light)' : 'var(--red-light)', color: m.type === 'IN' ? 'var(--green)' : 'var(--red)', fontSize: 11 }}>{m.type === 'IN' ? '↑ IN' : '↓ OUT'}</span></td>
                        <td style={{ fontWeight: 500 }}>{m.product}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: m.type === 'IN' ? 'var(--green)' : 'var(--red)' }}>{m.type === 'IN' ? '+' : '−'}{m.quantity}</td>
                        <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{usd(m.unit_cost)}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.reference}</td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}

      {/* New shipment modal */}
      {showShipModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowShipModal(false)}>
          <div className="modal" style={{ maxWidth: 760 }}>
            <h2>{editingShipment ? 'Edit shipment' : 'New shipment'}</h2>

            {/* Header fields */}
            <div className="form-row">
              <div className="form-group"><label>Date *</label><input type="date" value={shipForm.date} onChange={e => setShipForm({ ...shipForm, date: e.target.value })} /></div>
              <div className="form-group"><label>Reference</label><input type="text" placeholder="RFC-2026-01" value={shipForm.reference} onChange={e => setShipForm({ ...shipForm, reference: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Supplier</label><input type="text" placeholder="The French Lab" value={shipForm.supplier} onChange={e => setShipForm({ ...shipForm, supplier: e.target.value })} /></div>
              <div className="form-group"><label>Note</label><input type="text" placeholder="Optional note" value={shipForm.note} onChange={e => setShipForm({ ...shipForm, note: e.target.value })} /></div>
            </div>

            {/* Ancillary costs */}
            <div style={{ padding: '12px 14px', background: 'var(--blue-light)', borderRadius: 'var(--radius)', marginBottom: '1rem', border: '1px solid rgba(44,74,110,0.1)' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--navy-mid)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Ancillary costs — allocated proportionally per unit</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <div className="form-group" style={{ marginBottom: 0 }}><label>Freight ($)</label><input type="number" placeholder="0.00" value={shipForm.freight_cost} onChange={e => setShipForm({ ...shipForm, freight_cost: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label>Customs / tariffs ($)</label><input type="number" placeholder="0.00" value={shipForm.customs_cost} onChange={e => setShipForm({ ...shipForm, customs_cost: e.target.value })} /></div>
                <div className="form-group" style={{ marginBottom: 0 }}><label>Packaging ($)</label><input type="number" placeholder="0.00" value={shipForm.packaging_cost} onChange={e => setShipForm({ ...shipForm, packaging_cost: e.target.value })} /></div>
              </div>
            </div>

            {/* Payment status per cost */}
            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '1rem 0 8px', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>Payment status</div>
            <div style={{ background: 'var(--cream)', borderRadius: 'var(--radius)', padding: '12px 14px', marginBottom: '1rem', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                ['Merchandise', 'prod_paid', 'prod_due', totalProdCost],
                ['Freight / Transport', 'freight_paid', 'freight_due', freight],
                ['Customs / Duties', 'customs_paid', 'customs_due', customs],
              ].filter(([, , , v]) => v > 0).map(([label, paidKey, dueKey, amount]) => (
                <div key={label} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center' }}>
                  <div style={{ fontSize: 13 }}><span style={{ fontWeight: 500 }}>{label}</span> <span style={{ color: 'var(--text-muted)' }}>{usd(amount)}</span></div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={shipForm[paidKey]} onChange={e => setShipForm({ ...shipForm, [paidKey]: e.target.checked })} style={{ width: 'auto' }} />
                    <label style={{ fontSize: 12, cursor: 'pointer', marginBottom: 0, textTransform: 'none', letterSpacing: 0 }}>Already paid</label>
                  </div>
                  {!shipForm[paidKey] && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Due date:</span>
                      <input type="date" value={shipForm[dueKey]} onChange={e => setShipForm({ ...shipForm, [dueKey]: e.target.value })} style={{ fontSize: 12, padding: '4px 8px', width: 140 }} />
                    </div>
                  )}
                  {shipForm[paidKey] && <span style={{ fontSize: 11, color: 'var(--green)' }}>✓ Paid</span>}
                </div>
              ))}
            </div>

            {/* Product lines */}
            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Products received</div>
            {shipLines.map((line, i) => {
              const lc = lineWithCost[i]
              return (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 120px 32px', gap: 8, alignItems: 'end' }}>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      {i === 0 && <label>Product</label>}
                      <select value={line.product_id} onChange={e => handleProductChange(i, e.target.value)}>
                        <option value="">— Select product —</option>
                        {products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}
                      </select>
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      {i === 0 && <label>Qty</label>}
                      <input type="number" placeholder="0" value={line.quantity} onChange={e => updateLine(i, 'quantity', e.target.value)} />
                    </div>
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      {i === 0 && <label>Prod cost/unit ($)</label>}
                      <input type="number" placeholder="0.00" value={line.unit_cost} onChange={e => updateLine(i, 'unit_cost', e.target.value)} />
                    </div>
                    <button onClick={() => removeLine(i)} style={{ padding: '8px', color: 'var(--red)', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', marginTop: i === 0 ? 20 : 0 }}>×</button>
                  </div>
                  {lc && lc.qty > 0 && lc.totalUnitCost > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--navy-mid)', marginTop: 4, paddingLeft: 4 }}>
                      Prod {usd(parseFloat(line.unit_cost) || 0)} + Allocated {usd(freightPerUnit)} = <strong>Total unit cost {usd(lc.totalUnitCost)}</strong>
                    </div>
                  )}
                </div>
              )
            })}
            <button onClick={addLine} style={{ fontSize: 12, marginBottom: '1rem' }}>+ Add product</button>

            {/* Summary */}
            {totalQty > 0 && (
              <div style={{ background: 'var(--cream)', borderRadius: 'var(--radius)', padding: '1rem', marginBottom: '1rem', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                {[
                  ['Total units', totalQty, 'var(--navy)'],
                  ['Products cost', usd(totalProdCost), '#639922'],
                  ['Ancillary costs', usd(totalAncillary), 'var(--blue-pearl)'],
                  ['Total shipment', usd(totalCost), 'var(--red)'],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{l}</div>
                    <div style={{ fontWeight: 600, color: c }}>{v}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="form-actions">
              <button className="primary" onClick={saveShipment} disabled={saving}>{saving ? 'Saving…' : editingShipment ? 'Update shipment' : 'Save shipment'}</button>
              <button onClick={() => { setShowShipModal(false); setEditingShipment(null); setShipForm(EMPTY_SHIPMENT); setShipLines([{ product_id: '', quantity: '', unit_cost: '' }]) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
