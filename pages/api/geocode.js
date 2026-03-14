export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()
  
  const { address, city, state, zip } = req.body
  const query = [address, city, state, zip].filter(Boolean).join(', ') + ', USA'
  
  try {
    const resp = await fetch(
      'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(query) + '&limit=1',
      { headers: { 'User-Agent': 'CliqueBeautyAccounting/1.0' } }
    )
    const data = await resp.json()
    if (data && data.length > 0) {
      return res.json({ lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) })
    }
    return res.json({ lat: null, lng: null })
  } catch (err) {
    return res.json({ lat: null, lng: null })
  }
}
