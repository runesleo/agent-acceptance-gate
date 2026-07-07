# OKX Listing 文案（双语规范 · 2026-07-07）

SSOT 代码：`worker/service-catalog.mjs` → `OKX_LISTING_COPY` + `PENDING_OKX_LISTING_COPY`

## 规范

| 字段 | 语言 | 限制 |
|------|------|------|
| `serviceName` | **英文**，≤30 字符 | 与 ASP 名 `Leo Labs` 区分 |
| `serviceDescription` L1 | 英文：干什么 + 输出什么 | 无 URL、无技术栈堆砌 |
| `serviceDescription` L2 | **中文一句** + 输入提示 | 同上 |
| API path / `service_id` / JSON | 英文 | 不改 |

---

## 已上架（审核中 · 过审后 `onchainos update` 用）

| ID | serviceName | 价 (USDT) | endpoint |
|----|-------------|-----------|----------|
| 25996 | World Cup Smart Money Radar | 0.1 | `/world-cup-smart-money-radar` |
| 25997 | Polymarket Smart Money Radar | 0.05 | `/polymarket-smart-money-radar` |
| 25998 | Agent Delivery Audit Gate | 0.2 | `/agent-delivery-acceptance-audit` |
| 25999 | Event Price Divergence Radar | 0.1 | `/event-price-divergence-radar` |

### 25996 World Cup Smart Money Radar

```
L1: Heuristic World Cup prediction-market wallet signals from large public trades and 7-day leaderboard stats; data only.
L2: 世界杯预测市场聪明钱雷达：大额成交与7日盈利钱包信号。输入 market 关键词（如 winner、队名或 all）+ limit 1-10。
```

### 25997 Polymarket Smart Money Radar

```
L1: Heuristic Polymarket wallet signals from recent large trades; beta topic search, limited coverage per call.
L2: Polymarket 全市场聪明钱雷达（beta）。输入 market/topic 关键词（如 bitcoin 或 all）+ limit 1-10；数据信号，非投资建议。
```

### 25998 Agent Delivery Audit Gate

```
L1: Rule-based audit of agent task delivery vs goals and evidence; returns pass, needs review, or fail.
L2: Agent 交付验收闸门：对照任务目标与证据，输出 pass/需复核/fail。输入 task、delivery_summary、artifacts、validation。
```

### 25999 Event Price Divergence Radar

```
L1: Flags where 24h prediction-market probability moves diverge from 24h OKX spot momentum on major crypto assets.
L2: 事件概率与币价背离雷达：PM 24h 概率变动 vs OKX 现货 24h 动量。输入 asset（bitcoin/ethereum/solana 或省略查主流）。
```

---

## 待 create（listed 后 `onchainos create`）

| service_id | serviceName | 价 | endpoint |
|------------|-------------|-----|----------|
| crypto_market_regime_radar | Crypto Market Regime Radar | 0.1 | `/crypto-market-regime-radar` |
| world_cup_upset_alert | World Cup Upset Alert | 0.1 | `/world-cup-upset-alert` |
| token_dd_verdict | Token DD Verdict | 0.05 | `/token-dd-verdict` |
| pm_trade_preflight | PM Trade Preflight | 0.1 | `/pm-trade-preflight` |

### Crypto Market Regime Radar

```
L1: Blends OKX spot momentum, perp funding/premium and Polymarket drift into risk_on/off/neutral/mixed with explainable score.
L2: 加密市场状态雷达：现货动量+资金费率+PM 情绪 → risk_on/off/neutral 及 0-100 分。输入 focus/asset 关键词 + limit。
```

### World Cup Upset Alert

```
L1: Flags profitable wallets entering low-probability World Cup outcomes; potential upset positioning signals only.
L2: 世界杯冷门预警：盈利钱包涌入低概率赛果。输入 market 关键词（winner/队名/all）+ limit 1-10；数据信号，非投注建议。
```

### Token DD Verdict

```
L1: Quick rule-based token research gate; optional DEX liquidity scan for EVM contracts; returns avoid/watch/research buckets.
L2: 代币快速尽调闸门：规则引擎输出 avoid/观望/可研究等分桶；EVM 合约可查 DEX 流动性。输入 asset（ticker 或合约地址）。
```

### PM Trade Preflight

```
L1: Read-only trade/watch/skip gate before a Polymarket order; checks liquidity, price zone, and spread.
L2: 预测市场下单前检查：trade/观望/跳过，只读不下单。输入 market_url 或 slug + side(yes/no)，可选 size_usd。
```

---

## 对外中文对照（X / 参赛帖用，非 listing 字段）

| 英文 SKU | 中文人话 |
|----------|----------|
| Agent Delivery Audit Gate | Agent 交付验收闸门 |
| Event Price Divergence Radar | 事件概率×币价背离雷达 |
| PM Trade Preflight | 预测市场下单前检查 |
| Token DD Verdict | 代币快速尽调闸门 |
| Crypto Market Regime Radar | 加密市场状态雷达 |
| World Cup Smart Money Radar | 世界杯聪明钱雷达 |
| Polymarket Smart Money Radar | Polymarket 聪明钱雷达 |
| World Cup Upset Alert | 世界杯冷门预警 |

---

## 下一步

1. **当前审核批次过审后**：对 25996–25999 跑 `onchainos agent update` 刷 L2 中文（若审核允许改文案）
2. **新 SKU**：deploy Worker 后 `validate-listing` → `create` → `activate`
3. **参赛帖**：中文叙事 + 括号英文 SKU，见 `2026-07-05-hackathon-demo-video-script.md` v2（待写）
