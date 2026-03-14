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
          <img
            src="/logo.png"
            alt="Clique Beauty"
            style={{ width: '100%', maxWidth: 160, height: 'auto', opacity: 0.95 }}
          />
          <div style={{
            fontSize: 11,
            color: 'rgba(255,255,255,0.32)',
            marginTop: 10,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 400
          }}>Finance & Operations</div>
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
                <span style={{ fontSize: 15, width: 20, textAlign: 'center', opacity: 0.65 }}>{n.icon}</span>
                {n.label}
              </button>
            ))}
          </div>
        ))}

        <div style={{
          marginTop: 'auto',
          padding: '20px 24px',
          borderTop: '1px solid rgba(255,255,255,0.07)',
          fontSize: 10,
          color: 'rgba(255,255,255,0.2)',
          letterSpacing: '0.06em',
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
