import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import { usd, fdate } from '../lib/constants'
import * as XLSX from 'xlsx'
import DateFilter, { filterByDate } from '../components/DateFilter'

export async function getServerSideProps() { return { props: {} } }

const CHANNELS = ['E-commerce', 'Wholesale USA', 'Wholesale International', 'Retail']

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
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], channel: 'E-commerce', distributor_id: '', reference: '', note: '' })
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
      alert('Remplis tous les champs obligatoires'); return
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
    if (data.duplicate && !forceInsert) {
      setShowModal(false)
      setDupConfirm({ message: data.error })
      return
    }
    if (data.error) { alert('Erreur : ' + data.error); return }
    setShowModal(false)
    setDupConfirm(null)
    setSuccessMsg('Encaissement enregistré avec succès ✓')
    setTimeout(() => setSuccessMsg(''), 4000)
    setForm({ date: new Date().toISOString().split('T')[0], channel: 'E-commerce', distributor_id: '', reference: '', note: '' })
    setItems([{ product_id: '', quantity: '', unit_price: '' }])
    load()
  }

  const analyzeFile = async (file) => {
    setAnalyzing(true)
    setAnalyzeMsg('Lecture du fichier…')
    try {
      const { type, content, mediaType } = await readFile(file)
      const productList = products.map(p => '{"id":"' + p.id + '","name":"' + p.product_name + '"}').join(', ')
      const distList = distributors.map(d => '{"id":"' + d.id + '","name":"' + d.name + '","channel":"' + d.channel + '"}').join(', ')
      setAnalyzeMsg('Claude analyse la facture…')
      const systemOverride = 'Tu es un assistant comptable pour Clique Beauty Skincare LLC. Analyse cette facture CLIENT (encaissement). Retourne UNIQUEMENT un JSON : {"date":"YYYY-MM-DD","reference":"numéro facture","channel":"E-commerce|Wholesale USA|Wholesale International|Retail","distributor_id":"id ou null","items":[{"product_id":"id exact ou null","product_name_found":"nom","quantity":nombre,"unit_price":nombre}],"note":""}. Produits: [' + productList + ']. Distributeurs: [' + distList + '].'
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content, mediaType, filename: file.name, systemOverride, mode: 'sale' })
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      const sale = data.sale
      setForm(f => ({ ...f, date: sale.date || f.date, reference: sale.reference || '', channel: sale.channel || 'E-commerce', distributor_id: sale.distributor_id || '', note: sale.note || '' }))
      if (sale.items?.length > 0) setItems(sale.items.map(i => ({ product_id: i.product_id || '', quantity: i.quantity?.toString() || '', unit_price: i.unit_price?.toString() || '', _name_found: i.product_name_found })))
      setShowModal(true)
    } catch (err) { alert('Erreur : ' + err.message) }
    finally { setAnalyzing(false) }
  }

  const deleteOrder = async (id) => {
    if (!confirm('Annuler cet encaissement ? Le stock sera restauré.')) return
    await fetch('/api/sales?id=' + id, { method: 'DELETE' })
    load()
  }

  const filteredOrders = filterByDate(orders, 'date', dateRange)
  const totalEncaisse = filteredOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Encaissements</h1><p>Ventes & paiements reçus · CA total {usd(totalEncaisse)}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={inputRef} type="file" accept="image/*,.pdf,.csv,.xlsx" style={{ display: 'none' }} onChange={e => e.target.files[0] && analyzeFile(e.target.files[0])} />
          <button onClick={() => !analyzing && inputRef.current.click()} style={{ position: 'relative' }}>
            {analyzing ? '⏳ ' + analyzeMsg : '⬆ Analyser une facture'}
          </button>
          <button className="primary" onClick={() => { setItems([{ product_id: '', quantity: '', unit_price: '' }]); setShowModal(true) }}>+ Saisir manuellement</button>
        </div>
      </div>

      {successMsg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}

      <DateFilter onChange={setDateRange} />
      <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          ['CA Total', usd(totalEncaisse), '#2E7D32'],
          ['Nb commandes', filteredOrders.length, '#1565C0'],
          ['E-commerce', usd(orders.filter(o => o.channel === 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)), '#6A1B9A'],
          ['Wholesale', usd(orders.filter(o => o.channel !== 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)), '#E65100'],
        ].map(([l, v, c]) => (
          <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div className="loading">Chargement…</div> : filteredOrders.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36 }}>💚</div>
            <p>Aucun encaissement enregistré</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Upload une facture client ou saisis manuellement</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Référence</th><th>Canal</th><th>Distributeur</th><th>Produits</th><th style={{ textAlign: 'right' }}>Montant</th><th></th></tr></thead>
            <tbody>
              {filteredOrders.map(o => (
                <tr key={o.id}>
                  <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(o.date)}</td>
                  <td style={{ fontWeight: 500 }}>{o.reference || o.id.slice(0, 8)}</td>
                  <td><span className="pill" style={{ background: o.channel === 'E-commerce' ? '#E8EAF6' : '#E8F5E9', color: o.channel === 'E-commerce' ? '#283593' : '#2E7D32' }}>{o.channel}</span></td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{o.distributors?.name || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.sale_items?.map(i => i.inventory?.product_name + ' ×' + i.quantity).join(', ')}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#2E7D32' }}>{usd(o.total_amount)}</td>
                  <td><button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => deleteOrder(o.id)}>Annuler</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dupConfirm && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 460 }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <h2 style={{ textAlign: 'center', marginBottom: 8 }}>Doublon détecté</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1.5rem' }}>{dupConfirm.message}</p>
            <p style={{ fontSize: 13, textAlign: 'center', marginBottom: '1.5rem' }}>Veux-tu enregistrer quand même ?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="primary" onClick={() => doSave(true)} disabled={saving} style={{ padding: '10px' }}>{saving ? 'Enregistrement…' : 'Oui, enregistrer quand même'}</button>
              <button onClick={() => setDupConfirm(null)} style={{ padding: '10px' }}>Non, annuler</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <h2>Nouvel encaissement</h2>
            <div className="form-row">
              <div className="form-group"><label>Date *</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label>Référence / N° facture</label><input type="text" placeholder="INV-001" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Canal *</label>
                <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                  {CHANNELS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group"><label>Distributeur</label>
                <select value={form.distributor_id} onChange={e => setForm({ ...form, distributor_id: e.target.value })}>
                  <option value="">— Aucun / Direct —</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '1rem 0 8px' }}>Produits vendus</div>
            {items.map((item, i) => (
              <div key={i} style={{ marginBottom: 10 }}>
                {item._name_found && !item.product_id && <div style={{ fontSize: 11, color: '#E65100', marginBottom: 4 }}>⚠ Produit détecté : "{item._name_found}" — sélectionne-le manuellement</div>}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 32px', gap: 8, alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label>Produit</label>}
                    <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}>
                      <option value="">— Choisir —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.product_name} (stock: {p.quantity_on_hand})</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>{i === 0 && <label>Quantité</label>}<input type="number" placeholder="0" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}>{i === 0 && <label>Prix unitaire ($)</label>}<input type="number" placeholder="0.00" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} /></div>
                  <button onClick={() => removeItem(i)} style={{ padding: '8px', color: '#C62828', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', marginTop: i === 0 ? 20 : 0 }}>×</button>
                </div>
              </div>
            ))}
            <button onClick={addItem} style={{ fontSize: 12, marginBottom: '1rem' }}>+ Ajouter un produit</button>
            {totalCA > 0 && (
              <div style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: 8, padding: '1rem', marginBottom: '1rem', fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: '#2E7D32', marginBottom: 6 }}>Aperçu</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div><span style={{ color: '#546E7A' }}>CA :</span> <strong style={{ color: '#2E7D32' }}>{usd(totalCA)}</strong></div>
                  <div><span style={{ color: '#546E7A' }}>Coût :</span> <strong style={{ color: '#C62828' }}>{usd(totalCogs)}</strong></div>
                  <div><span style={{ color: '#546E7A' }}>Marge :</span> <strong style={{ color: totalCA - totalCogs >= 0 ? '#2E7D32' : '#C62828' }}>{usd(totalCA - totalCogs)} ({totalCA > 0 ? (((totalCA - totalCogs) / totalCA) * 100).toFixed(1) : 0}%)</strong></div>
                </div>
              </div>
            )}
            <div className="form-actions">
              <button className="primary" onClick={() => doSave(false)} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button onClick={() => setShowModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
