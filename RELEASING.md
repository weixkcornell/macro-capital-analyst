# 发布流程（RELEASING）

> 目的：把"发布要做哪些事"从人的记忆里搬到**可执行命令**里。本文件只写流程，判据在脚本里。

## 0. 一次性环境

- Node ≥ 22（`node scripts/*.mjs`），Python 3（技能脚本自检）。
- **平台私有库**（`@zhijian/dsh-expert-library`，本机 `/root/zhijian/dsh-expert-library`）：**可选**。
  设 `EXPERT_LIB_ROOT` 指向它 ⇒ `check-pack` 会额外跑平台校验器（检查 3/4/5/6）；
  不设 ⇒ 这些检查以 `skip` note 声明后跳过，**其余检查照跑**（CI 即是这种模式）。

## 1. 改内容

按需要改 `experts/` `scenarios/` `method-packs/` `output-templates/` `quality-policies/`
`team-templates/` `tool-providers/` `knowledge-providers/` `domain-knowledge/` `skill-packages/`
或 `skills/`。

⚠ **凡是会演进的对象，判据里不要写死取值**（哈希、版本号、行数、时刻）——写指针或写命令。

## 2. 版本 bump（一条命令）

```bash
node scripts/bump-version.mjs 2.4.4          # 加 --dry-run 只预览
```

它会：① 同步 `pack.json` 与全部维度 JSON 的 `version`；② 同步 `SKILL.md` 的 frontmatter；
③ 换 README 徽章并在版本历史**插入**一条 `- **<新版本>**（<日期>）：（待补发布说明）`；
④ 换 `SUBMISSION-CHECKLIST.md` 的 `version=`；⑤ **自动重钉 digest**
（`SKILL.md` 里也有 version ⇒ 改它就会改它自己的 sha256）。

**然后必须手工补上那条发布说明**：`check-pack` 的 `release-note-placeholder` 会一直 FAIL 到补完。

## 3. 发布前四件套（必须全绿）

```bash
bash scripts/release-check.sh
```

| # | 检查 | 抓什么 |
|---|---|---|
| ① | `check-pack.mjs` | 版本 lockstep（实体 ↔ pack.json ↔ README 徽章 ↔ 版本历史首条 ↔ 清单）、门禁绑定、DAG 完整性、场景↔组队模板一致、**digest 可复现**、**占位符残留**、**fileRef 安全**、bannedTokens 阈值 |
| ② | `selftest-gates.mjs` | **门禁自己的负向对照**（11 例注入式缺陷，任一未被抓住即 FAIL）——门禁若只在真品上跑过，等于没校准 |
| ③ | `repin-digests.mjs --dry-run` | digest 是否该重钉（dry-run 不写盘） |
| ④ | `i1_collision_check.py --selftest` | 技能脚本解析层 8 例（含负向样本） |
| ⑤ | `smoke-test.mjs` | 照 `transports` 的 `smokeArgs` 真跑一次（断言"声明即可执行"） |
| ⑥ | `check-doc-commands.mjs --dir .` | **文档-契约一致性（离线）**：文档里的 CLI 示例与 `data-contracts/*.csv` 的 `input_schema` 字段，必须落在**真实 `inputSchema`** 内（判据来自 `data-contracts/wind-tool-schemas.json`）。**范围与限度（2026-09-30 实测补记）**：只扫 `.md`（**不扫 `.html`**）；**只比字段名、读不出意图** —— 故意写错的反例若以完整命令字面量给出会被当成缺陷，故反例须以**参数对象形式**给出（错误响应与退出码照原样保留，证据不缩水）；反斜杠续行的命令会被静默跳过（假阴性），复核命令须写成单行。**它不是交付门禁**：不进 `baseline.json`、不是 `audit-delivery.sh` 的一步 |
| ⑦ | `check-template-conformance.mjs --selftest` | 输出模板一致性门自身的**负向对照**（2 正向 + 7 负向，必须 9/9）—— 与 ② 同理由：门禁不校准等于没门禁 |
| ⑧ | `audit-mobile.py --selftest` ＋ `check-wind-provenance.py --selftest` | **判据来源自校准**：用**故意偏离内置默认**的合成策略跑一遍，断言声明的判据**真的生效**（移动端 7 项 / Wind 6 项）。理由：v2.8.10 之前 `mobile` 与 `wind` 两道门的声明判据根本没被加载/消费，而门禁照样 PASS —— **「加载了策略」与「策略生效」是两件事**，只有偏离默认的对照才能分辨 |
| ⑨ | `check-gate-wiring.mjs`（＋`--selftest` 1 正向 4 负向） | **门禁接线检查**：每道有 `config` 的门必须声明 `config.wiring` —— `executor`＋`consumesKeys`（键名须在执行器源码里按**独立标识符**出现）/ `builtin` / `semantic`（后两者须给 reason），文档性键须入 `notConsumed`，声明了 `selfTest` 的脚本须真被 `release-check.sh` 调用。理由：本包一天内连踩三例**「声明被加载 ≠ 声明生效」**（mobile 加载器、wind 未消费、mobile 正文字号键类型），此检查把这件事变成**事前可机检** |

