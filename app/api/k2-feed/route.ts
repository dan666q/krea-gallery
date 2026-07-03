import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemOffset = searchParams.get('itemOffset') || '0';
  const limit = searchParams.get('limit') || '80';
  const sort = searchParams.get('sort') || 'random';
  const bangers = searchParams.get('bangers') || 'true';
  const staffPicksFirstPage = searchParams.get('staffPicksFirstPage') || 'true';

  const targetUrl = `https://www.krea.ai/api/k2-feed?itemOffset=${itemOffset}&limit=${limit}&sort=${sort}&bangers=${bangers}&staffPicksFirstPage=${staffPicksFirstPage}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const cookie = process.env.KREA_SESSION_COOKIE;
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    };
    if (cookie) headers['Cookie'] = cookie;

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Krea API returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const cleanData = Array.isArray(data)
      ? data.map((img: any) => ({
          id: img.id,
          image_url: img.image_url,
          prompt: img.prompt || '',
          width: img.width,
          height: img.height,
          color: img.metadata?.dominant_color || '#1a1a1a',
        }))
      : [];

    const cacheHeaders = cookie
      ? { 'Cache-Control': 'no-store' }
      : { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' };

    return NextResponse.json(cleanData, { headers: cacheHeaders });

  } catch (error: any) {
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 });
    }
    console.error('Proxy error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
