# Predict 6-24 迁移与 Turbo 产品线计划

日期：2026-07-10（决策记录）
背景事件：DeepBook Predict 测试网 `predict-testnet-4-16` → `predict-testnet-6-24` 迁移，旧部署整体下线。
术语以根目录 [CONTEXT.md](../../../CONTEXT.md) 为准。本文档只记录决策与范围，不含排期。

## 1. 根因（已验证）

- 旧 indexer `predict-server.testnet.mystenlabs.com` 已返回 HTTP 500；App 全部数据经 `/api/predict` 代理打到它，故线上全空白。
- 旧部署整体死亡：oracle 停更、市场停止创建，旧仓位永久冻结。**不存在"兼容/等待"选项，只能迁移。**
- 新部署健康：`predict-server-beta.testnet.mystenlabs.com`，1m/5m/1h 三档 cadence 滚动开市，结算在到期后秒级落地（实测 0.3–6 秒）。
- 上游口头表示 multi-day cadence 将在近期恢复。**按纯上行期权处理：任何关键路径不依赖上游的时间承诺。**
- **叠加断裂：Sui 测试网公共 JSON-RPC 已关停**（2026-07-06 当周；JSON-RPC 于 2026-07-31 永久停用，mainnet 公共端点 07-20 当周关闭）。实测 `fullnode.testnet.sui.io` JSON-RPC 返回 404；同 host 的 gRPC 与 `graphql.testnet.sui.io` 均正常。受影响代码：devInspect 报价、Note 事件索引、旧 manager-state 路由（三处均在本迁移重写/删除范围内）。dapp-kit 已走 gRPC，钱包与交易执行不受影响。

## 2. 已定决策

| # | 决策 | 要点 |
|---|---|---|
| D1 | 不依赖上游时间承诺 | 产品关键路径只建立在链上已存在的市场之上；multi-day 恢复视为上行选项 |
| D2 | **Turbo 独立产品线** | 完整双币投资 payoff，一个字不简化；产品定位锚定结构化理财，不做简化的涨跌/区间玩法 |
| D3 | **Turbo 只用小时级市场** | 1h cadence 的三个滚动到期 ≈ 1h/2h/3h 三档期限；刻意不做分钟级（理财产品按分钟结算反直觉）；期限 < 1 天展示单期收益，禁用年化 APR |
| D4 | 产品页数据降级策略 | 有真实市场用真数据；缺失时用 fixture + 明确标注来源与恢复预期；multi-day 恢复后**多日双币投资页**切真数据（与 Turbo 共享同一链路，仅市场筛选条件不同）。不含 Shark Fin 前端。 |
| D5 | **合约加 `order_ids` 并重发** | `ProductNote` 增加 `order_ids: vector<u256>`（mint 返回值同 PTB 传入）；领取自包含，不依赖 indexer 反查；旧部署 note 作废不迁移；字段语义按 CONTEXT.md 清理（Manager 概念已被 AccountWrapper 取代） |
| D6 | **报价三层防线** | ① 浏览：链下 SVI 定价（复用 `predictPricing.ts`，数据源换 propbook indexer）② 签名前：真实 PTB 经 gRPC `simulateTransaction` 拿精确成本并提前暴露 abort ③ 链上：`max_cost` + `max_probability` 滑点上限 = 模拟成本 × 小容差（~1.5%） |
| D7 | **传输层策略：JSON-RPC 清零** | 实时读 / 交易模拟 / 执行走 gRPC（dapp-kit 现状保持）；事件与索引类查询走 GraphQL；组合页 Note 列表优先用 gRPC `listOwnedObjects`（Note 为用户持有对象，自带全部状态）。迁移完成后代码库不得残留任何 JSON-RPC 客户端引用 |

## 3. 工程范围

### 3.1 止血（立即可做，非代码）
- 线上环境开 `NEXT_PUBLIC_ANKER_DEMO_MODE=true`：fixture 数据 + 禁交易 + 横幅，替代全站空白。新链路验证通过后关闭。

### 3.2 配置层
- Vendor 上游 `deployment.testnet.json`（原样入库 + schema 解析），替代散装常量。下次上游迁移 = 换一个 JSON。
- 覆盖新部署全部 ID：5 个包、5 个共享对象、4 个 oracle feed、`AccumulatorRoot`（`0x…0acc`）、DUSDC coin type（与旧版相同，已有余额可用）。
- Indexer 双端点：predict（交易路径必需）+ propbook（oracle 数据）。
- RPC 端点进配置（D7）：gRPC baseUrl（现 `TESTNET_GRPC_URL` 名实相符化）+ GraphQL endpoint；JSON-RPC 相关常量与客户端删除。

