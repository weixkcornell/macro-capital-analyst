# 观澜 · 宏观与资本市场分析师领域包（domain-pack）

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-blue.svg"></a>
  <img alt="Version" src="https://img.shields.io/badge/Version-2.8.6-brightgreen">
  <img alt="schemaVersion" src="https://img.shields.io/badge/schemaVersion-2-orange">
  <img alt="Expert Profile v2" src="https://img.shields.io/badge/Expert%20Profile-v2-9cf">
  <img alt="领域" src="https://img.shields.io/badge/%E9%A2%86%E5%9F%9F-%E9%87%91%E8%9E%8D%E6%8A%95%E8%B5%84-red">
</p>

> 一个以「智见专家库 Expert Profile v2（schemaVersion 2）」格式组织的**个人专家开源包**。参考智见专家 Agent 的领域包规范，但**独立自主发布**，不依赖任何平台评审。

## 这是什么

「观澜」是一名宏观与资本市场的**独立分析师**。它融会 23 部专著（徐高×2、李奇霖、统计指标手册、李斌伍戈、Grinold&Kahn、钦塞瑞尼、Ilmanen、佩德森、石川、Andrew Ang、马克斯、劳顿、小哈斯莱特、Kerry Back、Karolyi、Bali 2016、Campbell、Paleologo、Falkenstein、Donnelly、Ferson、Kim & Brown、Costello）+ 2 套基础教材（CFA 2020 L1 六卷 / CFA 2025 L1-L3 十三卷）+ 2 份大类资产配置研报 + 18 篇学术论文，共 **46 源 / 54 份精读**，形成一套自己的分析框架：

- **第 0 层 · 基准与目标函数（总开关）**：基准=沪深300（价格指数口径）+ 绝对收益风险约束（回撤 −20%、现金 20%）+ 事前风控档位表 → 主动风险额度。
- **十三层能力**：数据读数 → 货币信用 → 宏观骨架 → 金融定价 → 预期收益 → 组合管理 → 宏观因子周期 → 横截面因子 → 摩擦可执行 → 模型实证检验 → 风险边界与极端事件 → 信息不对称与微观结构 → 组合工程与生存约束。
- **主动收益框架**：主动权重向量 w_a → σ_A（协方差口径）→ MCTR/CTR 欧拉分解 → E[R_A] 三项分解（carry／估值收敛／盈利差）→ IR=IC×√BR → IC*。
- **两道横切闸门**：统计可信（t 阈值分档 + 多重检验校正 + Haircut/Deflated Sharpe **正反双校准**——发表偏误仅需收缩 10–15%，未过校正 ≠ 反向信号成立）+ 实施成本与可执行（E[R_A] − 实施成本 = 净预期主动收益，净额 ≤ 0 不发布）。
- **六步内化流程**：钱从哪来 → 钱变利润 → 价格装多少预期 → 结构定价自洽 → 周期定位风险归属 → 错了会怎样。
- **分层凯利下注上限**：2P−1 中的 P 按可预测性聚类分层取用（高可预测聚类用实证分层 P，低可预测资产 P 收敛 0.50）。
- **持续自主学习**：检测新资料 → 逐章精读 → 提炼方法论 → 整合进框架 → 知识账本登记。

## 开源范围（重要）

本包采用**分层开源**策略：

| 层 | 内容 | 授权 |
|---|---|---|
| ✅ 开放层 | 观澜自有方法论/工艺/配置（十三层能力、六步流程、两道闸门、主动收益三分解、输出规范、场景 DAG） | MIT |
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
│   └── macro-capital-analyst-library.json  # 知识供给声明（46 源 / 54 份精读）
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
│   ├── thirteen-layer-framework.json  # 十三层能力框架
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
│   └── SOURCE-MANIFEST.json           # 溯源清单（46 份材料）
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

观澜会：列书籍目录比对已读清单 → 下载新增著作逐章五段式精读 → 提炼机制整合进十三层能力 → 记录学习日志。

### 作为系统提示词（最小用法）

直接把 `experts/macro-capital-analyst.json` 的 `persona`、`methodProfile`、`emm`、`outputSchema` 四段拼接为系统提示词，即可让任意 LLM 以「观澜」的视角输出；`skills/` 作为可引用的方法论手册。

## 数据口径

本包声明八类口径（见 `pack.json` 的 `caliberDeclarations`）：**Wind（取数优先级第 1 档）**、统计局、央行、公开 K 线自算、westock、北向、申万、中证。

**取数优先级（v2.8.0 起）**：任何数据一律**先试 Wind CLI**；Wind 取不到（未安装 / 无权限 / 无该字段 / 调用失败）**再退回其他方式**——westock CLI → 公开接口自算 → 外部口径（须标来源与 as-of）。**禁止跳过 Wind CLI 直接走公开接口**；本期实际落在哪一档、以及未走 Wind 的原因，须在「方法可靠性声明」写明。说明：本机当前未解析到 Wind CLI，故在 Wind 就绪前运行会落到退回档，此时 forward EPS、个股级一致预期、汇率与美元指数历史序列等仍缺，须如实声明。

## 免责声明

本包为方法论与提示词工艺的开源发布，**不构成任何投资建议**。过往分析不预示未来表现；海外实证数值仅作数量级参考，A 股须重新标定。

## 知识底座与自建说明

本仓**只含「方法论内化摘要层」**：46 份源材料（原著／教材／论文）受版权约束、**不随包分发** ——
`source/SOURCE-MANIFEST.json` 里每一条 `materials[].fileRef` 在本仓**都解析不到**，这是设计（46/46 条 `distributable: false`），
解析根见该文件的 `fileRefRoot` 字段。**怎么自建你自己的知识底座**（准备材料／写内化摘要／改 `fileRefRoot`／版权边界）见
[`knowledge/experts/macro-capital-analyst/README.md`](knowledge/experts/macro-capital-analyst/README.md)。

英文概览见 [`README.en.md`](README.en.md)，贡献与提交前检查见 [`CONTRIBUTING.md`](CONTRIBUTING.md)。

## 版本历史


- **2.8.6**（2026-09-30）：**杂志版三处修正（桌面封面三格基线、导语未过行内解析、走势图最高值标注）** —— ① **缺陷**：`:::lede` 渲染时未走行内解析，`**不发布主动头寸**` 被原样输出为星号（导语是杂志版最显眼的「一句话说清结论」，此处失效影响最大）；② **版式**：桌面端封面三格原为「标签左 / 数字右」横排，标签折行后三格数字基线错位 ⇒ 改为纵向（标签在上、数字在下，数字降到 h4 档），三格对齐；③ **易懂**：封面走势小图的最高值原为裸数字 `4876.31`，改为 `区间最高 4876.31`，读者不必反推这个数是什么意思；④ 实测：杂志试样 `render-overflow` 六视口 0 溢出 + 对比度 **424/424**；`mobile-readability` 320/375/390 全 PASS；`template-conformance` PASS。⑤ 纯修正：判据结构、register、组件与图型集合不变。

