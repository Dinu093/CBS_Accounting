import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd } from '../lib/constants'

const EMPTY_FORM = {
  reference: '', date: new Date().toISOString().split('T')[0],
  supplier: '', freight_cost: '', customs_cost: '',
  packaging_cost: '', other_cost: '', note: ''
}

export default function Costs() {
  const [shipments, setShipments] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [items, setItems] = useState([{ product_id: '', quantity: '', unit_purchase_price: '' }])

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/shipments').then(r => r.json()),
      fetch('/api/inventory').then(r => r.json())
    ]).then(([s, p]) => {
      setShipments(Array.isArray(s) ? s : [])
      setProducts(Array.isArray(p) ? p : [])
      setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const addItem = () => setItems([...items, { product_id: '', quantity: '', unit_purchase_price: '' }])
  const removeItem = (i) => setItems(items.filter((_, idx) => idx !== i))
  const updateItem = (i, field, val) => setItems(items.map((it, idx) => idx === i ? { ...it, [field]: val } : it))

  // Live cost preview
  const totalUnits = items.reduce((a, i) => a + (parseFloat(i.quantity) || 0), 0)
  const extraCosts = ['freight_cost', 'customs_cost', 'packaging_cost', 'other_cost']
    .reduce((a, k) => a + (parseFloat(form[k]) || 0), 0)
  const productCost = items.reduce((a, i) => a + ((parseFloat(i.quantity) || 0) * (parseFloat(i.unit_purchase_price) || 0)), 0)
  const totalCost = productCost + extraCosts
  const avgExtraPerUnit = totalUnits > 0 ? extraCosts / totalUnits : 0

  const save = async () => {
    if (!form.reference || !form.date || items.some(i => !i.product_id || !i.quantity)) return
    setSaving(true)
    const resp = await fetch('/api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shipment: form, items })
    })
    const data = await resp.json()
    setSaving(false)
    if (data.error) { alert('Erreur : ' + data.error); return }
    setShowModal(false)
    setForm(EMPTY_FORM)
    setItems([{ product_id: '', quantity: '', unit_purchase_price: '' }])
    load()
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Coûts de revient</h1>
          <p>Shipments d'achat — coûts alloués par unité automatiquement</p>
        </div>
        <button className="primary" onClick={() => setShowModal(true)}>+ Nouveau shipment</button>
      </div>

      <div className="card" style={{ marginBottom: '1.5rem', background: '#E3F2FD', border: '1px solid #BBDEFB' }}>
        <div style={{ fontSize: 13, color: '#1565C0' }}>
          <strong>Méthode de calcul :</strong> Les frais annexes (freight, douane, packaging) sont répartis proportionnellement au nombre d'unités de chaque produit. Le coût unitaire résultant est mis à jour dans l'inventaire via la méthode du <strong>coût moyen pondéré</strong>.
        </div>
      </div>

      {loading ? <div className="loading">Chargement…</div> : shipments.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div style={{ fontSize: 36 }}>📦</div>
            <p>Aucun shipment enregistré</p>
            <button className="primary" onClick={() => setShowModal(true)} style={{ marginTop: 12, fontSize: 12 }}>+ Créer le premier shipment</button>
          </div>
        </div>
      ) : shipments.map(ship => {
        const totalQty = ship.shipment_items?.reduce((a, i) => a + parseFloat(i.quantity), 0) || 0
        const extra = (parseFloat(ship.freight_cost) || 0) + (parseFloat(ship.customs_cost) || 0) +
          (parseFloat(ship.packaging_cost) || 0) + (parseFloat(ship.other_cost) || 0)
        const prodCost = ship.shipment_items?.reduce((a, i) => a + (i.quantity * i.unit_purchase_price), 0) || 0

        return (
          <div key={ship.id} className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{ship.reference}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  {ship.date} · {ship.supplier || 'Fournisseur non renseigné'} · {totalQty} unités
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 600, color: '#C62828' }}>{usd(prodCost + extra)}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>coût total</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: '1rem' }}>
              {[
                ['Produits', usd(prodCost), '#37474F'],
                ['Freight', usd(ship.freight_cost || 0), '#1565C0'],
                ['Douane', usd(ship.customs_cost || 0), '#6A1B9A'],
                ['Packaging', usd(ship.packaging_cost || 0), '#2E7D32'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ background: 'var(--bg)', borderRadius: 6, padding: '8px 10px', fontSize: 12 }}>
                  <div style={{ color: 'var(--text-muted)', marginBottom: 3 }}>{l}</div>
                  <div style={{ fontWeight: 600, color: c }}>{v}</div>
                </div>
              ))}
            </div>

            {ship.shipment_items?.length > 0 && (
              <table>
                <thead>
                  <tr>
                    <th>Produit</th>
                    <th style={{ textAlign: 'right' }}>Qté</th>
                    <th style={{ textAlign: 'right' }}>Prix achat</th>
                    <th style={{ textAlign: 'right' }}>Frais alloués/u</th>
                    <th style={{ textAlign: 'right' }}>Coût de revient/u</th>
                  </tr>
                </thead>
                <tbody>
                  {ship.shipment_items.map(item => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 500 }}>{item.inventory?.product_name || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right' }}>{usd(item.unit_purchase_price)}</td>
                      <td style={{ textAlign: 'right', color: '#1565C0' }}>
                        {usd(item.quantity > 0 ? (parseFloat(item.allocated_freight) + parseFloat(item.allocated_customs) + parseFloat(item.allocated_packaging)) / item.quantity : 0)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: '#C62828' }}>{usd(item.total_unit_cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <h2>Nouveau shipment</h2>

            <div className="form-row">
              <div className="form-group">
                <label>Référence *</label>
                <input type="text" placeholder="ex : PO-2025-001" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Date *</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label>Fournisseur</label>
              <input type="text" placeholder="Nom du fournisseur" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
            </div>

            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '1rem 0 8px' }}>
              Frais annexes (répartis sur toutes les unités)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: '1rem' }}>
              {[['freight_cost', 'Freight ($)'], ['customs_cost', 'Douane ($)'], ['packaging_cost', 'Packaging ($)'], ['other_cost', 'Autres ($)']].map(([k, l]) => (
                <div className="form-group" key={k} style={{ marginBottom: 0 }}>
                  <label>{l}</label>
                  <input type="number" placeholder="0" value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
            </div>

            <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '1rem 0 8px' }}>
              Produits commandés
            </div>
            {items.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  {i === 0 && <label>Produit</label>}
                  <select value={item.product_id} onChange={e => updateItem(i, 'product_id', e.target.value)}>
                    <option value="">— Choisir —</option>
                    {products.map(p => <option key={p.id} value={p.id}>{p.product_name}</option>)}
                  </select>
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  {i === 0 && <label>Quantité</label>}
                  <input type="number" placeholder="0" value={item.quantity} onChange={e => updateItem(i, 'quantity', e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  {i === 0 && <label>Prix achat/u ($)</label>}
                  <input type="number" placeholder="0.00" value={item.unit_purchase_price} onChange={e => updateItem(i, 'unit_purchase_price', e.target.value)} />
                </div>
                <button onClick={() => removeItem(i)} style={{ padding: '8px', color: '#C62828', border: 'none', background: 'none', fontSize: 18, cursor: 'pointer', marginTop: i === 0 ? 20 : 0 }}>×</button>
              </div>
            ))}
            <button onClick={addItem} style={{ fontSize: 12, marginBottom: '1rem' }}>+ Ajouter un produit</button>

            {totalUnits > 0 && (
              <div style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', borderRadius: 8, padding: '1rem', marginBottom: '1rem', fontSize: 13 }}>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#2E7D32' }}>Aperçu du coût de revient</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div><span style={{ color: '#546E7A' }}>Coût produits :</span> <strong>{usd(productCost)}</strong></div>
                  <div><span style={{ color: '#546E7A' }}>Frais annexes :</span> <strong>{usd(extraCosts)}</strong></div>
                  <div><span style={{ color: '#546E7A' }}>Total :</span> <strong style={{ color: '#C62828' }}>{usd(totalCost)}</strong></div>
                  <div><span style={{ color: '#546E7A' }}>Total unités :</span> <strong>{totalUnits}</strong></div>
                  <div><span style={{ color: '#546E7A' }}>Frais/unité :</span> <strong style={{ color: '#1565C0' }}>{usd(avgExtraPerUnit)}</strong></div>
                  <div><span style={{ color: '#546E7A' }}>Coût moyen/u :</span> <strong style={{ color: '#C62828' }}>{usd(totalUnits > 0 ? totalCost / totalUnits : 0)}</strong></div>
                </div>
              </div>
            )}

            <div className="form-actions">
              <button className="primary" onClick={save} disabled={saving}>{saving ? 'Enregistrement…' : 'Confirmer le shipment'}</button>
              <button onClick={() => setShowModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
