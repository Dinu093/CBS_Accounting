import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { from, to } = req.body

  try {
    // Fetch all data
    let txQuery = supabase.from('transactions').select('*').order('date')
    let salesQuery = supabase.from('sales_orders').select('*, sale_items(*, inventory(product_name, unit_cost)), distributors(name, channel)').order('date')
    let payQuery = supabase.from('payables').select('*').order('due_date')
    let recQuery = supabase.from('receivables').select('*').order('due_date')

    if (from) { txQuery = txQuery.gte('date', from); salesQuery = salesQuery.gte('date', from); payQuery = payQuery.gte('due_date', from); recQuery = recQuery.gte('due_date', from) }
    if (to) { txQuery = txQuery.lte('date', to); salesQuery = salesQuery.lte('date', to); payQuery = payQuery.lte('due_date', to); recQuery = recQuery.lte('due_date', to) }

    const [{ data: txs }, { data: sales }, { data: payables }, { data: receivables }] = await Promise.all([
      txQuery, salesQuery, payQuery, recQuery
    ])

    const period = (from || 'Start') + ' to ' + (to || 'Present')

    // P&L calculations
    const CATS = { revenue: ['Sales — products', 'Returns & refunds'], cogs: ['Inventory / product cost', 'Packaging', 'Shipping (outbound)'], opex: ['Marketing & ads', 'Website & tech', 'Legal & professional fees', 'Bank fees', 'Shipping (inbound)', 'Other expense'], capital: ['Capital contribution', 'Member distribution'] }
    const sumCat = (cats) => (txs || []).filter(t => cats.includes(t.category)).reduce((a, t) => a + parseFloat(t.amount || 0), 0)

    const revenue = sumCat(CATS.revenue)
    const cogs = sumCat(CATS.cogs)
    const gross = revenue - cogs
    const grossPct = revenue > 0 ? (gross / revenue * 100) : 0
    const opex = sumCat(CATS.opex)
    const netIncome = gross - opex
    const netPct = revenue > 0 ? (netIncome / revenue * 100) : 0
    const capital = sumCat(CATS.capital)

    // Sales by state
    const salesByState = {}
    ;(sales || []).forEach(o => {
      const state = o.buyer_state || 'Unknown'
      if (!salesByState[state]) salesByState[state] = { count: 0, total: 0 }
      salesByState[state].count++
      salesByState[state].total += parseFloat(o.total_amount || 0)
    })

    // Expenses by category
    const expByCat = {}
    ;(txs || []).filter(t => CATS.opex.includes(t.category) || CATS.cogs.includes(t.category)).forEach(t => {
      if (!expByCat[t.category]) expByCat[t.category] = 0
      expByCat[t.category] += parseFloat(t.amount || 0)
    })

    // Vendors paid > $600 (1099 candidates)
    const vendorTotals = {}
    ;(txs || []).filter(t => CATS.opex.includes(t.category) || CATS.cogs.includes(t.category)).forEach(t => {
      const vendor = t.note || t.description || 'Unknown'
      if (!vendorTotals[vendor]) vendorTotals[vendor] = 0
      vendorTotals[vendor] += parseFloat(t.amount || 0)
    })

    // Return JSON data for client-side Excel generation
    return res.json({
      period,
      from, to,
      pnl: { revenue, cogs, gross, grossPct, opex, netIncome, netPct, capital },
      expensesByCategory: expByCat,
      salesByChannel: {
        ecom: (sales || []).filter(o => o.channel === 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0),
        wholesale: (sales || []).filter(o => o.channel !== 'E-commerce').reduce((a, o) => a + parseFloat(o.total_amount || 0), 0),
      },
      salesByState,
      transactions: txs || [],
      sales: sales || [],
      payables: payables || [],
      receivables: receivables || [],
      vendorsOver600: Object.entries(vendorTotals).filter(([, v]) => v >= 600).map(([name, total]) => ({ name, total })),
      members: [
        { name: 'Member 1', pct: 50, share: netIncome * 0.5 },
        { name: 'Member 2', pct: 50, share: netIncome * 0.5 },
      ]
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