**任何一项红：不要发布。**

改过判据（新增/修改 `check-pack` 的检查）之后，**必须重新生成判据登记表**：

```bash
node scripts/check-pack.mjs --criteria-md CRITERIA.md   # 生成（不要手改）
node scripts/check-pack.mjs --criteria                   # 只在终端看
```

`CRITERIA.md` 是"我们到底查了什么、没查什么"的对外答卷：每条判据给出 对象／量程／**不查什么**／可报出的 code。
`check-pack` 的 `criteria-doc` 判据会**逐字比对**该文件的 JSON 块与代码里的登记表，不一致即 FAIL。

## 4. 本地安装副本同步（平台读的是它，不是 git 仓）

```bash
bash scripts/install-to-profile.sh          # 默认同步到 ../main/bank/domain-packs/macro-capital-analyst
```

它会**先备份**（默认 `<仓>/../.install-bak/`）→ rsync 增量同步（**保留安装侧独有的 `routing/`**，
删除他人版本遗留物属"回溯删除"，不在脚本权限内）→ 核对版本 → **在副本内**跑三件自检。

## 4b. 交付级门禁（针对"产物"，不是针对"包"）

包自身的检查（上面四步）管的是"包对不对"；**产物**的门禁另有入口，一条命令跑完：

```bash
bash scripts/audit-delivery.sh --md <final.md> --html <index.html> \
                               --template output-templates/a-share-outlook.json \
                               --pool "data/computed.json data/alpha.json data/cycle-inputs.json"
```

它跑七件（判据全部**从包里读**，不写死在工具里）：

| 门禁 | 工具 | 判据来源 |
|---|---|---|
| number-consistency（摘要—正文—底座三方对撞） | `skills/.../i1_collision_check.py` | `quality-policies` 的 `number-consistency` |
| section-outline（章节齐备与顺序） | `scripts/check-sections.mjs` | `.../section-outline` 的 `config`（含**规范化规则**） |
| placeholder-clean（占位符残留 ＋ **未注入空值**） | 内联扫描 | `.../placeholder-clean` ＋ 本仓约定（生成器须自带空值自检） |
| banned-tokens（禁例 token） | 内联扫描 | `.../banned-tokens`（含通用术语豁免表） |
| render-overflow（六档视口溢出 + WCAG AA 对比度） | `scripts/audit-render.py`（playwright） | `.../render-overflow` 的 `config` |
| **mobile-readability（移动端可读性：正文字号／图内等效字号／触控目标／表格滚动／零溢出）** | `scripts/audit-mobile.py`（playwright） | `.../mobile-readability` 的 `config`（320/375/390 三档；**读 computed style，不采信声明值**） |
| **wind-provenance（Wind 主定量源口径 + 凭据 fail-closed）** | `scripts/check-wind-provenance.py`（确定性） | `.../wind-provenance` 的 `config`（引用须带指标代码；禁静默降级；禁重装/绕过；**三态须分清**：AUTH_ERROR＝凭据/`HOME` 解析问题 · PARAM_VALIDATION_ERROR＝入参错 · `backend_error`『积分余额不足』＝鉴权正常但额度耗尽） |
| **template-conformance（产物 ↔ 输出模板一致性）** | `scripts/check-template-conformance.mjs` | 输出模板的 `designSystem`（tokens／roles／components／directives）：产物 `:root` 的 token 取值须与模板逐字相同、已用组件类名齐备、禁 `#fff/#000` 底、禁档外字号、指令白名单、同包各模板核心 token 一致 |

