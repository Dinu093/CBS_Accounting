import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

// ⚠️ Raw body requis pour vérifier la signature
export const config = {
  api: { bodyParser: false }
}

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const rawBody = await getRawBody(req)
  const hmac = req.headers['x-shopify-hmac-sha256']

  // 1. Vérifier la signature
  const digest = crypto
    .createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest('base64')

  if (digest !== hmac) {
    console.error('❌ Webhook non autorisé')
    return res.status(401).send('Unauthorized')
  }

  const order = JSON.parse(rawBody.toString())

  // 2. Construire la vente (même format que ton import Shopify CSV)
  const vente = {
    order_number:     order.order_number?.toString(),
    date:             order.created_at?.split('T')[0],
    channel:          'E-commerce',
    customer_name:    `${order.customer?.first_name || ''} ${order.customer?.last_name || ''}`.trim(),
    email:            order.customer?.email || '',
    subtotal:         parseFloat(order.subtotal_price || 0),
    shipping:         parseFloat(order.total_shipping_price_set?.shop_money?.amount || 0),
    total:            parseFloat(order.total_price || 0),
    currency:         order.currency,
    payment_status:   order.financial_status === 'paid' ? 'paid' : 'pending',
    products:         order.line_items?.map(i => i.title).join(', '),
    source:           'shopify_webhook',
  }

  // 3. Insérer dans Supabase (table sales)
  const { error } = await supabase
    .from('sales')
    .upsert(vente, { onConflict: 'order_number' }) // pas de doublon

  if (error) {
    console.error('❌ Supabase error:', error)
    return res.status(500).send('DB Error')
  }

  console.log(`✅ Commande #${order.order_number} enregistrée`)
  return res.status(200).send('OK')
}
