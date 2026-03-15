import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { type, content, mediaType, products, distributors } = req.body

  const productList = (products || []).map(p => `${p.product_name} (id:${p.id}, msrp:${p.msrp})`).join(', ')
  const distList = (distributors || []).map(d => `${d.name} (id:${d.id}, discount:${d.discount_pct}%)`).join(', ')

  const system = `You are an accounting assistant for Clique Beauty Skincare LLC. Extract the sale from this invoice or order document.

Return ONLY a JSON object:
{
  "date": "YYYY-MM-DD",
  "reference": "invoice or order number",
  "channel": "Wholesale or E-commerce",
  "buyer_name": "customer or company name",
  "buyer_email": "email if present",
  "buyer_address": "street address",
  "buyer_city": "city",
  "buyer_state": "2-letter state code",
  "buyer_zip": "zip code",
  "distributor_id": "match from distributor list or null",
  "payment_status": "paid or pending",
  "items": [
    { "product_id": "match from product list or null", "product_name_found": "as written on invoice", "quantity": number, "unit_price": number }
  ],
  "shipping_cost": number or 0,
  "notes": "any relevant note"
}

Products available: ${productList}
Distributors: ${distList}

Return ONLY the JSON object, no markdown.`

  try {
    let messages
    if (type === 'spreadsheet' || type === 'text') {
      messages = [{ role: 'user', content: 'Extract sale from:\n\n' + content }]
    } else {
      messages = [{ role: 'user', content: [
        { type: type === 'image' ? 'image' : 'document', source: { type: 'base64', media_type: mediaType, data: content } },
        { type: 'text', text: 'Extract the sale from this invoice.' }
      ]}]
    }
    const response = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, system, messages })
    const text = response.content.map(c => c.text || '').join('')
    const clean = text.replace(/```json|```/g, '').trim()
    return res.json({ invoice: JSON.parse(clean) })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
