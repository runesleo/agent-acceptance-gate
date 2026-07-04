// Live Polymarket-backed implementation of the World Cup Smart Money Radar.
//
// Public endpoints used (no API key required), response shapes verified 2026-07-05:
// - Gamma:   https://gamma-api.polymarket.com/events?tag_slug=world-cup&closed=false...
//            -> [{ title, slug, volume24hr, markets: [{ conditionId, question, slug,
//               outcomes: '["Yes","No"]', outcomePrices: '["0.465","0.535"]', active, closed, ... }] }]
// - Gamma:   https://gamma-api.polymarket.com/markets?closed=false&order=volume24hr...
//            -> [{ conditionId, question, slug, outcomes, outcomePrices, volumeNum, ... }] (fallback)
// - Data:    https://data-api.polymarket.com/trades?market=<conditionId>&takerOnly=true&filterType=CASH&filterAmount=...
//            -> [{ proxyWallet, side: 'BUY'|'SELL', size, price, timestamp, outcome, conditionId, title, ... }]
// - Data:    https://data-api.polymarket.com/positions?user=<wallet>&market=<conditionId>
//            -> [{ proxyWallet, size, avgPrice, totalBought, cashPnl, outcome, ... }]
// - LB:      https://lb-api.polymarket.com/profit?window=7d&address=<wallet>
//            -> [{ proxyWallet, amount, name, pseudonym }] (empty array when wallet unranked)

const SERVICE_ID = 'world_cup_smart_money_radar';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const DATA_BASE = 'https://data-api.polymarket.com';
const LB_BASE = 'https://lb-api.polymarket.com';

const MIN_TRADE_NOTIONAL_USDT = 500;
const MAX_MARKETS_SCANNED = 3;
const TRADES_PER_MARKET = 100;
const FETCH_TIMEOUT_MS = 8000;

const STANDARD_CAVEATS = [
  'Data and analytics only. Not investment advice, not betting advice, and not a guarantee of future returns.',
  'No wallet custody, no user funds, no trade execution, no order routing.',
  'Smart-money signals are heuristic reads of recent large public trades on Polymarket and can be wrong or stale.'
];

/**
 * Build the full live response payload.
 * Throws on upstream failure so callers can decide how to degrade.
 */
export async function assessWorldCupSmartMoneyLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const marketHint = normalizeText(input.market ?? input.market_id ?? input.query ?? 'all');
  const limit = clampInteger(input.limit, 1, 10, 5);

  const { markets, usedFallback } = await resolveMarkets(fetchImpl, marketHint);
  const scanned = markets.slice(0, MAX_MARKETS_SCANNED);

  const tradesPerMarket = await Promise.all(
    scanned.map((market) => fetchLargeTrades(fetchImpl, market.condition_id).catch(() => []))
  );

  const aggregates = aggregateWalletFlows(scanned, tradesPerMarket);
  const top = aggregates.slice(0, limit);

  const enriched = await Promise.all(top.map(async (entry) => {
    const [pnl, position] = await Promise.all([
      fetchSevenDayPnl(fetchImpl, entry.wallet).catch(() => null),
      fetchPosition(fetchImpl, entry.wallet, entry.condition_id).catch(() => null)
    ]);
    return buildSignal(entry, pnl, position);
  }));

  const missingPnl = enriched.some((signal) => signal.seven_day_pnl_usdt === null);

  const caveats = [...STANDARD_CAVEATS];
  if (usedFallback) {
    caveats.push('No active World Cup markets matched; fell back to Polymarket top-volume markets site-wide.');
  }
  if (missingPnl) {
    caveats.push('seven_day_pnl_usdt is null for wallets not present on the Polymarket 7-day profit leaderboard; values are never estimated.');
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
    summary: buildSummary(enriched),
    signals: enriched,
    caveats,
    next_gate: 'OKX_ASP_listing_changes_require_Leo_approval',
    source: {
      provider: 'polymarket_public_api',
      markets_scanned: scanned.map((market) => ({
        market_id: market.market_id,
        condition_id: market.condition_id,
        title: market.title
      })),
      min_trade_notional_usdt: MIN_TRADE_NOTIONAL_USDT
    }
  };
}

/**
 * Find active World Cup markets via Gamma events; fall back to site-wide
 * top-volume markets when nothing matches.
 */
