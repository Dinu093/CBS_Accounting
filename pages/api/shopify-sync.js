import { supabase } from '../../lib/supabase'

const FREE_SHIPPING_THRESHOLD = 99
const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN
const SHOPIFY_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  if (!SHOPIFY_DOMAIN || !SHOPIFY_TOKEN) {
    return res.status(500).json({ error: 'Missing SHOPIFY_STORE_DOMAIN or SHOPIFY_ACCESS_TOKEN in environment variables' })
  }

  let allOrders = [], pageInfo = null, page = 0
  const maxPages = 20

  try {
    // Fetch all orders from Jan 1 2026 onwards, paginated
    do {
      let url = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01/orders.json?status=any&limit=250&created_at_min=2026-01-01T00:00:00Z&fields=id,name,order_number,created_at,financial_status,subtotal_price,total_shipping_price_set,line_items,customer,shipping_address,billing_address,email`
      if (pageInfo) url += `&page_info=${pageInfo}`

      const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': SHOPIFY_TOKEN, 'Content-Type': 'application/json' } })
      if (!r.ok) { const err = await r.text(); return res.status(500).json({ error: 'Shopify API error: ' + err }) }

      const data = await r.json()
      allOrders = allOrders.concat(data.orders || [])

      // Get next page from Link header
      const link = r.headers.get('Link') || ''
      const nextMatch = link.match(/<[^>]*page_info=([^&>]+)[^>]*>; rel="next"/)
      pageInfo = nextMatch ? nextMatch[1] : null
      page++
    } while (pageInfo && page < maxPages)

    let inserted = 0, skipped = 0, errors = []

    for (const order of allOrders) {
      const orderDate = order.created_at?.slice(0, 10)
      if (!orderDate) continue

      const reference = order.name || String(order.order_number)

      // Skip duplicates
      const { data: existing } = await supabase.from('sales_orders').select('id').eq('reference', reference).eq('source', 'shopify')
      if (existing?.length > 0) { skipped++; continue }

      const subtotal = parseFloat(order.subtotal_price || 0)
      const shippingAmt = parseFloat(order.total_shipping_price_set?.shop_money?.amount || 0)
      const cliquePaysShipping = subtotal >= FREE_SHIPPING_THRESHOLD
      const shipping = order.shipping_address || order.billing_address || {}
      const customer = order.customer || {}
      const buyerName = shipping.name || [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Shopify Customer'

      const { data: ord, error: ordErr } = await supabase.from('sales_orders').insert([{
        date: orderDate,
        channel: 'E-commerce',
        reference,
        payment_status: order.financial_status === 'paid' ? 'paid' : 'pending',
        total_amount: subtotal,
        shipping_cost: cliquePaysShipping ? shippingAmt : 0,
        buyer_name: buyerName,
        buyer_email: customer.email || order.email || null,
        buyer_phone: shipping.phone || customer.phone || null,
        buyer_address: [shipping.address1, shipping.address2].filter(Boolean).join(', ') || null,
        buyer_city: shipping.city || null,
        buyer_state: shipping.province_code || null,
        buyer_zip: shipping.zip || null,
        notes: cliquePaysShipping ? 'Free shipping (order ≥$99)' : 'Customer paid shipping',
        source: 'shopify',
      }]).select()

      if (ordErr) { errors.push({ reference, error: ordErr.message }); continue }
      const orderId = ord[0].id

      // Line items
      const lineItems = (order.line_items || []).map(item => ({
        order_id: orderId, product_id: null,
        quantity: item.quantity, unit_price: parseFloat(item.price),
        unit_cost: 0, total_price: parseFloat(item.price) * item.quantity, margin: 0,
      }))
      if (lineItems.length > 0) await supabase.from('sale_items').insert(lineItems)

      // Revenue transaction
      await supabase.from('transactions').insert([{
        date: orderDate, description: 'Shopify — ' + reference,
        category: 'Sales — E-commerce', type: 'revenue', amount: subtotal, note: orderId, source: 'shopify',
      }])

      // Shipping expense if Clique pays
      if (cliquePaysShipping && shippingAmt > 0) {
        await supabase.from('transactions').insert([{
          date: orderDate, description: 'Shipping — ' + reference,
          category: 'Shipping (outbound)', type: 'cogs', amount: shippingAmt, note: orderId, source: 'shopify',
        }])
      }

      inserted++
    }

    return res.json({ success: true, total: allOrders.length, inserted, skipped, errors })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
