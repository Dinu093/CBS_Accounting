export const CATEGORIES = {
  'Capital contribution': 'capital',
  'Member distribution': 'capital',
  'Sales — products': 'revenue',
  'Returns & refunds': 'revenue',
  'Inventory / product cost': 'cogs',
  'Packaging': 'cogs',
  'Shipping (outbound)': 'cogs',
  'Marketing & ads': 'opex',
  'Website & tech': 'opex',
  'Legal & professional fees': 'opex',
  'Bank fees': 'opex',
  'Shipping (inbound)': 'opex',
  'Other expense': 'opex',
}

export const CAT_KEYS = Object.keys(CATEGORIES)

export const TYPE_COLORS = {
  capital: { bg: '#E6F1FB', text: '#0C447C', label: 'Capital' },
  revenue: { bg: '#EAF3DE', text: '#27500A', label: 'Revenu' },
  cogs:    { bg: '#FAEEDA', text: '#633806', label: 'Coût des ventes' },
  opex:    { bg: '#FAECE7', text: '#712B13', label: 'Charge opex' },
}

export function usd(n) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2,
  }).format(n || 0)
}

export function fdate(d) {
  if (!d) return '—'
  return new Date(d + 'T12:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}
