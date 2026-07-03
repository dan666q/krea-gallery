/**
 * Cloudflare R2 + D1 client helpers
 * - d1Query()    — REST API query to Cloudflare D1 (SQLite)
 * - r2Upload()   — S3-compatible upload to Cloudflare R2
 * - r2PublicUrl()— Generate public URL for a given key
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// ─── Environment Variables ───────────────────────────────────────────────────

const ACCOUNT_ID  = process.env.R2_ACCOUNT_ID!;
const BUCKET_NAME = process.env.R2_BUCKET_NAME!;
const PUBLIC_URL  = process.env.R2_PUBLIC_URL!; // e.g. https://pub-xxxx.r2.dev

const D1_ACCOUNT_ID = process.env.D1_ACCOUNT_ID!;  // same as R2_ACCOUNT_ID
const D1_DATABASE_ID = process.env.D1_DATABASE_ID!;
const D1_API_TOKEN   = process.env.D1_API_TOKEN!;

// ─── D1 Types ────────────────────────────────────────────────────────────────

export interface D1QueryResult<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: {
    changed_db: boolean;
    changes: number;
    duration: number;
    last_row_id: number;
    rows_read: number;
    rows_written: number;
    size_after: number;
  };
}

// ─── D1 REST API ─────────────────────────────────────────────────────────────

/**
 * Query Cloudflare D1 via REST API.
 * @param sql    - SQL statement with ? placeholders
 * @param params - Bound parameters
 */
export async function d1Query<T = Record<string, unknown>>(
  sql: string,
  params: (string | number | null)[] = []
): Promise<D1QueryResult<T>> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${D1_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${D1_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 query failed (${res.status}): ${text}`);
  }

  const json = await res.json() as { result: D1QueryResult<T>[]; success: boolean; errors: unknown[] };

  if (!json.success || json.errors?.length) {
    throw new Error(`D1 error: ${JSON.stringify(json.errors)}`);
  }

  // D1 REST returns array of results (one per statement)
  return json.result[0];
}

// ─── R2 S3-Compatible Client ─────────────────────────────────────────────────

let _s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_s3Client) return _s3Client;

  _s3Client = new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  return _s3Client;
}

/**
 * Upload a file to Cloudflare R2 via S3-compatible API.
 * @param key         - Object key (e.g. "images/abc123.png")
 * @param buffer      - File content as Buffer
 * @param contentType - MIME type (default: "image/png")
 */
export async function r2Upload(
  key: string,
  buffer: Buffer,
  contentType = 'image/png'
): Promise<void> {
  const client = getS3Client();

  await client.send(new PutObjectCommand({
    Bucket:      BUCKET_NAME,
    Key:         key,
    Body:        buffer,
    ContentType: contentType,
  }));
}

/**
 * Get the public URL for an R2 object key.
 * @param key - Object key (e.g. "images/abc123.png")
 */
export function r2PublicUrl(key: string): string {
  // Strip trailing slash from PUBLIC_URL, ensure single slash separator
  const base = PUBLIC_URL.replace(/\/$/, '');
  return `${base}/${key}`;
}
