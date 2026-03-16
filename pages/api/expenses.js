import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {

  if (req.method === 'GET') {
    const { category, from, to } = req.query
    let query = supabase
      .from('expenses')
      .select('*')
      .order('expense_date', { ascending: false })
    if (category) query = query.eq('category', category)
    if (from) query = query.gte('expense_date', from)
    if (to) query = query.lte('expense_date', to)
    const { data, error } = await query
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json(data)
  }

  if (req.method === 'POST') {
    const { expense_date, description, category, amount, vendor, notes } = req.body
    if (!expense_date || !description || !category || !amount)
      return res.status(400).json({ error: 'expense_date, description, category, amount obligatoires' })

    // Trouve le compte comptable correspondant
    const categoryToCode = {
      marketing:   '6100',
      payroll:     '6200',
      software:    '6300',
      shipping:    '6400',
      legal:       '6500',
      rent:        '6600',
      travel:      '6700',
      other:       '6800',
      shopify_fee: '7000',
      bank_fee:    '7100',
    }
    const code = categoryToCode[category] || '6800'
    const { data: account } = await supabase
      .from('chart_of_accounts')
      .select('id')
      .eq('code', code)
      .single()

    const { data, error } = await supabase
      .from('expenses')
      .insert({ expense_date, description, category, amount, vendor, notes, account_id: account?.id })
      .select()
      .single()

    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  if (req.method === 'DELETE') {
    const { id } = req.query
    if (!id) return res.status(400).json({ error: 'id obligatoire' })
    const { error } = await supabase.from('expenses').delete().eq('id', id)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ success: true })
  }

  res.status(405).json({ error: 'Method not allowed' })
}
