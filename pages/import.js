import { useState, useRef } from 'react'
import Layout from '../components/Layout'
import { CATEGORIES, CAT_KEYS, TYPE_COLORS, usd } from '../lib/constants'
import * as XLSX from 'xlsx'

export async function getServerSideProps() { return { props: {} } }

async function readFile(file) {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const ab = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(ab), { type: 'array' })
    return XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]])
  }
  const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = rej; r.readAsDataURL(file) })
  return { b64, mediaType: file.type }
}

const ALL_CATS = CAT_KEYS

export default function Import() {
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingMsg, setLoadingMsg] = useState('')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState(null)
  const [dupConfirm, setDupConfirm] = useState(null)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef()

  // Parse Mercury CSV directly without Claude
  const parseMercuryCSV = (csvText) => {
    const lines = csvText.split('\n').filter(l => l.trim())
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
    const dateIdx = headers.findIndex(h => h.toLowerCase().includes('date'))
    const descIdx = headers.findIndex(h => h.toLowerCase() === 'description')
    const amtIdx = headers.findIndex(h => h.toLowerCase() === 'amount')
    const catIdx = headers.findIndex(h => h.toLowerCase() === 'category')
    const noteIdx = headers.findIndex(h => h.toLowerCase() === 'note')
    const bankDescIdx = headers.findIndex(h => h.toLowerCase().includes('bank description'))

    const parseRow = (line) => {
      const cols = []
      let cur = '', inQ = false
      for (const ch of line) {
        if (ch === '"') { inQ = !inQ }
        else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
        else { cur += ch }
      }
      cols.push(cur.trim())
      return cols
    }

    const guessCategory = (desc, bankDesc, mercuryCat, amount) => {
      const d = (desc + ' ' + bankDesc + ' ' + mercuryCat).toLowerCase()
      if (d.includes('la cara')) return 'Capital contribution'
      if (d.includes('shopify') && amount > 0) return 'Sales — products'
      if (d.includes('shopify')) return 'Website & tech'
      if (d.includes('facebook') || d.includes('meta') || d.includes('facebk') || d.includes('advertising')) return 'Marketing & ads'
      if (d.includes('google ads')) return 'Marketing & ads'
      if (d.includes('bank fee') || d.includes('wire fee') || d.includes('transaction fee') || d.includes('mercury') || d.includes('subscription fee')) return amount < 0 ? 'Bank fees' : 'Capital contribution'
      if (d.includes('microsoft') || d.includes('software') || d.includes('subscription')) return 'Website & tech'
      if (d.includes('ups') || d.includes('fedex') || d.includes('usps') || d.includes('shipping')) return amount < 0 ? 'Shipping (outbound)' : 'Shipping (inbound)'
      if (d.includes('legal') || d.includes('attorney') || d.includes('lawyer')) return 'Legal & professional fees'
      if (amount > 0) return 'Sales — products'
      return 'Other expense'
    }

    const convertDate = (d) => {
      if (!d) return ''
      // MM-DD-YYYY → YYYY-MM-DD
      const m1 = d.match(/^(\d{2})-(\d{2})-(\d{4})/)
      if (m1) return m1[3] + '-' + m1[1] + '-' + m1[2]
      // Already YYYY-MM-DD
      if (d.match(/^\d{4}-/)) return d.slice(0, 10)
      return d
    }

    return lines.slice(1).filter(l => l.trim()).map((line, i) => {
      const cols = parseRow(line)
      const rawDate = cols[dateIdx] || ''
      const desc = cols[descIdx] || ''
      const amount = parseFloat(cols[amtIdx]) || 0
      const mercuryCat = cols[catIdx] || ''
      const bankDesc = bankDescIdx >= 0 ? cols[bankDescIdx] || '' : ''
      const note = noteIdx >= 0 ? cols[noteIdx] || '' : ''
      const category = guessCategory(desc, bankDesc, mercuryCat, amount)
      return {
        _pid: Date.now() + i,
        date: convertDate(rawDate),
        description: desc,
        category,
        amount: Math.abs(amount),
        flow: amount >= 0 ? 'in' : 'out',
        note
      }
    }).filter(t => t.date && t.amount > 0)
  }

  const analyze = async (file) => {
    setLoading(true)
    setResult(null)
    setLoadingMsg('Reading file…')
    try {
      const name = file.name.toLowerCase()
      const isCSVorXLSX = name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')

      if (isCSVorXLSX) {
        // Parse directly — fast, no Claude needed for structured CSV
        const text = await file.text()
        const parsed = parseMercuryCSV(text)
        if (parsed.length > 0) {
          setPending(parsed)
          setLoading(false)
          return
        }
      }

      // Fallback: use Claude for PDF/image or unrecognized CSV
      setLoadingMsg('Claude is analyzing…')
      const content = await readFile(file)
      const isText = typeof content === 'string'
      const body = isText
        ? { type: 'spreadsheet', content, filename: file.name }
        : { type: file.type.startsWith('image/') ? 'image' : 'pdf', content: content.b64, mediaType: content.mediaType, filename: file.name }

      const systemOverride = `You are an accounting assistant for Clique Beauty Skincare LLC. Extract ALL transactions from this bank statement. Return ONLY a JSON array. Each item: {"date":"YYYY-MM-DD","description":"description","category":"one of: ${ALL_CATS.join(', ')}","amount":positive_number,"flow":"in or out","note":""}. Rules: La Cara LLC → Capital contribution. Facebook/Meta → Marketing & ads. Shopify subscription → Website & tech. Bank/wire fees → Bank fees.`

      const resp = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, systemOverride })
      })
      const data = await resp.json()
      if (data.error) throw new Error(data.error)
      const txs = (data.transactions || []).map((t, i) => ({ ...t, _pid: Date.now() + i }))
      setPending(txs)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const updatePending = (_pid, field, value) => {
    setPending(prev => prev.map(p => p._pid === _pid ? { ...p, [field]: value } : p))
  }

  const rejectOne = (_pid) => setPending(prev => prev.filter(p => p._pid !== _pid))

  const acceptAll = async (forceInsert = false) => {
    setSaving(true)
    const txList = pending.map(({ _pid, flow, ...t }) => t)
    const resp = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: txList, forceInsert })
    })
    const data = await resp.json()
    setSaving(false)

    if (!forceInsert && data.duplicates?.length > 0) {
      setDupConfirm({
        duplicates: data.duplicates,
        saved: data.inserted?.length || 0,
        toInsert: data.duplicates.map(d => d.newTx)
      })
      setPending([])
      return
    }

    setPending([])
    setDupConfirm(null)
    setResult({
      saved: data.inserted?.length || 0,
      duplicates: data.duplicates || [],
      message: data.message
    })
  }

  const inTxs = pending.filter(t => CATEGORIES[t.category] === 'revenue' || CATEGORIES[t.category] === 'capital')
  const outTxs = pending.filter(t => CATEGORIES[t.category] === 'cogs' || CATEGORIES[t.category] === 'opex')
  const totalIn = inTxs.reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const totalOut = outTxs.reduce((a, t) => a + parseFloat(t.amount || 0), 0)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Bank Import</h1>
          <p>Import your bank statement — Claude categorizes everything automatically</p>
        </div>
      </div>

      {/* Result */}
      {result && (
        <div style={{ marginBottom: '1rem' }}>
          {result.saved > 0 && (
            <div className="alert alert-success">
              ✓ {result.saved} transaction{result.saved > 1 ? 's' : ''} imported successfully
            </div>
          )}
          {result.duplicates?.length > 0 && (
            <div className="alert alert-warning">
              <div style={{ fontWeight: 600, marginBottom: 6 }}>⚠ {result.duplicates.length} duplicate{result.duplicates.length > 1 ? 's' : ''} ignored</div>
              {result.duplicates.map((d, i) => (
                <div key={i} style={{ fontSize: 12, marginTop: 4 }}>{d.newTx?.description} · {d.newTx?.date} · {usd(d.newTx?.amount)} — {d.reason}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Duplicate confirmation */}
      {dupConfirm && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 500 }}>
            <div style={{ fontSize: 32, textAlign: 'center', marginBottom: 12 }}>⚠️</div>
            <h2 style={{ textAlign: 'center', marginBottom: 8 }}>{dupConfirm.duplicates.length} duplicate{dupConfirm.duplicates.length > 1 ? 's' : ''} detected</h2>
            {dupConfirm.saved > 0 && <div className="alert alert-success" style={{ marginBottom: '1rem', fontSize: 12 }}>✓ {dupConfirm.saved} other transaction{dupConfirm.saved > 1 ? 's' : ''} already saved</div>}
            <div style={{ background: 'var(--cream)', borderRadius: 8, padding: '0.75rem', marginBottom: '1.25rem', maxHeight: 200, overflow: 'auto' }}>
              {dupConfirm.duplicates.map((d, i) => (
                <div key={i} style={{ padding: '7px 0', borderBottom: i < dupConfirm.duplicates.length - 1 ? '1px solid var(--border)' : 'none', fontSize: 13 }}>
                  <div style={{ fontWeight: 500 }}>{d.newTx?.description}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{d.newTx?.date} · <strong style={{ color: 'var(--red)' }}>{usd(d.newTx?.amount)}</strong> · {d.reason}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 13, textAlign: 'center', marginBottom: '1.5rem' }}>Add them anyway?</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button className="primary" onClick={() => acceptAll(true)} disabled={saving} style={{ padding: '10px' }}>{saving ? 'Saving…' : 'Yes, add anyway'}</button>
              <button onClick={() => { setDupConfirm(null); setResult({ saved: dupConfirm.saved, duplicates: dupConfirm.duplicates, message: '' }) }} style={{ padding: '10px' }}>No, skip</button>
            </div>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <input ref={inputRef} type="file" accept="image/*,.pdf,.csv,.xlsx,.xls" style={{ display: 'none' }}
        onChange={e => e.target.files[0] && analyze(e.target.files[0])} />

      {pending.length === 0 && (
        <div
          className={'drop-zone' + (dragging ? ' drag-over' : '')}
          style={{ marginBottom: '1.5rem' }}
          onClick={() => !loading && inputRef.current.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); e.dataTransfer.files[0] && analyze(e.dataTransfer.files[0]) }}
        >
          {loading ? (
            <>
              <div style={{ fontSize: 28, marginBottom: 10 }}>⏳</div>
              <div style={{ fontWeight: 500, marginBottom: 6 }}>{loadingMsg}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Claude is reading every line…</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🏦</div>
              <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Drop your bank statement here</div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10 }}>
                {[['CSV', '#EAF3DE', '#27500A'], ['XLSX', '#FFF3E0', '#E65100'], ['PDF', '#FAECE7', '#712B13'], ['Image', '#E6F1FB', '#0C447C']].map(([l, bg, c]) => (
                  <span key={l} className="pill" style={{ background: bg, color: c, fontSize: 12 }}>{l}</span>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Credits → Income · Debits → Expenses · La Cara transfers → Capital</div>
            </>
          )}
        </div>
      )}

      {/* Pending transactions */}
      {pending.length > 0 && (
        <div>
          {/* Summary bar */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: '1.25rem' }}>
            {[
              ['Total transactions', pending.length, 'var(--navy)'],
              ['Incoming (+)', usd(totalIn), 'var(--green)'],
              ['Outgoing (−)', usd(totalOut), 'var(--red)'],
              ['Net', usd(totalIn - totalOut), (totalIn - totalOut) >= 0 ? 'var(--green)' : 'var(--red)'],
            ].map(([l, v, c]) => (
              <div key={l} className="metric-card">
                <div className="label">{l}</div>
                <div className="value" style={{ color: c, fontSize: 18 }}>{v}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600 }}>{pending.length} transaction{pending.length > 1 ? 's' : ''} extracted — review & confirm</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setPending([]); inputRef.current && (inputRef.current.value = '') }}>Start over</button>
              <button onClick={() => setPending([])} style={{ color: 'var(--red)' }}>Reject all</button>
              <button className="primary" onClick={() => acceptAll(false)} disabled={saving}>
                {saving ? 'Saving…' : '✓ Accept all (' + pending.length + ')'}
              </button>
            </div>
          </div>

          {/* Incoming */}
          {inTxs.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--green)', marginBottom: 8 }}>
                Incoming — {usd(totalIn)}
              </div>
              {inTxs.map(tx => <TxRow key={tx._pid} tx={tx} onUpdate={updatePending} onReject={rejectOne} />)}
            </div>
          )}

          {/* Outgoing */}
          {outTxs.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--red)', marginBottom: 8 }}>
                Outgoing — {usd(totalOut)}
              </div>
              {outTxs.map(tx => <TxRow key={tx._pid} tx={tx} onUpdate={updatePending} onReject={rejectOne} />)}
            </div>
          )}
        </div>
      )}

      <div className="card" style={{ marginTop: pending.length > 0 ? '1.5rem' : 0 }}>
        <div className="section-title" style={{ marginBottom: '0.75rem' }}>How it works</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', fontSize: 13 }}>
          <div style={{ padding: '10px 12px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontWeight: 600, color: 'var(--green)', marginBottom: 4 }}>💚 Incoming recognized as</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Sales, Shopify/PayPal payouts, La Cara LLC transfers (capital), customer payments</div>
          </div>
          <div style={{ padding: '10px 12px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontWeight: 600, color: 'var(--red)', marginBottom: 4 }}>🔴 Outgoing recognized as</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Supplier invoices, Meta/Google Ads, Shopify fees, bank fees, shipping, legal fees</div>
          </div>
          <div style={{ padding: '10px 12px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)' }}>
            <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 4 }}>⚠️ Always review before accepting</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>You can edit category, amount and date before confirming. Sales with products → use Income instead for stock tracking.</div>
          </div>
        </div>
      </div>
    </Layout>
  )
}

