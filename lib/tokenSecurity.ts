/** Max LiveKit JWT mints per IP within the window. */
export const TOKEN_RATE_LIMIT = 8;
/** Sliding window for mint rate limiting (ms). */
export const TOKEN_RATE_WINDOW_MS = 15 * 60 * 1000;
/** LiveKit participant JWT lifetime. */
export const TOKEN_TTL = "10m";

type RateBucket = {
  count: number;
  resetAt: number;
};

const rateBuckets = new Map<string, RateBucket>();

function pruneRateBuckets(now: number) {
  if (rateBuckets.size < 500) return;
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "unknown";
}

export function checkRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
} {
  const now = Date.now();
  pruneRateBuckets(now);

  const existing = rateBuckets.get(ip);
  if (!existing || existing.resetAt <= now) {
    rateBuckets.set(ip, { count: 1, resetAt: now + TOKEN_RATE_WINDOW_MS });
    return {
      allowed: true,
      remaining: TOKEN_RATE_LIMIT - 1,
      retryAfterSec: Math.ceil(TOKEN_RATE_WINDOW_MS / 1000),
    };
  }

  if (existing.count >= TOKEN_RATE_LIMIT) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: TOKEN_RATE_LIMIT - existing.count,
    retryAfterSec: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
  };
}

export function isOriginAllowed(request: Request): boolean {
  const allowlist = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowlist.length === 0) return true;

  const origin = request.headers.get("origin");
  if (!origin) {
    // Same-origin navigations / some clients omit Origin on POST.
    const referer = request.headers.get("referer");
    if (!referer) return false;
    try {
      return allowlist.includes(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  return allowlist.includes(origin);
}

export function sanitizeParticipantLabel(
  value: string | undefined,
  fallback: string,
  maxLength = 64,
): string {
  const cleaned = (value ?? "")
    .replace(/[^\w\-.:@ ]/g, "")
    .trim()
    .slice(0, maxLength);
  return cleaned || fallback;
}