- **2.8.5**（2026-09-30）：**输出模板改版为「移动端杂志」register（封面 + 读懂这一层 + 杂志向小图）** —— ① **register 变更**：2.8.4 的 register 是「印刷研究札记」，第一阅读场景默认桌面；本版改为**移动端杂志**——手机竖屏、单手、碎片时间，数据密度让位于可读性。`designSystem.register` 记明这一判断与两个 dials（soul 0.5／spectacle 0.25／density 0.55）。② **封面（新组件 5 个）**：`:::cover`（刊头 + 金色刊期 hero 56px + 标题 + 导语 + 元信息）、`:::cover-stats`（封面关键数字，深底提亮方向色 `upOnCover/downOnCover`）、`:::cover-art`（**必须真实序列**：本期用沪深300 近 60 个交易日真实收盘序列画走势小图，标出区间高低与首末日）；移动端封面 band 打满屏宽（负外边距抵消安全区沟槽）。③ **「读懂这一层」（易懂）**：新增 `:::takeaway`（每章一处、大白话 ≤3 条，金色规则线 + 「读」徽标）、`:::lede`（导语，一句话说清结论）、`:::glossary`（术语表：bp／分位／首次穿越／净预期主动收益，带换算例）——它们只做「翻译」，不得引入正文没有的新数字。④ **杂志向小图（图型 6→12 种）**：新增 `sparkline`（封面/章首走势）、`microbar`、`gauge`（单值落 0–100 量程）、`donut`（占比 + 图例）、`pictogram`（象形图，标分母）、`timeline`；全部沿用「**无数字不绘**」铁律与 640 viewBox 字号规约。⑤ **排版**：正文 17→**18px**（手机长读）、新增 hero 档 56px、章节开场改为 42px 大号编号（真实可读文本，不做低对比「幽灵数字」，以保 AA）。⑥ **同批修掉**：`takeaway` 徽标纸面字在 amber600 上仅 3.99:1（改 amber700 = 5.86:1）；封面小图非全出血致 320 档图内文字 10.06px（改全出血 + 22/24px 字号 ⇒ 320 档 12px）；封面 body 行的 `issue=2026 Q4` 未被解析（键值解析统一支持 `键=值`）；行内「裸数字」过度包裹（只保留「值+单位」原子，避免 `2026-10<span>-01</span>` 这类噪声）。⑦ **实测**：杂志试样 `render-overflow` 六视口 0 溢出 + 对比度 **423/423**；`mobile-readability` 320/375/390 全 PASS（封面小图等效字号 12 / 14.06 / 14.63px）；`template-conformance` PASS。⑧ 判据结构、取数优先级与 fail-closed 纪律不变；不新增知识源、不新增实体。

- **2.8.4**（2026-09-30）：**重写输出模板：模板从「愿望清单」变成可核对的版式契约（designSystem + 指令语法 + 一致性门）** —— ① **问题（v1 实况）**：`output-templates/*.json` 只有章节骨架与散文式 `rendering.notes`，版式其实写死在渲染器里；本次交付实测发现**真正决定质感的是一个 82KB 的一次性渲染脚本**（数据、12 张 SVG、KPI、章节全部硬编码在交付目录里），于是模板说什么与产物长什么样可以完全无关，质感无法复用、无法门禁。② **模板侧**：`output-templates/a-share-outlook.json`（及与之共用同一 designSystem 的 `cycle-positioning.json`）新增 `designSystem`（tokens／roles／components／figures／print／a11y）与 `directives` 两块**可执行**声明 —— 染色中性色阶（`paper #fdfefc` 起，**禁 #fff/#000**）＋青墨/琥珀 register、1.2 模数字号阶（12/13/14/15/17/20/24/29/35/42）、4px 间距阶、染色投影、12 条 role 对比度声明（由 token 值重算，最小余量 1.063）、15 个组件的 DOM 结构/类名/状态、6 种图型白名单与画布规约（viewBox 640，图内字号 ≥19 ⇒ 375 下等效 11.14px ≥ 门禁 11px）、A4 打印与 a11y 规约。③ **渲染器侧**：`scripts/render-report.mjs` 重写为**通用执行器**（token + 指令驱动，不再内置版式）：tokens 逐条落成 CSS 自定义属性；`:::masthead/kpis/callout/quote/compare/caliber/inferences/figure/no-figure` 声明组件；**未声明指令 fail-closed**；figure 由**声明式数据**生成 SVG（bars/diverging/range/waterfall/steps/matrix），图号在 eyebrow/figcaption/aria-label/id **四处同源**并断言连续；渲染期断言**图内文字越界**与**SVG 几何越界**。④ **新增门 `template-conformance`（deterministic/hard）** 与执行器 `scripts/check-template-conformance.mjs`：roles 对比度重算、**产物 :root 的 token 取值必须与模板逐字相同**、已用组件的类名齐备、**禁 #fff/#000 底**、**禁档外字号**（font-size 只准 `var(--fs-*)` 或相对单位）、md 指令白名单、**同包各模板核心 token 必须一致**（一个包一个视觉身份）；自带 `--selftest`：**2 正向 + 5 负向，7/7**。⑤ **管线**：`audit-delivery.sh` 由 **7 件扩为 8 件**；`release-check.sh` 由 **六件套扩为七件套**；两个 team-template 各绑定该门（否则门禁声明无法运行，release 会 FAIL）。⑥ **同批修掉的真实缺陷**（均在本次试样上复现并留证）：h1 混合两种语域致换行后出现孤立「）」（拆成 eyebrow/title/lede 三角色）；KPI 值里的单位被换行孤立（值+单位改为不折行原子）；KPI 区间值整串不折行在 768 视口溢出 4px（改为逐段原子）；`range` 图因 lo/hi 取错致 `x2=7437` 几何飞出画布（改由配对两端推 lo/hi，并新增几何越界断言）；媒体查询顺序错误使 320 视口仍按两列排（400 规则被 480 覆盖）；标签/图注/元信息误用 `<p>` 拉低「正文中位字号」并误判移动端可读性（改为非段落元素，语义同时更正确）。⑦ **实测**：新渲染器产出的试样 `render-overflow` **六视口 0 溢出 + 对比度 415/415 全过**，`mobile-readability` **320/375/390 全 PASS**（8 张图最差等效字号 11.13／11.58px），`template-conformance` PASS。⑧ 纯增量：取数优先级、fail-closed 纪律与既有门禁判据结构不变；本次不新增知识源、不新增实体。
- **2.8.3**（2026-09-30）：**把 Wind 调用示例写进 SKILL + 新增「文档-契约一致性」发布前自检（防同类缺陷复发）** —— ① SKILL 增加**可直接复制**的两步命令（search 取码 → query 传 `question`+日期）、字段真相与 `HOME` 凭据解析警告。② 新增 `scripts/check-doc-commands.mjs`（**离线**、deterministic）：判据来自 `data-contracts/wind-tool-schemas.json`（由 `list-tools` 记录的真实 `inputSchema` + `capabilityMap`），校验**文档里的 CLI 示例**与 **CSV 的 `input_schema` 契约**两处的字段是否都落在真实 schema 内；并把它接入 `scripts/release-check.sh`（**五件套 → 六件套**）。③ **该方法经双向校准**：对当前包 PASS（4 处）；对 **2.8.1 缺陷版** FAIL —— 精准报出 `UNKNOWN_FIELD: indicator_code` 与 `MISSING_REQUIRED: question`。即：**这道门本可以在推送前拦住 2.8.1 那个缺陷**，这正是补它的理由。④ 纯增量：判据结构、取数优先级与 fail-closed 纪律不变。

