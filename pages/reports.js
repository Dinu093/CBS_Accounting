import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { CATEGORIES, usd, fdate } from '../lib/constants'
import DateFilter, { filterByDate } from '../components/DateFilter'

function pnlFromTxs(txs) {
  const sum = type => txs.filter(t => CATEGORIES[t.category] === type).reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const rev = sum('revenue'), cogs = sum('cogs'), opex = sum('opex'), cap = sum('capital')
  return { rev, cogs, opex, cap, gross: rev - cogs, net: rev - cogs - opex }
}

function PnlRow({ label, value, indent = false, bold = false, topBorder = false }) {
  const isNeg = value < 0
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', padding: '9px 0',
      paddingLeft: indent ? 24 : 0,
      borderTop: topBorder ? '2px solid var(--border)' : '1px solid #F5F5F5',
      fontWeight: bold ? 600 : 400,
    }}>
      <span style={{ color: bold ? 'var(--text)' : 'var(--text-muted)' }}>{label}</span>
      <span style={{ color: isNeg ? '#C62828' : (bold ? 'var(--text)' : 'var(--text-muted)') }}>
        {usd(value)}
      </span>
    </div>
  )
}

export default function Reports() {
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ from: null, to: null })

  useEffect(() => {
    fetch('/api/transactions').then(r => r.json()).then(d => { setTxs(Array.isArray(d) ? d : []); setLoading(false) })
  }, [])

  const filteredForPnl = filterByDate(txs, 'date', dateRange)
  const p = pnlFromTxs(filteredForPnl)

  const exportCSV = () => {
    const rows = [
      ['Date', 'Description', 'Category', 'Type', 'Amount', 'Note'],
      ...txs.map(t => [t.date, `"${t.description}"`, `"${t.category}"`, CATEGORIES[t.category] || '', t.amount, `"${t.note || ''}"`])
    ]
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'clique_beauty_transactions_2025.csv'
    a.click()
  }

  const catGroups = {}
  txs.forEach(t => {
    const g = CATEGORIES[t.category] || 'other'
    if (!catGroups[g]) catGroups[g] = {}
    if (!catGroups[g][t.category]) catGroups[g][t.category] = 0
    catGroups[g][t.category] += parseFloat(t.amount || 0)
  })

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Rapports</h1>
          <p>FY 2025 · {txs.length} transactions</p>
        </div>
        <button onClick={exportCSV}>⬇ Export CSV</button>
      </div>

      {loading ? <div className="loading">Chargement…</div> : (<><DateFilter onChange={setDateRange} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div className="card">
            <div className="section-title" style={{ marginBottom: '0.5rem' }}>Compte de résultat — P&L</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Clique Beauty Skincare LLC · 1 janv. → 31 déc. 2025
            </div>

            <div style={{ fontWeight: 600, fontSize: 12, color: '#2E7D32', marginTop: 8, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Revenus</div>
            {catGroups.revenue && Object.entries(catGroups.revenue).map(([k, v]) => (
              <PnlRow key={k} label={k} value={v} indent />
            ))}
            <PnlRow label="Total revenus" value={p.rev} bold />

            <div style={{ fontWeight: 600, fontSize: 12, color: '#E65100', marginTop: 16, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coût des ventes</div>
            {catGroups.cogs && Object.entries(catGroups.cogs).map(([k, v]) => (
              <PnlRow key={k} label={k} value={v} indent />
            ))}
            <PnlRow label="Total COGS" value={p.cogs} bold />

            <PnlRow label="Marge brute" value={p.gross} bold topBorder />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'right', marginBottom: 12 }}>
              Marge : {p.rev > 0 ? ((p.gross / p.rev) * 100).toFixed(1) : '0'}%
            </div>

            <div style={{ fontWeight: 600, fontSize: 12, color: '#AD1457', marginTop: 8, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Charges opérationnelles</div>
            {catGroups.opex && Object.entries(catGroups.opex).map(([k, v]) => (
              <PnlRow key={k} label={k} value={v} indent />
            ))}
            <PnlRow label="Total opex" value={p.opex} bold />

            <PnlRow label="Résultat net" value={p.net} bold topBorder />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="card">
              <div className="section-title">Capitaux propres</div>
              <PnlRow label="Apports en capital" value={p.cap} />
              <PnlRow label="Résultat net 2025" value={p.net} />
              <PnlRow label="Total capitaux propres" value={p.cap + p.net} bold topBorder />
            </div>

            <div className="card">
              <div className="section-title">Obligations déclaratives 2025</div>
              {[
                ['Form 1065', 'Partnership Return · 2 membres', '15 mars 2026', '#FAECE7', '#712B13'],
                ['Schedule K-1', '1 par associé (2 au total)', '15 mars 2026', '#FAECE7', '#712B13'],
                ['Kentucky Form 765', 'State Partnership Return', '15 mars 2026', '#E3F2FD', '#1565C0'],
                ['Extension possible', 'Form 7004', 'jusqu\'au 15 sept. 2026', '#E8F5E9', '#2E7D32'],
              ].map(([title, desc, date, bg, color]) => (
                <div key={title} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F5F5F5' }}>
                  <div>
                    <span className="pill" style={{ background: bg, color, marginRight: 8 }}>{title}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{desc}</span>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: 'nowrap' }}>{date}</span>
                </div>
              ))}
              <div className="alert alert-info" style={{ marginTop: '1rem', fontSize: 12 }}>
                ℹ Recommandation : faire appel à un CPA américain spécialisé LLC pour la première déclaration
              </div>
            </div>

            <div className="card">
              <div className="section-title">Export & partage</div>
              <button onClick={exportCSV} style={{ width: '100%', marginBottom: 8, fontSize: 13 }}>
                ⬇ Exporter toutes les transactions (.csv)
              </button>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                Le fichier CSV peut être partagé avec votre comptable ou importé dans QuickBooks / Xero.
              </div>
            </div>
          </div>
        </div>
      </>
      )}
    </Layout>
  )
}
