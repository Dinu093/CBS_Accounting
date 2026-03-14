import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { CATEGORIES, CAT_KEYS, TYPE_COLORS, usd, fdate } from '../lib/constants'

export default function Transactions() {
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '', category: 'Sales — products', amount: '', note: ''
  })

  const load = () => {
    setLoading(true)
    fetch('/api/transactions')
      .then(r => r.json())
      .then(data => { setTxs(Array.isArray(data) ? data : []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const filtered = filter === 'all' ? txs : txs.filter(t => CATEGORIES[t.category] === filter)

  const save = async () => {
    if (!form.description || !form.amount) return
    setSaving(true)
    await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [form] })
    })
    setSaving(false)
    setShowModal(false)
    setForm({ date: new Date().toISOString().split('T')[0], description: '', category: 'Sales — products', amount: '', note: '' })
    load()
  }

  const del = async (id) => {
    if (!confirm('Supprimer cette transaction ?')) return
    await fetch(`/api/transactions?id=${id}`, { method: 'DELETE' })
    load()
  }

  const totals = filtered.reduce((acc, t) => {
    const type = CATEGORIES[t.category]
    const isIncome = type === 'revenue' || type === 'capital'
    acc.total += isIncome ? parseFloat(t.amount) : -parseFloat(t.amount)
    return acc
  }, { total: 0 })

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Transactions</h1>
          <p>{filtered.length} transaction{filtered.length !== 1 ? 's' : ''} · Net {usd(totals.total)}</p>
        </div>
        <button className="primary" onClick={() => setShowModal(true)}>+ Ajouter</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {['all', 'capital', 'revenue', 'cogs', 'opex'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            fontSize: 12,
            background: filter === f ? 'var(--pink)' : 'var(--white)',
            color: filter === f ? 'white' : 'var(--text-muted)',
            borderColor: filter === f ? 'var(--pink)' : 'var(--border)',
          }}>
            {f === 'all' ? 'Tout' : TYPE_COLORS[f]?.label || f}
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 32 }}>📭</div>
            <p>Aucune transaction</p>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Catégorie</th>
                <th style={{ textAlign: 'right' }}>Montant</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => {
                const type = CATEGORIES[tx.category]
                const isIncome = type === 'revenue' || type === 'capital'
                const c = TYPE_COLORS[type] || TYPE_COLORS.opex
                return (
                  <tr key={tx.id}>
                    <td style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{fdate(tx.date)}</td>
                    <td style={{ maxWidth: 280 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                    </td>
                    <td>
                      <span className="pill" style={{ background: c.bg, color: c.text }}>{tx.category}</span>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: isIncome ? '#2E7D32' : '#C62828', whiteSpace: 'nowrap' }}>
                      {isIncome ? '+' : '−'}{usd(tx.amount)}
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{tx.note || '—'}</td>
                    <td>
                      <button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => del(tx.id)}>
                        Suppr.
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h2>Nouvelle transaction</h2>
            <div className="form-row">
              <div className="form-group">
                <label>Date</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Montant (USD)</label>
                <input type="number" placeholder="0.00" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label>Description</label>
              <input type="text" placeholder="ex : Invoice #001 — batch produits" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Catégorie</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CAT_KEYS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Note / N° pièce (optionnel)</label>
              <input type="text" placeholder="Invoice #001, nom du fournisseur…" value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} />
            </div>
            <div className="form-actions">
              <button className="primary" onClick={save} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              <button onClick={() => setShowModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
