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
      system: `You are an accounting assistant for Clique Beauty Skincare LLC. Parse this Shopify orders export and extract each order.

CRITICAL RULES:
- Revenue = Subtotal column ONLY (product prices, excluding shipping and taxes)
- Shipping logic: if Subtotal >= 90, Clique Beauty pays shipping (free shipping threshold) → shipping_cost = Shipping column value, shipping_charged = true
- If Subtotal < 90, customer paid shipping → shipping_cost = 0, shipping_charged = false (not Clique Beauty's expense)
- Taxes are NOT revenue and NOT expense — ignore them
- One order = one record even if multiple line items

Return ONLY a JSON array (no markdown). Each order:
{
  "order_id": "#XXXX",
  "date": "YYYY-MM-DD",
  "buyer_name": "from Shipping Name",
  "buyer_email": "email",
  "buyer_address": "Shipping Address1",
  "buyer_city": "Shipping City",
  "buyer_state": "Shipping Province (2-letter)",
  "buyer_zip": "Shipping Zip (remove leading apostrophe if present)",
  "items": [{"product_id": "match from list or null", "product_name_found": "Lineitem name", "quantity": number, "unit_price": number}],
  "subtotal": number (Subtotal column — PRODUCTS ONLY),
  "shipping_cost": number (Shipping column value IF subtotal >= 90, else 0),
  "shipping_charged": boolean (true if subtotal >= 90 meaning Clique Beauty paid shipping, false otherwise),
  "total": number (Total column),
  "payment_status": "paid" or "pending" based on Financial Status,
  "financial_status": "paid/pending/etc"
}

Products: [${productList}]
Return ONLY the JSON array.`,
      messages: [{ role: 'user', content: `Parse these Shopify orders:\n\n${csvContent.slice(0, 50000)}` }]
    })

    const text = response.content.map(c => c.text || '').join('')
    const clean = text.replace(/```json|```/g, '').trim()
    const orders = JSON.parse(clean)

    return res.json({ orders: Array.isArray(orders) ? orders : [orders] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
