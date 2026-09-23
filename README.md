# 观澜 · 宏观与资本市场分析师领域包（domain-pack）

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/Version-2.3.0-brightgreen">
  <img alt="schemaVersion" src="https://img.shields.io/badge/schemaVersion-2-orange">
  <img alt="Expert Profile v2" src="https://img.shields.io/badge/Expert%20Profile-v2-9cf">
  <img alt="领域" src="https://img.shields.io/badge/%E9%A2%86%E5%9F%9F-%E9%87%91%E8%9E%8D%E6%8A%95%E8%B5%84-red">
</p>

> 一个以「智见专家库 Expert Profile v2（schemaVersion 2）」格式组织的**个人专家开源包**。参考智见专家 Agent 的领域包规范，但**独立自主发布**，不依赖任何平台评审。

## 这是什么

「观澜」是一名宏观与资本市场的**独立分析师**。它融会 17 部专著（徐高×2、李奇霖、统计指标手册、李斌伍戈、Grinold&Kahn、钦塞瑞尼、Ilmanen、佩德森、石川、Andrew Ang、马克斯、劳顿、小哈斯莱特、Kerry Back、Karolyi、Bali）+ 2 套基础教材（CFA 2020 L1 六卷 / CFA 2025 L1-L3 十三卷）+ 2 份大类资产配置研报 + 17 篇学术论文，共 **38 源 / 43 份精读**，形成一套自己的分析框架：

