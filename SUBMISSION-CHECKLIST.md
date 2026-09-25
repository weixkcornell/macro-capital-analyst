# 提交物验收清单（观澜领域包）

> 平台评审按此逐项打勾；先自检再提交。

- [x] `pack.json`（id=macro-capital-analyst / version=2.4.6 / schemaVersion=2 / caliberDeclarations 四类口径）
- [x] `experts/macro-capital-analyst.json`（schemaVersion 2 全字段；`source/SOURCE-MANIFEST.json` 溯源齐备，38 份材料）
- [x] `scenarios/*.json`（DAG 依赖无环、专家 id 全部可解析、deliverable 明确；共 2 个）
- [x] `output-templates/` + `quality-policies/`（起步门禁 10 道覆盖数字一致与禁例 token；含 `gate-a-double-calibration` / `net-active-return-required` / `active-risk-budget` 硬门，且每道门均有 team template 绑定）
- [x] `method-packs/`（六步内化 / 九层能力 / 两道闸门）+ `team-templates/`（2 个组队模板）
- [x] `skills/macro-capital-framework/SKILL.md`（触发词齐全；其 references 与 scripts 全部落在 `skills/macro-capital-framework/references/checklist-template.md` 与 `skills/macro-capital-framework/references/scripts/i1_collision_check.py`，并由 check-pack 的 ref-integrity／skill-reference-missing 逐条核对）
- [x] 数据契约表（`data-contracts/capability-contract.csv`，自建数据引擎契约）
- [x] 本体（`domain-knowledge/macro-capital-analyst-kb.json`，recordCount=38，digest = `sha256(source/SOURCE-MANIFEST.json)`，已声明 `digestTarget`/`digestAlgorithm` 并由 `check-pack.mjs` 当场复算）
- [x] 知识供给 / 技能包 / 工具集（`knowledge-providers/` + `skill-packages/` + `tool-providers/`）
- [x] 自检脚本（`scripts/check-pack.mjs`：version lockstep + 文档版本 lockstep + 门禁绑定 + DAG 完整性 + digest 可复现性 + 占位符残留 + fileRef 安全 + bannedTokens 阈值 + **引用完整性四门**（contributions／scenario 引用／SKILL.md 点名文件／transport 路径）+ 三方对撞目标；`--json` 供脚本/CI 读；平台校验器缺失时以 skip note 声明并继续跑其余检查）
- [x] **门禁自校准脚本**（`scripts/selftest-gates.mjs`：**19 例**负向对照 —— 基线 ／ 徽章・历史・清单三处版本漂移 ／ 实体版本漂移 ／ digest 不符 ／ 缺 `digestTarget` ／ 占位符残留 ／ fileRef 绝对路径 ／ 发布说明占位 ／ 禁例覆盖缺口；任一未被抓住即 exit 1）
- [x] **覆盖率报表**（`scripts/check-pack.mjs --coverage`：登记"哪个判据读过哪个文件"，输出「有针对性判据／仅通用扫描／没人读」三类；当前 **36 文件：36／0／0**）｜**禁例覆盖 85/85（禁例 90 条／通用术语豁免 8 条／待判定 0 条，`maxReviewPending=0`）**
- [x] **冒烟测试**（`scripts/smoke-test.mjs`：照 transport 的 `smokeArgs` **真跑一次** —— 静态存在性由 `check-pack` 把关，**可执行性**由本脚本把关；声明即承诺）
- [x] 技能脚本自检（`skills/macro-capital-framework/references/scripts/i1_collision_check.py --selftest`：8 例含负向样本，覆盖指数名吞数字／千分位／小数边界；报告另含 `caliber` 声明容差与池口径）
- [x] **发布流程脚本化**（`scripts/bump-version.mjs` 一处改版本号同步 4 类载位并重钉 digest ／ `scripts/repin-digests.mjs` ／ `scripts/install-to-profile.sh` 安装副本同步［先备份、保留安装侧 `routing/`、副本内自检］／ `scripts/release-check.sh` 发布前四件套）＋ **`RELEASING.md`**
- [x] **CI**（`.github/workflows/check.yml`：push/PR 跑包自检 ＋ 门禁自校准 ＋ digest dry-run ＋ i1 自检）＋ **`.gitattributes`**（`eol=lf`，保 digest 跨平台稳定）
- [x] **试运行记录（首单，2026-09-17）：端到端一单 = 「观澜 · A股观点看板」** —— 一手数据自算 → 市场共识对照（22 条一手 URL 全部 HTTP 200 复核）→ 六步研判 + 两道横切闸门 → 定稿 → HTML5 渲染 → 质量门禁 → 公网发布。
  - **GATE 文件**：门禁脚本 **11 件全部钉扎 sha256**（`final.md.freeze#toolchain_pins`，逐件对磁盘复算 11/11 一致）；摘要—正文—底座三方对撞 **47/47 PASS**；对比度 **1542 节点 0 失败**（抽样口径曾漏 12 处，见该单记录）；判决语白名单 6 态 + 逐字溯源 PASS。
  - **匿名化对外样本**：公网看板 `https://yy.meizu.life/render/观澜-a股观点看板/a-share-outlook-20260915.html` —— 对外只列「领域 · 首字母」，无真实人名、无内网地址；团队活动面板快照另发布一份（仅本团队、已排除其他团队内容）。
  - **放行判定**：**报告层 GO**；**报告内配置结论（超配/低配/轮动）不发布** —— 闸门 A 不通过（红利相对沪深300 全样本年化超额 t=0.31 ≪ 3.0，样本 6.7 年，BH-FDR/Bonferroni 存活 0），闸门 B 不通过（实施成本篮子不完整且类别错配）。
  - **版本口径（诚实声明）**：该单运行在**本机 `domain-packs/` 的 v2.2.0 安装副本**上 ⇒ 它验证的是 **v2.2.0** 的场景/组队/门禁链端到端可用；**v2.3.0 与 v2.4.1 的增补（含本版 `i1_collision_check.py` 修复）尚未经端到端实跑**（本版修复的缺陷正是由该单发现的）。
- [x] 全部 JSON 可解析（`python3 -m json.tool`）
- [x] 全部【替换：…】占位符已清除
- [x] 无凭据 / 密钥 / 内网地址 / 真实个人信息（publicLabel 仅「领域·首字母」）
