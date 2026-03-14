import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd } from '../lib/constants'

const EMPTY_FORM = {
  product_name: '', sku: '', quantity_on_hand: '', unit_cost: '',
  reorder_level: '', supplier: '', note: ''
}

export default function Inventory() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetch('/api/inventory')
      .then(r => r.json())
      .then(data => { setProducts(Array.isArray(data) ? data : []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(EMPTY_FORM); setShowModal(true) }
  const openEdit = (p) => { setEditing(p.id); setForm(p); setShowModal(true) }

  const save = async () => {
    if (!form.product_name) return
    setSaving(true)
    const body = {
      ...form,
      quantity_on_hand: parseFloat(form.quantity_on_hand) || 0,
      unit_cost: parseFloat(form.unit_cost) || 0,
      reorder_level: parseFloat(form.reorder_level) || 0,
    }
    if (editing) {
      await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing, ...body })
      })
    } else {
      await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
    }
    setSaving(false)
    setShowModal(false)
    load()
  }

  const del = async (id) => {
    if (!confirm('Supprimer ce produit ?')) return
    await fetch(`/api/inventory?id=${id}`, { method: 'DELETE' })
    load()
  }

  const totalValue = products.reduce((a, p) => a + (p.quantity_on_hand * p.unit_cost), 0)
  const lowStock = products.filter(p => p.reorder_level > 0 && p.quantity_on_hand <= p.reorder_level)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Inventaire</h1>
          <p>{products.length} produit{products.length !== 1 ? 's' : ''} · Valeur totale : {usd(totalValue)}</p>
        </div>
        <button className="primary" onClick={openNew}>+ Nouveau produit</button>
      </div>

      {lowStock.length > 0 && (
        <div className="alert alert-warning" style={{ marginBottom: '1rem' }}>
          ⚠ <strong>{lowStock.length} produit{lowStock.length > 1 ? 's' : ''} en stock bas :</strong> {lowStock.map(p => p.product_name).join(', ')}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <div className="label">Produits actifs</div>
          <div className="value" style={{ color: '#1565C0' }}>{products.length}</div>
        </div>
        <div className="metric-card">
          <div className="label">Valeur du stock</div>
          <div className="value" style={{ color: '#2E7D32' }}>{usd(totalValue)}</div>
        </div>
        <div className="metric-card">
          <div className="label">Stock bas</div>
          <div className="value" style={{ color: lowStock.length > 0 ? '#E65100' : '#2E7D32' }}>{lowStock.length}</div>
        </div>
        <div className="metric-card">
          <div className="label">Unités totales</div>
          <div className="value" style={{ color: '#37474F' }}>{products.reduce((a, p) => a + parseFloat(p.quantity_on_hand || 0), 0)}</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="loading">Chargement…</div>
        ) : products.length === 0 ? (
          <div className="empty-state">
            <div style={{ fontSize: 32 }}>📦</div>
            <p>Aucun produit en inventaire</p>
            <button className="primary" onClick={openNew} style={{ marginTop: 12, fontSize: 12 }}>+ Ajouter un produit</button>
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Produit</th>
                <th>SKU</th>
                <th style={{ textAlign: 'right' }}>Qté</th>
                <th style={{ textAlign: 'right' }}>Coût unitaire</th>
                <th style={{ textAlign: 'right' }}>Valeur totale</th>
                <th>Fournisseur</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const value = p.quantity_on_hand * p.unit_cost
                const isLow = p.reorder_level > 0 && p.quantity_on_hand <= p.reorder_level
                return (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 500 }}>{p.product_name}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.sku || '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: isLow ? '#E65100' : 'var(--text)' }}>{p.quantity_on_hand}</td>
                    <td style={{ textAlign: 'right' }}>{usd(p.unit_cost)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#2E7D32' }}>{usd(value)}</td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.supplier || '—'}</td>
                    <td>
                      {isLow
                        ? <span className="pill" style={{ background: '#FFF3E0', color: '#E65100' }}>Stock bas</span>
                        : <span className="pill" style={{ background: '#E8F5E9', color: '#2E7D32' }}>OK</span>
                      }
                    </td>
                    <td style={{ display: 'flex', gap: 6 }}>
                      <button style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => openEdit(p)}>Modifier</button>
                      <button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => del(p.id)}>Suppr.</button>
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
            <h2>{editing ? 'Modifier le produit' : 'Nouveau produit'}</h2>
            <div className="form-group">
              <label>Nom du produit *</label>
              <input type="text" placeholder="ex : Vitamin C Serum 30ml" value={form.product_name} onChange={e => setForm({ ...form, product_name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>SKU / Référence</label>
                <input type="text" placeholder="CBS-001" value={form.sku || ''} onChange={e => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Fournisseur</label>
                <input type="text" placeholder="Nom du fournisseur" value={form.supplier || ''} onChange={e => setForm({ ...form, supplier: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Quantité en stock</label>
                <input type="number" placeholder="0" value={form.quantity_on_hand || ''} onChange={e => setForm({ ...form, quantity_on_hand: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Coût unitaire ($)</label>
                <input type="number" placeholder="0.00" value={form.unit_cost || ''} onChange={e => setForm({ ...form, unit_cost: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Seuil de réapprovisionnement</label>
                <input type="number" placeholder="10" value={form.reorder_level || ''} onChange={e => setForm({ ...form, reorder_level: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Note</label>
                <input type="text" placeholder="Infos supplémentaires" value={form.note || ''} onChange={e => setForm({ ...form, note: e.target.value })} />
              </div>
            </div>
            <div className="form-actions">
              <button className="primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button onClick={() => setShowModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
