import { NextResponse } from 'next/server';

const ALLOWED_HOSTNAMES = [
  'storage.googleapis.com',
  'imagedelivery.net',
  'cdn.krea.ai',
  'krea.ai',
];

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imageUrl = searchParams.get('url');

  if (!imageUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const isAllowed = ALLOWED_HOSTNAMES.some(host => parsedUrl.hostname.endsWith(host));
  if (!isAllowed) {
    return NextResponse.json({ error: 'URL not allowed' }, { status: 403 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      'Referer': 'https://www.krea.ai/',
    };

    const cookie = process.env.KREA_SESSION_COOKIE;
    if (cookie) headers['Cookie'] = cookie;

    const response = await fetch(imageUrl, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Image fetch returned ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/webp';

    return new NextResponse(response.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Content-Length': response.headers.get('content-length') || '',
      },
    });
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return NextResponse.json({ error: 'Download timeout' }, { status: 504 });
    }
    console.error('Image Proxy Error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
