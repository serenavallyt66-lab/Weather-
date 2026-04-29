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
import { NextResponse } from "next/server";

const APPROVED_CUSTOM_DOMAINS = ["shop.example.com"];

function isValidShopifyProductUrl(input) {
  try {
    const parsed = new URL(input);
    const hostname = parsed.hostname.toLowerCase();
    const hasShopifyHostname = hostname.endsWith(".myshopify.com");
    const hasApprovedCustomDomain = APPROVED_CUSTOM_DOMAINS.includes(hostname);
    const isProductPath = /^\/products\//.test(parsed.pathname);

    return (hasShopifyHostname || hasApprovedCustomDomain) && isProductPath;
  } catch {
    return false;
  }
}

export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const url = typeof body?.url === "string" ? body.url : "";

  if (!isValidShopifyProductUrl(url)) {
    return NextResponse.json(
      { error: "Invalid Shopify product URL" },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, url });
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const REQUIRED_KEYS = ["currentHeadline", "newHeadline", "cta", "trust"];
const DEMO_MODE = process.env.DEMO_MODE === "true";

function validatePayload(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  return REQUIRED_KEYS.every((key) => {
    const value = payload[key];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function demoPayload() {
  return {
    currentHeadline: "Boost your conversion rate with clearer value messaging",
    newHeadline: "Turn more visitors into customers with headlines that highlight outcomes",
    cta: "Get your tailored headline suggestions",
    trust: "Trusted by growth teams shipping experiments every week",
  };
}

function serverErrorResponse(message, status = 502) {
  return Response.json(
    {
      error: "MODEL_RESPONSE_ERROR",
      message,
    },
    { status },
  );
}

export async function POST(req) {
  try {
    const body = await req.json();

    if (DEMO_MODE) {
      return Response.json(demoPayload(), { status: 200 });
    }

    const input = [
      {
        role: "system",
        content:
          "You are a conversion copywriter assistant. Return strictly valid JSON matching the schema.",
      },
      {
        role: "user",
        content:
          typeof body?.prompt === "string"
            ? body.prompt
            : "Analyze this landing-page copy and propose structured improvements.",
      },
    ];

    const data = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input,
      text: {
        format: {
          type: "json_schema",
          name: "headline_analysis",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: REQUIRED_KEYS,
            properties: {
              currentHeadline: { type: "string" },
              newHeadline: { type: "string" },
              cta: { type: "string" },
              trust: { type: "string" },
            },
          },
        },
      },
    });

    // Defensive checks around SDK/server errors.
    if (data?.error) {
      return serverErrorResponse(
        "The analysis service is temporarily unavailable. Please try again.",
        502,
      );
    }

    const choiceContent = data?.choices?.[0]?.message?.content;
    if (Array.isArray(data?.choices) && data.choices.length === 0) {
      return serverErrorResponse(
        "The analysis service returned an empty response. Please retry.",
        502,
      );
    }

    const textOutput =
      typeof data?.output_text === "string" && data.output_text.trim().length > 0
        ? data.output_text
        : typeof choiceContent === "string"
          ? choiceContent
          : null;

    if (!textOutput) {
      return serverErrorResponse(
        "We could not generate a valid analysis response. Please retry.",
        502,
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(textOutput);
    } catch {
      return serverErrorResponse(
        "We received an invalid response format. Please retry.",
        502,
      );
    }

    if (!validatePayload(parsed)) {
      return serverErrorResponse(
        "Generated analysis was incomplete. Please retry in a moment.",
        502,
      );
    }

    return Response.json(parsed, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        error: "ANALYZE_REQUEST_FAILED",
        message: "Unable to process the request right now. Please try again.",
      },
      { status: 500 },
    );
  }
}
