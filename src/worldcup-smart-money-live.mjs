// Live Polymarket-backed implementations of the Smart Money Radar services:
// - World Cup Smart Money Radar (world_cup_smart_money_radar) — World Cup markets only.
// - Polymarket Smart Money Radar (polymarket_smart_money_radar) — site-wide, any topic.
// Both share the same scan pipeline (large taker trades -> wallet aggregation ->
// 7d PnL + position enrichment); only market discovery differs.
//
// Public endpoints used (no API key required), response shapes verified 2026-07-05:
// - Gamma:   https://gamma-api.polymarket.com/events?tag_slug=world-cup&closed=false...
//            -> [{ title, slug, volume24hr, markets: [{ conditionId, question, slug,
//               outcomes: '["Yes","No"]', outcomePrices: '["0.465","0.535"]', active, closed, ... }] }]
// - Gamma:   https://gamma-api.polymarket.com/public-search?q=<term>&events_status=active&limit_per_type=10
//            -> { events: [{ title, slug, closed, markets: [...same market shape...] }], pagination }
//            (text search; /events?title=... is NOT supported — param is ignored, verified 2026-07-05)
// - Gamma:   https://gamma-api.polymarket.com/markets?closed=false&order=volume24hr...
//            -> [{ conditionId, question, slug, outcomes, outcomePrices, volumeNum, ... }] (fallback)
// - Data:    https://data-api.polymarket.com/trades?market=<conditionId>&takerOnly=true&filterType=CASH&filterAmount=...
//            -> [{ proxyWallet, side: 'BUY'|'SELL', size, price, timestamp, outcome, conditionId, title, ... }]
// - Data:    https://data-api.polymarket.com/positions?user=<wallet>&market=<conditionId>
//            -> [{ proxyWallet, size, avgPrice, totalBought, cashPnl, outcome, ... }]
// - LB:      https://lb-api.polymarket.com/profit?window=7d&address=<wallet>
//            -> [{ proxyWallet, amount, name, pseudonym }] (empty array when wallet unranked)

const SERVICE_ID = 'world_cup_smart_money_radar';
const POLYMARKET_SERVICE_ID = 'polymarket_smart_money_radar';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const DATA_BASE = 'https://data-api.polymarket.com';
const LB_BASE = 'https://lb-api.polymarket.com';

const MIN_TRADE_NOTIONAL_USDT = 500;
const MAX_MARKETS_SCANNED = 8;
const TRADES_PER_MARKET = 100;
const FETCH_TIMEOUT_MS = 8000;
/** Near-settled prices are usually noise for "smart money" reads (locking PnL / dust). */
const NEAR_SETTLED_PRICE_LOW = 0.05;
const NEAR_SETTLED_PRICE_HIGH = 0.95;

const STANDARD_CAVEATS = [
  'Data and analytics only. Not investment advice, not betting advice, and not a guarantee of future returns.',
  'No wallet custody, no user funds, no trade execution, no order routing.',
  'Smart-money signals are heuristic reads of recent large public trades on Polymarket and can be wrong or stale.',
  'Signals with last_trade_price ≤0.05 or ≥0.95 are tagged near_settled_noise and demoted; prefer mid-price markets.'
];

/**
 * Build the full live response payload.
 * Throws on upstream failure so callers can decide how to degrade.
 * Internally uses sports-generic discovery with league=world_cup (legacy path).
 */
export async function assessWorldCupSmartMoneyLive(input = {}, options = {}) {
  return assessSportsSmartMoneyLive({
    ...input,
    sport: input.sport ?? 'football',
    league: input.league ?? 'world_cup',
    tag_slug: input.tag_slug ?? 'world-cup'
  }, { ...options, serviceId: SERVICE_ID, legacyWorldCup: true });
}

/**
 * Sports-generic Smart Money Radar — football leagues, tennis, NBA, NFL, UFC, MLB, etc.
 * World Cup is one league tag, not the product identity.
 */
export async function assessSportsSmartMoneyLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const limit = clampInteger(input.limit, 1, 10, 5);
  const scope = normalizeSportsScope(input);
  const serviceId = options.serviceId ?? 'sports_smart_money_radar';

  const { markets, usedFallback, discovery } = await resolveSportsMarkets(fetchImpl, scope);

  const fallbackCaveat = usedFallback
    ? (options.legacyWorldCup
      ? 'No active World Cup markets matched; fell back to Polymarket top-volume markets site-wide.'
      : `No active ${scope.label} markets matched; fell back to Polymarket top-volume / search.`)
    : null;

  return buildLiveResponse({
    serviceId,
    inputEcho: {
      sport: scope.sport,
      league: scope.league,
      tag_slug: scope.tag_slug,
      query: scope.query || 'all',
      market: input.market ?? null,
      limit
    },
    fallbackCaveat,
    scan: await scanMarketsForSmartMoney(fetchImpl, markets, limit),
    extraSource: { discovery, scope: scope.label }
  });
}

/**
 * Site-wide Polymarket Smart Money Radar. Same scan pipeline as the World Cup
 * radar, but market discovery searches the whole site: `market` / `topic` are
 * treated as free-text search terms (Gamma /public-search, with a top-volume
 * substring-match fallback); with no term it scans the top 24h-volume markets.
 * Also accepts optional `event_type` / `tag_slug` for category-scoped scans
 * (politics, crypto, sports, etc.).
 * Throws on upstream failure so callers can decide how to degrade.
 */
export async function assessPolymarketSmartMoneyLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const searchTerm = normalizeText(input.market ?? input.topic ?? input.query ?? 'all');
  const limit = clampInteger(input.limit, 1, 10, 5);
  const tagSlug = normalizeText(input.tag_slug ?? input.event_type ?? '');

  let resolved;
  if (tagSlug && tagSlug !== 'all') {
    resolved = await resolveSportsMarkets(fetchImpl, {
      sport: 'all',
      league: null,
      tag_slug: tagSlug,
      query: searchTerm === 'all' ? '' : searchTerm,
      label: `tag:${tagSlug}`
    });
  } else {
    resolved = await resolvePolymarketMarkets(fetchImpl, searchTerm);
  }

  const { markets, usedFallback } = resolved;

  return buildLiveResponse({
    serviceId: POLYMARKET_SERVICE_ID,
    inputEcho: {
      market: input.market ?? null,
      topic: input.topic ?? null,
      query: searchTerm || 'all',
      tag_slug: tagSlug || null,
      event_type: input.event_type ?? null,
      limit
    },
    fallbackCaveat: usedFallback
      ? `No active Polymarket markets matched "${searchTerm || tagSlug}"; fell back to top-volume markets site-wide.`
      : null,
    scan: await scanMarketsForSmartMoney(fetchImpl, markets, limit)
  });
}

/**
 * Shared scan pipeline: large taker trades per market -> per-wallet flow
 * aggregation -> 7d PnL + open-position enrichment for the top wallets.
 * Exported for reuse by the World Cup Upset Alert service.
 */
export async function scanMarketsForSmartMoney(fetchImpl, markets, limit) {
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

  // Prefer mid-price signals; keep near-settled only as filler if we lack cleaner ones.
  const ranked = rankSignalsPreferClean(enriched).slice(0, limit);

  return { scanned, enriched: ranked };
}

function buildLiveResponse({ serviceId, inputEcho, fallbackCaveat, scan, extraSource = null }) {
  const { scanned, enriched } = scan;
  const missingPnl = enriched.some((signal) => signal.seven_day_pnl_usdt === null);

  const caveats = [...STANDARD_CAVEATS];
  if (fallbackCaveat) {
    caveats.push(fallbackCaveat);
  }
  if (missingPnl) {
    caveats.push('seven_day_pnl_usdt is null for wallets not present on the Polymarket 7-day profit leaderboard; values are never estimated.');
  }

  return {
    schema_version: '0.2',
    service_id: serviceId,
    mode: 'live',
    generated_at: new Date().toISOString(),
    input: inputEcho,
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
      min_trade_notional_usdt: MIN_TRADE_NOTIONAL_USDT,
      max_markets_scanned: MAX_MARKETS_SCANNED,
      ...(extraSource && typeof extraSource === 'object' ? extraSource : {})
    }
  };
}

/** Map sport/league aliases → Gamma tag_slug candidates + search queries. */
const SPORT_TAG_MAP = {
  football: ['soccer', 'football', 'epl', 'premier-league', 'ucl', 'champions-league', 'la-liga', 'serie-a', 'bundesliga', 'mls'],
  soccer: ['soccer', 'football', 'epl', 'ucl', 'la-liga', 'mls'],
  tennis: ['tennis', 'atp', 'wta'],
  nba: ['nba', 'basketball'],
  basketball: ['nba', 'basketball'],
  nfl: ['nfl', 'football'],
  ufc: ['ufc', 'mma'],
  mlb: ['mlb', 'baseball'],
  baseball: ['mlb', 'baseball'],
  world_cup: ['world-cup'],
  worldcup: ['world-cup']
};

