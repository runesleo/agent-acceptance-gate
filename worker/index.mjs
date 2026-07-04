import { assessWorldCupSmartMoney } from '../src/worldcup-smart-money.mjs';
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
              mode: 'public_safe_demo'
            },
            ...listOkxAiDataServices()
          ]
        });
      }

      if (request.method === 'POST' && url.pathname === '/world-cup-smart-money-radar') {
        const payload = await readJson(request);
        return json(assessWorldCupSmartMoney(payload));
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