- **第 0 层 · 基准与目标函数（总开关）**：基准=沪深300（价格指数口径）+ 绝对收益风险约束（回撤 −20%、现金 20%）+ 事前风控档位表 → 主动风险额度。
- **九层能力**：数据读数 → 货币信用 → 宏观骨架 → 金融定价 → 预期收益 → 组合管理 → 宏观因子周期 → 横截面因子 → 摩擦可执行。
- **主动收益框架**：主动权重向量 w_a → σ_A（协方差口径）→ MCTR/CTR 欧拉分解 → E[R_A] 三项分解（carry／估值收敛／盈利差）→ IR=IC×√BR → IC*。
- **两道横切闸门**：统计可信（t 阈值分档 + 多重检验校正 + Haircut/Deflated Sharpe **正反双校准**——发表偏误仅需收缩 10–15%，未过校正 ≠ 反向信号成立）+ 实施成本与可执行（E[R_A] − 实施成本 = 净预期主动收益，净额 ≤ 0 不发布）。
- **六步内化流程**：钱从哪来 → 钱变利润 → 价格装多少预期 → 结构定价自洽 → 周期定位风险归属 → 错了会怎样。
- **分层凯利下注上限**：2P−1 中的 P 按可预测性聚类分层取用（高可预测聚类用实证分层 P，低可预测资产 P 收敛 0.50）。
- **持续自主学习**：检测新资料 → 逐章精读 → 提炼方法论 → 整合进框架 → 知识账本登记。

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
├── README.md
├── SUBMISSION-CHECKLIST.md            # 提交物验收清单
├── pack.json                          # 包清单（id/version/schemaVersion/口径声明）
├── experts/
│   └── macro-capital-analyst.json     # 专家 Profile v2（全字段）
├── knowledge/
│   └── experts/
│       └── macro-capital-analyst/     # 知识底座（原著不随包分发）
├── domain-knowledge/
│   └── macro-capital-analyst-kb.json  # 领域本体（实体 / 关系 / 检索剖面）
├── knowledge-providers/
│   └── macro-capital-analyst-library.json  # 知识供给声明（38 源 / 43 份精读）
├── scenarios/
│   ├── a-share-outlook.json           # 「A股观点看板」任务 DAG
│   └── cycle-positioning.json         # 「周期定位与配置研判」任务 DAG
├── output-templates/
│   ├── a-share-outlook.json           # 看板输出模板（documentStructure/dataRules/rendering）
│   └── cycle-positioning.json         # 研判输出模板
├── quality-policies/
│   └── baseline.json                  # 起步门禁 10 道（含 gate-a-double-calibration / net-active-return-required / active-risk-budget）
├── method-packs/
│   ├── six-step-internalization.json  # 六步内化流程（§0 权威步骤定义）
│   ├── nine-layer-framework.json      # 九层能力框架
│   └── dual-gates.json                # 两道横切闸门
├── team-templates/
│   ├── a-share-outlook-team.json      # 看板组队模板（scenarios 引用）
│   └── cycle-positioning-team.json    # 研判组队模板
├── skills/
│   └── macro-capital-framework/
│       ├── SKILL.md                   # 工艺规范（§0/§1/§2/§3）
│       └── references/
│           ├── checklist-template.md  # 交付 checklist
│           └── scripts/
│               └── i1_collision_check.py  # §3.3 三方对撞参考实现
├── data-contracts/
│   └── capability-contract.csv        # 数据源能力契约表
├── skill-packages/
│   └── macro-capital-framework.json   # 技能包清单（source.digest + digestTarget）
├── tool-providers/
│   └── macro-capital-tools.json       # 工具集（macro.collision.check CLI）
├── scripts/
│   └── check-pack.mjs                 # 领域包自检（version lockstep + 跨维度绑定 + DAG）
├── source/
│   └── SOURCE-MANIFEST.json           # 溯源清单（38 份材料）
└── LICENSE                            # MIT
```

## 两种使用方式

**方式一：智见平台/兼容 harness 直接挂载**

将本目录放到 `domain-packs/` 下，按平台的领域包加载流程识别专家、场景、方法包与门禁。

**方式二：纯参考（无平台）**

把 `experts/macro-capital-analyst.json` 的 `persona` / `methodProfile` / `emm` / `outputSchema` 作为系统提示词或研究框架使用；`skills/` 直接当方法论手册读。

## 中文使用示例

### 示例一：更新今日 A 股市场观点看板

> 「帮我更新今日『中国A股市场观点看板』」

观澜会依次：跑自建数据引擎刷新四档分位 / 年化波动 / 最大回撤 → 检索近一周券商公开观点作对照组 → 按六步内化流程重构观点、过两道闸门（净预期主动收益 ≤ 0 不发布）→ 产出含「摘要 / 市场共识与我的分歧 / 六步主体 / 主动收益与净额 / 上期判断回顾 / 方法可靠性声明 / 脚注」的自包含 HTML（涨=红、跌=绿）。

### 示例二：周期定位与风格配置

> 「分析当前宏观周期位置，给出 A 股风格与资产配置建议」

观澜会：定位四因子状态（增长 / 通胀 / 信用 / 利率）与投资时钟象限 → 用前瞻指标（E/P、股债性价比、信用利差、期限溢价）测算预期收益 → 因子归因三要素 → 给出「E[R_A] − 实施成本 = 净预期主动收益」的配置结论，并声明 w_a／σ_A、ADV 容量与适用资金规模上限。

### 示例三：自主学习新资料

> 「检查书籍库有没有新书，自主学习并更新分析框架」

观澜会：列书籍目录比对已读清单 → 下载新增著作逐章五段式精读 → 提炼机制整合进九层能力 → 记录学习日志。

### 作为系统提示词（最小用法）

直接把 `experts/macro-capital-analyst.json` 的 `persona`、`methodProfile`、`emm`、`outputSchema` 四段拼接为系统提示词，即可让任意 LLM 以「观澜」的视角输出；`skills/` 作为可引用的方法论手册。

## 数据口径

本包声明四类口径（见 `pack.json` 的 `caliberDeclarations`）：统计局、央行、公开 K 线自算、Wind（可选）。本机无 Wind/iFinD，行情用公开 K 线自算；forward EPS、一致预期等缺失层在「方法可靠性声明」显式标注。

## 免责声明

本包为方法论与提示词工艺的开源发布，**不构成任何投资建议**。过往分析不预示未来表现；海外实证数值仅作数量级参考，A 股须重新标定。

## 版本历史

- **2.3.0**（2026-09-23）：同步 macro-capital-market-analysis **v24**——① **闸门 A 整合为正反双校准**（正向 Haircut/Deflated Sharpe 折半 + 反向依 Chen-Zimmermann 2022 发表偏误仅需收缩 10–15%，明确「未过校正 ≠ 反向信号成立」红线），新增门禁 `gate-a-double-calibration`；② **凯利一致性加入分层 P**（依 Cong et al. 2026 可预测性资产特定 + 状态依赖，下注上限按可预测性聚类取 P）；③ 新增 5 篇论文精读（油价-货币通胀分解、美元避险定价、地缘碎片化量化、发表偏误再校准、可预测性异质性），知识底座 **33→38 源 / 38→43 份精读**；④ 本体补 4 实体 + 3 关系，`pack.json` 描述改为按账本口径的准确分类（17 专著 + 2 教材 + 2 研报 + 17 论文）；⑤ `skill-packages` 的 `source.digest` 改为可复现的 `sha256(SKILL.md)` 并显式声明 `digestTarget`（原 digest 无法用任何可复现算法对应现有内容，属声明漂移）。
- **2.2.0**（2026-09-17）：同步 macro-capital-market-analysis **v21**——新增**第 0 层「基准与目标函数」**（沪深300 基准 + 绝对收益风险约束 + 事前风控档位表 + 主动风险额度精算）、**主动收益框架**（w_a／σ_A／MCTR-CTR 欧拉分解／E[R_A] 三项分解／IR=IC×√BR／IC*）、**闸门 A/B 论文级判据**（多重检验校正 BH-FDR+Bonferroni、Haircut/Deflated Sharpe 双口径、Frazzini 成本五度量法）、**术语全面更换**（毛α→E[R_A]、净α→净预期主动收益、摩擦→实施成本、break-even→IC*）；知识底座 **19→33 源**（新增 12 篇学术论文 + 3 本专著）；门禁新增 `active-risk-budget` 硬门。
- **2.1.0 实体回退**（2026-09-16）：`experts/` / `scenarios/` / `output-templates/` / `quality-policies/` 四类实体统一回退为 Expert Profile v2 本机可用 schema（`proficiency` 整数 1–5、output-templates 保留 `media`/`sections`/`renderModes`、quality-policies 保留 `gates[].kind`/`appliesTo`、scenarios 保留 `outputTemplate`/`qualityPolicy`/`teamTemplate`），同时**保留 v2.1.0 的实体内容**——output-templates 追加 `dataRules`/`documentStructure`/`rendering`，scenarios 追加 `description`/`skill` 与「动手前先读 SKILL.md」约束，quality-policies 新增 `placeholder-clean`、`net-alpha-required` 两道硬门，expert 恢复 `methods` 与含两条硬规则的 `evidenceStandard`。`quality-policies/` 由按场景拆分（2 文件）回到单一 `baseline.json`。
- **2.1.0 修订**（2026-09-16）：补回 `method-packs/`（六步/九层/双闸门）与 `references/scripts/i1_collision_check.py`，恢复 §2.7 量纲与口径交叉校验、§3.3 摘要—正文—底座三方对撞两条硬规则（2.1.0 模板重排中遗漏）；`SOURCE-MANIFEST.json` 的 `materials[]` 补回 `status` / `distributable` / `fileRef` 字段；修正 README 版本徽章。
- **2.1.0**（2026-09-16）：按 zhijian-sample-pack 模板重排——目录对齐（`knowledge/` + `data-contracts/`，去除 method-packs/routing）、字段对齐（output-templates 用 `documentStructure`、quality-policies 用 `severity`+`bannedTokens`、SOURCE-MANIFEST 用 `materials[]`）、补 `SUBMISSION-CHECKLIST.md` 与 `capability-contract.csv`。
- **2.0.0**（2026-09-16）：方法底座扩至十四部著作 + CFA 2025 十三卷；补全完全体实体。
- 1.0.0（初版）：核心 Profile + pack + 单场景。
