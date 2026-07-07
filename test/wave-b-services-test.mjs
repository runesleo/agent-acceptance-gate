import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import { assessTokenDdVerdictLive } from '../src/token-dd-verdict.mjs';
import { assessPmTradePreflightLive } from '../src/pm-trade-preflight.mjs';

const BASE = 'https://gate.example.com';

// ---- unit: token-dd-verdict -------------------------------------------------

{
  const referral = await assessTokenDdVerdictLive({ asset: 'https://rise.rich/ref/abcd' });
  assert.equal(referral.verdict_bucket, 'avoid');
  assert.ok(referral.hard_stops.includes('referral_or_promo_wrapper'));
}

{
  const ticker = await assessTokenDdVerdictLive({ asset: 'ETH' });
  assert.ok(['watch_only', 'research_position', 'tiny_speculative', 'conviction'].includes(ticker.verdict_bucket));
  assert.equal(ticker.input.id_type, 'ticker');
}

{
  const mockFetch = async (url) => {
    if (String(url).includes('dexscreener')) {
      return new Response(JSON.stringify({
        pairs: [{
          chainId: 'ethereum',
          dexId: 'uniswap',
          pairAddress: '0xpair',
          liquidity: { usd: 120000 },
          volume: { h24: 50000 },
          priceUsd: '1.23'
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('unexpected url');
  };
  const contract = await assessTokenDdVerdictLive(
    { asset: '0x000000000000000000000000000000000000dead' },
    { fetchImpl: mockFetch }
  );
  assert.ok(contract.dex_scan?.pairs_found >= 1);
  assert.ok(contract.score_0_100 >= 45);
}

// ---- unit: pm-trade-preflight -----------------------------------------------

{
  const mockGamma = async (url) => {
    const u = String(url);
    if (!u.includes('gamma-api.polymarket.com/markets')) {
      throw new Error(`unexpected ${u}`);
    }
    return new Response(JSON.stringify([{
      conditionId: '0xabc',
      slug: 'demo-slug',
      question: 'Will demo happen?',
      active: true,
      closed: false,
      volume24hr: 25000,
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.42","0.58"]',
      bestBid: 0.41,
      bestAsk: 0.43
    }]), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const preflight = await assessPmTradePreflightLive(
    { slug: 'demo-slug', side: 'yes', size_usd: 50 },
    { fetchImpl: mockGamma }
  );
  assert.equal(preflight.action, 'trade');
  assert.equal(preflight.side_price, 0.42);
  assert.equal(preflight.service_id, 'pm_trade_preflight');
}

{
  const mockGammaClosed = async () => new Response(JSON.stringify([{
    conditionId: '0xclosed',
    slug: 'closed-slug',
    question: 'Closed market',
    active: false,
    closed: true,
    volume24hr: 0,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.5","0.5"]'
  }]), { status: 200, headers: { 'content-type': 'application/json' } });

  const preflight = await assessPmTradePreflightLive(
    { slug: 'closed-slug', side: 'yes' },
    { fetchImpl: mockGammaClosed }
  );
  assert.equal(preflight.action, 'skip');
}

// ---- worker integration (degraded fallback, no external network) ------------

const savedFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).startsWith('https://web3.okx.com/')) {
    throw new Error('x402 should not run in this test');
  }
  throw new Error('external network disabled');
};

try {
  const tokenRes = await worker.fetch(new Request(`${BASE}/token-dd-verdict`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ asset: 'ETH' })
  }));
  assert.equal(tokenRes.status, 200);
  const tokenBody = await tokenRes.json();
  assert.equal(tokenBody.service_id, 'token_dd_verdict');
  assert.ok(['degraded', 'public_safe_demo'].includes(tokenBody.mode) || tokenBody.verdict_bucket);

  const preRes = await worker.fetch(new Request(`${BASE}/pm-trade-preflight`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug: 'demo-slug', side: 'yes' })
  }));
  assert.equal(preRes.status, 200);
  const preBody = await preRes.json();
  assert.equal(preBody.service_id, 'pm_trade_preflight');
  assert.ok(['trade', 'watch', 'skip'].includes(preBody.action));

  const catalog = await worker.fetch(new Request(`${BASE}/api/okx-ai-services`)).then((r) => r.json());
  assert.ok(catalog.services.some((s) => s.service_id === 'token_dd_verdict'));
  assert.ok(catalog.services.some((s) => s.service_id === 'pm_trade_preflight'));

  const sample = await worker.fetch(new Request(`${BASE}/token-dd-verdict`, { method: 'GET' })).then((r) => r.json());
  assert.equal(sample.mode, 'public_sample');
  assert.ok(sample.sample_response?.verdict_bucket);
} finally {
  globalThis.fetch = savedFetch;
}

console.log('PASS wave-b-services-test');
