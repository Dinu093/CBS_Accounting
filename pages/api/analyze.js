import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { type, content, mediaType, filename, systemOverride } = req.body
  const system = systemOverride || 'You are an accounting assistant for Clique Beauty Skincare LLC. Extract transactions from the provided document. Return ONLY a JSON array.'
  try {
    let messages
    if (type === 'spreadsheet' || type === 'text') {
      messages = [{ role: 'user', content: 'Parse this document:\n\n' + content }]
    } else {
      messages = [{ role: 'user', content: [{ type: type === 'image' ? 'image' : 'document', source: { type: 'base64', media_type: mediaType, data: content } }, { type: 'text', text: 'Extract all transactions from this document.' }] }]
    }
    const response = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 4000, system, messages })
    const text = response.content.map(c => c.text || '').join('')
    const clean = text.replace(/```json|```/g, '').trim()
    const transactions = JSON.parse(clean)
    return res.json({ transactions: Array.isArray(transactions) ? transactions : [transactions] })
  } catch (err) { return res.status(500).json({ error: err.message }) }
}
