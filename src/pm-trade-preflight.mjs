// PM Trade Preflight (pm_trade_preflight) — read-only trade/watch/skip gate before
// a prediction-market order. Uses public Polymarket Gamma market metadata only.

import {
  fetchMarket,
  resolveMarketRef,
  clamp,
  round2,
  toNumber
} from './pm-gamma-market.mjs';

const SERVICE_ID = 'pm_trade_preflight';

const MIN_VOLUME_24H_USD = 5_000;
const EXTREME_PRICE_LOW = 0.08;
const EXTREME_PRICE_HIGH = 0.92;
const MAX_SPREAD = 0.06;
const SIZE_VS_VOLUME_RATIO = 0.05;

const STANDARD_CAVEATS = [
  'Read-only preflight gate. Not investment advice; does not place, cancel, or route orders.',
  'Heuristic checks on liquidity, price zone, and spread only — not a full event readout.',
  'Caller retains all risk limits and manual approval before any real-money action.'
];

export async function assessPmTradePreflightLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const side = normalizeSide(input.side);
  const sizeUsd = parseOptionalUsd(input.size_usd ?? input.sizeUsd);
  const marketRef = resolveMarketRef(input);

  const market = await fetchMarket(fetchImpl, marketRef);
  if (!market) {
    throw new Error('Market not found for the provided slug, condition_id, or market_url');
  }

  const evaluation = evaluatePreflight(market, side, sizeUsd);

  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'live',
    generated_at: new Date().toISOString(),
    input: {
      market_url: input.market_url ?? null,
      condition_id: marketRef.condition_id,
      slug: marketRef.slug,
      side,
      size_usd: sizeUsd
    },
    market: {
      condition_id: market.condition_id,
      slug: market.slug,
      title: market.title,
      active: market.active,
      closed: market.closed,
      volume_24h_usd: market.volume_24hr,
      outcomes: market.outcomes,
      outcome_prices: market.outcome_prices
    },
    action: evaluation.action,
    confidence: evaluation.confidence,
    reasons: evaluation.reasons,
    risk_flags: evaluation.risk_flags,
    side_price: evaluation.side_price,
    caveats: [...STANDARD_CAVEATS],
    next_gate: 'Leo_manual_order_approval_required',
    source: {
      provider: 'polymarket_gamma_public_api',
      min_volume_24h_usd: MIN_VOLUME_24H_USD,
      extreme_price_band: [EXTREME_PRICE_LOW, EXTREME_PRICE_HIGH]
    }
  };
}

export function buildPmTradePreflightFallback(input = {}) {
  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'public_safe_demo',
    generated_at: new Date().toISOString(),
    input: {
      market_url: input?.market_url ?? null,
      condition_id: input?.condition_id ?? null,
      slug: input?.slug ?? 'demo-market',
      side: normalizeSide(input?.side),
      size_usd: parseOptionalUsd(input?.size_usd)
    },
    market: {
      condition_id: 'demo',
      slug: 'demo-market',
      title: 'Demo market (live data unavailable)',
      active: true,
      closed: false,
      volume_24h_usd: 25_000,
      outcomes: ['Yes', 'No'],
      outcome_prices: [0.42, 0.58]
    },
    action: 'watch',
    confidence: 0.4,
    reasons: ['Live Polymarket lookup unavailable; demo preflight only.'],
    risk_flags: ['live_data_unavailable'],
    side_price: 0.42,
    caveats: [...STANDARD_CAVEATS, 'Demo mode: do not trade on this response.'],
    next_gate: 'Leo_manual_order_approval_required',
    source: { provider: 'static_fallback' }
  };
}

function evaluatePreflight(market, side, sizeUsd) {
  const reasons = [];
  const risk_flags = [];
  let action = 'trade';
  let confidence = 0.72;

  if (market.closed || !market.active) {
    return {
      action: 'skip',
      confidence: 0.9,
      reasons: ['Market is closed or inactive.'],
      risk_flags: ['market_closed_or_inactive'],
      side_price: getSidePrice(market, side)
    };
  }

  const sidePrice = getSidePrice(market, side);
  if (sidePrice === null) {
    return {
      action: 'skip',
      confidence: 0.85,
      reasons: [`Could not resolve price for side "${side}".`],
      risk_flags: ['missing_side_price'],
      side_price: null
    };
  }

  if (market.volume_24hr < MIN_VOLUME_24H_USD) {
    risk_flags.push('low_liquidity');
    reasons.push(`24h volume $${Math.round(market.volume_24hr)} is below $${MIN_VOLUME_24H_USD} threshold.`);
    action = 'watch';
    confidence -= 0.15;
  }

  if (sidePrice <= EXTREME_PRICE_LOW || sidePrice >= EXTREME_PRICE_HIGH) {
    risk_flags.push('extreme_implied_probability');
    reasons.push(`Side price ${round2(sidePrice)} is in an extreme zone for new entry.`);
    action = 'watch';
    confidence -= 0.12;
  }

  if (market.spread !== null && market.spread > MAX_SPREAD) {
    risk_flags.push('wide_spread');
    reasons.push(`Bid/ask spread ~${round2(market.spread)} looks wide.`);
    action = 'watch';
    confidence -= 0.1;
  }

  if (sizeUsd !== null && market.volume_24hr > 0 && sizeUsd > market.volume_24hr * SIZE_VS_VOLUME_RATIO) {
    risk_flags.push('size_large_vs_daily_volume');
    reasons.push(`Requested size $${sizeUsd} is large vs 24h volume $${Math.round(market.volume_24hr)}.`);
    action = 'watch';
    confidence -= 0.1;
  }

  if (action === 'trade') {
    reasons.push('Liquidity, price zone, and spread checks passed heuristic preflight.');
  }

  return {
    action,
    confidence: round2(clamp(confidence, 0.35, 0.9)),
    reasons,
    risk_flags,
    side_price: round2(sidePrice)
  };
}

function getSidePrice(market, side) {
  const normalized = normalizeSide(side);
  const idx = market.outcomes.findIndex((outcome) => String(outcome).toLowerCase() === normalized);
  if (idx < 0) return null;
  const price = market.outcome_prices[idx];
  return Number.isFinite(price) ? price : null;
}

function normalizeSide(side) {
  const raw = String(side ?? 'yes').trim().toLowerCase();
  if (raw === 'no') return 'no';
  return 'yes';
}

function parseOptionalUsd(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? round2(n) : null;
}
