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
  },
  '/token-dd-verdict': {
    service_id: 'token_dd_verdict',
    title: 'Token DD Verdict',
    category: 'finance',
    fee_usdt: '0.05',
    fee_atomic: '50000',
    mode: 'live_unlisted'
  },
  '/pm-trade-preflight': {
    service_id: 'pm_trade_preflight',
    title: 'PM Trade Preflight',
    category: 'finance',
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

/** OKX onchain listing copy (two lines, no URLs). L1 English · L2 中文人话 + 输入提示 */
export const OKX_LISTING_COPY = {
  25996: {
    serviceName: 'World Cup Smart Money Radar',
    serviceDescription:
      'Heuristic World Cup prediction-market wallet signals from large public trades and 7-day leaderboard stats; data only.\n'
      + '世界杯预测市场聪明钱雷达：大额成交与7日盈利钱包信号。输入 market 关键词（如 winner、队名或 all）+ limit 1-10。'
  },
  25997: {
    serviceName: 'Polymarket Smart Money Radar',
    serviceDescription:
      'Heuristic Polymarket wallet signals from recent large trades; beta topic search, limited coverage per call.\n'
      + 'Polymarket 全市场聪明钱雷达（beta）。输入 market/topic 关键词（如 bitcoin 或 all）+ limit 1-10；数据信号，非投资建议。'
  },
  25998: {
    serviceName: 'Agent Delivery Audit Gate',
    serviceDescription:
      'Rule-based audit of agent task delivery vs goals and evidence; returns pass, needs review, or fail.\n'
      + 'Agent 交付验收闸门：对照任务目标与证据，输出 pass/需复核/fail。输入 task、delivery_summary、artifacts、validation。'
  },
  25999: {
    serviceName: 'Event Price Divergence Radar',
    serviceDescription:
      'Flags where 24h prediction-market probability moves diverge from 24h OKX spot momentum on major crypto assets.\n'
      + '事件概率与币价背离雷达：PM 24h 概率变动 vs OKX 现货 24h 动量。输入 asset（bitcoin/ethereum/solana 或省略查主流）。'
  }
};

/** Listing copy for services not yet on OKX (use with onchainos create). Keys = service_id */
export const PENDING_OKX_LISTING_COPY = {
  crypto_market_regime_radar: {
    serviceName: 'Crypto Market Regime Radar',
    serviceDescription:
      'Blends OKX spot momentum, perp funding/premium and Polymarket drift into risk_on/off/neutral/mixed with explainable score.\n'
      + '加密市场状态雷达：现货动量+资金费率+PM 情绪 → risk_on/off/neutral 及 0-100 分。输入 focus/asset 关键词 + limit。'
  },
  world_cup_upset_alert: {
    serviceName: 'World Cup Upset Alert',
    serviceDescription:
      'Flags profitable wallets entering low-probability World Cup outcomes; potential upset positioning signals only.\n'
      + '世界杯冷门预警：盈利钱包涌入低概率赛果。输入 market 关键词（winner/队名/all）+ limit 1-10；数据信号，非投注建议。'
  },
  token_dd_verdict: {
    serviceName: 'Token DD Verdict',
    serviceDescription:
      'Quick rule-based token research gate; optional DEX liquidity scan for EVM contracts; returns avoid/watch/research buckets.\n'
      + '代币快速尽调闸门：规则引擎输出 avoid/观望/可研究等分桶；EVM 合约可查 DEX 流动性。输入 asset（ticker 或合约地址）。'
  },
  pm_trade_preflight: {
    serviceName: 'PM Trade Preflight',
    serviceDescription:
      'Read-only trade/watch/skip gate before a Polymarket order; checks liquidity, price zone, and spread.\n'
      + '预测市场下单前检查：trade/观望/跳过，只读不下单。输入 market_url 或 slug + side(yes/no)，可选 size_usd。'
  }
};

/** Map catalog path → pending copy entry */
export function pendingListingCopyForPath(pathname) {
  const entry = getServiceCatalogEntry(pathname);
  if (!entry?.service_id) return null;
  return PENDING_OKX_LISTING_COPY[entry.service_id] ?? null;
}

export function okxListingFeeForServiceId(serviceId) {
  const entry = Object.values(SERVICE_CATALOG).find((s) => s.okx_service_id === serviceId);
  return entry?.fee_usdt ?? '0.1';
}
