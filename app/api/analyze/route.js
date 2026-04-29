import { NextResponse } from 'next/server';
import crypto from 'crypto';

const MAX_BODY_BYTES = Number(process.env.ANALYZE_MAX_BODY_BYTES || 32 * 1024);
const RATE_LIMIT_WINDOW_MS = Number(process.env.ANALYZE_RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX_REQUESTS = Number(process.env.ANALYZE_RATE_LIMIT_MAX_REQUESTS || 20);
const BOT_TOKEN_HEADER = process.env.ANALYZE_BOT_TOKEN_HEADER || 'x-analyze-token';
const BOT_SHARED_SECRET = process.env.ANALYZE_BOT_SHARED_SECRET || '';
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const localBuckets = globalThis.__analyzeRateLimitBuckets || new Map();
if (!globalThis.__analyzeRateLimitBuckets) {
  globalThis.__analyzeRateLimitBuckets = localBuckets;
}

const FAILURE_CATEGORY = {
  RATE_LIMIT: 'rate_limit',
  OVERSIZE: 'oversize_body',
  BAD_TOKEN: 'bot_token_failed',
  INVALID_JSON: 'invalid_json',
  UNKNOWN: 'unknown',
};

function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

function makeRequestId() {
  return crypto.randomUUID();
}

function timingSafeEquals(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

async function upstashRateLimit(ip) {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const key = `analyze:ratelimit:${ip}`;

  const pruneRes = await fetch(`${UPSTASH_URL}/zremrangebyscore/${encodeURIComponent(key)}/0/${windowStart}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: 'no-store',
  });

  if (!pruneRes.ok) throw new Error('Upstash prune failed');

  const countRes = await fetch(`${UPSTASH_URL}/zcard/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: 'no-store',
  });

  if (!countRes.ok) throw new Error('Upstash count failed');
  const countPayload = await countRes.json();
  const currentCount = Number(countPayload.result || 0);

  if (currentCount >= RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, remaining: 0 };
  }

  const score = now;
  const member = `${now}:${crypto.randomUUID()}`;
  const addRes = await fetch(`${UPSTASH_URL}/zadd/${encodeURIComponent(key)}/${score}/${encodeURIComponent(member)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: 'no-store',
  });

  if (!addRes.ok) throw new Error('Upstash add failed');

  await fetch(`${UPSTASH_URL}/pexpire/${encodeURIComponent(key)}/${RATE_LIMIT_WINDOW_MS}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
    cache: 'no-store',
  });

  return { allowed: true, remaining: Math.max(RATE_LIMIT_MAX_REQUESTS - currentCount - 1, 0) };
}

function localRateLimit(ip) {
  const now = Date.now();
  const bucket = localBuckets.get(ip) || [];
  const valid = bucket.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (valid.length >= RATE_LIMIT_MAX_REQUESTS) {
    localBuckets.set(ip, valid);
    return { allowed: false, remaining: 0 };
  }

  valid.push(now);
  localBuckets.set(ip, valid);
  return { allowed: true, remaining: RATE_LIMIT_MAX_REQUESTS - valid.length };
}

async function rateLimitByIp(ip) {
  if (UPSTASH_URL && UPSTASH_TOKEN) {
    return upstashRateLimit(ip);
  }
  return localRateLimit(ip);
}

function logFailure({ requestId, ip, category, details }) {
  console.error('[analyze_api_failure]', {
    requestId,
    ip,
    category,
    details,
  });
}

function jsonError(status, message, requestId, category) {
  return NextResponse.json(
    { error: message, requestId, category },
    {
      status,
      headers: {
        'x-request-id': requestId,
      },
    }
  );
}

export async function POST(request) {
  const requestId = makeRequestId();
  const ip = getClientIp(request);

  try {
    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > MAX_BODY_BYTES) {
      logFailure({ requestId, ip, category: FAILURE_CATEGORY.OVERSIZE, details: { contentLength } });
      return jsonError(413, `Payload too large (max ${MAX_BODY_BYTES} bytes).`, requestId, FAILURE_CATEGORY.OVERSIZE);
    }

    const rate = await rateLimitByIp(ip);
    if (!rate.allowed) {
      logFailure({ requestId, ip, category: FAILURE_CATEGORY.RATE_LIMIT });
      return jsonError(429, 'Rate limit exceeded.', requestId, FAILURE_CATEGORY.RATE_LIMIT);
    }

    if (BOT_SHARED_SECRET) {
      const providedToken = request.headers.get(BOT_TOKEN_HEADER);
      if (!providedToken || !timingSafeEquals(providedToken, BOT_SHARED_SECRET)) {
        logFailure({ requestId, ip, category: FAILURE_CATEGORY.BAD_TOKEN });
        return jsonError(403, 'Missing or invalid anti-bot token.', requestId, FAILURE_CATEGORY.BAD_TOKEN);
      }
    }

    const raw = await request.text();
    const bodyBytes = Buffer.byteLength(raw, 'utf8');
    if (bodyBytes > MAX_BODY_BYTES) {
      logFailure({ requestId, ip, category: FAILURE_CATEGORY.OVERSIZE, details: { bodyBytes } });
      return jsonError(413, `Payload too large (max ${MAX_BODY_BYTES} bytes).`, requestId, FAILURE_CATEGORY.OVERSIZE);
    }

    let payload;
    try {
      payload = JSON.parse(raw || '{}');
    } catch {
      logFailure({ requestId, ip, category: FAILURE_CATEGORY.INVALID_JSON });
      return jsonError(400, 'Invalid JSON body.', requestId, FAILURE_CATEGORY.INVALID_JSON);
    }

    return NextResponse.json(
      {
        ok: true,
        requestId,
        received: payload,
      },
      {
        status: 200,
        headers: {
          'x-request-id': requestId,
          'x-rate-limit-remaining': String(rate.remaining),
        },
      }
    );
  } catch (error) {
    logFailure({ requestId, ip, category: FAILURE_CATEGORY.UNKNOWN, details: { message: error?.message } });
    return jsonError(500, 'Internal server error.', requestId, FAILURE_CATEGORY.UNKNOWN);
  }
}
