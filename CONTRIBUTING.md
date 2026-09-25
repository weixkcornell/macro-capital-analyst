# 贡献指南（CONTRIBUTING）

> 这个包是"一个人 + 一套机器判据"维护的。**改动能否合入，不看说法，看判据能不能过。**

## 一、本地准备

```bash
node --version          # 需要 ≥ 22（脚本全是 .mjs，无第三方依赖）
python3 --version       # 技能脚本自检需要
```

平台私有库（`@zhijian/dsh-expert-library`）**可选**：设 `EXPERT_LIB_ROOT` 指向它，`check-pack` 会额外跑一层平台校验器；
不设则那层以 `skip` note 声明后跳过，其余检查照跑。

## 二、改之前先知道"我们查什么、不查什么"

```bash
node scripts/check-pack.mjs --criteria    # 判据登记表（对象／量程／不查什么／能报出的 code）
node scripts/check-pack.mjs --coverage   # 哪些文件有针对性判据、哪些只有通用扫描、哪些没人读
```

`CRITERIA.md` 是这两件事的**文档化版本**，由代码生成（**不要手改**）。

## 三、提交前必须全绿

```bash
bash scripts/release-check.sh
```

| # | 检查 | 抓什么 |
|---|---|---|
| ① | `check-pack.mjs` | 版本一致、digest 可复现、引用可解析、占位符残留、fileRef 安全、结构完整性、判据对照矩阵、note 预算 |
| ② | `selftest-gates.mjs` | **门禁自己的负向对照**：46 例注入式缺陷，任一未被抓住即失败 |
| ③ | `repin-digests.mjs --dry-run` | digest 是否该重钉 |
| ④ | `i1_collision_check.py --selftest` | 技能脚本解析层自检（8 例含负向样本） |
| ⑤ | `smoke-test.mjs` | 照 transport 声明**真跑一次**（静态存在 ≠ 可执行） |

**新增/修改任何判据时，必须同时补它的负向对照**（在 `selftest-gates.mjs` 里加一例）——
`check-pack` 的 `negative-control-gap` 是硬门，缺了直接 FAIL。理由是实测过的：
一道从未在坏件上失败过的门禁，与一道永远返回 PASS 的死门禁，观感完全一样。

**改过判据之后**，重新生成登记表：

```bash
node scripts/check-pack.mjs --criteria-md CRITERIA.md
```

## 四、内容改动的约定

- **凡是会演进的对象，判据里不要写死取值**（哈希、版本号、行数、时刻）—— 写指针，或写可复跑的命令。
- **引用别的文件请用可解析的完整路径**（文档里点名的 `scripts/...` 会被逐条核对存在性）。
- **不要手改生成物**：`CRITERIA.md` 由代码生成并有逐字比对判据。
- **门禁必须带 `config`**：没有可执行判据的门 = "纸上硬门"，`structure-gate-no-config` 会拦下。
- 改 `skills/macro-capital-framework/SKILL.md`（改版本号也算）之后要重钉 digest：
  `node scripts/repin-digests.mjs`（`bump-version.mjs` 会自动做）。

## 四b、改到"产物侧"判据时

产物侧门禁的入口是 `scripts/audit-delivery.sh`（用法见 [`RELEASING.md`](RELEASING.md) 的「交付级门禁」一节）。
两条约定：**判据必须写在包里**（工具只执行、不内置阈值）；**改判据要同时改 `config` 与文档**，
否则同一份产物在不同执行者手里会得到不同结论。

## 五、发布

见 [`RELEASING.md`](RELEASING.md)：`bump-version` → 补发布说明 → `release-check` → 同步安装副本 → 提交推送 → 打 tag / 建 Release。
