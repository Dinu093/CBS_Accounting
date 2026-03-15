import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { usd, fdate } from '../lib/constants'
import { useAuth } from '../lib/auth'

export async function getServerSideProps() { return { props: {} } }

function StatusBadge({ dueDate, status }) {
  if (status==='paid') return <span className="badge badge-green">Paid</span>
  if (!dueDate) return <span className="badge badge-gray">No due date</span>
  const days = Math.ceil((new Date(dueDate)-new Date())/86400000)
  if (days<0) return <span className="badge badge-red">Overdue {Math.abs(days)}d</span>
  if (days<=7) return <span className="badge badge-amber">Due in {days}d</span>
  return <span className="badge badge-blue">Due in {days}d</span>
}

export default function APAR() {
  const { isAdmin } = useAuth()
  const [payables, setPayables] = useState([])
  const [receivables, setReceivables] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('overview')
  const [showPayModal, setShowPayModal] = useState(false)
  const [showRecModal, setShowRecModal] = useState(false)
  const [payForm, setPayForm] = useState({ vendor: '', amount: '', due_date: '', note: '' })
  const [recForm, setRecForm] = useState({ customer: '', amount: '', due_date: '', note: '' })
  const [saving, setSaving] = useState(false)

  const load = () => { setLoading(true); Promise.all([fetch('/api/payables').then(r=>r.json()),fetch('/api/receivables').then(r=>r.json())]).then(([p,r])=>{ setPayables(Array.isArray(p)?p:[]); setReceivables(Array.isArray(r)?r:[]); setLoading(false) }) }
  useEffect(() => { load() }, [])

  const markPaid = async (type, id) => { const url = type==='ap'?'/api/payables':'/api/receivables'; await fetch(url,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status:'paid',paid_date:new Date().toISOString().split('T')[0]})}); load() }
  const del = async (type, id) => { if(!confirm('Delete?'))return; const url=type==='ap'?'/api/payables':'/api/receivables'; await fetch(url+'?id='+id,{method:'DELETE'}); load() }
  const saveAP = async () => { setSaving(true); await fetch('/api/payables',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payForm,amount:+payForm.amount,status:'pending'})}); setSaving(false); setShowPayModal(false); setPayForm({vendor:'',amount:'',due_date:'',note:''}); load() }
  const saveAR = async () => { setSaving(true); await fetch('/api/receivables',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...recForm,amount:+recForm.amount,status:'pending'})}); setSaving(false); setShowRecModal(false); setRecForm({customer:'',amount:'',due_date:'',note:''}); load() }

  const pendingAP = payables.filter(p=>p.status!=='paid'), paidAP = payables.filter(p=>p.status==='paid')
  const pendingAR = receivables.filter(r=>r.status!=='paid'), paidAR = receivables.filter(r=>r.status==='paid')
  const totalAP = pendingAP.reduce((a,p)=>a+ +p.amount,0)
  const totalAR = pendingAR.reduce((a,r)=>a+ +r.amount,0)
  const overdue = pendingAP.filter(p=>p.due_date&&new Date(p.due_date)<new Date()).reduce((a,p)=>a+ +p.amount,0)

  return (
    <Layout>
      <div className="page-header">
        <div><h1>AP / AR</h1><p>Accounts payable · Accounts receivable</p></div>
        {isAdmin && <div style={{display:'flex',gap:8}}><button className="btn btn-outline" onClick={()=>setShowRecModal(true)}>+ Receivable</button><button className="btn btn-primary" onClick={()=>setShowPayModal(true)}>+ Payable</button></div>}
      </div>

      <div className="kpi-grid kpi-grid-4" style={{marginBottom:24}}>
        <div className="kpi"><div className="kpi-label">Accounts payable</div><div className="kpi-value red" style={{fontSize:20}}>{usd(totalAP)}</div><div className="kpi-sub">To pay</div></div>
        <div className="kpi"><div className="kpi-label">Accounts receivable</div><div className="kpi-value green" style={{fontSize:20}}>{usd(totalAR)}</div><div className="kpi-sub">To collect</div></div>
        <div className="kpi"><div className="kpi-label">Net position</div><div className={`kpi-value ${totalAR-totalAP>=0?'green':'red'}`} style={{fontSize:20}}>{usd(totalAR-totalAP)}</div></div>
        <div className="kpi"><div className="kpi-label">Overdue AP</div><div className={`kpi-value ${overdue>0?'red':''}`} style={{fontSize:20}}>{usd(overdue)}</div><div className="kpi-sub">{overdue>0?'⚠ Urgent':'OK'}</div></div>
      </div>

      <div className="tabs">
        {[['overview','Overview'],['ap','Payables — AP ('+pendingAP.length+')'],['ar','Receivables — AR ('+pendingAR.length+')']].map(([v,l])=>(
          <button key={v} className={`tab${tab===v?' active':''}`} onClick={()=>setTab(v)}>{l}</button>
        ))}
      </div>

      {loading ? <div className="loading">Loading…</div> : (
        <>
          {tab==='overview' && (
            <div className="grid-2">
              <div className="card">
                <div className="card-header"><div className="card-title">Upcoming payments</div></div>
                {pendingAP.length===0 ? <div className="empty"><p>No pending payables</p></div> :
                  <table><tbody>{pendingAP.slice(0,5).map(p=>(
                    <tr key={p.id}>
                      <td style={{fontWeight:500}}>{p.vendor}</td>
                      <td className="td-muted" style={{fontSize:12}}>{p.note||'—'}</td>
                      <td><StatusBadge dueDate={p.due_date} status={p.status} /></td>
                      <td className="td-right" style={{fontWeight:600,color:'var(--red)'}}>{usd(p.amount)}</td>
                    </tr>
                  ))}</tbody></table>
                }
              </div>
              <div className="card">
                <div className="card-header"><div className="card-title">Upcoming collections</div></div>
                {pendingAR.length===0 ? <div className="empty"><p>No pending receivables</p></div> :
                  <table><tbody>{pendingAR.slice(0,5).map(r=>(
                    <tr key={r.id}>
                      <td style={{fontWeight:500}}>{r.customer}</td>
                      <td className="td-muted" style={{fontSize:12}}>{r.note||'—'}</td>
                      <td><StatusBadge dueDate={r.due_date} status={r.status} /></td>
                      <td className="td-right" style={{fontWeight:600,color:'var(--green)'}}>{usd(r.amount)}</td>
                    </tr>
                  ))}</tbody></table>
                }
              </div>
            </div>
          )}

          {tab==='ap' && (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="table-wrap">
                <div style={{padding:'10px 16px',background:'var(--bg-2)',borderBottom:'1px solid var(--border)',fontSize:11,fontWeight:500,color:'var(--red)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Pending · {usd(totalAP)}</div>
                {pendingAP.length===0 ? <div className="empty"><p>No pending payables</p></div> : (
                  <table><thead><tr><th>Vendor</th><th>Note</th><th>Due date</th><th>Status</th><th className="td-right">Amount</th>{isAdmin&&<th></th>}</tr></thead>
                  <tbody>{pendingAP.map(p=>(
                    <tr key={p.id}>
                      <td style={{fontWeight:500}}>{p.vendor}</td>
                      <td className="td-muted">{p.note||'—'}</td>
                      <td className="td-muted">{p.due_date?fdate(p.due_date):'—'}</td>
                      <td><StatusBadge dueDate={p.due_date} status={p.status} /></td>
                      <td className="td-right td-mono" style={{fontWeight:600,color:'var(--red)'}}>{usd(p.amount)}</td>
                      {isAdmin&&<td><div style={{display:'flex',gap:6}}><button className="btn-green" onClick={()=>markPaid('ap',p.id)}>✓ Paid</button><button className="btn btn-danger btn-sm" onClick={()=>del('ap',p.id)}>×</button></div></td>}
                    </tr>
                  ))}</tbody></table>
                )}
              </div>
              {paidAP.length>0&&<div className="table-wrap"><div style={{padding:'10px 16px',background:'var(--bg-2)',borderBottom:'1px solid var(--border)',fontSize:11,fontWeight:500,color:'var(--green)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Paid · {paidAP.length}</div>
                <table><thead><tr><th>Vendor</th><th>Note</th><th>Paid on</th><th className="td-right">Amount</th></tr></thead>
                <tbody>{paidAP.map(p=><tr key={p.id}><td style={{fontWeight:500}}>{p.vendor}</td><td className="td-muted">{p.note||'—'}</td><td className="td-muted">{p.paid_date?fdate(p.paid_date):'—'}</td><td className="td-right td-muted td-mono">{usd(p.amount)}</td></tr>)}</tbody></table></div>}
            </div>
          )}

          {tab==='ar' && (
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div className="table-wrap">
                <div style={{padding:'10px 16px',background:'var(--bg-2)',borderBottom:'1px solid var(--border)',fontSize:11,fontWeight:500,color:'var(--green)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Pending · {usd(totalAR)}</div>
                {pendingAR.length===0 ? <div className="empty"><p>No pending receivables</p></div> : (
                  <table><thead><tr><th>Customer</th><th>Note</th><th>Due date</th><th>Status</th><th className="td-right">Amount</th>{isAdmin&&<th></th>}</tr></thead>
                  <tbody>{pendingAR.map(r=>(
                    <tr key={r.id}>
                      <td style={{fontWeight:500}}>{r.customer}</td>
                      <td className="td-muted">{r.note||'—'}</td>
                      <td className="td-muted">{r.due_date?fdate(r.due_date):'—'}</td>
                      <td><StatusBadge dueDate={r.due_date} status={r.status} /></td>
                      <td className="td-right td-mono" style={{fontWeight:600,color:'var(--green)'}}>{usd(r.amount)}</td>
                      {isAdmin&&<td><div style={{display:'flex',gap:6}}><button className="btn-green" onClick={()=>markPaid('ar',r.id)}>✓ Collected</button><button className="btn btn-danger btn-sm" onClick={()=>del('ar',r.id)}>×</button></div></td>}
                    </tr>
                  ))}</tbody></table>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {showPayModal && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setShowPayModal(false)}>
          <div className="modal">
            <div className="modal-header"><h2>New payable</h2><button className="modal-close" onClick={()=>setShowPayModal(false)}>×</button></div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Vendor *</label><input type="text" value={payForm.vendor} onChange={e=>setPayForm({...payForm,vendor:e.target.value})} placeholder="The French Insight, FedEx…" /></div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Amount ($) *</label><input type="number" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Due date</label><input type="date" value={payForm.due_date} onChange={e=>setPayForm({...payForm,due_date:e.target.value})} /></div>
              </div>
              <div className="form-group"><label className="form-label">Reference</label><input type="text" value={payForm.note} onChange={e=>setPayForm({...payForm,note:e.target.value})} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowPayModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAP} disabled={saving}>{saving?'Saving…':'Save'}</button>
            </div>
          </div>
        </div>
      )}
      {showRecModal && (
        <div className="modal-backdrop" onClick={e=>e.target===e.currentTarget&&setShowRecModal(false)}>
          <div className="modal">
            <div className="modal-header"><h2>New receivable</h2><button className="modal-close" onClick={()=>setShowRecModal(false)}>×</button></div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Customer *</label><input type="text" value={recForm.customer} onChange={e=>setRecForm({...recForm,customer:e.target.value})} /></div>
              <div className="form-row form-row-2">
                <div className="form-group"><label className="form-label">Amount ($) *</label><input type="number" value={recForm.amount} onChange={e=>setRecForm({...recForm,amount:e.target.value})} /></div>
                <div className="form-group"><label className="form-label">Due date</label><input type="date" value={recForm.due_date} onChange={e=>setRecForm({...recForm,due_date:e.target.value})} /></div>
              </div>
              <div className="form-group"><label className="form-label">Reference</label><input type="text" value={recForm.note} onChange={e=>setRecForm({...recForm,note:e.target.value})} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowRecModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={saveAR} disabled={saving}>{saving?'Saving…':'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
