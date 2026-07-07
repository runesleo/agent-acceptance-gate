// PM Event Readout (pm_event_readout) — event evidence card before trade decisions.
// Rule-based readout from public Gamma metadata; pairs with pm-decision-card upstream.

import { fetchMarket, resolveMarketRef, round2, toNumber } from './pm-gamma-market.mjs';

const SERVICE_ID = 'pm_event_readout';

const STANDARD_CAVEATS = [
  'Event readout only. Not investment advice; does not place or route orders.',
  'Separates event context from trade attractiveness — use pm-trade-preflight or pm-decision-card for action.',
  'Heuristic pricing read; outside news/lineup evidence not fetched in this endpoint.'
];

export async function assessPmEventReadoutLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const marketRef = resolveMarketRef(input);
  const market = await fetchMarket(fetchImpl, marketRef);
  if (!market) {
    throw new Error('Market not found for the provided slug, condition_id, or market_url');
  }

  const readout = buildEventReadout(market);

  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'live',
    generated_at: new Date().toISOString(),
    input: {
      market_url: input.market_url ?? null,
      condition_id: marketRef.condition_id,
      slug: marketRef.slug
    },
    ...readout,
    caveats: [...STANDARD_CAVEATS],
    next_gate: 'Use_pm_trade_preflight_or_manual_decision_card_before_orders',
    source: {
      provider: 'polymarket_gamma_public_api',
      fields: ['outcomePrices', 'volume24hr', 'oneDayPriceChange', 'endDate', 'bestBid/Ask']
    }
  };
}

export function buildPmEventReadoutFallback(input = {}) {
  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'public_safe_demo',
    generated_at: new Date().toISOString(),
    input: {
      market_url: input?.market_url ?? null,
      slug: input?.slug ?? 'demo-market'
    },
    event: 'Demo event',
    market: 'Demo market (live data unavailable)',
    current_price: { yes: 0.42, no: 0.58 },
    event_time: null,
    sources_read: ['static_fallback'],
    base_case: 'Demo readout only.',
    key_uncertainties: ['live_data_unavailable'],
    market_implied_view: 'Demo mode — no live implied view.',
    what_is_already_priced: null,
    what_may_not_be_priced: null,
    tradability: 'weak',
    next_decision_card_needed: 'no',
    caveats: [...STANDARD_CAVEATS, 'Demo mode: do not trade on this response.'],
    next_gate: 'Use_pm_trade_preflight_or_manual_decision_card_before_orders',
    source: { provider: 'static_fallback' }
  };
}

function buildEventReadout(market) {
  const yesIdx = market.outcomes.findIndex((o) => String(o).toLowerCase() === 'yes');
  const noIdx = market.outcomes.findIndex((o) => String(o).toLowerCase() === 'no');
  const primaryIdx = yesIdx >= 0 ? yesIdx : 0;
  const primaryOutcome = market.outcomes[primaryIdx] ?? 'Yes';
  const primaryPrice = market.outcome_prices[primaryIdx] ?? null;

  const prices = {};
  if (yesIdx >= 0 && Number.isFinite(market.outcome_prices[yesIdx])) {
    prices.yes = round2(market.outcome_prices[yesIdx]);
  }
  if (noIdx >= 0 && Number.isFinite(market.outcome_prices[noIdx])) {
    prices.no = round2(market.outcome_prices[noIdx]);
  }

  const tradability = scoreTradability(market);
  const implied = buildImpliedView(market, primaryOutcome, primaryPrice);
  const priced = buildPricedInNotes(market, primaryPrice);
  const uncertainties = buildUncertainties(market);

  return {
    event: market.title,
    market: market.slug,
    current_price: prices,
    event_time: market.end_date,
    sources_read: ['polymarket_gamma_market_metadata'],
    base_case: primaryPrice !== null
      ? `Market prices "${primaryOutcome}" at ${round2(primaryPrice)} (${Math.round(primaryPrice * 100)}% implied).`
      : 'Outcome prices unavailable from Gamma.',
    key_uncertainties: uncertainties,
    market_implied_view: implied,
    what_is_already_priced: priced.already,
    what_may_not_be_priced: priced.may_not,
    tradability,
    next_decision_card_needed: ['medium', 'high'].includes(tradability) ? 'yes' : 'no'
  };
}

function scoreTradability(market) {
  if (market.closed || !market.active) return 'weak';
  if (!market.outcome_prices.length || market.outcome_prices.every((p) => !Number.isFinite(p))) return 'weak';
  if (market.volume_24hr < 1_000) return 'weak';
  if (market.volume_24hr < 5_000) return 'low';
  if (market.spread !== null && market.spread > 0.06) return 'low';
  if (market.volume_24hr >= 50_000 && (market.spread === null || market.spread <= 0.03)) return 'high';
  return 'medium';
}

function buildImpliedView(market, primaryOutcome, primaryPrice) {
  if (primaryPrice === null) return 'Implied probabilities unavailable.';
  const pct = Math.round(primaryPrice * 100);
  let view = `Market implies ~${pct}% on "${primaryOutcome}".`;
  if (market.one_day_price_change !== null) {
    const pts = round2(market.one_day_price_change * 100);
    view += ` 24h change: ${pts >= 0 ? '+' : ''}${pts} pts on primary outcome.`;
  }
  return view;
}

function buildPricedInNotes(market, primaryPrice) {
  const already = [];
  const may_not = [];

  if (primaryPrice !== null) {
    if (primaryPrice >= 0.85) already.push('High consensus — outcome treated as likely by market.');
    if (primaryPrice <= 0.15) already.push('Low base rate — outcome treated as unlikely.');
    if (primaryPrice > 0.15 && primaryPrice < 0.85) may_not.push('Mid-range price — room for news to move odds.');
  }

  if (market.one_day_price_change !== null && Math.abs(market.one_day_price_change) >= 0.03) {
    already.push('Recent 24h probability move may reflect fresh public information.');
  } else {
    may_not.push('Quiet 24h move — stale narrative risk if you rely on old headlines.');
  }

  if (market.volume_24hr < 5_000) {
    may_not.push('Thin liquidity — price may not reflect full information set.');
  }

  return {
    already: already.length ? already.join(' ') : 'No strong priced-in flags from metadata alone.',
    may_not: may_not.length ? may_not.join(' ') : 'External lineup/news not scanned by this endpoint.'
  };
}

function buildUncertainties(market) {
  const items = [];
  if (market.end_date) items.push(`Resolution timing: ${market.end_date}`);
  if (market.one_day_price_change === null) items.push('24h price change missing on Gamma — quiet or illiquid market.');
  if (market.spread !== null && market.spread > 0.04) {
    items.push(`Wide spread (~${round2(market.spread)}) — execution uncertainty.`);
  }
  items.push('No external news/lineup/weather feed in this API — metadata only.');
  return items;
}
