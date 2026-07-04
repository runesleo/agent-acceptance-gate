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

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type'
};

export default {
  async fetch(request) {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: JSON_HEADERS });
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

      if (request.method === 'POST' && url.pathname === '/world-cup-smart-money-radar') {
        const payload = await readJson(request);
        return json(await worldCupRadarWithCache(payload));
      }

      if (request.method === 'POST' && url.pathname === '/polymarket-smart-money-radar') {
        const payload = await readJson(request);
        return json(await polymarketRadarWithCache(payload));
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

function json(payload, status = 200) {
  return new Response(`${JSON.stringify(payload, null, 2)}\n`, {
    status,
    headers: JSON_HEADERS
  });
}
