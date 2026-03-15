export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  const { address, city, state, zip } = req.body
  const cleanZip = zip ? zip.toString().replace(/^'/, '').trim() : null
  const queries = [
    [address, city, state, cleanZip].filter(Boolean).join(', ') + ', USA',
    [city, state, cleanZip].filter(Boolean).join(', ') + ', USA',
    [city, state].filter(Boolean).join(', ') + ', USA',
  ]
  try {
    for (const query of queries) {
      const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=1&countrycodes=us', { headers: { 'User-Agent': 'CliqueBeautyAccounting/2.0' } })
      const data = await r.json()
      if (data?.length > 0) return res.json({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
      await new Promise(r => setTimeout(r, 200))
    }
    return res.json({ lat: null, lng: null })
  } catch { return res.json({ lat: null, lng: null }) }
}
