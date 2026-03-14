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

export default function Income() {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [distributors, setDistributors] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeMsg, setAnalyzeMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [dupConfirm, setDupConfirm] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [dateRange, setDateRange] = useState({ from: null, to: null })
  const [filterStatus, setFilterStatus] = useState('all')
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    channel: 'E-commerce', distributor_id: '', reference: '', note: '',
    payment_status: 'paid', due_date: ''
  })
  const [items, setItems] = useState([{ product_id: '', quantity: '', unit_price: '' }])
  const inputRef = useRef()

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/sales').then(r => r.json()),
      fetch('/api/inventory').then(r => r.json()),
      fetch('/api/distributors').then(r => r.json()),
    ]).then(([o, p, d]) => {
      setOrders(Array.isArray(o) ? o : [])
      setProducts(Array.isArray(p) ? p : [])
      setDistributors(Array.isArray(d) ? d : [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const addItem = () => setItems([...items, { product_id: '', quantity: '', unit_price: '' }])
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (i, f, v) => setItems(items.map((it, idx) => idx === i ? { ...it, [f]: v } : it))

  const totalCA = items.reduce((a, i) => a + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0)), 0)
  const totalCogs = items.reduce((a, i) => {
    const prod = products.find(p => p.id === i.product_id)
    return a + ((parseFloat(i.quantity) || 0) * (parseFloat(prod?.unit_cost) || 0))
  }, 0)

  const doSave = async (forceInsert = false) => {
    if (!form.date || items.some(i => !i.product_id || !i.quantity || !i.unit_price)) {
      alert('Please fill all required fields'); return
    }
    setSaving(true)
    const enrichedItems = items.map(i => ({ ...i, unit_cost: products.find(p => p.id === i.product_id)?.unit_cost || 0 }))
    const resp = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: form, items: enrichedItems, forceInsert })
    })
    const data = await resp.json()
    setSaving(false)
    if (data.duplicate && !forceInsert) { setShowModal(false); setDupConfirm({ message: data.error }); return }
    if (data.error) { alert('Error: ' + data.error); return }
    setShowModal(false); setDupConfirm(null)
    setSuccessMsg('Sale recorded successfully ✓')
    setTimeout(() => setSuccessMsg(''), 4000)
    setForm({ date: new Date().toISOString().split('T')[0], channel: 'E-commerce', distributor_id: '', reference: '', note: '', payment_status: 'paid', due_date: '' })
    setItems([{ product_id: '', quantity: '', unit_price: '' }])
    load()
  }

  const markPaid = async (id) => {
    await fetch('/api/sales', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, payment_status: 'paid', paid_date: new Date().toISOString().split('T')[0] })
    })
    load()
  }

  const deleteOrder = async (id) => {
    if (!confirm('Cancel this sale? Stock will be restored.')) return
    await fetch('/api/sales?id=' + id, { method: 'DELETE' })
    load()
  }

  const analyzeFile = async (file) => {
    setAnalyzing(true); setAnalyzeMsg('Reading file…')
    try {
      const { type, content, mediaType } = await readFile(file)
      const productList = products.map(p => '{"id":"' + p.id + '","name":"' + p.product_name + '"}').join(', ')
      const distList = distributors.map(d => '{"id":"' + d.id + '","name":"' + d.name + '","channel":"' + d.channel + '"}').join(', ')
      setAnalyzeMsg('Claude is analyzing…')
      const systemOverride = 'You are an accounting assistant for Clique Beauty Skincare LLC. Analyze this customer invoice and return ONLY a JSON object: {"date":"YYYY-MM-DD","reference":"invoice number only","channel":"E-commerce|Wholesale USA|Wholesale International|Retail","distributor_id":"exact id or null","payment_status":"paid or pending","due_date":"YYYY-MM-DD or null","items":[{"product_id":"exact id or null","product_name_found":"name found","quantity":number,"unit_price":number}],"note":""}. Products: [' + productList + ']. Distributors: [' + distList + ']. Return ONLY the JSON.'
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content, mediaType, filename: file.name, systemOverride, mode: 'sale' })
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      const sale = data.sale
      setForm(f => ({ ...f, date: sale.date || f.date, reference: sale.reference || '', channel: sale.channel || 'E-commerce', distributor_id: sale.distributor_id || '', note: sale.note || '', payment_status: sale.payment_status || 'paid', due_date: sale.due_date || '' }))
      if (sale.items?.length > 0) setItems(sale.items.map(i => ({ product_id: i.product_id || '', quantity: i.quantity?.toString() || '', unit_price: i.unit_price?.toString() || '', _name_found: i.product_name_found })))
      setShowModal(true)
    } catch (err) { alert('Error: ' + err.message) }
    finally { setAnalyzing(false) }
  }

  const filteredOrders = filterByDate(orders, 'date', dateRange).filter(o => {
    if (filterStatus === 'all') return true
    return (o.payment_status || 'paid') === filterStatus
  })

  const totalEncaisse = filteredOrders.filter(o => (o.payment_status || 'paid') === 'paid').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const totalPending = filteredOrders.filter(o => (o.payment_status || 'paid') === 'pending').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Income</h1><p>Sales & payments received · {usd(totalEncaisse)} collected · {usd(totalPending)} pending</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={inputRef} type="file" accept="image/*,.pdf,.csv,.xlsx" style={{ display: 'none' }} onChange={e => e.target.files[0] && analyzeFile(e.target.files[0])} />
          <button onClick={() => !analyzing && inputRef.current.click()}>{analyzing ? '⏳ ' + analyzeMsg : '⬆ Upload invoice'}</button>
          <button className="primary" onClick={() => { setItems([{ product_id: '', quantity: '', unit_price: '' }]); setShowModal(true) }}>+ New sale</button>
        </div>
      </div>

      {successMsg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}
      <DateFilter onChange={setDateRange} />

      <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          ['Total collected', usd(totalEncaisse), 'var(--green)'],
          ['Pending payment', usd(totalPending), 'var(--amber)'],
          ['Orders', filteredOrders.length, 'var(--navy-mid)'],
          ['E-commerce', usd(filteredOrders.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)), '#6A1B9A'],
        ].map(([l, v, c]) => (
          <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
        ))}
      </div>

      {/* Status filter */}
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
            <thead><tr><th>Date</th><th>Reference</th><th>Channel</th><th>Distributor</th><th>Products</th><th>Payment</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
            <tbody>
              {filteredOrders.map(o => {
                const status = o.payment_status || 'paid'
                return (
                  <tr key={o.id}>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(o.date)}</td>
                    <td style={{ fontWeight: 500 }}>{o.reference || o.id.slice(0, 8)}</td>
                    <td><span className="pill" style={{ background: o.channel === 'E-commerce' ? '#E8EAF6' : 'var(--green-light)', color: o.channel === 'E-commerce' ? '#283593' : 'var(--green)' }}>{o.channel}</span></td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{o.distributors?.name || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.sale_items?.map(i => i.inventory?.product_name + ' ×' + i.quantity).join(', ')}</td>
                    <td>
                      <PaymentChip status={status} dueDate={o.due_date} />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: status === 'paid' ? 'var(--green)' : 'var(--amber)' }}>{usd(o.total_amount)}</td>
                    <td style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {status !== 'paid' && (
                        <button style={{ fontSize: 11, padding: '4px 10px', background: 'var(--green-light)', color: 'var(--green)', border: 'none', borderRadius: 6, cursor: 'pointer', whiteSpace: 'nowrap' }} onClick={() => markPaid(o.id)}>✓ Paid</button>
                      )}
                      <button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => deleteOrder(o.id)}>×</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {dupConfirm && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <h2 style={{ textAlign: 'center', marginBottom: 8 }}>Duplicate detected</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1.5rem' }}>{dupConfirm.message}</p>
            <p style={{ fontSize: 13, textAlign: 'center', marginBottom: '1.5rem' }}>Save anyway?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="primary" onClick={() => doSave(true)} disabled={saving} style={{ padding: '10px' }}>{saving ? 'Saving…' : 'Yes, save anyway'}</button>
              <button onClick={() => setDupConfirm(null)} style={{ padding: '10px' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <h2>New sale</h2>
            <div className="form-row">
              <div className="form-group"><label>Date *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label>Invoice reference</label><input type="text" placeholder="INV-001" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Channel *</label>
                <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                  {CHANNELS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Distributor</label>
                <select value={form.distributor_id} onChange={e => setForm({ ...form, distributor_id: e.target.value })}>
                  <option value="">— None / Direct —</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
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

            <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '1rem 0 8px' }}>Products sold</div>
            {items.map((item, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                {item._name_found && !item.product_id && <div style={{ fontSize: 11, color: 'var(--amber)', marginBottom: 4 }}>⚠ Product detected: "{item._name_found}" — select manually</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 32px', gap: 8, alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label>Product</label>}
                    <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}>
                      <option value="">— Select —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.product_name} (stock: {p.quantity_on_hand})</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>{i === 0 && <label>Quantity</label>}<input type="number" placeholder="0" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}>{i === 0 && <label>Unit price ($)</label>}<input type="number" placeholder="0.00" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} /></div>
                  <button onClick={() => removeItem(i)} style={{ padding: '8px', color: 'var(--red)', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', marginTop: i === 0 ? 20 : 0 }}>×</button>
                </div>
              </div>
            ))}
            <button onClick={addItem} style={{ fontSize: 12, marginBottom: '1rem' }}>+ Add product</button>

            {totalCA > 0 && (
              <div style={{ background: 'var(--green-light)', border: '1px solid rgba(42,107,74,0.15)', borderRadius: 8, padding: '1rem', marginBottom: '1rem', fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: 'var(--green)', marginBottom: 6 }}>Sale preview</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div><span style={{ color: 'var(--text-muted)' }}>Revenue: </span><strong style={{ color: 'var(--green)' }}>{usd(totalCA)}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>COGS: </span><strong style={{ color: 'var(--red)' }}>{usd(totalCogs)}</strong></div>
                  <div><span style={{ color: 'var(--text-muted)' }}>Margin: </span><strong style={{ color: totalCA - totalCogs >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(totalCA - totalCogs)} ({totalCA > 0 ? (((totalCA - totalCogs) / totalCA) * 100).toFixed(1) : 0}%)</strong></div>
                </div>
              </div>
            )}
            <div className="form-actions">
              <button className="primary" onClick={() => doSave(false)} disabled={saving}>{saving ? 'Saving…' : 'Save sale'}</button>
              <button onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
