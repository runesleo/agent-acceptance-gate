# Leo Labs ASP 工厂 Backlog（2026-07-07）

状态：**active** · 主 SSOT：本文件 · 关联：`2026-07-07-okx-wave1-roadmap.md` · Hackathon 截止 **2026-07-17 08:00 北京时间**

## 原则

1. **两步走**：Phase 1 把现成能力商品化 → Phase 2 从素材库挖新需求。
2. **自用 + 外用**：Codex/Hermes 与外部 agent 同调 `api.leolabs.me`。
3. **卖 gate，不卖 voice**：内容线卖 verify/humanize/readiness，不整包卖 `leo-style` / 账号发布。
4. **工厂流水线**：`skill/repo 逻辑 → api.leolabs.me endpoint → onchainos listing → GitHub README`（目标 **1–3 天/SKU**）。

---

## 一个 ASP，四条产品线

```
Leo Labs (#3977) @ api.leolabs.me
├── Agent Trust      → Delivery Audit Gate（护城河）
├── PM Intelligence  → Preflight / Event Readout / Divergence / Regime / Toolkit API
├── Research         → Token DD Verdict / (Full DD escrow)
└── Creator Ops      → Content Verify / Humanize / Publish Gate / Visual Spec
```

**对外叙事**：多 SKU 工厂 + PM 原生 + Agent 信任层（非 AlphaRadar 式单点 8 步研报）。

---

## Phase 1 — 上架队列

### Wave A — 零开发（本周 · 等 OKX 审核）

| # | SKU | 状态 | 动作 | 门禁 |
|---|-----|------|------|------|
| A1 | World Cup Smart Money Radar | listing 审核中 | 过审即可 | OKX listed |
| A2 | Polymarket Smart Money Radar | listing 审核中 | 过审即可 | OKX listed |
| A3 | Agent Delivery Audit Gate | listing 审核中 | 过审即可 | OKX listed |
| A4 | Event Price Divergence Radar | listing 审核中 | 过审即可 | OKX listed |
| A5 | Crypto Market Regime Radar | `live_unlisted` | `onchainos create` + activate | listed 后 |
| A6 | World Cup Upset Alert | `live_unlisted` | `onchainos create` + activate | listed 后 |
| A7 | v18 Quote 推 + listing 截图 | 草稿 READY | 审核通过后发 | publish gate |
| A8 | Hackathon 参赛帖 + ≤90s demo | 脚本待 v2 | #Okxai + 填表 | listed 后 |

**Wave A 完成后 SKU 数**：6 listed（+2 自 A5/A6）。

---

### Wave B — 轻包装（各 1–3 天 · 审核期可并行写代码）

| # | 新 SKU | 复用来源 | 路径 | 定价建议 | 赛道 |
|---|--------|----------|------|----------|------|
| B1 | **Token DD Verdict** | `asset-dd` Quick + `auditor.mjs` | `POST /token-dd-verdict` | 0.05 | Finance + Utility | ✅ code `live_unlisted` |
| B2 | **PM Trade Preflight** | `pm-decision-card` 规则层 | `POST /pm-trade-preflight` | 0.1 | Finance + Best Product | ✅ code `live_unlisted` |
| B3 | **PM Event Readout** | `pm-event-readout` skill | `POST /pm-event-readout` | 0.1 | Finance | ✅ code `live_unlisted` deployed |
| B4 | **Content Verify API** | `content-verify` + `leo-route review` | `POST /content-verify-claims` | 0.1 | Software Utility |
| B5 | **Humanize API** | `skill-api` Hono | 迁入 Worker 或反代 | 0.05 | Software Utility |

**Wave B 优先级**：B1 → B2 → B4 → B3 → B5（黑客松 demo 主角：B2 + A3 + B1）。

---

### Wave C — 数据线扩展（各 2–5 天 · Wave B 后）

| # | 新 SKU | 复用来源 | 路径 | 定价建议 |
|---|--------|----------|------|----------|
| C1 | **PM Profile API** | `polymarket-toolkit` CLI | `POST /pm-profile` 等 | 0.05 |
| C2 | **Elite Pool Lookup** | `polymarket-data` T014 | `POST /pm-elite-pool-lookup` | 0.1 |
| C3 | **Publish Readiness Gate** | `publish-gate.py` | `POST /publish-readiness` | 0.1 |
| C4 | **Visual Spec API** | `leo-visual-router` + `content/brand/card-layouts` | `POST /visual-spec` | 0.05 |

---

### 不做 ASP（自用 / 合规 / 敏感）

| 资产 | 原因 |
|------|------|
| `leo-style` / `tg-publish` / `xhs-publish` / `distribute` | 账号、人格、部署 hard gate |
| `prediction-trader` / `pm-manual-trading-lab` playbook | 执行、下单、内部 SSOT |
| `strategy-report` | VPS 实盘隐私 |
| `tg-reader-mcp` / `wechat-reader` | Session / 环境绑定 |
| 6551 转售类 MCP | 第三方 API 依赖 |

---

## Phase 2 — 需求挖矿（素材库）

