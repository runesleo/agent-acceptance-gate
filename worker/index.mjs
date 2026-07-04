import { assessWorldCupSmartMoney } from '../src/worldcup-smart-money.mjs';
import {
  assessPolymarketSmartMoneyLive,
  assessWorldCupSmartMoneyLive
} from '../src/worldcup-smart-money-live.mjs';
import {
  assessOkxAiDataService,
  getOkxAiDataServiceByPath,
  listOkxAiDataServices
} from '../src/okx-ai-data-services.mjs';
import {
  assessEventPriceDivergenceLive,
  buildEventPriceDivergenceFallback
} from '../src/event-price-divergence.mjs';
import {
  assessCryptoMarketRegimeLive,
  buildCryptoMarketRegimeFallback
} from '../src/crypto-market-regime.mjs';
import {
  assessWorldCupUpsetAlertLive,
  buildWorldCupUpsetAlertFallback
} from '../src/world-cup-upset-alert.mjs';
import { auditDelivery } from '../src/auditor.mjs';
import { handlePaidRequest, isX402Enabled, X402_CORS_HEADERS } from './x402.mjs';

// Base headers are byte-identical to the pre-paywall deployment; x402-specific
// CORS additions are only applied when X402_ENABLED === 'true'.
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

// Paid radar endpoints (1 USDT per call via OKX x402 when X402_ENABLED === 'true').
const PAID_RADAR_ROUTES = {
  '/world-cup-smart-money-radar': {
    description: 'World Cup Smart Money Radar — tracks profitable World Cup prediction-market wallets and highlights position changes.',
    load: (payload) => worldCupRadarWithCache(payload)
  },
  '/polymarket-smart-money-radar': {
    description: 'Polymarket Smart Money Radar — tracks profitable Polymarket wallets and highlights position changes.',
    load: (payload) => polymarketRadarWithCache(payload)
  },
  '/event-price-divergence-radar': {
    description: 'Event Price Divergence Radar — flags Polymarket event-probability moves that diverge from 24h crypto spot momentum on OKX.',
    load: (payload) => eventPriceDivergenceWithCache(payload)
  },
  '/crypto-market-regime-radar': {
    description: 'Crypto Market Regime Radar — blends OKX spot momentum, perp funding/premium and Polymarket event-probability drift into an explainable risk_on / risk_off / neutral / mixed regime call with a 0-100 score.',
    load: (payload) => cryptoMarketRegimeWithCache(payload)
  },
  '/world-cup-upset-alert': {
    description: 'World Cup Upset Alert — flags profitable Polymarket wallets (7d PnL > 0) entering or adding to low-probability (<0.35) World Cup outcomes: potential upset positioning.',
    load: (payload) => worldCupUpsetAlertWithCache(payload)
  },
  '/agent-delivery-acceptance-audit': {
    description: 'Agent Delivery Audit Gate — audits an agent task delivery (evidence, validation, hard gates) and returns pass / needs_review / fail with a buyer summary.',
    // Deterministic per-payload audit — no cache (every audit input is unique).
    load: (payload) => runDeliveryAcceptanceAudit(payload)
  }
};

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: isX402Enabled(env) ? { ...JSON_HEADERS, ...X402_CORS_HEADERS } : JSON_HEADERS
        });
      }

      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/health') {
        return json({
          ok: true,
          service: 'agent-acceptance-gate',
          mode: 'edge_worker',
          launch_lane: 'okx_ai_asp'
        });
      }

      if (request.method === 'GET' && url.pathname === '/api/okx-ai-services') {
        return json({
          schema_version: '0.1',
          mode: 'edge_worker_public_safe_demo',
          services: [
            {
              service_id: 'agent_delivery_acceptance_audit',
              path: '/agent-delivery-acceptance-audit',
              title: 'Agent Delivery Audit Gate',
              category: 'agent_ops',
              fee_usdt: '1',
              description: 'Audits an agent task delivery (evidence, validation, hard gates) and returns pass / needs_review / fail with a buyer summary.',
              mode: 'live'
            },
            {
              service_id: 'event_price_divergence_radar',
              path: '/event-price-divergence-radar',
              title: 'Event Price Divergence Radar',
              category: 'finance',
              fee_usdt: '1',
              description: 'Flags Polymarket event-probability moves that diverge from 24h crypto spot momentum on OKX.',
              mode: 'live'
            },
            {
              service_id: 'crypto_market_regime_radar',
              path: '/crypto-market-regime-radar',
              title: 'Crypto Market Regime Radar',
              category: 'finance',
              fee_usdt: '1',
              description: 'Blends OKX spot momentum, perp funding/premium and Polymarket event-probability drift into an explainable risk_on / risk_off / neutral / mixed regime call with a 0-100 score.',
              mode: 'live'
            },
            {
              service_id: 'world_cup_upset_alert',
              path: '/world-cup-upset-alert',
              title: 'World Cup Upset Alert',
              category: 'world_cup',
              fee_usdt: '1',
              description: 'Flags profitable Polymarket wallets (7d PnL > 0) entering or adding to low-probability (<0.35) World Cup outcomes — potential upset positioning.',
              mode: 'live'
            },
            {
              service_id: 'world_cup_smart_money_radar',
              path: '/world-cup-smart-money-radar',
              title: 'World Cup Smart Money Radar',
              category: 'world_cup',
              fee_usdt: '1',
              description: 'Tracks profitable World Cup prediction-market wallets and highlights position changes.',
              mode: 'live'
            },
            // polymarket_smart_money_radar is served live by this worker; the
            // remaining data services are still public-safe demos.
            ...listOkxAiDataServices().map((service) =>
              service.service_id === 'polymarket_smart_money_radar'
                ? { ...service, mode: 'live' }
                : service)
          ]
        });
      }

      if (request.method === 'POST' && PAID_RADAR_ROUTES[url.pathname]) {
        const route = PAID_RADAR_ROUTES[url.pathname];
        if (!isX402Enabled(env)) {
          // Compatibility mode (default): behave exactly like the free listing
          // endpoints that are currently under marketplace review.
          return json(await route.load(await readJson(request)));
        }
        return handlePaidRequest(request, env, {
          resourceUrl: `${url.origin}${url.pathname}`,
          description: route.description,
          // Body is only parsed after payment verifies (challenge costs nothing).
          deliver: async () => route.load(await readJson(request)),
          respond: (payload, status = 200, extraHeaders = undefined) =>
            json(payload, status, { ...X402_CORS_HEADERS, ...(extraHeaders || {}) })
        });
      }

      if (request.method === 'POST') {
        const service = getOkxAiDataServiceByPath(url.pathname);
        if (service) {
          const payload = await readJson(request);
          return json(assessOkxAiDataService(service, payload));
        }
      }

      return json({
        error: 'not_found',
        message: 'Use GET /health, GET /api/okx-ai-services, or POST one of the listed service paths.'
      }, 404);
    } catch (error) {
      return json({
        error: 'bad_request',
        message: error instanceof Error ? error.message : String(error)
      }, 400);
    }
  }
};

