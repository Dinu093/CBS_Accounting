import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import { usd, fdate } from '../lib/constants'
import DateFilter, { filterByDate } from '../components/DateFilter'
import * as XLSX from 'xlsx'

export async function getServerSideProps() { return { props: {} } }

const CHANNELS = ['E-commerce', 'Wholesale USA', 'Wholesale International', 'Retail']

function PaymentChip({ status, dueDate }) {
  if (status === 'paid') return <span className="pill" style={{ background: 'var(--green-light)', color: 'var(--green)' }}>Paid</span>
  if (!dueDate) return <span className="pill" style={{ background: 'var(--amber-light)', color: 'var(--amber)' }}>Pending</span>
  const days = Math.ceil((new Date(dueDate) - new Date()) / 86400000)
  if (days < 0) return <span className="pill" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>Overdue {Math.abs(days)}d</span>
  if (days <= 7) return <span className="pill" style={{ background: 'var(--amber-light)', color: 'var(--amber)' }}>Due in {days}d</span>
  return <span className="pill" style={{ background: 'var(--blue-light)', color: 'var(--navy-mid)' }}>Due in {days}d</span>
}

async function readFileAsText(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result)
    r.onerror = rej
    r.readAsText(file)
  })
}

async function readFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const ab = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array' })
    return { type: 'spreadsheet', content: XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]) }
  }
  const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
  return { type: file.type.startsWith('image/') ? 'image' : 'pdf', content: b64, mediaType: file.type }
}

const EMPTY_FORM = {
  date: new Date().toISOString().split('T')[0],
  channel: 'E-commerce', distributor_id: '', location_id: '', reference: '', note: '',
  payment_status: 'paid', due_date: '',
  buyer_name: '', buyer_email: '', buyer_phone: '',
  buyer_address: '', buyer_city: '', buyer_state: '', buyer_zip: '',
  shipping_cost: '', shipping_charged: false
}

