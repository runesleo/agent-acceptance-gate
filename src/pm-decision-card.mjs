// PM Decision Card — paid trading-loop SKU.
// Composes trade-preflight (+ optional event readout snippet) into one replayable
// gate: skip / watch / eligible_for_manual_review. Not a buy tip, no orders.

import {
  assessPmTradePreflightLive,
  buildPmTradePreflightFallback
} from './pm-trade-preflight.mjs';
import {
  assessPmEventReadoutLive,
  buildPmEventReadoutFallback
} from './pm-event-readout.mjs';
import { resolveMarketRef } from './pm-gamma-market.mjs';

const SERVICE_ID = 'pm_decision_card';

const STANDARD_CAVEATS = [
  'Decision card is a mechanical + event-context gate only. Not investment advice.',
  'eligible_for_manual_review ≠ buy tip; no order routing, no wallet custody.',
  'Fair band / max_entry are heuristic buffers around market price — not an external model fair value.'
];

/**
 * @param {object} input
 * @param {string} [input.market_url]
 * @param {string} [input.slug]
 * @param {string} [input.condition_id]
 * @param {string} [input.side]
 * @param {number} [input.size_usd]
 * @param {boolean} [input.include_event_context=true]
 */
export async function assessPmDecisionCardLive(input = {}, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const includeEvent = input.include_event_context !== false;
  const ref = resolveMarketRef(input);
  if (!ref.slug && !ref.condition_id) {
    throw new Error('pm-decision-card requires market_url, slug, or condition_id');
  }

  const [preflightResult, readoutResult] = await Promise.allSettled([
    assessPmTradePreflightLive(input, { fetchImpl }),
    includeEvent
      ? assessPmEventReadoutLive({
          ...input,
          include_matrix: input.include_matrix !== false,
          enrich_category: input.enrich_category !== false
        }, { fetchImpl })
      : Promise.resolve(null)
  ]);

  if (preflightResult.status === 'rejected') {
    throw preflightResult.reason;
  }
  const preflight = preflightResult.value;
  const readout = readoutResult.status === 'fulfilled' ? readoutResult.value : null;

  const decision = composeDecision(preflight, readout);
  const value_loop = {
    why_pay_again: 'Market price, spread, volume and event matrix change; re-run before each order attempt.',
    stale_after_minutes: 5,
    best_used_in: 'agent_trading_loop_before_manual_or_automated_order',
    not_a_subscription_to: 'price_alerts_or_auto_execution',
    paid_value_tier: 'A_repeat_trading_loop',
    fulfillment: 'edge_on_demand_no_llm',
    operator_always_online: false,
    llm_api_key_required: false
  };

  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'live',
    generated_at: new Date().toISOString(),
    input: {
      market_url: input.market_url ?? null,
      condition_id: ref.condition_id,
      slug: ref.slug,
      side: preflight.input?.side,
      size_usd: preflight.input?.size_usd ?? null,
      include_event_context: includeEvent
    },
    action: decision.action,
    confidence: decision.confidence,
    buyer_summary_zh: decision.buyer_summary_zh,
    value_loop,
    agent_loop: {
      step_1: 'Call this card with market ref + side (+ size_usd)',
      step_2: 'If skip → stop; if watch → shrink/wait; if eligible_for_manual_review → human risk check',
      step_3: 'Only then place order elsewhere (this ASP never routes orders)',
      step_4: 'Re-run if > stale_after_minutes or market moved'
    },
    decision_card: {
      ...preflight.decision_card_lite,
      action: decision.action,
      confidence: decision.confidence,
      reasons: decision.reasons,
      risk_flags: decision.risk_flags,
      next_actions: decision.next_actions,
      event_context: decision.event_context
    },
    preflight: {
      action: preflight.action,
      confidence: preflight.confidence,
      side_price: preflight.side_price,
      reasons: preflight.reasons,
      risk_flags: preflight.risk_flags,
      market: preflight.market
    },
    event_readout: readout
      ? {
          category: readout.category,
          category_depth: readout.category_depth,
          tradability: readout.tradability,
          tradability_reasons: readout.tradability_reasons,
          matrix_status: readout.matrix_status,
          base_case: readout.base_case,
          category_plugin_hint: readout.category_plugin
            ? {
                category: readout.category_plugin.category,
                default_action_hint: readout.category_plugin.default_action_hint,
                central_thesis: readout.category_plugin.central_thesis
                  || readout.category_plugin.market_implied_shape?.central_thesis
                  || null
              }
            : null
        }
      : null,
    caveats: [
      ...STANDARD_CAVEATS,
      ...(preflight.caveats || []).slice(0, 3),
      ...(readoutResult.status === 'rejected'
        ? [`Event context unavailable: ${readoutResult.reason?.message || readoutResult.reason}`]
        : [])
    ],
    next_gate: 'Human_or_hard_risk_limit_before_any_order',
    source: {
      method: 'compose_pm_trade_preflight_plus_optional_pm_event_readout',
      paid_value_tier: 'A_repeat_trading_loop'
    }
  };
}

