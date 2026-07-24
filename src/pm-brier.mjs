// PM Brier — read-only calibration score from settled Polymarket positions.
// Productizes polymarket-toolkit computeBrierScoreFromSettledPositions.

const SERVICE_ID = 'pm_brier';
const LB_BASE = 'https://lb-api.polymarket.com';
const DATA_BASE = 'https://data-api.polymarket.com';
const FETCH_TIMEOUT_MS = 12000;
const EVM = /^0x[a-fA-F0-9]{40}$/;

const STANDARD_CAVEATS = [
  'Read-only calibration sample from Data API positions page — not full-history Brier.',
  'Settled rows use redeemable=true; win if currentValue > 0.',
  'No wallet custody, no trade execution.'
];

export async function assessPmBrierLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const raw = String(input.address ?? input.wallet ?? input.username ?? input.query ?? '').trim();
  if (!raw) throw new Error('address (0x…) or username is required');

  let address = null;
  let resolved_via = null;
  if (EVM.test(raw)) {
    address = raw.toLowerCase();
    resolved_via = 'evm_address';
  } else {
    address = await resolveUsername(fetchImpl, raw);
    resolved_via = address ? 'leaderboard_username' : null;
  }
  if (!address) {
    throw new Error(`Could not resolve wallet for "${raw}" via leaderboard username search`);
  }

  const limit = clampInt(input.limit, 50, 200, 200);
  const positions = await fetchJson(
    fetchImpl,
    `${DATA_BASE}/positions?user=${address}&limit=${limit}&sizeThreshold=0`
  ).catch(() => []);

  const list = Array.isArray(positions) ? positions : [];
  const settled = list.filter((p) => p.redeemable === true);
  const result = computeBrier(settled);
  const rating = !Number.isFinite(result.brier)
    ? 'insufficient_sample'
    : result.brier <= 0.15
      ? 'good'
      : result.brier <= 0.25
        ? 'moderate'
        : 'poor';

  const brier = Number.isFinite(result.brier) ? round3(result.brier) : null;
  const win_rate = result.n ? round3(result.wins / result.n) : null;

  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'live',
    generated_at: new Date().toISOString(),
    input: { query: raw, address, resolved_via, positions_limit: limit },
    brier,
    settled_markets: result.n,
    wins: result.wins,
    win_rate,
    rating,
    buyer_summary_zh: buildBuyerSummaryZh({ brier, rating, n: result.n, wins: result.wins, win_rate }),
    sample: settled.slice(0, 10).map((p) => ({
      title: p.title ?? p.slug ?? null,
      avg_price: toNumber(p.avgPrice),
      won: toNumber(p.currentValue) > 0,
      current_value: toNumber(p.currentValue)
    })),
    confidence_gaps: [
      'positions_page_capped',
      ...(result.n < 10 ? ['small_settled_sample'] : [])
    ],
    caveats: [...STANDARD_CAVEATS],
    next_gate: 'Use_polymarket-brier_skill_for_full_calibration',
    source: {
      provider: 'polymarket_public_api',
      oss_lineage: 'polymarket-toolkit computeBrierScoreFromSettledPositions',
      method: 'mean((avgPrice - actual)^2) over redeemable positions'
    }
  };
}

export function buildPmBrierFallback(input = {}) {
  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'public_safe_demo',
    generated_at: new Date().toISOString(),
    input: { query: input.address ?? input.username ?? null, address: null, resolved_via: null },
    brier: null,
    settled_markets: 0,
    wins: 0,
    win_rate: null,
    rating: 'insufficient_sample',
    sample: [],
    confidence_gaps: ['live_data_unavailable'],
    caveats: [...STANDARD_CAVEATS, 'Demo fallback.'],
    next_gate: 'Use_polymarket-brier_skill_for_full_calibration',
    source: { provider: 'static_fallback' }
  };
}

function computeBrier(settled) {
  if (!settled.length) return { brier: Number.NaN, n: 0, wins: 0 };
  let sumSq = 0;
  let wins = 0;
  for (const p of settled) {
    const f = toNumber(p.avgPrice);
    const won = toNumber(p.currentValue) > 0;
    if (won) wins += 1;
    const actual = won ? 1 : 0;
    sumSq += (f - actual) ** 2;
  }
  return { brier: sumSq / settled.length, n: settled.length, wins };
}

async function resolveUsername(fetchImpl, username) {
  const needle = username.trim().toLowerCase();
  for (let page = 0; page < 3; page++) {
    const rows = await fetchJson(
      fetchImpl,
      `${LB_BASE}/profit?window=all&limit=500&offset=${page * 500}`
    ).catch(() => []);
    if (!Array.isArray(rows) || !rows.length) break;
    for (const row of rows) {
      const n = String(row.name ?? '').toLowerCase();
      const p = String(row.pseudonym ?? '').toLowerCase();
      if (n === needle || p === needle) return String(row.proxyWallet ?? '').toLowerCase() || null;
    }
    if (rows.length < 500) break;
  }
  return null;
}

async function fetchJson(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`Upstream ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function buildBuyerSummaryZh({ brier, rating, n, wins, win_rate }) {
  if (!Number.isFinite(brier) || !n) {
    return '样本不足：当前页没有足够已结算持仓，无法给出可靠 Brier 校准分。';
  }
  const ratingZh = rating === 'good' ? '较好' : rating === 'moderate' ? '一般' : '偏弱';
  return `Brier=${brier}（${ratingZh}），已结算样本 ${n} 场，胜 ${wins}（胜率 ${win_rate}）。分数越低校准越好；这是抽样信号，不是完整历史审计。`;
}
