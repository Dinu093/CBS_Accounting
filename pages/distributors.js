import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd, fdate, initials } from '../lib/constants'
import { useAuth } from '../lib/auth'

export async function getServerSideProps() { return { props: {} } }

const EMPTY = { name: '', channel: 'Wholesale', contact_name: '', email: '', phone: '', discount_pct: 40, payment_terms_days: 30, resale_certificate: '', resale_certificate_expiry: '', notes: '' }

export default function Distributors() {
  const { isAdmin } = useAuth()
  const [distributors, setDistributors] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [selected, setSelected] = useState(null)

  const load = () => { setLoading(true); fetch('/api/distributors').then(r => r.json()).then(d => { setDistributors(Array.isArray(d) ? d : []); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const openNew = () => { setEditing(null); setForm(EMPTY); setShowModal(true) }
  const openEdit = (d) => { setEditing(d.id); setForm({ name: d.name, channel: d.channel || 'Wholesale', contact_name: d.contact_name || '', email: d.email || '', phone: d.phone || '', discount_pct: d.discount_pct || 40, payment_terms_days: d.payment_terms_days || 30, resale_certificate: d.resale_certificate || '', resale_certificate_expiry: d.resale_certificate_expiry || '', notes: d.notes || '' }); setShowModal(true) }

  const save = async () => {
    if (!form.name) return
    setSaving(true)
    const body = { ...form, discount_pct: +form.discount_pct, payment_terms_days: +form.payment_terms_days }
    if (editing) { body.id = editing; await fetch('/api/distributors', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }
    else await fetch('/api/distributors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setSaving(false); setShowModal(false); load()
  }

  const del = async (id) => {
    if (!confirm('Delete distributor?')) return
    await fetch('/api/distributors?id=' + id, { method: 'DELETE' }); load()
  }

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Distributors</h1><p>{distributors.length} distributor{distributors.length !== 1 ? 's' : ''}</p></div>
        {isAdmin && <button className="btn btn-primary" onClick={openNew}>+ New distributor</button>}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Channel</th><th>Contact</th><th className="td-right">Discount</th><th className="td-right">Net terms</th><th>Resale cert.</th><th>Locations</th>{isAdmin && <th></th>}</tr></thead>
            <tbody>
              {distributors.length === 0 ? (
                <tr><td colSpan={isAdmin ? 8 : 7} style={{textAlign:'center',color:'var(--text-3)',padding:40}}>No distributors yet</td></tr>
              ) : distributors.map(d => (
                <tr key={d.id} style={{cursor:'pointer'}} onClick={() => setSelected(selected?.id === d.id ? null : d)}>
                  <td>
                    <div style={{display:'flex',alignItems:'center',gap:10}}>
                      <div className="avatar">{initials(d.name)}</div>
                      <span style={{fontWeight:500}}>{d.name}</span>
                    </div>
                  </td>
                  <td><span className="badge badge-gray">{d.channel}</span></td>
                  <td className="td-muted">{d.contact_name || '—'}</td>
                  <td className="td-right"><span style={{fontWeight:600,color:'var(--green)'}}>{d.discount_pct}%</span></td>
                  <td className="td-right td-muted">Net {d.payment_terms_days}</td>
                  <td>{d.resale_certificate ? <span className="badge badge-green">On file</span> : <span className="badge badge-amber">Missing</span>}</td>
                  <td className="td-muted">{(d.distributor_locations||[]).length} location{(d.distributor_locations||[]).length !== 1 ? 's' : ''}</td>
                  {isAdmin && <td onClick={e => e.stopPropagation()}><div style={{display:'flex',gap:6}}><button className="btn btn-outline btn-sm" onClick={() => openEdit(d)}>Edit</button><button className="btn btn-danger btn-sm" onClick={() => del(d.id)}>Delete</button></div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div style={{marginTop:16}} className="card">
          <div className="card-header">
            <div className="card-title">{selected.name} — detail</div>
            <button className="btn-ghost" onClick={() => setSelected(null)}>Close</button>
          </div>
          <div className="card-body">
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:12,marginBottom:16}}>
              {[['Email',selected.email||'—'],['Phone',selected.phone||'—'],['Notes',selected.notes||'—']].map(([l,v])=>(
                <div key={l}><div style={{fontSize:11,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:4}}>{l}</div><div style={{fontSize:13}}>{v}</div></div>
              ))}
            </div>
            {(selected.distributor_locations||[]).length > 0 && (
              <>
                <div style={{fontSize:11,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Locations</div>
                <div style={{display:'flex',flexDirection:'column',gap:6}}>
                  {selected.distributor_locations.map((l,i)=>(
                    <div key={i} style={{fontSize:13,color:'var(--text-2)'}}>{l.name || l.address} — {l.city}, {l.state} {l.zip}</div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <div className="modal-header"><h2>{editing ? 'Edit distributor' : 'New distributor'}</h2><button className="modal-close" onClick={() => setShowModal(false)}>×</button></div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Name *</label><input type="text" value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Joseph's Salon" /></div>
                <div className="form-group"><label className="form-label">Channel</label><select value={form.channel} onChange={e => setForm({...form,channel:e.target.value})}><option>Wholesale</option><option>E-commerce</option></select></div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Contact name</label><input type="text" value={form.contact_name} onChange={e => setForm({...form,contact_name:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} /></div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Discount %</label><input type="number" value={form.discount_pct} onChange={e => setForm({...form,discount_pct:e.target.value})} min="0" max="100" /></div>
                <div className="form-group"><label className="form-label">Payment terms (days)</label><input type="number" value={form.payment_terms_days} onChange={e => setForm({...form,payment_terms_days:e.target.value})} /></div>
              </div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Resale certificate #</label><input type="text" value={form.resale_certificate} onChange={e => setForm({...form,resale_certificate:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Certificate expiry</label><input type="date" value={form.resale_certificate_expiry} onChange={e => setForm({...form,resale_certificate_expiry:e.target.value})} /></div>
              </div>
              <div className="form-group"><label className="form-label">Notes</label><textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} rows={2} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':editing?'Update':'Create'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
