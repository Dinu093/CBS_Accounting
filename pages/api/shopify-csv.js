import { supabase } from '../../lib/supabase'

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

const FREE_SHIPPING_THRESHOLD = 99

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim())
  const headers = parseCSVLine(lines[0])
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line)
    const obj = {}
    headers.forEach((h, i) => { obj[h] = vals[i] || '' })
    return obj
  }).filter(r => r['Name'])
}

function parseCSVLine(line) {
  const result = []
  let cur = '', inQuotes = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') { inQuotes = !inQuotes }
    else if (line[i] === ',' && !inQuotes) { result.push(cur.trim()); cur = '' }
    else cur += line[i]
  }
  result.push(cur.trim())
  return result
}

function cleanZip(zip) {
  return zip ? zip.toString().replace(/^'/, '').trim() : null
}

function parseDate(dateStr) {
  if (!dateStr) return null
  return dateStr.slice(0, 10)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { csvContent, products } = req.body
  if (!csvContent) return res.status(400).json({ error: 'No CSV content' })

  const rows = parseCSV(csvContent)

  // Group rows by order name (multiple rows = multiple line items)
  const orderMap = {}
  for (const row of rows) {
    const name = row['Name']
    if (!orderMap[name]) orderMap[name] = { meta: row, items: [] }
    if (row['Lineitem name']) {
      orderMap[name].items.push({
        name: row['Lineitem name'],
        quantity: parseInt(row['Lineitem quantity']) || 1,
        price: parseFloat(row['Lineitem price']) || 0,
        sku: row['Lineitem sku'] || null,
      })
    }
  }

  let inserted = 0, skipped = 0, errors = []

  for (const [reference, { meta, items }] of Object.entries(orderMap)) {
    const orderDate = parseDate(meta['Created at'])
    if (!orderDate || orderDate < '2026-01-01') { skipped++; continue }

    // Check duplicate
    const { data: existing } = await supabase.from('sales_orders').select('id').eq('reference', reference).eq('source', 'shopify')
    if (existing?.length > 0) { skipped++; continue }

    const subtotal = parseFloat(meta['Subtotal']) || 0
    const shippingAmt = parseFloat(meta['Shipping']) || 0
    const cliquePaysShipping = subtotal >= FREE_SHIPPING_THRESHOLD

    const buyerName = meta['Shipping Name'] || meta['Billing Name'] || 'Shopify Customer'
    const zip = cleanZip(meta['Shipping Zip'] || meta['Billing Zip'])

    const { data: ord, error: ordErr } = await supabase.from('sales_orders').insert([{
      date: orderDate,
      channel: 'E-commerce',
      reference,
      payment_status: meta['Financial Status'] === 'paid' ? 'paid' : 'pending',
      total_amount: subtotal,
      shipping_cost: cliquePaysShipping ? shippingAmt : 0,
      buyer_name: buyerName,
      buyer_email: meta['Email'] || null,
      buyer_phone: meta['Shipping Phone'] || meta['Billing Phone'] || null,
      buyer_address: meta['Shipping Address1'] || meta['Billing Address1'] || null,
      buyer_city: meta['Shipping City'] || meta['Billing City'] || null,
      buyer_state: meta['Shipping Province'] || meta['Billing Province'] || null,
      buyer_zip: zip,
      notes: cliquePaysShipping ? `Free shipping (≥$${FREE_SHIPPING_THRESHOLD})` : 'Customer paid shipping',
      source: 'shopify',
    }]).select()

    if (ordErr) { errors.push({ reference, error: ordErr.message }); continue }
    const orderId = ord[0].id

    // Match products by name/SKU and insert line items
    const lineItems = items.map(item => {
      const matched = (products || []).find(p =>
        p.product_name?.toLowerCase().includes(item.name.toLowerCase()) ||
        item.name.toLowerCase().includes(p.product_name?.toLowerCase()) ||
        (item.sku && p.sku === item.sku)
      )
      return {
        order_id: orderId,
        product_id: matched?.id || null,
        quantity: item.quantity,
        unit_price: item.price,
        unit_cost: matched?.unit_cost || 0,
        total_price: item.price * item.quantity,
        margin: matched ? (item.price - (matched.unit_cost || 0)) * item.quantity : 0,
      }
    })
    if (lineItems.length > 0) await supabase.from('sale_items').insert(lineItems)

    // Revenue transaction
    await supabase.from('transactions').insert([{
      date: orderDate, description: 'Shopify — ' + reference,
      category: 'Sales — E-commerce', type: 'revenue',
      amount: subtotal, note: orderId, source: 'shopify',
    }])

    // Shipping expense if Clique pays — create placeholder if amount unknown
    if (cliquePaysShipping) {
      await supabase.from('transactions').insert([{
        date: orderDate,
        description: 'Shipping — ' + reference,
        category: 'Shipping (outbound)',
        type: 'cogs',
        amount: shippingAmt > 0 ? shippingAmt : 0,
        note: shippingAmt > 0 ? orderId : 'TO COMPLETE — enter real shipping cost for ' + reference,
        source: 'shopify',
      }])
    }

    inserted++
  }

  return res.json({ success: true, total: Object.keys(orderMap).length, inserted, skipped, errors })
}
