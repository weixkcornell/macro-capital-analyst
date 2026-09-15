# 观澜 · 宏观与资本市场分析师领域包（domain-pack）

> 一个以「智见专家库 Expert Profile v2（schemaVersion 2）」格式组织的**个人专家开源包**。参考智见专家 Agent 的领域包规范，但**独立自主发布**，不依赖任何平台评审。

## 这是什么

「观澜」是一名宏观与资本市场的**独立分析师**。它融会十四部经典著作、大类资产配置研报与 CFA 教材基础层（2020 L1 六卷 57 Reading / 2025 L1-L3 十三卷 102 Learning Module），形成一套自己的分析框架：

- **九层能力**：数据读数 → 货币信用 → 宏观骨架 → 金融定价 → 预期收益 → 组合管理 → 宏观因子周期 → 横截面因子 → 摩擦可执行。
- **两道横切闸门**：统计可信（t 阈值分档 / 样本量 / 肥尾禁用正态外推）+ 摩擦可执行（毛 α − 摩擦 = 净 α，净 α ≤ 0 不发布）。
- **六步内化流程**：钱从哪来 → 钱变利润 → 价格装多少预期 → 结构定价自洽 → 周期定位风险归属 → 错了会怎样。
- **持续自主学习**：检测新书 → 逐章精读 → 提炼方法论 → 整合进框架。

## 开源范围（重要）

本包采用**分层开源**策略：

| 层 | 内容 | 授权 |
|---|---|---|
| ✅ 开放层 | 观澜自有方法论/工艺/配置（九层能力、六步流程、两道闸门、输出规范、场景 DAG） | MIT |
| ⛔ 受限层 | 原著/CFA 教材原文（PDF/EPUB） | 版权归原作者/出版方，**不随包分发** |

详细溯源见 `source/SOURCE-MANIFEST.json`。**编造专家观点比不回答更严重**——本包所有观点均可溯源，无授权来源不入库。

## 目录结构

```
macro-capital-analyst/
├── pack.json                          # 包清单 + 口径声明（caliberDeclarations）
├── experts/macro-capital-analyst.json # Expert Profile v2（核心，全字段）
├── scenarios/
│   ├── a-share-outlook.json           # 「A股观点看板」任务 DAG
│   └── cycle-positioning.json         # 「周期定位与配置研判」任务 DAG
├── method-packs/
│   ├── six-step-internalization.json  # 六步内化流程
│   ├── nine-layer-framework.json      # 九层能力框架
│   └── dual-gates.json                # 两道横切闸门
├── skills/macro-capital-framework/SKILL.md  # 工艺规范
├── output-templates/
│   ├── a-share-outlook.json           # 看板输出模板
│   └── cycle-positioning.json         # 研判输出模板
├── quality-policies/baseline.json     # 五道起步门禁
├── knowledge-providers/book-library.json   # 知识供给声明
├── routing/routing.json               # 路由表
├── source/SOURCE-MANIFEST.json        # 溯源与授权登记
└── LICENSE                            # MIT
```

## 两种使用方式

**方式一：智见平台/兼容 harness 直接挂载**

将本目录放到 `domain-packs/` 下，按平台的领域包加载流程识别专家、场景、方法包与门禁。

**方式二：纯参考（无平台）**

把 `experts/macro-capital-analyst.json` 的 `persona` / `methodProfile` / `emm` / `outputSchema` 作为系统提示词或研究框架使用；`method-packs/` 与 `skills/` 直接当方法论手册读。

## 数据口径

本包声明四类口径（见 `pack.json` 的 `caliberDeclarations`）：统计局、央行、公开 K 线自算、Wind（可选）。本机无 Wind/iFinD，行情用公开 K 线自算；forward EPS、一致预期等缺失层在「方法可靠性声明」显式标注。

## 免责声明

本包为方法论与提示词工艺的开源发布，**不构成任何投资建议**。过往分析不预示未来表现；海外实证数值仅作数量级参考，A 股须重新标定。

## 版本历史

- **2.0.0**（2026-09-16）：方法底座扩至十四部著作 + CFA 2025 十三卷；补全完全体实体（方法包 ×3、场景 ×2、输出模板 ×2、质量门禁、知识供给、路由、溯源清单）。
- 1.0.0（初版）：核心 Profile + pack + 单场景。
