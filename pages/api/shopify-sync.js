import { supabase } from '../../lib/supabase'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const SHOPIFY_STORE = process.env.NEXT_PUBLIC_SHOPIFY_STORE
  const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN

  if (!SHOPIFY_STORE || !SHOPIFY_TOKEN)
    return res.status(500).json({ error: 'SHOPIFY_STORE et SHOPIFY_ADMIN_API_TOKEN manquants dans les variables d\'environnement' })

  const { days_back = 30 } = req.body
  const since = new Date()
  since.setDate(since.getDate() - days_back)

  // Fetch orders depuis Shopify
  const shopifyRes = await fetch(
    `https://${SHOPIFY_STORE}/admin/api/2024-01/orders.json?status=any&created_at_min=${since.toISOString()}&limit=250`,
    { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN } }
  )

  if (!shopifyRes.ok) {
    const err = await shopifyRes.text()
    return res.status(502).json({ error: `Shopify API error: ${err}` })
  }

  const { orders } = await shopifyRes.json()
  const results = { imported: 0, skipped: 0, errors: [] }

  for (const order of orders) {
    // Vérifie si déjà importé
    const { data: existing } = await supabase
      .from('sales_orders')
      .select('id')
      .eq('shopify_order_id', order.id.toString())
      .maybeSingle()

    if (existing) { results.skipped++; continue }
    if (!['paid', 'partially_paid'].includes(order.financial_status)) { results.skipped++; continue }

    try {
      // Réutilise la même logique que le webhook
      const webhookHandler = await import('./webhooks/shopify')
      // Import simplifié direct
      const customerId = await findOrCreateCustomer(order)
      if (!customerId) { results.errors.push(`No customer for order ${order.name}`); continue }

      const { count } = await supabase
        .from('sales_orders')
        .select('*', { count: 'exact', head: true })
        .eq('channel', 'ecommerce')
      const order_number = `CBS-EC-${String((count || 0) + 1).padStart(5, '0')}`

      await supabase.from('sales_orders').insert({
        order_number,
        channel: 'ecommerce',
        status: order.fulfillment_status === 'fulfilled' ? 'fulfilled' : 'confirmed',
        order_date: order.created_at.split('T')[0],
        customer_id: customerId,
        subtotal: parseFloat(order.subtotal_price || 0),
        tax_amount: parseFloat(order.total_tax || 0),
        total_amount: parseFloat(order.total_price || 0),
        payment_terms_days: 0,
        shopify_order_id: order.id.toString(),
        shopify_order_number: order.name,
        notes: `Synced from Shopify — ${order.name}`,
      })

      results.imported++
    } catch (err) {
      results.errors.push(`${order.name}: ${err.message}`)
    }
  }

  return res.status(200).json(results)
}

async function findOrCreateCustomer(order) {
  const shopifyCustomerId = order.customer?.id?.toString()
  if (shopifyCustomerId) {
    const { data } = await supabase.from('customers').select('id').eq('shopify_customer_id', shopifyCustomerId).maybeSingle()
    if (data) return data.id
  }
  const name = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || order.email || 'Shopify Customer'
  const { data } = await supabase.from('customers').insert({ name, type: 'retail', email: order.customer?.email || order.email, shopify_customer_id: shopifyCustomerId || null, payment_terms_days: 0 }).select('id').single()
  return data?.id || null
}
