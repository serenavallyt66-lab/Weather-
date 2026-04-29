# Weather API hardening notes

## `POST /api/analyze` abuse protection

The `app/api/analyze/route.js` endpoint includes:

- **Per-IP rate limiting**
  - Uses **Upstash Redis REST** when `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are set.
  - Falls back to an **in-memory limiter** for local development.
- **Request body size limits**
  - Rejects oversized `content-length` headers.
  - Rejects oversized parsed raw body.
- **Public launch bot friction**
  - Optional shared-secret token in a configurable header.
- **Monitoring fields**
  - Adds an `x-request-id` response header.
  - Logs categorized failures via `console.error`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `ANALYZE_MAX_BODY_BYTES` | `32768` | Maximum request size in bytes. |
| `ANALYZE_RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window size in milliseconds. |
| `ANALYZE_RATE_LIMIT_MAX_REQUESTS` | `20` | Max requests per IP within window. |
| `ANALYZE_BOT_TOKEN_HEADER` | `x-analyze-token` | Header name for anti-bot token. |
| `ANALYZE_BOT_SHARED_SECRET` | _unset_ | Shared secret token for bot friction. If unset, token check is disabled. |
| `UPSTASH_REDIS_REST_URL` | _unset_ | Upstash REST URL for distributed rate limiting. |
| `UPSTASH_REDIS_REST_TOKEN` | _unset_ | Upstash REST auth token. |

## Failure categories

Failure responses return `requestId` and category in JSON:

- `rate_limit`
- `oversize_body`
- `bot_token_failed`
- `invalid_json`
- `unknown`
