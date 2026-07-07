/** Listed OKX.AI services: per-path fee (USDT string + x402 atomic units). */
export const LISTED_SERVICE_PATHS = new Set([
  '/world-cup-smart-money-radar',
  '/polymarket-smart-money-radar',
  '/agent-delivery-acceptance-audit',
  '/event-price-divergence-radar'
]);

export const SERVICE_CATALOG = {
  '/world-cup-smart-money-radar': {
    service_id: 'world_cup_smart_money_radar',
    okx_service_id: 25996,
    title: 'World Cup Smart Money Radar',
    category: 'world_cup',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  '/polymarket-smart-money-radar': {
    service_id: 'polymarket_smart_money_radar',
    okx_service_id: 25997,
    title: 'Polymarket Smart Money Radar',
    category: 'finance',
    fee_usdt: '0.05',
    fee_atomic: '50000',
    mode: 'live_beta'
  },
  '/agent-delivery-acceptance-audit': {
    service_id: 'agent_delivery_acceptance_audit',
    okx_service_id: 25998,
    title: 'Agent Delivery Audit Gate',
    category: 'agent_ops',
    fee_usdt: '0.2',
    fee_atomic: '200000',
    mode: 'live'
  },
  '/event-price-divergence-radar': {
    service_id: 'event_price_divergence_radar',
    okx_service_id: 25999,
    title: 'Event Price Divergence Radar',
    category: 'finance',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  '/crypto-market-regime-radar': {
    service_id: 'crypto_market_regime_radar',
    title: 'Crypto Market Regime Radar',
    category: 'finance',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live_unlisted'
  },
  '/world-cup-upset-alert': {
    service_id: 'world_cup_upset_alert',
    title: 'World Cup Upset Alert',
    category: 'world_cup',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live_unlisted'
  }
};

export function getServiceCatalogEntry(pathname) {
  return SERVICE_CATALOG[pathname] ?? null;
}

export function getFeeAtomicForPath(pathname) {
  return getServiceCatalogEntry(pathname)?.fee_atomic ?? '1000000';
}

/** OKX onchain listing copy (two lines, no URLs). */
export const OKX_LISTING_COPY = {
  25996: {
    serviceName: 'World Cup Smart Money Radar',
    serviceDescription:
      'Heuristic World Cup prediction-market wallet signals from recent large public trades and 7-day leaderboard stats; scans up to three markets per call.\n'
      + 'Provide market as a keyword such as winner, a team name, or all, plus limit from 1 to 10. Data only, not betting or investment advice.'
  },
  25997: {
    serviceName: 'Polymarket Smart Money Radar',
    serviceDescription:
      'Heuristic all-market Polymarket wallet signals from recent large public trades; beta topic search with limited market coverage per call.\n'
      + 'Provide market or topic as a keyword such as bitcoin or a market name, or all, plus limit from 1 to 10. Data only, not advice.'
  },
  25998: {
    serviceName: 'Agent Delivery Audit Gate',
    serviceDescription:
      'Rule-based audit of an agent task delivery against goals and evidence; returns pass, needs review, or fail. Not LLM judging or security certification.\n'
      + 'Provide task, delivery summary, artifacts, and validation as JSON text fields. One free trial per client per service, then a small per-call fee.'
  },
  25999: {
    serviceName: 'Event Price Divergence Radar',
    serviceDescription:
      'Flags where 24h prediction-market probability moves diverge from 24h OKX spot momentum on major crypto assets; heuristic research signals only.\n'
      + 'Provide asset as a keyword such as bitcoin, ethereum, or solana, or omit for majors, plus limit from 1 to 10.'
  }
};

export function okxListingFeeForServiceId(serviceId) {
  const entry = Object.values(SERVICE_CATALOG).find((s) => s.okx_service_id === serviceId);
  return entry?.fee_usdt ?? '0.1';
}
