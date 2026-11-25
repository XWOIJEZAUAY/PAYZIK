// Vercel serverless function: proxy Open Food Facts search (contourne le CORS en prod).
export default async function handler(req: any, res: any) {
  const q = (req.query?.q ?? "").toString().trim();
  if (!q) {
    res.status(400).json({ error: "missing q" });
    return;
  }
  try {
    const upstream = await fetch(
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=5`,
    );
    const data = await upstream.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}