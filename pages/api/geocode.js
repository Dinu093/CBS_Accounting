export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  
  const { address, city, state, zip } = req.body

  // Clean zip — remove leading apostrophe from Shopify export
  const cleanZip = zip ? zip.toString().replace(/^'/, '').trim() : null
  const cleanAddress = address ? address.toString().replace(/^'/, '').trim() : null
  const cleanCity = city ? city.toString().trim() : null
  const cleanState = state ? state.toString().trim() : null

  // Try with full address first, then fallback to city+state only
  const queries = [
    [cleanAddress, cleanCity, cleanState, cleanZip].filter(Boolean).join(', ') + ', USA',
    [cleanCity, cleanState, cleanZip].filter(Boolean).join(', ') + ', USA',
    [cleanCity, cleanState].filter(Boolean).join(', ') + ', USA',
  ]

  try {
    for (const query of queries) {
      const resp = await fetch(
        'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=1&countrycodes=us',
        { headers: { 'User-Agent': 'CliqueBeautyAccounting/1.0' } }
      )
      const data = await resp.json()
      if (data && data.length > 0) {
        return res.json({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
      }
      // Small delay between fallback attempts
      await new Promise(r => setTimeout(r, 200))
    }
    return res.json({ lat: null, lng: null })
  } catch (err) {
    return res.json({ lat: null, lng: null })
  }
}
