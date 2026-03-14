import { useRouter } from 'next/router'

const NAV = [
  { href: '/',             icon: '📊', label: 'Dashboard' },
  { href: '/transactions', icon: '📒', label: 'Transactions' },
  { href: '/inventory',    icon: '📦', label: 'Inventaire' },
  { href: '/upload',       icon: '⬆️', label: 'Upload document' },
  { href: '/reports',      icon: '📈', label: 'Rapports' },
]

export default function Layout({ children }) {
  const router = useRouter()

  return (
    <div>
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="company">Clique Beauty</div>
          <div className="sub">Skincare LLC · Kentucky</div>
        </div>
        {NAV.map(n => (
          <button
            key={n.href}
            className={`nav-item${router.pathname === n.href ? ' active' : ''}`}
            onClick={() => router.push(n.href)}
          >
            <span style={{ fontSize: 16 }}>{n.icon}</span>
            {n.label}
          </button>
        ))}
        <div style={{ marginTop: 'auto', padding: '1.25rem', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-muted)' }}>
          FY 2025 · CBS Accounting v1
        </div>
      </nav>
      <main className="main-content">
        {children}
      </main>
    </div>
  )
}
