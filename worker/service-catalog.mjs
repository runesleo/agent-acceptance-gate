/** Listed OKX.AI services: per-path fee (USDT string + x402 atomic units).
 *  okx_service_id synced to live Agent #3977 receipt 2026-07-24 (30207–30216).
 */
export const LISTED_SERVICE_PATHS = new Set([
  '/world-cup-smart-money-radar',
  '/polymarket-smart-money-radar',
  '/agent-delivery-acceptance-audit',
  '/event-price-divergence-radar',
  '/crypto-market-regime-radar',
  '/world-cup-upset-alert',
  '/token-dd-verdict',
  '/pm-trade-preflight',
  '/pm-event-readout',
  '/content-verify-claims',
  '/sports-smart-money-radar',
  '/sports-upset-alert',
  '/pm-profile',
  '/content-slop-check',
  '/agent-budget-preflight'
]);

export const SERVICE_CATALOG = {
  '/world-cup-smart-money-radar': {
    service_id: 'world_cup_smart_money_radar',
    okx_service_id: 30207,
    title: 'World Cup Smart Money Radar',
    category: 'world_cup',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  '/polymarket-smart-money-radar': {
    service_id: 'polymarket_smart_money_radar',
    okx_service_id: 30208,
    title: 'Polymarket Smart Money Radar',
    category: 'finance',
    fee_usdt: '0.05',
    fee_atomic: '50000',
    mode: 'live'
  },
  '/agent-delivery-acceptance-audit': {
    service_id: 'agent_delivery_acceptance_audit',
    okx_service_id: 30209,
    title: 'Agent Delivery Audit Gate',
    category: 'agent_ops',
    fee_usdt: '0.2',
    fee_atomic: '200000',
    mode: 'live'
  },
  '/event-price-divergence-radar': {
    service_id: 'event_price_divergence_radar',
    okx_service_id: 30210,
    title: 'Event Price Divergence Radar',
    category: 'finance',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  '/crypto-market-regime-radar': {
    service_id: 'crypto_market_regime_radar',
    okx_service_id: 30211,
    title: 'Crypto Market Regime Radar',
    category: 'finance',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  '/world-cup-upset-alert': {
    service_id: 'world_cup_upset_alert',
    okx_service_id: 30212,
    title: 'World Cup Upset Alert',
    category: 'world_cup',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  '/token-dd-verdict': {
    service_id: 'token_dd_verdict',
    okx_service_id: 30213,
    title: 'Token DD Verdict',
    category: 'finance',
    fee_usdt: '0.05',
    fee_atomic: '50000',
    mode: 'live'
  },
  '/pm-trade-preflight': {
    service_id: 'pm_trade_preflight',
    okx_service_id: 30214,
    title: 'PM Trade Preflight',
    category: 'finance',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  '/pm-event-readout': {
    service_id: 'pm_event_readout',
    okx_service_id: 30215,
    title: 'PM Event Analyst (Football-ready)',
    category: 'finance',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  '/content-verify-claims': {
    service_id: 'content_verify_claims',
    okx_service_id: 30216,
    title: 'Content Verify Claims',
    category: 'agent_ops',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  // Code-ready; NOT on OKX listing until Leo authorize create/activate
  '/content-slop-check': {
    service_id: 'content_slop_check',
    okx_service_id: 36664,
    title: 'Content Slop Check',
    category: 'agent_ops',
    fee_usdt: '0.05',
    fee_atomic: '50000',
    mode: 'live'
  },
  '/sports-smart-money-radar': {
    service_id: 'sports_smart_money_radar',
    okx_service_id: 36661,
    title: 'Sports Smart Money Radar',
    category: 'sports',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  '/sports-upset-alert': {
    service_id: 'sports_upset_alert',
    okx_service_id: 36662,
    title: 'Sports Upset Alert',
    category: 'sports',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  },
  '/pm-profile': {
    service_id: 'pm_profile',
    okx_service_id: 36663,
    title: 'PM Profile',
    category: 'finance',
    fee_usdt: '0.05',
    fee_atomic: '50000',
    mode: 'live'
  },
  '/agent-budget-preflight': {
    service_id: 'agent_budget_preflight',
    okx_service_id: 36666,
    title: 'Agent Budget Preflight',
    category: 'agent_ops',
    fee_usdt: '0.1',
    fee_atomic: '100000',
    mode: 'live'
  }
};

export function getServiceCatalogEntry(pathname) {
  return SERVICE_CATALOG[pathname] ?? null;
}

export function getFeeAtomicForPath(pathname) {
  return getServiceCatalogEntry(pathname)?.fee_atomic ?? '1000000';
}

/** OKX onchain listing copy (two lines, no URLs). Keys = live okx_service_id */
export const OKX_LISTING_COPY = {
  30207: {
    serviceName: 'World Cup Smart Money Radar',
    serviceDescription:
      'Heuristic World Cup prediction-market wallet signals from large public trades and 7-day leaderboard stats; data only.\n'
      + '世界杯预测市场聪明钱雷达：大额成交与7日盈利钱包信号。输入 market 关键词（如 winner、队名或 all）+ limit 1-10。'
  },
  30208: {
    serviceName: 'Polymarket Smart Money Radar',
    serviceDescription:
      'Heuristic Polymarket wallet signals from recent large trades; topic search with limited coverage per call.\n'
      + 'Polymarket 全市场聪明钱雷达。输入 market/topic 关键词（如 bitcoin 或 all）+ limit 1-10；数据信号，非投资建议。'
  },
  30209: {
    serviceName: 'Agent Delivery Audit Gate',
    serviceDescription:
      'Rule-based audit of agent task delivery vs goals and evidence; returns pass, needs review, or fail.\n'
      + 'Agent 交付验收闸门：对照任务目标与证据，输出 pass/需复核/fail。输入 task、delivery_summary、artifacts、validation。'
  },
  30210: {
    serviceName: 'Event Price Divergence Radar',
    serviceDescription:
      'Flags where 24h prediction-market probability moves diverge from 24h OKX spot momentum on major crypto assets.\n'
      + '事件概率与币价背离雷达：PM 24h 概率变动 vs OKX 现货 24h 动量。输入 asset（bitcoin/ethereum/solana 或省略查主流）。'
  },
  30211: {
    serviceName: 'Crypto Market Regime Radar',
    serviceDescription:
      'Blends OKX spot momentum, perp funding/premium and Polymarket drift into risk_on/off/neutral/mixed with explainable score.\n'
      + '加密市场状态雷达：现货动量+资金费率+PM 情绪 → risk_on/off/neutral 及 0-100 分。输入 focus/asset 关键词 + limit。'
  },
  30212: {
    serviceName: 'World Cup Upset Alert',
    serviceDescription:
      'Flags profitable wallets entering low-probability World Cup outcomes; potential upset positioning signals only.\n'
      + '世界杯冷门预警：盈利钱包涌入低概率赛果。输入 market 关键词（winner/队名/all）+ limit 1-10；数据信号，非投注建议。'
  },
  30213: {
    serviceName: 'Token DD Verdict',
    serviceDescription:
      'Rule-based token research gate with DEX liquidity/volume heuristics for EVM contracts; returns avoid/watch/research buckets.\n'
      + '代币尽调闸门：规则引擎输出 avoid/观望/可研究等分桶；EVM 合约查 DEX 流动性与活跃度。输入 asset（ticker 或合约地址）。'
  },
  30214: {
    serviceName: 'PM Trade Preflight',
    serviceDescription:
      'Read-only eligible/watch/skip gate before a Polymarket order; checks liquidity, price zone, spread, and decision-card lite fields. eligible ≠ buy tip.\n'
      + '预测市场下单前检查：eligible/观望/跳过，只读不下单。输入 market_url 或 slug + side(yes/no)，可选 size_usd。'
  },
  30215: {
    serviceName: 'PM Event Readout',
    serviceDescription:
      'Football-ready event evidence card: same-event market matrix, fixture-aware tradability, and category depth when available. Not a buy tip.\n'
      + '预测市场事件解读卡（Football-ready）：同场矩阵、赛程/fixture 可交易性，足球/网球品类深度可选。输入 market_url 或 slug；不下单。'
  },
  30216: {
    serviceName: 'Content Verify Claims',
    serviceDescription:
      'Rule-based check that publish claims overlap caller-supplied source excerpts; pass, needs_review, or fail.\n'
      + '发布前断言核查：对照你提供的原文摘录核对数字/关键词。输入 claims[] + sources[].text；不抓网页。'
  }
};

/** Listing copy for services not yet on OKX (use with onchainos create). Keys = service_id */
export const PENDING_OKX_LISTING_COPY = {
  content_slop_check: {
    serviceName: 'Content Slop Check',
    serviceDescription:
      'Rule-based AI-slop / filler detection for draft text before publish; returns slop_score and flags. Not a rewrite service.\n'
      + '发布前注水/AI 废话检测：输出 slop_score 与旗帜。输入 text；不改写、不发帖。'
  },
  sports_smart_money_radar: {
    serviceName: 'Sports Smart Money Radar',
    serviceDescription:
      'Heuristic sports prediction-market wallet signals (football leagues, tennis, NBA, NFL, UFC, MLB, etc.); data only.\n'
      + '体育预测市场聪明钱雷达：不绑死世界杯。输入 sport + 可选 league/query/tag_slug + limit。'
  },
  sports_upset_alert: {
    serviceName: 'Sports Upset Alert',
    serviceDescription:
      'Flags profitable wallets entering low-probability sports outcomes across competitions; data only.\n'
      + '体育冷门预警：盈利钱包买低概率侧。输入 sport/league/query；非投注建议。'
  },
  pm_profile: {
    serviceName: 'PM Profile',
    serviceDescription:
      'Read-only Polymarket wallet snapshot: 7d leaderboard PnL + open positions sample. From public APIs / polymarket-toolkit lineage.\n'
      + 'Polymarket 钱包画像：7日榜 PnL + 持仓抽样。输入 address 或 username；只读不下单。'
  },
  agent_budget_preflight: {
    serviceName: 'Agent Budget Preflight',
    serviceDescription:
      'Deterministic spend gate before an agent pays for an API/x402 call: buy / skip_sufficient / reject with reasons. No wallet, no settle.\n'
      + 'Agent 付费调用前预算闸门：输出 buy/跳过/拒绝及原因。输入 budget_cap_usdt + offer.price_usdt；不签名、不结算。'
  },
  crypto_market_regime_radar: OKX_LISTING_COPY[30211],
  world_cup_upset_alert: OKX_LISTING_COPY[30212],
  token_dd_verdict: OKX_LISTING_COPY[30213],
  pm_trade_preflight: OKX_LISTING_COPY[30214],
  pm_event_readout: OKX_LISTING_COPY[30215],
  content_verify_claims: OKX_LISTING_COPY[30216]
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
