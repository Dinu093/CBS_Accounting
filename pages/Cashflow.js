import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import DateFilter, { filterByDate } from '../components/DateFilter'
import { usd, fdate } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

function DaysChip({ dueDate, status }) {
  if (status === 'paid') return <span className="pill" style={{ background: 'var(--green-light)', color: 'var(--green)' }}>Payé</span>
  if (!dueDate) return <span className="pill" style={{ background: 'var(--cream-dark)', color: 'var(--text-muted)' }}>Sans échéance</span>
  const days = Math.ceil((new Date(dueDate) - new Date()) / 86400000)
  if (days < 0) return <span className="pill" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>En retard {Math.abs(days)}j</span>
  if (days <= 7) return <span className="pill" style={{ background: 'var(--amber-light)', color: 'var(--amber)' }}>Dans {days}j</span>
  return <span className="pill" style={{ background: 'var(--blue-light)', color: 'var(--navy-mid)' }}>Dans {days}j</span>
}

export default function Cashflow() {
  const [payables, setPayables] = useState([])
  const [receivables, setReceivables] = useState([])
  const [expenses, setExpenses] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [dateRange, setDateRange] = useState({ from: null, to: null })
  const [showPayModal, setShowPayModal] = useState(false)
  const [showRecModal, setShowRecModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [payForm, setPayForm] = useState({ vendor: '', amount: '', due_date: '', note: '', transaction_id: '' })
  const [recForm, setRecForm] = useState({ customer: '', amount: '', due_date: '', note: '', order_id: '' })

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/payables').then(r => r.json()),
      fetch('/api/receivables').then(r => r.json()),
      fetch('/api/transactions').then(r => r.json()),
      fetch('/api/sales').then(r => r.json()),
    ]).then(([p, r, e, o]) => {
      setPayables(Array.isArray(p) ? p : [])
      setReceivables(Array.isArray(r) ? r : [])
      setExpenses(Array.isArray(e) ? e : [])
      setOrders(Array.isArray(o) ? o : [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const markPaid = async (type, id) => {
    setSaving(true)
    const url = type === 'payable' ? '/api/payables' : '/api/receivables'
    await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status: 'paid', paid_date: new Date().toISOString().split('T')[0] })
    })
    setSaving(false)
    load()
  }

  const del = async (type, id) => {
    if (!confirm('Supprimer ?')) return
    const url = type === 'payable' ? '/api/payables' : '/api/receivables'
    await fetch(url + '?id=' + id, { method: 'DELETE' })
    load()
  }

  const savePayable = async () => {
    if (!payForm.vendor || !payForm.amount) return
    setSaving(true)
    await fetch('/api/payables', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payForm, amount: parseFloat(payForm.amount), status: 'pending' })
    })
    setSaving(false)
    setShowPayModal(false)
    setPayForm({ vendor: '', amount: '', due_date: '', note: '', transaction_id: '' })
    load()
  }

  const saveReceivable = async () => {
    if (!recForm.customer || !recForm.amount) return
    setSaving(true)
    await fetch('/api/receivables', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...recForm, amount: parseFloat(recForm.amount), status: 'pending' })
    })
    setSaving(false)
    setShowRecModal(false)
    setRecForm({ customer: '', amount: '', due_date: '', note: '', order_id: '' })
    load()
  }

  // Filtered
  const pendingPay = payables.filter(p => p.status !== 'paid')
  const paidPay = payables.filter(p => p.status === 'paid')
  const pendingRec = receivables.filter(r => r.status !== 'paid')
  const paidRec = receivables.filter(r => r.status === 'paid')

  // Totals
  const totalAP = pendingPay.reduce((a, p) => a + parseFloat(p.amount || 0), 0)
  const totalAR = pendingRec.reduce((a, r) => a + parseFloat(r.amount || 0), 0)
  const overdueAP = pendingPay.filter(p => p.due_date && new Date(p.due_date) < new Date()).reduce((a, p) => a + parseFloat(p.amount || 0), 0)
  const overdueAR = pendingRec.filter(r => r.due_date && new Date(r.due_date) < new Date()).reduce((a, r) => a + parseFloat(r.amount || 0), 0)
  const netPosition = totalAR - totalAP

  // Next 30 days cash flow forecast
  const forecast = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const out = pendingPay.filter(p => p.due_date === dateStr).reduce((a, p) => a + parseFloat(p.amount || 0), 0)
    const inn = pendingRec.filter(r => r.due_date === dateStr).reduce((a, r) => a + parseFloat(r.amount || 0), 0)
    if (out > 0 || inn > 0) forecast.push({ date: dateStr, out, in: inn })
  }

  const TABS = [
    { id: 'overview', label: 'Vue d\'ensemble' },
    { id: 'payables', label: 'À payer — AP (' + pendingPay.length + ')' },
    { id: 'receivables', label: 'À encaisser — AR (' + pendingRec.length + ')' },
    { id: 'forecast', label: 'Prévisions 30j' },
  ]

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Trésorerie & Flux</h1>
          <p>Comptes fournisseurs (AP) · Créances clients (AR)</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowRecModal(true)}>+ Créance client</button>
          <button className="primary" onClick={() => setShowPayModal(true)}>+ Dette fournisseur</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} className={'tab-btn' + (activeTab === t.id ? ' active' : '')}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? <div className="loading">Chargement…</div> : (
        <>
          {activeTab === 'overview' && (
            <div>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                  ['Dettes fournisseurs (AP)', usd(totalAP), 'var(--red)', 'À payer'],
                  ['Créances clients (AR)', usd(totalAR), 'var(--green)', 'À encaisser'],
                  ['Position nette', usd(netPosition), netPosition >= 0 ? 'var(--green)' : 'var(--red)', netPosition >= 0 ? 'Favorable' : 'Attention'],
                  ['En retard AP', usd(overdueAP), overdueAP > 0 ? 'var(--red)' : 'var(--text-muted)', overdueAP > 0 ? '⚠ Urgent' : 'OK'],
                ].map(([l, v, c, sub]) => (
                  <div key={l} className="metric-card">
                    <div className="label">{l}</div>
                    <div className="value" style={{ color: c, fontSize: 20 }}>{v}</div>
                    <div style={{ fontSize: 11, color: c, marginTop: 4, opacity: 0.7 }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Upcoming due */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div className="card">
                  <div className="section-title" style={{ marginBottom: '1rem' }}>Prochains paiements à effectuer</div>
                  {pendingPay.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucune dette en cours</div> :
                    pendingPay.slice(0, 5).map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{p.vendor}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.note || p.transactions?.description || '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right', marginLeft: 12 }}>
                          <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 13 }}>{usd(p.amount)}</div>
                          <DaysChip dueDate={p.due_date} status={p.status} />
                        </div>
                      </div>
                    ))
                  }
                </div>

                <div className="card">
                  <div className="section-title" style={{ marginBottom: '1rem' }}>Prochains encaissements attendus</div>
                  {pendingRec.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Aucune créance en cours</div> :
                    pendingRec.slice(0, 5).map(r => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{r.customer}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{r.sales_orders?.reference || r.note || '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right', marginLeft: 12 }}>
                          <div style={{ fontWeight: 600, color: 'var(--green)', fontSize: 13 }}>{usd(r.amount)}</div>
                          <DaysChip dueDate={r.due_date} status={r.status} />
                        </div>
                      </div>
                    ))
                  }
                </div>
              </div>
            </div>
          )}

          {activeTab === 'payables' && (
            <div>
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
                <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  En attente · {usd(totalAP)}
                </div>
                {pendingPay.length === 0 ? <div className="empty-state"><p>Aucune dette fournisseur</p></div> : (
                  <table>
                    <thead><tr><th>Fournisseur</th><th>Description</th><th>Échéance</th><th>Statut</th><th style={{ textAlign: 'right' }}>Montant</th><th></th></tr></thead>
                    <tbody>
                      {pendingPay.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500 }}>{p.vendor}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.note || p.transactions?.description || '—'}</td>
                          <td>{p.due_date ? fdate(p.due_date) : '—'}</td>
                          <td><DaysChip dueDate={p.due_date} status={p.status} /></td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--red)' }}>{usd(p.amount)}</td>
                          <td style={{ display: 'flex', gap: 6 }}>
                            <button style={{ fontSize: 11, padding: '4px 10px', background: 'var(--green-light)', color: 'var(--green)', border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={() => markPaid('payable', p.id)} disabled={saving}>✓ Payé</button>
                            <button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => del('payable', p.id)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {paidPay.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Payés · {paidPay.length}
                  </div>
                  <table>
                    <thead><tr><th>Fournisseur</th><th>Payé le</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
                    <tbody>
                      {paidPay.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500 }}>{p.vendor}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{p.paid_date ? fdate(p.paid_date) : '—'}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{usd(p.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'receivables' && (
            <div>
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.5rem' }}>
                <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  En attente · {usd(totalAR)}
                </div>
                {pendingRec.length === 0 ? <div className="empty-state"><p>Aucune créance client</p></div> : (
                  <table>
                    <thead><tr><th>Client</th><th>Référence</th><th>Échéance</th><th>Statut</th><th style={{ textAlign: 'right' }}>Montant</th><th></th></tr></thead>
                    <tbody>
                      {pendingRec.map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 500 }}>{r.customer}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.sales_orders?.reference || r.note || '—'}</td>
                          <td>{r.due_date ? fdate(r.due_date) : '—'}</td>
                          <td><DaysChip dueDate={r.due_date} status={r.status} /></td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{usd(r.amount)}</td>
                          <td style={{ display: 'flex', gap: 6 }}>
                            <button style={{ fontSize: 11, padding: '4px 10px', background: 'var(--green-light)', color: 'var(--green)', border: 'none', borderRadius: 6, cursor: 'pointer' }} onClick={() => markPaid('receivable', r.id)} disabled={saving}>✓ Encaissé</button>
                            <button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => del('receivable', r.id)}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {paidRec.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Encaissés · {paidRec.length}
                  </div>
                  <table>
                    <thead><tr><th>Client</th><th>Encaissé le</th><th style={{ textAlign: 'right' }}>Montant</th></tr></thead>
                    <tbody>
                      {paidRec.map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 500 }}>{r.customer}</td>
                          <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r.paid_date ? fdate(r.paid_date) : '—'}</td>
                          <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{usd(r.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'forecast' && (
            <div>
              <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
                Prévisions basées sur les dates d'échéance des dettes et créances enregistrées sur les 30 prochains jours.
              </div>
              {forecast.length === 0 ? (
                <div className="card"><div className="empty-state"><div style={{ fontSize: 36 }}>📅</div><p>Aucune échéance dans les 30 prochains jours</p></div></div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th style={{ textAlign: 'right', color: 'var(--green)' }}>Encaissements attendus</th>
                        <th style={{ textAlign: 'right', color: 'var(--red)' }}>Paiements à effectuer</th>
                        <th style={{ textAlign: 'right' }}>Solde net du jour</th>
                      </tr>
                    </thead>
                    <tbody>
                      {forecast.map((f, i) => {
                        const net = f.in - f.out
                        return (
                          <tr key={i}>
                            <td style={{ fontWeight: 500 }}>{fdate(f.date)}</td>
                            <td style={{ textAlign: 'right', color: 'var(--green)', fontWeight: f.in > 0 ? 600 : 400 }}>{f.in > 0 ? '+' + usd(f.in) : '—'}</td>
                            <td style={{ textAlign: 'right', color: 'var(--red)', fontWeight: f.out > 0 ? 600 : 400 }}>{f.out > 0 ? '−' + usd(f.out) : '—'}</td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: net >= 0 ? 'var(--green)' : 'var(--red)' }}>{net >= 0 ? '+' : '−'}{usd(Math.abs(net))}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Add payable modal */}
      {showPayModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowPayModal(false)}>
          <div className="modal">
            <h2>Nouvelle dette fournisseur</h2>
            <div className="form-group"><label>Fournisseur *</label><input type="text" placeholder="ex : The French Lab, UPS…" value={payForm.vendor} onChange={e => setPayForm({ ...payForm, vendor: e.target.value })} /></div>
            <div className="form-row">
              <div className="form-group"><label>Montant ($) *</label><input type="number" placeholder="0.00" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></div>
              <div className="form-group"><label>Date d'échéance</label><input type="date" value={payForm.due_date} onChange={e => setPayForm({ ...payForm, due_date: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Référence / Note</label><input type="text" placeholder="N° facture, description…" value={payForm.note} onChange={e => setPayForm({ ...payForm, note: e.target.value })} /></div>
            <div style={{ background: 'var(--amber-light)', border: '1px solid rgba(139,94,26,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--amber)', marginBottom: '1rem' }}>
              ℹ Cette dette sera affichée dans le bilan comme passif et ne sera comptée en charge qu'une fois marquée "Payée".
            </div>
            <div className="form-actions">
              <button className="primary" onClick={savePayable} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button onClick={() => setShowPayModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {/* Add receivable modal */}
      {showRecModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowRecModal(false)}>
          <div className="modal">
            <h2>Nouvelle créance client</h2>
            <div className="form-group"><label>Client *</label><input type="text" placeholder="ex : Joseph's Salon, Clique Boutique…" value={recForm.customer} onChange={e => setRecForm({ ...recForm, customer: e.target.value })} /></div>
            <div className="form-row">
              <div className="form-group"><label>Montant ($) *</label><input type="number" placeholder="0.00" value={recForm.amount} onChange={e => setRecForm({ ...recForm, amount: e.target.value })} /></div>
              <div className="form-group"><label>Date d'échéance</label><input type="date" value={recForm.due_date} onChange={e => setRecForm({ ...recForm, due_date: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Référence / Note</label><input type="text" placeholder="N° facture, commande…" value={recForm.note} onChange={e => setRecForm({ ...recForm, note: e.target.value })} /></div>
            <div className="form-actions">
              <button className="primary" onClick={saveReceivable} disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button onClick={() => setShowRecModal(false)}>Annuler</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
