export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { file_base64, file_type, customers } = req.body
  if (!file_base64 || !file_type) return res.status(400).json({ error: 'file_base64 et file_type obligatoires' })

  const customerNames = (customers || []).map(c => c.name).join(', ')

  const messages = [
    {
      role: 'user',
      content: [
        {
          type: file_type.includes('pdf') ? 'document' : 'image',
          source: {
            type: 'base64',
            media_type: file_type,
            data: file_base64,
          },
        },
        {
          type: 'text',
          text: `You are an invoice parser for Clique Beauty Skincare (CBS), a beauty brand.

Extract all information from this invoice/order document and return ONLY a JSON object with this exact structure:

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
  "warnings": ["array of strings describing anything unclear"]
}

Known customers in the system: ${customerNames}

Try to match customer_name to one of the known customers. If you find a match, set customer_name to the exact name from the list.

Return ONLY valid JSON, no markdown, no explanation.`,
        },
      ],
    },
  ]

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    return res.status(502).json({ error: `Claude API error: ${err}` })
  }

  const data = await response.json()
  const text = data.content?.find(b => b.type === 'text')?.text || ''

  try {
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return res.status(200).json(parsed)
  } catch {
    return res.status(422).json({ error: 'Could not parse Claude response', raw: text })
  }
}
