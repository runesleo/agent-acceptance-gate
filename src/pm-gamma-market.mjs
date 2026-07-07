// Shared Polymarket Gamma market fetch helpers for PM services.

export const GAMMA_BASE = 'https://gamma-api.polymarket.com';
export const FETCH_TIMEOUT_MS = 8000;

export function resolveMarketRef(input) {
  const conditionId = String(input.condition_id ?? '').trim();
  const slug = String(input.slug ?? '').trim();
  const fromUrl = extractFromMarketUrl(input.market_url);
  return {
    condition_id: conditionId || fromUrl.condition_id || null,
    slug: slug || fromUrl.slug || null
  };
}

export function extractFromMarketUrl(marketUrl) {
  const raw = String(marketUrl ?? '').trim();
  if (!raw) return { slug: null, condition_id: null };

  const conditionMatch = raw.match(/\b(0x[a-fA-F0-9]{64})\b/);
  if (conditionMatch) {
    return { slug: null, condition_id: conditionMatch[1] };
  }

  try {
    const url = new URL(raw);
    const parts = url.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((part) => part === 'event' || part === 'market');
    if (idx >= 0 && parts[idx + 1]) {
      return { slug: decodeURIComponent(parts[idx + 1]), condition_id: null };
    }
  } catch {
    if (/^[a-z0-9-]+$/i.test(raw)) {
      return { slug: raw, condition_id: null };
    }
  }

  return { slug: null, condition_id: null };
}

export async function fetchMarket(fetchImpl, ref) {
  if (ref.condition_id) {
    const rows = await fetchJson(
      fetchImpl,
      `${GAMMA_BASE}/markets?condition_ids=${encodeURIComponent(ref.condition_id)}`
    );
    const market = pickMarketRow(rows);
    if (market) return normalizeGammaMarket(market);
  }

  if (ref.slug) {
    const rows = await fetchJson(
      fetchImpl,
      `${GAMMA_BASE}/markets?slug=${encodeURIComponent(ref.slug)}`
    );
    const market = pickMarketRow(rows);
    if (market) return normalizeGammaMarket(market);
  }

  return null;
}

function pickMarketRow(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list.find((row) => row?.conditionId) ?? null;
}

export function normalizeGammaMarket(market) {
  const outcomes = parseJsonArray(market.outcomes);
  const outcome_prices = parseJsonArray(market.outcomePrices).map((value) => Number(value));
  const bestBid = toNumber(market.bestBid);
  const bestAsk = toNumber(market.bestAsk);
  const spread = bestAsk > 0 && bestBid > 0 ? Math.max(0, bestAsk - bestBid) : null;
  const oneDay = Number(market.oneDayPriceChange);

  return {
    condition_id: market.conditionId,
    slug: market.slug ?? market.conditionId,
    title: market.question ?? market.slug ?? market.conditionId,
    description: market.description ?? null,
    active: market.active !== false,
    closed: Boolean(market.closed),
    volume_24hr: toNumber(market.volume24hr ?? market.volumeNum ?? market.volume),
    volume_total: toNumber(market.volumeNum ?? market.volume),
    outcomes,
    outcome_prices,
    best_bid: bestBid || null,
    best_ask: bestAsk || null,
    spread,
    end_date: market.endDate ?? market.endDateIso ?? null,
    one_day_price_change: Number.isFinite(oneDay) ? oneDay : null,
    updated_at: market.updatedAt ?? null
  };
}

export function parseJsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function fetchJson(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`Upstream ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

export function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function round2(value) {
  return Math.round(value * 100) / 100;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
