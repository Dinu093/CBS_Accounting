export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquant — ajoutez-la dans Vercel > Settings > Environment Variables' })

  const { file_base64, file_type, customers } = req.body
  if (!file_base64 || !file_type) return res.status(400).json({ error: 'file_base64 et file_type obligatoires' })

  const customerNames = (customers || []).map(c => c.name).join(', ')

  const messages = [
    {
      role: 'user',
      content: [
        {
          type: file_type.includes('pdf') ? 'document' : 'image',
          source: { type: 'base64', media_type: file_type, data: file_base64 },
        },
        {
          type: 'text',
          text: `You are an invoice parser for Clique Beauty Skincare (CBS).

Extract all information from this invoice/order document and return ONLY a JSON object:

{
  "order_number": "string or null",
  "order_date": "YYYY-MM-DD or null",
  "customer_name": "string or null",
  "customer_id": "string or null",
  "channel": "wholesale or ecommerce",
  "payment_status": "paid or unpaid",
  "notes": "string or null",
  "lines": [
    {
      "product_name": "string",
      "sku": "string or null",
      "quantity_ordered": number,
      "unit_price": number,
      "line_total": number
    }
  ],
  "subtotal": number,
  "total_amount": number,
  "confidence": "high or medium or low",
  "warnings": ["array of strings"]
}

Known customers: ${customerNames}

Try to match customer_name to one of the known customers exactly.
Return ONLY valid JSON, no markdown, no explanation.`,
        },
      ],
    },
  ]

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 2000, messages }),
  })

  if (!response.ok) {
    const err = await response.text()
    return res.status(502).json({ error: `Claude API error: ${err}` })
  }

  const data = await response.json()
  const text = data.content?.find(b => b.type === 'text')?.text || ''

  try {
    const clean = text.replace(/```json|```/g, '').trim()
    return res.status(200).json(JSON.parse(clean))
  } catch {
    return res.status(422).json({ error: 'Could not parse response', raw: text })
  }
}
