import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { useAuth } from './_app'
import { usd, fdate } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

function StatusChip({ dueDate, status }) {
  if (status === 'paid') return <span className="pill" style={{ background: 'var(--green-light)', color: 'var(--green)' }}>Paid</span>
  if (!dueDate) return <span className="pill" style={{ background: 'var(--cream-dark)', color: 'var(--text-muted)' }}>No due date</span>
  const days = Math.ceil((new Date(dueDate) - new Date()) / 86400000)
  if (days < 0) return <span className="pill" style={{ background: 'var(--red-light)', color: 'var(--red)' }}>Overdue {Math.abs(days)}d</span>
  if (days <= 7) return <span className="pill" style={{ background: 'var(--amber-light)', color: 'var(--amber)' }}>Due in {days}d</span>
  return <span className="pill" style={{ background: 'var(--blue-light)', color: 'var(--navy-mid)' }}>Due in {days}d</span>
}

export default function Cashflow() {
  const { isAdmin } = useAuth()
  const [payables, setPayables] = useState([])
  const [receivables, setReceivables] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('overview')
  const [saving, setSaving] = useState(false)
  const [showPayModal, setShowPayModal] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [showRecModal, setShowRecModal] = useState(false)
  const [payForm, setPayForm] = useState({ vendor: '', amount: '', due_date: '', note: '' })
  const [recForm, setRecForm] = useState({ customer: '', amount: '', due_date: '', note: '' })

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch('/api/payables?t=' + Date.now()).then(r => r.json()),
      fetch('/api/receivables?t=' + Date.now()).then(r => r.json()),
    ]).then(([p, r]) => {
      setPayables(Array.isArray(p) ? p : [])
      setReceivables(Array.isArray(r) ? r : [])
      setLoading(false)
    })
  }
  useEffect(() => { load() }, [])

  const markPaid = async (type, id) => {
    setSaving(true)
    const url = type === 'payable' ? '/api/payables' : '/api/receivables'
    await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status: 'paid', paid_date: new Date().toISOString().split('T')[0] }) })
    setSaving(false); load()
  }

  const del = async (type, id) => {
    if (!confirm('Delete?')) return
    const url = type === 'payable' ? '/api/payables' : '/api/receivables'
    await fetch(url + '?id=' + id, { method: 'DELETE' }); load()
  }

  const savePayable = async () => {
    if (!payForm.vendor || !payForm.amount) return
    setSaving(true)
    await fetch('/api/payables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payForm, amount: parseFloat(payForm.amount), status: 'pending' }) })
    setSaving(false); setShowPayModal(false); setPayForm({ vendor: '', amount: '', due_date: '', note: '' }); load()
  }

  const saveReceivable = async () => {
    if (!recForm.customer || !recForm.amount) return
    setSaving(true)
    await fetch('/api/receivables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...recForm, amount: parseFloat(recForm.amount), status: 'pending' }) })
    setSaving(false); setShowRecModal(false); setRecForm({ customer: '', amount: '', due_date: '', note: '' }); load()
  }

  const pendingPay = payables.filter(p => p.status !== 'paid')
  const paidPay = payables.filter(p => p.status === 'paid')
  const pendingRec = receivables.filter(r => r.status !== 'paid')
  const paidRec = receivables.filter(r => r.status === 'paid')
  const totalAP = pendingPay.reduce((a, p) => a + parseFloat(p.amount || 0), 0)
  const totalAR = pendingRec.reduce((a, r) => a + parseFloat(r.amount || 0), 0)
  const overdueAP = pendingPay.filter(p => p.due_date && new Date(p.due_date) < new Date()).reduce((a, p) => a + parseFloat(p.amount || 0), 0)
  const netPosition = totalAR - totalAP

  // 30-day forecast
  const forecast = []
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() + i)
    const dateStr = d.toISOString().split('T')[0]
    const out = pendingPay.filter(p => p.due_date === dateStr).reduce((a, p) => a + parseFloat(p.amount || 0), 0)
    const inn = pendingRec.filter(r => r.due_date === dateStr).reduce((a, r) => a + parseFloat(r.amount || 0), 0)
    if (out > 0 || inn > 0) forecast.push({ date: dateStr, out, in: inn })
  }

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'payables', label: 'Payables — AP (' + pendingPay.length + ')' },
    { id: 'receivables', label: 'Receivables — AR (' + pendingRec.length + ')' },
    { id: 'forecast', label: '30-day forecast' },
  ]

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Cash Flow AP/AR</h1><p>Accounts payable · Accounts receivable</p></div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <button onClick={() => setShowRecModal(true)}>+ Receivable</button>}
          {isAdmin && <button className="primary" onClick={() => setShowPayModal(true)}>+ Payable</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 0, marginBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        {TABS.map(t => <button key={t.id} onClick={() => setActiveTab(t.id)} className={'tab-btn' + (activeTab === t.id ? ' active' : '')}>{t.label}</button>)}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <>
          {activeTab === 'overview' && (
            <div>
              <div className="metrics-grid" style={{ marginBottom: '1.5rem' }}>
                {[
                  ['Accounts payable (AP)', usd(totalAP), 'var(--red)', 'To pay'],
                  ['Accounts receivable (AR)', usd(totalAR), 'var(--green)', 'To collect'],
                  ['Net position', usd(netPosition), netPosition >= 0 ? 'var(--green)' : 'var(--red)', netPosition >= 0 ? 'Favorable' : 'Watch out'],
                  ['Overdue AP', usd(overdueAP), overdueAP > 0 ? 'var(--red)' : 'var(--text-muted)', overdueAP > 0 ? '⚠ Urgent' : 'OK'],
                ].map(([l, v, c, sub]) => (
                  <div key={l} className="metric-card">
                    <div className="label">{l}</div>
                    <div className="value" style={{ color: c, fontSize: 20 }}>{v}</div>
                    <div style={{ fontSize: 11, color: c, marginTop: 4, opacity: 0.7 }}>{sub}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
                <div className="card">
                  <div className="section-title" style={{ marginBottom: '1rem' }}>Upcoming payments</div>
                  {pendingPay.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No payables pending</div> :
                    pendingPay.slice(0, 5).map(p => (
                      <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{p.vendor}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.note || '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right', marginLeft: 12 }}>
                          <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 13 }}>{usd(p.amount)}</div>
                          <StatusChip dueDate={p.due_date} status={p.status} />
                        </div>
                      </div>
                    ))
                  }
                </div>

                <div className="card">
                  <div className="section-title" style={{ marginBottom: '1rem' }}>Upcoming collections</div>
                  {pendingRec.length === 0 ? <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No receivables pending</div> :
                    pendingRec.slice(0, 5).map(r => (
                      <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{r.customer}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{r.note || '—'}</div>
                        </div>
                        <div style={{ textAlign: 'right', marginLeft: 12 }}>
                          <div style={{ fontWeight: 600, color: 'var(--green)', fontSize: 13 }}>{usd(r.amount)}</div>
                          <StatusChip dueDate={r.due_date} status={r.status} />
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
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
                <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Pending · {usd(totalAP)}
                </div>
                {pendingPay.length === 0 ? <div className="empty-state"><p>No pending payables</p></div> : (
                  <table>
                    <thead><tr><th>Vendor</th><th>Note</th><th>Due date</th><th>Status</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
                    <tbody>
                      {pendingPay.map(p => {
                        const isExpanded = expandedId === p.id
                        // Parse breakdown from note if it contains cost breakdown info
                        const isMerchandise = p.note?.toLowerCase().includes('merchandise')
                        const isFreight = p.note?.toLowerCase().includes('freight')
                        const isCustoms = p.note?.toLowerCase().includes('customs')
                        return [
                          <tr key={p.id} style={{ cursor: 'pointer', background: isExpanded ? 'var(--blue-light)' : 'transparent' }} onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                            <td style={{ fontWeight: 500 }}>{p.vendor}</td>
                            <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.note || '—'}</td>
                            <td>{p.due_date ? fdate(p.due_date) : '—'}</td>
                            <td><StatusChip dueDate={p.due_date} status={p.status} /></td>
                            <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--red)' }}>{usd(p.amount)}</td>
                            <td style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
                              <button onClick={() => markPaid('payable', p.id)} disabled={saving} style={{ fontSize: 11, padding: '4px 10px', background: 'var(--green-light)', color: 'var(--green)', border: 'none', borderRadius: 6, cursor: 'pointer' }}>✓ Paid</button>
                              <button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => del('payable', p.id)}>×</button>
                            </td>
                          </tr>,
                          isExpanded && (
                            <tr key={p.id + '_detail'}>
                              <td colSpan={6} style={{ background: 'var(--blue-light)', padding: '12px 20px', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--navy)', marginBottom: 10 }}>Payment breakdown</div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                                  <div style={{ padding: '8px 10px', background: 'white', borderRadius: 6 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Type</div>
                                    <div style={{ fontWeight: 600 }}>{isMerchandise ? 'Merchandise' : isFreight ? 'Freight / Transport' : isCustoms ? 'Customs / Duties' : 'Payable'}</div>
                                  </div>
                                  <div style={{ padding: '8px 10px', background: 'white', borderRadius: 6 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Amount due</div>
                                    <div style={{ fontWeight: 600, color: 'var(--red)', fontSize: 16 }}>{usd(p.amount)}</div>
                                  </div>
                                  <div style={{ padding: '8px 10px', background: 'white', borderRadius: 6 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Vendor</div>
                                    <div style={{ fontWeight: 500 }}>{p.vendor}</div>
                                  </div>
                                  <div style={{ padding: '8px 10px', background: 'white', borderRadius: 6 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Reference</div>
                                    <div style={{ fontWeight: 500 }}>{p.note || '—'}</div>
                                  </div>
                                  {p.due_date && (
                                    <div style={{ padding: '8px 10px', background: 'white', borderRadius: 6 }}>
                                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Due date</div>
                                      <div style={{ fontWeight: 500 }}>{fdate(p.due_date)}</div>
                                    </div>
                                  )}
                                  <div style={{ padding: '8px 10px', background: 'white', borderRadius: 6 }}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 3 }}>Created</div>
                                    <div style={{ fontWeight: 500 }}>{p.created_at ? new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
                                  </div>
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
              {paidPay.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Paid · {paidPay.length}</div>
                  <table>
                    <thead><tr><th>Vendor</th><th>Note</th><th>Paid on</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                    <tbody>
                      {paidPay.map(p => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500 }}>{p.vendor}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{p.note || '—'}</td>
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
              <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
                <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Pending · {usd(totalAR)}
                </div>
                {pendingRec.length === 0 ? <div className="empty-state"><p>No pending receivables</p></div> : (
                  <table>
                    <thead><tr><th>Customer</th><th>Note</th><th>Due date</th><th>Status</th><th style={{ textAlign: 'right' }}>Amount</th><th></th></tr></thead>
                    <tbody>
                      {pendingRec.map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 500 }}>{r.customer}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.note || '—'}</td>
                          <td>{r.due_date ? fdate(r.due_date) : '—'}</td>
                          <td><StatusChip dueDate={r.due_date} status={r.status} /></td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--green)' }}>{usd(r.amount)}</td>
                          <td style={{ display: 'flex', gap: 6 }}>
                            {isAdmin && <button onClick={() => markPaid('receivable', r.id)} disabled={saving} style={{ fontSize: 11, padding: '4px 10px', background: 'var(--green-light)', color: 'var(--green)', border: 'none', borderRadius: 6, cursor: 'pointer' }}>✓ Collected</button>}
                            {isAdmin && <button className="danger" style={{ fontSize: 11, padding: '4px 8px' }} onClick={() => del('receivable', r.id)}>×</button>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              {paidRec.length > 0 && (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '12px 16px', background: 'var(--cream)', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 12, color: 'var(--green)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Collected · {paidRec.length}</div>
                  <table>
                    <thead><tr><th>Customer</th><th>Note</th><th>Collected on</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                    <tbody>
                      {paidRec.map(r => (
                        <tr key={r.id}>
                          <td style={{ fontWeight: 500 }}>{r.customer}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{r.note || '—'}</td>
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
              <div className="alert alert-info" style={{ marginBottom: '1.25rem' }}>Forecast based on due dates of pending payables and receivables over the next 30 days.</div>
              {forecast.length === 0 ? (
                <div className="card"><div className="empty-state"><div style={{ fontSize: 36 }}>📅</div><p>No due dates in the next 30 days</p></div></div>
              ) : (
                <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                  <table>
                    <thead><tr><th>Date</th><th style={{ textAlign: 'right', color: 'var(--green)' }}>Collections</th><th style={{ textAlign: 'right', color: 'var(--red)' }}>Payments</th><th style={{ textAlign: 'right' }}>Net</th></tr></thead>
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

      {showPayModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowPayModal(false)}>
          <div className="modal">
            <h2>New payable</h2>
            <div className="form-group"><label>Vendor *</label><input type="text" placeholder="The French Lab, FedEx…" value={payForm.vendor} onChange={e => setPayForm({ ...payForm, vendor: e.target.value })} /></div>
            <div className="form-row">
              <div className="form-group"><label>Amount ($) *</label><input type="number" placeholder="0.00" value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} /></div>
              <div className="form-group"><label>Due date</label><input type="date" value={payForm.due_date} onChange={e => setPayForm({ ...payForm, due_date: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Reference / Note</label><input type="text" placeholder="Invoice number, description…" value={payForm.note} onChange={e => setPayForm({ ...payForm, note: e.target.value })} /></div>
            <div className="form-actions">
              <button className="primary" onClick={savePayable} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setShowPayModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showRecModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowRecModal(false)}>
          <div className="modal">
            <h2>New receivable</h2>
            <div className="form-group"><label>Customer *</label><input type="text" placeholder="Joseph's Salon, Clique Boutique…" value={recForm.customer} onChange={e => setRecForm({ ...recForm, customer: e.target.value })} /></div>
            <div className="form-row">
              <div className="form-group"><label>Amount ($) *</label><input type="number" placeholder="0.00" value={recForm.amount} onChange={e => setRecForm({ ...recForm, amount: e.target.value })} /></div>
              <div className="form-group"><label>Due date</label><input type="date" value={recForm.due_date} onChange={e => setRecForm({ ...recForm, due_date: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Reference / Note</label><input type="text" placeholder="Invoice number…" value={recForm.note} onChange={e => setRecForm({ ...recForm, note: e.target.value })} /></div>
            <div className="form-actions">
              <button className="primary" onClick={saveReceivable} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
              <button onClick={() => setShowRecModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
