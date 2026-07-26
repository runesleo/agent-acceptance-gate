import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';
import { assessTokenDdVerdictLive } from '../src/token-dd-verdict.mjs';
import { assessPmTradePreflightLive } from '../src/pm-trade-preflight.mjs';
import { assessPmEventReadoutLive } from '../src/pm-event-readout.mjs';
import { assessContentVerifyClaims } from '../src/content-verify-claims.mjs';

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
  assert.notEqual(ticker.verdict_bucket, 'conviction');
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
  assert.equal(preflight.action, 'eligible');
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

// ---- unit: pm-event-readout (L0 matrix + honest tradability) ---------------

{
  const marketsBySlug = {
    'demo-readout': [{
      conditionId: '0xreadout',
      slug: 'demo-readout',
      question: 'Will demo happen by July?',
      active: true,
      closed: false,
      volume24hr: 80000,
      oneDayPriceChange: 0.01,
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.12","0.88"]',
      bestBid: 0.11,
      bestAsk: 0.13,
      endDate: '2026-12-31',
      events: [{ id: '1', slug: 'demo-event', title: 'Demo Event' }]
    }],
    'fed-hold': [{
      conditionId: '0xfedhold',
      slug: 'fed-hold',
      question: 'Will there be no change in Fed interest rates after the July 2026 meeting?',
      groupItemTitle: 'No change',
      active: true,
      closed: false,
      volume24hr: 700000,
      oneDayPriceChange: 0.055,
      outcomes: '["Yes","No"]',
      outcomePrices: '["0.82","0.18"]',
      bestBid: 0.81,
      bestAsk: 0.82,
      endDate: '2026-07-29T00:00:00Z',
      events: [{ id: '287395', slug: 'fed-decision-in-july-181', title: 'Fed Decision in July?' }]
    }]
  };

  const fedEvent = [{
    id: '287395',
    slug: 'fed-decision-in-july-181',
    title: 'Fed Decision in July?',
    markets: [
      {
        conditionId: '0xfedhold',
        slug: 'fed-hold',
        question: 'Will there be no change in Fed interest rates after the July 2026 meeting?',
        groupItemTitle: 'No change',
        active: true,
        closed: false,
        volume24hr: 700000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.82","0.18"]',
        bestBid: 0.81,
        bestAsk: 0.82
      },
      {
        conditionId: '0xfedhike',
        slug: 'fed-hike-25',
        question: 'Will the Fed increase interest rates by 25 bps after the July 2026 meeting?',
        groupItemTitle: '25 bps increase',
        active: true,
        closed: false,
        volume24hr: 400000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.19","0.81"]',
        bestBid: 0.19,
        bestAsk: 0.192
      },
      {
        conditionId: '0xfedcut',
        slug: 'fed-cut-25',
        question: 'Will the Fed decrease interest rates by 25 bps after the July 2026 meeting?',
        groupItemTitle: '25 bps decrease',
        active: true,
        closed: false,
        volume24hr: 200000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.006","0.994"]',
        bestBid: 0.005,
        bestAsk: 0.006
      }
    ]
  }];

  const mockGamma = async (url) => {
    const u = String(url);
    if (u.includes('/events?slug=fed-decision-in-july-181')) {
      return new Response(JSON.stringify(fedEvent), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?slug=demo-event')) {
      return new Response(JSON.stringify([{
        slug: 'demo-event',
        title: 'Demo Event',
        markets: marketsBySlug['demo-readout']
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/markets?slug=fed-hold')) {
      return new Response(JSON.stringify(marketsBySlug['fed-hold']), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/markets?slug=demo-readout')) {
      return new Response(JSON.stringify(marketsBySlug['demo-readout']), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${u}`);
  };

  const readout = await assessPmEventReadoutLive(
    { slug: 'demo-readout' },
    { fetchImpl: mockGamma }
  );
  assert.equal(readout.service_id, 'pm_event_readout');
  assert.equal(readout.schema_version, '0.2');
  assert.ok(['weak', 'low', 'medium', 'high'].includes(readout.tradability));
  assert.equal(readout.next_decision_card_needed, 'yes');
  assert.ok(Array.isArray(readout.event_matrix));
  assert.ok(readout.event_matrix.length >= 1);

  const fed = await assessPmEventReadoutLive(
    { slug: 'fed-hold' },
    {
      fetchImpl: mockGamma,
      externalAnchors: [{
        id: 'cme_fedwatch_style',
        status: 'ok',
        hold_prob: 0.70,
        agreement: 'disagree',
        detail: 'test inject'
      }]
    }
  );
  assert.equal(fed.category, 'macro_fed');
  assert.equal(fed.matrix_status, 'complete');
  assert.equal(fed.related_market_count, 3);
  assert.ok(fed.event_matrix.some((row) => row.group_item_title === '25 bps increase'));
  assert.notEqual(fed.tradability, 'high'); // anchor conflict must cap
  assert.ok(fed.tradability_reasons.includes('external_anchor_conflict'));
  assert.ok(!String(fed.what_may_not_be_priced || '').includes('Mid-range price'));
  assert.ok(String(fed.what_may_not_be_priced || '').includes('Cross-venue gap')
    || String(fed.what_is_already_priced || '').includes('majority-priced'));

  // Musk L1 plugin: ladder distribution + count mapping
  const muskMarkets = [{
    conditionId: '0xmusk160',
    slug: 'elon-musk-of-tweets-july-3-july-10-160-179',
    question: 'Will Elon Musk post 160-179 tweets from July 3 to July 10, 2026?',
    groupItemTitle: '160-179',
    active: true,
    closed: false,
    volume24hr: 120000,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.48","0.52"]',
    bestBid: 0.47,
    bestAsk: 0.49,
    endDate: '2026-07-10T00:00:00Z',
    events: [{ id: 'm1', slug: 'elon-musk-of-tweets-july-3-july-10', title: 'Elon Musk # tweets July 3 - July 10, 2026?' }]
  }];
  const muskEvent = [{
    slug: 'elon-musk-of-tweets-july-3-july-10',
    title: 'Elon Musk # tweets July 3 - July 10, 2026?',
    markets: [
      { ...muskMarkets[0] },
      {
        conditionId: '0xmusk180',
        slug: 'elon-musk-of-tweets-july-3-july-10-180-199',
        question: '180-199 tweets?',
        groupItemTitle: '180-199',
        active: true,
        closed: false,
        volume24hr: 100000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.27","0.73"]',
        bestBid: 0.26,
        bestAsk: 0.28
      },
      {
        conditionId: '0xmusk140',
        slug: 'elon-musk-of-tweets-july-3-july-10-140-159',
        question: '140-159 tweets?',
        groupItemTitle: '140-159',
        active: true,
        closed: false,
        volume24hr: 90000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.11","0.89"]',
        bestBid: 0.10,
        bestAsk: 0.12
      }
    ]
  }];
  const mockMusk = async (url) => {
    const u = String(url);
    if (u.includes('/events?slug=elon-musk-of-tweets-july-3-july-10')) {
      return new Response(JSON.stringify(muskEvent), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/markets?slug=elon-musk-of-tweets-july-3-july-10-160-179')) {
      return new Response(JSON.stringify(muskMarkets), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${u}`);
  };
  const musk = await assessPmEventReadoutLive(
    {
      slug: 'elon-musk-of-tweets-july-3-july-10-160-179',
      musk: { current_count: 165, hours_left: 12, snapshot_time: '2026-07-09T12:00:00Z' }
    },
    { fetchImpl: mockMusk }
  );
  assert.equal(musk.category, 'musk');
  assert.equal(musk.category_depth, 'enriched');
  assert.ok(musk.category_plugin);
  assert.equal(musk.category_plugin.modal_bucket.bucket, '160-179');
  assert.equal(musk.category_plugin.count_vs_ladder.status, 'mapped');
  assert.ok(musk.category_plugin.full_bucket_surface.length >= 3);
  assert.ok(musk.category_plugin.batch2_public);
  assert.equal(musk.category_plugin.batch2_public.category, 'musk');
  assert.equal(musk.category_plugin.batch2_public.fixture_status, 'ok');
  assert.equal(musk.category_plugin.batch2_public.matrix_status, 'complete');
  assert.ok(musk.category_plugin.batch2_public.market_implied_shape);
  assert.ok(musk.category_plugin.batch2_public.thesis);
  assert.equal(musk.category_plugin.batch2_public.best_expression.market, 'elon-musk-of-tweets-july-3-july-10-160-179');
  assert.ok(['watch', 'skip', 'no_trade'].includes(musk.category_plugin.batch2_public.action));
  assert.equal(typeof musk.category_plugin.batch2_public.confidence, 'number');
  assert.ok(Array.isArray(musk.category_plugin.batch2_public.risk_flags));
  assert.ok(musk.category_plugin.batch2_public.postmortem_key);
  assert.ok(!('bankroll_pct' in musk.category_plugin.batch2_public));
  assert.ok(!('leo_private' in musk));

  // Without count: honest freshness + tradability cap + Batch2 action=skip
  const muskNoCount = await assessPmEventReadoutLive(
    { slug: 'elon-musk-of-tweets-july-3-july-10-160-179' },
    { fetchImpl: mockMusk }
  );
  assert.equal(muskNoCount.category_plugin.count_source_freshness.status, 'missing');
  assert.equal(muskNoCount.category_plugin.count_vs_ladder.status, 'no_count');
  assert.equal(muskNoCount.category_plugin.tradability_cap, 'medium');
  assert.notEqual(muskNoCount.tradability, 'high');
  assert.ok(muskNoCount.tradability_reasons.includes('musk_count_snapshot_missing'));
  assert.equal(muskNoCount.category_plugin.batch2_public.fixture_status, 'failed_or_unverified');
  assert.equal(muskNoCount.category_plugin.batch2_public.action, 'skip');
  assert.ok(muskNoCount.category_plugin.batch2_public.risk_flags.includes('count_snapshot_missing'));

  // Football L1: must merge more-markets siblings; bare ML-only = incomplete
  const fraMainMarkets = [{
    conditionId: '0xfra',
    slug: 'fifwc-fra-mar-2026-07-09-fra',
    question: 'Will France win on 2026-07-09?',
    groupItemTitle: 'France',
    sportsMarketType: 'moneyline',
    active: true,
    closed: false,
    volume24hr: 500000,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.615","0.385"]',
    bestBid: 0.61,
    bestAsk: 0.62,
    endDate: '2026-07-09T20:00:00Z',
    eventStartTime: '2026-07-09T20:00:00Z',
    events: [{ id: 'fm', slug: 'fifwc-fra-mar-2026-07-09', title: 'France vs. Morocco' }]
  }];
  const fraMainEvent = [{
    id: 'parent-fra-mar',
    slug: 'fifwc-fra-mar-2026-07-09',
    title: 'France vs. Morocco',
    startTime: '2026-07-09T20:00:00Z',
    markets: [
      { ...fraMainMarkets[0] },
      {
        conditionId: '0xdraw',
        slug: 'fifwc-fra-mar-2026-07-09-draw',
        question: 'Draw (France vs. Morocco)',
        groupItemTitle: 'Draw (France vs. Morocco)',
        sportsMarketType: 'moneyline',
        active: true,
        closed: false,
        volume24hr: 200000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.245","0.755"]',
        bestBid: 0.24,
        bestAsk: 0.25
      },
      {
        conditionId: '0xmar',
        slug: 'fifwc-fra-mar-2026-07-09-mar',
        question: 'Will Morocco win?',
        groupItemTitle: 'Morocco',
        sportsMarketType: 'moneyline',
        active: true,
        closed: false,
        volume24hr: 150000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.135","0.865"]',
        bestBid: 0.13,
        bestAsk: 0.14
      }
    ]
  }];
  const fraMoreEvent = [{
    id: 'child-more',
    slug: 'fifwc-fra-mar-2026-07-09-more-markets',
    title: 'France vs. Morocco - More Markets',
    parentEventId: 'parent-fra-mar',
    markets: [
      {
        conditionId: '0xtot25',
        slug: 'fifwc-fra-mar-2026-07-09-total-2pt5',
        question: 'O/U 2.5',
        groupItemTitle: 'O/U 2.5',
        sportsMarketType: 'totals',
        active: true,
        closed: false,
        volume24hr: 100000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.475","0.525"]',
        bestBid: 0.47,
        bestAsk: 0.48
      },
      {
        conditionId: '0xtot15',
        slug: 'fifwc-fra-mar-2026-07-09-total-1pt5',
        question: 'O/U 1.5',
        groupItemTitle: 'O/U 1.5',
        sportsMarketType: 'totals',
        active: true,
        closed: false,
        volume24hr: 80000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.745","0.255"]',
        bestBid: 0.74,
        bestAsk: 0.75
      },
      {
        conditionId: '0xsp15',
        slug: 'fifwc-fra-mar-2026-07-09-spread-home-1pt5',
        question: 'France (-1.5)',
        groupItemTitle: 'France (-1.5)',
        sportsMarketType: 'spreads',
        active: true,
        closed: false,
        volume24hr: 90000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.345","0.655"]',
        bestBid: 0.34,
        bestAsk: 0.35
      },
      {
        conditionId: '0xbtts',
        slug: 'fifwc-fra-mar-2026-07-09-btts',
        question: 'Both Teams to Score',
        groupItemTitle: 'Both Teams to Score',
        sportsMarketType: 'both_teams_to_score',
        active: true,
        closed: false,
        volume24hr: 70000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.495","0.505"]',
        bestBid: 0.49,
        bestAsk: 0.50
      },
      {
        conditionId: '0xtt',
        slug: 'fifwc-fra-mar-2026-07-09-team-total-home-1pt5',
        question: 'France O/U 1.5',
        groupItemTitle: 'France O/U 1.5',
        sportsMarketType: 'soccer_team_totals',
        active: true,
        closed: false,
        volume24hr: 60000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.545","0.455"]',
        bestBid: 0.54,
        bestAsk: 0.55
      },
      {
        conditionId: '0xadv',
        slug: 'fifwc-fra-mar-2026-07-09-team-to-advance',
        question: 'Team to Advance',
        groupItemTitle: 'Team to Advance',
        sportsMarketType: 'soccer_team_to_advance',
        active: true,
        closed: false,
        volume24hr: 200000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.775","0.225"]',
        bestBid: 0.77,
        bestAsk: 0.78
      }
    ]
  }];

  const mockFootball = async (url) => {
    const u = String(url);
    if (u.includes('/markets?slug=fifwc-fra-mar-2026-07-09-fra')) {
      return new Response(JSON.stringify(fraMainMarkets), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('parent_event_id=parent-fra-mar')) {
      return new Response(JSON.stringify(fraMoreEvent), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?slug=fifwc-fra-mar-2026-07-09-more-markets')) {
      return new Response(JSON.stringify(fraMoreEvent), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?slug=fifwc-fra-mar-2026-07-09-team-to-advance')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?slug=fifwc-fra-mar-2026-07-09-exact-score')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?slug=fifwc-fra-mar-2026-07-09')) {
      return new Response(JSON.stringify(fraMainEvent), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${u}`);
  };

  const football = await assessPmEventReadoutLive(
    {
      slug: 'fifwc-fra-mar-2026-07-09-fra',
      football: {
        verified: true,
        market_fixture_match: 'yes',
        scheduled_time_utc: '2026-07-09T20:00:00Z',
        fixture_sources: ['test_fixture']
      }
    },
    { fetchImpl: mockFootball }
  );
  assert.equal(football.category, 'football');
  assert.equal(football.category_depth, 'enriched');
  assert.equal(football.matrix_status, 'complete');
  assert.ok(football.related_market_count >= 9);
  assert.ok(football.category_plugin.sibling_event_slugs.includes('fifwc-fra-mar-2026-07-09-more-markets'));
  assert.equal(football.category_plugin.fixture.fixture_status, 'ok');
  assert.ok(football.category_plugin.expression_comparison.candidates.length >= 2);
  assert.ok(football.category_plugin.market_implied_shape.central_thesis);
  assert.ok(football.category_plugin.expression_comparison.ladder_context);
  assert.ok(football.category_plugin.expression_comparison.ladder_context.totals_ladder_count >= 2);
  // Draw mass thesis must not recommend advance (coherence gate)
  assert.ok(
    football.category_plugin.market_implied_shape.state_flags.includes('draw_has_material_mass')
  );
  assert.notEqual(
    football.category_plugin.expression_comparison.recommended?.expression,
    'team_to_advance'
  );
  assert.ok(
    ['draw_90m', 'totals_pivot'].includes(
      football.category_plugin.expression_comparison.recommended?.expression
    )
  );
  assert.equal(football.category_plugin.discovery, 'parent_event_id');

  // Without verification, fixture must not be ok and action hint no_trade
  const footballUnverified = await assessPmEventReadoutLive(
    { slug: 'fifwc-fra-mar-2026-07-09-fra' },
    { fetchImpl: mockFootball }
  );
  assert.notEqual(footballUnverified.category_plugin.fixture.fixture_status, 'ok');
  assert.equal(footballUnverified.category_plugin.default_action_hint, 'no_trade');
  assert.notEqual(footballUnverified.tradability, 'high');
}

  // Tennis L1: named ML + format + domination check + fixture gate
{
  const tennisMarkets = [{
    conditionId: '0xtml',
    slug: 'wta-muchova-gauff-2026-07-09',
    question: 'Wimbledon WTA: Karolina Muchova vs Coco Gauff',
    sportsMarketType: 'moneyline',
    active: true,
    closed: false,
    volume24hr: 400000,
    outcomes: '["Karolina Muchova","Coco Gauff"]',
    outcomePrices: '["0.435","0.565"]',
    bestBid: 0.43,
    bestAsk: 0.44,
    endDate: '2026-07-09T18:00:00Z',
    eventStartTime: '2026-07-09T14:00:00Z',
    events: [{ id: 'tm', slug: 'wta-muchova-gauff-2026-07-09', title: 'Wimbledon WTA: Karolina Muchova vs Coco Gauff' }]
  }];
  const tennisEvent = [{
    id: 'parent-tennis',
    slug: 'wta-muchova-gauff-2026-07-09',
    title: 'Wimbledon WTA: Karolina Muchova vs Coco Gauff',
    startTime: '2026-07-09T14:00:00Z',
    markets: [
      { ...tennisMarkets[0] },
      {
        conditionId: '0xtsh',
        slug: 'wta-muchova-gauff-2026-07-09-set-handicap-home-1pt5',
        question: 'Set Handicap: Muchova (-1.5) vs Gauff (+1.5)',
        groupItemTitle: 'Set Handicap +/-1.5',
        sportsMarketType: 'tennis_set_handicap',
        active: true,
        closed: false,
        volume24hr: 80000,
        outcomes: '["Muchova","Gauff"]',
        outcomePrices: '["0.30","0.70"]',
        bestBid: 0.28,
        bestAsk: 0.32
      },
      {
        conditionId: '0xtsets',
        slug: 'wta-muchova-gauff-2026-07-09-set-totals-2pt5',
        question: 'Total Sets O/U 2.5',
        groupItemTitle: 'Total Sets: O/U 2.5',
        sportsMarketType: 'tennis_set_totals',
        active: true,
        closed: false,
        volume24hr: 90000,
        outcomes: '["Over 2.5","Under 2.5"]',
        outcomePrices: '["0.62","0.38"]',
        bestBid: 0.60,
        bestAsk: 0.64
      },
      {
        conditionId: '0xtmg',
        slug: 'wta-muchova-gauff-2026-07-09-match-total-22pt5',
        question: 'Match O/U 22.5',
        groupItemTitle: 'Match O/U 22.5',
        sportsMarketType: 'tennis_match_totals',
        active: true,
        closed: false,
        volume24hr: 70000,
        outcomes: '["Over","Under"]',
        outcomePrices: '["0.55","0.45"]',
        bestBid: 0.53,
        bestAsk: 0.57
      },
      {
        conditionId: '0xts1',
        slug: 'wta-muchova-gauff-2026-07-09-first-set-winner',
        question: 'Set 1 Winner',
        groupItemTitle: 'Set 1 Winner',
        sportsMarketType: 'tennis_first_set_winner',
        active: true,
        closed: false,
        volume24hr: 50000,
        outcomes: '["Muchova","Gauff"]',
        outcomePrices: '["0.40","0.60"]',
        bestBid: 0.39,
        bestAsk: 0.41
      },
      {
        conditionId: '0xtcm',
        slug: 'wta-muchova-gauff-2026-07-09-completed-match',
        question: 'Completed Match',
        groupItemTitle: 'Completed Match',
        sportsMarketType: 'tennis_completed_match',
        active: true,
        closed: false,
        volume24hr: 10000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.95","0.05"]',
        bestBid: 0.94,
        bestAsk: 0.96
      }
    ]
  }];

  const mockTennis = async (url) => {
    const u = String(url);
    if (u.includes('/markets?slug=wta-muchova-gauff-2026-07-09')) {
      return new Response(JSON.stringify(tennisMarkets), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('parent_event_id=parent-tennis')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?slug=wta-muchova-gauff-2026-07-09')) {
      return new Response(JSON.stringify(tennisEvent), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${u}`);
  };

  const tennis = await assessPmEventReadoutLive(
    {
      slug: 'wta-muchova-gauff-2026-07-09',
      tennis: {
        verified: true,
        market_fixture_match: 'yes',
        scheduled_time_utc: '2026-07-09T14:00:00Z',
        fixture_sources: ['test_fixture'],
        tournament: 'Wimbledon',
        format: 'best_of_3'
      }
    },
    { fetchImpl: mockTennis }
  );
  assert.equal(tennis.category, 'tennis');
  assert.equal(tennis.category_depth, 'enriched');
  assert.equal(tennis.matrix_status, 'complete');
  assert.equal(tennis.category_plugin.format.best_of, 3);
  assert.ok(tennis.category_plugin.market_implied_shape.moneyline.player_a);
  assert.ok(tennis.category_plugin.market_implied_shape.moneyline.player_b);
  assert.ok(tennis.category_plugin.expression_comparison.candidates.length >= 2);
  assert.ok(tennis.category_plugin.straight_set_domination_check);
  assert.equal(tennis.category_plugin.fixture.fixture_status, 'ok');
  assert.ok(tennis.current_price.named?.length >= 2);
  assert.equal(
    tennis.current_price.named[0].price,
    tennis.category_plugin.market_implied_shape.moneyline.player_a.yes
  );
  // Mock underdog cover at 0.70 is actionable; must not pick a full price
  assert.ok(tennis.category_plugin.expression_comparison.recommended);
  assert.ok(
    !['full', 'rich', 'no_edge'].includes(
      tennis.category_plugin.expression_comparison.recommended.price_status
    )
  );

  const tennisUnverified = await assessPmEventReadoutLive(
    { slug: 'wta-muchova-gauff-2026-07-09' },
    { fetchImpl: mockTennis }
  );
  assert.notEqual(tennisUnverified.category_plugin.fixture.fixture_status, 'ok');
  assert.equal(tennisUnverified.category_plugin.default_action_hint, 'no_trade');
  assert.notEqual(tennisUnverified.tradability, 'high');
}

// ---- unit: content-verify-claims ------------------------------------------

{
  const pass = assessContentVerifyClaims({
    claims: ['OKX marketplace has 358 ASPs and 2982 cumulative calls.'],
    sources: [{ text: 'Scan found 358 unique ASPs and 2982 soldCount on 2026-07-07.' }]
  });
  assert.ok(['pass', 'needs_review'].includes(pass.verdict));
  assert.equal(pass.service_id, 'content_verify_claims');
}

{
  const fail = assessContentVerifyClaims({
    claims: ['Revenue hit 10 million USD yesterday.'],
    sources: [{ text: 'The product is still in beta with zero customers.' }]
  });
  assert.ok(['fail', 'needs_review'].includes(fail.verdict));
  assert.ok(fail.unsupported.length >= 1 || fail.conflicts.length >= 1);
}

{
  // Mixed: one supported + one needs_review must not throw (buildConsensus bugfix).
  const mixed = assessContentVerifyClaims({
    claims: [
      'OKX marketplace has 358 ASPs.',
      'Something vague about synergy tomorrow.'
    ],
    sources: [{ text: 'Scan found 358 unique ASPs on 2026-07-07.' }]
  });
  assert.equal(typeof mixed.consensus, 'string');
  assert.ok(mixed.consensus.includes('need review') || mixed.verdict === 'needs_review' || mixed.supported.length >= 1);
}

{
  const { assessContentSlopCheck } = await import('../src/content-slop-check.mjs');
  const sloppy = assessContentSlopCheck({
    text: "In today's digital landscape, it is crucial to delve into synergy. As an AI, I am excited to underscore this game-changer."
  });
  assert.equal(sloppy.service_id, 'content_slop_check');
  assert.ok(sloppy.slop_score_0_100 >= 30);
  assert.ok(sloppy.slop_flags.length >= 2);
}

// ---- unit: pm-brier ---------------------------------------------------------

{
  const { assessPmBrierLive } = await import('../src/pm-brier.mjs');
  const mockBrier = async (url) => {
    const u = String(url);
    if (u.includes('data-api.polymarket.com/positions')) {
      return new Response(JSON.stringify([
        { title: 'A', redeemable: true, avgPrice: 0.7, currentValue: 1 },
        { title: 'B', redeemable: true, avgPrice: 0.2, currentValue: 0 },
        { title: 'C', redeemable: false, avgPrice: 0.5, currentValue: 0.5 }
      ]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${u}`);
  };
  const brier = await assessPmBrierLive(
    { address: '0x63ce342161250d705dc0b16df89036c8e5f9ba9a' },
    { fetchImpl: mockBrier }
  );
  assert.equal(brier.service_id, 'pm_brier');
  assert.equal(brier.settled_markets, 2);
  assert.equal(brier.wins, 1);
  // mean((0.7-1)^2 + (0.2-0)^2) = (0.09 + 0.04)/2 = 0.065
  assert.equal(brier.brier, 0.065);
  assert.equal(brier.rating, 'good');
}

// ---- unit: sports upset max_prob + smart-money cohort -----------------------

{
  const { assessSportsUpsetAlertLive } = await import('../src/sports-upset-alert.mjs');
  const marketsPayload = [{
    conditionId: '0xm1',
    slug: 'underdog-yes',
    question: 'Underdog wins?',
    active: true,
    closed: false,
    volume24hr: 90000,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.22","0.78"]'
  }, {
    conditionId: '0xm2',
    slug: 'other-yes',
    question: 'Other event?',
    active: true,
    closed: false,
    volume24hr: 80000,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.40","0.60"]'
  }];

  const mockUpset = async (url) => {
    const u = String(url);
    if (u.includes('/events?') || u.includes('/markets?') || u.includes('public-search')) {
      if (u.includes('/markets?')) {
        return new Response(JSON.stringify(marketsPayload), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify([{
        title: 'Sports card',
        closed: false,
        volume24hr: 100000,
        markets: marketsPayload
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/trades?')) {
      const market = u.includes('0xm1') ? '0xm1' : '0xm2';
      const price = market === '0xm1' ? 0.22 : 0.4;
      return new Response(JSON.stringify([{
        proxyWallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        side: 'BUY',
        size: 2000,
        price,
        timestamp: 1_700_000_000,
        outcome: 'Yes',
        conditionId: market,
        title: 'm'
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('lb-api.polymarket.com/profit')) {
      return new Response(JSON.stringify([{ proxyWallet: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', amount: 1200 }]), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    if (u.includes('/positions?')) {
      return new Response(JSON.stringify([{ totalBought: 2000, avgPrice: 0.22, cashPnl: 10 }]), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    throw new Error(`unexpected ${u}`);
  };

  const tight = await assessSportsUpsetAlertLive(
    { sport: 'football', league: 'epl', max_prob: 0.15, limit: 5 },
    { fetchImpl: mockUpset }
  );
  assert.equal(tight.input.max_prob, 0.15);
  assert.equal(tight.upset_alerts.length, 0);

  const loose = await assessSportsUpsetAlertLive(
    { sport: 'football', league: 'epl', max_prob: 0.35, limit: 5 },
    { fetchImpl: mockUpset }
  );
  assert.ok(loose.upset_alerts.length >= 1);
  assert.ok(Array.isArray(loose.wallet_cohort));
}

{
  const { assessSportsSmartMoneyLive } = await import('../src/worldcup-smart-money-live.mjs');
  const mockSm = async (url) => {
    const u = String(url);
    if (u.includes('/events?') || u.includes('public-search') || u.includes('/markets?')) {
      const markets = [{
        conditionId: '0xa',
        slug: 'm-a',
        question: 'Match A',
        active: true,
        closed: false,
        volume24hr: 50000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.5","0.5"]'
      }, {
        conditionId: '0xb',
        slug: 'm-b',
        question: 'Match B',
        active: true,
        closed: false,
        volume24hr: 40000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.5","0.5"]'
      }];
      if (u.includes('/markets?')) {
        return new Response(JSON.stringify(markets), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify([{ title: 'card', closed: false, markets }]), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    if (u.includes('/trades?')) {
      return new Response(JSON.stringify([{
        proxyWallet: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        side: 'BUY', size: 3000, price: 0.45, timestamp: 1_700_000_100,
        outcome: 'Yes', conditionId: u.includes('0xa') ? '0xa' : '0xb'
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('lb-api')) {
      return new Response(JSON.stringify([{ amount: 500 }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/positions?')) {
      return new Response(JSON.stringify([{ totalBought: 3000, avgPrice: 0.45, cashPnl: 1 }]), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }
    throw new Error(`unexpected ${u}`);
  };
  const sm = await assessSportsSmartMoneyLive(
    { sport: 'tennis', limit: 3 },
    { fetchImpl: mockSm }
  );
  assert.ok(Array.isArray(sm.wallet_cohort));
  assert.ok(sm.wallet_cohort.some((w) => w.cross_market === true));
  assert.ok(sm.schema_version === '0.3');
}

{
  const {
    assessWorldCupSmartMoneyLive
  } = await import('../src/worldcup-smart-money-live.mjs');
  const {
    assessWorldCupUpsetAlertLive
  } = await import('../src/sports-upset-alert.mjs');

  const footballMarkets = [{
    conditionId: '0xfoot1',
    slug: 'soccer-upset-yes',
    question: 'Will the underdog win the football match?',
    active: true,
    closed: false,
    volume24hr: 90000,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.22","0.78"]'
  }, {
    conditionId: '0xfoot2',
    slug: 'soccer-other-yes',
    question: 'Will another football match happen?',
    active: true,
    closed: false,
    volume24hr: 75000,
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.48","0.52"]'
  }];

  const mockWorldCupExpand = async (url) => {
    const u = String(url);
    const parsed = new URL(u);
    if (u.includes('/events?')) {
      const tag = parsed.searchParams.get('tag_slug');
      if (tag === 'world-cup') {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (tag === 'soccer' || tag === 'football') {
        return new Response(JSON.stringify([{
          title: 'Football markets',
          closed: false,
          volume24hr: 165000,
          markets: footballMarkets
        }]), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('public-search') || u.includes('/markets?')) {
      return new Response(JSON.stringify(u.includes('public-search') ? { events: [] } : []), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (u.includes('/trades?')) {
      const market = u.includes('0xfoot1') ? '0xfoot1' : '0xfoot2';
      const price = market === '0xfoot1' ? 0.22 : 0.48;
      return new Response(JSON.stringify([{
        proxyWallet: '0xcccccccccccccccccccccccccccccccccccccccc',
        side: 'BUY',
        size: 3000,
        price,
        timestamp: 1_700_000_200,
        outcome: 'Yes',
        conditionId: market
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('lb-api')) {
      return new Response(JSON.stringify([{ amount: 1500 }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/positions?')) {
      return new Response(JSON.stringify([{ totalBought: 3000, avgPrice: 0.22, cashPnl: 5 }]), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    }
    throw new Error(`unexpected ${u}`);
  };

  const radar = await assessWorldCupSmartMoneyLive(
    { query: 'all', limit: 3 },
    { fetchImpl: mockWorldCupExpand }
  );
  assert.equal(radar.source.scope_expanded, true);
  assert.equal(radar.source.requested_scope, 'world_cup');
  assert.equal(radar.source.effective_scope, 'football');
  assert.ok(radar.buyer_summary_en.includes('expanded'));
  assert.ok(radar.signals.length >= 1);

  const upset = await assessWorldCupUpsetAlertLive(
    { query: 'all', limit: 3, max_prob: 0.35 },
    { fetchImpl: mockWorldCupExpand }
  );
  assert.equal(upset.source.discovery.scope_expanded, true);
  assert.equal(upset.source.discovery.requested_scope, 'world_cup');
  assert.equal(upset.source.discovery.effective_scope, 'football');
  assert.ok(upset.buyer_summary_en.includes('expanded'));
  assert.ok(upset.upset_alerts.length >= 1);
}

// ---- unit: nba category plugin ---------------------------------------------

{
  const { enrichNbaCategory, classifyNbaGroup } = await import('../src/pm-category-nba.mjs');
  assert.equal(classifyNbaGroup({
    sports_market_type: 'moneyline',
    group_item_title: 'Lakers',
    title: 'Lakers vs Celtics',
    yes: 0.58
  }), 'moneyline');
  assert.equal(classifyNbaGroup({
    sports_market_type: 'spreads',
    group_item_title: 'Lakers -4.5',
    title: 'Spread',
    yes: 0.51
  }), 'spreads_ladder');

  const plugin = enrichNbaCategory({
    market: { title: 'NBA: Lakers vs Celtics', slug: 'nba-lal-bos', yes: 0.58 },
    eventBundle: { title: 'Lakers vs Celtics', slug: 'nba-lal-bos-2026' },
    eventMatrix: [
      { title: 'Lakers', group_item_title: 'Lakers', slug: 'lal', yes: 0.58, sports_market_type: 'moneyline', is_primary: true },
      { title: 'Celtics', group_item_title: 'Celtics', slug: 'bos', yes: 0.42, sports_market_type: 'moneyline' },
      { title: 'Spread', group_item_title: 'Lakers -4.5', slug: 'spread', yes: 0.5, sports_market_type: 'spreads' },
      { title: 'Total', group_item_title: 'O/U 224.5', slug: 'total', yes: 0.52, sports_market_type: 'totals' }
    ],
    fixture: {
      verified: true,
      market_fixture_match: 'yes',
      scheduled_time_utc: '2026-07-24T01:00:00Z',
      home_team: 'Lakers',
      away_team: 'Celtics'
    }
  });
  assert.equal(plugin.category, 'nba');
  assert.equal(plugin.matrix_status, 'complete');
  assert.equal(plugin.fixture.fixture_status, 'ok');
  assert.ok(plugin.coherence?.coherence_status);
}

// ---- unit: pm-decision-card ------------------------------------------------

{
  const { assessPmDecisionCardLive } = await import('../src/pm-decision-card.mjs');
  const mockDc = async (url) => {
    const u = String(url);
    if (u.includes('/markets?')) {
      return new Response(JSON.stringify([{
        conditionId: '0xdec',
        slug: 'demo-decision',
        question: 'Will demo happen?',
        active: true,
        closed: false,
        volume24hr: 25000,
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.42","0.58"]',
        bestBid: 0.41,
        bestAsk: 0.43,
        events: [{ slug: 'demo-event', title: 'Demo event' }]
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events')) {
      return new Response(JSON.stringify([{
        slug: 'demo-event',
        title: 'Demo event',
        closed: false,
        markets: [{
          conditionId: '0xdec',
          slug: 'demo-decision',
          question: 'Will demo happen?',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.42","0.58"]',
          volume24hr: 25000,
          active: true,
          closed: false
        }]
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${u}`);
  };
  const card = await assessPmDecisionCardLive(
    { slug: 'demo-decision', side: 'yes', size_usd: 20 },
    { fetchImpl: mockDc }
  );
  assert.equal(card.service_id, 'pm_decision_card');
  assert.ok(['skip', 'watch', 'eligible_for_manual_review'].includes(card.action));
  assert.ok(card.value_loop?.stale_after_minutes);
  assert.ok(card.value_loop?.stale_at);
  assert.ok(card.buyer_summary_en);
  assert.ok(card.paid_checks?.checks?.length >= 6);
  assert.equal(typeof card.paid_checks.pass_count, 'number');
  assert.ok(card.decision_card?.next_actions?.length >= 1);
}

// ---- unit: scenario SKUs ---------------------------------------------------

{
  const {
    assessPoliticsEventReadoutLive,
    assessWeatherEventReadoutLive
  } = await import('../src/pm-scenario-skus.mjs');

  const mockSearch = async (url) => {
    const u = String(url);
    if (u.includes('public-search')) {
      return new Response(JSON.stringify({
        events: [{
          title: '2028 Presidential Election',
          slug: 'pres-2028',
          closed: false,
          volume24hr: 90000,
          markets: [{
            conditionId: '0xpol1',
            slug: 'pres-2028-a',
            question: 'Will Candidate A win the presidential election?',
            outcomes: '["Yes","No"]',
            outcomePrices: '["0.41","0.59"]',
            volume24hr: 50000,
            active: true,
            closed: false
          }]
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/markets?slug=')) {
      return new Response(JSON.stringify([{
        conditionId: '0xpol1',
        slug: 'pres-2028-a',
        question: 'Will Candidate A win the presidential election?',
        outcomes: '["Yes","No"]',
        outcomePrices: '["0.41","0.59"]',
        volume24hr: 50000,
        active: true,
        closed: false,
        events: [{ slug: 'pres-2028', title: '2028 Presidential Election' }]
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?') || u.includes('/events/')) {
      return new Response(JSON.stringify([{
        slug: 'pres-2028',
        title: '2028 Presidential Election',
        closed: false,
        markets: [{
          conditionId: '0xpol1',
          slug: 'pres-2028-a',
          question: 'Will Candidate A win the presidential election?',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.41","0.59"]',
          volume24hr: 50000,
          active: true,
          closed: false,
          groupItemTitle: 'A'
        }, {
          conditionId: '0xpol2',
          slug: 'pres-2028-b',
          question: 'Will Candidate B win the presidential election?',
          outcomes: '["Yes","No"]',
          outcomePrices: '["0.33","0.67"]',
          volume24hr: 40000,
          active: true,
          closed: false,
          groupItemTitle: 'B'
        }]
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${u}`);
  };

  const politics = await assessPoliticsEventReadoutLive(
    { query: 'president' },
    { fetchImpl: mockSearch }
  );
  assert.equal(politics.service_id, 'politics_event_readout');
  assert.equal(politics.scenario?.id, 'politics_event_readout');
  assert.ok(typeof politics.buyer_summary_zh === 'string');

  const weatherFallback = (await import('../src/pm-scenario-skus.mjs')).buildWeatherEventReadoutFallback({});
  assert.equal(weatherFallback.service_id, 'weather_event_readout');
}

{
  const { assessWeatherEventReadoutLive } = await import('../src/pm-scenario-skus.mjs');
  const weatherMarket = {
    conditionId: '0xweather1',
    slug: 'nyc-high-temp-july-26',
    question: 'Will NYC high temperature be 90°F or above on July 26?',
    outcomes: '["Yes","No"]',
    outcomePrices: '["0.44","0.56"]',
    volume24hr: 125000,
    active: true,
    closed: false,
    events: [{ id: 'weather-parent', slug: 'nyc-high-temp-july-26-event', title: 'NYC High Temperature July 26' }]
  };
  const weatherEvent = [{
    id: 'weather-parent',
    slug: 'nyc-high-temp-july-26-event',
    title: 'NYC High Temperature July 26',
    closed: false,
    markets: [weatherMarket]
  }];

  const mockCategoryDefault = async (url) => {
    const u = String(url);
    const parsed = new URL(u);
    if (u.includes('/public-search')) {
      return new Response(JSON.stringify({ events: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?') && parsed.searchParams.get('tag_slug') === 'weather') {
      return new Response(JSON.stringify(weatherEvent), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/markets?slug=nyc-high-temp-july-26')) {
      return new Response(JSON.stringify([weatherMarket]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?') && parsed.searchParams.get('slug') === 'nyc-high-temp-july-26-event') {
      return new Response(JSON.stringify(weatherEvent), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${u}`);
  };

  const weather = await assessWeatherEventReadoutLive(
    { query: 'impossible caller query' },
    { fetchImpl: mockCategoryDefault }
  );
  assert.equal(weather.mode, 'live');
  assert.equal(weather.category, 'weather');
  assert.equal(weather.scenario.resolved_via, 'category_default');
  assert.equal(weather.input.slug, 'nyc-high-temp-july-26');
}

{
  const { assessWeatherEventReadoutLive } = await import('../src/pm-scenario-skus.mjs');
  const mockNoMarkets = async (url) => {
    const u = String(url);
    if (u.includes('/public-search')) {
      return new Response(JSON.stringify({ events: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('/events?') || u.includes('/markets?')) {
      return new Response(JSON.stringify([]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${u}`);
  };

  const unavailable = await assessWeatherEventReadoutLive(
    { query: 'no such weather market' },
    { fetchImpl: mockNoMarkets }
  );
  assert.equal(unavailable.service_id, 'weather_event_readout');
  assert.equal(unavailable.mode, 'live');
  assert.equal(unavailable.capability_status, 'no_active_markets');
  assert.equal(unavailable.action, 'unavailable');
  assert.ok(unavailable.buyer_summary_zh.includes('没有找到'));
  assert.ok(unavailable.buyer_summary_en.includes('No active'));
  assert.ok(unavailable.paid_checks.fail_count >= 1);
}

// ---- unit: finance-cockpit -------------------------------------------------

{
  const { assessFinanceCockpitLive } = await import('../src/finance-cockpit.mjs');
  const mockFc = async (url) => {
    const u = String(url);
    if (u.includes('okx.com') && u.includes('ticker')) {
      return new Response(JSON.stringify({
        code: '0',
        data: [{ last: '65000', open24h: '64000' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('okx.com') && u.includes('funding-rate')) {
      return new Response(JSON.stringify({
        code: '0',
        data: [{ fundingRate: '0.0001', premium: '0.0002' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('okx.com') && u.includes('open-interest')) {
      return new Response(JSON.stringify({
        code: '0',
        data: [{ oiUsd: '1000000' }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('gamma-api.polymarket.com')) {
      return new Response(JSON.stringify({
        events: [{
          closed: false,
          markets: [{
            conditionId: '0x1',
            question: 'Will Bitcoin reach $100k?',
            slug: 'btc-100k',
            outcomes: '["Yes","No"]',
            outcomePrices: '["0.4","0.6"]',
            oneDayPriceChange: -0.05,
            volume24hr: 20000,
            active: true,
            closed: false
          }]
        }]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error(`unexpected ${u}`);
  };
  const card = await assessFinanceCockpitLive(
    { focus: 'bitcoin', limit: 2 },
    { fetchImpl: mockFc }
  );
  assert.equal(card.service_id, 'finance_cockpit');
  assert.ok(card.regime?.regime);
  assert.ok(typeof card.buyer_summary_zh === 'string');
  assert.ok(['risk_on_clean', 'risk_off_clean', 'divergence_review', 'hold_observe'].includes(card.action));
}

// ---- unit: politics category plugin ----------------------------------------

{
  const { enrichPoliticsCategory } = await import('../src/pm-category-politics.mjs');
  const politics = enrichPoliticsCategory({
    market: { title: 'Presidential Election Winner', slug: 'pres-2028', yes: 0.41 },
    eventBundle: { title: '2028 Presidential Election', slug: 'pres-2028' },
    eventMatrix: [
      { title: 'Candidate A', group_item_title: 'A', slug: 'a', yes: 0.41, is_primary: true },
      { title: 'Candidate B', group_item_title: 'B', slug: 'b', yes: 0.33 },
      { title: 'Candidate C', group_item_title: 'C', slug: 'c', yes: 0.12 }
    ]
  });
  assert.equal(politics.category, 'politics');
  assert.equal(politics.ladder_status, 'multi_candidate');
  assert.equal(politics.leaderboard[0].label, 'A');
}

// ---- unit: publish-readiness ------------------------------------------------

{
  const { assessPublishReadiness } = await import('../src/publish-readiness.mjs');
  const blocked = assessPublishReadiness({
    text: "In today's digital landscape, it is crucial to delve into synergy. As an AI, I am excited to underscore this game-changer."
  });
  assert.equal(blocked.service_id, 'publish_readiness');
  assert.equal(blocked.action, 'block');
  assert.ok(blocked.buyer_summary_zh.includes('先别发') || blocked.blockers.length >= 1);

  const ready = assessPublishReadiness({
    text: 'Marketplace scan on 2026-07-07 found 358 unique ASPs and 2982 cumulative soldCount.',
    claims: ['Marketplace has 358 unique ASPs and 2982 cumulative soldCount.'],
    sources: [{ text: 'Marketplace scan on 2026-07-07 found 358 unique ASPs and 2982 cumulative soldCount.' }]
  });
  assert.equal(ready.action, 'ready');
  assert.ok(typeof ready.buyer_summary_zh === 'string');
}

// ---- worker integration (degraded fallback, no external network) ------------

const savedFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).startsWith('https://web3.okx.com/')) {
    throw new Error('x402 should not run in this test');
  }
  if (String(url).startsWith('https://gamma-api.polymarket.com/')) {
    const u = String(url);
    return new Response(JSON.stringify(u.includes('/public-search') ? { events: [] } : []), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
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
  assert.ok(['eligible', 'watch', 'skip'].includes(preBody.action));

  const catalog = await worker.fetch(new Request(`${BASE}/api/okx-ai-services`)).then((r) => r.json());
  assert.ok(catalog.services.some((s) => s.service_id === 'token_dd_verdict'));
  assert.ok(catalog.services.some((s) => s.service_id === 'pm_event_readout'));

  const readRes = await worker.fetch(new Request(`${BASE}/pm-event-readout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ slug: 'will-argentina-win-the-2026-fifa-world-cup-245' })
  }));
  assert.equal(readRes.status, 200);
  const readBody = await readRes.json();
  assert.equal(readBody.service_id, 'pm_event_readout');

  const weatherUnavailableRes = await worker.fetch(new Request(`${BASE}/weather-event-readout`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query: 'no active weather markets in test' })
  }));
  assert.equal(weatherUnavailableRes.status, 200);
  const weatherUnavailable = await weatherUnavailableRes.json();
  assert.equal(weatherUnavailable.service_id, 'weather_event_readout');
  assert.equal(weatherUnavailable.mode, 'live');
  assert.equal(weatherUnavailable.capability_status, 'no_active_markets');
  assert.equal(weatherUnavailable.action, 'unavailable');

  const verifyRes = await worker.fetch(new Request(`${BASE}/content-verify-claims`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      claims: ['Platform has about 360 ASPs.'],
      sources: [{ text: 'Marketplace scan: 358 unique ASPs on 2026-07-07.' }]
    })
  }));
  assert.equal(verifyRes.status, 200);
  const verifyBody = await verifyRes.json();
  assert.equal(verifyBody.service_id, 'content_verify_claims');

  const sample = await worker.fetch(new Request(`${BASE}/token-dd-verdict`, { method: 'GET' })).then((r) => r.json());
  assert.equal(sample.mode, 'public_sample');
  assert.ok(sample.sample_response?.verdict_bucket);
} finally {
  globalThis.fetch = savedFetch;
}

console.log('PASS wave-b-services-test');