export default function Income() {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [distributors, setDistributors] = useState([])
  const [locations, setLocations] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeMsg, setAnalyzeMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showShopify, setShowShopify] = useState(false)
  const [shopifyOrders, setShopifyOrders] = useState([])
  const [shopifyLoading, setShopifyLoading] = useState(false)
  const [shopifySaving, setShopifySaving] = useState(false)
  const [dupConfirm, setDupConfirm] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [dateRange, setDateRange] = useState({ from: null, to: null })
  const [filterStatus, setFilterStatus] = useState('all')
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [items, setItems] = useState([{ product_id: '', quantity: '', unit_price: '' }])
  const inputRef = useRef()
  const shopifyRef = useRef()

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/sales').then(r => r.json()),
      fetch('/api/inventory').then(r => r.json()),
      fetch('/api/distributors').then(r => r.json()),
      fetch('/api/locations').then(r => r.json()),
    ]).then(([o, p, d, l]) => {
      setOrders(Array.isArray(o) ? o : [])
      setProducts(Array.isArray(p) ? p : [])
      setDistributors(Array.isArray(d) ? d : [])
      setLocations(Array.isArray(l) ? l : [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const distLocations = locations.filter(l => l.distributor_id === form.distributor_id)

  // Auto-fill buyer info from location
  const handleLocationChange = (locationId) => {
    const loc = locations.find(l => l.id === locationId)
    if (loc) {
      setForm(f => ({
        ...f, location_id: locationId,
        buyer_name: loc.contact_name || f.buyer_name,
        buyer_email: loc.email || f.buyer_email,
        buyer_phone: loc.phone || f.buyer_phone,
        buyer_address: loc.address || f.buyer_address,
        buyer_city: loc.city || f.buyer_city,
        buyer_state: loc.state || f.buyer_state,
        buyer_zip: loc.zip || f.buyer_zip,
      }))
    } else {
      setForm(f => ({ ...f, location_id: locationId }))
    }
  }

  const addItem = () => setItems([...items, { product_id: '', quantity: '', unit_price: '' }])
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (i, f, v) => setItems(items.map((it, idx) => idx === i ? { ...it, [f]: v } : it))

  const totalCA = items.reduce((a, i) => a + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0)), 0)
  const totalCogs = items.reduce((a, i) => {
    const prod = products.find(p => p.id === i.product_id)
    return a + ((parseFloat(i.quantity) || 0) * (parseFloat(prod?.unit_cost) || 0))
  }, 0)
  const shipping = parseFloat(form.shipping_cost) || 0
  const margin = totalCA - totalCogs - (form.shipping_charged ? shipping : 0)

  const doSave = async (forceInsert = false, customForm = null, customItems = null) => {
    const f = customForm || form
    const it = customItems || items
    // Soft validation — filter out incomplete lines but don't block
    setSaving(true)
    const validItems = it.filter(i => i.product_id && i.quantity && i.unit_price)
    if (!f.date) { alert('Please select a date'); return false }
    const enrichedItems = validItems.map(i => ({ ...i, unit_cost: products.find(p => p.id === i.product_id)?.unit_cost || 0 }))
    const resp = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: f, items: enrichedItems, forceInsert })
    })
    const data = await resp.json()
    setSaving(false)
    if (data.duplicate && !forceInsert) { setShowModal(false); setDupConfirm({ message: data.error, form: f, items: it }); return false }
    if (data.error) { alert('Error: ' + data.error); return false }
    return true
  }

  const handleSave = async (forceInsert = false) => {
    const ok = await doSave(forceInsert)
    if (!ok) return
    setShowModal(false); setDupConfirm(null)
    setSuccessMsg('Sale recorded ✓')
    setTimeout(() => setSuccessMsg(''), 4000)
    setForm(EMPTY_FORM); setItems([{ product_id: '', quantity: '', unit_price: '' }])
    load()
  }

  const markPaid = async (id) => {
    await fetch('/api/sales', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, payment_status: 'paid', paid_date: new Date().toISOString().split('T')[0] }) })
    load()
  }

  const deleteOrder = async (id) => {
    if (!confirm('Cancel this sale? Stock will be restored.')) return
    await fetch('/api/sales?id=' + id, { method: 'DELETE' }); load()
  }

  const analyzeFile = async (file) => {
    setAnalyzing(true); setAnalyzeMsg('Reading file…')
    try {
      const { type, content, mediaType } = await readFile(file)
      const productList = products.map(p => '{"id":"' + p.id + '","name":"' + p.product_name + '"}').join(', ')
      const distList = distributors.map(d => '{"id":"' + d.id + '","name":"' + d.name + '","channel":"' + d.channel + '"}').join(', ')
      setAnalyzeMsg('Claude is analyzing…')
      const systemOverride = 'You are an accounting assistant for Clique Beauty Skincare LLC. Analyze this customer invoice. Return ONLY a JSON: {"date":"YYYY-MM-DD","reference":"invoice number","channel":"E-commerce|Wholesale USA|Wholesale International|Retail","distributor_id":"exact id or null","payment_status":"paid or pending","due_date":"YYYY-MM-DD or null","buyer_name":"","buyer_email":"","buyer_phone":"","buyer_address":"","buyer_city":"","buyer_state":"","buyer_zip":"","shipping_cost":0,"shipping_charged":false,"items":[{"product_id":"exact id or null","product_name_found":"name","quantity":number,"unit_price":number}],"note":""}. Products: [' + productList + ']. Distributors: [' + distList + ']. Return ONLY the JSON.'
      const resp = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type, content, mediaType, filename: file.name, systemOverride, mode: 'sale' }) })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      const sale = data.sale
      setForm(f => ({ ...EMPTY_FORM, ...f, date: sale.date || f.date, reference: sale.reference || '', channel: sale.channel || 'E-commerce', distributor_id: sale.distributor_id || '', note: sale.note || '', payment_status: sale.payment_status || 'paid', due_date: sale.due_date || '', buyer_name: sale.buyer_name || '', buyer_email: sale.buyer_email || '', buyer_address: sale.buyer_address || '', buyer_city: sale.buyer_city || '', buyer_state: sale.buyer_state || '', buyer_zip: sale.buyer_zip || '', shipping_cost: sale.shipping_cost || '', shipping_charged: sale.shipping_charged || false }))
      if (sale.items?.length > 0) setItems(sale.items.map(i => ({ product_id: i.product_id || '', quantity: i.quantity?.toString() || '', unit_price: i.unit_price?.toString() || '', _name_found: i.product_name_found })))
      setShowModal(true)
    } catch (err) { alert('Error: ' + err.message) }
    finally { setAnalyzing(false) }
  }

  // Shopify import
  const handleShopifyFile = async (file) => {
    setShopifyLoading(true)
    try {
      const csvContent = await readFileAsText(file)
      const resp = await fetch('/api/shopify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csvContent, products }) })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      setShopifyOrders(data.orders.map((o, i) => ({ ...o, _sid: Date.now() + i, selected: true })))
    } catch (err) { alert('Error parsing Shopify file: ' + err.message) }
    finally { setShopifyLoading(false) }
  }

  const importShopifyOrders = async () => {
    const selected = shopifyOrders.filter(o => o.selected)
    setShopifySaving(true)
    let saved = 0
    let shippingExpenses = 0

    for (const order of selected) {
      // Revenue = subtotal (products only), NOT shipping
      const orderForm = {
        date: order.date, channel: 'E-commerce', reference: order.order_id,
        payment_status: order.payment_status || 'paid',
        buyer_name: order.buyer_name, buyer_email: order.buyer_email,
        buyer_phone: order.buyer_phone || '',
        buyer_address: order.buyer_address, buyer_city: order.buyer_city,
        buyer_state: order.buyer_state, buyer_zip: order.buyer_zip,
        shipping_cost: parseFloat(order.shipping_cost) || 0,
        shipping_charged: true,
        note: 'Shopify import'
      }
      const orderItems = (order.items || []).filter(i => i.product_id && i.quantity && i.unit_price)
      if (orderItems.length === 0) continue
      const enrichedItems = orderItems.map(i => ({ ...i, unit_cost: products.find(p => p.id === i.product_id)?.unit_cost || 0 }))

      // Override total_amount to be subtotal only (exclude shipping)
      const resp = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order: { ...orderForm, _subtotal_only: true }, items: enrichedItems, forceInsert: false })
      })
      const data = await resp.json()
      if (!data.duplicate && !data.error) {
        saved++
        // Record shipping as outbound shipping expense (only if Clique Beauty paid = order >= $90)
        if (order.shipping_charged && parseFloat(order.shipping_cost) > 0) {
          await fetch('/api/transactions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              transactions: [{
                date: order.date,
                description: 'Shipping — ' + order.order_id + ' (' + (order.buyer_name || '') + ')',
                category: 'Shipping (outbound)',
                type: 'cogs',
                amount: parseFloat(order.shipping_cost),
                note: order.order_id
              }],
              forceInsert: true
            })
          })
          shippingExpenses++
        }
      }
    }
    setShopifySaving(false)
    setShowShopify(false)
    setShopifyOrders([])
    setSuccessMsg(saved + ' orders imported · ' + shippingExpenses + ' shipping expense(s) recorded ✓')
    setTimeout(() => setSuccessMsg(''), 5000)
    load()
  }

  const filteredOrders = filterByDate(orders, 'date', dateRange).filter(o => filterStatus === 'all' || (o.payment_status || 'paid') === filterStatus)
  const totalCollected = filteredOrders.filter(o => (o.payment_status || 'paid') === 'paid').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const totalPending = filteredOrders.filter(o => (o.payment_status || 'paid') === 'pending').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Income</h1><p>Sales & payments · {usd(totalCollected)} collected · {usd(totalPending)} pending</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={inputRef} type="file" accept="image/*,.pdf,.csv,.xlsx" style={{ display: 'none' }} onChange={e => e.target.files[0] && analyzeFile(e.target.files[0])} />
          <input ref={shopifyRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { e.target.files[0] && handleShopifyFile(e.target.files[0]); setShowShopify(true) }} />
          <button onClick={() => shopifyRef.current.click()}>⬆ Shopify import</button>
          <button onClick={() => !analyzing && inputRef.current.click()}>{analyzing ? '⏳ ' + analyzeMsg : '⬆ Upload invoice'}</button>
          <button className="primary" onClick={() => { setForm(EMPTY_FORM); setItems([{ product_id: '', quantity: '', unit_price: '' }]); setShowModal(true) }}>+ New sale</button>
        </div>
      </div>

      {successMsg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}
      <DateFilter onChange={setDateRange} />

      <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
        {[['Collected', usd(totalCollected), 'var(--green)'], ['Pending', usd(totalPending), 'var(--amber)'], ['Orders', filteredOrders.length, 'var(--navy-mid)'], ['E-commerce', usd(filteredOrders.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)), '#6A1B9A']].map(([l, v, c]) => (
          <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
        {[['all', 'All'], ['paid', 'Paid'], ['pending', 'Pending']].map(([v, l]) => (
          <button key={v} onClick={() => setFilterStatus(v)} style={{ fontSize: 12, padding: '5px 14px', borderRadius: 20, background: filterStatus === v ? 'var(--navy)' : 'var(--white)', color: filterStatus === v ? 'white' : 'var(--text-muted)', borderColor: filterStatus === v ? 'var(--navy)' : 'var(--border)' }}>{l}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div className="loading">Loading…</div> : filteredOrders.length === 0 ? (
          <div className="empty-state"><div style={{ fontSize: 36 }}>💚</div><p>No sales recorded</p></div>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Reference</th><th>Channel</th><th>Buyer</th><th>Products</th><th>Payment</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
            <tbody>
              {filteredOrders.map(o => {
                const status = o.payment_status || 'paid'
                const isExpanded = expandedOrder === o.id
                return [
                  <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => setExpandedOrder(isExpanded ? null : o.id)}>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(o.date)}</td>
                    <td style={{ fontWeight: 500 }}>{o.reference || o.id.slice(0, 8)}</td>
                    <td><span className="pill" style={{ background: o.channel === 'E-commerce' ? '#E8EAF6' : 'var(--green-light)', color: o.channel === 'E-commerce' ? '#283593' : 'var(--green)' }}>{o.channel}</span></td>
                    <td style={{ fontSize: 12 }}>
                      {o.buyer_name ? <div style={{ fontWeight: 500 }}>{o.buyer_name}</div> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                      {o.buyer_city && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{o.buyer_city}{o.buyer_state ? ', ' + o.buyer_state : ''}</div>}
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.sale_items?.map(i => i.inventory?.product_name + ' ×' + i.quantity).join(', ')}</td>
                    <td><PaymentChip status={status} dueDate={o.due_date} /></td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: status === 'paid' ? 'var(--green)' : 'var(--amber)' }}>
                      {usd(o.total_amount)}
                      {o.shipping_charged && o.shipping_cost > 0 && <div style={{ fontSize: 10, color: 'var(--red)', fontWeight: 400 }}>+{usd(o.shipping_cost)} shipping</div>}
                    </td>
                    <td style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {status !== 'paid' && <button style={{ fontSize: 11, padding: '4px 10px', background: 'var(--green-light)', color: 'var(--green)', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={e => { e.stopPropagation(); markPaid(o.id) }}>✓ Paid</button>}
                      <button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={e => { e.stopPropagation(); deleteOrder(o.id) }}>×</button>
                    </td>
                  </tr>,
                  isExpanded && (
                    <tr key={o.id + '_exp'}>
                      <td colSpan={8} style={{ background: 'var(--cream)', padding: '12px 16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
                          {o.buyer_name && <div><div style={{ color: 'var(--text-muted)', marginBottom: 3 }}>Contact</div><div>{o.buyer_name}{o.buyer_email ? ' · ' + o.buyer_email : ''}{o.buyer_phone ? ' · ' + o.buyer_phone : ''}</div></div>}
                          {o.buyer_address && <div><div style={{ color: 'var(--text-muted)', marginBottom: 3 }}>Ship to</div><div>{o.buyer_address}, {o.buyer_city} {o.buyer_state} {o.buyer_zip}</div></div>}
                          {o.shipping_charged && <div><div style={{ color: 'var(--text-muted)', marginBottom: 3 }}>Shipping (your cost)</div><div style={{ color: 'var(--red)', fontWeight: 500 }}>{usd(o.shipping_cost)}</div></div>}
                          {o.note && <div><div style={{ color: 'var(--text-muted)', marginBottom: 3 }}>Note</div><div>{o.note}</div></div>}
                        </div>
                      </td>
                    </tr>
                  )
                ]
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Shopify import modal */}
      {showShopify && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowShopify(false)}>
          <div className="modal" style={{ maxWidth: 800 }}>
            <h2>Shopify Orders Import</h2>
            {shopifyLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>⏳ Claude is parsing your orders…</div>
            ) : shopifyOrders.length === 0 ? (
              <div>
                <input ref={shopifyRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => e.target.files[0] && handleShopifyFile(e.target.files[0])} />
                <div className="drop-zone" onClick={() => shopifyRef.current.click()}>
                  <div style={{ fontSize: 32, marginBottom: 10 }}>📦</div>
                  <p style={{ fontWeight: 600 }}>Upload Shopify orders CSV</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>Export from Shopify: Orders → Export → All orders</p>
                </div>
                <div className="form-actions"><button onClick={() => setShowShopify(false)}>Cancel</button></div>
              </div>
            ) : (
              <div>
                <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                  {shopifyOrders.length} orders detected · {shopifyOrders.filter(o => o.selected).length} selected · Orders where you paid shipping are flagged
                </div>
                <div style={{ maxHeight: 400, overflow: 'auto', marginBottom: '1rem' }}>
                  <table>
                    <thead><tr><th style={{ width: 32 }}></th><th>Order</th><th>Date</th><th>Buyer</th><th>Products</th><th>Shipping</th><th style={{ textAlign: 'right' }}>Total</th></tr></thead>
                    <tbody>
                      {shopifyOrders.map((o, i) => (
                        <tr key={i}>
                          <td><input type="checkbox" checked={o.selected} onChange={() => setShopifyOrders(prev => prev.map((x, xi) => xi === i ? { ...x, selected: !x.selected } : x))} /></td>
                          <td style={{ fontWeight: 500, fontSize: 12 }}>{o.order_id}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.date}</td>
                          <td style={{ fontSize: 12 }}>{o.buyer_name}<br/><span style={{ color: 'var(--text-muted)' }}>{o.buyer_city}{o.buyer_state ? ', ' + o.buyer_state : ''}</span></td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{o.items?.map(it => (it.product_name_found || it.product_id) + ' ×' + it.quantity).join(', ')}</td>
                          <td style={{ fontSize: 12 }}>
                            {parseFloat(o.shipping_cost) > 0
                              ? <span style={{ color: 'var(--red)', fontWeight: 500 }}>−{usd(o.shipping_cost)}</span>
                              : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600, fontSize: 13, color: 'var(--green)' }}>{usd(o.subtotal || o.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="form-actions">
                  <button className="primary" onClick={importShopifyOrders} disabled={shopifySaving}>{shopifySaving ? 'Importing…' : 'Import ' + shopifyOrders.filter(o => o.selected).length + ' orders'}</button>
                  <button onClick={() => { setShowShopify(false); setShopifyOrders([]) }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Duplicate confirmation */}
      {dupConfirm && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <h2 style={{ textAlign: 'center', marginBottom: 8 }}>Duplicate detected</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1.5rem' }}>{dupConfirm.message}</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="primary" onClick={async () => { const ok = await doSave(true, dupConfirm.form, dupConfirm.items); if(ok){setDupConfirm(null);setSuccessMsg('Sale recorded ✓');setTimeout(()=>setSuccessMsg(''),4000);setForm(EMPTY_FORM);setItems([{product_id:'',quantity:'',unit_price:''}]);load()} }} disabled={saving} style={{ padding: '10px' }}>{saving ? 'Saving…' : 'Yes, save anyway'}</button>
              <button onClick={() => setDupConfirm(null)} style={{ padding: '10px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sale modal */}
      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <h2>New sale</h2>

            {/* Basic info */}
            <div className="form-row">
              <div className="form-group"><label>Date *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label>Invoice reference</label><input type="text" placeholder="INV-001" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Channel *</label>
                <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value, distributor_id: '', location_id: '' })}>
                  {CHANNELS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              {(form.channel === 'Wholesale USA' || form.channel === 'Wholesale International') && (
                <div className="form-group"><label>Distributor</label>
                  <select value={form.distributor_id} onChange={e => setForm(f => ({ ...f, distributor_id: e.target.value, location_id: '' }))}>
                    <option value="">— Select —</option>
                    {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* Location picker for wholesale */}
            {form.distributor_id && distLocations.length > 0 && (
              <div className="form-group">
                <label>Location / Store</label>
                <select value={form.location_id} onChange={e => handleLocationChange(e.target.value)}>
                  <option value="">— Select a location —</option>
                  {distLocations.map(l => <option key={l.id} value={l.id}>{l.name}{l.is_primary ? ' (primary)' : ''}</option>)}
                </select>
              </div>
            )}

            {/* Payment */}
            <div className="form-row">
              <div className="form-group"><label>Payment status</label>
                <select value={form.payment_status} onChange={e => setForm({ ...form, payment_status: e.target.value })}>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending / Net terms</option>
                </select>
              </div>
              {form.payment_status === 'pending' && (
                <div className="form-group"><label>Due date</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} /></div>
              )}
            </div>

            {/* Buyer info */}
            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '1rem 0 8px', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>Buyer information</div>
            <div className="form-row">
              <div className="form-group"><label>Contact name</label><input type="text" placeholder="John Smith" value={form.buyer_name} onChange={e => setForm({ ...form, buyer_name: e.target.value })} /></div>
              <div className="form-group"><label>Email</label><input type="email" placeholder="john@example.com" value={form.buyer_email} onChange={e => setForm({ ...form, buyer_email: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Phone</label><input type="text" placeholder="+1 555 000 0000" value={form.buyer_phone} onChange={e => setForm({ ...form, buyer_phone: e.target.value })} /></div>
              <div className="form-group"><label>Street address</label><input type="text" placeholder="123 Main St" value={form.buyer_address} onChange={e => setForm({ ...form, buyer_address: e.target.value })} /></div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div className="form-group" style={{ marginBottom: 0 }}><label>City</label><input type="text" placeholder="Los Angeles" value={form.buyer_city} onChange={e => setForm({ ...form, buyer_city: e.target.value })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>State</label><input type="text" placeholder="CA" maxLength={2} value={form.buyer_state} onChange={e => setForm({ ...form, buyer_state: e.target.value.toUpperCase() })} /></div>
              <div className="form-group" style={{ marginBottom: 0 }}><label>ZIP</label><input type="text" placeholder="90001" value={form.buyer_zip} onChange={e => setForm({ ...form, buyer_zip: e.target.value })} /></div>
            </div>

            {/* Shipping */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 12px', background: 'var(--cream)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <input type="checkbox" id="ship-chk" checked={form.shipping_charged} onChange={e => setForm({ ...form, shipping_charged: e.target.checked })} style={{ width: 'auto' }} />
              <label htmlFor="ship-chk" style={{ fontSize: 13, cursor: 'pointer', marginBottom: 0, textTransform: 'none', letterSpacing: 0 }}>Shipping at your cost (free shipping offered)</label>
              {form.shipping_charged && (
                <input type="number" placeholder="8.99" value={form.shipping_cost} onChange={e => setForm({ ...form, shipping_cost: e.target.value })} style={{ width: 90, marginLeft: 'auto' }} />
              )}
            </div>

            {/* Products */}
            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '1rem 0 8px', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>Products sold</div>
            {items.map((item, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                {item._name_found && !item.product_id && <div style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 4 }}>⚠ Detected: "{item._name_found}" — select manually</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 32px', gap: 8, alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label>Product</label>}
                    <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}>
                      <option value="">— Select —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.product_name} (stock: {p.quantity_on_hand})</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>{i === 0 && <label>Qty</label>}<input type="number" placeholder="0" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}>{i === 0 && <label>Unit price ($)</label>}<input type="number" placeholder="0.00" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} /></div>
                  <button onClick={() => removeItem(i)} style={{ padding: '8px', color: 'var(--red)', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', marginTop: i === 0 ? 20 : 0 }}>×</button>
                </div>
              </div>
            ))}
            <button onClick={addItem} style={{ fontSize: 12, marginBottom: '1rem' }}>+ Add product</button>

            {totalCA > 0 && (
              <div style={{ background: 'var(--green-light)', border: '1px solid rgba(42,107,74,0.15)', borderRadius: 8, padding: '1rem', marginBottom: '1rem', fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: 'var(--green)', marginBottom: 6 }}>Sale preview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Revenue: </span><strong style={{ color: 'var(--green)' }}>{usd(totalCA)}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>COGS: </span><strong style={{ color: 'var(--red)' }}>{usd(totalCogs)}</strong></div>
                  {form.shipping_charged && <div><span style={{ color: 'var(--text-muted)' }}>Shipping: </span><strong style={{ color: 'var(--red)' }}>{usd(shipping)}</strong></div>}
                  <div><span style={{ color: 'var(--text-muted)' }}>Margin: </span><strong style={{ color: margin >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(margin)} ({totalCA > 0 ? ((margin / totalCA) * 100).toFixed(1) : 0}%)</strong></div>
                </div>
              </div>
            )}

            <div className="form-actions">
              <button className="primary" onClick={() => handleSave(false)} disabled={saving}>{saving ? 'Saving…' : 'Save sale'}</button>
              <button onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
