// PM PnL Audit — quick public PnL trust gate.
// Productizes polymarket-toolkit fee-inclusive PnL guidance without running the
// Python full cashflow replay inside the Worker. Read-only public APIs only.

const SERVICE_ID = 'pm_pnl_audit';
const LB_BASE = 'https://lb-api.polymarket.com';
const DATA_BASE = 'https://data-api.polymarket.com';
const FETCH_TIMEOUT_MS = 12000;
const EVM = /^0x[a-fA-F0-9]{40}$/;
const AUDIT_PASS_DELTA_USD = 10;

const STANDARD_CAVEATS = [
  'Quick mode compares LB all-time profit with position-level cashPnL and activity first-page hints; it is not full cashflow replay.',
  'Position cashPnL is approximate and can diverge from fee-inclusive wallet truth due to fees, rebates, redemptions, merges/splits, and rounding.',
  'Full audit-grade replay remains the polymarket-pnl cashflow method over Data API /activity.',
  'Read-only public APIs only: no wallet custody, no signing, no order routing.'
];

/**
 * @param {object} input
 * @param {string} [input.address]
 * @param {string} [input.wallet]
 * @param {string} [input.username]
 * @param {string} [input.query]
 * @param {'quick'|'full'} [input.mode='quick']
 * @param {number} [input.positions_limit=100]
 */
export async function assessPmPnlAuditLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const raw = String(input.address ?? input.wallet ?? input.username ?? input.query ?? '').trim();
  if (!raw) throw new Error('pm-pnl-audit requires address or username.');

  const requestedMode = normalizeMode(input.mode);
  const resolved = await resolveAddress(fetchImpl, raw);
  if (!resolved.address) {
    throw new Error(`Could not resolve wallet for "${raw}" via leaderboard username search`);
  }

  const limit = clampInt(input.positions_limit ?? input.limit, 20, 500, 100);
  const [
    lbRows,
    positions,
    tradePage,
    rebatePage
  ] = await Promise.all([
    fetchJson(fetchImpl, `${LB_BASE}/profit?address=${resolved.address}&window=all`).catch(() => []),
    fetchJson(fetchImpl, `${DATA_BASE}/positions?user=${resolved.address}&limit=${limit}&sizeThreshold=0`).catch(() => []),
    fetchJson(fetchImpl, `${DATA_BASE}/activity?user=${resolved.address}&type=TRADE&limit=500`).catch(() => []),
    fetchJson(fetchImpl, `${DATA_BASE}/activity?user=${resolved.address}&type=MAKER_REBATE&limit=200`).catch(() => [])
  ]);

  const leaderboard_profit = summarizeLeaderboard(lbRows, resolved.address);
  const positions_cash_pnl = summarizePositions(positions, limit);
  const activity_hint = {
    trade_rows_first_page: Array.isArray(tradePage) ? tradePage.length : 0,
    maker_rebate_rows_first_page: Array.isArray(rebatePage) ? rebatePage.length : 0,
    pagination: 'first_page_only',
    caveat: 'Quick mode does not page through full activity history.'
  };
  const cashflow_replay = requestedMode === 'full'
    ? {
        status: 'not_implemented_in_worker_quick_release',
        next_gate: 'Run polymarket-pnl compute_precise_pnl.py for full BUY/SELL/REDEEM/MERGE/SPLIT/REBATE replay.',
        activity_types_required: ['TRADE', 'REDEEM', 'MERGE', 'SPLIT', 'MAKER_REBATE', 'REWARD', 'REFERRAL_REWARD', 'CONVERSION']
      }
    : null;
  const divergence = computeDivergence(leaderboard_profit, positions_cash_pnl);
  const action = chooseAction(divergence, {
    positions_truncated: positions_cash_pnl.positions_truncated,
    requestedMode
  });
  const generated_at = new Date().toISOString();
  const stale_after_minutes = 15;
  const stale_at = new Date(Date.parse(generated_at) + stale_after_minutes * 60_000).toISOString();
  const confidence_gaps = [
    ...(leaderboard_profit.amount_usd === null ? ['leaderboard_profit_missing'] : []),
    ...(positions_cash_pnl.positions_sampled === 0 ? ['positions_cash_pnl_missing'] : []),
    ...(positions_cash_pnl.positions_truncated ? ['positions_page_may_be_truncated'] : []),
    'cashflow_replay_not_run_in_quick_mode',
    'activity_first_page_only'
  ];

  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: requestedMode === 'full' ? 'live_full_stub' : 'live_quick',
    generated_at,
    input: {
      query: raw,
      address: resolved.address,
      resolved_via: resolved.resolved_via,
      mode: requestedMode,
      positions_limit: limit
    },
    layers: {
      leaderboard_profit,
      positions_cash_pnl,
      cashflow_replay
    },
    leaderboard_profit,
    positions_cash_pnl,
    activity_hint,
    divergence_verdict: divergence.verdict,
    divergence,
    action,
    buyer_summary_zh: buildBuyerSummaryZh({ resolved, leaderboard_profit, positions_cash_pnl, divergence, action }),
    buyer_summary_en: buildBuyerSummaryEn({ resolved, leaderboard_profit, positions_cash_pnl, divergence, action }),
    value_loop: {
      why_pay_again: 'Wallet PnL, open positions and rebates move; re-run before copying a trader or trusting a PnL claim.',
      stale_after_minutes,
      stale_at,
      best_used_in: 'copy_trading_due_diligence_or_claim_verification',
      not_a_subscription_to: 'live_wallet_alerts_or_full_cashflow_replay',
      paid_value_tier: 'A_tier_audit',
      fulfillment: requestedMode === 'full' ? 'quick_audit_plus_full_replay_stub' : 'quick_audit_on_demand',
      operator_always_online: false,
      llm_api_key_required: false
    },
    confidence_gaps,
    caveats: [
      ...STANDARD_CAVEATS,
      ...(requestedMode === 'full'
        ? ['Full mode is intentionally stubbed in the Worker until cashflow replay pagination is ported.']
        : [])
    ],
    next_gate: requestedMode === 'full'
      ? 'Run polymarket-pnl full cashflow replay outside Worker before relying on audit-grade PnL.'
      : 'If divergence matters, run full polymarket-pnl cashflow replay.',
    source: {
      provider: 'polymarket_public_api',
      oss_lineage: 'polymarket-toolkit fee-inclusive-pnl.md + pm pnl-check + polymarket-pnl skill',
      layers: ['lb-api /profit window=all', 'data-api /positions cashPnl', 'data-api /activity first page hints'],
      audit_threshold_usd: AUDIT_PASS_DELTA_USD
    }
  };
}

