export const usd = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)
export const pct = (v) => (v || 0).toFixed(1) + '%'
export const fdate = (d) => { if (!d) return '—'; const dt = new Date(d + 'T12:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
export const fdateShort = (d) => { if (!d) return '—'; const dt = new Date(d + 'T12:00:00'); return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) }

export const CHANNELS = ['E-commerce', 'Wholesale']

export const EXIT_TYPES = [
  { value: 'gifted', label: 'Gifted / PR', accounting: 'Marketing expense' },
  { value: 'sample', label: 'Sample / Demo', accounting: 'COGS' },
  { value: 'loss', label: 'Loss / Damage', accounting: 'Write-off' },
  { value: 'internal', label: 'Internal use', accounting: 'OpEx' },
]

export const TX_CATEGORIES = [
  { value: 'Sales — E-commerce', type: 'revenue', account: '4000' },
  { value: 'Sales — Wholesale', type: 'revenue', account: '4010' },
  { value: 'Capital contribution', type: 'capital', account: '3100' },
  { value: 'Inventory / product cost', type: 'cogs', account: '5000' },
  { value: 'Freight (inbound)', type: 'cogs', account: '5010' },
  { value: 'Customs / tariffs', type: 'cogs', account: '5020' },
  { value: 'Shipping (outbound)', type: 'cogs', account: '5030' },
  { value: 'Marketing & ads', type: 'opex', account: '6000' },
  { value: 'Gifted products', type: 'opex', account: '6010' },
  { value: 'Website & tech', type: 'opex', account: '6020' },
  { value: 'Legal & professional fees', type: 'opex', account: '6030' },
  { value: 'Bank fees', type: 'opex', account: '6040' },
  { value: 'Other expense', type: 'opex', account: '6090' },
  { value: 'Member distribution', type: 'distribution', account: '3200' },
]

export const TX_CAT_MAP = Object.fromEntries(TX_CATEGORIES.map(c => [c.value, c.type]))

export const initials = (name) => {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}