| 层 | 路径 | 用法 |
|----|------|------|
| 社群痛点 | `leo-vault/domains/内容创作/社群需求池.md` | ≥3 次标 🔥 → 评估 SKU |
| 外部信号 | `leo-vault/domains/内容创作/外部信号池.md` | 周捞 3 条 triage |
| OKX 需求研究 | `research/2026-07-06-demand-side-and-playbooks.md` | 定价/打法参照 |
| 日更过堂 | `~/.claude/cache/today-todos-{DATE}.json` → `morning_intake_queue` | 当天路由 |
| 路由协议 | `Documents/Codex/EXTERNAL_SIGNAL_TO_OWNED_ASSET_ROUTING_20260630.md` | drop → watch → queue → worker |

### 已采集 · 待消化（首批）

| # | 需求信号 | 可能 SKU / 资产 |
|---|----------|-----------------|
| 1 | PM 跟单工具 + 幽灵订单 | Toolkit API / PMQuant 模块 |
| 2 | TG/吃单延迟 250ms | 研究 brief，非立即 API |
| 3 | Oracle / 结算源脆弱性 | `/blog` 或 Risk Case |
| 4 | Dry Run vs Live 幻觉 | 策略内容 + Preflight 叙事 |
| 5 | PMQuant Risk Case Library | 课程后补 |
| 6 | OKX 任务端全市场聪明钱 | 已有 PM radar，观察转化 |
| 7 | 背离信号 | 已 live（A4） |
| 8 | Token DD BUY-WATCH-SKIP | **B1** |

**节奏**：每周从素材池捞 **1 条** → `demand_check` → 能 1–3 天包的进 Wave B/C。

---

## Hackathon 多池映射（2026-07-17 截止）

| 赛道 | 拿什么打 | 优先级 |
|------|----------|--------|
| Software Utility | A3 Audit + B4 Verify + B1 Verdict | A |
| Finance Copilot | A4 Divergence + A5 Regime + B2 Preflight | A |
| Social Buzz | 参赛帖 + build 线程 + #Okxai | A |
| Best Product / Business Potential | 多 SKU 互调 + OPC 故事 | B |
| Revenue Rocket | 免费试用 + 自调用 tx | C（彩票） |
| Lifestyle / Art | — | 不打 |

**Demo v2 主线（90s）**：Audit → Verdict → Preflight 三连调 + 402 settle。

---

## Wave B 规格摘要

### B1 — Token DD Verdict

- **输入**：`asset`（ticker / contract / URL）、`tier`（`quick` | `standard` 仅 quick 首版）
- **输出**：`verdict_bucket`（`avoid` | `watch_only` | `research_position` | `tiny_speculative` | `conviction`）、`score_0_100`、`pillars[]`（五支柱 ✅/⚠️/➖）、`hard_stops[]`
- **实现**：`auditor.mjs` 模式 + 公开安全 API（honeypot 等）；**非 LLM 终审**
- **GET sample**：固定合约样例
- **文案**：rule-based research gate，not investment advice

### B2 — PM Trade Preflight

- **输入**：`market_url` 或 `condition_id`、`side`（`yes` | `no`）、`size_usd`（可选）
- **输出**：`action`（`trade` | `watch` | `skip`）、`confidence`、`reasons[]`、`risk_flags[]`
- **实现**：Gamma 市场元数据 + 流动性/价差规则 + `pm-decision-card` 阈值；**read-only，无下单**
- **差异化**：交易前闸门，非聪明钱榜单

### B3 — PM Event Readout

- **输入**：`market_url` 或 `condition_id`
- **输出**：`event_summary`、`priced_in[]`、`uncertainty[]`、`tradability`（`high` | `medium` | `low`）
- **形态**：首版 API；复杂案可转 escrow task

### B4 — Content Verify API

- **输入**：`claims[]` + `sources[]`（URL 或摘录）
- **输出**：`consensus`、`conflicts[]`、`unsupported[]`、`verdict`（`pass` | `needs_review` | `fail`）

### B5 — Humanize API

- **输入**：`text`、`locale`（`zh` | `en`）
- **输出**：`humanized_text`、`slop_flags[]`
- **实现**：合并 `skill-api` 或 Worker 内调 GLM（需 API key 环境变量，不暴露给客户端）

---

## 执行日历（默认）

| 窗口 | 动作 |
|------|------|
| 现在 → 审核过 | 并行写 B1/B2 Worker route + 测试；不动新 listing activate |
| 审核 +48h | A5/A6 listing；参赛帖 + demo v2；自调用 10 次留 tx |
| 审核 +1 周 | B1–B4 各上线 1 个；刷新 marketplace 扫描 |
| 持续 | Phase 2 每周 1 条需求 → SKU 或内容/课程队列 |

---

## 验证清单（每个新 SKU）

- [ ] `npm test` + `worker:check`
- [ ] GET public sample
- [ ] POST free_trial + x402 付费路径
- [ ] `onchainos validate-listing` + `create`/`update`
- [ ] README 示例请求/响应
- [ ] 参赛 demo 可录屏

---

## 变更日志

| 日期 | 变更 |
|------|------|
| 2026-07-07 | 初版：Phase 1 Wave A/B/C + Phase 2 素材库 + Hackathon 映射 + B1–B5 规格摘要 |
| 2026-07-07 | **B1/B2 已实现**（Worker `live_unlisted`）：`/token-dd-verdict` · `/pm-trade-preflight`；**deployed** api.leolabs.me `23d6ea4c` |
