import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../pages/_app'

const NAV = [
  { section: 'Dashboards', items: [
    { href: '/', label: 'Operations', icon: 'grid' },
    { href: '/finance', label: 'Finance', icon: 'chart' },
  ]},
  { section: 'Operations', items: [
    { href: '/products', label: 'Products', icon: 'box' },
    { href: '/stock', label: 'Stock', icon: 'layers' },
    { href: '/sales', label: 'Sales', icon: 'trending' },
    { href: '/distributors', label: 'Distributors', icon: 'users' },
    { href: '/exits', label: 'Product exits', icon: 'arrow-out' },
  ]},
  { section: 'Finance', items: [
    { href: '/transactions', label: 'Transactions', icon: 'card' },
    { href: '/apar', label: 'AP / AR', icon: 'swap' },
    { href: '/reports', label: 'Reports', icon: 'report' },
  ]},
  { section: 'Analytics', items: [
    { href: '/map', label: 'Customer map', icon: 'map' },
  ]},
]

const NAV_VIEWER = [
  { section: 'Dashboards', items: [
    { href: '/', label: 'Operations', icon: 'grid' },
    { href: '/finance', label: 'Finance', icon: 'chart' },
  ]},
  { section: 'Operations', items: [
    { href: '/sales', label: 'Sales', icon: 'trending' },
  ]},
  { section: 'Finance', items: [
    { href: '/transactions', label: 'Transactions', icon: 'card' },
    { href: '/apar', label: 'AP / AR', icon: 'swap' },
    { href: '/reports', label: 'Reports', icon: 'report' },
  ]},
]

function Icon({ name }) {
  const icons = {
    grid: <><rect x="2" y="2" width="4" height="4" rx="0.5"/><rect x="8" y="2" width="4" height="4" rx="0.5"/><rect x="2" y="8" width="4" height="4" rx="0.5"/><rect x="8" y="8" width="4" height="4" rx="0.5"/></>,
    chart: <><polyline points="1,10 4,6 7,8 10,3 13,5" strokeLinecap="round" strokeLinejoin="round"/></>,
    box: <><path d="M7 1L13 4v6L7 13 1 10V4z"/><polyline points="1,4 7,7 13,4"/><line x1="7" y1="7" x2="7" y2="13"/></>,
    layers: <><rect x="1" y="4" width="12" height="8" rx="1"/><path d="M3 4V2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></>,
    trending: <><polyline points="1,11 4,7 7,9 13,2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="9,2 13,2 13,6" strokeLinecap="round" strokeLinejoin="round"/></>,
    users: <><circle cx="5" cy="5" r="3"/><circle cx="10" cy="5" r="2"/><path d="M1 13c0-2.2 1.8-4 4-4s4 1.8 4 4"/><path d="M10 9c1.7 0 3 1.3 3 3"/></>,
    'arrow-out': <><path d="M6 2H2a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V8"/><polyline points="9,1 13,1 13,5"/><line x1="6" y1="8" x2="13" y2="1"/></>,
    card: <><rect x="1" y="3" width="12" height="9" rx="1.5"/><path d="M1 6h12"/></>,
    swap: <><path d="M2 8l3-3 3 3"/><path d="M5 5v6"/><path d="M12 6l-3 3-3-3" transform="translate(6,0)"/><path d="M9 9V3"/></>,
    report: <><rect x="2" y="1" width="10" height="12" rx="1"/><line x1="4" y1="5" x2="10" y2="5"/><line x1="4" y1="8" x2="10" y2="8"/><line x1="4" y1="11" x2="7" y2="11"/></>,
    map: <><circle cx="7" cy="6" r="3"/><path d="M7 9c-2 2.5-4 4-4 5.5C3 15.3 4.8 16 7 16s4-.7 4-1.5C11 13 9 11.5 7 9z" transform="scale(0.85) translate(1,-1)"/></>,
  }
  return (
    <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.3">
      {icons[name] || null}
    </svg>
  )
}

export default function Layout({ children }) {
  const router = useRouter()
  const { user, isAdmin } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => { setMenuOpen(false) }, [router.pathname])
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const logout = async () => {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
    await sb.auth.signOut()
    router.push('/login')
  }

  const nav = isAdmin ? NAV : NAV_VIEWER

  const SidebarInner = () => (
    <>
      <div className="sb-logo">
        <div className="sb-logo-name">Clique Beauty</div>
        <div className="sb-logo-sub">Finance & Operations</div>
      </div>
      {nav.map((section, i) => (
        <div key={i}>
          <div className="sb-section">{section.section}</div>
          {section.items.map(item => (
            <button key={item.href} className={`sb-item${router.pathname === item.href ? ' active' : ''}`} onClick={() => router.push(item.href)}>
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </div>
      ))}
      <div className="sb-bottom">
        <div className="sb-user">{user?.email}</div>
        <div className="sb-role"><span className="sb-role-dot" />{isAdmin ? 'Admin' : 'Viewer'}</div>
        <button className="sb-signout" onClick={logout}>Sign out</button>
      </div>
    </>
  )

  return (
    <div className="app">
      {/* Mobile header */}
      <div className="mobile-header">
        <span style={{ fontSize: 14, fontWeight: 600 }}>Clique Beauty</span>
        <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile overlay */}
      <div className={`mobile-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />

      {/* Sidebar */}
      <nav className={`sidebar${menuOpen ? ' open' : ''}`}>
        <SidebarInner />
      </nav>

      {/* Main */}
      <main className="main">
        <div className="page">{children}</div>
      </main>
    </div>
  )
}
