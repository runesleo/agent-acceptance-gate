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
import {
  assessTokenDdVerdictLive,
  buildTokenDdVerdictFallback
} from '../src/token-dd-verdict.mjs';
import {
  assessPmTradePreflightLive,
  buildPmTradePreflightFallback
} from '../src/pm-trade-preflight.mjs';
import {
  assessPmEventReadoutLive,
  buildPmEventReadoutFallback
} from '../src/pm-event-readout.mjs';
import {
  assessContentVerifyClaims
} from '../src/content-verify-claims.mjs';
import { auditDelivery } from '../src/auditor.mjs';
import { handlePaidRequest, isX402Enabled, X402_CORS_HEADERS } from './x402.mjs';
import { getFeeAtomicForPath, getServiceCatalogEntry, LISTED_SERVICE_PATHS, SERVICE_CATALOG } from './service-catalog.mjs';
import {
  hasUsedFreeTrial,
  isFreeTrialEnabled,
  markFreeTrialUsed,
  withTrialBilling
} from './trial.mjs';

// Base headers are byte-identical to the pre-paywall deployment; x402-specific
// CORS additions are only applied when X402_ENABLED === 'true'.
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

// Paid A2MCP endpoints (per-service x402 fee; optional one free trial per IP when X402_FREE_TRIAL=true).
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
  },
  '/token-dd-verdict': {
    description: 'Token DD Verdict — Quick-tier rule-based token research gate with optional DexScreener liquidity scan for EVM contracts; returns avoid/watch/research/tiny_speculative/conviction buckets.',
    load: (payload) => tokenDdVerdictWithCache(payload)
  },
  '/pm-trade-preflight': {
    description: 'PM Trade Preflight — read-only eligible/watch/skip gate before a Polymarket order using public Gamma market metadata (liquidity, price zone, spread). eligible means mechanical checks passed, not a buy tip.',
    load: (payload) => pmTradePreflightWithCache(payload)
  },
  '/pm-event-readout': {
    description: 'PM Event Analyst — same-event matrix + honest tradability; Football L1 merges parent children (fixture gate, state map, expression comparison). Not a buy tip.',
    load: (payload) => pmEventReadoutWithCache(payload)
  },
  '/content-verify-claims': {
    description: 'Content Verify Claims — rule-based check that publish claims overlap caller-supplied source excerpts (numbers + keywords); returns pass, needs_review, or fail.',
    load: (payload) => runContentVerifyClaims(payload)
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
        const trialOn = isFreeTrialEnabled(env);
        const listed = [...LISTED_SERVICE_PATHS].map((path) => {
          const meta = SERVICE_CATALOG[path];
          const route = PAID_RADAR_ROUTES[path];
          const row = {
            service_id: meta.service_id,
            path,
            title: meta.title,
            category: meta.category,
            fee_usdt: meta.fee_usdt,
            description: route?.description ?? meta.title,
            mode: meta.mode
          };
          if (trialOn) row.free_trial = 'one_per_client_ip_per_service';
          return row;
        });
        const unlisted = Object.entries(SERVICE_CATALOG)
          .filter(([path]) => !LISTED_SERVICE_PATHS.has(path))
          .map(([path, meta]) => ({
            service_id: meta.service_id,
            path,
            title: meta.title,
            category: meta.category,
            fee_usdt: meta.fee_usdt,
            mode: meta.mode
          }));
        return json({
          schema_version: '0.1',
          mode: 'edge_worker_live',
          billing: {
            x402_enabled: isX402Enabled(env),
            free_trial: trialOn
              ? 'One POST per client IP per service path, then x402 at fee_usdt.'
              : 'disabled (unpaid POST returns 402; set X402_FREE_TRIAL=true to opt in)',
            sample_get: 'GET the same service path for a public sample payload.'
          },
          services: [...listed, ...unlisted]
        });
      }

      if (request.method === 'GET' && PAID_RADAR_ROUTES[url.pathname]) {
        const route = PAID_RADAR_ROUTES[url.pathname];
        const meta = getServiceCatalogEntry(url.pathname);
        const sampleRequest = samplePayloadForPath(url.pathname);
        const sampleResponse = await route.load(sampleRequest);
        const trialOn = isFreeTrialEnabled(env);
        const body = {
          schema_version: '0.1',
          mode: 'public_sample',
          path: url.pathname,
          fee_usdt: meta?.fee_usdt ?? null,
          sample_request: sampleRequest,
          sample_response: sampleResponse
        };
        if (trialOn) {
          body.free_trial = 'POST once without payment per client IP, then x402.';
        } else {
          body.billing = {
            mode: 'x402',
            unpaid_post: 'HTTP 402 payment-required challenge'
          };
        }
        return json(body);
      }

      if (request.method === 'POST' && PAID_RADAR_ROUTES[url.pathname]) {
        const route = PAID_RADAR_ROUTES[url.pathname];
        const pathname = url.pathname;
        const catalog = getServiceCatalogEntry(pathname);
        const priceAtomic = getFeeAtomicForPath(pathname);

        if (!isX402Enabled(env)) {
          return json(await route.load(await readJson(request)));
        }

        const hasPayment = request.headers.get('payment')
          || request.headers.get('payment-signature')
          || request.headers.get('x-payment');

        // Opt-in free trial only. Default unpaid path must 402 for OKX listing checks.
        if (
          !hasPayment
          && isFreeTrialEnabled(env)
          && !(await hasUsedFreeTrial(env, request, pathname))
        ) {
          const payload = await route.load(await readJson(request));
          await markFreeTrialUsed(env, request, pathname);
          return json(
            withTrialBilling(payload, { pathname, fee_usdt: catalog?.fee_usdt ?? '0.1' }),
            200,
            X402_CORS_HEADERS
          );
        }

        return handlePaidRequest(request, env, {
          resourceUrl: `${url.origin}${pathname}`,
          description: route.description,
          priceAtomic,
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

async function tokenDdVerdictWithCache(payload) {
  const asset = String(payload?.asset ?? payload?.token ?? payload?.query ?? '').trim().toLowerCase();
  if (!asset) {
    throw new Error('token-dd-verdict requires asset (ticker, contract address, or URL).');
  }

  return radarWithCache({
    cacheKey: `token-dd|${asset}`,
    loadLive: () => assessTokenDdVerdictLive(payload),
    loadFallback: () => buildTokenDdVerdictFallback(payload)
  });
}

async function pmTradePreflightWithCache(payload) {
  const ref = String(
    payload?.condition_id
    ?? payload?.slug
    ?? payload?.market_url
    ?? ''
  ).trim().toLowerCase();
  const side = String(payload?.side ?? 'yes').trim().toLowerCase();
  if (!ref) {
    throw new Error('pm-trade-preflight requires market_url, condition_id, or slug.');
  }

  return radarWithCache({
    cacheKey: `preflight|${ref}|${side}|${payload?.size_usd ?? ''}`,
    loadLive: () => assessPmTradePreflightLive(payload),
    loadFallback: () => buildPmTradePreflightFallback(payload)
  });
}

async function pmEventReadoutWithCache(payload) {
  const ref = String(
    payload?.condition_id
    ?? payload?.slug
    ?? payload?.market_url
    ?? ''
  ).trim().toLowerCase();
  if (!ref) {
    throw new Error('pm-event-readout requires market_url, condition_id, or slug.');
  }

  // Fixture / musk / tennis options change the enriched output — must be part of cache key.
  const football = payload?.football && typeof payload.football === 'object' ? payload.football : null;
  const tennis = payload?.tennis && typeof payload.tennis === 'object' ? payload.tennis : null;
  const musk = payload?.musk && typeof payload.musk === 'object' ? payload.musk : null;
  const optionKey = [
    football?.verified === true ? `fv:${football.market_fixture_match || 'yes'}` : 'fv:none',
    tennis?.verified === true ? `tv:${tennis.market_fixture_match || 'yes'}` : 'tv:none',
    musk?.current_count != null ? `mc:${musk.current_count}` : 'mc:none'
  ].join('|');

  return radarWithCache({
    cacheKey: `readout|${ref}|${optionKey}`,
    loadLive: () => assessPmEventReadoutLive(payload),
    loadFallback: () => buildPmEventReadoutFallback(payload)
  });
}

function runContentVerifyClaims(payload) {
  return assessContentVerifyClaims(payload);
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
      `Live upstream fetch failed (${error instanceof Error ? error.message : String(error)}); serving static fallback data.`,
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

function samplePayloadForPath(pathname) {
  switch (pathname) {
    case '/agent-delivery-acceptance-audit':
      return {
        task: 'Ship a read-only health endpoint for the worker.',
        delivery_summary: 'Added GET /health and npm test passes.',
        artifacts: ['worker/index.mjs'],
        validation: ['npm test']
      };
    case '/event-price-divergence-radar':
      return { asset: 'bitcoin', limit: 2 };
    case '/polymarket-smart-money-radar':
      return { query: 'bitcoin', limit: 2 };
    case '/world-cup-smart-money-radar':
    case '/world-cup-upset-alert':
      return { query: 'all', limit: 2 };
    case '/crypto-market-regime-radar':
      return { focus: 'bitcoin', limit: 2 };
    case '/token-dd-verdict':
      return { asset: '0x000000000000000000000000000000000000dead' };
    case '/pm-trade-preflight':
      return { slug: 'will-argentina-win-the-2026-fifa-world-cup-245', side: 'yes' };
    case '/pm-event-readout':
      return {
        slug: 'fifwc-fra-mar-2026-07-09-fra',
        football: {
          verified: true,
          market_fixture_match: 'yes',
          scheduled_time_utc: '2026-07-09T20:00:00Z',
          fixture_sources: ['caller_verified']
        }
      };
    case '/content-verify-claims':
      return {
        claims: ['Platform has about 360 ASPs and roughly 3000 cumulative calls.'],
        sources: [{
          text: 'Marketplace scan on 2026-07-07: 358 unique ASPs and about 2982 cumulative soldCount.'
        }]
      };
    default:
      return { limit: 2 };
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
