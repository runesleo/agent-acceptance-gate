// Scenario SKUs — productize category plugins as searchable ASP surfaces.
// Each wraps pm-event-readout with a fixed scenario + optional query discovery.

import {
  assessPmEventReadoutLive,
  buildPmEventReadoutFallback
} from './pm-event-readout.mjs';
import {
  GAMMA_BASE,
  resolveMarketRef,
  fetchJson
} from './pm-gamma-market.mjs';

const SCENARIOS = {
  weather_event_readout: {
    service_id: 'weather_event_readout',
    expected: ['weather'],
    default_query: 'temperature high',
    zh_name: '天气温度阶梯',
    sample: {
      query: 'temperature',
      weather: { city: 'NYC', snapshot_time: '2026-07-24T12:00:00Z', observed_temp_f: 84 }
    }
  },
  politics_event_readout: {
    service_id: 'politics_event_readout',
    expected: ['politics'],
    default_query: 'presidential election',
    zh_name: '政治选举盘口',
    sample: { query: 'president' }
  },
  macro_fed_readout: {
    service_id: 'macro_fed_readout',
    expected: ['macro_fed'],
    default_query: 'fed interest rates',
    zh_name: '美联储利率宏观',
    sample: { query: 'fed rates' }
  },
  football_match_card: {
    service_id: 'football_match_card',
    expected: ['football'],
    default_query: 'premier league',
    zh_name: '足球比赛卡',
    sample: {
      query: 'premier league',
      football: { verified: false }
    }
  },
  tennis_match_card: {
    service_id: 'tennis_match_card',
    expected: ['tennis'],
    default_query: 'atp tennis',
    zh_name: '网球比赛卡',
    sample: {
      query: 'atp',
      tennis: { verified: false }
    }
  },
  nba_match_card: {
    service_id: 'nba_match_card',
    expected: ['nba'],
    default_query: 'nba',
    zh_name: 'NBA 比赛卡',
    sample: {
      query: 'nba',
      nba: { verified: false }
    }
  }
};

export function listScenarioSkuIds() {
  return Object.keys(SCENARIOS);
}

export function samplePayloadForScenario(serviceId) {
  return SCENARIOS[serviceId]?.sample ?? { query: 'all' };
}

export async function assessWeatherEventReadoutLive(input = {}, options = {}) {
  return assessScenarioSkuLive('weather_event_readout', input, options);
}
export async function assessPoliticsEventReadoutLive(input = {}, options = {}) {
  return assessScenarioSkuLive('politics_event_readout', input, options);
}
export async function assessMacroFedReadoutLive(input = {}, options = {}) {
  return assessScenarioSkuLive('macro_fed_readout', input, options);
}
export async function assessFootballMatchCardLive(input = {}, options = {}) {
  return assessScenarioSkuLive('football_match_card', input, options);
}
export async function assessTennisMatchCardLive(input = {}, options = {}) {
  return assessScenarioSkuLive('tennis_match_card', input, options);
}
export async function assessNbaMatchCardLive(input = {}, options = {}) {
  return assessScenarioSkuLive('nba_match_card', input, options);
}

export function buildWeatherEventReadoutFallback(input = {}) {
  return buildScenarioFallback('weather_event_readout', input);
}
export function buildPoliticsEventReadoutFallback(input = {}) {
  return buildScenarioFallback('politics_event_readout', input);
}
export function buildMacroFedReadoutFallback(input = {}) {
  return buildScenarioFallback('macro_fed_readout', input);
}
export function buildFootballMatchCardFallback(input = {}) {
  return buildScenarioFallback('football_match_card', input);
}
export function buildTennisMatchCardFallback(input = {}) {
  return buildScenarioFallback('tennis_match_card', input);
}
export function buildNbaMatchCardFallback(input = {}) {
  return buildScenarioFallback('nba_match_card', input);
}

async function assessScenarioSkuLive(scenarioKey, input = {}, options = {}) {
  const spec = SCENARIOS[scenarioKey];
  if (!spec) throw new Error(`Unknown scenario ${scenarioKey}`);
  const fetchImpl = options.fetchImpl ?? fetch;

  const resolvedInput = await resolveScenarioInput(input, spec, fetchImpl);
  const base = await assessPmEventReadoutLive(resolvedInput, {
    ...options,
    fetchImpl,
    enrichCategory: true
  });

  const category = base.category || base.category_plugin?.category || 'generic';
  const expected_ok = spec.expected.includes(category);
  const caveats = [
    ...(base.caveats || []),
    `Scenario SKU ${spec.service_id}: expects ${spec.expected.join('|')}; detected ${category}.`
  ];
  if (!expected_ok) {
    caveats.push(
      `Category mismatch: this SKU is for ${spec.zh_name}; detected "${category}". Results may be core_only — pick a matching market or use /pm-event-readout.`
    );
  }

  return {
    ...base,
    schema_version: '0.1',
    service_id: spec.service_id,
    scenario: {
      id: spec.service_id,
      zh_name: spec.zh_name,
      expected_categories: spec.expected,
      detected_category: category,
      expected_ok,
      resolved_via: resolvedInput._resolved_via || 'caller_ref',
      query: resolvedInput._query || null
    },
    buyer_summary_zh: buildScenarioBuyerSummaryZh(spec, base, expected_ok),
    caveats,
    next_gate: 'Use_pm_trade_preflight_before_orders',
    source: {
      ...(base.source || {}),
      scenario_sku: spec.service_id,
      method: 'pm_event_readout_scenario_wrapper'
    }
  };
}

