import crypto from 'crypto'
import { supabase } from '../../lib/supabase'

export const config = { api: { bodyParser: false } }

const getRawBody = (req) => new Promise((resolve, reject) => {
  const chunks = []
  req.on('data', chunk => chunks.push(chunk))
  req.on('end', () => resolve(Buffer.concat(chunks)))
  req.on('error', reject)
})

const verifyHmac = (rawBody, hmacHeader) => {
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (!secret) return true // skip verification if not set yet
  const hash = crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  return hash === hmacHeader
}

const FREE_SHIPPING_THRESHOLD = 99

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const hmac = req.headers['x-shopify-hmac-sha256']

  if (!verifyHmac(rawBody, hmac)) {
    return res.status(401).json({ error: 'Invalid HMAC' })
  }

  let order
  try { order = JSON.parse(rawBody.toString()) } catch { return res.status(400).json({ error: 'Invalid JSON' }) }

  // Only process orders from Jan 2026 onwards
  const orderDate = order.created_at ? order.created_at.slice(0, 10) : null
  if (!orderDate || orderDate < '2026-01-01') {
    return res.status(200).json({ skipped: 'Order before Jan 2026' })
  }

  // Check duplicate by reference (Shopify order name like #1234)
  const reference = order.name || String(order.order_number)
  const { data: existing } = await supabase
    .from('sales_orders')
    .select('id')
    .eq('reference', reference)
    .eq('source', 'shopify')
  if (existing?.length > 0) return res.status(200).json({ skipped: 'Duplicate' })

  // Shipping logic: if subtotal >= $99 → Clique Beauty pays → it's a COGS expense
  const subtotal = parseFloat(order.subtotal_price || 0)
  const shippingAmt = parseFloat(order.total_shipping_price_set?.shop_money?.amount || 0)
  const cliquePaysShipping = subtotal >= FREE_SHIPPING_THRESHOLD

  // Buyer info
  const shipping = order.shipping_address || order.billing_address || {}
  const customer = order.customer || {}
  const buyerName = shipping.name || [customer.first_name, customer.last_name].filter(Boolean).join(' ') || 'Shopify Customer'

  // Insert sales_order
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
    buyer_address: shipping.address1 || null,
    buyer_city: shipping.city || null,
    buyer_state: shipping.province_code || null,
    buyer_zip: shipping.zip || null,
    notes: cliquePaysShipping ? 'Free shipping (order ≥$99)' : 'Customer paid shipping',
    source: 'shopify',
  }]).select()

  if (ordErr) return res.status(500).json({ error: ordErr.message })
  const orderId = ord[0].id

  // Insert sale_items
  const lineItems = (order.line_items || []).map(item => ({
    order_id: orderId,
    product_id: null, // no auto-match — user reconciles in app
    quantity: item.quantity,
    unit_price: parseFloat(item.price),
    unit_cost: 0,
    total_price: parseFloat(item.price) * item.quantity,
    margin: 0,
  }))
  if (lineItems.length > 0) await supabase.from('sale_items').insert(lineItems)

  // Record revenue transaction
  await supabase.from('transactions').insert([{
    date: orderDate,
    description: 'Shopify — ' + reference,
    category: 'Sales — E-commerce',
    type: 'revenue',
    amount: subtotal,
    note: orderId,
    source: 'shopify',
  }])

  // If Clique Beauty pays shipping → record as COGS expense
  if (cliquePaysShipping && shippingAmt > 0) {
    await supabase.from('transactions').insert([{
      date: orderDate,
      description: 'Shipping — ' + reference,
      category: 'Shipping (outbound)',
      type: 'cogs',
      amount: shippingAmt,
      note: orderId,
      source: 'shopify',
    }])
  }

  return res.status(200).json({ success: true, order_id: orderId })
}
