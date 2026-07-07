// Token DD Verdict (token_dd_verdict) — Quick-tier rule-based research gate.
// Maps asset-dd participation buckets to a compact API verdict. Not LLM judging;
// optional DexScreener public lookup for EVM contract addresses only.

const SERVICE_ID = 'token_dd_verdict';
const DEXSCREENER_BASE = 'https://api.dexscreener.com/latest/dex/tokens';
const FETCH_TIMEOUT_MS = 8000;

const REFERRAL_PATTERNS = [
  /\brise\.rich\/ref\//i,
  /\bref=[\w-]{4,}/i,
  /\baffiliate\b/i,
  /\binvite\.code\b/i,
  /\bairdrop\b.*\bclaim\b/i
];

const EVM_ADDRESS = /\b(0x[a-fA-F0-9]{40})\b/;
const TICKER_ONLY = /^[A-Za-z][A-Za-z0-9]{1,14}$/;

const STANDARD_CAVEATS = [
  'Rule-based quick research gate only. Not investment advice, not a security audit, not LLM-generated research.',
  'No wallet custody, no trade execution, no order routing.',
  'Full institutional DD (asset-dd Standard/Full) requires human or escrow review; this endpoint is Quick tier only.'
];

/**
 * Live quick verdict. Throws when DexScreener is required but unreachable for a
 * contract-only input with no other anchors.
 */
export async function assessTokenDdVerdictLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const raw = String(input.asset ?? input.token ?? input.query ?? '').trim();
  if (!raw) {
    throw new Error('asset (ticker, contract address, or URL) is required');
  }

  const parsed = parseAssetInput(raw);
  const pillars = buildPillarBaseline();
  const hardStops = [];
  const reasons = [];

  if (parsed.referral_risk) {
    applyPillar(pillars, 'referral_and_promo_risk', 'fail', 'Referral or promo wrapper detected before canonical asset id.');
    hardStops.push('referral_or_promo_wrapper');
    reasons.push('Input looks like a referral/promo link without a reliable tradable identifier.');
  }

  if (!parsed.canonical_id) {
    applyPillar(pillars, 'identifier_clarity', 'fail', 'No canonical ticker or on-chain identifier extracted.');
    hardStops.push('missing_canonical_identifier');
    reasons.push('Could not extract a ticker or contract/mint address to research.');
  } else {
    applyPillar(pillars, 'identifier_clarity', 'pass', `Canonical id: ${parsed.canonical_id} (${parsed.id_type}).`);
  }

  let dexContext = null;
  if (parsed.evm_contract) {
    dexContext = await fetchDexScreenerPairs(fetchImpl, parsed.evm_contract).catch(() => null);
    if (!dexContext) {
      applyPillar(pillars, 'liquidity_and_market_presence', 'warn', 'DexScreener lookup failed or returned no pairs.');
      reasons.push('On-chain liquidity could not be verified from public DEX data.');
    } else if (!dexContext.pairs.length) {
      applyPillar(pillars, 'liquidity_and_market_presence', 'fail', 'No DEX pairs found for contract.');
      hardStops.push('no_public_dex_liquidity');
      reasons.push('No public DEX liquidity pairs found for this contract.');
    } else {
      const top = dexContext.pairs[0];
      applyPillar(
        pillars,
        'liquidity_and_market_presence',
        top.liquidity_usd >= 50_000 ? 'pass' : 'warn',
        `Top pair liquidity ~$${Math.round(top.liquidity_usd).toLocaleString('en-US')} on ${top.dexId}/${top.chainId}.`
      );
      if (top.liquidity_usd < 10_000) {
        hardStops.push('very_low_liquidity');
        reasons.push('Top DEX pair liquidity is very low (<$10k).');
      }
    }
  } else if (parsed.id_type === 'ticker') {
    applyPillar(pillars, 'liquidity_and_market_presence', 'neutral', 'Ticker-only quick scan; no contract-level liquidity check in Quick tier.');
    reasons.push('Major ticker symbol without contract — use contract address for deeper on-chain checks.');
  } else {
    applyPillar(pillars, 'liquidity_and_market_presence', 'neutral', 'Non-EVM or unresolved identifier; Quick tier skips automated DEX scan.');
  }

  applyPillar(pillars, 'security_heuristics', parsed.evm_contract ? 'warn' : 'neutral',
    parsed.evm_contract
      ? 'Quick tier does not run honeypot/certification scans; contract presence only.'
      : 'No contract-level security scan in Quick tier.');

  applyPillar(pillars, 'narrative_hype_risk',
    parsed.referral_risk ? 'fail' : (/\b(moon|100x|gem|alpha group)\b/i.test(raw) ? 'warn' : 'pass'),
    parsed.referral_risk ? 'Promo/referral language in input.' : 'No obvious hype phrases in raw input.');

  const score = scoreFromPillars(pillars, hardStops);
  const verdict_bucket = bucketFromScore(score, hardStops);

  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'live',
    tier: 'quick',
    generated_at: new Date().toISOString(),
    input: {
      asset: raw,
      canonical_id: parsed.canonical_id,
      id_type: parsed.id_type
    },
    verdict_bucket,
    score_0_100: score,
    pillars: pillarsToArray(pillars),
    hard_stops: hardStops,
    reasons,
    dex_scan: dexContext
      ? {
          pairs_found: dexContext.pairs.length,
          top_pair: dexContext.pairs[0] ?? null
        }
      : null,
    caveats: [...STANDARD_CAVEATS],
    next_gate: 'OKX_ASP_listing_changes_require_Leo_approval',
    source: {
      method: 'rule_based_quick_dd',
      dex_provider: parsed.evm_contract ? 'dexscreener_public_api' : null
    }
  };
}

