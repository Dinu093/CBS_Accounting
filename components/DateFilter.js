import { useState } from 'react'

const PRESETS = [
  { label: 'Tout', value: 'all' },
  { label: "Aujourd'hui", value: 'today' },
  { label: '7 jours', value: '7d' },
  { label: 'Ce mois', value: 'month' },
  { label: 'Mois dernier', value: 'lastmonth' },
  { label: 'Trimestre', value: 'quarter' },
  { label: 'Année', value: 'year' },
  { label: 'Personnalisé', value: 'custom' },
]

function getRange(preset) {
  const now = new Date()
  const today = now.toISOString().split('T')[0]
  switch (preset) {
    case 'all': return { from: null, to: null }
    case 'today': return { from: today, to: today }
    case '7d': {
      const d = new Date(); d.setDate(d.getDate() - 6)
      return { from: d.toISOString().split('T')[0], to: today }
    }
    case 'month': return { from: today.slice(0, 7) + '-01', to: today }
    case 'lastmonth': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last = new Date(now.getFullYear(), now.getMonth(), 0)
      return { from: d.toISOString().split('T')[0], to: last.toISOString().split('T')[0] }
    }
    case 'quarter': {
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), q * 3, 1)
      return { from: start.toISOString().split('T')[0], to: today }
    }
    case 'year': return { from: now.getFullYear() + '-01-01', to: today }
    default: return { from: null, to: null }
  }
}

export function filterByDate(items, dateField, range) {
  if (!range || (!range.from && !range.to)) return items
  return items.filter(item => {
    const d = item[dateField]
    if (!d) return true
    if (range.from && d < range.from) return false
    if (range.to && d > range.to) return false
    return true
  })
}

export default function DateFilter({ onChange }) {
  const [preset, setPreset] = useState('all')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [showCustom, setShowCustom] = useState(false)

  const apply = (p, c = custom) => {
    if (p === 'custom') onChange({ from: c.from || null, to: c.to || null })
    else onChange(getRange(p))
  }

  const handlePreset = (p) => {
    setPreset(p)
    setShowCustom(p === 'custom')
    if (p !== 'custom') apply(p)
  }

  const handleCustom = (field, val) => {
    const updated = { ...custom, [field]: val }
    setCustom(updated)
    apply('custom', updated)
  }

  return (
    <div className="date-filter-bar">
      <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 6 }}>Période</span>
      {PRESETS.map(p => (
        <button
          key={p.value}
          onClick={() => handlePreset(p.value)}
          style={{
            fontSize: 12,
            padding: '5px 12px',
            borderRadius: 20,
            background: preset === p.value ? 'var(--navy)' : 'transparent',
            color: preset === p.value ? 'white' : 'var(--text-muted)',
            borderColor: preset === p.value ? 'var(--navy)' : 'transparent',
            fontWeight: preset === p.value ? 500 : 400,
          }}
        >
          {p.label}
        </button>
      ))}
      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4 }}>
          <input type="date" value={custom.from} onChange={e => handleCustom('from', e.target.value)}
            style={{ fontSize: 12, padding: '5px 10px', width: 140 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>→</span>
          <input type="date" value={custom.to} onChange={e => handleCustom('to', e.target.value)}
            style={{ fontSize: 12, padding: '5px 10px', width: 140 }} />
        </div>
      )}
    </div>
  )
}
