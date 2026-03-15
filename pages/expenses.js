import React, { useState, useEffect, useRef } from 'react'
import Layout from '../components/Layout'
import { CATEGORIES, CAT_KEYS, TYPE_COLORS, usd, fdate } from '../lib/constants'
import * as XLSX from 'xlsx'
import DateFilter, { filterByDate } from '../components/DateFilter'

export async function getServerSideProps() { return { props: {} } }

const EXPENSE_CATS = CAT_KEYS.filter(k => {
  const t = CATEGORIES[k]
  return t === 'cogs' || t === 'opex'
})

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

export default function Expenses() {
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeMsg, setAnalyzeMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [pending, setPending] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [expandedTx, setExpandedTx] = useState(null)
  const [dupResult, setDupResult] = useState(null)
  const [successMsg, setSuccessMsg] = useState('')
  const [dateRange, setDateRange] = useState({ from: null, to: null })
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], description: '', category: 'Inventory / product cost', amount: '', note: '' })
  const inputRef = useRef()

  const load = () => {
    setLoading(true)
    fetch('/api/transactions').then(r => r.json()).then(data => {
      const expenses = (Array.isArray(data) ? data : []).filter(t => {
        const type = CATEGORIES[t.category]
        return type === 'cogs' || type === 'opex'
      })
      setTxs(expenses)
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const saveSingle = async () => {
    if (!form.description || !form.amount) return
    setSaving(true)
    const resp = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [form] })
    })
    const data = await resp.json()
    setSaving(false)
    if (data.duplicates?.length > 0) {
      setDupResult({ duplicates: data.duplicates, toInsert: [form], saved: data.inserted?.length || 0 })
      setShowModal(false)
      return
    }
    setShowModal(false)
    setSuccessMsg('Dépense enregistrée ✓')
    setTimeout(() => setSuccessMsg(''), 4000)
    setForm({ date: new Date().toISOString().split('T')[0], description: '', category: 'Inventory / product cost', amount: '', note: '' })
    load()
  }

  const acceptAll = async (forceInsert = false) => {
    setSaving(true)
    const txList = pending.map(({ _pid, ...t }) => t)
    const resp = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: txList, forceInsert })
    })
    const data = await resp.json()
    setSaving(false)
    if (!forceInsert && data.duplicates?.length > 0) {
      setDupResult({ duplicates: data.duplicates, toInsert: data.duplicates.map(d => d.newTx), saved: data.inserted?.length || 0 })
      setPending([])
      return
    }
    setPending([])
    setDupResult(null)
    setSuccessMsg((data.inserted?.length || 0) + ' dépense(s) enregistrée(s) ✓')
    setTimeout(() => setSuccessMsg(''), 4000)
    load()
  }

  const analyzeFile = async (file) => {
    setAnalyzing(true)
    setAnalyzeMsg('Lecture du fichier…')
    try {
      const { type, content, mediaType } = await readFile(file)
      setAnalyzeMsg('Claude analyse le document…')
      const systemOverride = 'Tu es un assistant comptable pour Clique Beauty Skincare LLC. Analyse ce document de DÉPENSE (facture fournisseur, relevé bancaire, reçu). Retourne UNIQUEMENT un tableau JSON de transactions : [{"date":"YYYY-MM-DD","description":"description concise","category":"exactement un de : ' + EXPENSE_CATS.join(', ') + '","amount":nombre positif,"note":"référence optionnelle"}]. Pour les relevés bancaires, extrais uniquement les débits/dépenses. Retourne UNIQUEMENT le JSON.'
      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, content, mediaType, filename: file.name, systemOverride })
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      const withIds = data.transactions.map((t, i) => ({ ...t, _pid: Date.now() + i }))
      setPending(prev => [...prev, ...withIds])
    } catch (err) { alert('Erreur : ' + err.message) }
    finally { setAnalyzing(false) }
  }

  const rejectOne = (_pid) => setPending(prev => prev.filter(p => p._pid !== _pid))
  const updatePending = (_pid, field, value) => setPending(prev => prev.map(p => p._pid === _pid ? { ...p, [field]: value } : p))

  const del = async (id) => {
    if (!confirm('Supprimer cette dépense ?')) return
    await fetch('/api/transactions?id=' + id, { method: 'DELETE' })
    load()
  }

  const filteredTxs = filterByDate(txs, 'date', dateRange)
  const totalDepenses = filteredTxs.reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const totalCogs = txs.filter(t => CATEGORIES[t.category] === 'cogs').reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const totalOpex = txs.filter(t => CATEGORIES[t.category] === 'opex').reduce((a, t) => a + parseFloat(t.amount || 0), 0)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Expenses</h1><p>Charges & expenses · Total {usd(totalDepenses)}</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input ref={inputRef} type="file" accept="image/*,.pdf,.csv,.xlsx" style={{ display: 'none' }} onChange={e => e.target.files[0] && analyzeFile(e.target.files[0])} />
          <button onClick={() => !analyzing && inputRef.current.click()}>
            {analyzing ? '⏳ ' + analyzeMsg : '⬆ Upload document'}
          </button>
          <button className="primary" onClick={() => setShowModal(true)}>+ Add manually</button>
        </div>
      </div>

      {successMsg && <div className="alert alert-success" style={{ marginBottom: '1rem' }}>{successMsg}</div>}

      <DateFilter onChange={setDateRange} />
      <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
        {[
          ['Total dépenses', usd(totalDepenses), '#C62828'],
          ['Coût des ventes', usd(totalCogs), '#E65100'],
          ['Charges opex', usd(totalOpex), '#AD1457'],
          ['Nb transactions', filteredTxs.length, '#37474F'],
        ].map(([l, v, c]) => (
          <div key={l} className="metric-card"><div className="label">{l}</div><div className="value" style={{ color: c }}>{v}</div></div>
        ))}
      </div>

      {/* Doublon confirmation */}
      {dupResult && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 480 }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <h2 style={{ textAlign: 'center', marginBottom: 8 }}>{dupResult.duplicates.length} doublon{dupResult.duplicates.length > 1 ? 's' : ''} détecté{dupResult.duplicates.length > 1 ? 's' : ''}</h2>
            {dupResult.saved > 0 && <div className="alert alert-success" style={{ marginBottom: '1rem', fontSize: 12 }}>✓ {dupResult.saved} autre(s) dépense(s) déjà enregistrée(s)</div>}
            <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.75rem', marginBottom: '1.25rem' }}>
              {dupResult.duplicates.map((d, i) => (
                <div key={i} style={{ padding: '8px 0', borderBottom: i < dupResult.duplicates.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                  <div style={{ fontWeight: 500 }}>{d.newTx?.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{d.newTx?.date} · <strong style={{ color: '#C62828' }}>{usd(d.newTx?.amount)}</strong> · {d.reason}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, textAlign: 'center', marginBottom: '1.5rem' }}>Veux-tu les ajouter quand même ?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="primary" onClick={() => acceptAll(true)} disabled={saving} style={{ padding: '10px', fontSize: 13 }}>{saving ? 'Enregistrement…' : 'Oui, ajouter quand même'}</button>
              <button onClick={() => setDupResult(null)} style={{ padding: '10px', fontSize: 13 }}>Non, ignorer</button>
            </div>
          </div>
        </div>
      )}

      {/* Pending extracted transactions */}
      {pending.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600 }}>{pending.length} dépense{pending.length > 1 ? 's' : ''} extraite{pending.length > 1 ? 's' : ''} — à valider</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={() => acceptAll(false)} disabled={saving}>{saving ? 'Enregistrement…' : 'Accept all (' + pending.length + ')'}</button>
              <button onClick={() => setPending([])}>Reject all</button>
            </div>
          </div>
          {pending.map(tx => {
            const type = CATEGORIES[tx.category]
            const c = TYPE_COLORS[type] || TYPE_COLORS.opex
            return (
              <div key={tx._pid} className="card" style={{ marginBottom: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 220px 120px 32px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
                  <input type="date" value={tx.date} onChange={e => updatePending(tx._pid, 'date', e.target.value)} />
                  <input type="text" value={tx.description} onChange={e => updatePending(tx._pid, 'description', e.target.value)} />
                  <select value={tx.category} onChange={e => updatePending(tx._pid, 'category', e.target.value)}>
                    {EXPENSE_CATS.map(k => <option key={k}>{k}</option>)}
                  </select>
                  <input type="number" value={tx.amount} onChange={e => updatePending(tx._pid, 'amount', e.target.value)} />
                  <button onClick={() => rejectOne(tx._pid)} style={{ border: 'none', background: 'none', fontSize: 18, color: '#C62828', cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="pill" style={{ background: c.bg, color: c.text }}>{tx.category}</span>
                  {tx.note && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tx.note}</span>}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontWeight: 600, color: '#C62828' }}>{usd(tx.amount)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? <div className="loading">Chargement…</div> : filteredTxs.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 36 }}>🔴</div>
            <p>No expenses recorded</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>Upload a supplier invoice or bank statement</p>
          </div>
        ) : (
          <table>
            <thead><tr><th>Date</th><th>Description</th><th>Category</th><th style={{ textAlign: 'right' }}>Amount</th><th>Note</th><th></th></tr></thead>
            <tbody>
              {txs.map(tx => {
                const type = CATEGORIES[tx.category]
                const c = TYPE_COLORS[type] || TYPE_COLORS.opex
                const isExpanded = expandedTx === tx.id
                return [
                  <tr key={tx.id} onClick={() => setExpandedTx(isExpanded ? null : tx.id)} style={{ cursor: 'pointer' }}>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(tx.date)}</td>
                    <td style={{ maxWidth: 250 }}><div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{tx.description}</div></td>
                    <td><span className="pill" style={{ background: c.bg, color: c.text }}>{tx.category}</span></td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#C62828', whiteSpace: 'nowrap' }}>−{usd(tx.amount)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{tx.note || '—'}</td>
                    <td onClick={e => e.stopPropagation()}><button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => del(tx.id)}>Delete</button></td>
                  </tr>,
                  isExpanded && (
                    <tr key={tx.id + '_exp'}>
                      <td colSpan={6} style={{ background: 'var(--cream)', padding: '14px 16px', borderBottom: '2px solid var(--border)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                          <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Date</div><div style={{ fontSize: 13, fontWeight: 500 }}>{fdate(tx.date)}</div></div>
                          <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Amount</div><div style={{ fontSize: 18, fontWeight: 300, color: '#C62828' }}>−{usd(tx.amount)}</div></div>
                          <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Category</div><span className="pill" style={{ background: c.bg, color: c.text }}>{tx.category}</span></div>
                          <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Type</div><div style={{ fontSize: 13 }}>{type === 'cogs' ? 'Cost of goods' : 'Operating expense'}</div></div>
                          {tx.note && <div><div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Note</div><div style={{ fontSize: 13 }}>{tx.note}</div></div>}
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

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2>New expense</h2>
            <div className="form-row">
              <div className="form-group"><label>Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
              <div className="form-group"><label>Montant ($)</label><input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Description</label><input type="text" placeholder="ex : Facture fournisseur, frais bancaires…" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="form-group"><label>Catégorie</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {EXPENSE_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group"><label>Note / N° pièce (optionnel)</label><input type="text" placeholder="Référence, fournisseur…" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} /></div>
            <div className="form-actions">
              <button className="primary" onClick={saveSingle} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button onClick={() => setShowModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