function buildScenarioFallback(scenarioKey, input = {}) {
  const spec = SCENARIOS[scenarioKey];
  const base = buildPmEventReadoutFallback(input);
  return {
    ...base,
    service_id: spec.service_id,
    scenario: {
      id: spec.service_id,
      zh_name: spec.zh_name,
      expected_categories: spec.expected,
      detected_category: null,
      expected_ok: false,
      resolved_via: 'fallback'
    },
    buyer_summary_zh: `演示回退：${spec.zh_name} 实时行情不可用。请传 market_url/slug 或 query。`,
    mode: 'public_safe_demo'
  };
}

async function resolveScenarioInput(input, spec, fetchImpl) {
  const ref = resolveMarketRef(input);
  if (ref.slug || ref.condition_id) {
    return { ...input, _resolved_via: 'caller_ref' };
  }

  const query = String(input.query ?? input.market ?? input.topic ?? spec.default_query).trim();
  if (!query) {
    throw new Error(`${spec.service_id} requires market_url, slug, condition_id, or query.`);
  }

  const slug = await discoverSlug(fetchImpl, query, spec.expected);
  if (!slug) {
    throw new Error(`No active ${spec.zh_name} market matched query "${query}". Pass an explicit slug/market_url.`);
  }
  return {
    ...input,
    slug,
    _resolved_via: 'public_search',
    _query: query
  };
}

async function discoverSlug(fetchImpl, query, expectedCategories) {
  const result = await fetchJson(
    fetchImpl,
    `${GAMMA_BASE}/public-search?q=${encodeURIComponent(query)}&events_status=active&limit_per_type=12`
  ).catch(() => null);

  const events = Array.isArray(result?.events) ? result.events : [];
  const candidates = [];
  for (const event of events) {
    if (event?.closed) continue;
    const eventBlob = `${event.title || ''} ${event.slug || ''}`.toLowerCase();
    for (const market of event.markets || []) {
      if (!market?.slug || market.closed || market.active === false) continue;
      const blob = `${eventBlob} ${market.question || ''} ${market.slug || ''}`.toLowerCase();
      const score = scoreCategoryMatch(blob, expectedCategories) + Math.min(toNumber(market.volume24hr) / 100000, 3);
      candidates.push({ slug: market.slug, score, volume: toNumber(market.volume24hr) });
    }
    // Also allow event slug if markets missing slug
    if (event.slug) {
      const score = scoreCategoryMatch(eventBlob, expectedCategories) + Math.min(toNumber(event.volume24hr) / 100000, 2);
      candidates.push({ slug: event.slug, score, volume: toNumber(event.volume24hr) });
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.volume - a.volume);
  return candidates[0]?.slug || null;
}

function scoreCategoryMatch(blob, expected) {
  let score = 0;
  for (const cat of expected) {
    if (cat === 'weather' && /temperature|weather|°f|°c|high temp/.test(blob)) score += 5;
    if (cat === 'politics' && /president|election|nominee|senate|governor|parliament/.test(blob)) score += 5;
    if (cat === 'macro_fed' && /fed|fomc|interest rate|bps/.test(blob)) score += 5;
    if (cat === 'football' && /football|soccer|premier|uefa|fifa|epl|ucl/.test(blob)) score += 5;
    if (cat === 'tennis' && /tennis|atp|wta/.test(blob)) score += 5;
    if (cat === 'nba' && /\bnba\b|basketball/.test(blob)) score += 5;
  }
  return score;
}

function buildScenarioBuyerSummaryZh(spec, base, expectedOk) {
  const cat = base.category || 'unknown';
  const tradability = base.tradability || 'unknown';
  const depth = base.category_depth || 'core_only';
  const plugin = base.category_plugin;
  const thesis = plugin?.central_thesis
    || plugin?.market_implied_shape?.central_thesis
    || base.base_case
    || '无中心论题';
  if (!expectedOk) {
    return `${spec.zh_name} SKU：检测到品类 ${cat}（期望 ${spec.expected.join('/')}），深度 ${depth}，可交易性 ${tradability}。建议换匹配市场或改用通用 /pm-event-readout。`;
  }
  return `${spec.zh_name}：品类 ${cat}，深度 ${depth}，可交易性 ${tradability}。${String(thesis).slice(0, 120)} 非下单建议。`;
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
