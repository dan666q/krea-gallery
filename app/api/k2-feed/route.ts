import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const itemOffset = searchParams.get('itemOffset') || '0';
  const limit = searchParams.get('limit') || '80';
  const sort = searchParams.get('sort') || 'random';
  const bangers = searchParams.get('bangers') || 'true';
  const staffPicksFirstPage = searchParams.get('staffPicksFirstPage') || 'true';

  const targetUrl = `https://www.krea.ai/api/k2-feed?itemOffset=${itemOffset}&limit=${limit}&sort=${sort}&bangers=${bangers}&staffPicksFirstPage=${staffPicksFirstPage}`;

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'application/json',
    };

    const cookie = process.env.KREA_SESSION_COOKIE;
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Krea API returned status ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();

    const cleanData = Array.isArray(data)
      ? data.map((img: any) => ({
        id: img.id,
        image_url: img.image_url,
        prompt: img.prompt ? (img.prompt.length > 150 ? img.prompt.substring(0, 150) + '...' : img.prompt) : '',
        width: img.width,
        height: img.height
      }))
      : [];

    return NextResponse.json(cleanData);
  } catch (error: any) {
    console.error('Serverless Proxy Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
