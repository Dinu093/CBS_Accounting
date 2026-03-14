import { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import { usd, fdate } from '../lib/constants'
import * as XLSX from 'xlsx'

const CHANNELS = ['E-commerce', 'Wholesale USA', 'Wholesale International', 'Retail']

export default function Sales() {
  const [orders, setOrders] = useState([])
  const [products, setProducts] = useState([])
  const [distributors, setDistributors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
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

  const totalRevenue = items.reduce((a, i) => a + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unit_price) || 0)), 0)
  const totalCogs = items.reduce((a, i) => {
    const prod = products.find(p => p.id === i.product_id)
    return a + ((parseFloat(i.quantity) || 0) * (parseFloat(prod?.unit_cost) || 0))
  }, 0)

  const save = async () => {
    if (!form.date || items.some(i => !i.product_id || !i.quantity || !i.unit_price)) return
    setSaving(true)
    const enrichedItems = items.map(i => {
      const prod = products.find(p => p.id === i.product_id)
      return { ...i, unit_cost: prod?.unit_cost || 0 }
    })
    const resp = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order: form, items: enrichedItems })
    })
    const data = await resp.json()
    setSaving(false)
    if (data.error) { alert('Erreur : ' + data.error); return }
    setShowModal(false)
    setForm({ date: new Date().toISOString().split('T')[0], channel: 'E-commerce', distributor_id: '', reference: '', note: '' })
    setItems([{ product_id: '', quantity: '', unit_price: '' }])
    load()
  }

  const deleteOrder = async (id) => {
    if (!confirm('Annuler cette vente ? Le stock sera restauré.')) return
    await fetch(`/api/sales?id=${id}`, { method: 'DELETE' })
    load()
  }

  const analyzeFile = async (file) => {
    setAnalyzing(true)
    let content, type
    if (file.name.endsWith('.csv') || file.name.endsWith('.xlsx')) {
      const reader = new FileReader()
      content = await new Promise((res, rej) => {
        reader.onload = (e) => {
          const data = new Uint8Array(e.target.result)
          const wb = XLSX.read(data, { type: 'array' })
          const csv = XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]])
          res(csv)
        }
        reader.onerror = rej
        reader.readAsArrayBuffer(file)
      })
      type = 'spreadsheet'
    } else {
      content = await new Promise((res, rej) => {
        const r = new FileReader()
        r.onload = () => res(r.result.split(',')[1])
        r.onerror = rej
        r.readAsDataURL(file)
      })
      type = file.type.startsWith('image/') ? 'image' : 'pdf'
    }

    const productList = products.map(p => `${p.product_name} (id: ${p.id})`).join(', ')
    const resp = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type, content, mediaType: file.type, filename: file.name,
        systemOverride: `Tu es un assistant comptable. Extrait les informations de vente de ce document. Produits disponibles : ${productList}. Retourne UNIQUEMENT un JSON avec: "date" (YYYY-MM-DD), "reference" (string), "channel" ("E-commerce" ou "Wholesale USA"), "items": [{"product_id": "uuid exact", "quantity": number, "unit_price": number}]. Si le produit n'est pas trouvé exactement, utilise product_id: "unknown".`
      })
    })
    const data = await resp.json()
    setAnalyzing(false)

    if (data.transactions?.[0]) {
      const t = data.transactions[0]
      if (t.date) setForm(f => ({ ...f, date: t.date, reference: t.note || f.reference }))
    }
    setShowUpload(false)
    setShowModal(true)
  }

  const totalOrders = orders.length
  const totalCA = orders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0)
  const ecomOrders = orders.filter(o => o.channel === 'E-commerce')
  const wsOrders = orders.filter(o => o.channel !== 'E-commerce')

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Ventes</h1>
          <p>{totalOrders} commande{totalOrders !== 1 ? 's' : ''} · CA total {usd(totalCA)}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowUpload(true)}>⬆ Analyser une facture</button>
          <button className="primary" onClick={() => setShowModal(true)}>+ Nouvelle vente</button>
        </div>
      </div>

      <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          ['CA Total', totalCA, '#2E7D32'],
          ['Commandes', totalOrders, '#1565C0'],
          ['E-commerce', ecomOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0), '#6A1B9A'],
          ['Wholesale', wsOrders.reduce((a, o) => a + parseFloat(o.total_amount || 0), 0), '#E65100'],
        ].map(([l, v, c]) => (
          <div key={l} className="metric-card">
            <div className="label">{l}</div>
            <div className="value" style={{ color: c }}>{typeof v === 'number' && l !== 'Commandes' ? usd(v) : v}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div className="loading">Chargement…</div> : orders.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36 }}>🛍️</div>
            <p>Aucune vente enregistrée</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Référence</th>
                <th>Canal</th>
                <th>Distributeur</th>
                <th>Produits</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.map(o => (
                <tr key={o.id}>
                  <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(o.date)}</td>
                  <td style={{ fontWeight: 500 }}>{o.reference || o.id.slice(0, 8)}</td>
                  <td>
                    <span className="pill" style={{
                      background: o.channel === 'E-commerce' ? '#E8EAF6' : '#E8F5E9',
                      color: o.channel === 'E-commerce' ? '#283593' : '#2E7D32'
                    }}>{o.channel}</span>
                  </td>
                  <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{o.distributors?.name || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {o.sale_items?.map(i => `${i.inventory?.product_name} ×${i.quantity}`).join(', ')}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: '#2E7D32' }}>{usd(o.total_amount)}</td>
                  <td>
                    <button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => deleteOrder(o.id)}>Annuler</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showUpload && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="modal">
            <h2>Analyser une facture de vente</h2>
            <input ref={inputRef} type="file" accept="image/*,.pdf,.csv,.xlsx" style={{ display: 'none' }} onChange={e => e.target.files[0] && analyzeFile(e.target.files[0])} />
            <div className="drop-zone" onClick={() => inputRef.current?.click()}>
              {analyzing ? (
                <p style={{ color: 'var(--text-muted)' }}>Analyse en cours…</p>
              ) : (
                <>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>📄</div>
                  <p style={{ fontWeight: 500 }}>Déposer la facture client</p>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>JPG, PNG, PDF, CSV, XLSX</p>
                </>
              )}
            </div>
            <div className="form-actions">
              <button onClick={() => setShowUpload(false)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <h2>Nouvelle vente</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Référence / N° facture</label>
                <input type="text" placeholder="INV-001" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Canal *</label>
                <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                  {CHANNELS.map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Distributeur</label>
                <select value={form.distributor_id} onChange={e => setForm({ ...form, distributor_id: e.target.value })}>
                  <option value="">— Aucun / Direct —</option>
                  {distributors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
            </div>

            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '1rem 0 8px' }}>Produits vendus</div>
            {items.map((item, i) => {
              const prod = products.find(p => p.id === item.product_id)
              return (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 110px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label>Produit</label>}
                    <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}>
                      <option value="">— Choisir —</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.product_name} (stock: {p.quantity_on_hand})</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label>Quantité</label>}
                    <input type="number" placeholder="0" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    {i === 0 && <label>Prix unitaire ($)</label>}
                    <input type="number" placeholder="0.00" value={item.unit_price} onChange={e => updateItem(i, 'unit_price', e.target.value)} />
                  </div>
                  <button onClick={() => removeItem(i)} style={{ padding: '8px', color: '#C62828', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', marginTop: i === 0 ? 20 : 0 }}>×</button>
                </div>
              )
            })}
            <button onClick={addItem} style={{ fontSize: 12, marginBottom: '1rem' }}>+ Ajouter un produit</button>

            {totalRevenue > 0 && (
              <div style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: 8, padding: '1rem', marginBottom: '1rem', fontSize: 13 }}>
                <div style={{ fontWeight: 600, color: '#2E7D32', marginBottom: 6 }}>Aperçu de la vente</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div><span style={{ color: '#546E7A' }}>CA :</span> <strong style={{ color: '#2E7D32' }}>{usd(totalRevenue)}</strong></div>
                  <div><span style={{ color: '#546E7A' }}>Coût :</span> <strong style={{ color: '#C62828' }}>{usd(totalCogs)}</strong></div>
                  <div><span style={{ color: '#546E7A' }}>Marge :</span> <strong style={{ color: totalRevenue - totalCogs >= 0 ? '#2E7D32' : '#C62828' }}>{usd(totalRevenue - totalCogs)} ({totalRevenue > 0 ? ((( totalRevenue - totalCogs) / totalRevenue) * 100).toFixed(1) : 0}%)</strong></div>
                </div>
              </div>
            )}

            <div className="form-actions">
              <button className="primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer la vente'}</button>
              <button onClick={() => setShowModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