### 3.3 数据层
- `predictServer.ts` 重写为新 API 形状：`/markets`、`/markets/{id}/state`（结算价）、`/manager-orders` 等；oracle spot/forward/SVI 走 propbook indexer。
- `/api/predict` 代理指向新 server，allowlist 重写；按需增加 propbook 代理。
- 市场发现：按 cadence 筛选（Turbo 只取 1h cadence 的滚动市场）。
- `predictManagers.ts`（Manager 查询）删除，改为 `account_registry::derived_wrapper_address` 派生查询。

### 3.4 报价层（D6 三层防线）
- 展示报价：`predictPricing.ts` SVI 数字期权定价 + 新数据源；复算链上费用分量（base_fee/min_fee/EWMA）以缩小与真实成本的偏差。
- 签名前模拟：完整 PTB 经 gRPC `simulateTransaction`，取精确成本刷新 UI 终值。
- 滑点参数进 mint 调用。

### 3.5 交易层
- 收敛出 `PredictAdapter` 边界（发现市场 / 报价 / 铸腿 / 赎腿 / 查仓位），产品层不感知 DeepBook 版本；上游再迁移时只加一个 adapter 实现。
- 订阅 PTB：确保 wrapper（首次 `account_registry::new` + share）→ `generate_auth` → `deposit_funds<DUSDC>` → `load_live_pricer` → 逐腿 `mint_exact_quantity`（含 D6 滑点参数）→ mint 返回的 order_id 传入 `new_dual_investment_note` → note 转给用户。
- 领取 PTB：从 note 读 `order_ids` → 逐腿 `redeem_settled`（无权限、无 Auth、无 Pricer）→ `withdraw_funds` → `record_redeem_with_fee`。
- 二元→区间映射：binary-up(K) = `[K, +∞)`（无穷大 sentinel tick）；价格单位从 1e9 定点改为 tick 索引（$0.01 网格，admission $1 网格）。

### 3.6 合约层（D5）
- `product_note.move`：加 `order_ids: vector<u256>`；字段/命名对齐 CONTEXT.md；重新发布，更新 `deployments/testnet.json`；旧 Registry/note 作废。

### 3.7 产品层
- Turbo 产品线：产品卡、订阅面板（目标价选择器 + 1h/2h/3h 期限）、单期收益展示（禁 APR）。
- 多日双币投资页：按 D4 降级策略展示；multi-day 恢复则双币投资页切真数据（仅筛选条件切换 + 快速回归）。**Shark Fin 不在本迁移产品范围**（合约侧保留 kind；前端路径已于 2026-06-19 移除，本次不恢复）。
- 组合页：仓位状态机（倒计时中 / 已结算可领取 / 已领取），领取按钮走 3.5 领取 PTB；Note 列表经 gRPC `listOwnedObjects`，事件历史索引（现 JSON-RPC 实现已失效）迁 GraphQL 或降级为对象读取（D7）。

### 3.8 工具脚本
- 错峰批量订阅脚本：给定钱包按固定间隔连续订阅 Turbo，用于端到端链路验证（订阅→到期→结算→领取全周期回归）。

## 4. 风险与对策

| 风险 | 对策 |
|---|---|
| multi-day cadence 未如期恢复 | D1/D4：关键路径不依赖它；fixture + 标注展示产品完整形态 |
| 链下报价与链上成本偏差导致 mint abort | D6 三层防线（dryRun + 滑点容差） |
| 上游再次迁移（主网前大概率还有） | vendor deployment JSON + PredictAdapter 边界 |
| oracle feed 过期 / 市场暂停导致交易 abort | 签名前模拟提前暴露；UI 呈现可读错误而非裸 abort 码 |
| JSON-RPC 残留引用在 07-31 后彻底失效 | D7：迁移完成即清零；mainnet 公共端点 07-20 当周关闭，主网部署前复查传输层 |

## 5. 参考资料

- 上游迁移文档与部署清单：`deepbookv3` 仓库 `predict-testnet-6-24` 分支 `packages/predict/deployment/`（README §4 为 4-16 迁移指南；`deployment.testnet.json` 为 ID 唯一事实源）
- 新 indexer：`https://predict-server-beta.testnet.mystenlabs.com`；propbook：`https://propbook.api.testnet.mystenlabs.com`
- 领域词汇表：[CONTEXT.md](../../../CONTEXT.md)
