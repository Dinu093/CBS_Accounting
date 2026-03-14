import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { csvContent, products } = req.body

    const productList = products.map(p => `{"id":"${p.id}","name":"${p.product_name}"}`).join(', ')

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      system: `You are an accounting assistant for Clique Beauty Skincare LLC. Parse this Shopify orders CSV export and extract each order as a structured record. Return ONLY a JSON array (no markdown). Each order object must have:
- "order_id": Shopify order number (string)
- "date": order date YYYY-MM-DD
- "buyer_name": customer full name
- "buyer_email": customer email
- "buyer_phone": customer phone (or null)
- "buyer_address": shipping street address
- "buyer_city": shipping city
- "buyer_state": shipping state (2-letter code)
- "buyer_zip": shipping zip code
- "items": array of {"product_id": "exact id from list or null", "product_name_found": "name in order", "quantity": number, "unit_price": number}
- "subtotal": order subtotal (number)
- "shipping_cost": shipping amount charged to Clique Beauty (number, 0 if customer paid)
- "shipping_charged": true if Clique Beauty paid shipping (order subtotal >= 99 and shipping was free), false otherwise
- "total": order total (number)
- "payment_status": "paid" or "pending"

Products available: [${productList}]

IMPORTANT: If shipping is $0 in the CSV but subtotal >= $99, set shipping_charged to true and estimate shipping_cost as 8.99. If subtotal < $99 and customer paid shipping, set shipping_charged to false and shipping_cost to 0. Return ONLY the JSON array.`,
      messages: [{ role: 'user', content: `Parse these Shopify orders:\n\n${csvContent.slice(0, 50000)}` }]
    })

    const text = response.content.map(c => c.text || '').join('')
    const clean = text.replace(/```json|```/g, '').trim()
    const orders = JSON.parse(clean)

    return res.json({ orders: Array.isArray(orders) ? orders : [orders] })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
}