**判据来源审计（2026-09-30 由交付方实测 + 本仓修复）**：交付门禁自称"判据来自包里"，但实测发现**有两个门的声明判据从未被加载/消费** —— `audit-mobile.py` 的 `load_policy` 只判 `is_file()`，而 `audit-delivery.sh` 传的是**目录**，目录恒不满足 ⇒ 一律走内置默认（声明与内置默认逐值相等，故对当时判定零数值影响）；`check-wind-provenance.py` 读到了 `cfg` 但**从未传入 `run_checks`** ⇒ 判据全是内置的。**v2.8.10 已修**：前者支持目录/文件（实测 `policySource` 由 `null` 变为 `baseline.json`），后者真正消费 3 个开关，并各自补了**「判据来源」自校准对照**（同一样本随声明值改变而改变判定）；`directives.list[figure].keys.type` 与 `designSystem.figures.types` 的枚举漂移也一并对齐并加了两条负向对照。**结论**：现在真正加载并强制声明判据的是 `render-overflow`、`section-outline`、`mobile-readability`、`wind-provenance`、`banned-tokens`（内联读包里禁例表）、`template-conformance`（读模板 designSystem）；`placeholder-clean` 的判据为**本仓约定**（生成器须自带空值自检），不来自 `baseline.json`。

**报告生成器必须自带空值自检**：注入失败产生的 `None/nan/inf` 与未渲染占位符必须让**生成失败**（数字一致性门禁只核对数字，抓不到 `None`；本仓一次真实交付即因此让缺陷进了正文）。

渲染这一步由 `scripts/render-report.mjs` 执行：markdown → **自包含** HTML5，版式规格（浅色/衬线/学术、涨=红跌=绿、¥、YYYY-MM-DD、文末「不构成投资建议」）**从输出模板的 `rendering` 声明读**。
自包含是硬要求：审核要在 `file://` 下用无头浏览器逐视口测，任何外链都会让读数依赖网络。

**这两把工具（`check-sections.mjs`／`audit-render.py`）是本包为"已声明但此前无执行工具"的两道硬门补的**，
并已在首单产物上校准通过（五档视口 0 溢出、对比度 1079/1079、章节 6/6）。

## 5. 提交与推送

```bash
git add -A && git commit -m "chore: v2.4.x ..." && git push origin main
```

推送后**从远端独立核一遍**（不要只信本地 `git status`）：

```bash
git ls-remote origin refs/heads/main
curl -s https://raw.githubusercontent.com/weixkcornell/macro-capital-analyst/main/pack.json | python3 -c "import json,sys;print(json.load(sys.stdin)['version'])"
```

## 6. CI

`.github/workflows/check.yml` 在 push / PR 上跑 ① ② ④（**平台校验器不可得**，
故 CI 跑的是"平台无关检查"那一半；这是设计，不是降级）。
本地发布前请把 `EXPERT_LIB_ROOT` 设好，把平台校验器那一半也跑上。

## 附：几条踩过的坑（写在这里省得再踩）

- **改了 `SKILL.md` 的 version 就要重钉 skill-packages 的 digest**（`bump-version` 已代劳）。
- **`sha256` 是行尾敏感的**：Windows 检出若 `core.autocrlf=true` 会让 digest 全体错位，
  故仓根有 `.gitattributes` 强制 `eol=lf`。
- **CSV/JSON 的第一个键名别带 BOM**（`\uFEFFcapability` 这种列名会让下游静默错名）。
- **占位符残留**：`【替换：…】`（省略号）是规则文本里的记法，不算残留；写了具体内容才算。
  需要在校准样本里写出残留形态的文件，请在文件内声明 `check-pack-allow: placeholder-residue`
  （显式、可 grep，`check-pack` 会为它打印一条 note）。