const LEAGUE_TAG_MAP = {
  world_cup: ['world-cup'],
  worldcup: ['world-cup'],
  epl: ['epl', 'premier-league', 'soccer'],
  ucl: ['ucl', 'champions-league', 'soccer'],
  laliga: ['la-liga', 'soccer'],
  'la-liga': ['la-liga', 'soccer'],
  serie_a: ['serie-a', 'soccer'],
  bundesliga: ['bundesliga', 'soccer'],
  mls: ['mls', 'soccer'],
  atp: ['tennis', 'atp'],
  wta: ['tennis', 'wta'],
  nba: ['nba'],
  nfl: ['nfl'],
  ufc: ['ufc'],
  mlb: ['mlb']
};

function normalizeSportsScope(input = {}) {
  const sport = normalizeText(input.sport ?? 'all') || 'all';
  const league = normalizeText(input.league ?? '') || null;
  const explicitTag = normalizeText(input.tag_slug ?? '') || null;
  const query = normalizeText(
    input.query ?? input.market ?? input.market_id ?? input.team ?? ''
  );
  const queryClean = query === 'all' ? '' : query;

  const tags = [];
  if (explicitTag) tags.push(explicitTag);
  if (league && LEAGUE_TAG_MAP[league]) tags.push(...LEAGUE_TAG_MAP[league]);
  if (sport && sport !== 'all' && SPORT_TAG_MAP[sport]) tags.push(...SPORT_TAG_MAP[sport]);

  const uniqueTags = [...new Set(tags.filter(Boolean))];
  const labelParts = [sport !== 'all' ? sport : null, league, explicitTag, queryClean].filter(Boolean);

  return {
    sport,
    league,
    tag_slug: uniqueTags[0] ?? null,
    tag_candidates: uniqueTags,
    query: queryClean,
    label: labelParts.join('/') || 'sports_all'
  };
}

/**
 * Sports / category market discovery: try Gamma tag_slug candidates, then
 * public-search with sport/league/query, then top-volume fallback.
 */
export async function resolveSportsMarkets(fetchImpl, scopeInput) {
  const scope = typeof scopeInput === 'string'
    ? normalizeSportsScope({ query: scopeInput })
    : (scopeInput?.label && scopeInput.tag_candidates
      ? scopeInput
      : normalizeSportsScope(scopeInput ?? {}));

  const discovery = { tried_tags: [], search_terms: [], method: null };
  let markets = [];

  for (const tag of scope.tag_candidates) {
    discovery.tried_tags.push(tag);
    try {
      const events = await fetchJson(
        fetchImpl,
        `${GAMMA_BASE}/events?closed=false&active=true&limit=25&order=volume24hr&ascending=false&tag_slug=${encodeURIComponent(tag)}`
      );
      markets = flattenEventMarkets(Array.isArray(events) ? events : []);
      if (markets.length) {
        discovery.method = `tag_slug:${tag}`;
        break;
      }
    } catch {
      // try next tag
    }
  }

  if (scope.query && markets.length) {
    const filtered = markets.filter((market) =>
      normalizeText(`${market.market_id} ${market.title} ${market.event_title} ${market.slug}`).includes(scope.query));
    if (filtered.length) {
      return { markets: filtered, usedFallback: false, discovery };
    }
  }

  if (markets.length) {
    return { markets, usedFallback: false, discovery };
  }

  const searchTerms = [
    scope.query,
    scope.league,
    scope.sport !== 'all' ? scope.sport : null,
    scope.tag_slug
  ].filter(Boolean);

  for (const term of searchTerms) {
    discovery.search_terms.push(term);
    try {
      const result = await fetchJson(
        fetchImpl,
        `${GAMMA_BASE}/public-search?q=${encodeURIComponent(term)}&events_status=active&limit_per_type=10`
      );
      markets = flattenEventMarkets(Array.isArray(result?.events) ? result.events : []);
      if (markets.length) {
        discovery.method = `public-search:${term}`;
        return { markets, usedFallback: false, discovery };
      }
    } catch {
      // next term
    }
  }

  const fallback = await fetchJson(
    fetchImpl,
    `${GAMMA_BASE}/markets?closed=false&active=true&limit=25&order=volume24hr&ascending=false`
  );
  const fallbackMarkets = (Array.isArray(fallback) ? fallback : [])
    .filter((market) => market.conditionId && market.enableOrderBook !== false)
    .map((market) => normalizeMarket(market, market.question ?? market.slug ?? ''));
  discovery.method = 'top_volume_fallback';
  return { markets: fallbackMarkets, usedFallback: true, discovery };
}