export function buildPmPnlAuditFallback(input = {}) {
  const generated_at = new Date().toISOString();
  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'public_safe_demo',
    generated_at,
    input: {
      query: input.address ?? input.wallet ?? input.username ?? input.query ?? null,
      address: null,
      resolved_via: null,
      mode: normalizeMode(input.mode)
    },
    layers: {
      leaderboard_profit: { amount_usd: null, source: 'lb-api /profit window=all', row_found: false },
      positions_cash_pnl: { total_cash_pnl_usd: null, positions_sampled: 0, positions_truncated: false },
      cashflow_replay: null
    },
    divergence_verdict: 'unknown',
    action: 'verify_manually',
    buyer_summary_zh: 'PnL 审计回退：实时公开 API 不可用，无法判断；请手动核对。',
    buyer_summary_en: 'PnL audit fallback: live public APIs unavailable; verify manually.',
    confidence_gaps: ['live_data_unavailable'],
    caveats: [...STANDARD_CAVEATS, 'Demo fallback.'],
    next_gate: 'Retry live quick audit, then run full polymarket-pnl cashflow replay if needed.',
    source: { provider: 'static_fallback' }
  };
}

async function resolveAddress(fetchImpl, raw) {
  if (EVM.test(raw)) {
    return { address: raw.toLowerCase(), resolved_via: 'evm_address', display_name: null };
  }
  const needle = raw.toLowerCase();
  for (let page = 0; page < 3; page++) {
    const rows = await fetchJson(
      fetchImpl,
      `${LB_BASE}/profit?window=all&limit=500&offset=${page * 500}`
    ).catch(() => []);
    if (!Array.isArray(rows) || !rows.length) break;
    for (const row of rows) {
      const name = String(row.name ?? '').toLowerCase();
      const pseudonym = String(row.pseudonym ?? '').toLowerCase();
      if (name === needle || pseudonym === needle) {
        const address = String(row.proxyWallet ?? '').toLowerCase();
        return {
          address: EVM.test(address) ? address : null,
          resolved_via: 'leaderboard_username',
          display_name: row.name ?? row.pseudonym ?? raw
        };
      }
    }
    if (rows.length < 500) break;
  }
  return { address: null, resolved_via: null, display_name: null };
}

function summarizeLeaderboard(rows, address) {
  const row = Array.isArray(rows) ? rows[0] : null;
  return {
    amount_usd: row?.amount != null ? round2(Number(row.amount)) : null,
    name: row?.name ?? row?.pseudonym ?? null,
    proxy_wallet: row?.proxyWallet ?? address,
    window: 'all',
    source: 'lb-api.polymarket.com/profit?window=all',
    row_found: Boolean(row)
  };
}

