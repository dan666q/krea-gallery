import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // CORS configuration
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Get query parameters with default fallbacks
  const {
    itemOffset = '0',
    limit = '80',
    sort = 'random',
    bangers = 'true',
    staffPicksFirstPage = 'true'
  } = req.query;

  // Build target Krea feed URL
  const targetUrl = `https://www.krea.ai/api/k2-feed?itemOffset=${itemOffset}&limit=${limit}&sort=${sort}&bangers=${bangers}&staffPicksFirstPage=${staffPicksFirstPage}`;

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    };

    // Inject Krea session cookie from serverless environment variables
    const cookie = process.env.KREA_SESSION_COOKIE;
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Krea API returned status ${response.status}`,
      });
    }

    const data = await response.json();

    // Filter and sanitize the payload
    const cleanData = Array.isArray(data)
      ? data.map((img: any) => ({
        id: img.id,
        image_url: img.image_url,
        prompt: img.prompt,
        width: img.width,
        height: img.height
      }))
      : [];

    return res.status(200).json(cleanData);
  } catch (error: any) {
    console.error('Serverless Proxy Error:', error);
    return res.status(500).json({
      error: error.message || 'Internal Server Error',
    });
  }
}
