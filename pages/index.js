import { useState, useEffect } from 'react'
import Layout from '../components/Layout'
import { CATEGORIES, usd } from '../lib/constants'

export async function getServerSideProps() { return { props: {} } }

function pnlFromTxs(txs) {
  const sum = type => txs.filter(t => CATEGORIES[t.category] === type).reduce((a, t) => a + parseFloat(t.amount || 0), 0)
  const rev = sum('revenue'), cogs = sum('cogs'), opex = sum('opex'), cap = sum('capital')
  return { rev, cogs, opex, cap, gross: rev - cogs, net: rev - cogs - opex }
}

function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.abs(value) / max * 100) : 0
  return (
    <div style={{ height: 4, background: 'var(--cream-dark)', borderRadius: 2, overflow: 'hidden', marginTop: 6 }}>
      <div style={{ height: '100%', width: pct + '%', background: color, borderRadius: 2, transition: 'width 0.6s ease' }} />
    </div>
  )
}

function RevenueChart({ monthlyData }) {
  if (!monthlyData || monthlyData.length === 0) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--text-muted)', fontSize: 13 }}>
      Pas encore de données
    </div>
  )

  const maxVal = Math.max(...monthlyData.map(d => d.rev), 1)

  // Linear regression for trend
  const n = monthlyData.length
  const xMean = (n - 1) / 2
  const yMean = monthlyData.reduce((a, d) => a + d.rev, 0) / n
  const num = monthlyData.reduce((a, d, i) => a + (i - xMean) * (d.rev - yMean), 0)
  const den = monthlyData.reduce((a, _, i) => a + Math.pow(i - xMean, 2), 0)
  const slope = den !== 0 ? num / den : 0
  const intercept = yMean - slope * xMean

  // Project 2 months
  const allData = [...monthlyData]
  const lastMonth = monthlyData[monthlyData.length - 1]?.month || ''
  for (let i = 1; i <= 2; i++) {
    const [year, month] = lastMonth.split('-').map(Number)
    const d = new Date(year, month - 1 + i, 1)
    const label = d.toLocaleString('fr', { month: 'short' }) + ' ' + d.getFullYear().toString().slice(2)
    const projRev = Math.max(0, intercept + slope * (n - 1 + i))
    allData.push({ month: d.toISOString().slice(0, 7), label, rev: projRev, projected: true })
  }

  const allMax = Math.max(...allData.map(d => d.rev), 1)
  const trend = slope >= 0 ? 'hausse' : 'baisse'
  const trendColor = slope >= 0 ? 'var(--green)' : 'var(--red)'
  const trendPct = yMean > 0 ? Math.abs(slope / yMean * 100).toFixed(1) : 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140, marginBottom: 8 }}>
        {allData.map((d, i) => {
          const h = Math.max(4, (d.rev / allMax) * 120)
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 500 }}>{d.rev > 0 ? (d.rev >= 1000 ? (d.rev / 1000).toFixed(1) + 'k' : usd(d.rev).replace('$', '')) : ''}</div>
              <div style={{
                width: '100%', height: h,
                background: d.projected ? 'rgba(123,163,188,0.3)' : 'var(--navy)',
                borderRadius: '4px 4px 0 0',
                border: d.projected ? '1.5px dashed var(--blue-pearl)' : 'none',
                transition: 'height 0.5s ease',
                position: 'relative'
              }} />
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'space-between' }}>
        {allData.map((d, i) => (
          <div key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9.5, color: d.projected ? 'var(--blue-pearl)' : 'var(--text-muted)', letterSpacing: '0.02em' }}>
            {d.label}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--navy)' }} />
        <span style={{ color: 'var(--text-muted)' }}>Réalisé</span>
        <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(123,163,188,0.4)', border: '1.5px dashed var(--blue-pearl)' }} />
        <span style={{ color: 'var(--text-muted)' }}>Projection</span>
        <span style={{ marginLeft: 'auto', color: trendColor, fontWeight: 500 }}>
          Tendance {trend} · {trendPct}%/mois
        </span>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [txs, setTxs] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      fetch('/api/transactions').then(r => r.json()),
      fetch('/api/sales').then(r => r.json()),
    ]).then(([t, o]) => {
      setTxs(Array.isArray(t) ? t : [])
      setOrders(Array.isArray(o) ? o : [])
      setLoading(false)
    })
  }, [])

  const p = pnlFromTxs(txs)
  const max = Math.max(p.rev, p.cogs, p.opex, Math.abs(p.gross), Math.abs(p.net), 1)

  // Monthly revenue data
  const monthlyMap = {}
  orders.forEach(o => {
    const m = o.date?.slice(0, 7)
    if (!m) return
    if (!monthlyMap[m]) monthlyMap[m] = { rev: 0 }
    monthlyMap[m].rev += parseFloat(o.total_amount || 0)
  })
  const monthlyData = Object.entries(monthlyMap).sort().map(([month, v]) => ({
    month,
    label: new Date(month + '-01').toLocaleString('fr', { month: 'short' }) + ' ' + new Date(month + '-01').getFullYear().toString().slice(2),
    ...v
  }))

  // Balance sheet
  const totalAssets = p.cap + p.net
  const totalEquity = p.cap + p.net
  const marginPct = p.rev > 0 ? ((p.gross / p.rev) * 100).toFixed(1) : 0
  const netMarginPct = p.rev > 0 ? ((p.net / p.rev) * 100).toFixed(1) : 0

  const recentTxs = [...txs].slice(0, 8)

  return (
    <Layout>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p>Clique Beauty Skincare LLC · FY 2025</p>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
          {txs.length} transactions
        </div>
      </div>

      {loading ? <div className="loading">Chargement…</div> : (
        <>
          {/* Metrics */}
          <div className="metrics-grid">
            {[
              ['Revenue', p.rev, p.rev >= 0 ? 'var(--green)' : 'var(--red)'],
              ['Coût des ventes', p.cogs, 'var(--amber)'],
              ['Marge brute', p.gross, p.gross >= 0 ? 'var(--green)' : 'var(--red)'],
              ['Charges opex', p.opex, '#5B3D8A'],
              ['Résultat net', p.net, p.net >= 0 ? 'var(--green)' : 'var(--red)'],
              ['Capital apporté', p.cap, 'var(--navy-mid)'],
            ].map(([l, v, c]) => (
              <div key={l} className="metric-card">
                <div className="label">{l}</div>
                <div className="value" style={{ color: c }}>{usd(v)}</div>
                <MiniBar value={v} max={max} color={c} />
              </div>
            ))}
          </div>

          {/* Revenue chart + Recent transactions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                <div className="section-title" style={{ marginBottom: 0 }}>Évolution du CA</div>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{monthlyData.length} mois · +2 projetés</span>
              </div>
              <RevenueChart monthlyData={monthlyData} />
            </div>

            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>Transactions récentes</div>
              {recentTxs.length === 0 ? (
                <div className="empty-state" style={{ padding: '2rem' }}><p>Aucune transaction</p></div>
              ) : (
                <>
                  {recentTxs.map(tx => {
                    const type = CATEGORIES[tx.category]
                    const isIncome = type === 'revenue' || type === 'capital'
                    return (
                      <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>{tx.description}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{tx.date}</div>
                        </div>
                        <div style={{ fontWeight: 500, fontSize: 13, color: isIncome ? 'var(--green)' : 'var(--red)', marginLeft: 12, whiteSpace: 'nowrap' }}>
                          {isIncome ? '+' : '−'}{usd(tx.amount)}
                        </div>
                      </div>
                    )
                  })}
                  {txs.length > 8 && (
                    <button style={{ marginTop: 12, width: '100%', fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                      onClick={() => window.location.href = '/expenses'}>
                      Voir toutes les transactions ({txs.length}) →
                    </button>
                  )}
                </>
              )}
            </div>
          </div>

          {/* P&L + Balance sheet */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <div className="card">
              <div className="section-title" style={{ marginBottom: '1rem' }}>P&L — Compte de résultat</div>
              {[
                ['Revenue', p.rev, '#639922', false],
                ['Coût des ventes (COGS)', p.cogs, '#BA7517', false],
                ['Marge brute', p.gross, p.gross >= 0 ? 'var(--green)' : 'var(--red)', true],
                ['Charges opérationnelles', p.opex, '#5B3D8A', false],
                ['Résultat net', p.net, p.net >= 0 ? 'var(--green)' : 'var(--red)', true],
              ].map(([label, value, color, bold]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)', fontWeight: bold ? 600 : 400 }}>
                  <span style={{ color: bold ? 'var(--text)' : 'var(--text-muted)', fontSize: 13 }}>{label}</span>
                  <span style={{ color, fontSize: 13 }}>{usd(value)}</span>
                </div>
              ))}
            </div>

            <div className="card">
              <div className="section-title" style={{ marginBottom: '1.25rem' }}>Bilan simplifié · 31 déc. 2025</div>

              {/* Actif */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--navy)', marginBottom: 8 }}>Actif</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Trésorerie estimée</span>
                  <span style={{ fontWeight: 500, color: totalAssets >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(totalAssets)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Créances clients</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>À saisir</span>
                </div>
              </div>

              {/* Passif */}
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--amber)', marginBottom: 8 }}>Passif</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Dettes fournisseurs</span>
                  <span style={{ fontWeight: 500, color: 'var(--text-muted)' }}>À saisir</span>
                </div>
              </div>

              {/* Capitaux propres */}
              <div style={{ borderTop: '1.5px solid var(--border)', paddingTop: '1rem' }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--green)', marginBottom: 8 }}>Capitaux propres</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Capital social</span>
                  <span style={{ fontWeight: 500 }}>{usd(p.cap)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', marginBottom: 4, fontSize: 13 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Résultat net FY 2025</span>
                  <span style={{ fontWeight: 500, color: p.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{usd(p.net)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 10px', background: 'var(--navy)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontWeight: 500 }}>Total capitaux propres</span>
                  <span style={{ fontWeight: 600, color: totalEquity >= 0 ? '#7BC89A' : '#E88080' }}>{usd(totalEquity)}</span>
                </div>
              </div>

              {/* Ratios */}
              <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ padding: '8px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Marge brute</div>
                  <div style={{ fontSize: 18, fontWeight: 300, color: parseFloat(marginPct) >= 0 ? 'var(--green)' : 'var(--red)' }}>{marginPct}%</div>
                </div>
                <div style={{ padding: '8px 10px', background: 'var(--cream)', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Marge nette</div>
                  <div style={{ fontSize: 18, fontWeight: 300, color: parseFloat(netMarginPct) >= 0 ? 'var(--green)' : 'var(--red)' }}>{netMarginPct}%</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </Layout>
  )
}
