/**
 * GET /api/images
 *
 * Frontend-facing API — reads from Cloudflare D1, returns KreaImage[].
 * Drop-in replacement for /api/k2-feed.
 *
 * Query params:
 *   ?page=1&limit=40&search=cyberpunk
 */

import { NextResponse } from 'next/server';
import { d1Query } from '@/lib/cloudflare';

interface KreaImageRow {
  id: number;
  krea_id: string;
  image_url: string;
  prompt: string;
  width: number | null;
  height: number | null;
  color: string;
  synced_at: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const page   = Math.max(1, parseInt(searchParams.get('page')  || '1',  10));
  const limit  = Math.min(80, parseInt(searchParams.get('limit') || '40', 10));
  const search = searchParams.get('search')?.trim() || '';
  const offset = (page - 1) * limit;

  try {
    let sql: string;
    let params: (string | number | null)[];

    if (search) {
      sql = `
        SELECT id, krea_id, image_url, prompt, width, height, color, synced_at
        FROM krea_images
        WHERE prompt LIKE ?
        ORDER BY synced_at DESC
        LIMIT ? OFFSET ?
      `;
      params = [`%${search}%`, limit, offset];
    } else {
      sql = `
        SELECT id, krea_id, image_url, prompt, width, height, color, synced_at
        FROM krea_images
        ORDER BY synced_at DESC
        LIMIT ? OFFSET ?
      `;
      params = [limit, offset];
    }

    const result = await d1Query<KreaImageRow>(sql, params);

    // Map to same KreaImage interface used by the frontend
    const images = result.results.map((row) => ({
      id:        row.krea_id,
      image_url: row.image_url,
      prompt:    row.prompt,
      width:     row.width,
      height:    row.height,
      color:     row.color,
    }));

    return NextResponse.json(images, {
      headers: {
        'Cache-Control': 's-maxage=30, stale-while-revalidate=300',
      },
    });

  } catch (err: unknown) {
    console.error('[/api/images] Error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch images', message: String(err) },
      { status: 500 }
    );
  }
}
