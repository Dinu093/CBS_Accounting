export function FormField({ label, required, error, hint, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-1, #1a1a2e)' }}>
          {label}{required && <span style={{ color: '#e94560', marginLeft: 2 }}>*</span>}
        </label>
      )}
      {children}
      {hint && !error && (
        <span style={{ fontSize: 12, color: 'var(--text-2, #888)' }}>{hint}</span>
      )}
      {error && (
        <span style={{ fontSize: 12, color: '#c53030' }}>{error}</span>
      )}
    </div>
  )
}

export function ModalInput({ type = 'text', value, onChange, placeholder, required, disabled, min, step, style = {} }) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      min={min}
      step={step}
      style={{
        width: '100%',
        padding: '0.55rem 0.75rem',
        borderRadius: 8,
        border: '1.5px solid var(--border, #e5e7eb)',
        fontSize: 14,
        color: 'var(--text-1, #1a1a2e)',
        background: 'var(--bg, #fafafa)',
        outline: 'none',
        transition: 'border-color 0.15s',
        boxSizing: 'border-box',
        ...style,
      }}
      onFocus={e => e.target.style.borderColor = 'var(--accent, #e94560)'}
      onBlur={e => e.target.style.borderColor = 'var(--border, #e5e7eb)'}
    />
  )
}

export function ModalSelect({ value, onChange, children, required, style = {} }) {
  return (
    <select
      value={value}
      onChange={onChange}
      required={required}
      style={{
        width: '100%',
        padding: '0.55rem 0.75rem',
        borderRadius: 8,
        border: '1.5px solid var(--border, #e5e7eb)',
        fontSize: 14,
        color: 'var(--text-1, #1a1a2e)',
        background: 'var(--bg, #fafafa)',
        outline: 'none',
        cursor: 'pointer',
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </select>
  )
}

export function ModalError({ message }) {
  if (!message) return null
  return (
    <div style={{
      background: '#fff5f5',
      border: '1px solid #fed7d7',
      color: '#c53030',
      borderRadius: 8,
      padding: '0.6rem 0.75rem',
      fontSize: 13,
      marginBottom: '0.5rem',
    }}>
      {message}
    </div>
  )
}

export function ModalActions({ children }) {
  return (
    <div style={{
      display: 'flex',
      gap: '0.5rem',
      justifyContent: 'flex-end',
      marginTop: '1.5rem',
      paddingTop: '1.25rem',
      borderTop: '1px solid var(--border, #e5e7eb)',
    }}>
      {children}
    </div>
  )
}

export function BtnPrimary({ children, onClick, disabled, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '0.55rem 1.25rem',
        background: disabled ? '#ccc' : 'var(--text-1, #1a1a2e)',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'opacity 0.15s',
      }}
    >
      {children}
    </button>
  )
}

export function BtnSecondary({ children, onClick, type = 'button' }) {
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        padding: '0.55rem 1.25rem',
        background: 'transparent',
        color: 'var(--text-2, #888)',
        border: '1.5px solid var(--border, #e5e7eb)',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}
