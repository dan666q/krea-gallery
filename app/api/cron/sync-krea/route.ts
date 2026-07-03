/**
 * POST /api/cron/sync-krea
 *
 * Vercel Cron Job — triggered every 6 hours.
 * Flow:
 *   1. Fetch batches from Krea k2-feed API
 *   2. For each new image (not already in D1):
 *      a. Download image binary from Krea CDN
 *      b. Upload to Cloudflare R2
 *      c. INSERT row into D1
 *
 * Security: Vercel sends `Authorization: Bearer <CRON_SECRET>` header.
 */

import { NextResponse } from 'next/server';
import { d1Query, r2Upload, r2PublicUrl } from '@/lib/cloudflare';

// ─── Config ──────────────────────────────────────────────────────────────────

const BATCH_SIZE    = 40;   // images per Krea API page
const MAX_BATCHES   = 3;    // max pages to fetch per cron run (3 × 40 = 120)
const CONCURRENCY   = 5;    // parallel R2 uploads
const MAX_RUNTIME   = 50_000; // 50s hard limit (Vercel free = 60s)

// ─── Types ────────────────────────────────────────────────────────────────────

interface KreaRawImage {
  id: string;
  image_url: string;
  prompt?: string;
  width?: number;
  height?: number;
  metadata?: { dominant_color?: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Fetch one page of images from Krea k2-feed */
async function fetchKreaPage(offset: number): Promise<KreaRawImage[]> {
  const cookie = process.env.KREA_SESSION_COOKIE;
  const url = `https://www.krea.ai/api/k2-feed?itemOffset=${offset}&limit=${BATCH_SIZE}&sort=random&bangers=true&staffPicksFirstPage=true`;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json',
  };
  if (cookie) headers['Cookie'] = cookie;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Krea API error: ${res.status}`);

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** Check if a krea_id already exists in D1 */
async function existsInD1(kreaId: string): Promise<boolean> {
  const result = await d1Query<{ id: number }>(
    'SELECT id FROM krea_images WHERE krea_id = ? LIMIT 1',
    [kreaId]
  );
  return result.results.length > 0;
}

/** Download image binary from URL */
async function downloadImage(imageUrl: string): Promise<Buffer> {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Download failed (${res.status}): ${imageUrl}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Process a single image: download → R2 upload → D1 insert */
async function processImage(img: KreaRawImage): Promise<'skipped' | 'synced' | 'error'> {
  try {
    // Skip if already in D1
    if (await existsInD1(img.id)) return 'skipped';

    // Download binary
    const buffer = await downloadImage(img.image_url);

    // Upload to R2
    const key = `images/${img.id}.png`;
    await r2Upload(key, buffer, 'image/png');
    const publicUrl = r2PublicUrl(key);

    // Insert into D1
    await d1Query(
      `INSERT INTO krea_images (krea_id, image_url, krea_url, prompt, width, height, color)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        img.id,
        publicUrl,
        img.image_url,
        img.prompt || '',
        img.width ?? null,
        img.height ?? null,
        img.metadata?.dominant_color || '#1a1a1a',
      ]
    );

    return 'synced';
  } catch (err) {
    console.error(`[sync-krea] Error processing ${img.id}:`, err);
    return 'error';
  }
}

/** Run tasks with limited concurrency */
async function pLimit<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const startTime = Date.now();

  // Security: verify CRON_SECRET
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = { synced: 0, skipped: 0, errors: 0, batches: 0 };

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      // Hard time limit check
      if (Date.now() - startTime > MAX_RUNTIME) {
        console.log('[sync-krea] Time limit reached, stopping early');
        break;
      }

      const offset = batch * BATCH_SIZE;
      const images = await fetchKreaPage(offset);

      if (images.length === 0) break;
      stats.batches++;

      // Process with concurrency limit
      const tasks = images.map((img) => () => processImage(img));
      const outcomes = await pLimit(tasks, CONCURRENCY);

      for (const outcome of outcomes) {
        if (outcome === 'synced')  stats.synced++;
        if (outcome === 'skipped') stats.skipped++;
        if (outcome === 'error')   stats.errors++;
      }

      console.log(`[sync-krea] Batch ${batch + 1}: synced=${stats.synced}, skipped=${stats.skipped}`);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[sync-krea] Done in ${elapsed}s:`, stats);

    return NextResponse.json({
      ok: true,
      elapsed: `${elapsed}s`,
      ...stats,
    });

  } catch (err: unknown) {
    console.error('[sync-krea] Fatal error:', err);
    return NextResponse.json(
      { error: 'Sync failed', message: String(err) },
      { status: 500 }
    );
  }
}
