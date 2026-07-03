import { NextResponse } from 'next/server';
import { d1Query, r2Upload, r2PublicUrl } from '@/lib/cloudflare';

// ─── Config ──────────────────────────────────────────────────────────────────
const BATCH_SIZE    = 40;   
const MAX_BATCHES   = 25;   // 25 batches * 40 images = 1000 images
const CONCURRENCY   = 5;    // Safe concurrency

// ─── Helpers ─────────────────────────────────────────────────────────────────
async function fetchKreaPage(offset: number) {
  const cookie = process.env.KREA_SESSION_COOKIE;
  const url = `https://www.krea.ai/api/k2-feed?itemOffset=${offset}&limit=${BATCH_SIZE}&sort=random&bangers=true`;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    'Accept': 'application/json',
  };
  if (cookie) headers['Cookie'] = cookie;

  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Krea API error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function existsInD1(kreaId: string) {
  const result = await d1Query<{ id: number }>('SELECT id FROM krea_images WHERE krea_id = ? LIMIT 1', [kreaId]);
  return result.results.length > 0;
}

async function downloadImage(imageUrl: string) {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Download failed`);
  return Buffer.from(await res.arrayBuffer());
}

async function processImage(img: any) {
  try {
    if (await existsInD1(img.id)) return 'skipped';
    const buffer = await downloadImage(img.image_url);
    const key = `images/${img.id}.png`;
    await r2Upload(key, buffer, 'image/png');
    const publicUrl = r2PublicUrl(key);
    
    await d1Query(
      `INSERT INTO krea_images (krea_id, image_url, krea_url, prompt, width, height, color) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [img.id, publicUrl, img.image_url, img.prompt || '', img.width ?? null, img.height ?? null, img.metadata?.dominant_color || '#1a1a1a']
    );
    return 'synced';
  } catch (err) {
    return 'error';
  }
}

async function pLimit<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = [];
  let index = 0;
  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(request: Request) {
  // BẢO MẬT: Kiểm tra mật khẩu trước khi cho phép cào ảnh
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startTime = Date.now();
  const stats = { synced: 0, skipped: 0, errors: 0, batches: 0 };

  try {
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const offset = batch * BATCH_SIZE;
      const images = await fetchKreaPage(offset);
      
      if (images.length === 0) break;
      stats.batches++;

      const tasks = images.map((img: any) => () => processImage(img));
      const outcomes = await pLimit(tasks, CONCURRENCY);

      for (const outcome of outcomes) {
        if (outcome === 'synced')  stats.synced++;
        if (outcome === 'skipped') stats.skipped++;
        if (outcome === 'error')   stats.errors++;
      }
      
      console.log(`[seed] Batch ${batch + 1}/${MAX_BATCHES} done. Synced: ${stats.synced}`);
      
      await new Promise(r => setTimeout(r, 1000));
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    return NextResponse.json({ ok: true, elapsed: `${elapsed}s`, ...stats });

  } catch (err: unknown) {
    return NextResponse.json({ error: 'Seed failed', message: String(err) }, { status: 500 });
  }
}
