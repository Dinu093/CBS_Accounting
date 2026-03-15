import { useState, useEffect, useCallback, useRef } from 'react'
import Layout from '../components/Layout'
import { usd, fdate, fdateShort, initials } from '../lib/constants'
import { useAuth } from '../lib/auth'

export async function getServerSideProps() { return { props: {} } }

const EMPTY_ORDER = { date: new Date().toISOString().split('T')[0], channel: 'E-commerce', reference: '', distributor_id: '', location_id: '', payment_status: 'paid', due_date: '', buyer_name: '', buyer_email: '', buyer_address: '', buyer_city: '', buyer_state: '', buyer_zip: '', shipping_cost: '', notes: '' }

export default function Sales() {
  const { isAdmin } = useAuth()
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [distributors, setDistributors] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(EMPTY_ORDER)
  const [lines, setLines] = useState([{ product_id: '', quantity: '', unit_price: '' }])
  const [saving, setSaving] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [parsedInvoice, setParsedInvoice] = useState(null)
  const fileRef = useRef()
  const [period, setPeriod] = useState('month')
  const [search, setSearch] = useState('')

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch('/api/sales').then(r => r.json()),
      fetch('/api/products').then(r => r.json()),
      fetch('/api/distributors').then(r => r.json()),
    ]).then(([o, p, d]) => {
      setOrders(Array.isArray(o) ? o : [])
      setProducts(Array.isArray(p) ? p : [])
      setDistributors(Array.isArray(d) ? d : [])
      setLoading(false)
    })
  }, [])
  useEffect(() => { load() }, [load])

  const getRange = () => {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    if (period === 'month') return { from: today.slice(0,7) + '-01', to: today }
    if (period === 'quarter') { const q = Math.floor(now.getMonth()/3); return { from: new Date(now.getFullYear(),q*3,1).toISOString().split('T')[0], to: today } }
    if (period === 'year') return { from: now.getFullYear() + '-01-01', to: today }
    return { from: null, to: null }
  }
  const { from, to } = getRange()
  let filtered = orders.filter(o => (!from || o.date >= from) && (!to || o.date <= to))
  if (tab === 'ecom') filtered = filtered.filter(o => o.channel === 'E-commerce')
  if (tab === 'wholesale') filtered = filtered.filter(o => o.channel === 'Wholesale')
  if (search) filtered = filtered.filter(o => [o.buyer_name, o.reference, o.distributors?.name].some(v => v?.toLowerCase().includes(search.toLowerCase())))

  const totalRev = filtered.reduce((a, o) => a + +o.total_amount, 0)
  const ecomRev = filtered.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + +o.total_amount, 0)
  const wsRev = filtered.filter(o => o.channel !== 'E-commerce').reduce((a, o) => a + +o.total_amount, 0)
  const totalCOGS = filtered.reduce((a, o) => a + (o.sale_items||[]).reduce((b, i) => b + +i.quantity * +(i.unit_cost||0), 0), 0)
  const grossMargin = totalRev > 0 ? ((totalRev - totalCOGS) / totalRev * 100) : 0

  const updateLine = (i, f, v) => setLines(prev => prev.map((l, xi) => xi === i ? { ...l, [f]: v } : l))
  const onProductSelect = (i, pid, fromInvoice = false) => {
    const p = products.find(x => x.id === pid)
    const dist = distributors.find(d => d.id === form.distributor_id)
    updateLine(i, 'product_id', pid)
    // Only auto-calculate price for manual orders, not imported invoices
    if (!fromInvoice) {
      let price = p?.msrp || ''
      if (form.channel === 'Wholesale' && dist && p?.msrp) price = (+p.msrp * (1 - +dist.discount_pct / 100)).toFixed(2)
      updateLine(i, 'unit_price', price)
    }
  }

  const syncShopify = async () => {
    setSyncing(true); setSyncResult(null)
    try {
      const resp = await fetch('/api/shopify-sync', { method: 'POST' })
      const data = await resp.json()
      setSyncResult(data)
      if (data.success) load()
    } catch(err) { setSyncResult({ error: err.message }) }
    setSyncing(false)
  }

  const importShopifyCSV = async (file) => {
    setParsing(true); setSyncResult(null)
    try {
      const name = file.name.toLowerCase()
      let csvContent = ''
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        // Convert xlsx to CSV using SheetJS
        const XLSX = (await import('xlsx')).default || (await import('xlsx'))
        const ab = await file.arrayBuffer()
        const wb = XLSX.read(new Uint8Array(ab), { type: 'array' })
        csvContent = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]])
      } else {
        csvContent = await file.text()
      }
      const resp = await fetch('/api/shopify-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvContent, products })
      })
      const data = await resp.json()
      if (data.error) { setSyncResult({ error: data.error }); return }
      setSyncResult(data)
      if (data.success) load()
    } catch(err) { setSyncResult({ error: err.message }) }
    finally { setParsing(false) }
  }

  const parseInvoice = async (file) => {
    setParsing(true)
    try {
      const readFile = (f) => new Promise((res, rej) => {
        const name = f.name.toLowerCase()
        if (name.endsWith('.csv')) {
          const r = new FileReader(); r.onload = () => res({ type: 'text', content: r.result }); r.onerror = rej; r.readAsText(f)
        } else {
          const r = new FileReader(); r.onload = () => res({ type: f.type.startsWith('image/') ? 'image' : 'pdf', content: r.result.split(',')[1], mediaType: f.type }); r.onerror = rej; r.readAsDataURL(f)
        }
      })
      const { type, content: fileContent, mediaType } = await readFile(file)
      const resp = await fetch('/api/parse-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, content: fileContent, mediaType, products, distributors }) })
      const data = await resp.json()
      if (data.error) { alert('Error: ' + data.error); return }
      const inv = data.invoice
      // Pre-fill form
      setForm(prev => ({
        ...prev,
        date: inv.date || prev.date,
        reference: inv.reference || '',
        channel: inv.channel || 'E-commerce',
        distributor_id: inv.distributor_id || '',
        payment_status: inv.payment_status || 'paid',
        buyer_name: inv.buyer_name || '',
        buyer_email: inv.buyer_email || '',
        buyer_address: inv.buyer_address || '',
        buyer_city: inv.buyer_city || '',
        buyer_state: inv.buyer_state || '',
        buyer_zip: inv.buyer_zip || '',
        shipping_cost: inv.shipping_cost || '',
        notes: inv.notes || '',
      }))
      if (inv.items?.length > 0) {
        setLines(inv.items.map(i => ({
          product_id: i.product_id || '',
          quantity: i.quantity || '',
          unit_price: i.unit_price || '',
          _name_found: i.product_name_found
        })))
      }
      setParsedInvoice(inv)
      setShowModal(true)
    } catch(err) { alert('Error: ' + err.message) }
    finally { setParsing(false) }
  }

  const totalAmount = lines.reduce((a, l) => a + +(l.quantity||0) * +(l.unit_price||0), 0)
  const cogs = lines.reduce((a, l) => { const p = products.find(x => x.id === l.product_id); return a + +(l.quantity||0) * +(p?.unit_cost||0) }, 0)

  const save = async () => {
    const validLines = lines.filter(l => l.product_id && l.quantity && l.unit_price)
    if (!form.date || validLines.length === 0) { alert('Fill date and at least one product'); return }
    setSaving(true)
    const items = validLines.map(l => { const p = products.find(x => x.id === l.product_id); return { product_id: l.product_id, quantity: +l.quantity, unit_price: +l.unit_price, unit_cost: +(p?.unit_cost||0) } })
    const resp = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: { ...form, source: parsedInvoice ? 'invoice' : 'manual' }, items }) })
    const data = await resp.json()
    setSaving(false)
    if (data.duplicate) {
      if (confirm('Duplicate detected. Save anyway?')) {
        const r2 = await fetch('/api/sales', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order: form, items, forceInsert: true }) })
        const d2 = await r2.json()
        if (d2.error) { alert('Error: ' + d2.error); setSaving(false); return }
      } else { setSaving(false); return }
    } else if (data.error) { alert('Error: ' + data.error); setSaving(false); return }
    setSaving(false)
    setShowModal(false)
    setParsedInvoice(null)
    setForm(EMPTY_ORDER)
    setLines([{ product_id: '', quantity: '', unit_price: '' }])
    load()
  }

  const del = async (id) => {
    if (!confirm('Delete this order?')) return
    await fetch('/api/sales?id=' + id, { method: 'DELETE' }); load()
  }

  const selectedDist = distributors.find(d => d.id === form.distributor_id)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Sales</h1><p>{filtered.length} orders · {usd(totalRev)} revenue</p></div>
        <div style={{display:'flex',gap:8}}>
          {['month','quarter','year','all'].map(p => (
            <button key={p} className={`btn ${period===p?'btn-primary':'btn-outline'} btn-sm`} onClick={() => setPeriod(p)}>{p.charAt(0).toUpperCase()+p.slice(1)}</button>
          ))}
          {isAdmin && <>
            <input type="file" ref={fileRef} style={{display:'none'}} accept="image/*,.pdf,.csv" onChange={e=>{
              const f=e.target.files[0]; if(!f) return
              const name=f.name.toLowerCase()
              // Shopify export CSVs have 'orders' in the name or we detect by columns
              if(name.includes('order') && name.endsWith('.csv')) importShopifyCSV(f)
              else parseInvoice(f)
            }} />
            <button className="btn btn-outline" onClick={syncShopify} disabled={syncing}>{syncing?'Syncing…':'↻ Sync Shopify'}</button>
            <button className="btn btn-outline" onClick={()=>fileRef.current.click()}>{parsing?'Reading…':'⬆ Upload invoice'}</button>
            <label style={{cursor:'pointer'}}>
              <input type="file" accept=".csv" style={{display:'none'}} onChange={e=>{const f=e.target.files[0];if(f)importShopifyCSV(f)}} />
              <span className="btn btn-outline" style={{display:'inline-flex',alignItems:'center'}}>{parsing?'Importing…':'📦 Import Shopify CSV'}</span>
            </label>
            <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ New order</button>
          </>}
        </div>
      </div>

      <div className="kpi-grid kpi-grid-4" style={{marginBottom:24}}>
        <div className="kpi"><div className="kpi-label">Total revenue</div><div className="kpi-value green" style={{fontSize:20}}>{usd(totalRev)}</div></div>
        <div className="kpi"><div className="kpi-label">E-commerce</div><div className="kpi-value" style={{fontSize:18}}>{usd(ecomRev)}<span style={{fontSize:12,color:'var(--text-3)',marginLeft:6}}>{totalRev>0?(ecomRev/totalRev*100).toFixed(0)+'%':''}</span></div></div>
        <div className="kpi"><div className="kpi-label">Wholesale</div><div className="kpi-value" style={{fontSize:18}}>{usd(wsRev)}<span style={{fontSize:12,color:'var(--text-3)',marginLeft:6}}>{totalRev>0?(wsRev/totalRev*100).toFixed(0)+'%':''}</span></div></div>
        <div className="kpi"><div className="kpi-label">Gross margin</div><div className={`kpi-value ${grossMargin>50?'green':grossMargin>30?'amber':'red'}`} style={{fontSize:20}}>{grossMargin.toFixed(1)}%</div></div>
      </div>

      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:16}}>
        <div className="tabs" style={{marginBottom:0,flex:1}}>
          {[['all','All'],['ecom','E-commerce'],['wholesale','Wholesale']].map(([v,l])=>(
            <button key={v} className={`tab${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
          ))}
        </div>
        <input className="search-input" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} style={{width:180}} />
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Reference</th><th>Customer / Distributor</th><th>Channel</th><th>Products</th><th className="td-right">Amount</th><th>Status</th>{isAdmin&&<th></th>}</tr></thead>
            <tbody>
              {filtered.length===0 ? <tr><td colSpan={isAdmin?8:7} style={{textAlign:'center',color:'var(--text-3)',padding:40}}>No orders in this period</td></tr> :
                filtered.map(o => (
                  <tr key={o.id}>
                    <td className="td-muted">{fdateShort(o.date)}</td>
                    <td style={{fontWeight:500}}>{o.reference || '—'}</td>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:8}}>
                        <div className="avatar" style={{width:24,height:24,fontSize:9}}>{initials(o.buyer_name||o.distributors?.name||'?')}</div>
                        <div>
                          <div style={{fontSize:13,fontWeight:500}}>{o.buyer_name||o.distributors?.name||'—'}</div>
                          {o.buyer_city && <div style={{fontSize:11,color:'var(--text-3)'}}>{o.buyer_city}, {o.buyer_state}</div>}
                        </div>
                      </div>
                    </td>
                    <td><span className={`badge ${o.channel==='E-commerce'?'badge-blue':'badge-green'}`}>{o.channel}</span></td>
                    <td className="td-muted" style={{fontSize:12}}>{(o.sale_items||[]).map(i=>i.inventory?.product_name+' ×'+i.quantity).join(', ')}</td>
                    <td className="td-right td-mono" style={{fontWeight:600}}>{usd(o.total_amount)}</td>
                    <td><span className={`badge ${o.payment_status==='paid'?'badge-green':'badge-amber'}`}>{o.payment_status}</span></td>
                    {isAdmin&&<td><button className="btn btn-danger btn-sm" onClick={()=>del(o.id)}>Delete</button></td>}
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div className="modal" style={{maxWidth:600}}>
            <div className="modal-header">
              <h2>{parsedInvoice ? '📄 Invoice imported — review & confirm' : 'New order'}</h2>
              <button className="modal-close" onClick={()=>{setShowModal(false);setParsedInvoice(null)}}>×</button>
            </div>
            {parsedInvoice && (
              <div style={{margin:'0 24px',padding:'10px 14px',background:'var(--blue-light)',borderRadius:8,fontSize:13,color:'var(--blue)'}}>
                Invoice detected: <strong>{parsedInvoice.reference || 'no ref'}</strong> · {parsedInvoice.buyer_name} · Review fields below and confirm.
              </div>
            )}
            <div className="modal-body">
              <div className="form-row form-row-3">
                <div className="form-group"><label className="form-label">Date *</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Channel</label><select value={form.channel} onChange={e=>setForm({...form,channel:e.target.value})}><option>E-commerce</option><option>Wholesale</option></select></div>
                <div className="form-group"><label className="form-label">Reference</label><input type="text" value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} placeholder="#2025" /></div>
              </div>
              {form.channel==='Wholesale' && (
                <div className="form-row form-row-2">
                  <div className="form-group"><label className="form-label">Distributor</label>
                    <select value={form.distributor_id} onChange={e=>setForm({...form,distributor_id:e.target.value})}>
                      <option value="">Select…</option>
                      {distributors.map(d=><option key={d.id} value={d.id}>{d.name} ({d.discount_pct}% disc.)</option>)}
                    </select>
                  </div>
                  <div className="form-group"><label className="form-label">Payment status</label><select value={form.payment_status} onChange={e=>setForm({...form,payment_status:e.target.value})}><option value="paid">Paid</option><option value="pending">Pending (creates AR)</option></select></div>
                </div>
              )}
              {form.channel==='E-commerce' && (
                <>
                  <div className="form-row form-row-2">
                    <div className="form-group"><label className="form-label">Customer name</label><input type="text" value={form.buyer_name} onChange={e=>setForm({...form,buyer_name:e.target.value})} /></div>
                    <div className="form-group"><label className="form-label">Email</label><input type="email" value={form.buyer_email} onChange={e=>setForm({...form,buyer_email:e.target.value})} /></div>
                  </div>
                  <div className="form-row form-row-3">
                    <div className="form-group"><label className="form-label">City</label><input type="text" value={form.buyer_city} onChange={e=>setForm({...form,buyer_city:e.target.value})} /></div>
                    <div className="form-group"><label className="form-label">State</label><input type="text" value={form.buyer_state} onChange={e=>setForm({...form,buyer_state:e.target.value})} maxLength={2} placeholder="KY" /></div>
                    <div className="form-group"><label className="form-label">Zip</label><input type="text" value={form.buyer_zip} onChange={e=>setForm({...form,buyer_zip:e.target.value})} /></div>
                  </div>
                </>
              )}
              <div style={{fontSize:11,fontWeight:500,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Products</div>
              {lines.map((l,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 80px 110px 28px',gap:8,marginBottom:8,alignItems:'end'}}>
                  <div>
                    <label className="form-label" style={{display:i===0?'block':'none'}}>Product</label>
                    <select value={l.product_id} onChange={e=>onProductSelect(i,e.target.value,!!parsedInvoice)}>
                      <option value="">{l._name_found ? `Match "${l._name_found}"…` : 'Select…'}</option>
                      {products.map(p=><option key={p.id} value={p.id}>{p.product_name} (stock: {p.quantity_on_hand})</option>)}
                    </select>
                    {l._name_found && !l.product_id && <div style={{fontSize:11,color:'var(--amber)',marginTop:3}}>⚠ Found on invoice: "{l._name_found}" — please match above</div>}
                  </div>
                  <div><label className="form-label" style={{display:i===0?'block':'none'}}>Qty</label><input type="number" value={l.quantity} onChange={e=>updateLine(i,'quantity',e.target.value)} /></div>
                  <div><label className="form-label" style={{display:i===0?'block':'none'}}>Unit price ($)</label><input type="number" value={l.unit_price} onChange={e=>updateLine(i,'unit_price',e.target.value)} /></div>
                  <div style={{paddingBottom:2}}><button onClick={()=>setLines(prev=>prev.filter((_,xi)=>xi!==i))} style={{background:'none',border:'none',color:'var(--text-3)',fontSize:18,cursor:'pointer'}}>×</button></div>
                </div>
              ))}
              <button className="btn btn-outline btn-sm" onClick={()=>setLines(p=>[...p,{product_id:'',quantity:'',unit_price:''}])}>+ Add product</button>
              {totalAmount > 0 && (
                <div style={{marginTop:12,padding:'10px 14px',background:'var(--bg-2)',borderRadius:'var(--radius)',display:'flex',gap:20}}>
                  <div><span style={{fontSize:12,color:'var(--text-3)'}}>Revenue </span><span style={{fontWeight:600,color:'var(--green)'}}>{usd(totalAmount)}</span></div>
                  <div><span style={{fontSize:12,color:'var(--text-3)'}}>COGS </span><span style={{fontWeight:600,color:'var(--amber)'}}>{usd(cogs)}</span></div>
                  <div><span style={{fontSize:12,color:'var(--text-3)'}}>Margin </span><span style={{fontWeight:600}}>{totalAmount>0?((totalAmount-cogs)/totalAmount*100).toFixed(1)+'%':'—'}</span></div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>{setShowModal(false);setParsedInvoice(null);setLines([{product_id:'',quantity:'',unit_price:''}])}}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':parsedInvoice?'Record sale':'Save sale'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
