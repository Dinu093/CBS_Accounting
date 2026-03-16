import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import { useAuth } from '../lib/auth'

const NAV = [
  { section: 'Dashboards', items: [
    { href: '/', label: 'Operations', icon: 'grid' },
    { href: '/finance', label: 'Finance', icon: 'chart' },
  ]},
  { section: 'Commerce', items: [
  { href: '/customers', label: 'Customers', icon: 'users' },
  { href: '/locations', label: 'Locations', icon: 'map' },
  { href: '/products', label: 'Products', icon: 'box' },
  { href: '/price-lists', label: 'Price Lists', icon: 'report' },
  { href: '/orders', label: 'Orders', icon: 'trending' },
]},,
 { section: 'Inventory', items: [
  { href: '/stock', label: 'Stock', icon: 'layers' },
  { href: '/receipts', label: 'Receipts', icon: 'arrow-in' },
]},
  { section: 'Billing', items: [
    { href: '/invoices', label: 'Invoices', icon: 'report' },
    { href: '/ar-aging', label: 'AR Aging', icon: 'swap' },
  ]},
  { section: 'Cash', items: [
  { href: '/bank-feed', label: 'Bank Feed', icon: 'card' },
  { href: '/reconciliation', label: 'Reconciliation', icon: 'check' },
  { href: '/mercury', label: 'Mercury Import', icon: 'arrow-in' },
]},
  { section: 'Reporting', items: [
    { href: '/pl', label: 'P&L', icon: 'chart' },
    { href: '/reports', label: 'Reports', icon: 'report' },
  ]},
]

const NAV_VIEWER = [
  { section: 'Dashboards', items: [
    { href: '/', label: 'Operations', icon: 'grid' },
  ]},
  { section: 'Commerce', items: [
    { href: '/orders', label: 'Orders', icon: 'trending' },
  ]},
  { section: 'Reporting', items: [
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
    'arrow-in': <><path d="M8 2v8"/><polyline points="4,6 8,10 12,6"/><path d="M2 12h10"/></>,
    card: <><rect x="1" y="3" width="12" height="9" rx="1.5"/><path d="M1 6h12"/></>,
    swap: <><path d="M2 8l3-3 3 3"/><path d="M5 5v6"/><path d="M12 6l-3 3-3-3" transform="translate(6,0)"/><path d="M9 9V3"/></>,
    report: <><rect x="2" y="1" width="10" height="12" rx="1"/><line x1="4" y1="5" x2="10" y2="5"/><line x1="4" y1="8" x2="10" y2="8"/><line x1="4" y1="11" x2="7" y2="11"/></>,
    check: <><polyline points="2,7 6,11 12,3" strokeLinecap="round" strokeLinejoin="round"/></>,
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
        <img src="data:image/png;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/4gHYSUNDX1BST0ZJTEUAAQEAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADb/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/wAARC" alt="Clique Beauty" style={{width:'100%',maxWidth:160,height:'auto',opacity:0.95,display:'block',marginBottom:8}} />
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
      <div className="mobile-header">
        <span style={{ fontSize: 14, fontWeight: 600 }}>Clique Beauty</span>
        <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }} onClick={() => setMenuOpen(!menuOpen)}>
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>
      <div className={`mobile-overlay${menuOpen ? ' open' : ''}`} onClick={() => setMenuOpen(false)} />
      <nav className={`sidebar${menuOpen ? ' open' : ''}`}>
        <SidebarInner />
      </nav>
      <main className="main">
        <div className="page">{children}</div>
      </main>
    </div>
  )
}