export function buildPmDecisionCardFallback(input = {}) {
  const preflight = buildPmTradePreflightFallback(input);
  return {
    schema_version: '0.1',
    service_id: SERVICE_ID,
    mode: 'public_safe_demo',
    generated_at: new Date().toISOString(),
    input: preflight.input,
    action: 'watch',
    confidence: 0.4,
    buyer_summary_zh: '演示回退：决策卡不可用，默认 watch。',
    value_loop: {
      why_pay_again: 'Live market state changes; re-run before each order attempt.',
      stale_after_minutes: 5,
      best_used_in: 'agent_trading_loop_before_manual_or_automated_order',
      not_a_subscription_to: 'price_alerts_or_auto_execution'
    },
    decision_card: {
      ...preflight.decision_card_lite,
      action: 'watch',
      next_actions: ['retry_with_live_market_ref']
    },
    preflight,
    event_readout: null,
    caveats: [...STANDARD_CAVEATS, 'Demo fallback.'],
    next_gate: 'Human_or_hard_risk_limit_before_any_order',
    source: { method: 'static_fallback' }
  };
}

function composeDecision(preflight, readout) {
  let action = mapPreflightAction(preflight.action);
  const reasons = [...(preflight.reasons || [])];
  const risk_flags = [...(preflight.risk_flags || [])];
  let confidence = Number(preflight.confidence) || 0.5;

  const event_context = readout
    ? {
        category: readout.category,
        tradability: readout.tradability,
        matrix_status: readout.matrix_status,
        plugin_action_hint: readout.category_plugin?.default_action_hint ?? null
      }
    : null;

  if (readout) {
    if (readout.tradability === 'weak' || readout.tradability === 'low') {
      if (action === 'eligible_for_manual_review') action = 'watch';
      risk_flags.push('event_tradability_weak');
      reasons.push(`Event readout tradability=${readout.tradability}; tighten to watch.`);
      confidence -= 0.08;
    }
    const hint = readout.category_plugin?.default_action_hint;
    if (hint === 'no_trade' || hint === 'no_trade_until_source_and_ladder_ok') {
      action = action === 'skip' ? 'skip' : 'watch';
      risk_flags.push('category_plugin_no_trade_hint');
      reasons.push(`Category plugin hint=${hint}.`);
      confidence -= 0.1;
    }
    if (readout.matrix_status === 'incomplete') {
      risk_flags.push('event_matrix_incomplete');
      reasons.push('Same-event matrix incomplete — compare expressions carefully.');
      confidence -= 0.05;
    }
  }

  confidence = Math.max(0.35, Math.min(0.9, Math.round(confidence * 100) / 100));

  const next_actions = [];
  if (action === 'skip') {
    next_actions.push('do_not_enter', 'pick_another_market_or_wait_for_reopen');
  } else if (action === 'watch') {
    next_actions.push('reduce_size_or_wait', 'recheck_after_liquidity_improves', 'optional_run_category_match_card');
  } else {
    next_actions.push('manual_risk_check', 'optional_compare_adjacent_ladder', 'only_then_consider_order');
  }

  const buyer_summary_zh = buildBuyerSummaryZh(action, preflight, readout, confidence);

  return {
    action,
    confidence,
    reasons,
    risk_flags: [...new Set(risk_flags)],
    next_actions,
    event_context,
    buyer_summary_zh
  };
}

function mapPreflightAction(action) {
  if (action === 'skip') return 'skip';
  if (action === 'watch') return 'watch';
  if (action === 'eligible') return 'eligible_for_manual_review';
  return 'watch';
}

function buildBuyerSummaryZh(action, preflight, readout, confidence) {
  const actionZh = {
    skip: '跳过',
    watch: '先观望',
    eligible_for_manual_review: '机械检查过关，仍需人工风控'
  }[action] || action;
  const price = preflight.side_price;
  const cat = readout?.category ? `；事件品类 ${readout.category}/${readout.tradability}` : '';
  return `决策卡：${actionZh}（置信 ${confidence}）。侧价 ${price ?? 'n/a'}${cat}。eligible≠买点；下单前再跑一次。`;
}