// In-memory per-isolate cache for radar responses. Shields the paid A2MCP
// endpoints from Polymarket rate limits; entries expire after CACHE_TTL_MS.
const CACHE_TTL_MS = 120_000;
const radarCache = new Map();

async function worldCupRadarWithCache(payload) {
  const market = String(payload?.market ?? payload?.market_id ?? payload?.query ?? 'all').trim().toLowerCase();
  const limit = Number.parseInt(payload?.limit, 10) || 5;

  return radarWithCache({
    cacheKey: `${market}|${limit}`,
    loadLive: () => assessWorldCupSmartMoneyLive(payload),
    loadFallback: () => assessWorldCupSmartMoney(payload)
  });
}

async function polymarketRadarWithCache(payload) {
  const query = String(payload?.market ?? payload?.topic ?? payload?.query ?? 'all').trim().toLowerCase();
  const limit = Number.parseInt(payload?.limit, 10) || 5;

  return radarWithCache({
    cacheKey: `pm|${query}|${limit}`,
    loadLive: () => assessPolymarketSmartMoneyLive(payload),
    loadFallback: () => {
      const service = getOkxAiDataServiceByPath('/polymarket-smart-money-radar');
      return assessOkxAiDataService(service, payload);
    }
  });
}

async function eventPriceDivergenceWithCache(payload) {
  const asset = String(payload?.asset ?? 'all').trim().toLowerCase();
  const limit = Number.parseInt(payload?.limit, 10) || 5;

  return radarWithCache({
    cacheKey: `divergence|${asset}|${limit}`,
    loadLive: () => assessEventPriceDivergenceLive(payload),
    loadFallback: () => buildEventPriceDivergenceFallback(payload)
  });
}

async function cryptoMarketRegimeWithCache(payload) {
  const focus = String(payload?.focus ?? payload?.asset ?? 'all').trim().toLowerCase();
  const limit = Number.parseInt(payload?.limit, 10) || 5;

  return radarWithCache({
    cacheKey: `regime|${focus}|${limit}`,
    loadLive: () => assessCryptoMarketRegimeLive(payload),
    loadFallback: () => buildCryptoMarketRegimeFallback(payload)
  });
}

