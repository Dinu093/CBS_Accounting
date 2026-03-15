import { useState, useEffect, useCallback } from 'react'
import Layout from '../components/Layout'
import { usd, fdate, fdateShort } from '../lib/constants'
import { useAuth } from './_app'

export async function getServerSideProps() { return { props: {} } }

export default function Stock() {
  const { isAdmin } = useAuth()
  const [products, setProducts] = useState([])
  const [shipments, setShipments] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [shipForm, setShipForm] = useState({ reference: '', date: new Date().toISOString().split('T')[0], supplier_name: '', freight_cost: '', customs_cost: '', packaging_cost: '', notes: '', merchandise_paid: false, merchandise_due_date: '', freight_paid: false, freight_due_date: '', customs_paid: true, customs_due_date: '' })
  const [lines, setLines] = useState([{ product_id: '', quantity: '', unit_purchase_price: '' }])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/products').then(r => r.json()),
      fetch('/api/shipments').then(r => r.json()),
      fetch('/api/suppliers').then(r => r.json()),
    ]).then(([p, s, sup]) => {
      setProducts(Array.isArray(p) ? p : [])
      setShipments(Array.isArray(s) ? s : [])
      setSuppliers(Array.isArray(sup) ? sup : [])
      setLoading(false)
    })
  }, [])
  useEffect(() => { load() }, [load])

  const totalIn = shipments.reduce((a, s) => a + (s.shipment_items || []).reduce((b, i) => b + +i.quantity, 0), 0)
  const totalOut = 0
  const totalValue = products.reduce((a, p) => a + +p.quantity_on_hand * +p.unit_cost, 0)
  const totalMSRP = products.reduce((a, p) => a + Math.max(0, +p.quantity_on_hand) * +(p.msrp || 0), 0)

  const updateLine = (i, field, val) => setLines(prev => prev.map((l, xi) => xi === i ? { ...l, [field]: val } : l))
  const addLine = () => setLines(prev => [...prev, { product_id: '', quantity: '', unit_purchase_price: '' }])
  const removeLine = (i) => setLines(prev => prev.filter((_, xi) => xi !== i))

  const onProductSelect = (i, pid) => {
    const p = products.find(x => x.id === pid)
    updateLine(i, 'product_id', pid)
    if (p?.unit_cost) updateLine(i, 'unit_purchase_price', p.unit_cost)
  }

  const totalProdCost = lines.reduce((a, l) => a + (+(l.quantity || 0)) * (+(l.unit_purchase_price || 0)), 0)
  const totalAncillary = (+(shipForm.freight_cost || 0)) + (+(shipForm.customs_cost || 0)) + (+(shipForm.packaging_cost || 0))
  const totalUnits = lines.reduce((a, l) => a + +(l.quantity || 0), 0)

  const saveShipment = async () => {
    const validLines = lines.filter(l => l.product_id && l.quantity)
    if (!shipForm.date || validLines.length === 0) { alert('Please fill date and at least one product'); return }
    setSaving(true)
    const items = validLines.map(l => ({ product_id: l.product_id, quantity: +l.quantity, unit_purchase_price: +(l.unit_purchase_price || 0) }))
    const resp = await fetch('/api/shipments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ shipment: { ...shipForm, freight_cost: +(shipForm.freight_cost || 0), customs_cost: +(shipForm.customs_cost || 0), packaging_cost: +(shipForm.packaging_cost || 0) }, items }) })
    const data = await resp.json()
    setSaving(false)
    if (data.error) { alert('Error: ' + data.error); return }
    if (data.ap_created > 0) alert(data.ap_created + ' AP entr' + (data.ap_created > 1 ? 'ies' : 'y') + ' created in AP/AR')
    setShowModal(false)
    setShipForm({ reference: '', date: new Date().toISOString().split('T')[0], supplier_name: '', freight_cost: '', customs_cost: '', packaging_cost: '', notes: '', merchandise_paid: false, merchandise_due_date: '', freight_paid: false, freight_due_date: '', customs_paid: true, customs_due_date: '' })
    setLines([{ product_id: '', quantity: '', unit_purchase_price: '' }])
    load()
  }

  const deleteShipment = async (id) => {
    if (!confirm('Delete this shipment? Stock and AP will be recalculated.')) return
    setDeletingId(id)
    await fetch('/api/shipments?id=' + id, { method: 'DELETE' })
    setDeletingId(null); load()
  }

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Stock</h1><p>{totalIn} units in · {products.reduce((a,p)=>a+(+p.quantity_on_hand||0),0)} on hand · {shipments.length} shipments</p></div>
        {isAdmin && <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New shipment</button>}
      </div>

      <div className="kpi-grid kpi-grid-4" style={{ marginBottom: 24 }}>
        <div className="kpi"><div className="kpi-label">Units on hand</div><div className="kpi-value">{products.reduce((a,p)=>a+(+p.quantity_on_hand||0),0).toLocaleString()}</div></div>
        <div className="kpi"><div className="kpi-label">Stock value (cost)</div><div className="kpi-value" style={{fontSize:18}}>{usd(totalValue)}</div></div>
        <div className="kpi"><div className="kpi-label">Stock value (MSRP)</div><div className="kpi-value green" style={{fontSize:18}}>{usd(totalMSRP)}</div></div>
        <div className="kpi"><div className="kpi-label">Shipments</div><div className="kpi-value">{shipments.length}</div></div>
      </div>

      <div className="tabs">
        {[['overview','Overview'],['in','Stock IN ('+shipments.length+')']].map(([v,l]) => (
          <button key={v} className={`tab${tab===v?' active':''}`} onClick={() => setTab(v)}>{l}</button>
        ))}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <>
          {tab === 'overview' && (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Product</th><th>SKU</th><th className="td-right">In stock</th><th className="td-right">Unit cost (CMP)</th><th className="td-right">Value (cost)</th><th className="td-right">Value (MSRP)</th><th>Reorder at</th><th>Status</th></tr></thead>
                <tbody>
                  {products.map(p => {
                    const isNeg = +p.quantity_on_hand < 0
                    const isLow = +p.quantity_on_hand <= +p.reorder_level && +p.reorder_level > 0
                    return (
                      <tr key={p.id}>
                        <td style={{fontWeight:500}}>{p.product_name}</td>
                        <td className="td-muted">{p.sku||'—'}</td>
                        <td className="td-right td-mono" style={{fontWeight:600,color:isNeg?'var(--red)':isLow?'var(--amber)':'var(--green)'}}>{p.quantity_on_hand}</td>
                        <td className="td-right td-muted td-mono">{usd(p.unit_cost)}</td>
                        <td className="td-right td-mono">{usd(+p.quantity_on_hand * +p.unit_cost)}</td>
                        <td className="td-right td-mono" style={{color:'var(--green)'}}>{p.msrp ? usd(Math.max(0,+p.quantity_on_hand) * +p.msrp) : '—'}</td>
                        <td className="td-muted">{p.reorder_level||'—'}</td>
                        <td>{isNeg?<span className="badge badge-red">Negative</span>:isLow?<span className="badge badge-amber">Low</span>:<span className="badge badge-green">OK</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'in' && (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              {shipments.length === 0 ? <div className="empty"><div className="empty-icon">📦</div><p>No shipments yet</p></div> :
                shipments.map(s => (
                  <div key={s.id} className="card">
                    <div className="card-header">
                      <div style={{display:'flex',alignItems:'center',gap:12}}>
                        <div>
                          <div style={{fontWeight:600,fontSize:14}}>{s.reference || 'Shipment'}</div>
                          <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>{fdate(s.date)} · {s.supplier_name||'—'} · {(s.shipment_items||[]).reduce((a,i)=>a+ +i.quantity,0)} units</div>
                        </div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <span style={{fontWeight:600,fontSize:15}}>{usd(s.total_cost)}</span>
                        {isAdmin && <button className="btn btn-danger btn-sm" onClick={() => deleteShipment(s.id)} disabled={deletingId===s.id}>{deletingId===s.id?'…':'Delete'}</button>}
                      </div>
                    </div>
                    <div style={{padding:'0 18px 14px'}}>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,margin:'10px 0',padding:'10px 0',borderTop:'1px solid var(--border)',borderBottom:'1px solid var(--border)'}}>
                        {[['Products',s.total_product_cost],['Freight',s.freight_cost],['Customs',s.customs_cost],['Packaging',s.packaging_cost]].map(([l,v])=>(
                          <div key={l} style={{textAlign:'center'}}><div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{l}</div><div style={{fontWeight:600,fontSize:13}}>{usd(v||0)}</div></div>
                        ))}
                      </div>
                      <table style={{marginTop:8}}>
                        <thead><tr><th>Product</th><th className="td-right">Qty</th><th className="td-right">Prod cost/u</th><th className="td-right">Allocated/u</th><th className="td-right">Total cost/u</th></tr></thead>
                        <tbody>
                          {(s.shipment_items||[]).map((item,i) => (
                            <tr key={i}>
                              <td style={{fontWeight:500}}>{item.inventory?.product_name||'—'}</td>
                              <td className="td-right td-mono">{item.quantity}</td>
                              <td className="td-right td-muted td-mono">{usd(item.unit_purchase_price||0)}</td>
                              <td className="td-right td-mono" style={{color:'var(--blue)'}}>{usd((+item.allocated_freight||0)+(+item.allocated_customs||0))}</td>
                              <td className="td-right td-mono" style={{fontWeight:600}}>{usd(item.total_unit_cost||0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              }
            </div>
          )}
        </>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{maxWidth:640}}>
            <div className="modal-header"><h2>New shipment</h2><button className="modal-close" onClick={() => setShowModal(false)}>×</button></div>
            <div className="modal-body">
              <div className="form-row form-row-3">
                <div className="form-group"><label className="form-label">Date *</label><input type="date" value={shipForm.date} onChange={e => setShipForm({...shipForm,date:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Reference</label><input type="text" value={shipForm.reference} onChange={e => setShipForm({...shipForm,reference:e.target.value})} placeholder="RFC-2026-04" /></div>
                <div className="form-group"><label className="form-label">Supplier</label><input type="text" value={shipForm.supplier_name} onChange={e => setShipForm({...shipForm,supplier_name:e.target.value})} placeholder="The French Insight" /></div>
              </div>

              <div style={{background:'var(--bg-2)',borderRadius:'var(--radius)',padding:'12px 14px',marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:500,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Ancillary costs</div>
                <div className="form-row form-row-3" style={{marginBottom:0}}>
                  <div className="form-group" style={{marginBottom:0}}><label className="form-label">Freight ($)</label><input type="number" value={shipForm.freight_cost} onChange={e => setShipForm({...shipForm,freight_cost:e.target.value})} placeholder="0.00" /></div>
                  <div className="form-group" style={{marginBottom:0}}><label className="form-label">Customs / tariffs ($)</label><input type="number" value={shipForm.customs_cost} onChange={e => setShipForm({...shipForm,customs_cost:e.target.value})} placeholder="0.00" /></div>
                  <div className="form-group" style={{marginBottom:0}}><label className="form-label">Packaging ($)</label><input type="number" value={shipForm.packaging_cost} onChange={e => setShipForm({...shipForm,packaging_cost:e.target.value})} placeholder="0.00" /></div>
                </div>
              </div>

              <div style={{background:'var(--bg-2)',borderRadius:'var(--radius)',padding:'12px 14px',marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:500,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:10}}>Payment status</div>
                {[['Merchandise',totalProdCost,'merchandise'],['Freight',+(shipForm.freight_cost||0),'freight'],['Customs',+(shipForm.customs_cost||0),'customs']].filter(([,v])=>v>0).map(([label,amount,key])=>(
                  <div key={key} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:10,alignItems:'center',marginBottom:8}}>
                    <div style={{fontSize:13}}><span style={{fontWeight:500}}>{label}</span> <span style={{color:'var(--text-3)'}}>{usd(amount)}</span></div>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <input type="checkbox" checked={shipForm[key+'_paid']} onChange={e => setShipForm({...shipForm,[key+'_paid']:e.target.checked})} style={{width:'auto'}} />
                      <label style={{fontSize:12}}>Already paid</label>
                    </div>
                    {!shipForm[key+'_paid'] ? (
                      <input type="date" value={shipForm[key+'_due_date']} onChange={e => setShipForm({...shipForm,[key+'_due_date']:e.target.value})} style={{width:140,fontSize:12}} />
                    ) : <span style={{fontSize:11,color:'var(--green)'}}>✓ Paid</span>}
                  </div>
                ))}
              </div>

              <div style={{fontSize:11,fontWeight:500,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Products received</div>
              {lines.map((l,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 100px 120px 28px',gap:8,marginBottom:8,alignItems:'end'}}>
                  <div><label className="form-label" style={{display:i===0?'block':'none'}}>Product</label>
                    <select value={l.product_id} onChange={e => onProductSelect(i, e.target.value)}>
                      <option value="">Select product…</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.product_name} (stock: {p.quantity_on_hand})</option>)}
                    </select>
                  </div>
                  <div><label className="form-label" style={{display:i===0?'block':'none'}}>Qty</label><input type="number" value={l.quantity} onChange={e => updateLine(i,'quantity',e.target.value)} /></div>
                  <div><label className="form-label" style={{display:i===0?'block':'none'}}>Prod cost/u ($)</label><input type="number" value={l.unit_purchase_price} onChange={e => updateLine(i,'unit_purchase_price',e.target.value)} placeholder="0.00" /></div>
                  <div style={{paddingBottom:2}}><button onClick={() => removeLine(i)} style={{background:'none',border:'none',color:'var(--text-3)',fontSize:18,cursor:'pointer',lineHeight:1}}>×</button></div>
                </div>
              ))}
              <button className="btn btn-outline btn-sm" onClick={addLine}>+ Add product</button>

              {totalUnits > 0 && (
                <div style={{marginTop:14,padding:'10px 14px',background:'var(--bg-2)',borderRadius:'var(--radius)',display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,textAlign:'center'}}>
                  {[['Units',totalUnits],['Products',usd(totalProdCost)],['Ancillary',usd(totalAncillary)],['Total',usd(totalProdCost+totalAncillary)]].map(([l,v])=>(
                    <div key={l}><div style={{fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3}}>{l}</div><div style={{fontWeight:600,fontSize:13}}>{v}</div></div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveShipment} disabled={saving}>{saving?'Saving…':'Save shipment'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