export function buildTokenDdVerdictFallback(input = {}) {
  const raw = String(input?.asset ?? input?.token ?? '0x000000000000000000000000000000000000dead').trim();
  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'public_safe_demo',
    tier: 'quick',
    generated_at: new Date().toISOString(),
    input: { asset: raw, canonical_id: null, id_type: 'unknown' },
    verdict_bucket: 'watch_only',
    score_0_100: 45,
    pillars: pillarsToArray(buildPillarBaseline()),
    hard_stops: ['live_data_unavailable'],
    reasons: ['Live token lookup unavailable; serving static demo verdict only.'],
    dex_scan: null,
    caveats: [
      ...STANDARD_CAVEATS,
      'Demo mode: do not use for trading decisions.'
    ],
    next_gate: 'OKX_ASP_listing_changes_require_Leo_approval',
    source: { method: 'static_fallback' }
  };
}

function parseAssetInput(raw) {
  const referral_risk = REFERRAL_PATTERNS.some((pattern) => pattern.test(raw));
  const evmMatch = raw.match(EVM_ADDRESS);
  if (evmMatch) {
    return {
      referral_risk,
      canonical_id: evmMatch[1].toLowerCase(),
      id_type: 'evm_contract',
      evm_contract: evmMatch[1].toLowerCase()
    };
  }

  try {
    const url = new URL(raw);
    const path = `${url.pathname}${url.search}`;
    if (REFERRAL_PATTERNS.some((pattern) => pattern.test(path))) {
      return { referral_risk: true, canonical_id: null, id_type: 'unknown', evm_contract: null };
    }
    const fromPath = path.match(EVM_ADDRESS);
    if (fromPath) {
      return {
        referral_risk,
        canonical_id: fromPath[1].toLowerCase(),
        id_type: 'evm_contract',
        evm_contract: fromPath[1].toLowerCase()
      };
    }
  } catch {
    // not a URL
  }

  const ticker = raw.replace(/[^A-Za-z0-9]/g, '');
  if (TICKER_ONLY.test(ticker)) {
    return {
      referral_risk,
      canonical_id: ticker.toUpperCase(),
      id_type: 'ticker',
      evm_contract: null
    };
  }

  return { referral_risk, canonical_id: null, id_type: 'unknown', evm_contract: null };
}

function buildPillarBaseline() {
  return {
    identifier_clarity: pillar('identifier_clarity', 'Can we identify the tradable object?'),
    referral_and_promo_risk: pillar('referral_and_promo_risk', 'Referral/promo wrapper risk'),
    liquidity_and_market_presence: pillar('liquidity_and_market_presence', 'Public liquidity / market presence'),
    security_heuristics: pillar('security_heuristics', 'Automated security scan depth'),
    narrative_hype_risk: pillar('narrative_hype_risk', 'Hype / social pressure signals in input')
  };
}

function pillar(id, label) {
  return { id, label, status: 'neutral', note: 'Pending evaluation.' };
}

function applyPillar(pillars, id, status, note) {
  if (!pillars[id]) return;
  pillars[id].status = status;
  pillars[id].note = note;
}

function pillarsToArray(pillars) {
  return Object.values(pillars).map((entry) => ({
    id: entry.id,
    label: entry.label,
    status: mapStatusEmoji(entry.status),
    note: entry.note
  }));
}

function mapStatusEmoji(status) {
  if (status === 'pass') return '✅';
  if (status === 'warn' || status === 'neutral') return '⚠️';
  if (status === 'fail') return '➖';
  return '⚠️';
}

function scoreFromPillars(pillars, hardStops) {
  if (hardStops.includes('referral_or_promo_wrapper') || hardStops.includes('missing_canonical_identifier')) {
    return 15;
  }
  let score = 55;
  for (const entry of Object.values(pillars)) {
    if (entry.status === 'pass') score += 8;
    if (entry.status === 'warn' || entry.status === 'neutral') score += 2;
    if (entry.status === 'fail') score -= 18;
  }
  if (hardStops.includes('no_public_dex_liquidity')) score = Math.min(score, 25);
  if (hardStops.includes('very_low_liquidity')) score = Math.min(score, 35);
  return clamp(Math.round(score), 0, 100);
}

function bucketFromScore(score, hardStops) {
  if (hardStops.includes('referral_or_promo_wrapper') || hardStops.includes('missing_canonical_identifier')) {
    return 'avoid';
  }
  if (hardStops.includes('no_public_dex_liquidity') || score < 30) return 'avoid';
  if (score < 45) return 'watch_only';
  if (score < 60) return 'research_position';
  if (score < 75) return 'tiny_speculative';
  return 'conviction';
}

async function fetchDexScreenerPairs(fetchImpl, contract) {
  const payload = await fetchJson(fetchImpl, `${DEXSCREENER_BASE}/${contract}`);
  const pairs = (Array.isArray(payload?.pairs) ? payload.pairs : [])
    .map((pair) => ({
      chainId: pair.chainId ?? null,
      dexId: pair.dexId ?? null,
      pairAddress: pair.pairAddress ?? null,
      liquidity_usd: toNumber(pair?.liquidity?.usd),
      volume_h24: toNumber(pair?.volume?.h24),
      priceUsd: toNumber(pair?.priceUsd)
    }))
    .filter((pair) => pair.liquidity_usd > 0)
    .sort((a, b) => b.liquidity_usd - a.liquidity_usd);
  return { pairs };
}

async function fetchJson(fetchImpl, url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' }
    });
    if (!response.ok) {
      throw new Error(`Upstream ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
