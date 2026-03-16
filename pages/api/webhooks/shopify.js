import crypto from 'crypto'
import { supabase } from '../../../lib/supabase'

// Désactive le body parser de Next.js — on a besoin du raw body pour vérifier HMAC
export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function verifyHmac(rawBody, hmacHeader, secret) {
  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('base64')
  return computed === hmacHeader
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const rawBody = await getRawBody(req)
  const hmacHeader = req.headers['x-shopify-hmac-sha256']
  const topic = req.headers['x-shopify-topic']

  // Vérifie la signature HMAC
  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (secret && hmacHeader) {
    if (!verifyHmac(rawBody, hmacHeader, secret)) {
      return res.status(401).json({ error: 'Invalid HMAC signature' })
    }
  }

  let payload
  try {
    payload = JSON.parse(rawBody.toString())
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' })
  }

  // Route par topic
  try {
    if (topic === 'orders/create' || topic === 'orders/updated') {
      await handleOrderCreated(payload)
    } else if (topic === 'orders/fulfilled') {
      await handleOrderFulfilled(payload)
    } else if (topic === 'refunds/create') {
      await handleRefund(payload)
    }
  } catch (err) {
    console.error('[Shopify Webhook Error]', topic, err.message)
    // On renvoie 200 quand même pour éviter que Shopify retry en boucle
  }

  return res.status(200).json({ received: true })
}

async function handleOrderCreated(order) {
  // Idempotence — skip si déjà importé
  const { data: existing } = await supabase
    .from('sales_orders')
    .select('id')
    .eq('shopify_order_id', order.id.toString())
    .maybeSingle()

  if (existing) return // déjà importé

  // Seulement les commandes payées
  if (!['paid', 'partially_paid'].includes(order.financial_status)) return

  // Trouve ou crée le customer
  let customerId = await findOrCreateCustomer(order)
  if (!customerId) return

  const subtotal = parseFloat(order.subtotal_price || 0)
  const taxAmount = parseFloat(order.total_tax || 0)
  const totalAmount = parseFloat(order.total_price || 0)

  // Génère numéro de commande
  const { count } = await supabase
    .from('sales_orders')
    .select('*', { count: 'exact', head: true })
    .eq('channel', 'ecommerce')
  const order_number = `CBS-EC-${String((count || 0) + 1).padStart(5, '0')}`

  // Crée la commande
  const { data: salesOrder, error } = await supabase
    .from('sales_orders')
    .insert({
      order_number,
      channel: 'ecommerce',
      status: 'confirmed',
      order_date: order.created_at.split('T')[0],
      customer_id: customerId,
      subtotal,
      tax_amount: taxAmount,
      total_amount: totalAmount,
      payment_terms_days: 0,
      shopify_order_id: order.id.toString(),
      shopify_order_number: order.name,
      notes: `Imported from Shopify — ${order.name}`,
    })
    .select()
    .single()

  if (error) throw new Error(`Order insert failed: ${error.message}`)

  // Crée les lignes
  const lines = (order.line_items || []).map(li => ({
    sales_order_id: salesOrder.id,
    product_id: null, // mapping SKU → product_id fait ci-dessous
    sku: li.sku || `SHOPIFY-${li.variant_id}`,
    product_name: li.title,
    quantity_ordered: li.quantity,
    quantity_fulfilled: 0,
    unit_price: parseFloat(li.price),
    line_total: parseFloat(li.price) * li.quantity,
  }))

  // Essaie de matcher le SKU avec un produit CBS
  for (const line of lines) {
    if (line.sku) {
      const { data: product } = await supabase
        .from('products')
        .select('id')
        .eq('sku', line.sku)
        .maybeSingle()
      if (product) line.product_id = product.id
    }
    // Si pas de match, product_id reste null (commande importée quand même)
    if (!line.product_id) {
      // Crée un produit placeholder si nécessaire
      const { data: placeholder } = await supabase
        .from('products')
        .select('id')
        .eq('sku', line.sku)
        .maybeSingle()
      line.product_id = placeholder?.id || null
    }
  }

  // Filtre les lignes sans product_id pour éviter l'erreur FK
  const validLines = lines.filter(l => l.product_id)
  if (validLines.length > 0) {
    await supabase.from('sales_order_lines').insert(validLines)
  }
}

async function handleOrderFulfilled(order) {
  await supabase
    .from('sales_orders')
    .update({ status: 'fulfilled', updated_at: new Date().toISOString() })
    .eq('shopify_order_id', order.id.toString())
}

async function handleRefund(refund) {
  const amount = parseFloat(refund.transactions?.[0]?.amount || 0)
  if (amount <= 0) return

  // Importe comme transaction bancaire négative (sortie cash)
  await supabase
    .from('bank_transactions')
    .upsert({
      mercury_transaction_id: `shopify-refund-${refund.id}`,
      transaction_date: refund.created_at.split('T')[0],
      description: `Shopify refund — order ${refund.order_id}`,
      amount: -amount,
      transaction_type: 'debit',
      mercury_category: 'refund',
      status: 'unmatched',
    }, { onConflict: 'mercury_transaction_id', ignoreDuplicates: true })
}

async function findOrCreateCustomer(order) {
  const shopifyCustomerId = order.customer?.id?.toString()

  // Cherche par shopify_customer_id
  if (shopifyCustomerId) {
    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('shopify_customer_id', shopifyCustomerId)
      .maybeSingle()
    if (existing) return existing.id
  }

  // Crée le customer
  const firstName = order.customer?.first_name || ''
  const lastName = order.customer?.last_name || ''
  const name = `${firstName} ${lastName}`.trim() || order.email || 'Shopify Customer'

  const { data: newCustomer, error } = await supabase
    .from('customers')
    .insert({
      name,
      type: 'retail',
      email: order.customer?.email || order.email,
      shopify_customer_id: shopifyCustomerId || null,
      payment_terms_days: 0,
    })
    .select('id')
    .single()

  if (error) return null
  return newCustomer.id
}
