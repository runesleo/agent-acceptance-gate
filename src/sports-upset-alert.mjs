// Sports Upset Alert — generic sports/PM low-probability smart-money filter.
// World Cup Upset Alert is a thin legacy wrapper (league=world_cup).

import {
  resolveSportsMarkets,
  resolveWorldCupMarkets,
  scanMarketsForSmartMoney
} from './worldcup-smart-money-live.mjs';

const SERVICE_ID = 'sports_upset_alert';
const LEGACY_SERVICE_ID = 'world_cup_upset_alert';

const MAX_UPSET_PROBABILITY = 0.35;
const DEEP_UPSET_PROBABILITY = 0.2;
const SCAN_CANDIDATES = 12;

const STANDARD_CAVEATS = [
  'Data and analytics only. Not investment advice, not betting advice, and not a guarantee of future returns.',
  'No wallet custody, no user funds, no trade execution, no order routing.',
  'Upset alerts are heuristic reads of recent large public trades on Polymarket: a profitable wallet buying the low-probability side can also be hedging, market-making, or wrong.',
  'seven-day PnL comes from the Polymarket 7d profit leaderboard; wallets absent from it are excluded from alerts (never estimated).',
  'World Cup is one sports scope — pass sport/league for EPL/UCL/tennis/NBA/etc.'
];

export async function assessWorldCupUpsetAlertLive(input = {}, options = {}) {
  return assessSportsUpsetAlertLive({
    ...input,
    sport: input.sport ?? 'football',
    league: input.league ?? 'world_cup',
    tag_slug: input.tag_slug ?? 'world-cup'
  }, { ...options, serviceId: LEGACY_SERVICE_ID, legacyWorldCup: true });
}

export async function assessSportsUpsetAlertLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = clampInteger(input.limit, 1, 10, 5);
  const serviceId = options.serviceId ?? SERVICE_ID;

  let markets;
  let usedFallback;
  let discovery = null;

  if (options.legacyWorldCup) {
    const marketHint = normalizeText(input.market ?? input.market_id ?? input.query ?? 'all');
    const resolved = await resolveWorldCupMarkets(fetchImpl, marketHint);
    markets = resolved.markets;
    usedFallback = resolved.usedFallback;
  } else {
    const resolved = await resolveSportsMarkets(fetchImpl, input);
    markets = resolved.markets;
    usedFallback = resolved.usedFallback;
    discovery = resolved.discovery;
  }

  const { scanned, enriched } = await scanMarketsForSmartMoney(fetchImpl, markets, SCAN_CANDIDATES);

  const alerts = enriched
    .filter(isUpsetCandidate)
    .map(buildUpsetAlert)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);

  const caveats = [...STANDARD_CAVEATS];
  if (usedFallback) {
    caveats.push(options.legacyWorldCup
      ? 'No active World Cup markets matched; fell back to Polymarket top-volume markets site-wide.'
      : 'No active scoped sports markets matched; fell back to top-volume / search.');
  }

  return {
    schema_version: '0.2',
    service_id: serviceId,
    mode: 'live',
    generated_at: new Date().toISOString(),
    input: {
      sport: input.sport ?? null,
      league: input.league ?? null,
      tag_slug: input.tag_slug ?? null,
      query: input.query ?? input.market ?? input.market_id ?? 'all',
      limit
    },
    summary: buildSummary(alerts, scanned, enriched),
    upset_alerts: alerts,
    caveats,
    next_gate: 'OKX_ASP_listing_changes_require_Leo_approval',
    source: {
      provider: 'polymarket_public_api',
      pipeline: 'sports_smart_money scan + upset filter',
      filter: {
        wallet_7d_pnl: '> 0 (leaderboard-confirmed profitable wallets only)',
        action: 'new_position or increased_position (net buying)',
        max_implied_probability: MAX_UPSET_PROBABILITY
      },
      discovery,
      markets_scanned: scanned.map((market) => ({
        market_id: market.market_id,
        condition_id: market.condition_id,
        title: market.title
      }))
    }
  };
}

export function buildWorldCupUpsetAlertFallback(input = {}) {
  return buildSportsUpsetAlertFallback({ ...input, service_id: LEGACY_SERVICE_ID });
}

export function buildSportsUpsetAlertFallback(input = {}) {
  return {
    schema_version: '0.2',
    service_id: input.service_id ?? SERVICE_ID,
    mode: 'public_safe_demo',
    generated_at: new Date().toISOString(),
    input: {
      sport: input.sport ?? null,
      league: input.league ?? null,
      query: input.query ?? 'all',
      limit: clampInteger(input.limit, 1, 10, 5)
    },
    summary: 'Demo fallback — live sports upset scan unavailable.',
    upset_alerts: [],
    caveats: [...STANDARD_CAVEATS, 'Demo mode: empty alerts.'],
    next_gate: 'OKX_ASP_listing_changes_require_Leo_approval',
    source: { provider: 'static_fallback' }
  };
}

function isUpsetCandidate(signal) {
  const price = Number(signal.last_trade_price);
  const pnl = signal.seven_day_pnl_usdt;
  const action = signal.action;
  if (!Number.isFinite(price) || price >= MAX_UPSET_PROBABILITY) return false;
  if (pnl === null || pnl === undefined || Number(pnl) <= 0) return false;
  if (action !== 'new_position' && action !== 'increased_position') return false;
  return true;
}

function buildUpsetAlert(signal) {
  const price = Number(signal.last_trade_price);
  const deep = price < DEEP_UPSET_PROBABILITY;
  return {
    ...signal,
    upset_band: deep ? 'deep_upset' : 'upset',
    implied_probability: price,
    confidence: Number(signal.confidence ?? 0.5) + (deep ? 0.05 : 0)
  };
}

function buildSummary(alerts, scanned, enriched) {
  return `Scanned ${scanned.length} markets / ${enriched.length} smart-money candidates → ${alerts.length} upset alert(s).`;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