/**
 * Find active World Cup markets via Gamma events; fall back to site-wide
 * top-volume markets when nothing matches.
 * Exported (as resolveWorldCupMarkets) for the World Cup Upset Alert service.
 */
async function resolveMarkets(fetchImpl, marketHint) {
  const resolved = await resolveSportsMarkets(fetchImpl, {
    sport: 'football',
    league: 'world_cup',
    tag_slug: 'world-cup',
    query: marketHint === 'all' ? '' : marketHint
  });
  return { markets: resolved.markets, usedFallback: resolved.usedFallback };
}

/**
 * Site-wide market discovery for the Polymarket radar.
 * With a search term: Gamma /public-search first (real text search), then a
 * substring match over top-volume events. Without one (or when nothing
 * matches): site-wide top 24h-volume markets.
 */
async function resolvePolymarketMarkets(fetchImpl, searchTerm) {
  const hasTerm = Boolean(searchTerm) && searchTerm !== 'all';

  if (hasTerm) {
    try {
      const result = await fetchJson(
        fetchImpl,
        `${GAMMA_BASE}/public-search?q=${encodeURIComponent(searchTerm)}&events_status=active&limit_per_type=10`
      );
      const markets = flattenEventMarkets(Array.isArray(result?.events) ? result.events : []);
      if (markets.length) {
        return { markets, usedFallback: false };
      }
    } catch {
      // fall through to top-volume events + substring match
    }
  }

  let markets = [];
  try {
    const events = await fetchJson(
      fetchImpl,
      `${GAMMA_BASE}/events?closed=false&active=true&limit=25&order=volume24hr&ascending=false`
    );
    markets = flattenEventMarkets(Array.isArray(events) ? events : []);
  } catch {
    markets = [];
  }

  if (hasTerm && markets.length) {
    const filtered = markets.filter((market) =>
      normalizeText(`${market.market_id} ${market.title} ${market.event_title} ${market.slug}`).includes(searchTerm));
    if (filtered.length) {
      return { markets: filtered, usedFallback: false };
    }
    return { markets, usedFallback: true };
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
  return { markets: fallbackMarkets, usedFallback: hasTerm };
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
  const noiseFlags = [];
  const lastPrice = entry.last_price;
  if (Number.isFinite(lastPrice) && (lastPrice <= NEAR_SETTLED_PRICE_LOW || lastPrice >= NEAR_SETTLED_PRICE_HIGH)) {
    noiseFlags.push('near_settled_noise');
  }

  let confidence = scoreConfidence(entry, sevenDayPnl);
  if (noiseFlags.includes('near_settled_noise')) {
    confidence = round2(Math.min(confidence, 0.45));
  }

  const rationale = buildRationale(entry, action, sevenDayPnl, position)
    + (noiseFlags.includes('near_settled_noise')
      ? ' Flagged near_settled_noise: last price is extreme; often settlement/lock-in flow, not a fresh thesis.'
      : '');

  return {
    market_id: entry.market_id,
    market_title: entry.market_title,
    market_updated_at: entry.market_updated_at,
    address_label: shortenAddress(entry.wallet),
    side: entry.outcome,
    action,
    notional_usdt: notional,
    last_trade_price: entry.last_price,
    seven_day_pnl_usdt: sevenDayPnl,
    confidence,
    noise_flags: noiseFlags,
    rationale
  };
}

function rankSignalsPreferClean(signals) {
  return signals.slice().sort((a, b) => {
    const aNoise = (a.noise_flags || []).includes('near_settled_noise') ? 1 : 0;
    const bNoise = (b.noise_flags || []).includes('near_settled_noise') ? 1 : 0;
    if (aNoise !== bNoise) return aNoise - bNoise;
    return (b.confidence || 0) - (a.confidence || 0);
  });
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

export { resolveMarkets as resolveWorldCupMarkets };
