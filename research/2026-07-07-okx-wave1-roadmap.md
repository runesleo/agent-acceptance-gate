# Leo Labs OKX 优化波次路线图（2026-07-07）

状态：wave-1 执行中 · Hackathon 暂缓

## Wave 1（当前）— 优化 → 审核 → 发推

| 步骤 | 动作 | 状态 |
|------|------|------|
| 1 | Worker：分服务定价 + 每 IP 每服务 1 次免费试用 + GET sample | ✅ 代码完成 |
| 2 | Cloudflare deploy + KV `TRIAL_KV` | ⏳ deploy |
| 3 | onchainos：4 服务改价 + listing 文案 + activate | ⏳ |
| 4 | 等 OKX 审核（头像 + 服务更新） | 待 |
| 5 | Leo 截图 listing → 发 v18 Quote 推 | 待审核通过 |

### 新定价（链上 listing + x402 对齐）

| 服务 | 旧价 | 新价 |
|------|------|------|
| Agent Delivery Audit Gate | 1 | **0.2** |
| Event Price Divergence Radar | 1 | **0.1** |
| World Cup Smart Money Radar | 1 | **0.1** |
| Polymarket Smart Money Radar | 1 | **0.05** |

### 计费规则

- 每个客户端 IP、每个服务 path：**首次 POST 免费**（`billing.mode=free_trial`）
- 之后 x402 按上表收费
- **GET 同 path** = 公开 sample（不需付费）

---

## Wave 2 — 发推后观察（1–2 周）

- 看免费试用 → 付费转化、平台调用次数
- 每周一刷新 marketplace 扫描数字（`research/2026-07-06-marketplace-catalog-scan.md`）
- GitHub 同步开源：每个服务 README + 示例请求/响应
- 弱服务处理：Polymarket 全市场聪明钱若仍 0 调用 → 降级维护或替换

---

## Wave 3 — 新服务工厂（Hackathon 前可选）

- 需求来源：社群池 / 外部信号 / 自有 PolyData 痛点
- 流水线：`需求 → ≤1天实现 → GitHub → api.leolabs.me → onchainos create`
- 候选（非承诺）：PM Trade Preflight、Regime Radar 上架、全新 Hackathon 单品
- **Hackathon**：等 Wave 1 发推完成后再定；可能用新服务而非继续堆现有 radar

---

## 不在本波做

- 不等 Hackathon demo 视频
- 不冲营收火箭赛道（需真实付费记录）
- 不强行凑满 5 个 listing
