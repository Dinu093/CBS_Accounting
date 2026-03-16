import { useState } from 'react'
import Layout from '../components/Layout'

export default function Mercury() {
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [daysBack, setDaysBack] = useState(30)

  async function handleImport() {
    setImporting(true)
    setResult(null)
    setError(null)

    const res = await fetch('/api/mercury-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days_back: daysBack })
    })

    const data = await res.json()
    if (!res.ok) {
      setError(data.error)
    } else {
      setResult(data)
    }
    setImporting(false)
  }

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Mercury Import</h1>
          <p className="page-sub">Import bank transactions from Mercury into the bank feed</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

        {/* Import panel */}
        <div className="card">
          <div className="card-header"><h3>Import Transactions</h3></div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Pulls transactions from your Mercury account and adds them to the bank feed as <strong>unmatched</strong>.
              Duplicates are automatically skipped.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label>Import last how many days?</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={daysBack}
                  onChange={e => setDaysBack(parseInt(e.target.value))}
                  style={{ width: 80 }}
                />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>days</span>
              </div>
            </div>

            <button
              className="btn-primary"
              onClick={handleImport}
              disabled={importing}
              style={{ width: '100%' }}
            >
              {importing ? '⏳ Importing...' : '↓ Import from Mercury'}
            </button>

            {error && (
              <div style={{ marginTop: '1rem', background: '#fee', color: '#c00', padding: '0.75rem', borderRadius: 8, fontSize: 13 }}>
                <strong>Error:</strong> {error}
              </div>
            )}

            {result && (
              <div style={{ marginTop: '1rem', background: '#f0fff4', border: '1px solid #c6f6d5', borderRadius: 8, padding: '1rem' }}>
                <div style={{ fontWeight: 700, color: '#276749', marginBottom: '0.5rem' }}>✓ Import complete</div>
                <table style={{ width: '100%', fontSize: 13 }}>
                  <tbody>
                    {[
                      ['Account', result.account_id],
                      ['Period', result.period],
                      ['Total fetched', result.total_fetched],
                      ['Imported', result.imported],
                      ['Skipped (duplicates)', result.skipped],
                      ['Errors', result.errors?.length || 0],
                    ].map(([label, value]) => (
                      <tr key={label}>
                        <td style={{ color: 'var(--text-2)', paddingBottom: 4 }}>{label}</td>
                        <td style={{ fontWeight: 600, textAlign: 'right' }}>{value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.errors?.length > 0 && (
                  <div style={{ marginTop: '0.75rem', fontSize: 12, color: '#c00' }}>
                    {result.errors.map((e, i) => <div key={i}>{e}</div>)}
                  </div>
                )}
                <div style={{ marginTop: '0.75rem' }}>
                  <a href="/bank-feed" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                    → Go to Bank Feed to reconcile
                  </a>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Setup guide */}
        <div className="card">
          <div className="card-header"><h3>Setup</h3></div>
          <div className="card-body">
            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>1. Get your Mercury API key</div>
              <div style={{ color: 'var(--text-2)', marginBottom: '1rem' }}>
                Mercury Dashboard → Settings → API → Generate API key<br />
                Scopes needed: <code>read:account</code>, <code>read:transaction</code>
              </div>

              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>2. Add to Vercel</div>
              <div style={{ color: 'var(--text-2)', marginBottom: '1rem' }}>
                Vercel → Settings → Environment Variables<br />
                Name: <code>MERCURY_API_KEY</code><br />
                Value: your Mercury API key
              </div>

              <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>3. Redeploy</div>
              <div style={{ color: 'var(--text-2)', marginBottom: '1rem' }}>
                After adding the variable, trigger a redeploy in Vercel for it to take effect.
              </div>

              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '0.75rem', fontSize: 12, color: 'var(--text-2)', borderLeft: '3px solid var(--accent)' }}>
                <strong>Safe by design:</strong> The import is read-only. It never creates invoices or revenue — only unmatched bank transactions that you reconcile manually.
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
