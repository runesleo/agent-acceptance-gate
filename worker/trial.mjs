const TRIAL_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days per client+service

/**
 * One free POST per client IP per service path, tracked in TRIAL_KV when bound.
 * Falls back to an in-isolate Map (best-effort) for local tests.
 */
const memoryTrials = new Map();

export async function trialKeyForRequest(request, pathname) {
  const ip = request.headers.get('cf-connecting-ip')
    || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
  const raw = `${ip}|${pathname}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `trial:v1:${pathname}:${hex.slice(0, 32)}`;
}

export async function hasUsedFreeTrial(env, request, pathname) {
  const key = await trialKeyForRequest(request, pathname);
  if (env?.TRIAL_KV) {
    const value = await env.TRIAL_KV.get(key);
    return value === '1';
  }
  return memoryTrials.has(key);
}

export async function markFreeTrialUsed(env, request, pathname) {
  const key = await trialKeyForRequest(request, pathname);
  if (env?.TRIAL_KV) {
    await env.TRIAL_KV.put(key, '1', { expirationTtl: TRIAL_TTL_SECONDS });
    return;
  }
  memoryTrials.set(key, Date.now());
}

export function withTrialBilling(payload, { pathname, fee_usdt }) {
  return {
    ...payload,
    billing: {
      mode: 'free_trial',
      service_path: pathname,
      list_price_usdt: fee_usdt,
      message: 'One-time free trial for this service. Subsequent calls require x402 payment at the listed fee.'
    }
  };
}
