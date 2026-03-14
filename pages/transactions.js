import { useState, useRef } from 'react'
import Layout from '../components/Layout'
import { CATEGORIES, CAT_KEYS, TYPE_COLORS, usd, fdate } from '../lib/constants'
import * as XLSX from 'xlsx'

export async function getServerSideProps() {
  return { props: {} }
}

function getFileType(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv')) return 'csv'
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.xlsm')) return 'excel'
  if (file.type.startsWith('image/')) return 'image'
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf'
  return 'unknown'
}

async function readSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        let text = ''
        wb.SheetNames.forEach(name => {
          const ws = wb.Sheets[name]
          const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false })
          if (csv.trim()) text += 'Sheet: ' + name + '\n' + csv + '\n\n'
        })
        resolve(text.trim())
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

async function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(r.result.split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })
}

export default function Upload() {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [pending, setPending] = useState([])
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null) // { saved, duplicates, details }
  const inputRef = useRef()

  const analyze = async (file) => {
    const ftype = getFileType(file)
    if (ftype === 'unknown') { alert('Format non supporté. Utilise JPG, PNG, PDF, CSV ou XLSX.'); return }
    setLoading(true)
    setResult(null)

    try {
      let body
      if (ftype === 'csv' || ftype === 'excel') {
        setLoadingMsg('Lecture du fichier…')
        const content = await readSpreadsheet(file)
        setLoadingMsg('Analyse par Claude…')
        body = { type: 'spreadsheet', content, filename: file.name }
      } else {
        setLoadingMsg('Analyse du document…')
        const content = await toBase64(file)
        body = { type: ftype, content, mediaType: file.type, filename: file.name }
      }

      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      const withIds = data.transactions.map((t, i) => ({ ...t, _pid: Date.now() + i }))
      setPending(prev => [...prev, ...withIds])
    } catch (err) {
      alert('Erreur lors de l\'analyse : ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const acceptAll = async () => {
    setSaving(true)
    const resp = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: pending.map(({ _pid, ...t }) => t) })
    })
    const data = await resp.json()
    setSaving(false)

    setResult({
      saved: data.inserted ? data.inserted.length : 0,
      duplicates: data.duplicates || [],
      message: data.message || ''
    })
    setPending([])
  }

  const acceptOne = async (tx) => {
    const { _pid, ...t } = tx
    const resp = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: [t] })
    })
    const data = await resp.json()

    if (data.duplicates && data.duplicates.length > 0) {
      const dup = data.duplicates[0]
      setResult({
        saved: 0,
        duplicates: [dup],
        message: 'Doublon détecté — transaction ignorée'
      })
    } else {
      setResult({
        saved: 1,
        duplicates: [],
        message: '1 transaction enregistrée.'
      })
    }
    setPending(prev => prev.filter(p => p._pid !== _pid))
  }

  const rejectOne = (_pid) => setPending(prev => prev.filter(p => p._pid !== _pid))
  const updatePending = (_pid, field, value) => {
    setPending(prev => prev.map(p => p._pid === _pid ? { ...p, [field]: value } : p))
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Upload document</h1>
          <p>Factures, relevés bancaires, reçus — Claude extrait les transactions automatiquement</p>
        </div>
      </div>

      {/* Result banner */}
      {result && (
        <div style={{ marginBottom: '1rem' }}>
          {result.saved > 0 && (
            <div className="alert alert-success">
              ✓ {result.saved} transaction{result.saved > 1 ? 's' : ''} enregistrée{result.saved > 1 ? 's' : ''} avec succès
            </div>
          )}
          {result.duplicates.length > 0 && (
            <div className="alert alert-warning">
              <div style={{ fontWeight: 600, marginBottom: 8 }}>
                ⚠ {result.duplicates.length} doublon{result.duplicates.length > 1 ? 's' : ''} détecté{result.duplicates.length > 1 ? 's' : ''} et ignoré{result.duplicates.length > 1 ? 's' : ''}
              </div>
              {result.duplicates.map((d, i) => (
                <div key={i} style={{ fontSize: 12, padding: '6px 0', borderTop: i > 0 ? '1px solid #FFE0B2' : 'none' }}>
                  <strong>{d.newTx?.description || 'Transaction'}</strong> · {d.newTx?.date} · {usd(d.newTx?.amount)}
                  <br />
                  <span style={{ color: '#E65100' }}>{d.reason} — déjà enregistrée le {d.existingTx?.date}</span>
                </div>
              ))}
            </div>
          )}
          {result.saved === 0 && result.duplicates.length === 0 && (
            <div className="alert alert-info">ℹ {result.message}</div>
          )}
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*,.pdf,.csv,.xlsx,.xls" style={{ display: 'none' }}
        onChange={e => e.target.files[0] && analyze(e.target.files[0])} />

      <div
        className={'drop-zone' + (dragging ? ' drag-over' : '')}
        style={{ marginBottom: '1.5rem' }}
        onClick={() => !loading && inputRef.current && inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); e.dataTransfer.files[0] && analyze(e.dataTransfer.files[0]) }}
      >
        {loading ? (
          <>
            <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
            <div style={{ fontWeight: 500, marginBottom: 6 }}>{loadingMsg}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Claude analyse votre document…</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 36, marginBottom: 10 }}>⬆️</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Déposer un document ici</div>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              {[['JPG/PNG','#E6F1FB','#0C447C'],['PDF','#FAECE7','#712B13'],['CSV','#EAF3DE','#27500A'],['XLSX','#FFF3E0','#E65100']]
                .map(function(item) { return (
                  <span key={item[0]} className="pill" style={{ background: item[1], color: item[2], fontSize: 12 }}>{item[0]}</span>
                )})}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Cliquer pour parcourir · Glisser-déposer accepté</div>
          </>
        )}
      </div>

      {pending.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600 }}>
              {pending.length} transaction{pending.length > 1 ? 's' : ''} extraite{pending.length > 1 ? 's' : ''} — à valider
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="primary" onClick={acceptAll} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Tout accepter (' + pending.length + ')'}
              </button>
              <button onClick={() => setPending([])}>Tout rejeter</button>
            </div>
          </div>

          {pending.map(tx => {
            const type = CATEGORIES[tx.category]
            const c = TYPE_COLORS[type] || TYPE_COLORS.opex
            return (
              <div key={tx._pid} className="card" style={{ marginBottom: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 200px 120px', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                  <input type="date" value={tx.date} onChange={e => updatePending(tx._pid, 'date', e.target.value)} />
                  <input type="text" value={tx.description} onChange={e => updatePending(tx._pid, 'description', e.target.value)} />
                  <select value={tx.category} onChange={e => updatePending(tx._pid, 'category', e.target.value)}>
                    {CAT_KEYS.map(k => <option key={k}>{k}</option>)}
                  </select>
                  <input type="number" value={tx.amount} onChange={e => updatePending(tx._pid, 'amount', e.target.value)} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="pill" style={{ background: c.bg, color: c.text }}>{tx.category}</span>
                  {tx.note && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tx.note}</span>}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontWeight: 600, fontSize: 14, color: (type === 'revenue' || type === 'capital') ? '#2E7D32' : '#C62828' }}>
                    {usd(tx.amount)}
                  </span>
                  <button style={{ background: '#EAF3DE', color: '#27500A', border: 'none', fontSize: 12, padding: '5px 14px', borderRadius: 6, cursor: 'pointer' }} onClick={() => acceptOne(tx)}>
                    ✓ Accepter
                  </button>
                  <button style={{ background: 'var(--gray-light)', border: 'none', fontSize: 12, padding: '5px 14px', borderRadius: 6, cursor: 'pointer' }} onClick={() => rejectOne(tx._pid)}>
                    Rejeter
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5rem' }}>
        <div className="section-title" style={{ marginBottom: '0.75rem' }}>Conseils par format</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', fontSize: 13 }}>
          <div><strong style={{ color: '#0C447C' }}>CSV / XLSX</strong> — idéal pour les relevés bancaires exportés depuis ta banque. Traite mois par mois.</div>
          <div><strong style={{ color: '#712B13' }}>PDF / Image</strong> — factures fournisseurs, reçus, invoices. Scanne en bonne résolution.</div>
        </div>
      </div>
    </Layout>
  )
}