async function resolveMarkets(fetchImpl, marketHint) {
  let markets = [];
  try {
    const events = await fetchJson(
      fetchImpl,
      `${GAMMA_BASE}/events?closed=false&active=true&limit=25&order=volume24hr&ascending=false&tag_slug=world-cup`
    );
    markets = flattenEventMarkets(Array.isArray(events) ? events : []);
  } catch {
    markets = [];
  }

  if (marketHint && marketHint !== 'all') {
    const filtered = markets.filter((market) =>
      normalizeText(`${market.market_id} ${market.title} ${market.event_title} ${market.slug}`).includes(marketHint));
    if (filtered.length) {
      return { markets: filtered, usedFallback: false };
    }
  }

  if (markets.length) {
    return { markets, usedFallback: false };
  }

  const fallback = await fetchJson(
    fetchImpl,
    `${GAMMA_BASE}/markets?closed=false&active=true&limit=25&order=volume24hr&ascending=false`
  );
  const fallbackMarkets = (Array.isArray(fallback) ? fallback : [])
    .filter((market) => market.conditionId && market.enableOrderBook !== false)
    .map((market) => normalizeMarket(market, market.question ?? market.slug ?? ''));
  return { markets: fallbackMarkets, usedFallback: true };
}

function flattenEventMarkets(events) {
  const markets = [];
  for (const event of events) {
    for (const market of event.markets ?? []) {
      if (!market.conditionId || market.closed || market.active === false) continue;
      markets.push(normalizeMarket(market, event.title ?? ''));
    }
  }
  // Highest recent volume first so we scan where the money actually moves.
  markets.sort((a, b) => b.volume_24hr - a.volume_24hr);
  return markets;
}

function normalizeMarket(market, eventTitle) {
  return {
    market_id: market.slug ?? market.conditionId,
    condition_id: market.conditionId,
    title: market.question ?? market.slug ?? market.conditionId,
    event_title: eventTitle,
    slug: market.slug ?? '',
    volume_24hr: toNumber(market.volume24hr ?? market.volumeNum ?? market.volume),
    updated_at: market.updatedAt ?? null
  };
}

async function fetchLargeTrades(fetchImpl, conditionId) {
  const url = `${DATA_BASE}/trades?market=${encodeURIComponent(conditionId)}` +
    `&limit=${TRADES_PER_MARKET}&takerOnly=true&filterType=CASH&filterAmount=${MIN_TRADE_NOTIONAL_USDT}`;
  const trades = await fetchJson(fetchImpl, url);
  return Array.isArray(trades) ? trades : [];
}

/**
 * Aggregate large taker trades per (wallet, market, outcome).
 */
function aggregateWalletFlows(markets, tradesPerMarket) {
  const byKey = new Map();

  markets.forEach((market, index) => {
    for (const trade of tradesPerMarket[index] ?? []) {
      const wallet = normalizeText(trade.proxyWallet);
      if (!wallet.startsWith('0x')) continue;
      const notional = toNumber(trade.size) * toNumber(trade.price);
      if (!(notional > 0)) continue;

      const key = `${wallet}|${market.condition_id}|${trade.outcome}`;
      let entry = byKey.get(key);
      if (!entry) {
        entry = {
          wallet,
          market_id: market.market_id,
          condition_id: market.condition_id,
          market_title: market.title,
          market_updated_at: market.updated_at,
          outcome: trade.outcome ?? 'Unknown',
          buy_notional: 0,
          sell_notional: 0,
          trade_count: 0,
          last_price: toNumber(trade.price),
          last_timestamp: toNumber(trade.timestamp)
        };
        byKey.set(key, entry);
      }
      if (trade.side === 'SELL') {
        entry.sell_notional += notional;
      } else {
        entry.buy_notional += notional;
      }
      entry.trade_count += 1;
      if (toNumber(trade.timestamp) > entry.last_timestamp) {
        entry.last_timestamp = toNumber(trade.timestamp);
        entry.last_price = toNumber(trade.price);
      }
    }
  });

  return [...byKey.values()]
    .map((entry) => ({ ...entry, gross_notional: entry.buy_notional + entry.sell_notional }))
    .sort((a, b) => b.gross_notional - a.gross_notional);
}

