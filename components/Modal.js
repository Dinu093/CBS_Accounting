import { useEffect } from 'react'

export default function Modal({ open, onClose, title, subtitle, children, width = 560 }) {
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(10, 10, 20, 0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-2, #fff)',
          borderRadius: 16,
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
          border: '1px solid var(--border, #e5e7eb)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '1.5rem 1.75rem 0',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '1rem',
        }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-1, #1a1a2e)' }}>
              {title}
            </h2>
            {subtitle && (
              <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-2, #888)' }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'var(--bg, #f5f5f5)',
              border: 'none',
              borderRadius: 8,
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 18,
              color: 'var(--text-2, #888)',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem 1.75rem 1.75rem' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
