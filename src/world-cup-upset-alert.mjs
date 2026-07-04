// World Cup Upset Alert (world_cup_upset_alert).
// Reuses the World Cup Smart Money Radar scan pipeline (large taker trades ->
// wallet aggregation -> 7d PnL + position enrichment) and adds a filter layer:
// only signals where a PROFITABLE wallet (7d leaderboard PnL > 0) is entering
// or adding to the LOW-PROBABILITY side (outcome price < 0.35) survive —
// i.e. smart money quietly positioning for a potential upset.
//
// An empty upset_alerts array is a normal outcome (no upset positioning found
// in the scanned markets), not an error.

import {
  resolveWorldCupMarkets,
  scanMarketsForSmartMoney
} from './worldcup-smart-money-live.mjs';

const SERVICE_ID = 'world_cup_upset_alert';

// Filter thresholds — declared in `source` so buyers can audit the rule.
const MAX_UPSET_PROBABILITY = 0.35; // "low-probability side" cutoff
const DEEP_UPSET_PROBABILITY = 0.2; // extra-conviction band
// Scan wider than the requested limit so the filter has candidates to reject.
const SCAN_CANDIDATES = 10;

const STANDARD_CAVEATS = [
  'Data and analytics only. Not investment advice, not betting advice, and not a guarantee of future returns.',
  'No wallet custody, no user funds, no trade execution, no order routing.',
  'Upset alerts are heuristic reads of recent large public trades on Polymarket: a profitable wallet buying the low-probability side can also be hedging, market-making, or wrong.',
  'seven-day PnL comes from the Polymarket 7d profit leaderboard; wallets absent from it are excluded from alerts (never estimated).'
];

/**
 * Build the full live response payload.
 * Throws on upstream failure so callers can decide how to degrade.
 */
export async function assessWorldCupUpsetAlertLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const marketHint = normalizeText(input.market ?? input.market_id ?? input.query ?? 'all');
  const limit = clampInteger(input.limit, 1, 10, 5);

  const { markets, usedFallback } = await resolveWorldCupMarkets(fetchImpl, marketHint);
  const { scanned, enriched } = await scanMarketsForSmartMoney(fetchImpl, markets, SCAN_CANDIDATES);

  const alerts = enriched
    .filter(isUpsetCandidate)
    .map(buildUpsetAlert)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);

  const caveats = [...STANDARD_CAVEATS];
  if (usedFallback) {
    caveats.push('No active World Cup markets matched; fell back to Polymarket top-volume markets site-wide.');
  }

  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'live',
    generated_at: new Date().toISOString(),
    input: {
      market: input.market ?? input.market_id ?? input.query ?? 'all',
      limit
    },
    summary: buildSummary(alerts, scanned, enriched),
    upset_alerts: alerts,
    caveats,
    next_gate: 'OKX_ASP_listing_changes_require_Leo_approval',
    source: {
      provider: 'polymarket_public_api',
      pipeline: 'world_cup_smart_money_radar scan (large taker trades -> wallet aggregation -> 7d PnL + position enrichment) + upset filter',
      filter: {
        wallet_7d_pnl: '> 0 (leaderboard-confirmed profitable wallets only)',
        action: 'new_position or increased_position (net buying)',
        max_implied_probability: MAX_UPSET_PROBABILITY
      },
      markets_scanned: scanned.map((market) => ({
        market_id: market.market_id,
        condition_id: market.condition_id,
        title: market.title
      }))
    }
  };
}

/**
 * Static degraded payload for when the live path fails. The worker cache layer
 * stamps `mode: 'degraded'` and prepends the failure caveat.
 */
export function buildWorldCupUpsetAlertFallback(input = {}) {
  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'public_safe_demo',
    generated_at: new Date().toISOString(),
    input: {
      market: input?.market ?? input?.market_id ?? input?.query ?? 'all',
      limit: clampInteger(input?.limit, 1, 10, 5)
    },
    summary: 'Static fallback: live Polymarket feeds were unavailable, no upset scan was performed.',
    upset_alerts: [],
    caveats: [...STANDARD_CAVEATS],
    next_gate: 'OKX_ASP_listing_changes_require_Leo_approval',
    source: { provider: 'unavailable' }
  };
}

// ---- upset filter --------------------------------------------------------------

function isUpsetCandidate(signal) {
  return (
    typeof signal.seven_day_pnl_usdt === 'number' &&
    signal.seven_day_pnl_usdt > 0 &&
    (signal.action === 'new_position' || signal.action === 'increased_position') &&
    typeof signal.last_trade_price === 'number' &&
    signal.last_trade_price > 0 &&
    signal.last_trade_price < MAX_UPSET_PROBABILITY
  );
}

function buildUpsetAlert(signal) {
  const impliedProbability = signal.last_trade_price;
  // Start from the radar's own confidence; deeper underdogs backed by bigger
  // profits get a small, bounded boost.
  let confidence = signal.confidence;
  if (impliedProbability < DEEP_UPSET_PROBABILITY) confidence += 0.05;
  if (signal.seven_day_pnl_usdt >= 10_000) confidence += 0.05;
  confidence = round2(Math.min(0.9, confidence));

  return {
    market_id: signal.market_id,
    market_title: signal.market_title,
    side: signal.side,
    implied_probability: impliedProbability,
    action: signal.action,
    smart_money_notional_usdt: signal.notional_usdt,
    wallet: signal.address_label,
    wallet_7d_pnl_usdt: signal.seven_day_pnl_usdt,
    confidence,
    rationale:
      `Profitable wallet ${signal.address_label} (7d leaderboard PnL +$${formatUsd(signal.seven_day_pnl_usdt)}) ` +
      `${signal.action === 'new_position' ? 'opened' : 'added to'} a ~$${formatUsd(signal.notional_usdt)} position on ` +
      `underdog side "${signal.side}" of "${signal.market_title}" at price ${impliedProbability} ` +
      `(implied ${Math.round(impliedProbability * 100)}%) — potential upset positioning.`
  };
}

function buildSummary(alerts, scanned, enriched) {
  if (!alerts.length) {
    return `No upset alerts: scanned ${scanned.length} World Cup market${scanned.length === 1 ? '' : 's'} ` +
      `and ${enriched.length} large-trade wallet signal${enriched.length === 1 ? '' : 's'}; none combined a positive ` +
      `7d PnL with net buying on a low-probability side (<${MAX_UPSET_PROBABILITY}). This is a normal outcome, not an error.`;
  }
  const top = alerts[0];
  return `${alerts.length} upset alert${alerts.length === 1 ? '' : 's'} found. Top: profitable wallet backing ` +
    `"${top.side}" at implied ${Math.round(top.implied_probability * 100)}% in ${top.market_title}.`;
}

// ---- small utils -----------------------------------------------------------------

function formatUsd(value) {
  return Math.abs(round2(value)).toLocaleString('en-US');
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