async function fetchSevenDayPnl(fetchImpl, wallet) {
  const rows = await fetchJson(fetchImpl, `${LB_BASE}/profit?window=7d&address=${encodeURIComponent(wallet)}`);
  if (Array.isArray(rows) && rows.length && Number.isFinite(Number(rows[0].amount))) {
    return round2(Number(rows[0].amount));
  }
  return null;
}

async function fetchPosition(fetchImpl, wallet, conditionId) {
  const rows = await fetchJson(
    fetchImpl,
    `${DATA_BASE}/positions?user=${encodeURIComponent(wallet)}&market=${encodeURIComponent(conditionId)}`
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

function buildSignal(entry, sevenDayPnl, position) {
  const action = classifyAction(entry, position);
  const notional = round2(Math.max(entry.buy_notional, entry.sell_notional));

  return {
    market_id: entry.market_id,
    market_title: entry.market_title,
    market_updated_at: entry.market_updated_at,
    address_label: shortenAddress(entry.wallet),
    side: entry.outcome,
    action,
    notional_usdt: notional,
    seven_day_pnl_usdt: sevenDayPnl,
    confidence: scoreConfidence(entry, sevenDayPnl),
    rationale: buildRationale(entry, action, sevenDayPnl, position)
  };
}

function classifyAction(entry, position) {
  if (entry.sell_notional > entry.buy_notional) {
    return 'reduced_position';
  }
  if (position && toNumber(position.totalBought) > 0) {
    // Recent large buys explain (almost) the whole position -> fresh entry.
    const recentShare = entry.buy_notional / Math.max(toNumber(position.avgPrice), 0.01);
    if (recentShare >= toNumber(position.totalBought) * 0.9) {
      return 'new_position';
    }
    return 'increased_position';
  }
  return 'new_position';
}

/**
 * Heuristic confidence in [0.5, 0.9]:
 * larger notional, repeat trades and positive 7d PnL all add conviction.
 */
function scoreConfidence(entry, sevenDayPnl) {
  let score = 0.5;
  score += 0.15 * Math.min(entry.gross_notional / 5000, 1);
  score += entry.trade_count >= 3 ? 0.1 : entry.trade_count === 2 ? 0.05 : 0;
  if (typeof sevenDayPnl === 'number' && sevenDayPnl > 0) {
    score += 0.15 * Math.min(sevenDayPnl / 10000, 1);
  }
  return round2(Math.min(0.9, Math.max(0.5, score)));
}

function buildRationale(entry, action, sevenDayPnl, position) {
  const flow = entry.sell_notional > entry.buy_notional
    ? `sold ~$${formatUsd(entry.sell_notional)} of "${entry.outcome}"`
    : `bought ~$${formatUsd(entry.buy_notional)} of "${entry.outcome}"`;
  const parts = [
    `Wallet ${flow} across ${entry.trade_count} large taker trade${entry.trade_count === 1 ? '' : 's'} (last price ${entry.last_price}).`
  ];
  if (typeof sevenDayPnl === 'number') {
    parts.push(`7d leaderboard PnL ${signedUsd(sevenDayPnl)}.`);
  }
  if (position && Number.isFinite(Number(position.cashPnl))) {
    parts.push(`Open position PnL in this market: ${signedUsd(Number(position.cashPnl))}.`);
  }
  if (action === 'reduced_position') {
    parts.push('Net flow was toward the exit door.');
  }
  return parts.join(' ');
}

function buildSummary(signals) {
  if (!signals.length) {
    return 'No large smart-money movement found in the scanned Polymarket markets.';
  }
  const top = signals.slice().sort((a, b) => b.confidence - a.confidence)[0];
  return `${signals.length} smart-money movements found. Top signal: ${top.action} on ${top.side} in ${top.market_title}.`;
}

async function fetchJson(fetchImpl, url) {
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

function shortenAddress(address) {
  const value = String(address ?? '');
  if (!value.startsWith('0x') || value.length < 12) return value;
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

function formatUsd(value) {
  return Math.abs(round2(value)).toLocaleString('en-US');
}

function signedUsd(value) {
  return `${value < 0 ? '-' : '+'}$${formatUsd(value)}`;
}

function round2(value) {
  return Math.round(Number(value) * 100) / 100;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value) {
  return String(value ?? '').trim().toLowerCase();
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}
