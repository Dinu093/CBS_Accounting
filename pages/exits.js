import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd, fdate, EXIT_TYPES } from '../lib/constants'
import { useAuth } from '../lib/auth'

export async function getServerSideProps() { return { props: {} } }

export default function Exits() {
  const { isAdmin } = useAuth()
  const [exits, setExits] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ date: new Date().toISOString().split('T')[0], exit_type: 'gifted', recipient: '', campaign: '', event: '', notes: '' })
  const [lines, setLines] = useState([{ product_id: '', quantity: '' }])
  const [saving, setSaving] = useState(false)

  const load = () => { setLoading(true); Promise.all([fetch('/api/exits').then(r=>r.json()),fetch('/api/products').then(r=>r.json())]).then(([e,p])=>{ setExits(Array.isArray(e)?e:[]); setProducts(Array.isArray(p)?p:[]); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const save = async () => {
    const validLines = lines.filter(l=>l.product_id&&l.quantity)
    if (!form.date||validLines.length===0) { alert('Fill date and at least one product'); return }
    setSaving(true)
    const items = validLines.map(l => { const p=products.find(x=>x.id===l.product_id); return { product_id:l.product_id, quantity:+l.quantity, unit_cost:+(p?.unit_cost||0) } })
    await fetch('/api/exits',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({exit:form,items})})
    setSaving(false); setShowModal(false); setForm({date:new Date().toISOString().split('T')[0],exit_type:'gifted',recipient:'',campaign:'',event:'',notes:''}); setLines([{product_id:'',quantity:''}]); load()
  }

  const del = async (id) => { if(!confirm('Delete?'))return; await fetch('/api/exits?id='+id,{method:'DELETE'}); load() }

  const typeLabels = Object.fromEntries(EXIT_TYPES.map(t=>[t.value,t]))
  const totalUnits = exits.reduce((a,e)=>(e.product_exit_items||[]).reduce((b,i)=>b+ +i.quantity,0)+a,0)
  const totalCost = exits.reduce((a,e)=>(e.product_exit_items||[]).reduce((b,i)=>b+ +i.total_cost,0)+a,0)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>Product exits</h1><p>Gifted · Samples · Losses · {totalUnits} units · {usd(totalCost)} at cost</p></div>
        {isAdmin && <button className="btn btn-primary" onClick={()=>setShowModal(true)}>+ New exit</button>}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Type</th><th>Recipient / Campaign</th><th>Products</th><th className="td-right">Units</th><th className="td-right">Cost</th><th>Accounting</th>{isAdmin&&<th></th>}</tr></thead>
            <tbody>
              {exits.length===0 ? <tr><td colSpan={isAdmin?8:7} style={{textAlign:'center',color:'var(--text-3)',padding:40}}>No exits recorded</td></tr> :
                exits.map(e=>{
                  const type = typeLabels[e.exit_type]
                  const units = (e.product_exit_items||[]).reduce((a,i)=>a+ +i.quantity,0)
                  const cost = (e.product_exit_items||[]).reduce((a,i)=>a+ +i.total_cost,0)
                  return (
                    <tr key={e.id}>
                      <td className="td-muted">{fdate(e.date)}</td>
                      <td><span className={`badge ${e.exit_type==='gifted'?'badge-blue':e.exit_type==='sample'?'badge-amber':e.exit_type==='loss'?'badge-red':'badge-gray'}`}>{type?.label||e.exit_type}</span></td>
                      <td style={{fontWeight:500}}>{e.recipient||e.campaign||e.event||'—'}</td>
                      <td className="td-muted" style={{fontSize:12}}>{(e.product_exit_items||[]).map(i=>i.inventory?.product_name+' ×'+i.quantity).join(', ')}</td>
                      <td className="td-right td-mono">{units}</td>
                      <td className="td-right td-mono" style={{color:'var(--amber)'}}>{usd(cost)}</td>
                      <td className="td-muted" style={{fontSize:11}}>{type?.accounting||'—'}</td>
                      {isAdmin&&<td><button className="btn btn-danger btn-sm" onClick={()=>del(e.id)}>Delete</button></td>}
                    </tr>
                  )
                })
              }
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setShowModal(false)}>
          <div className="modal">
            <div className="modal-header"><h2>New product exit</h2><button className="modal-close" onClick={()=>setShowModal(false)}>×</button></div>
            <div className="modal-body">
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Date *</label><input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Type</label>
                  <select value={form.exit_type} onChange={e=>setForm({...form,exit_type:e.target.value})}>
                    {EXIT_TYPES.map(t=><option key={t.value} value={t.value}>{t.label} — {t.accounting}</option>)}
                  </select>
                </div>
              </div>
              {form.exit_type==='gifted'&&<div className="form-group"><label className="form-label">Recipient / Influencer</label><input type="text" value={form.recipient} onChange={e=>setForm({...form,recipient:e.target.value})} placeholder="@influencer, Press name…" /></div>}
              {(form.exit_type==='gifted'||form.exit_type==='sample')&&<div className="form-group"><label className="form-label">Campaign</label><input type="text" value={form.campaign} onChange={e=>setForm({...form,campaign:e.target.value})} placeholder="Spring 2026 launch…" /></div>}
              {(form.exit_type==='sample'||form.exit_type==='demo'||form.exit_type==='internal')&&<div className="form-group"><label className="form-label">Event / Location</label><input type="text" value={form.event} onChange={e=>setForm({...form,event:e.target.value})} placeholder="Trade show, demo…" /></div>}
              <div className="form-group"><label className="form-label">Notes</label><input type="text" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} /></div>
              <div style={{fontSize:11,fontWeight:500,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:8}}>Products</div>
              {lines.map((l,i)=>(
                <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 100px 28px',gap:8,marginBottom:8,alignItems:'end'}}>
                  <select value={l.product_id} onChange={e=>setLines(prev=>prev.map((x,xi)=>xi===i?{...x,product_id:e.target.value}:x))}>
                    <option value="">Select product…</option>
                    {products.map(p=><option key={p.id} value={p.id}>{p.product_name} (stock: {p.quantity_on_hand})</option>)}
                  </select>
                  <input type="number" placeholder="Qty" value={l.quantity} onChange={e=>setLines(prev=>prev.map((x,xi)=>xi===i?{...x,quantity:e.target.value}:x))} />
                  <button onClick={()=>setLines(prev=>prev.filter((_,xi)=>xi!==i))} style={{background:'none',border:'none',color:'var(--text-3)',fontSize:18,cursor:'pointer'}}>×</button>
                </div>
              ))}
              <button className="btn btn-outline btn-sm" onClick={()=>setLines(p=>[...p,{product_id:'',quantity:''}])}>+ Add product</button>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':'Record exit'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
