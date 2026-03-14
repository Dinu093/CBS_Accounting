import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { CATEGORIES, usd } from '../lib/constants'

function pnlFromTxs(txs) {
  const sum = type => txs
    .filter(t => CATEGORIES[t.category] === type)
    .reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const rev = sum('revenue'), cogs = sum('cogs'), opex = sum('opex'), cap = sum('capital')
  return { rev, cogs, opex, cap, gross: rev - cogs, net: rev - cogs - opex }
}

function MetricCard({ label, value, color }) {
  return (
    <div className="metric-card">
      <div className="label">{label}</div>
      <div className="value" style={{ color }}>{usd(value)}</div>
    </div>
  )
}

function BarRow({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.abs(value) / max * 100) : 0
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
        <span style={{ color: 'var(--text-muted)' }}>{label}</span>
        <span style={{ fontWeight: 600, color }}>{usd(value)}</span>
      </div>
      <div style={{ height: 5, background: 'var(--gray-light)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width 0.6s ease' }} />
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/transactions')
      .then(r => r.json())
      .then(data => { setTxs(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  const p = pnlFromTxs(txs)
  const max = Math.max(p.rev, p.cogs, p.opex, Math.abs(p.gross), Math.abs(p.net), 1)
  const recentTxs = txs.slice(0, 8)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Clique Beauty Skincare LLC · FY 2025</p>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {txs.length} transaction{txs.length !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="alert alert-warning" style={{ marginBottom: '1.5rem' }}>
        <strong>Obligations 2025 :</strong> Form 1065 + Schedule K-1 → deadline 15 mars 2026 · Extension possible jusqu'au 15 sept. 2026 · Kentucky Form 765 même échéance
      </div>

      {loading ? (
        <div className="loading">Chargement…</div>
      ) : (
        <>
          <div className="metrics-grid">
            <MetricCard label="Revenue" value={p.rev} color="#2E7D32" />
            <MetricCard label="Coût des ventes" value={p.cogs} color="#E65100" />
            <MetricCard label="Marge brute" value={p.gross} color={p.gross >= 0 ? '#2E7D32' : '#C62828'} />
            <MetricCard label="Charges opex" value={p.opex} color="#AD1457" />
            <MetricCard label="Résultat net" value={p.net} color={p.net >= 0 ? '#2E7D32' : '#C62828'} />
            <MetricCard label="Capital apporté" value={p.cap} color="#1565C0" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.5rem' }}>
            <div className="card">
              <div className="section-title">P&L — Compte de résultat</div>
              <BarRow label="Revenue" value={p.rev} max={max} color="#4CAF50" />
              <BarRow label="Coût des ventes (COGS)" value={p.cogs} max={max} color="#FF9800" />
              <BarRow label="Marge brute" value={p.gross} max={max} color={p.gross >= 0 ? '#2E7D32' : '#C62828'} />
              <BarRow label="Charges opérationnelles" value={p.opex} max={max} color="#E91E63" />
              <div style={{ borderTop: '2px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
                <BarRow label="Résultat net" value={p.net} max={max} color={p.net >= 0 ? '#1B5E20' : '#B71C1C'} />
              </div>
            </div>

            <div className="card">
              <div className="section-title" style={{ marginBottom: '0.75rem' }}>Transactions récentes</div>
              {recentTxs.length === 0 ? (
                <div className="empty-state">
                  <p>Aucune transaction</p>
                  <p style={{ marginTop: 8 }}>
                    <button className="primary" onClick={() => window.location.href = '/upload'} style={{ fontSize: 12 }}>
                      ⬆ Upload un document
                    </button>
                  </p>
                </div>
              ) : recentTxs.map(tx => {
                const isIncome = CATEGORIES[tx.category] === 'revenue' || CATEGORIES[tx.category] === 'capital'
                return (
                  <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid #F5F5F5' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{tx.date}</div>
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: isIncome ? '#2E7D32' : '#C62828', marginLeft: 12 }}>
                      {isIncome ? '+' : '−'}{usd(tx.amount)}
                    </div>
                  </div>
                )
              })}
              {txs.length > 8 && (
                <button style={{ marginTop: 12, width: '100%', fontSize: 12 }} onClick={() => window.location.href = '/transactions'}>
                  Voir toutes les transactions ({txs.length}) →
                </button>
              )}
            </div>
          </div>

          <div className="card">
            <div className="section-title">Bilan simplifié</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, fontSize: 13 }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#1565C0' }}>Actif</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F5F5F5' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Trésorerie (estimée)</span>
                  <span style={{ fontWeight: 500 }}>{usd(p.cap + p.net)}</span>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#E65100' }}>Passif</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F5F5F5' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Dettes</span>
                  <span style={{ fontWeight: 500 }}>{usd(0)}</span>
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 8, color: '#2E7D32' }}>Capitaux propres</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F5F5F5' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Capital + résultat</span>
                  <span style={{ fontWeight: 500 }}>{usd(p.cap + p.net)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
