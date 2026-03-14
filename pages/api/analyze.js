import Anthropic from '@anthropic-ai/sdk'
import { CAT_KEYS } from '../../lib/constants'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  try {
    const { type, content, filename, mediaType, systemOverride, mode } = req.body

    const defaultSystem = `Tu es un assistant comptable pour Clique Beauty Skincare LLC, société de cosmétiques basée au Kentucky. Extrait TOUTES les transactions financières du document fourni. Retourne UNIQUEMENT un tableau JSON (sans markdown, sans explication). Chaque élément doit avoir : "date" (YYYY-MM-DD), "description" (concise en anglais), "category" (exactement une de : ${CAT_KEYS.join(', ')}), "amount" (nombre positif), "note" (string optionnel). Si la date est absente, utilise aujourd'hui. Pour les relevés bancaires : les crédits sont des revenus ou apports capital, les débits sont des dépenses.`

    const system = systemOverride || defaultSystem

    let messages
    if (type === 'spreadsheet') {
      messages = [{ role: 'user', content: `Voici le contenu d'un document (${filename}):\n\n${content}` }]
    } else {
      const block = type === 'image'
        ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: content } }
        : { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: content } }
      messages = [{ role: 'user', content: [block, { type: 'text', text: 'Extrait les informations de ce document.' }] }]
    }

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system,
      messages
    })

    const text = response.content.map(c => c.text || '').join('')
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    // Return different keys based on mode
    if (mode === 'sale') {
      return res.json({ sale: parsed })
    }

    return res.json({ transactions: Array.isArray(parsed) ? parsed : [parsed] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
}