- **2.8.2**（2026-09-30）：**修正 Wind 取数的真实调用签名 + 记录 HOME 陷阱（实测驱动）** —— ① 实测发现：`query_economic_indicator_data` **只收 `question`**（+可选 `beginDate`/`endDate`/`observation`/`targetMagnitude`/`targetCurrency`/`targetFrequency`），**不收 `indicator_code`**（传即 `PARAM_VALIDATION_ERROR`）；2.8.1 在 `data-contracts.wind.edb.query.input_schema`、`tool-providers.dataChannels.command` 与 `wind-provenance.cliRoute` 里把它写成了入参 ⇒ **文档中的命令跑不通**。本版改为「search 取码（用于引用）→ query 传 question+日期」，并写入实测证据。② **HOME 陷阱**：CLI 按 `homedir()` 解析 `~/.wind-aifinmarket/config`；当进程 `HOME` 非凭据所在用户家目录（本例为 workspace）时会**误报** `AUTH_ERROR『WIND_API_KEY 未配置』`。已写入 `wind-provenance.config.homeRequirement`：**该误报不等于凭据缺失**，须先按 homedir 复核再判 fail-closed。③ **首次实跑取数成功**并留证：`M0342072 沪深300指数:收盘价`（点·上海证券交易所·日频）2026-09-28/29/30 = **4340.755 / 4345.2088 / 4357.6155**，与公开 K 线自算 4340.76/4345.21 **两源一致**；`M0000612 中国:CPI:当月同比`（%·国家统计局·月频，截至 20260831）= 0.2/1.3/1.0/1.2/1.2/1.0/0.5/**0.8**。④ 本版为**纯修正**：不改判据结构、不动 2.8.0/2.8.1 的其它内容；取数优先级（Wind 第 1 档）与 fail-closed 纪律不变。

- **2.8.1**（2026-09-30）：**移动端可读性入包 + Wind 取数档位可执行化（在 2.8.0 取数优先级之上叠加）** —— ① **新增门 `mobile-readability`（visual/hard）**：375 主视口（覆盖 320/390）正文 ≥17px、图内文字**等效字号** ≥11px 或提供放大入口、触控目标 ≥44px、宽表卡片堆叠或受控横滚、页面级 0 溢出与 0 裁切重叠；`render-overflow` 视口补 **375×812**。② **新增门 `wind-provenance`（deterministic/hard）**：在 2.8.0 的「取数档位链（Wind→westock→公开→外部）」之上，把**凭据缺失 fail-closed、禁止重装/绕走、降级须逐项标注**落成可执行检查；`tool-providers` 增 `dataChannels.wind-edb` 声明（命令/三级凭据阶梯/失败语义/`lastProbe` 实测 `AUTH_ERROR`），`data-contracts` 增 `wind.edb.query` 与 `wind.edb.metadata`。③ **两个门禁执行工具**：`scripts/audit-mobile.py`（playwright 实测 computed style，含 `sr-only` 排除，避免把无障碍 skip-link 误报为裁切/小触控目标）与 `scripts/check-wind-provenance.py`（含 `--selftest`：2 正向 + 3 反向 —— 其 v1 曾因裸正则把纪律句「未绕走 analytics_data」判违规而**不可满足**，由正向对照抓出并修复）；`scripts/audit-delivery.sh` 由 5 件扩为 **7 件**（RELEASING.md 门禁表同步）。④ **包自带渲染器补齐移动端**：`scripts/render-report.mjs` 增桌面 rail → 窄屏顶部粘性目录条（h2 自动建目录、触控 ≥44px）、窄屏宽表卡片堆叠（`data-label` 逐格回填）、`tabular-nums`、`env(safe-area-inset-*)`、`@media print`；实测 `render-overflow` 六视口 0 溢出 + 对比度 **958/958**、`mobile-readability` 320/375/390 全 PASS —— 『声明移动端规格』与『工具能实现该规格』对齐。⑤ 与 2.8.0 的关系：**取数优先级规则保留上游原文并叠加**，不重复也不改写；本版为**纯增量**（上游 20 个文件的 2.8.0 改动全部保留）。⑥ 本版不新增知识源、不新增能力层。


- **2.8.0**（2026-09-30）：**同步 macro-capital-market-analysis v37 —— 取数优先级：Wind CLI 优先** —— ① **新增强制规则（取数优先级）**：**任何数据一律先试 Wind CLI**；Wind 取不到（未安装 / 无权限 / 无该字段 / 调用失败 / 超时）**再退回其他方式**，退回顺序为 **westock CLI → 公开接口自算（新浪 / 腾讯 fqkline / 中证 `index-perf` / 东财）→ 外部口径（须标来源与 as-of）**。**禁止跳过 Wind CLI 直接走公开接口**；**本期实际落在哪一档、以及未走 Wind 的原因，须在「方法可靠性声明」写明**。② **落地位置**：`pack.json` 的口径声明把 Wind 由「可选主定量源」升为「**取数优先级第 1 档**」；`experts` 的 `methodProfile.dataPreference` 置顶该规则，并补 1 条 `mentalModel`、2 条 `antiPattern`、1 条 `vetoRule`，`blindSpots` 由「本机无 Wind/iFinD」改为「Wind 不可用时的缺口」；`quality-policies/baseline.json` 的 `number-consistency` 门禁新增「取数档位声明」判据（`dataSourcePriority = [wind, westock, public-selfcompute, external-with-citation]`）；两个 scenario 的 `description`、`tool-providers` 的 `description` 与 `note`、包内 `skills/macro-capital-framework/SKILL.md` 的 §2 均写入该优先级。③ **同步全文因该规则而不成立的绝对陈述**（skill 侧 10 处、包侧 2 处）：「本机无 Wind/iFinD，forward EPS 与盈利预测修正层缺失」→「取数先试 Wind CLI，取不到再退回；实际档位须声明」；汇率与美元指数历史序列由「本机无历史」改为「先试 Wind CLI，不可用时自建序列」；附录 B gap-003 的补齐路径改为 Wind CLI 优先。④ **一处如实提示（非本包可解）**：规则是策略性的、自带退回条款；**本机当前未解析到 Wind CLI**（PATH 无 `wind`、无 Wind 安装目录），故在 Wind 就绪前所有运行都会落到退回档，此时「方法可靠性声明」须写明实际档位与原因。⑤ 本版**不新增知识源**（46 源 / 54 份精读不变）、**不新增实体**（43 个不变）；能力层、两道闸门判据的**内容**零变更。

- **2.7.0**（2026-09-29）：**同步 macro-capital-market-analysis v29–v35 —— 能力层扩至十三层 + 主动收益模块整体替换 + 语言硬规则（跨 7 个版本）** —— ① **能力层 9 → 13 层**：新增 ⑩ 资产定价模型的实证检验与诊断（主方程 E_t(mR)=1；α 必须绑定模型；triality 三路等价；宏观因子须先造因子模拟组合；HJ 界为排除工具）、⑪ 风险边界、破产约束与极端事件治理（概率不可赋值区域；VaR 操作性定义；凯利永不清零约束；压力测试反推法；黑洞扫描；极端动作须在平静日预设写死）、⑫ 信息不对称、微观结构与激励传导（三均衡阶梯；无交易定理；卖空约束的涨跌不对称；CGW 交易量-反转；DHS 有偏自我归因；激励→行为→价格）、⑬ 组合工程与生存约束（仓位规则即 alpha；Jagannathan-Ma 非负约束；杠杆地板与天花板；止损 efficiency 表；崩盘=跨投资者去杠杆）。② **主动收益模块整体替换（现行唯一口径）**：先按主动管理基础法则试 α=IC·z，本机实测 29 条行业指数的有效独立标的数只有 6.2（ρ̄=0.132、BR≈25）、三个估值口径 IC 全为负且 BH-FDR 与 Bonferroni 存活均 0 ⇒ **指数层面无法产出 α，该口径否决**；改用**基本成分三分解**——总收益 = ① 支付收益率（股息率＋净回购率）+ ② 预期现金流增长率（EPS）+ ③ 预期估值变化（P/E 均值回归）。三项均可观测，故不要求过 IC 显著性检验；**「含③／不含③」两版并列强制，只有两版同号的方向才可建仓**；③ 的收敛速度不假定、由年度采样 AR(1) 估 ρ 与半衰期，ρ ≥ 1 一律记 0。③ **失效条款重述与新增**：C 重述——原结论否证的是「① 项单独作为唯一来源」而非「股息不被支付」（用价格比值回归失败去否决股息支付属对象替换）；新增 D——③ 的准入与两版建仓规则。④ **闸门 A/B 扩充**：闸门 A 增至**七条**（新增第 7 条「收益口径折减与 p-hacking 拦截」——算术口径须扣方差/2、A 股禁沿用海外 2% 锚；须披露调参次数与阈值档位；少于 30 个观测不单独下结论）；闸门 B 增至**六条**（新增第 6 条「杠杆水位与生存约束」——含仓位/杠杆的结论须声明自身杠杆上限（κ 取 2–3）、触发式止损在极端时的失效、「正确但被强平」风险与缓冲额度；崩盘识别用杠杆水位而非价格跌幅）。⑤ **新增/扩充数据源**：接入 westock CLI（申万行业估值／一致预期／财报 TTM、外汇历史）、北向持仓、**个股级横截面因子**，并新接**中证官网 index-perf 一手面板**（价格 + 滚动 PE + 全收益，2015 起，覆盖 20 个行业）——使 ① 项从「代理检验」升级为一手可观测分量。⑥ **知识底座 38 → 46 源 / 43 → 54 份精读**：新增 8 本著作（Miranda-Agrippino & Rey 2021 GFC、Campbell、Paleologo、Falkenstein、Donnelly、Ferson、Kim & Brown、Costello）+ 2 份内部综合（周期定位专题、跨著作比对协议）。⑦ **语言硬规则（v35）**：产出与内部文档一律不得用「腿」这一比喻称呼头寸、标的或口径，拥挤度统一称「三条口径」；加粗只给数字与关键术语、破折号只作「即/也就是」补充、长句拆短。⑧ **元判据增补**：新增「三问定位」（结构定方向 → 时钟定状态 → 情绪定仓位），并把有效独立标的数 N_eff 与 ρ̄ 列为「值不值得下注」的必报量。⑨ 实体侧同步：`nine-layer-framework` 更名并扩为 **`thirteen-layer-framework`**；本体补 9 实体 + 10 关系；禁例 token 由 90 增至 106（含 8 本新著作题名/作者词干与语言硬规则）。

- **2.6.0**（2026-09-28）：**同步 macro-capital-market-analysis v27/v28 —— carry 降级 + 失效条款 + 数据源升级（评审驱动 · 数据实证）** —— ① **carry 由「唯一可计入来源」降级为存疑**：新增 `carry_backtest.py`，对三个红利/成长配对（上证红利·国证红利 vs 创业板指·科创50）做价格比值均值回归检验，**结果呈动量延续而非均值回归，多重检验校正后存活 0（0/6、0/5、0/3，原始 p<0.05 仅 0 个）** ⇒ 「股息率差为正 → 未来红利跑赢」的映射**证据不足，两个方向都不支持**。**触发失效条款 C**：carry 自本版起**不再自动计入** E[R_A]，不得据此放大仓位，逐期复核。 ② **新增 carry 头寸失效条款（预登记、强制）**：A 连续 2 期累计负贡献 < −IC* → 权重减半降观察；B 连续 4 期净贡献为负 → 强制复盘；C 映射被证伪 → 按 0 处理且**禁止反向解读**（本版已触发）。每期须在 `attribution.py record` 同登记累计净贡献与连续失效期数（append-only，不事后改判）。 ③ **数据源升级**：接入 westock CLI（申万行业估值 / 一致预期 / 财报 TTM / 外汇历史）⇒ 消除「carry 表跨来源拼装」与「无一致预期」两大缺口，并解决 gap-003；增采**北向持仓**（持有人权益结构一手数据）；新增 `stock_factor.py` 采集**个股级横截面因子**（股息率 / 价值 / 规模 / 动量 / 换手），替代 ⑧ 层原「10 指数代理」。 ④ 数据契约表补 5 条能力（westock.sector.valuation / .forecast / .quote.fx、fund.north-holding、stock.cross-sectional.factor）；本体补 5 实体（carry-degradation / carry-failure-clause / stock-level-factors / northbound-holding / gap-registry）+ 5 关系。 ⑤ 工艺规范新增 §5「carry 降级与失效条款」；专家 Profile 补 4 条 mentalModels、2 条 antiPatterns、2 条 vetoRules、2 项 capability。 ⑥ 本版**不新增知识源**（38 源不变、references 44 份不变）、不新增层；实证数字为海外锚与本地回测，A 股须本地重标定。
- **2.5.0**（2026-09-28）：**同步 macro-capital-market-analysis v25 —— 跨著作权衡元判据层** —— ① 新增**跨著作权衡元判据**五条（不新增第十层、不改闸门判据结构，只在九层之上加一层「多派相左时如何折中」的依据）：**风险三维分离**（波动率=运算代理／期间风险＋尾部肥尾=判断／流动性=危机预警，禁止用单一波动率数同时承担三种角色）；**主动管理三判据**（零和＋平均无 α＋持续性弱 ⇒ 默认低费率指数/指增；「α 变 β」为拥挤衰减机理）；**因子双锚**（正锚：发表偏误仅收缩 10–15%、FDR<10%；反锚：发表后衰减 50%+、拥挤与状态依赖侵蚀；**两侧须同时报，缺一失真**）；**预期收益四问**（哪类风险溢价 → 历史分位 → 前瞻指向 → 扣实施成本与期限后净额）；**新兴市场估值禁用历史 ERP**（改隐含法＋违约利差拼装，A 股 ERP 绝对数须本地重估）。 ② 闸门 A 原「正反双校准」**升级为因子双锚**，补齐反锚一侧（此前只有正锚，会系统性高估因子可靠性）。 ③ 九层 L4（金融定价）补主动管理三判据、L5（预期收益）补四问与禁用历史 ERP、L9（摩擦与可执行）补风险三维分离。 ④ 本体补 6 实体（risk-trinity／active-management-triad／factor-dual-anchor／expected-return-four-questions／em-erp-implicit-only／cross-book-arbitration）＋ 6 关系。 ⑤ 工艺规范新增 §4「跨著作权衡元判据」；专家 Profile 补 5 条 mentalModels 与 3 条 antiPatterns。 ⑥ 本版**不新增知识源**（38 源不变）、**不新增层**，全部实证数字均为海外/全球锚，A 股须本地重标定。

- **2.4.13**（2026-09-25）：**修一处被自己跑单变成假话的陈述 ＋ 登记第二单实跑** —— ① 验收清单原写「v2.3.0 之后的增补**尚未经端到端实跑**」；本轮在 **v2.4.12** 上完成了**第二单端到端交付**（场景 `a-share-outlook`，数据边界 2026-09-24）⇒ 该陈述已成假话，**改为如实记述两单各自的版本口径**。**这正是本仓一直在治的形态：陈述在写下时为真、对象演进后未同步。** ② 新增**第二单试运行记录**：`final.md`（六节齐全）＋ `index.html`（自包含渲染）＋公网链接；**交付级门禁全通过**（数字三方对撞 44/44、章节 6/6、占位符与未注入空值 0、禁例 0、五档视口 0 溢出、对比度 573/573）；**两道闸门均不通过**（A：t = −0.30、校正后存活 0、Deflated Sharpe 0.0004、Haircut 缺原文标 unknown；B：成本 0/5 可得、E[R_A] = −308.5 bp/年）⇒ **不发布任何配置结论**。 ③ 该单同时回填了包的三个缺口（见 v2.4.12）。

- **2.4.12**（2026-09-25）：**把一次真实交付暴露的三个缺口回填进包**（三条都不是想出来的，是跑单当场撞出来的） —— ① **任务必须有"产物路径"**：新增判据 `task-deliverable-paths-missing` —— 每个组队模板任务必须声明非空、非绝对路径的 `deliverablePaths`；两条模板（a-share-outlook／cycle-positioning）已逐任务补上。**动机**：跑单中两个执行代理**写完中间产物就停止、交付物缺失**，而任务定义里只有"标题＋描述" ⇒ **"执行者说它做了"与"产物真的在"无法区分**。**"完成"的证据是文件存在且被复核。** ② **写法约定写进写作者看得到的地方**：两个输出模板的 `dataRules` 新增 `writingRules` 四条 —— **交付物不得出现来源标识（方法名可用、作者名不可）**；**引用他人结论必须带发布日**；**每个数字带口径与数据期且能在底座找到证据**；**报告生成器必须自带空值自检**。**动机**：跑单时禁例门禁抓到正文引「某某等 (2015)」的作者名（`Harvey` ×2）—— **规则本来只在 `quality-policies` 的禁例表里，写作者看不到**。 ③ **交付级门禁第 ③ 项扩展为"占位符 ＋ 未注入空值"**：`None/nan/inf` 只要**紧邻数字或单位**即判失败（不误报英文散文）。**动机**：跑单中生成器一个旧键名写错，把 `10Y 国债 None%`、`ERP Nonepp` 渲染进了正文，而**数字一致性门禁只核对数字、抓不到 `None`** ⇒ 五道门禁全绿而缺陷已进正文。该扩展已用注入 `None%` 的负例端到端验过（命中 1 处、退出码 1）。 另：判据登记表同步（自有 code 44 个，全部有负向对照）。

- **2.4.11**（2026-09-25）：**把"声明了却没有工具"的三处补齐 —— 产物侧门禁现在能真的跑起来**（这批不是凭空加的：是为一次真实交付补的，且每一件都拿**已知合格的首单产物**做过校准） —— ① **`scripts/check-sections.mjs`**（`section-outline` 的执行工具）：markdown 取 H2／HTML 取 h2，逐项对照输出模板的 required 章节并检查顺序；**顺带修一处判据缺陷** —— 原先按严格名字比对，会把「**一、**摘要」这类带编号的标题全判成"缺章节"（首单 6 章全缺）⇒ 判据补 `normalization`（比较前去掉可选编号前缀与空白）。② **`scripts/audit-render.py`**（`render-overflow` 的执行工具，playwright）：五档视口＋WCAG AA 全节点穷举；**判据补三条显式排除**（可横滚容器内的宽表／`.sr-only` 无障碍隐藏元素／"元素超出视口"本身）—— 第一版漏掉前两条与第三条时，在首单产物上分别**误报 7–42 个/视口**与**每视口 1 个**，补齐后归零。③ **`scripts/render-report.mjs`**（渲染器）：包此前**声明了渲染规格却没有渲染器**；现按模板的 `rendering`/`renderModes` 声明渲染**自包含** HTML5（浅色／衬线／学术排版、涨=红跌=绿、¥、YYYY-MM-DD、文末「不构成投资建议」）。**它上线第一次渲染就被自己的门禁抓到真缺陷**：320px 宽时页面横溢 20px（长链接/长代码串撑宽）⇒ 全面加 `overflow-wrap:anywhere` 后归零。 ④ **`scripts/audit-delivery.sh`**：产物侧五道硬门的**统一入口**（number-consistency／section-outline／placeholder-clean／banned-tokens／render-overflow），**判据全部从包里读**，不写死在工具里。 ⑤ **校准证据（判据与工具互验）**：把首单产物跑一遍 —— i1 三方对撞 **47/47**、章节 **6/6**、占位符 **0**、禁例 **0**、五档视口 **0 溢出**、对比度 **1079/1079**（渲染器自渲染同一份报告：**1038/1038**、0 溢出）。 ⑥ 文档同步：`RELEASING.md` 增「交付级门禁」一节（含渲染器与自包含要求），`CONTRIBUTING.md` 增"改产物侧判据"一节，`SUBMISSION-CHECKLIST.md` 增条目。 ⑦ 另修：`install-to-profile.sh` 在安装副本被平台停用（`.disabled-by-center`）时给出明确诊断，且**不擅自改名恢复**。

- **2.4.10**（2026-09-25）：**修一个"只有装上去才看得见"的缺陷** —— ① **包自己的门禁自校准在【安装副本】里跑不过（45/46）**：安装时不带 `.github/`（那是仓库侧设施，不属于包），而 `workflow 缺 jobs:` 那条对照样本要去改 `.github/workflows/check.yml` ⇒ ENOENT 崩溃，报成"样本自身出错"。**在开发者签出目录里全绿、在用户实际安装的那份里失败**，正是最难发现的一类。修法：测试写入时**自动建父目录**（测试不该假设仓库里恰好有 `.github/`）。 ② **顺带把安装时自检改为并发**（46 例串行会超时，`SELFTEST_CONCURRENCY=8`）—— 这次就是它先超时、暴露了上面那条缺陷。 ③ 教训入册：**"仓库里能过"不等于"装上能过"**；`install-to-profile.sh` 会在副本内跑四件自检，因此这类缺陷从今往后会在同步当场暴露。

- **2.4.9**（2026-09-25）：**把上一轮列出的八条优化一次做完**（补检查 4 条 ＋ 上限 1 条 ＋ 文档 3 条） —— ① **模板两处章节表对齐判据**（`template-sections-misaligned`）：`sections[].title` 必须逐项等于 `documentStructure.sections[].name`、数量一致 —— 此前靠手工维持，一旦漂移会"渲染按结构走、清单按 sections 走"，章节被悄悄漏掉。 ② **`pack.json` 补元数据**（`license`／`repository`／`homepage`／`keywords`／`author`）并加判据 `pack-metadata-missing` —— 此前这些信息只在 README/LICENSE 里，机器消费者拿不到。 ③ **口径映射显式化**：新增 `pack.json.caliberAliases`（把数据契约里的写法与声明键显式对应），并加判据 `caliber-undeclared` —— 数据契约里出现"未声明口径"从此会 FAIL（原先靠子串巧合）。 ④ **能力引用可见化**：给 4 项仅供平台使用的能力显式标 `scope: 'platform'`，其余未被包内引用的能力改为出 note（**"故意对外"与"id 拼错"从此可区分**）。 ⑤ **note 预算**（`--max-notes`，CI 与发布前检查用 10）—— note 不拦截但会累积成噪声（本仓历史上曾从 4 涨到 12）。 ⑥ **`README.en.md`**（英文概览：结构／自检／版本策略／知识底座边界／许可）。 ⑦ **`CONTRIBUTING.md`**（改之前先读判据登记表；提交前必须全绿；**新增判据必须同时补负向对照**；生成物不许手改）。 ⑧ **知识底座自建说明**：`knowledge/experts/macro-capital-analyst/README.md` 从占位改成完整说明（材料本体按版权不分发是设计、怎么准备自己的材料、怎么写内化摘要、版权边界），中文 README 增一节指向它。 ⑨ 判据登记表 20 → **23 条**、自有 code 对照 **43/43**、门禁自校准 **46 例**。

- **2.4.8**（2026-09-25）：**修"声明与可执行之间的缝"** —— ① **判据 × 负向对照矩阵**（新判据 `negative-controls`，**硬门**）：扫描 `selftest-gates.mjs` 算出"每个可报出的 code 有没有被负向对照证明抓得住"，**自有 code 未覆盖即 FAIL**（平台校验器自带的 16 个 code 显式列白名单排除，不假装我们能给它配对照）。接入时实测 **54 个 code 只有 18 个有对照**，其中**自有 19 个从未被证明抓得住** —— 这类"死门禁"与"通过的门禁"观感完全一样（本仓库已真实发生过三次：占位符正则写坏、引述域豁免吞掉全部 JSON、CSV 用了 `split(',')` 误报）。**现已补齐到 39/39**，并把它设成硬门，防止再出现。 ② **三条"纸上硬门"补上可执行判据**：`render-overflow`（**五档视口** 320/390/768/1280/1920；溢出＝`scrollWidth − clientWidth > 1px`；对比度 WCAG AA，正文 ≥4.5:1、大字 ≥3.0:1；**全节点穷举禁止抽样**）、`section-outline`（从 md 取 H2 / html 取 h2 大纲，对照 `output-templates[].documentStructure.sections` 的 required 章节，缺一不可）、`layout-audit`（标题层级不跳级／表头列数＝行数／脚注有回链）。**这些阈值不是新发明的，是把首单里已经跑过的口径搬回包里**（首单实测：对比度 1079/1079、全节点 1542 节点 0 失败、五档视口 0 溢出）。并新增判据 `structure-gate-no-config`：**任何门禁没有 config 即 FAIL** —— 从此不允许存在"只有声明、没有判据"的门。 ③ **门禁自校准 21 → 42 例**（新增 21 例覆盖此前所有自有未覆盖 code），并把 runner 改为**并发**（`SELFTEST_CONCURRENCY`，默认 4）—— 42 例串行已到分钟级。 ④ **打上版本标签**：仓库此前 7 个版本**没有任何 git tag 或 Release**，外部无法精确定位"哪次提交是 2.4.x"，也没有按版本归档的不可变产物；本版为 **v2.4.1 … v2.4.8** 逐版打**附注 tag**（指向各自提交），版本第一次成为可被机器定位的东西。

- **2.4.7**（2026-09-25）：**把"我们查了什么、没查什么"做成对外答卷** —— ① **新增判据登记表 `CRITERIA.md`（19 条）**：每条判据给出 `id`／**强度**（`hard` 错即坏／`structural` 缺即不完整／`advisory` 只出 note）／对象／量程／**不查什么**／可报出的 `code`。它由代码生成（`--criteria-md`），并由新判据 **`criteria-doc` 逐字比对**防漂移。 **意义**：`0 problems` 从此有明确适用范围 —— **范围之外不是"已验证"，是"没人看"**。 ② **覆盖率加强度分级**：输出 hard／structural／advisory 三档并**点名"仅 advisory 覆盖"的文件**（判据最软、优先加固）。当前 **37 文件：hard 27 ／ structural 10 ／ advisory 0 ／ 仅通用扫描 0 ／ 没人读 0**。 ③ **新增 `csv-structure`（structural）**：数据契约表须有必需列、行列数一致、`capability` 唯一、无 BOM。**其实现第一版误报 2 行**——用 `split(',')` 去切含逗号与引号转义的单元格；改为真正的 CSV 切分后归零。**判定对象是 CSV 就得按 CSV 读**，教训写进代码注释。 ④ **门禁自校准 19 → 21 例**（`criteria-doc-drift`／`csv-structure`）。 ⑤ 修一处参数解析缺陷：`--criteria-md <path>` 的**值**曾被当成包目录（崩栈）—— 取值型开关的值不再参与位置参数解析。

- **2.4.6**（2026-09-25）：**收口：不许有"挂着的未决项"** —— ① `bannedTokens` 的两条 **review（待人工判定）落定为 allowlist**：`Trading Costs` 与 `Equity Risk Premiums` 都是**通用英文金融短语**（中文报告写「交易成本」「股权风险溢价」），把它们当禁例会**误伤合法的英文引述**；若将来要以"来源身份"拦截，应禁**更具体的完整篇名**，而不是这两个通用短语。判定理由写进策略字段 `allowlistDecisionNote`，不留在人的记忆里。 ② **`maxReviewPending` 由 5 收紧为 0** ⇒ 该门禁从此**不允许存在未决项**：有疑问必须当场判定并落进 `allowlist` 或 `bannedTokens`。**"待办"不是状态，是欠账。** ③ 现值：禁例 90 条／通用术语豁免 8 条／待判定 0 条，**覆盖 85/85**。

- **2.4.5**（2026-09-25）：**把"盲区"从感觉变成计量：覆盖率报表 ＋ 内容层结构判据** —— ① **新增覆盖率计量**（`check-pack --coverage`）：登记"哪个检查读过哪个文件"，输出**有针对性判据／仅通用扫描／没人读**三类。**第一次跑就暴露：27 个内容文件（experts／method-packs／output-templates／domain-knowledge…）此前只被"读入 + 占位符扫描"碰过、2 个文件没人读** —— 这正是"三道门禁全 PASS"那种话最容易掩盖的地方。 ② **新增内容结构判据（平台无关）**：按维度声明"必须有什么"（10 个维度的必需字段与非空列表、门禁四要素 `id/kind/severity/appliesTo`、`documentStructure.sections[]` 的 `name/required`、方法包步骤编号不重复、kb `collections[].root` 不存在时须显式声明、`.gitattributes` 必须 `eol=lf`）。**契约按实测写**：三个方法包的内容字段名各不相同（gates／layers／steps）⇒ 契约只能是"至少一个非空数组"，**改契约而不是改内容**。 ③ **新增脚本/文档/杂项完整性**：`scripts/*` 与技能脚本**语法可编译**（`node --check`／`bash -n`／`compile()`）；`*.md` 与 workflow 点名的 `scripts/` 路径**必须存在**（**当场抓到 `SUBMISSION-CHECKLIST.md` 一处不可解析的旧路径**，已改为全路径）；workflow 必须有 `on:`/`jobs:`；`.gitignore` 必须忽略 `engine/` 与 `__pycache__`；`LICENSE` 必须与包内 license 声明一致。 ④ **覆盖率 22／12／2 → 36／0／0**（新增判据后盲区为零，且每条覆盖都登记了负责的检查名）。 ⑤ **门禁自校准 15 → 19 例**（结构／脚本语法／文档引用／gitignore 各配负向对照）。 ⑥ **修一处不准确的范围声明**：skip note 原写"检查 3/4/5/6 依赖平台校验器"，实际它们改用"直读 JSON"照跑 —— **范围声明必须准确，否则读者会以为这些检查没跑**。 ⑦ 覆盖率接入 `release-check.sh` 与 CI（报表步，附在五件套之后）。

- **2.4.4**（2026-09-25）：**补上 CI 模式的检查真空 ＋ 动态冒烟 ＋ 修豁免判定的 use/mention 混淆** —— ① **新增四项【平台无关】引用完整性门禁**：`skill-contribution-target-missing`（`skillPackages.contributions` 的每个 id 必须在对应维度里存在）、`scenario-reference-missing`（`teamTemplate`/`outputTemplate`/`qualityPolicy`/`skill.id`/`tasks[].expert` 必须可解析）、`skill-reference-missing`（SKILL.md 点名的 `references/`·`scripts/`·`assets/` 文件必须真的在）、`transport-target-missing`（`local-cli` transport 的路径型 `args` 必须存在）。**动机**：检查 3/4/5/6 依赖平台校验器，而 CI 里没有私有库 ⇒ 那几条在 CI 是 `skip`；不兜底就形成**最坏的组合——本地能拦、CI 拦不住**。 ② **新增 `scripts/smoke-test.mjs` ＋ transport 声明 `smokeArgs`**：`check-pack` 只能证明"声明的路径存在"（静态），本项**照声明真跑一次**（动态）——`collision-cli` 即 `python3 …/i1_collision_check.py --selftest`，跑不通即 FAIL；没写 `smokeArgs` 的 transport 只做静态核对。**声明即承诺。** ③ **修豁免判定的 use/mention 混淆**：`check-pack-allow: placeholder-residue` 原先"文件里出现即算声明"⇒ **文档里提到该标记、以及脚本自己的正则字面量，都会被误判为"已声明豁免"**（实测三处假豁免：README、RELEASING、check-pack 自身）。现要求**行首注释**形式才算声明 ⇒ 只剩真正需要它的 `selftest-gates.mjs` 一处，且每处豁免都会打印 note。 ④ **note 去重聚合**：`toolPolicy.allowed` 的平台层解析原先按"场景 × 能力"报 6 条重复 note，现按能力聚合成 1 条（列出出现场景）—— 噪声会淹掉真告警。 ⑤ 发布前检查扩为**五件套**（`release-check.sh` 与 CI 同步加上冒烟测试）。
- **2.4.3**（2026-09-24）：**门禁可被第三方/CI 复跑 ＋ 修三处真缺陷 ＋ 手工步骤脚本化** ——
  ① **修真缺陷**：(a) `check-pack.mjs` 在包加载失败时**崩栈**（`Cannot access 'pack' before initialization`，该路径自 2.3.0 既有）⇒ 改为打印诊断；(b) `data-contracts/capability-contract.csv` 带 **UTF-8 BOM**，列名实际是 `\uFEFFcapability` ⇒ 去 BOM 并统一 BOM 安全读取；(c) **`bannedTokens` 判据过宽**：原先把「预期收益／风险管理／国家统计局／Backtesting／Carry」等**通用术语**也算成"应入禁例"⇒ 该告警永不收敛。现拆为 **covered ／ allowlist（通用术语，明确不得入禁例）／ review（待人工判定，有上限）／ strict（真缺口，阈值 0）**，并补齐 29 条专名/篇名 ⇒ **覆盖 85/85**。
  ② **平台校验器改为可选**（缺 `EXPERT_LIB_ROOT` 时 skip 并声明，其余检查照跑）⇒ 新增 **CI**（`.github/workflows/check.yml` 跑包自检／门禁自校准／digest dry-run／i1 自检）与 **`.gitattributes`**（强制 `eol=lf`：digest 目标是 `sha256(SKILL.md)`，CRLF 会让 digest 全体错位且现象不可见）。
  ③ **新增三处门禁**：**占位符残留**（`【替换：…】` 省略号形态＝记法不计；写了具体内容才算。含引述域豁免与显式 `check-pack-allow: placeholder-residue` 声明）、**fileRef 安全口径**（须声明 `fileRefRoot`；禁止绝对路径/URL/内网地址；**不查存在性**——46/46 材料按版权设计不分发）、**数据契约表 ↔ toolProviders 对照**（不同口径，给 note 不给判）。
  ④ **把手工步骤脚本化**：`bump-version.mjs`（一处改版本号 → 4 类载位同步 + 自动重钉 digest + 插入待补的发布说明条目）、`repin-digests.mjs`、`install-to-profile.sh`（备份 + 保留安装侧 `routing/` + 副本内自检）、`release-check.sh`（发布前四件套）＋ **`RELEASING.md`**。
  ⑤ `selftest-gates.mjs` 由 7 例扩到 **11 例**（新门禁各配负向对照；`check-pack` 的这套对照本身也成了 CI 的一步）。
  ⑥ `i1_collision_check.py`：暴露 `--abs-tol` 与 `--pool-exclude`，报告新增 **`caliber`**（容差算法／池口径／排除项／摘要选择器）—— 原先容差下限写死、池含版本号等弱匹配项，**口径不写出来，PASS 就不可复核**。
  ⑦ `check-pack --json` 增 `validatorRan` 与三类 token 数组；`domain-knowledge` 的 collection 补 note（说明该 root 在本仓只有 README 是设计）；`tool-providers` 补 note 说明三种"能力"口径。
- **2.4.2**（2026-09-24）：**门禁可复跑化 ＋ 检查输出机器可读** —— ① 新增 **`scripts/selftest-gates.mjs`**：把 v2.4.1 两道新门禁的**负向对照固化成可复跑套件**（7 例：基线 ＋ README 徽章／README 版本历史首条／清单三处版本漂移 ＋ 实体版本漂移 ＋ digest 不符 ＋ 缺 `digestTarget`），任一未被抓住即 exit 1。v2.4.1 那批对照是在临时目录里**手工**做的 —— 属「当时为真、事后不可复核」，本版把它变成一次命令。② **`check-pack.mjs` 增 `--json`**：机读输出 `problems`/`notes`，并**全量**给出 `absentBannedTokens`（现 37 条，不再截断到 6 条）—— 「人工清单落后于知识底座」这条告警由此从提示变成**可行动清单**。③ **审计了首单的 I1 三方对撞报告**（47 个通过值）：**无一例仅靠版本号／计数／日期类池键命中（0/47）** ⇒ 未发现"弱匹配"缺陷，故**不改池口径**（不为一个不存在的缺陷加机制）。④ 版本口径复查：`SOURCE-MANIFEST.json` 的 `note` 在 2.4.1 已改为**指针式**（不再内嵌包版本号）⇒ 本版只需同步 **17 个实体/配置文件 ＋ README ＋ 清单**，且 bump 后被门禁当场拦下 4 处（三处文档版本 + 一处 `SKILL.md` digest）—— **"版本 bump 的检查单"由机器执行，不再靠人记得**。
- **2.4.1**（2026-09-24）：**工程补丁版** —— 不改任何方法论结论、不改判据阈值，只修「会静默失效」的部位。① **修复 `i1_collision_check.py` 三处解析缺陷**：**指数名吞数字**（`沪深300 年化超额` 曾被解析成「300 + 单位 年」；在真实报告上实测多出 1 个伪值 300.0）、**千分位**（`16,143.03` 曾被截成 `143.03`）、**小数边界**（`(?<![\d.,])`）；并新增 **`--selftest`（8 例，含负向样本）** 与**容差口径声明**（相对 0.5% ＋ 绝对下限 0.0051 —— 两者混用使小数值实际容差更宽，改动即改结论，故写进 docstring）。② **digest 可复现性补齐第二例**：`domain-knowledge` 的 `snapshot` 补 `digestTarget`/`digestAlgorithm`（实测 `sha256(source/SOURCE-MANIFEST.json)` 相符）；并把 `snapshot.id` 由含包版本号的 `source-manifest-2.3.0` 改为含内容特征的 `source-manifest-38`（保留 `renamedFrom`）—— 包版本号随每次发布漂移，写进 id 会让同一快照在下一版里显示成「过期快照」。③ **`check-pack.mjs` 新增两道门禁，且都用负向对照校准过**：**doc-version lockstep**（`pack.json` / README 徽章 / README 版本历史首条 / `SUBMISSION-CHECKLIST` 四处必须同版本 —— 此前靠人工同步，徽章曾落后）与 **digest reproducibility**（凡声明 digest 必须有 `digestTarget` 且当场复算相符）。④ `.gitignore` 增补 `engine/`（数据引擎运行目录：防运行数据被误提交进开源仓）。⑤ 回填 `SUBMISSION-CHECKLIST` 的**试运行记录**（端到端一单）。⑥ **新门禁上线当场抓出并修好一处既有静默漂移**：`skills/macro-capital-framework/SKILL.md` 的 frontmatter 里也有 `version`，改版本号即改该文件 sha256 ⇒ `skill-packages` 的 `source.digest` **必须同批重钉**（本轮已重钉为 `sha256(SKILL.md)`），否则「声明漂移」会再次静默发生 —— 这是新门禁的第一个真实产出，也说明**三处版本口径（pack / README / 清单）与两处 digest 口径（skill / 本体快照）必须同批更新**。
- **2.3.0**（2026-09-23）：同步 macro-capital-market-analysis **v24**——① **闸门 A 整合为正反双校准**（正向 Haircut/Deflated Sharpe 折半 + 反向依 Chen-Zimmermann 2022 发表偏误仅需收缩 10–15%，明确「未过校正 ≠ 反向信号成立」红线），新增门禁 `gate-a-double-calibration`；② **凯利一致性加入分层 P**（依 Cong et al. 2026 可预测性资产特定 + 状态依赖，下注上限按可预测性聚类取 P）；③ 新增 5 篇论文精读（油价-货币通胀分解、美元避险定价、地缘碎片化量化、发表偏误再校准、可预测性异质性），知识底座 **33→38 源 / 38→43 份精读**；④ 本体补 4 实体 + 3 关系，`pack.json` 描述改为按账本口径的准确分类（17 专著 + 2 教材 + 2 研报 + 17 论文）；⑤ `skill-packages` 的 `source.digest` 改为可复现的 `sha256(SKILL.md)` 并显式声明 `digestTarget`（原 digest 无法用任何可复现算法对应现有内容，属声明漂移）。
- **2.2.0**（2026-09-17）：同步 macro-capital-market-analysis **v21**——新增**第 0 层「基准与目标函数」**（沪深300 基准 + 绝对收益风险约束 + 事前风控档位表 + 主动风险额度精算）、**主动收益框架**（w_a／σ_A／MCTR-CTR 欧拉分解／E[R_A] 三项分解／IR=IC×√BR／IC*）、**闸门 A/B 论文级判据**（多重检验校正 BH-FDR+Bonferroni、Haircut/Deflated Sharpe 双口径、Frazzini 成本五度量法）、**术语全面更换**（毛α→E[R_A]、净α→净预期主动收益、摩擦→实施成本、break-even→IC*）；知识底座 **19→33 源**（新增 12 篇学术论文 + 3 本专著）；门禁新增 `active-risk-budget` 硬门。
- **2.1.0 实体回退**（2026-09-16）：`experts/` / `scenarios/` / `output-templates/` / `quality-policies/` 四类实体统一回退为 Expert Profile v2 本机可用 schema（`proficiency` 整数 1–5、output-templates 保留 `media`/`sections`/`renderModes`、quality-policies 保留 `gates[].kind`/`appliesTo`、scenarios 保留 `outputTemplate`/`qualityPolicy`/`teamTemplate`），同时**保留 v2.1.0 的实体内容**——output-templates 追加 `dataRules`/`documentStructure`/`rendering`，scenarios 追加 `description`/`skill` 与「动手前先读 SKILL.md」约束，quality-policies 新增 `placeholder-clean`、`net-alpha-required` 两道硬门，expert 恢复 `methods` 与含两条硬规则的 `evidenceStandard`。`quality-policies/` 由按场景拆分（2 文件）回到单一 `baseline.json`。
- **2.1.0 修订**（2026-09-16）：补回 `method-packs/`（六步/九层/双闸门）与 `references/scripts/i1_collision_check.py`，恢复 §2.7 量纲与口径交叉校验、§3.3 摘要—正文—底座三方对撞两条硬规则（2.1.0 模板重排中遗漏）；`SOURCE-MANIFEST.json` 的 `materials[]` 补回 `status` / `distributable` / `fileRef` 字段；修正 README 版本徽章。
- **2.1.0**（2026-09-16）：按 zhijian-sample-pack 模板重排——目录对齐（`knowledge/` + `data-contracts/`，去除 method-packs/routing）、字段对齐（output-templates 用 `documentStructure`、quality-policies 用 `severity`+`bannedTokens`、SOURCE-MANIFEST 用 `materials[]`）、补 `SUBMISSION-CHECKLIST.md` 与 `capability-contract.csv`。
- **2.0.0**（2026-09-16）：方法底座扩至十四部著作 + CFA 2025 十三卷；补全完全体实体。
- 1.0.0（初版）：核心 Profile + pack + 单场景。