function summarizePositions(rows, limit) {
  const list = Array.isArray(rows) ? rows : [];
  const normalized = list.map((p) => ({
    title: p.title ?? p.slug ?? null,
    outcome: p.outcome ?? null,
    size: toNumber(p.size),
    avg_price: toNumber(p.avgPrice),
    cash_pnl: toNumber(p.cashPnl),
    current_value: toNumber(p.currentValue),
    condition_id: p.conditionId ?? null
  }));
  const total = normalized.reduce((sum, p) => sum + (p.cash_pnl || 0), 0);
  return {
    total_cash_pnl_usd: round2(total),
    positions_sampled: normalized.length,
    open_positions_sampled: normalized.filter((p) => Math.abs(p.size || 0) > 0).length,
    positions_limit: limit,
    positions_truncated: normalized.length >= limit,
    source: 'data-api.polymarket.com/positions cashPnl',
    sample: normalized.slice(0, 10)
  };
}

function computeDivergence(leaderboard, positions) {
  const lb = leaderboard.amount_usd;
  const pos = positions.total_cash_pnl_usd;
  if (!Number.isFinite(lb) || !Number.isFinite(pos)) {
    return {
      verdict: 'unknown',
      delta_usd: null,
      abs_delta_usd: null,
      threshold_usd: AUDIT_PASS_DELTA_USD,
      interpretation: 'Missing LB or position cashPnL layer.'
    };
  }
  const delta = round2(lb - pos);
  const absDelta = Math.abs(delta);
  let verdict = 'aligned';
  if (absDelta > AUDIT_PASS_DELTA_USD) {
    verdict = delta > 0 ? 'lb_optimistic' : 'replay_higher';
  }
  return {
    verdict,
    delta_usd: delta,
    abs_delta_usd: round2(absDelta),
    threshold_usd: AUDIT_PASS_DELTA_USD,
    interpretation: verdict === 'aligned'
      ? 'LB all-time and sampled position cashPnL are within the quick-audit threshold.'
      : (verdict === 'lb_optimistic'
        ? 'Leaderboard profit is materially higher than sampled position cashPnL; do not trust headline PnL without full replay.'
        : 'Position cashPnL proxy is materially higher than LB; full replay may exceed the headline or LB window may differ.')
  };
}

function chooseAction(divergence, { positions_truncated, requestedMode }) {
  if (requestedMode === 'full') return 'verify_manually';
  if (divergence.verdict === 'aligned' && !positions_truncated) return 'trust_for_copy';
  if (divergence.verdict === 'lb_optimistic' && (divergence.abs_delta_usd ?? 0) >= 100) return 'distrust_claims';
  return 'verify_manually';
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

function normalizeMode(value) {
  const raw = String(value ?? 'quick').trim().toLowerCase();
  return raw === 'full' ? 'full' : 'quick';
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function buildBuyerSummaryZh({ resolved, leaderboard_profit, positions_cash_pnl, divergence, action }) {
  const who = leaderboard_profit.name || resolved.display_name || shorten(resolved.address);
  const lb = leaderboard_profit.amount_usd == null ? 'LB 无记录' : `LB all-time ${formatUsd(leaderboard_profit.amount_usd)}`;
  const pos = positions_cash_pnl.total_cash_pnl_usd == null ? '持仓 PnL 无记录' : `持仓 cashPnL ${formatUsd(positions_cash_pnl.total_cash_pnl_usd)}`;
  return `${who}：${lb}；${pos}；verdict=${divergence.verdict}，action=${action}。quick 不是完整流水审计。`;
}

function buildBuyerSummaryEn({ resolved, leaderboard_profit, positions_cash_pnl, divergence, action }) {
  const who = leaderboard_profit.name || resolved.display_name || shorten(resolved.address);
  const lb = leaderboard_profit.amount_usd == null ? 'LB missing' : `LB all-time ${formatUsd(leaderboard_profit.amount_usd)}`;
  const pos = positions_cash_pnl.total_cash_pnl_usd == null ? 'position cashPnL missing' : `position cashPnL ${formatUsd(positions_cash_pnl.total_cash_pnl_usd)}`;
  return `${who}: ${lb}; ${pos}; verdict=${divergence.verdict}, action=${action}. Quick mode is not full cashflow replay.`;
}

function formatUsd(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 'n/a';
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
}

function shorten(address) {
  const value = String(address ?? '');
  if (!value.startsWith('0x') || value.length < 12) return value || 'wallet';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}
