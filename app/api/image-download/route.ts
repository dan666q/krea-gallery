import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Referer': 'https://www.krea.ai/',
    };

    const cookie = process.env.KREA_SESSION_COOKIE;
    if (cookie) {
      headers['Cookie'] = cookie;
    }

    // Fetch the original full-resolution image directly (no Next.js optimizer)
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Image fetch returned ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();

    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="krea-image.png"`,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error: any) {
    console.error('Image Download Proxy Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
