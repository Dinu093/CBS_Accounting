import { useRouter } from 'next/router'

const NAV = [
  { group: null, items: [
    { href: '/', icon: '▣', label: 'Dashboard' },
  ]},
  { group: 'Flux financiers', items: [
    { href: '/income',   icon: '↑', label: 'Encaissements' },
    { href: '/expenses', icon: '↓', label: 'Décaissements' },
  ]},
  { group: 'Opérations', items: [
    { href: '/inventory',    icon: '◫', label: 'Inventaire' },
    { href: '/costs',        icon: '◈', label: 'Coûts de revient' },
    { href: '/distribution', icon: '◎', label: 'Distribution' },
  ]},
  { group: 'Analyse', items: [
    { href: '/reports', icon: '▸', label: 'Rapports' },
  ]},
]

export default function Layout({ children }) {
  const router = useRouter()

  return (
    <div>
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="company">Clique Beauty</div>
          <div className="sub">Finance & Operations</div>
        </div>

        {NAV.map((section, si) => (
          <div key={si}>
            {section.group && (
              <div className="nav-section-label">{section.group}</div>
            )}
            {section.items.map(n => (
              <button
                key={n.href}
                className={'nav-item' + (router.pathname === n.href ? ' active' : '')}
                onClick={() => router.push(n.href)}
              >
                <span style={{ fontSize: 14, width: 18, textAlign: 'center', opacity: 0.7 }}>{n.icon}</span>
                {n.label}
              </button>
            ))}
          </div>
        ))}

        <div style={{
          marginTop: 'auto',
          padding: '20px 24px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.22)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase'
        }}>
          FY 2025 · v3.0
        </div>
      </nav>

      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