function TxRow({ tx, onUpdate, onReject }) {
  const type = CATEGORIES[tx.category]
  const c = TYPE_COLORS[type] || TYPE_COLORS.opex
  const isIncome = type === 'revenue' || type === 'capital'

  return (
    <div className="card" style={{ marginBottom: 8, padding: '12px 14px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 220px 120px 32px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <input type="date" value={tx.date} onChange={e => onUpdate(tx._pid, 'date', e.target.value)} style={{ fontSize: 12 }} />
        <input type="text" value={tx.description} onChange={e => onUpdate(tx._pid, 'description', e.target.value)} style={{ fontSize: 13 }} />
        <select value={tx.category} onChange={e => onUpdate(tx._pid, 'category', e.target.value)} style={{ fontSize: 12 }}>
          {CAT_KEYS.map(k => <option key={k}>{k}</option>)}
        </select>
        <input type="number" value={tx.amount} onChange={e => onUpdate(tx._pid, 'amount', e.target.value)} style={{ fontSize: 13, textAlign: 'right' }} />
        <button onClick={() => onReject(tx._pid)} style={{ border: 'none', background: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="pill" style={{ background: c.bg, color: c.text, fontSize: 11 }}>{tx.category}</span>
        <span className="pill" style={{ background: isIncome ? 'var(--green-light)' : 'var(--red-light)', color: isIncome ? 'var(--green)' : 'var(--red)', fontSize: 11 }}>{isIncome ? '↑ IN' : '↓ OUT'}</span>
        {tx.note && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tx.note}</span>}
        <div style={{ flex: 1 }} />
        <span style={{ fontWeight: 600, fontSize: 14, color: isIncome ? 'var(--green)' : 'var(--red)' }}>
          {isIncome ? '+' : '−'}{usd(tx.amount)}
        </span>
      </div>
    </div>
  )
}