async function worldCupUpsetAlertWithCache(payload) {
  const market = String(payload?.market ?? payload?.market_id ?? payload?.query ?? 'all').trim().toLowerCase();
  const limit = Number.parseInt(payload?.limit, 10) || 5;

  return radarWithCache({
    cacheKey: `upset|${market}|${limit}`,
    loadLive: () => assessWorldCupUpsetAlertLive(payload),
    loadFallback: () => buildWorldCupUpsetAlertFallback(payload)
  });
}

// ---- Agent Delivery Audit Gate ---------------------------------------------
// Accepts either the full auditor schema ({task, delivery, context}) or the
// compact buyer shape {task, delivery_summary, artifacts, validation,
// hard_gates?, next_gate?} and adapts it before calling auditDelivery.
// Invalid input throws BEFORE x402 settle, so a bad request never burns a payment.
function runDeliveryAcceptanceAudit(payload) {
  const input = normalizeAuditInput(payload);
  return auditDelivery(input);
}

function normalizeAuditInput(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Audit input must be a JSON object with at least {task, delivery_summary}.');
  }

  // Full auditor schema passes through untouched (context defaulted).
  if (payload.delivery && typeof payload.delivery === 'object') {
    return { ...payload, context: payload.context ?? { repo_state: 'unknown' } };
  }

  const task = typeof payload.task === 'string'
    ? { buyer_goal: payload.task }
    : (payload.task && typeof payload.task === 'object' ? { ...payload.task } : null);
  if (task && !task.buyer_goal) {
    task.buyer_goal = task.goal ?? task.description ?? null;
  }
  if (!task?.buyer_goal || !payload.delivery_summary) {
    throw new Error('Audit input requires task (string or {buyer_goal, ...}) and delivery_summary. Optional: artifacts[], validation[], changed_files[], hard_gates[], next_gate, context.');
  }

  return {
    schema_version: '0.1',
    mode: payload.mode ?? 'full',
    task,
    delivery: {
      writeback_text: String(payload.delivery_summary),
      artifact_paths: toStringArray(payload.artifacts),
      changed_files: toStringArray(payload.changed_files),
      validation: toStringArray(payload.validation),
      validation_output: payload.validation_output ?? null,
      rollback_plan: payload.rollback_plan ?? null,
      hard_gates_declared: toStringArray(payload.hard_gates),
      next_gate: payload.next_gate
        ? String(payload.next_gate)
        : 'Buyer manual review before acceptance (seller declared no next gate).'
    },
    context: payload.context && typeof payload.context === 'object'
      ? payload.context
      : { repo_state: payload.repo_state ?? 'unknown' }
  };
}

function toStringArray(value) {
  if (value === null || value === undefined) return [];
  const items = Array.isArray(value) ? value : [value];
  return items.map((item) => String(item)).filter((item) => item.trim().length > 0);
}

async function radarWithCache({ cacheKey, loadLive, loadFallback }) {
  const cached = radarCache.get(cacheKey);
  if (cached && Date.now() - cached.storedAt < CACHE_TTL_MS) {
    return { ...cached.payload, cache: 'hit' };
  }

  try {
    const live = await loadLive();
    radarCache.set(cacheKey, { storedAt: Date.now(), payload: live });
    pruneCache();
    return live;
  } catch (error) {
    // Never 5xx a paid call: serve stale cache first, then degraded demo data.
    if (cached) {
      return { ...cached.payload, cache: 'stale', mode: 'degraded_stale_cache' };
    }
    const fallback = loadFallback();
    fallback.mode = 'degraded';
    fallback.caveats = [
      `Live Polymarket fetch failed (${error instanceof Error ? error.message : String(error)}); serving static fallback data.`,
      'Do not trade on this response. Retry shortly for live data.',
      ...fallback.caveats
    ];
    return fallback;
  }
}

function pruneCache() {
  if (radarCache.size <= 32) return;
  const oldestFirst = [...radarCache.entries()].sort((a, b) => a[1].storedAt - b[1].storedAt);
  for (const [key] of oldestFirst.slice(0, radarCache.size - 32)) {
    radarCache.delete(key);
  }
}

async function readJson(request) {
  const text = await request.text();
  if (!text.trim()) return {};
  if (text.length > 1_000_000) {
    throw new Error('Request body too large');
  }
  return JSON.parse(text);
}

function json(payload, status = 200, extraHeaders = undefined) {
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    status,
    headers: extraHeaders ? { ...JSON_HEADERS, ...extraHeaders } : JSON_HEADERS
  });
}
